import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";

/**
 * Ekran kursu administracji `/admin/kursy/{id}` w układzie dwóch kolumn, na
 * zbudowanej aplikacji, z atrapą API przez `page.route` i atrapą sesji.
 * Stan nagrania lekcji i braki publikacji podaje atrapa w kształcie serwera
 * (`video_status`, `video_ready`, `video_pending`, `publication_gaps`,
 * `reason.items`). Stany kursu, każdy na 1280 i 390 px:
 * - `kurs` — szkic z brakami (lekcja pusta, nagranie z błędem, nagranie
 *   w przetwarzaniu, gotowa lekcja z nowym nagraniem w drodze, długie tytuły
 *   bez spacji);
 * - `kurs-gotowy` — szkic bez braków;
 * - `kurs-dlugi-tytul` — szkic bez braków z tytułem jednym długim słowem;
 * - `kurs-opublikowany` — kurs opublikowany bez uwag;
 * - `kurs-opublikowany-uwaga` — kurs opublikowany z lekcją wymagającą uwagi;
 * - `kurs-odmowa` — serwer odmawia publikacji i podaje powody.
 * W każdym: 0 naruszeń axe, dokładnie jeden widoczny przycisk główny, brak
 * przewijania w poziomie, cele dotyku zmierzone ramką elementu, kolejność
 * fokusu równa kolejności ekranu.
 * Zrzuty całej strony powstają tylko przy ustawionej zmiennej `PW_ZRZUTY`
 * (katalog poza repozytorium).
 */

const API = "http://localhost:8000/api/v1";
const ADRES = "/admin/kursy/4";
const PROG_DWOCH_KOLUMN = 1100;

const ATRAPA_SESJI = {
  accessToken: ["atrapa", "tokenu", "testowego"].join("-"),
  expiresAt: Date.now() + 3_600_000,
};

const META_PUSTA = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

const KURS = {
  id: 4,
  title: "Wywiad psychologiczny",
  slug: "wywiad-psychologiczny",
  description: "Jak prowadzić pierwszą rozmowę i o co pytać." as string | null,
  type: "course",
  product_group: "psychon",
  sequence_order: 2,
  edition_id: 1,
  is_published: false,
  lessons_count: 4,
  materials_count: 0,
  created_at: "2026-09-01T08:00:00Z",
  updated_at: "2026-09-01T08:00:00Z",
};

function lekcja(id: number, title: string, topicId: number, pozycja: number, reszta: Record<string, unknown> = {}) {
  return {
    id,
    course_id: 4,
    title,
    description: null,
    content: null as string | null,
    sequence_order: id - 20,
    topic_id: topicId,
    topic_position: pozycja,
    video_provider_id: `wideo-${id}` as string | null,
    duration_seconds: 1500,
    materials_count: 0,
    created_at: null,
    updated_at: null,
    video_status: "ready" as KodStanu | null,
    video_status_at: "2026-10-01T12:00:00Z" as string | null,
    video_ready: true,
    video_pending: false,
    ...reszta,
  };
}

function temat(id: number, title: string, position: number, lesson_ids: number[]) {
  return { id, course_id: 4, title, position, lesson_ids, created_at: null, updated_at: null };
}

const DLUGI_TYTUL = `Rozmowa${"wstępnaZosobąWkryzysie".repeat(4)}`;
const DLUGI_TEMAT = `Podstawy${"ProwadzeniaRozmowy".repeat(4)}`;

type KodStanu = "none" | "uploading" | "processing" | "ready" | "error";

interface Brak {
  code: string;
  lesson_id: number | null;
}

const BEZ_BRAKOW = { blocking: [] as Brak[], waiting: [] as Brak[] };
const BEZ_NAGRANIA = { video_provider_id: null, video_status: "none", video_status_at: null, video_ready: false };

interface Stan {
  nazwa: string;
  kurs: typeof KURS & { publication_gaps: typeof BEZ_BRAKOW };
  lekcje: ReturnType<typeof lekcja>[];
  tematy: ReturnType<typeof temat>[];
  /** Lekcje z nagraniem w drodze — tylko o nie ekran pyta `…/video-status`. */
  wDrodze: number[];
  /** Nagłówek listy w karcie „Publikacja” albo `null`, gdy listy nie ma. */
  naglowekListy: string | null;
  glowny: { rola: "button" | "link"; nazwa: string };
  /** Zdanie w wąskim pasie obok stanu. */
  pas: string | null;
}

const LEKCJE_GOTOWE = [
  lekcja(21, "Wprowadzenie do wywiadu", 7, 1, { materials_count: 2 }),
  lekcja(22, "Pytania otwarte i zamknięte", 7, 2),
  lekcja(23, "Ćwiczenie w parach", 8, 1),
  lekcja(24, "Podsumowanie rozmowy", 8, 2, { ...BEZ_NAGRANIA, content: "## Podsumowanie" }),
];
const TEMATY = [temat(7, "Podstawy", 1, [21, 22]), temat(8, "Praktyka", 2, [23, 24])];

