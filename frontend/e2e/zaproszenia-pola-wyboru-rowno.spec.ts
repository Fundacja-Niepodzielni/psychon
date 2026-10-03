import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";

/**
 * Formularz zaproszeń na trasie roboczej `/nowy-front/admin/kursy/{id}/zaproszenia`
 * (kurs poza kolejnością programu) — panelu „Zaproszenia” w ustawieniach
 * ekranu kursu nie ma do czasu zaproszeń po MVP, a ta trasa ma ten sam rdzeń
 * (`RdzenZaproszen`). Zbudowana aplikacja, atrapa API przez `page.route`
 * i atrapa sesji. Pięć osób, dwie z długim adresem bez spacji (etykieta
 * w dwóch albo więcej wierszach także przy szerokim formularzu 1280 px).
 * Wzorzec odstępu (karta „Prowadzący”) jest mierzony na ekranie kursu
 * `/admin/kursy/{id}`, zanim próba przejdzie na trasę zaproszeń.
 * Mierzone `getBoundingClientRect`:
 * - lewe krawędzie pól wyboru w jednej linii (różnica 0 px), także lewe
 *   krawędzie etykiet;
 * - pole przy pierwszym wierszu etykiety (górna i dolna krawędź pola
 *   w obrębie pierwszego wiersza tekstu);
 * - przy 390 px: brak przewijania w poziomie (okno i lista), cele dotyku
 *   wiersza ≥ 44 px, axe 0;
 * - odstępy między nagłówkiem, licznikiem, przyciskami i nagłówkiem
 *   „Zaproszone osoby”.
 * Wszystkie liczby trafiają do jednej linii `POMIAR {...}` w wyniku próby,
 * zanim cokolwiek zostanie sprawdzone — próba na starym stylu świeci na
 * czerwono, ale liczby „przed” zostają w wyniku.
 * Zrzuty panelu powstają tylko przy ustawionej zmiennej `PW_ZRZUTY`
 * (katalog poza repozytorium).
 */

const API = "http://localhost:8000/api/v1";
const ADRES = "/admin/kursy/4";
const ADRES_ZAPROSZEN = "/nowy-front/admin/kursy/4/zaproszenia";

const ATRAPA_SESJI = {
  accessToken: ["atrapa", "tokenu", "testowego"].join("-"),
  expiresAt: Date.now() + 3_600_000,
};

const META_PUSTA = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

/** Kurs poza kolejnością programu — tylko taki przyjmuje zaproszenia. */
const KURS = {
  id: 4,
  title: "Spotkanie na żywo o rozmowie",
  slug: "spotkanie-na-zywo-o-rozmowie",
  description: "Opis spotkania." as string | null,
  type: "webinar",
  product_group: "psychon",
  sequence_order: null,
  edition_id: 1,
  is_published: false,
  lessons_count: 1,
  materials_count: 0,
  created_at: "2026-09-01T08:00:00Z",
  updated_at: "2026-09-01T08:00:00Z",
  publication_gaps: { blocking: [], waiting: [] },
};

const LEKCJE = [
  {
    id: 21,
    course_id: 4,
    title: "Wprowadzenie",
    description: null,
    content: null,
    sequence_order: 1,
    topic_id: 7,
    topic_position: 1,
    video_provider_id: "wideo-21",
    duration_seconds: 1500,
    materials_count: 0,
    created_at: null,
    updated_at: null,
    video_status: "ready",
    video_status_at: "2026-10-01T12:00:00Z",
    video_ready: true,
    video_pending: false,
  },
];
const TEMATY = [{ id: 7, course_id: 4, title: "Podstawy", position: 1, lesson_ids: [21], created_at: null, updated_at: null }];

/**
 * Adres bez spacji: nie mieści się w wierszu z imieniem ani w formularzu
 * szerokości 640 px (1280), ani w wąskim (390), więc etykieta ma co najmniej
 * dwa wiersze.
 */
const DLUGI_ADRES_A = `${"anna".repeat(16)}.demo@przyklad.test`;
const DLUGI_ADRES_B = `${"dorota".repeat(11)}.demo@przyklad.test`;
/** Adres dłuższy niż kilka wierszy listy: łamie się w obrębie etykiety, bez przewijania w poziomie. */
const ADRES_PONAD_WIERSZ = `${"zbigniew-demo-".repeat(30)}konto@przyklad.test`;

