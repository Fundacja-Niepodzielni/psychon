import { expect, test } from "@playwright/test";
import {
  ADRES_TRANSMISJI,
  API,
  blad,
  CZAS,
  json,
  instalujOgolne,
  KONIEC_OKNA,
  OKNA,
  odczytWebinaru,
  otworz,
  POCZATEK,
  SLUG_WEBINARU,
  sprawdzMiaryStrony,
  ustawZegar,
  type OpcjeOdczytu,
} from "./_webinar";

/**
 * Widok webinaru na ekranie kursu uczestnika (`/panel/kursy/[slug]`, grupa
 * `kursUczestnika`) na zbudowanej aplikacji, z atrapą API i atrapą sesji, na
 * 1280, 390 i 320 px, w każdym oknie obecności: przed, otwarte, otwarte po
 * potwierdzeniu, zamknięte bez nagrania, zamknięte z nagraniem i ukończony.
 * W każdym stanie: jeden `main` i jeden `h1`, brak przewijania poziomego, cele
 * dotyku co najmniej 44 px, axe (WCAG 2.1 AA i `best-practice`) = 0. Strona
 * kursu woła wyłącznie `GET /courses/{slug}` i, po kliknięciu, jedno
 * `POST /courses/{slug}/attendance` bez ciała.
 */

const ADRES = `/panel/kursy/${SLUG_WEBINARU}`;
const ADRES_OBECNOSCI = `${API}/courses/${SLUG_WEBINARU}/attendance`;

interface Stan {
  nazwa: string;
  zegar: string;
  odczyt: OpcjeOdczytu;
  /** Etykiety przycisków głównych na ekranie (data-przycisk-glowny). */
  glowne: string[];
}

const STANY: Stan[] = [
  { nazwa: "przed oknem", zegar: CZAS.przed, odczyt: { okno: "before" }, glowne: [] },
  { nazwa: "okno otwarte", zegar: CZAS.otwarte, odczyt: { okno: "open" }, glowne: ["Potwierdzam udział"] },
  {
    nazwa: "okno otwarte, obecność już potwierdzona",
    zegar: CZAS.otwarte,
    odczyt: { okno: "open", attendedAt: "2026-11-05T17:04:11Z", ukonczony: true },
    glowne: [],
  },
  { nazwa: "zamknięte bez nagrania", zegar: CZAS.zamkniete, odczyt: { okno: "closed" }, glowne: [] },
  { nazwa: "zamknięte z nagraniem", zegar: CZAS.zamkniete, odczyt: { okno: "closed", recordingLessonId: 345 }, glowne: ["Obejrzyj nagranie"] },
  { nazwa: "ukończony nagraniem", zegar: CZAS.zamkniete, odczyt: { okno: "closed", recordingLessonId: 345, ukonczony: true }, glowne: [] },
];