const STANY: Stan[] = [
  {
    nazwa: "kurs",
    kurs: {
      ...KURS,
      materials_count: 1,
      publication_gaps: {
        blocking: [
          { code: "lesson_empty", lesson_id: 22 },
          { code: "recording_error", lesson_id: 24 },
        ],
        waiting: [{ code: "recording_in_progress", lesson_id: 23 }],
      },
    },
    lekcje: [
      lekcja(21, "Wprowadzenie do wywiadu", 7, 1, { materials_count: 2 }),
      lekcja(22, DLUGI_TYTUL, 7, 2, BEZ_NAGRANIA),
      lekcja(23, "Ćwiczenie w parach", 8, 1, { video_status: "processing", video_ready: false }),
      lekcja(24, "Podsumowanie rozmowy", 8, 2, { video_status: "error", video_ready: false }),
      lekcja(25, "Zamknięcie rozmowy", 8, 3, { video_status: "processing", video_pending: true }),
    ],
    tematy: [temat(7, DLUGI_TEMAT, 1, [21, 22]), temat(8, "Praktyka", 2, [23, 24, 25])],
    wDrodze: [23, 25],
    naglowekListy: "Do zrobienia (2)",
    glowny: { rola: "button", nazwa: "Opublikuj kurs" },
    pas: "do zrobienia 2 rzeczy",
  },
  {
    nazwa: "kurs-gotowy",
    kurs: { ...KURS, publication_gaps: BEZ_BRAKOW },
    lekcje: LEKCJE_GOTOWE,
    tematy: TEMATY,
    wDrodze: [],
    naglowekListy: null,
    glowny: { rola: "button", nazwa: "Opublikuj kurs" },
    pas: null,
  },
  {
    nazwa: "kurs-dlugi-tytul",
    kurs: { ...KURS, title: "WywiadPsychologicznyZPacjentemWKryzysie", publication_gaps: BEZ_BRAKOW },
    lekcje: LEKCJE_GOTOWE,
    tematy: TEMATY,
    wDrodze: [],
    naglowekListy: null,
    glowny: { rola: "button", nazwa: "Opublikuj kurs" },
    pas: null,
  },
  {
    nazwa: "kurs-opublikowany",
    kurs: { ...KURS, is_published: true, publication_gaps: BEZ_BRAKOW },
    lekcje: LEKCJE_GOTOWE,
    tematy: TEMATY,
    wDrodze: [],
    naglowekListy: null,
    glowny: { rola: "link", nazwa: "Podgląd jako uczestnik" },
    pas: null,
  },
  {
    nazwa: "kurs-opublikowany-uwaga",
    kurs: {
      ...KURS,
      is_published: true,
      publication_gaps: { blocking: [{ code: "recording_error", lesson_id: 22 }], waiting: [] },
    },
    lekcje: LEKCJE_GOTOWE.map((wpis) => (wpis.id === 22 ? { ...wpis, video_status: "error", video_ready: false } : wpis)),
    tematy: TEMATY,
    wDrodze: [],
    naglowekListy: "Wymaga uwagi (1)",
    glowny: { rola: "link", nazwa: "Podgląd jako uczestnik" },
    pas: "wymaga uwagi: 1",
  },
];

function json(dane: unknown, meta?: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }),
  };
}

interface Zapis {
  metoda: string;
  sciezka: string;
  cialo: unknown;
}

/**
 * Atrapy API. Ogólna atrapa (pusta lista) jest rejestrowana PIERWSZA —
 * Playwright wybiera trasę zarejestrowaną PÓŹNIEJ jako pierwszą.
 */