function osoba(id: number, role: "volunteer" | "student", imie: string, nazwisko: string, email: string) {
  return {
    id,
    first_name: imie,
    last_name: nazwisko,
    email,
    role,
    status: "active",
    product_group: "psychon",
    access_expires_at: null,
    program_completed_at: null,
    created_at: null,
  };
}

/** Pięć osób: dwie z etykietą w dwóch wierszach (długi adres), trzy w jednym. */
const OSOBY_ZWYKLE = {
  volunteer: [
    osoba(101, "volunteer", "Anna", "Adamska", DLUGI_ADRES_A),
    osoba(102, "volunteer", "Bo", "Bek", "bo@przyklad.test"),
    osoba(103, "volunteer", "Dorota", "Dąbrowska", DLUGI_ADRES_B),
  ],
  student: [
    osoba(201, "student", "Ewa", "Ek", "ewa@przyklad.test"),
    osoba(202, "student", "Jan", "Jot", "jan@przyklad.test"),
  ],
};

const OSOBY_Z_ADRESEM_PONAD_WIERSZ = {
  ...OSOBY_ZWYKLE,
  volunteer: [
    osoba(101, "volunteer", "Anna", "Adamska", ADRES_PONAD_WIERSZ),
    ...OSOBY_ZWYKLE.volunteer.slice(1),
  ],
};

let OSOBY = OSOBY_ZWYKLE;

function json(dane: unknown, meta?: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }),
  };
}

/** Ogólna atrapa (pusta lista) jest rejestrowana PIERWSZA — późniejsza trasa wygrywa. */
async function instalujAtrapy(page: Page): Promise<void> {
  await page.route(`${API}/**`, (route) => route.fulfill(json([], META_PUSTA)));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(json({ id: 1, role: "project_manager", first_name: "Anna", program_completed_at: null })),
  );
  await page.route(`${API}/notifications**`, (route) =>
    route.fulfill(json([], { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { unread: 0 } })),
  );
  await page.route(
    (adres) => adres.pathname.startsWith("/api/v1/admin/"),
    (route) => {
      const adres = new URL(route.request().url());
      const sciezka = adres.pathname.replace("/api/v1", "");
      if (sciezka === "/admin/users") {
        const rola = adres.searchParams.get("role");
        const lista = rola === "volunteer" || rola === "student" ? OSOBY[rola] : [];
        return route.fulfill(json(lista, { current_page: 1, per_page: 100, total: lista.length, last_page: 1 }));
      }
      if (sciezka === "/admin/courses/4") return route.fulfill(json(KURS));
      if (sciezka === "/admin/courses/4/lessons") return route.fulfill(json(LEKCJE));
      if (sciezka === "/admin/courses/4/topics") return route.fulfill(json(TEMATY));
      if (sciezka === "/admin/courses/4/assignments") {
        return route.fulfill(
          json([{ id: 1, course_id: 4, lesson_id: null, instructor: { id: 5, first_name: "Joanna", last_name: "Demo" } }]),
        );
      }
      if (sciezka === "/admin/courses/4/tests") {
        return route.fulfill(json({ id: 31, course_id: 4, pass_threshold: 80, attempts_limit: 3, question_count: 2 }));
      }
      return route.fallback();
    },
  );
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json({ url: null })));
}

/** Obszar treści szablonu formularza na trasie zaproszeń — w nim cały rdzeń zaproszeń. */
const PANEL = "[data-testid='obszar-tresc']";

/**
 * Zwraca odstęp między sekcjami karty wzorcowej („Prowadzący”, ekran kursu),
 * potem otwiera trasę zaproszeń i czeka na listę osób.
 */
