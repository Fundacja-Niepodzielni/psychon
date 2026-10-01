import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";
import { GRUPY } from "../lib/przelaczenie/grupy";

/**
 * Strona lekcji administracji w układzie dwóch kolumn, na zbudowanej aplikacji,
 * z atrapą API, atrapą sesji i atrapą dostawcy nagrań (żadne żądanie nie
 * wychodzi poza przeglądarkę). Cztery stany na 1280 i 390 px:
 *  - niezapisany tekst i trwające wysyłanie nagrania;
 *  - wszystko zapisane, nagranie gotowe, plik o długiej nazwie bez spacji;
 *  - wysyłanie nagrania przerwane;
 *  - pusta lekcja.
 * W każdym: jeden `main`, dokładnie jeden widoczny zielony przycisk, brak
 * przewijania poziomego, cele dotyku co najmniej 44 px, kolejność fokusu
 * zgodna z kolejnością na ekranie, axe (WCAG 2.1 AA i `best-practice`) = 0.
 * Zrzuty całej strony powstają tylko przy ustawionej zmiennej `PW_ZRZUTY`.
 */

const API = "http://localhost:8000/api/v1";
const DOSTAWCA = "https://nagrania.atrapa.test";
const MB = 1024 * 1024;
const PROG_DWOCH_KOLUMN = 1100;

const ATRAPA_SESJI = {
  accessToken: ["atrapa", "tokenu", "testowego"].join("-"),
  expiresAt: Date.now() + 3_600_000,
};

const META = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

const DLUGIE_SLOWO = "Psychologicznodiagnostycznoterapeutycznointerwencyjnokryzysowe";
const DLUGI_TYTUL = `Pytania otwarte i zamknięte w rozmowie ${DLUGIE_SLOWO} — część druga, rozszerzona`;
const DLUGA_NAZWA_PLIKU = `karta_pracy_do_lekcji_o_pytaniach_otwartych_i_zamknietych_${"wersja_poprawiona_".repeat(5)}2026.pdf`;
const DLUGA_NAZWA_NAGRANIA = `nagranie_z_warsztatu_wywiad_psychologiczny_${"czesc_pierwsza_".repeat(4)}ostateczna.mp4`;

interface Lekcja {
  id: number;
  course_id: number;
  title: string;
  description: string | null;
  content: string | null;
  sequence_order: number;
  topic_id: number;
  topic_position: number;
  video_provider_id: string | null;
  duration_seconds: number;
  materials_count: number;
  created_at: string | null;
  updated_at: string | null;
}

function lekcja(id: number, title: string, reszta: Partial<Lekcja> = {}): Lekcja {
  return {
    id,
    course_id: 4,
    title,
    description: null,
    content: null,
    sequence_order: id - 20,
    topic_id: 7,
    topic_position: id - 20,
    video_provider_id: null,
    duration_seconds: 1500,
    materials_count: 0,
    created_at: null,
    updated_at: null,
    ...reszta,
  };
}

interface Opcje {
  /** Pola lekcji 22 inne niż domyślne. */
  lekcja22?: Partial<Lekcja>;
  nagranie?: "brak" | "gotowe";
  /** Ile kawałków pliku dostawca przyjmuje, zanim kolejny zawiśnie bez odpowiedzi. */
  przyjeteKawalki?: number;
  /** Nazwy kolejnych wgrywanych plików lekcji. */
  nazwyPlikow?: string[];
}

function json(dane: unknown, status = 200, meta?: unknown) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }),
  };
}