async function instalujAtrapy(
  page: Page,
  stan: Stan,
  odmowaPublikacji?: { message: string; reason: Record<string, unknown> },
  zapisUkladu?: { opoznij?: Promise<void>; odrzuc?: boolean },
): Promise<{ zapisy: Zapis[]; sciezki: string[] }> {
  const zapisy: Zapis[] = [];
  const sciezki: string[] = [];
  let kurs = stan.kurs;
  let tematy = stan.tematy;

  page.on("request", (zadanie) => {
    if (zadanie.url().startsWith(API)) sciezki.push(zadanie.url().slice(API.length));
  });

  await page.route(`${API}/**`, (route) => route.fulfill(json([], META_PUSTA)));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(json({ id: 1, role: "project_manager", first_name: "Anna", program_completed_at: null })),
  );
  await page.route(`${API}/notifications**`, (route) =>
    route.fulfill(json([], { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { unread: 0 } })),
  );
  await page.route(
    (adres) => adres.pathname.startsWith("/api/v1/admin/"),
    async (route) => {
      const zadanie = route.request();
      const sciezka = new URL(zadanie.url()).pathname.replace("/api/v1", "");
      const metoda = zadanie.method();
      if (sciezka === "/admin/courses/4") {
        if (metoda === "PATCH") {
          const cialo = zadanie.postDataJSON() as Record<string, unknown>;
          zapisy.push({ metoda, sciezka, cialo });
          if (odmowaPublikacji && cialo.is_published === true) {
            return route.fulfill({
              status: 422,
              contentType: "application/json",
              body: JSON.stringify({ error: { status: 422, code: "conditions_not_met", ...odmowaPublikacji } }),
            });
          }
          kurs = { ...kurs, ...cialo };
        }
        return route.fulfill(json(kurs));
      }
      if (sciezka === "/admin/courses/4/lessons") return route.fulfill(json(stan.lekcje));
      if (sciezka === "/admin/courses/4/topics") return route.fulfill(json(tematy));
      if (sciezka === "/admin/courses/4/topics/reorder") {
        const cialo = zadanie.postDataJSON() as { topics: { id: number; lesson_ids: number[] }[] };
        zapisy.push({ metoda, sciezka, cialo });
        if (zapisUkladu?.opoznij) await zapisUkladu.opoznij;
        if (zapisUkladu?.odrzuc) {
          return route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: { status: 500, code: "server_error", message: "Serwer się potknął." } }),
          });
        }
        tematy = cialo.topics.map((wpis, indeks) => ({
          ...tematy.find((kandydat) => kandydat.id === wpis.id)!,
          position: indeks + 1,
          lesson_ids: wpis.lesson_ids,
        }));
        return route.fulfill(json(tematy));
      }
      if (sciezka === "/admin/courses/4/assignments") {
        return route.fulfill(
          json([{ id: 1, course_id: 4, lesson_id: null, instructor: { id: 5, first_name: "Joanna", last_name: "Demo" } }]),
        );
      }
      if (sciezka === "/admin/courses/4/tests") {
        return route.fulfill(json({ id: 31, course_id: 4, pass_threshold: 80, attempts_limit: 3, question_count: 2 }));
      }
      const nagranie = /^\/admin\/lessons\/(\d+)\/video-status$/.exec(sciezka);
      if (nagranie) {
        // Stan bez zmian: te same pola, które niesie lekcja na liście.
        const wpis = stan.lekcje.find((kandydat) => kandydat.id === Number(nagranie[1]));
        const kod = wpis?.video_status ?? null;
        const status = kod === "none" ? "no_video" : kod === "ready" ? "finished" : kod === "error" ? "error" : "processing";
        return route.fulfill(
          json({
            status,
            duration_seconds: 1500,
            preview_embed_url: null,
            video_status: kod,
            video_status_at: wpis?.video_status_at ?? null,
            video_ready: wpis?.video_ready ?? false,
            video_pending: wpis?.video_pending ?? false,
          }),
        );
      }
      return route.fallback();
    },
  );

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json({ url: null })));
  return { zapisy, sciezki };
}