async function otworzPanel(page: Page): Promise<string> {
  const odpowiedz = await page.goto(ADRES);
  expect(odpowiedz?.status()).toBe(200);
  await zabezpieczeniePrzedEkranemDostepu(page);
  await expect(page.getByRole("heading", { level: 1, name: KURS.title })).toBeVisible();
  await expect(page.locator("#ustawienia-prowadzacy")).toContainText("Joanna Demo");
  // Karta wzorcowa: rozwinięty wiersz „Prowadzący” — odstęp jej sekcji.
  await page.locator("#ustawienia-prowadzacy").click();
  await expect(page.locator("section#prowadzacy")).toBeVisible();
  const odstepKarty = await page.locator("section#prowadzacy").evaluate((wezel) => getComputedStyle(wezel).rowGap);
  const odpowiedzZaproszen = await page.goto(ADRES_ZAPROSZEN);
  expect(odpowiedzZaproszen?.status()).toBe(200);
  await zabezpieczeniePrzedEkranemDostepu(page);
  await expect(page.getByRole("heading", { level: 1, name: "Zaproszenia na kurs" })).toBeVisible();
  await expect(page.locator(PANEL).locator("fieldset label")).toHaveCount(5);
  // Czcionki wczytane przed pomiarem: od nich zależy łamanie wierszy.
  await page.evaluate(() => document.fonts.ready);
  return odstepKarty;
}

async function zrzutPanelu(page: Page, nazwa: string): Promise<void> {
  const katalog = process.env.PW_ZRZUTY;
  if (!katalog) return;
  mkdirSync(katalog, { recursive: true });
  const okno = page.viewportSize()!;
  // Na czas zrzutu okno rośnie (cały formularz w jednym ujęciu), potem wraca.
  await page.setViewportSize({ width: okno.width, height: 2600 });
  await page.locator(PANEL).screenshot({ path: join(katalog, `${nazwa}.png`), animations: "disabled" });
  await page.setViewportSize(okno);
}

const OKNA = [
  { szerokosc: 1280, wysokosc: 800 },
  { szerokosc: 390, wysokosc: 844 },
];

