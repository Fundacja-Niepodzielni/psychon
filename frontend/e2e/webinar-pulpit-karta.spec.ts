import { expect, test, type Page } from "@playwright/test";
import {
  ADRES_TRANSMISJI,
  API,
  CZAS,
  json,
  instalujOgolne,
  OKNA,
  odczytWebinaru,
  odpowiedz,
  otworz,
  SLUG_WEBINARU,
  sprawdzMiaryStrony,
  ustawZegar,
  type OpcjeOdczytu,
} from "./_webinar";

/**
 * Karta „Najbliższy webinar” na pulpicie uczestnika (`/panel/pulpit`, grupa
 * `pulpitUczestnika`) na zbudowanej aplikacji, z atrapą API i atrapą sesji, na
 * 1280, 390 i 320 px: karta w oknie otwartym, przed oknem, po oknie z
 * nagraniem i bez karty (brak webinarów). W każdym stanie: jeden `main` i
 * jeden `h1`, brak przewijania poziomego, cele dotyku co najmniej 44 px, axe
 * = 0, dokładnie jeden przycisk główny (w nagłówku strony, nie w karcie),
 * a webinar nie jest na liście zamknięty.
 */

const STRONA = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

const KURSY = [
  { id: 1, slug: "podstawy-pomocy", title: "Podstawy pomocy psychologicznej", sequence_order: 1, product_group: "psychon", status: "completed", progress_percent: 100 },
  { id: 2, slug: "wywiad-psychologiczny", title: "Wywiad psychologiczny", sequence_order: 3, product_group: "psychon", status: "in_progress", progress_percent: 40 },
  { id: 3, slug: "interwencja-kryzysowa", title: "Interwencja kryzysowa", sequence_order: 4, product_group: "psychon", status: "locked", progress_percent: 0 },
];

const WEBINAR_NA_LISCIE = {
  id: 12,
  slug: SLUG_WEBINARU,
  title: "Webinar: rozmowa w kryzysie",
  sequence_order: 2,
  product_group: "psychon",
  status: "in_progress",
  progress_percent: 0,
  type: "webinar",
};

async function instalujPulpit(page: Page, kursy: unknown[], odczyt: OpcjeOdczytu | null): Promise<void> {
  await instalujOgolne(page);
  await odpowiedz(page, `${API}/courses`, kursy);
  await odpowiedz(page, `${API}/courses/wywiad-psychologiczny`, {
    ...KURSY[1],
    lessons: [{ id: 21, title: "Wprowadzenie do wywiadu", sequence_order: 1, is_completed: false }],
  });
  if (odczyt !== null) await page.route(`${API}/courses/${SLUG_WEBINARU}`, (route) => route.fulfill(json(odczytWebinaru(odczyt))));
  await odpowiedz(page, `${API}/certificate/conditions`, {
    eligible: false,
    conditions: [
      { key: "courses", label: "Wszystkie etapy i testy", done: 1, required: 3, met: false },
      { key: "webinars", label: "Webinary", done: 0, required: 1, met: false },
      { key: "supervision", label: "Obecności na superwizjach", done: 2, required: 6, met: false },
    ],
  });
  await page.route(`${API}/internship/entries**`, (route) =>
    route.fulfill(json([], 200, { ...STRONA, extra: { accepted_hours: "41.5", required_hours: "72.5" } })),
  );
  await page.route(`${API}/supervision/slots**`, (route) => route.fulfill(json([], 200, STRONA)));
}

interface Stan {
  nazwa: string;
  zegar: string;
  odczyt: OpcjeOdczytu;
}

const STANY: Stan[] = [
  { nazwa: "okno otwarte", zegar: CZAS.otwarte, odczyt: { okno: "open" } },
  { nazwa: "przed oknem", zegar: CZAS.przed, odczyt: { okno: "before" } },
  { nazwa: "po oknie z nagraniem", zegar: CZAS.zamkniete, odczyt: { okno: "closed", recordingLessonId: 345 } },
];

const karta = (page: Page) => page.locator("[data-karta-webinaru]");