async function instalujAtrapy(page: Page, opcje: Opcje = {}): Promise<{ zapisy: string[] }> {
  const zapisy: string[] = [];
  let lekcje = [
    lekcja(21, "Wprowadzenie do wywiadu"),
    lekcja(22, "Pytania otwarte i zamknięte", {
      description: "Kiedy pytać otwarcie, a kiedy zamknąć pytanie.",
      content: "## Cel lekcji\n\nPo tej lekcji rozróżniasz pytania otwarte i zamknięte.\n\n- przykład pierwszy\n- przykład drugi",
      ...opcje.lekcja22,
    }),
    lekcja(23, "Ćwiczenie w parach"),
  ];
  let nastepnyId = 100;
  const nazwy = [...(opcje.nazwyPlikow ?? [])];

  await page.route(`${API}/**`, (route) => route.fulfill(json([], 200, META)));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(json({ id: 1, role: "super_admin", first_name: "Anna", program_completed_at: null })),
  );
  await page.route(`${API}/notifications**`, (route) =>
    route.fulfill(json([], 200, { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { unread: 0 } })),
  );
  await page.route(
    (adres) => adres.pathname.startsWith("/api/v1/admin/"),
    async (route) => {
      const zadanie = route.request();
      const sciezka = new URL(zadanie.url()).pathname.replace("/api/v1", "");
      const metoda = zadanie.method();
      if (metoda !== "GET") zapisy.push(`${metoda} ${sciezka}`);

      if (sciezka === "/admin/courses/4") return route.fulfill(json({ id: 4, title: "Wywiad psychologiczny" }));
      if (sciezka === "/admin/courses/4/lessons") return route.fulfill(json(lekcje));
      if (/^\/admin\/lessons\/\d+\/video-status$/.test(sciezka)) {
        return route.fulfill(
          json(
            opcje.nagranie === "gotowe" && sciezka.includes("/22/")
              ? { status: "finished", duration_seconds: 1500, preview_embed_url: null }
              : { status: "no_video" },
          ),
        );
      }
      if (/^\/admin\/lessons\/\d+\/video-uploads$/.test(sciezka) && metoda === "POST") {
        return route.fulfill(
          json(
            {
              video_id: "wideo-nowe",
              upload_url: `${DOSTAWCA}/tusupload`,
              library_id: "1",
              expiration_time: 1790000000,
              signature: ["atrapa", "podpisu"].join("-"),
            },
            201,
          ),
        );
      }
      if (/^\/admin\/lessons\/\d+\/materials$/.test(sciezka) && metoda === "POST") {
        // Serwer liczy pliki lekcji sam: po wgraniu kolejny odczyt lekcji niesie liczbę o jeden większą.
        lekcje = lekcje.map((wpis) => (wpis.id === 22 ? { ...wpis, materials_count: wpis.materials_count + 1 } : wpis));
        return route.fulfill(
          json(
            {
              id: nastepnyId++,
              name: nazwy.shift() ?? "karta-pracy.pdf",
              mime: "application/pdf",
              size: 410 * 1024,
              lesson_id: 22,
              course_id: null,
              created_at: null,
            },
            201,
          ),
        );
      }
      const jedna = /^\/admin\/lessons\/(\d+)$/.exec(sciezka);
      if (jedna && metoda === "PATCH") {
        const id = Number(jedna[1]);
        const cialo = zadanie.postDataJSON() as Partial<Lekcja>;
        lekcje = lekcje.map((wpis) => (wpis.id === id ? { ...wpis, ...cialo } : wpis));
        return route.fulfill(json(lekcje.find((wpis) => wpis.id === id)));
      }
      return route.fallback();
    },
  );

  // Dostawca nagrań: utworzenie wgrania, potem kawałki pliku; po wyczerpaniu
  // przyjętych kawałków kolejny zostaje bez odpowiedzi (wysyłanie „trwa”).
  const naglowkiDostawcy = {
    "access-control-allow-origin": "*",
    "access-control-expose-headers": "Location, Upload-Offset",
  };
  let przyjete = 0;
  await page.route(`${DOSTAWCA}/**`, async (route) => {
    const zadanie = route.request();
    if (zadanie.method() === "POST") {
      return route.fulfill({ status: 201, headers: { ...naglowkiDostawcy, Location: `${DOSTAWCA}/tusupload/1` } });
    }
    if (zadanie.method() === "PATCH" && przyjete < (opcje.przyjeteKawalki ?? 0)) {
      przyjete += 1;
      return route.fulfill({ status: 204, headers: { ...naglowkiDostawcy, "Upload-Offset": String(przyjete * 5 * MB) } });
    }
    // Bez odpowiedzi: żądanie wisi do przerwania przez osobę albo do końca próby.
  });

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json({ url: null })));
  return { zapisy };
}