for (const { szerokosc, wysokosc } of OKNA) {
  test.describe(`webinar uczestnika — ${szerokosc} px`, () => {
    test.use({ viewport: { width: szerokosc, height: wysokosc } });

    for (const stan of STANY) {
      test(`${stan.nazwa}: treść, przyciski główne, miary i axe`, async ({ page }, testInfo) => {
        await instalujOgolne(page);
        await page.route(`${API}/courses/${SLUG_WEBINARU}`, (route) => route.fulfill(json(odczytWebinaru(stan.odczyt))));
        await ustawZegar(page, stan.zegar);
        await otworz(page, ADRES);
        await expect(page.getByRole("heading", { level: 1, name: "Webinar: rozmowa w kryzysie" })).toBeVisible();

        await expect(page.getByText("czwartek, 5 listopada 2026, 18:00")).toBeVisible();
        const glowne = await page.locator("[data-przycisk-glowny]").evaluateAll((elementy) => elementy.map((element) => (element.textContent ?? "").trim()));
        expect(glowne).toEqual(stan.glowne);

        const transmisja = page.getByRole("link", { name: "Dołącz do transmisji" });
        await expect(transmisja).toHaveAttribute("href", ADRES_TRANSMISJI);
        await expect(transmisja).toHaveAttribute("target", "_blank");
        await expect(transmisja).toHaveAttribute("rel", "noopener noreferrer");

        // Webinar nie ma tematów, lekcji ani testu i nie jest zamknięty.
        await expect(page.locator("[data-lekcja], [data-temat], [data-karta-testu], [data-zamknieta]")).toHaveCount(0);

        await sprawdzMiaryStrony(page, testInfo, `axe-webinar-${stan.nazwa}-${szerokosc}`);
      });
    }

    test("przed oknem: przycisk widoczny, ale nieczynny, z powodem „od 18:00”", async ({ page }) => {
      await instalujOgolne(page);
      await page.route(`${API}/courses/${SLUG_WEBINARU}`, (route) => route.fulfill(json(odczytWebinaru({ okno: "before" }))));
      await ustawZegar(page, CZAS.przed);
      await otworz(page, ADRES);
      const przycisk = page.getByRole("button", { name: "Potwierdzam udział" });
      await expect(przycisk).toBeVisible();
      await expect(przycisk).toHaveAttribute("aria-disabled", "true");
      await expect(przycisk).toHaveAccessibleDescription("Udział potwierdzisz od 18:00.");
    });

    test("zamknięte: zdanie o upływie czasu i część o nagraniu", async ({ page }) => {
      await instalujOgolne(page);
      await page.route(`${API}/courses/${SLUG_WEBINARU}`, (route) => route.fulfill(json(odczytWebinaru({ okno: "closed" }))));
      await ustawZegar(page, CZAS.zamkniete);
      await otworz(page, ADRES);
      await expect(page.getByText("Czas na potwierdzenie udziału minął.")).toBeVisible();
      await expect(page.getByText("Nagranie pojawi się wkrótce.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Potwierdzam udział" })).toHaveCount(0);
    });

    test("zamknięte z nagraniem: „Obejrzyj nagranie” prowadzi na istniejący ekran lekcji", async ({ page }) => {
      await instalujOgolne(page);
      await page.route(`${API}/courses/${SLUG_WEBINARU}`, (route) => route.fulfill(json(odczytWebinaru({ okno: "closed", recordingLessonId: 345 }))));
      await ustawZegar(page, CZAS.zamkniete);
      await otworz(page, ADRES);
      await expect(page.getByRole("link", { name: "Obejrzyj nagranie" })).toHaveAttribute("href", `/panel/lekcje/345?kurs=${SLUG_WEBINARU}`);
    });

    test("kliknięcie „Potwierdzam udział”: jedno POST bez ciała, potem zdanie z datą i godziną", async ({ page }, testInfo) => {
      const wywolania: { metoda: string; cialo: string | null }[] = [];
      await instalujOgolne(page);
      await page.route(`${API}/courses/${SLUG_WEBINARU}`, (route) => route.fulfill(json(odczytWebinaru({ okno: "open" }))));
      await page.route(ADRES_OBECNOSCI, (route) => {
        wywolania.push({ metoda: route.request().method(), cialo: route.request().postData() });
        return route.fulfill({ ...json({ course_id: 12, attended_at: "2026-11-05T17:04:11Z" }), status: 201 });
      });
      await ustawZegar(page, CZAS.otwarte);
      await otworz(page, ADRES);
      await page.getByRole("button", { name: "Potwierdzam udział" }).click();

      await expect(page.getByText("Udział potwierdzony 5 listopada 2026, 18:04.")).toBeVisible();
      await expect(page.getByText("Webinar ukończony")).toBeVisible();
      await expect(page.getByRole("button", { name: "Potwierdzam udział" })).toHaveCount(0);
      expect(wywolania).toEqual([{ metoda: "POST", cialo: null }]);
      await sprawdzMiaryStrony(page, testInfo, `axe-webinar-po-potwierdzeniu-${szerokosc}`);
    });

    test("odmowa 422: pokazujemy zdanie serwera, bez własnego zdania", async ({ page }, testInfo) => {
      const zdanie = "Czas na potwierdzenie obecności minął. Obejrzyj nagranie, żeby ukończyć webinar.";
      await instalujOgolne(page);
      await page.route(`${API}/courses/${SLUG_WEBINARU}`, (route) => route.fulfill(json(odczytWebinaru({ okno: "open" }))));
      await page.route(ADRES_OBECNOSCI, (route) =>
        route.fulfill(blad(422, "conditions_not_met", zdanie, { window: "closed", opens_at: POCZATEK, closes_at: KONIEC_OKNA })),
      );
      await ustawZegar(page, CZAS.otwarte);
      await otworz(page, ADRES);
      await page.getByRole("button", { name: "Potwierdzam udział" }).click();
      await expect(page.locator("main").getByRole("alert")).toContainText(zdanie);
      await expect(page.getByRole("button", { name: "Potwierdzam udział" })).toHaveCount(0);
      await sprawdzMiaryStrony(page, testInfo, `axe-webinar-odmowa-${szerokosc}`);
    });

    test("adres transmisji spoza https nie jest odnośnikiem", async ({ page }) => {
      await instalujOgolne(page);
      await page.route(`${API}/courses/${SLUG_WEBINARU}`, (route) =>
        route.fulfill(json(odczytWebinaru({ okno: "before", streamUrl: "javascript:alert(1)" }))),
      );
      await ustawZegar(page, CZAS.przed);
      await otworz(page, ADRES);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("link", { name: "Dołącz do transmisji" })).toHaveCount(0);
      await expect(page.locator("a[href^='javascript:']")).toHaveCount(0);
    });

    test("długi tytuł bez spacji: bez przewijania w poziomie i bez małych celów dotyku", async ({ page }, testInfo) => {
      const tytul = `Webinar Psychologicznodiagnostycznoterapeutycznointerwencyjnokryzysowe część druga`;
      await instalujOgolne(page);
      await page.route(`${API}/courses/${SLUG_WEBINARU}`, (route) => route.fulfill(json(odczytWebinaru({ okno: "open", tytul }))));
      await ustawZegar(page, CZAS.otwarte);
      await otworz(page, ADRES);
      await expect(page.getByRole("heading", { level: 1, name: tytul })).toBeVisible();
      await sprawdzMiaryStrony(page, testInfo, `axe-webinar-dlugi-tytul-${szerokosc}`);
    });
  });
}