for (const { szerokosc, wysokosc } of OKNA) {
  test.describe(`pulpit uczestnika, karta webinaru — ${szerokosc} px`, () => {
    test.use({ viewport: { width: szerokosc, height: wysokosc } });

    for (const stan of STANY) {
      test(`${stan.nazwa}: karta, jeden przycisk główny, miary i axe`, async ({ page }, testInfo) => {
        await instalujPulpit(page, [KURSY[0], WEBINAR_NA_LISCIE, KURSY[1], KURSY[2]], stan.odczyt);
        await ustawZegar(page, stan.zegar);
        await otworz(page, "/panel/pulpit");
        await expect(page.getByRole("heading", { level: 1, name: "Pulpit" })).toBeVisible();
        await expect(karta(page)).toBeVisible();

        await expect(karta(page).getByRole("heading", { level: 2, name: "Najbliższy webinar" })).toBeVisible();
        await expect(karta(page).getByRole("link", { name: "Webinar: rozmowa w kryzysie" })).toHaveAttribute("href", `/panel/kursy/${SLUG_WEBINARU}`);
        await expect(karta(page).getByText("czwartek, 5 listopada 2026, 18:00")).toBeVisible();
        await expect(karta(page).getByRole("link", { name: "Dołącz do transmisji" })).toHaveAttribute("href", ADRES_TRANSMISJI);

        if (stan.odczyt.okno === "open") await expect(karta(page).getByRole("button", { name: "Potwierdzam udział" })).toBeVisible();
        if (stan.odczyt.okno === "before") await expect(karta(page).getByText("Udział potwierdzisz od 18:00.")).toBeVisible();
        if (stan.odczyt.okno === "closed") {
          await expect(karta(page).getByRole("link", { name: "Obejrzyj nagranie" })).toHaveAttribute("href", `/panel/lekcje/345?kurs=${SLUG_WEBINARU}`);
        }

        // Przycisk główny jest jeden: „następny krok” w nagłówku strony; karta ma tylko przyciski obrysowane.
        await expect(page.locator("main button[class*='primary']")).toHaveCount(1);
        await expect(page.getByRole("button", { name: "Wróć do lekcji" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Przejdź do testu" })).toHaveCount(0);

        // Webinar na liście ścieżki nie jest zamknięty; zamknięty jest tylko kurs.
        await expect(page.locator('[data-kurs-stan="locked"]')).toHaveCount(1);
        await expect(page.getByRole("link", { name: "Otwórz webinar: Webinar: rozmowa w kryzysie" })).toBeVisible();

        await sprawdzMiaryStrony(page, testInfo, `axe-pulpit-webinar-${stan.nazwa}-${szerokosc}`);
      });
    }

    test("potwierdzenie udziału z karty: jedno POST bez ciała i zdanie zamiast przycisku", async ({ page }, testInfo) => {
      const wywolania: { metoda: string; cialo: string | null }[] = [];
      await instalujPulpit(page, [KURSY[0], WEBINAR_NA_LISCIE, KURSY[1]], { okno: "open" });
      await page.route(`${API}/courses/${SLUG_WEBINARU}/attendance`, (route) => {
        wywolania.push({ metoda: route.request().method(), cialo: route.request().postData() });
        return route.fulfill({ ...json({ course_id: 12, attended_at: "2026-11-05T17:04:11Z" }), status: 201 });
      });
      await ustawZegar(page, CZAS.otwarte);
      await otworz(page, "/panel/pulpit");
      await karta(page).getByRole("button", { name: "Potwierdzam udział" }).click();
      await expect(karta(page).getByText("Udział potwierdzony 5 listopada 2026, 18:04.")).toBeVisible();
      await expect(karta(page).getByRole("button", { name: "Potwierdzam udział" })).toHaveCount(0);
      expect(wywolania).toEqual([{ metoda: "POST", cialo: null }]);
      await sprawdzMiaryStrony(page, testInfo, `axe-pulpit-webinar-po-potwierdzeniu-${szerokosc}`);
    });

    test("bez webinarów na ścieżce: brak karty i ani jednego żądania o webinar", async ({ page }, testInfo) => {
      const zadania: string[] = [];
      page.on("request", (zadanie) => {
        if (zadanie.url().includes(SLUG_WEBINARU)) zadania.push(zadanie.url());
      });
      await instalujPulpit(page, KURSY, null);
      await otworz(page, "/panel/pulpit");
      await expect(page.getByRole("heading", { level: 1, name: "Pulpit" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Wróć do lekcji" })).toBeVisible();
      await expect(karta(page)).toHaveCount(0);
      expect(zadania).toEqual([]);
      await sprawdzMiaryStrony(page, testInfo, `axe-pulpit-bez-webinaru-${szerokosc}`);
    });
  });
}