async function otworzLekcje(page: Page, idLekcji: number, tytul: string): Promise<void> {
  const odpowiedz = await page.goto(`/admin/kursy/4/lekcje/${idLekcji}`);
  expect(odpowiedz?.status()).toBe(200);
  await zabezpieczeniePrzedEkranemDostepu(page);
  await expect(page.getByRole("heading", { level: 1, name: tytul })).toBeVisible();
}

/** Zrzut całej strony, od góry. */
async function zrzut(page: Page, nazwa: string): Promise<void> {
  const katalog = process.env.PW_ZRZUTY;
  if (!katalog) return;
  mkdirSync(katalog, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(katalog, `${nazwa}.png`), fullPage: true, animations: "disabled" });
}

async function sprawdzAxe(page: Page, testInfo: TestInfo, nazwa: string): Promise<void> {
  const naruszenia = await uruchomAxe(page);
  await dolaczNaruszeniaDoRaportu(testInfo, nazwa, naruszenia);
  expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);
  const pelny = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "best-practice"]).analyze();
  expect(
    pelny.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.map(String).join(" ")).join(" | ")}`),
    `axe z best-practice: ${nazwa}`,
  ).toEqual([]);
}

interface PunktFokusu {
  nazwa: string;
  id: string;
  obszar: string;
  gora: number;
  lewo: number;
  prawo: number;
  /** Czy element stoi w dokumencie za poprzednim elementem z fokusem. */
  zaPoprzednim: boolean;
}

/** Przechodzi klawiszem Tab przez całą treść strony i zwraca kolejne elementy z fokusem. */
async function przejdzTabulatorem(page: Page): Promise<PunktFokusu[]> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator("main#tresc").focus();
  const punkty: PunktFokusu[] = [];
  for (let krok = 0; krok < 80; krok += 1) {
    await page.keyboard.press("Tab");
    const punkt = await page.evaluate(() => {
      const okno = window as unknown as { poprzedniFokus?: Element };
      const element = document.activeElement as HTMLElement | null;
      const main = document.querySelector("main");
      if (!element || !main || element === main || !main.contains(element)) return null;
      const ramka = element.getBoundingClientRect();
      const poprzedni = okno.poprzedniFokus;
      const zaPoprzednim =
        !poprzedni || Boolean(poprzedni.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING);
      okno.poprzedniFokus = element;
      return {
        nazwa: (element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 70),
        id: element.id,
        obszar: element.closest("[data-obszar]")?.getAttribute("data-obszar") ?? "",
        gora: Math.round(ramka.top + window.scrollY),
        lewo: Math.round(ramka.left),
        prawo: Math.round(ramka.right),
        zaPoprzednim,
      };
    });
    if (punkt === null) break;
    punkty.push(punkt);
  }
  return punkty;
}

/**
 * Wspólne pomiary stanu strony: jeden `main`, jeden widoczny zielony przycisk,
 * brak przewijania poziomego, cele dotyku, kolejność fokusu, axe, zrzut.
 */
async function zmierzStan(page: Page, testInfo: TestInfo, szerokosc: number, nazwa: string): Promise<void> {
  const dwieKolumny = szerokosc >= PROG_DWOCH_KOLUMN;
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("main [data-style-id='szablon-edycja']")).toHaveCount(1);

  // Jeden zielony przycisk: w karcie „Zapis” od 1100 px, w wąskim pasie poniżej.
  const zielone = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("main button"))
      .filter((przycisk) => /primary/.test(przycisk.className) && przycisk.getClientRects().length > 0)
      .map((przycisk) => ({
        tekst: (przycisk.textContent ?? "").trim(),
        obszar: przycisk.closest("[data-obszar]")?.getAttribute("data-obszar") ?? "",
        wylaczony: (przycisk as HTMLButtonElement).disabled,
      })),
  );
  expect(zielone).toEqual([
    { tekst: "Zapisz lekcję", obszar: dwieKolumny ? "tylko-od-dwoch-kolumn" : "pasek-waski", wylaczony: false },
  ]);
  await expect(page.getByRole("heading", { level: 2, name: "Zapis", exact: true })).toHaveCount(dwieKolumny ? 1 : 0);
  await expect(page.getByRole("status").filter({ hasText: /Niezapisane|Wszystko zapisane/ })).toHaveCount(1);

  // Wąski pas trzyma się góry okna także po przewinięciu strony na dół.
  if (!dwieKolumny) {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const pas = page.locator("[data-obszar='pasek-waski']");
    await expect(pas).toBeInViewport();
    const ramkaPasa = await pas.boundingBox();
    expect(ramkaPasa!.y, "wąski pas przy górze okna").toBeLessThan(120);
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  // Brak przewijania w poziomie; przy błędzie komunikat wskazuje elementy wystające poza okno.
  const przewijanie = await page.evaluate(() => {
    const szerokoscOkna = document.documentElement.clientWidth;
    const wystajace = Array.from(document.querySelectorAll<HTMLElement>("main *"))
      .filter((element) => element.getBoundingClientRect().right > szerokoscOkna + 1)
      .slice(0, 8)
      .map((element) => `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 40)}`);
    return { nadmiar: document.documentElement.scrollWidth - szerokoscOkna, wystajace };
  });
  expect(przewijanie.nadmiar, `przewijanie poziome: ${przewijanie.wystajace.join(", ")}`).toBeLessThanOrEqual(0);

  // Cele dotyku: każdy widoczny element czynny w treści ma co najmniej 44 px.
  const zaMale = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        "main a[href], main button, main [role='button'], main textarea, main input:not([type='file']):not([type='hidden'])",
      ),
    )
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const ramka = element.getBoundingClientRect();
        return {
          nazwa: (element.getAttribute("aria-label") ?? element.textContent ?? element.id).trim().slice(0, 50),
          wysokosc: Math.round(ramka.height * 10) / 10,
          szerokosc: Math.round(ramka.width * 10) / 10,
          odnosnik: element.tagName === "A",
        };
      })
      // Odnośnik w tekście ma szerokość swojej treści; mierzona jest jego wysokość.
      .filter((cel) => cel.wysokosc < 44 || (!cel.odnosnik && cel.szerokosc < 44)),
  );
  expect(zaMale, "cele dotyku poniżej 44 px").toEqual([]);

  // Kolejność fokusu = kolejność na ekranie: obszary po kolei, w dokumencie zawsze naprzód,
  // na ekranie w dół albo w prawo (w tym samym wierszu lub do prawej kolumny).
  const fokus = await przejdzTabulatorem(page);
  await testInfo.attach(`fokus-${nazwa}`, { body: JSON.stringify(fokus, null, 2), contentType: "application/json" });
  expect(fokus.length, "liczba elementów z fokusem").toBeGreaterThan(5);
  expect(fokus.filter((punkt) => !punkt.zaPoprzednim).map((punkt) => punkt.nazwa)).toEqual([]);
  const obszary = fokus.map((punkt) => punkt.obszar).filter((obszar, indeks, lista) => obszar !== lista[indeks - 1]);
  expect(obszary).toEqual(
    dwieKolumny ? ["naglowek", "glowna", "tylko-od-dwoch-kolumn", "boczna"] : ["naglowek", "pasek-waski", "glowna", "boczna"],
  );
  const cofniecia = fokus
    .slice(1)
    .filter((punkt, indeks) => punkt.gora < fokus[indeks].gora - 8 && punkt.lewo < fokus[indeks].prawo - 8)
    .map((punkt) => punkt.nazwa);
  expect(cofniecia, "fokus cofa się na ekranie").toEqual([]);
  expect(fokus.filter((punkt) => punkt.nazwa === "Zapisz lekcję")).toHaveLength(1);

  await page.evaluate(() => window.scrollTo(0, 0));
  await sprawdzAxe(page, testInfo, `axe-${nazwa}`);
  await zrzut(page, nazwa);
}

function poleNagrania(page: Page) {
  return page.locator("input[type='file'][id$='-nagranie-plik']");
}

function kartaNagrania(page: Page) {
  return page.locator("section", { has: page.getByRole("heading", { level: 2, name: "Nagranie", exact: true }) });
}

const OKNA = [
  { szerokosc: 1280, wysokosc: 800 },
  { szerokosc: 390, wysokosc: 844 },
];

for (const { szerokosc, wysokosc } of OKNA) {
  test.describe(`strona lekcji w układzie dwóch kolumn — ${szerokosc} px`, () => {
    test.skip(!GRUPY.edycjaLekcji.wlaczona, "grupa ekranu lekcji jest wyłączona");
    test.use({ viewport: { width: szerokosc, height: wysokosc } });

    test("niezapisany tekst i trwające wysyłanie nagrania; pytanie o wyjście z trzema drogami", async ({ page }, testInfo) => {
      const { zapisy } = await instalujAtrapy(page, { przyjeteKawalki: 2 });
      await otworzLekcje(page, 22, "Pytania otwarte i zamknięte");

      await page.getByLabel(/^Tytuł lekcji/).fill("Pytania otwarte, zamknięte i pogłębiające");
      await page.getByRole("textbox", { name: "Treść lekcji" }).fill("## Cel lekcji\n\nNowy akapit, jeszcze niezapisany.");
      await expect(page.getByRole("status").filter({ hasText: "Niezapisane: tytuł, treść" })).toHaveCount(1);

      await poleNagrania(page).setInputFiles({ name: DLUGA_NAZWA_NAGRANIA, mimeType: "video/mp4", buffer: Buffer.alloc(13 * MB) });
      const karta = kartaNagrania(page);
      await expect(karta.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "76");
      await expect(karta.getByText(DLUGA_NAZWA_NAGRANIA)).toBeVisible();
      await expect(karta.getByText("1. Wysyłanie (teraz)")).toHaveAttribute("aria-current", "step");
      await expect(karta.getByText(/Nie zamykaj karty przeglądarki do końca wysyłania/)).toBeVisible();
      await expect(page.getByText(/nagranie się wysyła \(76/)).toBeVisible();

      await zmierzStan(page, testInfo, szerokosc, `d-lekcja-${szerokosc}`);

      // Wyjście z niezapisanym tekstem: jedno okno, trzy drogi, fokus na „Zostań”.
      const wroc = page.getByRole("link", { name: "← Wróć do kursu" });
      await wroc.click();
      const okno = page.getByRole("dialog", { name: "Zapisać zmiany przed przejściem?" });
      await expect(okno).toBeVisible();
      await expect(okno.getByRole("button", { name: "Zostań" })).toBeFocused();
      await expect(okno.getByRole("button", { name: "Zapisz i przejdź" })).toBeVisible();
      await expect(okno.getByRole("button", { name: "Przejdź bez zapisu" })).toBeVisible();
      await sprawdzAxe(page, testInfo, `axe-d-lekcja-${szerokosc}-pytanie-o-wyjscie`);
      await okno.getByRole("button", { name: "Zostań" }).click();
      await expect(okno).toHaveCount(0);
      await expect(wroc).toBeFocused();
      await expect(page).toHaveURL(/\/admin\/kursy\/4\/lekcje\/22$/);
      expect(zapisy.filter((zapis) => zapis.startsWith("PATCH"))).toEqual([]);
    });

    test("wszystko zapisane, nagranie gotowe, długi tytuł i długa nazwa pliku bez spacji", async ({ page }, testInfo) => {
      const { zapisy } = await instalujAtrapy(page, {
        nagranie: "gotowe",
        lekcja22: { title: DLUGI_TYTUL, materials_count: 3, video_provider_id: "wideo-22" },
        nazwyPlikow: [DLUGA_NAZWA_PLIKU],
      });
      await otworzLekcje(page, 22, DLUGI_TYTUL);

      await expect(kartaNagrania(page).getByText("Nagranie jest gotowe. Czas trwania:", { exact: false })).toBeVisible();
      await page
        .locator("input[type='file'][id$='-plik-materialu']")
        .setInputFiles({ name: DLUGA_NAZWA_PLIKU, mimeType: "application/pdf", buffer: Buffer.from("%PDF-") });
      const lista = page.getByRole("list", { name: "Pliki dodane teraz" });
      await expect(lista.getByText(DLUGA_NAZWA_PLIKU, { exact: true })).toBeVisible();
      await expect(lista.getByText(/^PDF · 410.KB$/)).toBeVisible();
      await expect(page.getByText("Ta lekcja ma 4 materiały.")).toBeVisible();

      // Klik bez zmian nie wysyła żądania; po zmianie — jeden zapis i godzina w stanie zapisu.
      const zapisz = page.getByRole("button", { name: "Zapisz lekcję" });
      await zapisz.click();
      expect(zapisy.filter((zapis) => zapis.startsWith("PATCH"))).toEqual([]);
      await page.getByLabel(/^Krótki opis/).fill("Opis po zmianie.");
      await expect(page.getByRole("status").filter({ hasText: "Niezapisane: opis" })).toHaveCount(1);
      await zapisz.click();
      await expect(page.getByRole("status").filter({ hasText: /Wszystko zapisane.*\d\d:\d\d/ })).toHaveCount(1);
      expect(zapisy.filter((zapis) => zapis.startsWith("PATCH"))).toEqual(["PATCH /admin/lessons/22"]);

      await zmierzStan(page, testInfo, szerokosc, `d-lekcja-zapisane-${szerokosc}`);
    });

    test("wysyłanie nagrania przerwane: zdanie, „Wyślij ponownie”, stan lekcji wymaga uwagi", async ({ page }, testInfo) => {
      await instalujAtrapy(page, { przyjeteKawalki: 1 });
      await otworzLekcje(page, 22, "Pytania otwarte i zamknięte");

      await poleNagrania(page).setInputFiles({ name: "wywiad-nagranie.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(11 * MB) });
      const karta = kartaNagrania(page);
      await expect(karta.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "45");
      await karta.getByRole("button", { name: "Przerwij wysyłanie" }).click();

      await expect(karta.getByText("Wysyłanie zostało przerwane. Wyślij plik ponownie.")).toBeVisible();
      await expect(karta.getByText("Wyślij ponownie", { exact: true })).toBeVisible();
      await expect(karta.getByRole("progressbar")).toHaveCount(0);
      await expect(page.getByText(/Wymaga uwagi:.*nagranie trzeba wysłać ponownie/)).toBeVisible();

      await zmierzStan(page, testInfo, szerokosc, `d-lekcja-przerwane-${szerokosc}`);
    });

    test("pusta lekcja: pierwsza w kursie, bez treści, nagrania i plików", async ({ page }, testInfo) => {
      await instalujAtrapy(page);
      await otworzLekcje(page, 21, "Wprowadzenie do wywiadu");

      await expect(page.getByText("lekcja 1 z 3")).toBeVisible();
      const poprzednia = page.getByRole("link", { name: "Poprzednia lekcja: brak, to pierwsza lekcja kursu" });
      await expect(poprzednia).toHaveAttribute("aria-disabled", "true");
      await expect(page.getByRole("link", { name: "Następna lekcja: Pytania otwarte i zamknięte" })).toHaveAttribute(
        "href",
        "/admin/kursy/4/lekcje/22",
      );
      await expect(page.getByText("Ta lekcja nie ma jeszcze nagrania.")).toBeVisible();
      await expect(page.getByText("Ta lekcja nie ma jeszcze materiałów.")).toBeVisible();
      await expect(page.getByText(/Wymaga uwagi:.*lekcja nie ma treści ani nagrania/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Usunięcie lekcji" })).toHaveAttribute("aria-expanded", "false");
      await expect(page.getByRole("button", { name: "Usuń lekcję" })).toHaveCount(0);

      await zmierzStan(page, testInfo, szerokosc, `d-lekcja-pusta-${szerokosc}`);
    });
  });
}