async function otworz(page: Page, stan: Stan): Promise<void> {
  const odpowiedz = await page.goto(ADRES);
  expect(odpowiedz?.status()).toBe(200);
  await zabezpieczeniePrzedEkranemDostepu(page);
  await expect(page.getByRole("heading", { level: 1, name: stan.kurs.title })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Tematy i lekcje" })).toBeVisible();
  // Dane dochodzące po pierwszym rysowaniu: test kursu, prowadzący, stany nagrań.
  await expect(page.getByRole("link", { name: "Otwórz pytania" })).toBeVisible();
  await expect(page.locator("#ustawienia-prowadzacy")).toContainText("Joanna Demo");
  const karta = page.getByRole("region", { name: "Publikacja" });
  if (stan.naglowekListy) {
    await expect(karta.getByRole("heading", { level: 3, name: stan.naglowekListy })).toBeVisible();
  } else {
    await expect(page.locator("li[data-lekcja]").filter({ hasText: "Gotowa" })).toHaveCount(stan.lekcje.length);
    await expect(karta.getByRole("heading", { level: 3 })).toHaveCount(0);
  }
}

/** Cele dotyku poniżej progu: 44 px; strzałki kolejności od dwóch kolumn 28 × 24. */
function celeZaMale(cele: Cel[], dwieKolumny: boolean): string[] {
  return cele
    .filter((cel) => !cel.wOkruszkach)
    .filter((cel) => {
      const [minSzerokosc, minWysokosc] = cel.strzalka && dwieKolumny ? [28, 24] : [44, 44];
      return cel.szerokosc < minSzerokosc - 0.5 || cel.wysokosc < minWysokosc - 0.5;
    })
    .map((cel) => `${cel.opis}: ${Math.round(cel.szerokosc)}×${Math.round(cel.wysokosc)}`);
}

async function zrzut(page: Page, nazwa: string, katalog = process.env.PW_ZRZUTY): Promise<void> {
  if (!katalog) return;
  mkdirSync(katalog, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  // Kolumna boczna stoi w miejscu i przewija się w sobie; na czas zrzutu okno
  // rośnie tak, żeby zmieściła się cała, potem wraca do swojej wysokości.
  const okno = page.viewportSize()!;
  const potrzebna = await page.evaluate(() => {
    const boczna = document.querySelector<HTMLElement>("[data-obszar='boczna']");
    const dol = boczna ? boczna.getBoundingClientRect().top + boczna.scrollHeight + 48 : 0;
    return Math.ceil(Math.max(dol, window.innerHeight));
  });
  await page.setViewportSize({ width: okno.width, height: potrzebna });
  await page.screenshot({ path: join(katalog, `${nazwa}.png`), fullPage: true, animations: "disabled" });
  await page.setViewportSize(okno);
}

async function bezPrzewijaniaPoziomego(page: Page): Promise<void> {
  const przewijanie = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(przewijanie, "przewijanie poziome").toBeLessThanOrEqual(0);
}

interface Cel {
  indeks: number;
  opis: string;
  obszar: string;
  strzalka: boolean;
  wOkruszkach: boolean;
  tlo: string;
  x: number;
  y: number;
  szerokosc: number;
  wysokosc: number;
}

/**
 * Widoczne elementy fokusowalne w `main`, w kolejności dokumentu. Każdy
 * dostaje `data-kolejnosc`, po którym próba rozpoznaje go po naciśnięciu Tab.
 */
async function celeEkranu(page: Page): Promise<Cel[]> {
  return page.evaluate(() => {
    const selektor = "a[href], button:not([disabled]), input:not([type='hidden']), select, textarea, [tabindex]";
    const wezly = Array.from(document.querySelectorAll<HTMLElement>(`main ${selektor.split(", ").join(", main ")}`));
    const wynik: Cel[] = [];
    for (const wezel of wezly) {
      if (wezel.tabIndex < 0) continue;
      const ramka = wezel.getBoundingClientRect();
      const styl = getComputedStyle(wezel);
      if (ramka.width === 0 || ramka.height === 0 || styl.visibility === "hidden") continue;
      const indeks = wynik.length;
      wezel.dataset.kolejnosc = String(indeks);
      wynik.push({
        indeks,
        opis: (wezel.getAttribute("aria-label") ?? wezel.textContent ?? "").trim().slice(0, 70),
        obszar: wezel.closest<HTMLElement>("[data-obszar]:not([data-obszar='tylko-od-dwoch-kolumn'])")?.dataset.obszar ?? "",
        strzalka: wezel.hasAttribute("data-strzalka"),
        wOkruszkach: wezel.closest("nav") !== null,
        tlo: styl.backgroundColor,
        x: ramka.left + window.scrollX,
        y: ramka.top + window.scrollY,
        szerokosc: ramka.width,
        wysokosc: ramka.height,
      });
    }
    return wynik;
  });
}

const OKNA = [
  { szerokosc: 1280, wysokosc: 800 },
  { szerokosc: 390, wysokosc: 844 },
];

for (const { szerokosc, wysokosc } of OKNA) {
  const dwieKolumny = szerokosc >= PROG_DWOCH_KOLUMN;

  test.describe(`ekran kursu administracji — ${szerokosc} px`, () => {
    test.use({ viewport: { width: szerokosc, height: wysokosc } });

    for (const stan of STANY) {
      test(`${stan.nazwa}: axe, jeden przycisk główny, bez przewijania w poziomie, cele dotyku, kolejność fokusu`, async ({
        page,
      }, testInfo) => {
        const { zapisy, sciezki } = await instalujAtrapy(page, stan);
        await otworz(page, stan);

        expect(await page.locator("main").count()).toBe(1);
        expect(await page.locator("#tresc").count()).toBe(1);
        await expect(page.locator("[data-powloka-panelu]")).toHaveCount(1);

        // Karty w kolejności ekranu.
        const naglowki = await page.locator("main h2").allTextContents();
        expect(naglowki).toEqual([
          "Tematy i lekcje",
          "Publikacja",
          "Ustawienia kursu",
          ...(stan.kurs.materials_count > 0 ? ["Starsze pliki kursu"] : []),
          stan.kurs.is_published ? "Cofnięcie publikacji i usunięcie kursu" : "Usunięcie kursu",
        ]);
        await expect(page.locator("#ustawienia-dane, #ustawienia-prowadzacy, #ustawienia-zaproszenia")).toHaveCount(3);
        for (const id of ["ustawienia-dane", "ustawienia-prowadzacy", "ustawienia-zaproszenia"]) {
          await expect(page.locator(`#${id}`)).toHaveAttribute("aria-expanded", "false");
        }

        // Znacznik stanu w wierszu tytułu: od dwóch kolumn w tym samym wierszu co tytuł, poniżej może zejść pod niego,
        // ale zawsze mieści się w ekranie.
        const znacznik = page.locator("[data-obszar='naglowek'] header").getByText(stan.kurs.is_published ? "Opublikowany" : "Szkic — zapisany", { exact: true });
        await expect(znacznik).toHaveCount(1);
        const polozenie = await page.evaluate(() => {
          const naglowek = document.querySelector("[data-obszar='naglowek'] h1");
          const wiersz = naglowek?.parentElement ?? null;
          const plakietka = wiersz?.querySelector("span") ?? null;
          if (naglowek === null || wiersz === null || plakietka === null) return null;
          const tytul = naglowek.getBoundingClientRect();
          const znak = plakietka.getBoundingClientRect();
          return {
            wTymSamymWierszu: znak.top >= tytul.top - 1 && znak.bottom <= tytul.bottom + 1,
            prawaKrawedz: znak.right,
            szerokoscOkna: document.documentElement.clientWidth,
            tytulPrzedZnacznikiem: znak.left >= tytul.left,
          };
        });
        expect(polozenie, "znacznik stanu jest w wierszu tytułu").not.toBeNull();
        expect(polozenie?.prawaKrawedz).toBeLessThanOrEqual((polozenie?.szerokoscOkna ?? 0) + 0.5);
        if (dwieKolumny) expect(polozenie?.wTymSamymWierszu, "znacznik w tym samym wierszu co tytuł").toBe(true);

        // Pas pod nagłówkiem tylko poniżej dwóch kolumn; stan i liczba z tych samych danych co karta.
        const pas = page.locator("[data-obszar='pasek-waski']");
        if (dwieKolumny) {
          await expect(pas).toBeHidden();
        } else {
          await expect(pas).toBeVisible();
          await expect(pas).toContainText(stan.kurs.is_published ? "Opublikowany" : "Szkic");
          if (stan.pas) await expect(pas.getByRole("link", { name: stan.pas })).toHaveAttribute("href", "#publikacja");
        }

        // Szkic niesie stałą plakietkę, zdanie o samoczynnym zapisie i przycisk wyjścia z obrysem; kurs opublikowany żadnego z nich.
        const wyjscie = page.getByRole("button", { name: "Zapisz szkic i wyjdź" });
        if (stan.kurs.is_published) {
          await expect(page.getByText("Szkic — zapisany")).toHaveCount(0);
          await expect(page.getByText("Zmiany zapisują się same.")).toHaveCount(0);
          await expect(wyjscie).toHaveCount(0);
        } else {
          await expect(page.getByText("Szkic — zapisany")).toHaveCount(1);
          await expect(page.getByText("Zmiany zapisują się same.")).toHaveCount(1);
          await expect(wyjscie).toHaveCount(1);
          await expect(wyjscie).toBeVisible();
          await expect(page.locator("[data-obszar='naglowek'] header").getByText("Zmiany zapisują się same.")).toBeVisible();
        }

        // Dokładnie jeden widoczny przycisk główny: w karcie od dwóch kolumn, w pasie poniżej.
        // W dokumencie stoją oba (karta i pas), arkusz pokazuje zawsze jeden.
        await expect(page.getByRole(stan.glowny.rola, { name: stan.glowny.nazwa })).toHaveCount(1);
        const obaGlowne = await page
          .locator("main")
          .getByText(stan.glowny.nazwa, { exact: true })
          .evaluateAll((wezly) =>
            wezly.map((wezel) => ({
              obszar: wezel.closest<HTMLElement>("[data-obszar]")?.dataset.obszar,
              widoczny: wezel.getBoundingClientRect().width > 0,
            })),
          );
        expect(obaGlowne).toEqual([
          { obszar: "pasek-waski", widoczny: !dwieKolumny },
          { obszar: "tylko-od-dwoch-kolumn", widoczny: dwieKolumny },
        ]);

        const cele = await celeEkranu(page);
        const celGlowny = cele.filter((cel) => cel.opis === stan.glowny.nazwa);
        expect(celGlowny).toHaveLength(1);
        // Żaden inny widoczny element ekranu nie ma tła przycisku głównego.
        expect(
          cele.filter((cel) => cel.tlo === celGlowny[0].tlo).map((cel) => cel.opis),
          "elementy z tłem przycisku głównego",
        ).toEqual([stan.glowny.nazwa]);

        await bezPrzewijaniaPoziomego(page);

        expect(celeZaMale(cele, dwieKolumny), "cele dotyku poniżej progu").toEqual([]);
        const strzalki = cele.filter((cel) => cel.strzalka);
        expect(strzalki).toHaveLength(stan.lekcje.length * 2);
        if (dwieKolumny) {
          expect(new Set(strzalki.map((cel) => `${Math.round(cel.szerokosc)}×${Math.round(cel.wysokosc)}`))).toEqual(
            new Set(["28×24"]),
          );
        }

        // Kolejność fokusu = kolejność ekranu: obszary po kolei, w obszarze nigdy wstecz.
        const kolejnoscObszarow = cele.map((cel) => cel.obszar).filter((obszar, i, lista) => obszar !== lista[i - 1]);
        expect(kolejnoscObszarow).toEqual(
          dwieKolumny ? ["naglowek", "glowna", "boczna"] : ["naglowek", "pasek-waski", "glowna", "boczna"],
        );
        const wstecz = cele
          .slice(1)
          .filter((cel, i) => cel.obszar === cele[i].obszar && cel.y + cel.wysokosc <= cele[i].y)
          .map((cel) => cel.opis);
        expect(wstecz, "elementy stojące nad poprzednikiem w kolejności fokusu").toEqual([]);
        if (dwieKolumny) {
          const lewa = cele.filter((cel) => cel.obszar === "glowna");
          const prawa = cele.filter((cel) => cel.obszar === "boczna");
          expect(Math.max(...lewa.map((cel) => cel.x + cel.szerokosc))).toBeLessThanOrEqual(
            Math.min(...prawa.map((cel) => cel.x)),
          );
        }

        const naruszenia = await uruchomAxe(page);
        await dolaczNaruszeniaDoRaportu(testInfo, `axe-${stan.nazwa}-${szerokosc}`, naruszenia);
        expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);

        await zrzut(page, `${stan.nazwa}-${szerokosc}`);

        // Tab przechodzi elementy w tej samej kolejności, w jakiej stoją w dokumencie.
        await page.locator("[data-kolejnosc='0']").focus();
        const przejscie: (string | null)[] = [];
        for (let krok = 0; krok < cele.length; krok += 1) {
          przejscie.push(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.kolejnosc ?? null));
          await page.keyboard.press("Tab");
        }
        expect(przejscie).toEqual(cele.map((cel) => String(cel.indeks)));

        expect(zapisy).toEqual([]);
        // O stan nagrania ekran pyta wyłącznie dla lekcji z nagraniem w drodze.
        expect([...new Set(sciezki.filter((sciezka) => sciezka.endsWith("/video-status")))].sort()).toEqual(
          stan.wDrodze.map((id) => `/admin/lessons/${id}/video-status`),
        );
        if (stan.nazwa === "kurs") {
          const karta = page.getByRole("region", { name: "Publikacja" });
          await expect(karta.getByRole("link", { name: "Lekcja 2: brak nagrania i treści." })).toBeVisible();
          await expect(karta.getByRole("link", { name: "Lekcja 4: błąd nagrania." })).toBeVisible();
          await expect(karta.getByRole("heading", { level: 3, name: "Czekamy (1)" })).toBeVisible();
          await expect(karta.getByText("Lekcja 3: nagranie się przetwarza, zwykle 10–30 minut.")).toBeVisible();
          await expect(karta.getByText("Gotowe: tytuł, opis, 2 lekcje.")).toBeVisible();
          await expect(page.locator("li[data-lekcja='25'] [data-dopisek-stanu]")).toHaveText("nowe nagranie w drodze");
          await expect(page.locator("li[data-lekcja='23'] [data-stan-lekcji]")).toHaveText("Nagranie: przetwarzanie");
          await expect(page.locator("li[data-lekcja='24'] [data-stan-lekcji]")).toHaveText("Nagranie: błąd");
          await expect(page.locator("li[data-lekcja='22'] [data-stan-lekcji]")).toHaveText("Brak nagrania i treści");
        }
        if (stan.nazwa === "kurs-opublikowany-uwaga") {
          const karta = page.getByRole("region", { name: "Publikacja" });
          await expect(karta.getByRole("link", { name: "Lekcja 2: błąd nagrania." })).toBeVisible();
        }
        expect(sciezki.filter((sciezka) => sciezka.startsWith("/instructor/"))).toEqual([]);
        expect(sciezki).toEqual(
          expect.arrayContaining(["/admin/courses/4", "/admin/courses/4/lessons", "/admin/courses/4/topics"]),
        );
      });
    }

    test("kolejność zapisuje się sama, publikacja jednym żądaniem, rozwinięty wiersz ustawień bez naruszeń", async ({
      page,
    }, testInfo) => {
      const stan = STANY[1];
      const { zapisy } = await instalujAtrapy(page, stan);
      await otworz(page, stan);

      const wDol = page.getByRole("button", { name: "Przenieś „Wprowadzenie do wywiadu” niżej" });
      await wDol.click();
      await expect(page.locator("li[data-lekcja]").first()).toHaveAttribute("data-lekcja", "22");
      await expect(wDol).toBeFocused();
      await expect(page.locator("[data-ogloszenia]")).toHaveText(
        "Przeniesiono „Wprowadzenie do wywiadu” na miejsce 2 z 2.",
      );
      await expect.poll(() => zapisy.length).toBe(1);
      expect(zapisy[0]).toEqual({
        metoda: "PATCH",
        sciezka: "/admin/courses/4/topics/reorder",
        cialo: {
          topics: [
            { id: 7, lesson_ids: [22, 21] },
            { id: 8, lesson_ids: [23, 24] },
          ],
        },
      });
      await expect(page.getByRole("button", { name: /^Zapisz (zmiany|kolejność)$/ })).toHaveCount(0);

      // Wiersz ustawień rozwija się w miejscu; drugi otwarty zamyka pierwszy.
      await page.locator("#ustawienia-dane").click();
      await expect(page.getByRole("button", { name: "Zapisz dane kursu" })).toBeVisible();
      await bezPrzewijaniaPoziomego(page);
      const naruszenia = await uruchomAxe(page);
      await dolaczNaruszeniaDoRaportu(testInfo, `axe-kurs-ustawienia-${szerokosc}`, naruszenia);
      expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);
      await zrzut(page, `kurs-gotowy-ustawienia-${szerokosc}`);
      await page.locator("#ustawienia-zaproszenia").click();
      await expect(page.locator("#ustawienia-dane")).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator("#ustawienia-zaproszenia")).toHaveAttribute("aria-expanded", "true");
      await page.locator("#ustawienia-zaproszenia").click();

      await page.getByRole("button", { name: "Opublikuj kurs" }).locator("visible=true").click();
      await expect(page.getByRole("region", { name: "Publikacja" }).getByText("Kurs jest opublikowany.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Opublikuj kurs" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Podgląd jako uczestnik" }).locator("visible=true")).toHaveAttribute(
        "href",
        "/panel/kursy/wywiad-psychologiczny",
      );
      expect(zapisy[1]).toEqual({ metoda: "PATCH", sciezka: "/admin/courses/4", cialo: { is_published: true } });
      expect(zapisy).toHaveLength(2);
    });

    test("kurs-odmowa: serwer odmawia publikacji — powody z odnośnikami zamiast kodów, fokus na komunikacie, axe", async ({
      page,
    }, testInfo) => {
      const stan = STANY[1];
      const { zapisy } = await instalujAtrapy(page, stan, {
        message: "Uzupełnij lekcje wskazane na liście braków, zanim opublikujesz kurs.",
        reason: {
          missing: ["recording_error", "lesson_empty"],
          items: [
            { code: "recording_error", lesson_id: 23 },
            { code: "lesson_empty", lesson_id: 22 },
          ],
        },
      });
      await otworz(page, stan);

      await page.getByRole("button", { name: "Opublikuj kurs" }).locator("visible=true").click();
      const karta = page.getByRole("region", { name: "Publikacja" });
      const komunikat = karta.getByRole("group", { name: "Nie udało się opublikować (2)" });
      await expect(komunikat).toBeVisible();
      await expect(komunikat).toBeFocused();
      // Te same zdania co lista braków, w kolejności serwera; kodów na ekranie nie ma.
      await expect(komunikat.getByRole("link")).toHaveText(["Lekcja 3: błąd nagrania.", "Lekcja 2: brak nagrania i treści."]);
      await expect(karta).not.toContainText(/recording_error|lesson_empty|conditions_not_met|422/);
      await expect(karta.getByText("Kurs jest szkicem. Uczestnicy go nie widzą.")).toBeVisible();
      await expect(page.locator("[data-ogloszenia]")).toHaveText(
        "Kurs nie został opublikowany. Lekcja 3: błąd nagrania. Lekcja 2: brak nagrania i treści.",
      );
      expect(zapisy).toEqual([{ metoda: "PATCH", sciezka: "/admin/courses/4", cialo: { is_published: true } }]);

      // Przycisk główny zostaje jeden i ten sam.
      await expect(page.getByRole("button", { name: "Opublikuj kurs" })).toHaveCount(1);
      const cele = await celeEkranu(page);
      const celGlowny = cele.filter((cel) => cel.opis === "Opublikuj kurs");
      expect(celGlowny).toHaveLength(1);
      expect(cele.filter((cel) => cel.tlo === celGlowny[0].tlo).map((cel) => cel.opis)).toEqual(["Opublikuj kurs"]);
      expect(celeZaMale(cele, dwieKolumny), "cele dotyku poniżej progu").toEqual([]);
      await bezPrzewijaniaPoziomego(page);

      const naruszenia = await uruchomAxe(page);
      await dolaczNaruszeniaDoRaportu(testInfo, `axe-kurs-odmowa-${szerokosc}`, naruszenia);
      expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);
      await zrzut(page, `kurs-odmowa-${szerokosc}`);
    });

    test("szkic zapisany: bez zapisu w toku „Zapisz szkic i wyjdź” prowadzi na listę kursów bez żadnego zapisu", async ({
      page,
    }) => {
      const stan = STANY[1];
      const { zapisy } = await instalujAtrapy(page, stan);
      await otworz(page, stan);
      await zrzut(page, `administracja--kurs--szkic-zapisany--${szerokosc}`, process.env.PW_ZRZUTY_ODBIOR);

      await page.getByRole("button", { name: "Zapisz szkic i wyjdź" }).click();
      await expect(page).toHaveURL(/\/admin\/kursy$/);
      expect(zapisy).toEqual([]);
    });

    test("szkic zapisany: zapis w toku — wyjście czeka na jego koniec i dopiero potem prowadzi na listę", async ({ page }) => {
      const stan = STANY[1];
      let zakoncz: () => void = () => undefined;
      const koniec = new Promise<void>((dalej) => {
        zakoncz = dalej;
      });
      const { zapisy } = await instalujAtrapy(page, stan, undefined, { opoznij: koniec });
      await otworz(page, stan);

      await page.getByRole("button", { name: "Przenieś „Wprowadzenie do wywiadu” niżej" }).click();
      await expect.poll(() => zapisy.length).toBe(1);
      await page.getByRole("button", { name: "Zapisz szkic i wyjdź" }).click();
      await page.waitForTimeout(600);
      await expect(page).toHaveURL(/\/admin\/kursy\/4$/);

      zakoncz();
      await expect(page).toHaveURL(/\/admin\/kursy$/);
      expect(zapisy).toHaveLength(1);
    });

    test("szkic zapisany: odmowa zapisu w toku — ekran zostaje, jest zdanie, bez naruszeń, bez przewijania w poziomie", async ({
      page,
    }, testInfo) => {
      const stan = STANY[1];
      let zakoncz: () => void = () => undefined;
      const koniec = new Promise<void>((dalej) => {
        zakoncz = dalej;
      });
      const { zapisy } = await instalujAtrapy(page, stan, undefined, { opoznij: koniec, odrzuc: true });
      await otworz(page, stan);

      await page.getByRole("button", { name: "Przenieś „Wprowadzenie do wywiadu” niżej" }).click();
      await expect.poll(() => zapisy.length).toBe(1);
      await page.getByRole("button", { name: "Zapisz szkic i wyjdź" }).click();
      zakoncz();

      const komunikat = page.getByRole("alert").filter({ hasText: "Szkic nie został zapisany" });
      await expect(komunikat).toBeVisible();
      await expect(komunikat).toContainText("Zostajesz na ekranie kursu");
      await page.waitForTimeout(400);
      await expect(page).toHaveURL(/\/admin\/kursy\/4$/);
      await expect(page.getByRole("heading", { level: 2, name: "Tematy i lekcje" })).toBeVisible();

      await bezPrzewijaniaPoziomego(page);
      const cele = await celeEkranu(page);
      expect(celeZaMale(cele, dwieKolumny), "cele dotyku poniżej progu").toEqual([]);
      const naruszenia = await uruchomAxe(page);
      await dolaczNaruszeniaDoRaportu(testInfo, `axe-szkic-odmowa-zapisu-${szerokosc}`, naruszenia);
      expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);
    });

    test("kurs-odmowa, wiele lekcji: komunikat z fokusem jest w widoku bez ręcznego przewijania, poza kolejnością Tab, pierwszy powód jest następnym przystankiem", async ({
      page,
    }) => {
      const stan = stanZWielomaLekcjami();
      await instalujAtrapy(page, stan, {
        message: "Uzupełnij lekcje wskazane na liście braków, zanim opublikujesz kurs.",
        reason: {
          missing: ["recording_error", "lesson_empty"],
          items: [
            { code: "recording_error", lesson_id: 23 },
            { code: "lesson_empty", lesson_id: 22 },
          ],
        },
      });
      await otworz(page, stan);
      const karta = page.getByRole("region", { name: "Publikacja" });
      const komunikat = karta.getByRole("group", { name: "Nie udało się opublikować (2)" });
      await expect(komunikat).toHaveCount(0);

      const przed = await page.evaluate(() => ({
        przewiniecie: window.scrollY,
        gornaKrawedzKarty: document.getElementById("publikacja")!.getBoundingClientRect().top,
        wysokoscOkna: window.innerHeight,
      }));
      // Przy jednej kolumnie karta „Publikacja” leży poniżej pierwszego ekranu.
      if (!dwieKolumny) expect(przed.gornaKrawedzKarty).toBeGreaterThan(przed.wysokoscOkna);

      await page.getByRole("button", { name: "Opublikuj kurs" }).locator("visible=true").click();

      // (a) grupa z nazwą i liczbą powodów, fokus programowy, poza kolejnością Tab.
      await expect(komunikat).toBeVisible();
      await expect(komunikat).toBeFocused();
      await expect(komunikat).toHaveAttribute("tabindex", "-1");

      // (c) bez ręcznego przewijania: komunikat i pierwszy powód są w widoku.
      const pierwszyPowod = komunikat.getByRole("link").first();
      await expect(komunikat).toBeInViewport();
      await expect(pierwszyPowod).toBeInViewport();
      const po = await page.evaluate(() => {
        const pasek = document.querySelector<HTMLElement>('[data-obszar="pasek-waski"]');
        const grupa = document.getElementById("publikacja-odmowa")!.getBoundingClientRect();
        return {
          przewiniecie: window.scrollY,
          gornaKrawedzKomunikatu: grupa.top,
          dolnaKrawedzKomunikatu: grupa.bottom,
          dolnaKrawedzPasa: pasek && getComputedStyle(pasek).display !== "none" ? pasek.getBoundingClientRect().bottom : 0,
          wysokoscOkna: window.innerHeight,
        };
      });
      // Przy jednej kolumnie widok sam przesunął się razem z fokusem; przy dwóch karta stała w oknie od początku.
      if (!dwieKolumny) expect(po.przewiniecie).toBeGreaterThan(przed.przewiniecie);
      else expect(po.przewiniecie).toBe(przed.przewiniecie);
      // Komunikat nie chowa się pod przyklejonym pasem u góry ani poza dolną krawędzią okna.
      expect(po.gornaKrawedzKomunikatu).toBeGreaterThanOrEqual(po.dolnaKrawedzPasa);
      expect(po.dolnaKrawedzKomunikatu).toBeLessThanOrEqual(po.wysokoscOkna);

      // (b) powody są odnośnikami; jeden Tab z komunikatu = pierwszy powód.
      await expect(komunikat.getByRole("link")).toHaveCount(2);
      await page.keyboard.press("Tab");
      await expect(pierwszyPowod).toBeFocused();
    });
  });
}

/** Kurs z dwunastoma lekcjami w dwóch tematach: karta „Publikacja” poniżej pierwszego ekranu. */
function stanZWielomaLekcjami(): Stan {
  const lekcje = Array.from({ length: 12 }, (_, indeks) =>
    lekcja(21 + indeks, `Lekcja ćwiczeniowa ${indeks + 1}`, indeks < 6 ? 7 : 8, (indeks % 6) + 1),
  );
  return {
    nazwa: "kurs-wiele-lekcji",
    kurs: { ...KURS, lessons_count: lekcje.length, publication_gaps: BEZ_BRAKOW },
    lekcje,
    tematy: [
      temat(7, "Podstawy", 1, [21, 22, 23, 24, 25, 26]),
      temat(8, "Praktyka", 2, [27, 28, 29, 30, 31, 32]),
    ],
    wDrodze: [],
    naglowekListy: null,
    glowny: { rola: "button", nazwa: "Opublikuj kurs" },
    pas: null,
  };
}