for (const { szerokosc, wysokosc } of OKNA) {
  test.describe(`panel zaproszeń, wiersze osób — ${szerokosc} px`, () => {
    test.use({ viewport: { width: szerokosc, height: wysokosc } });

    test("pola wyboru w jednej linii od lewej, pole przy pierwszym wierszu etykiety, odstępy sekcji, axe", async ({
      page,
    }, testInfo) => {
      OSOBY = OSOBY_ZWYKLE;
      await instalujAtrapy(page);
      const odstepKarty = await otworzPanel(page);
      const panel = page.locator(PANEL);

      // Dwie osoby zaznaczone: licznik ma wartość, a pole zaznaczone niesie znacznik „✓”.
      await panel.getByText(`Anna Adamska · ${DLUGI_ADRES_A}`).click();
      await panel.getByText("Ewa Ek · ewa@przyklad.test").click();
      await expect(panel.getByText("Zaznaczono: 2")).toBeVisible();

      const pomiar = await page.evaluate(
        ({ panel: selektorPanelu }) => {
          const korzen = document.querySelector<HTMLElement>(selektorPanelu)!;
          const prost = (r: DOMRect) => ({
            lewa: r.left,
            gora: r.top,
            dol: r.bottom,
            prawa: r.right,
            szerokosc: r.width,
            wysokosc: r.height,
          });
          const wiersze = Array.from(korzen.querySelectorAll<HTMLElement>("fieldset label")).map((etykieta) => {
            const pole = etykieta.querySelector<HTMLElement>(":scope > span")!;
            const wejscie = etykieta.querySelector<HTMLElement>(":scope > input")!;
            const tekst = Array.from(etykieta.childNodes).find((wezel) => wezel.nodeType === Node.TEXT_NODE)!;
            const zakres = document.createRange();
            zakres.selectNodeContents(tekst);
            const linie = Array.from(zakres.getClientRects());
            const styl = getComputedStyle(etykieta);
            return {
              styl: {
                dopelnienieGora: styl.paddingTop,
                wysokoscLinii: styl.lineHeight,
                rozmiarCzcionki: styl.fontSize,
                minWysokosc: styl.minHeight,
                wyrownanie: styl.alignItems,
                uklad: styl.justifyContent,
              },
              etykieta: prost(etykieta.getBoundingClientRect()),
              pole: prost(pole.getBoundingClientRect()),
              wejscie: prost(wejscie.getBoundingClientRect()),
              pierwszaLinia: prost(linie[0]),
              liczbaLinii: new Set(linie.map((linia) => Math.round(linia.top))).size,
              tekstLewa: Math.min(...linie.map((linia) => linia.left)),
            };
          });
          const lista = korzen.querySelector<HTMLElement>("fieldset")!;
          const znajdz = (tekst: string, selektor: string) =>
            Array.from(korzen.querySelectorAll<HTMLElement>(selektor)).find((wezel) => wezel.textContent?.trim().startsWith(tekst))!;
          const licznik = znajdz("Zaznaczono:", "p, span, div");
          const naglowekFormularza = znajdz("Zaproszenie na kurs", "h2");
          const formularz = naglowekFormularza.closest("form")!;
          const przyciski = Array.from(formularz.querySelectorAll<HTMLElement>("button"));
          const naglowekZaproszonych = znajdz("Zaproszone osoby", "h2");
          return {
            wiersze,
            lista: {
              przewijaniePoziome: lista.scrollWidth - lista.clientWidth,
              prawa: lista.getBoundingClientRect().right,
            },
            odstepy: {
              licznikDoNaglowka: naglowekFormularza.getBoundingClientRect().top - licznik.getBoundingClientRect().bottom,
              naglowekDoPrzyciskow:
                przyciski[0].getBoundingClientRect().top - naglowekFormularza.getBoundingClientRect().bottom,
              przyciskiDoNaglowkaZaproszonych:
                naglowekZaproszonych.getBoundingClientRect().top - formularz.getBoundingClientRect().bottom,
            },
            okno: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          };
        },
        { panel: PANEL },
      );

      const lewePola = pomiar.wiersze.map((wiersz) => wiersz.pole.lewa);
      const leweEtykiety = pomiar.wiersze.map((wiersz) => wiersz.tekstLewa);
      const roznicaPol = Math.max(...lewePola) - Math.min(...lewePola);
      const roznicaTekstow = Math.max(...leweEtykiety) - Math.min(...leweEtykiety);
      const polePrzyPierwszymWierszu = pomiar.wiersze.map(
        (wiersz) =>
          wiersz.pole.gora >= wiersz.pierwszaLinia.gora - 0.5 &&
          wiersz.pole.gora < wiersz.pierwszaLinia.dol &&
          (wiersz.pole.gora + wiersz.pole.dol) / 2 <= wiersz.pierwszaLinia.dol,
      );
      const celeWierszy = pomiar.wiersze.map((wiersz) => [
        Math.round(wiersz.etykieta.szerokosc * 10) / 10,
        Math.round(wiersz.etykieta.wysokosc * 10) / 10,
      ]);
      console.log(
        `POMIAR ${JSON.stringify({
          okno: szerokosc,
          liczbaLinii: pomiar.wiersze.map((wiersz) => wiersz.liczbaLinii),
          styl: pomiar.wiersze[0].styl,
          lewePola: lewePola.map((x) => Math.round(x * 100) / 100),
          roznicaPol,
          roznicaTekstow,
          polePrzyPierwszymWierszu,
          gornaKrawedzPolaWzgledemLinii: pomiar.wiersze.map(
            (wiersz) => Math.round((wiersz.pole.gora - wiersz.pierwszaLinia.gora) * 100) / 100,
          ),
          celeWierszy,
          przewijanieListy: pomiar.lista.przewijaniePoziome,
          przewijanieOkna: pomiar.okno,
          odstepy: { ...pomiar.odstepy, wzorzecKarty: odstepKarty },
        })}`,
      );

      // Pięć osób, dwie z etykietą w dwóch wierszach.
      expect(pomiar.wiersze).toHaveLength(5);
      expect(pomiar.wiersze.filter((wiersz) => wiersz.liczbaLinii >= 2)).toHaveLength(2);
      expect(pomiar.wiersze.filter((wiersz) => wiersz.liczbaLinii === 1)).toHaveLength(3);
      expect(roznicaPol, "różnica lewych krawędzi pól wyboru").toBe(0);
      expect(roznicaTekstow, "różnica lewych krawędzi etykiet").toBeLessThanOrEqual(0.5);
      expect(polePrzyPierwszymWierszu).toEqual([true, true, true, true, true]);

      // Bez przewijania w poziomie, cele dotyku wierszy ≥ 44 px.
      expect(pomiar.lista.przewijaniePoziome, "przewijanie poziome listy osób").toBeLessThanOrEqual(0);
      expect(pomiar.okno, "przewijanie poziome okna").toBeLessThanOrEqual(0);
      for (const wiersz of pomiar.wiersze) {
        expect(wiersz.etykieta.szerokosc).toBeGreaterThanOrEqual(43.5);
        expect(wiersz.etykieta.wysokosc).toBeGreaterThanOrEqual(43.5);
        expect(wiersz.etykieta.prawa).toBeLessThanOrEqual(pomiar.lista.prawa + 0.5);
      }

      // Odstępy sekcji — wszystkie z tokenu `--space-16` (karta wzorcowa „Prowadzący”: 16 px).
      expect(odstepKarty).toBe("16px");
      expect(pomiar.odstepy.licznikDoNaglowka).toBeCloseTo(16, 0);
      expect(pomiar.odstepy.naglowekDoPrzyciskow).toBeCloseTo(20, 0);
      expect(pomiar.odstepy.przyciskiDoNaglowkaZaproszonych).toBeCloseTo(16, 0);

      await expect(panel).toBeVisible();
      await zrzutPanelu(page, `administracja--kurs--zaproszenia-rowno--${szerokosc}`);

      const naruszenia = await uruchomAxe(page);
      await dolaczNaruszeniaDoRaportu(testInfo, `axe-zaproszenia-rowno-${szerokosc}`, naruszenia);
      expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);
    });

    test("adres dłuższy niż wiersz łamie się w etykiecie: bez przewijania w poziomie, pola nadal w jednej linii", async ({
      page,
    }) => {
      OSOBY = OSOBY_Z_ADRESEM_PONAD_WIERSZ;
      await instalujAtrapy(page);
      await otworzPanel(page);
      const pomiar = await page.evaluate((selektorPanelu) => {
        const korzen = document.querySelector<HTMLElement>(selektorPanelu)!;
        const lista = korzen.querySelector<HTMLElement>("fieldset")!;
        const wiersze = Array.from(korzen.querySelectorAll<HTMLElement>("fieldset label"));
        return {
          przewijanieListy: lista.scrollWidth - lista.clientWidth,
          przewijanieOkna: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          prawaLista: lista.getBoundingClientRect().right,
          prawaEtykiet: wiersze.map((etykieta) => etykieta.getBoundingClientRect().right),
          lewePola: wiersze.map((etykieta) => etykieta.querySelector<HTMLElement>(":scope > span")!.getBoundingClientRect().left),
          // Tekst mieści się w ramce wiersza, a wiersze nie nachodzą na siebie.
          tekstPonadRamke: wiersze.map((etykieta) => etykieta.scrollHeight - etykieta.clientHeight),
          nachodzenie: wiersze.map((etykieta, indeks) =>
            indeks === 0 ? 0 : wiersze[indeks - 1].getBoundingClientRect().bottom - etykieta.getBoundingClientRect().top,
          ),
          wysokosci: wiersze.map((etykieta) => Math.round(etykieta.getBoundingClientRect().height * 10) / 10),
        };
      }, PANEL);
      console.log(`POMIAR-DLUGI ${JSON.stringify({ okno: szerokosc, ...pomiar })}`);
      expect(pomiar.przewijanieListy, "przewijanie poziome listy osób").toBeLessThanOrEqual(0);
      expect(pomiar.przewijanieOkna, "przewijanie poziome okna").toBeLessThanOrEqual(0);
      for (const prawa of pomiar.prawaEtykiet) expect(prawa).toBeLessThanOrEqual(pomiar.prawaLista + 0.5);
      expect(Math.max(...pomiar.lewePola) - Math.min(...pomiar.lewePola)).toBe(0);
      for (const nadmiar of pomiar.tekstPonadRamke) expect(nadmiar, "tekst poza ramką wiersza").toBeLessThanOrEqual(1);
      for (const nachodzenie of pomiar.nachodzenie) expect(nachodzenie, "wiersz nachodzi na następny").toBeLessThanOrEqual(0);
      expect(pomiar.wysokosci[0], "etykieta z długim adresem ma kilka wierszy").toBeGreaterThan(44 * 2);
    });
  });
}
