import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";
import { GRUPY } from "../lib/przelaczenie/grupy";

/**
 * Karta „Treść lekcji” na stronie lekcji administracji: edytor z paskiem
 * zamiast pola ze znacznikami i osobnego podglądu. Na zbudowanej aplikacji,
 * z atrapą API i atrapą sesji (żadne żądanie nie wychodzi poza przeglądarkę),
 * na 1280 i 390 px:
 *  - wpisany tekst, pogrubienie i zapis: żądanie niesie oczekiwany napis;
 *  - treść zastana (końce wiersza, odstępy, zapis spoza podzbioru) wraca do
 *    zapisu bajt w bajt, a po edycji jednego akapitu nie ginie z niej nic;
 *  - listy mają znaczniki w edytorze i u uczestnika (styl wyliczony);
 *  - kolejność fokusu pasek → treść → reszta strony; z pozycji listy da się
 *    wyjść klawiaturą bez zmiany treści;
 *  - jeden zielony przycisk, cele dotyku co najmniej 44 px (także pasek),
 *    brak przewijania poziomego przy długim słowie, axe = 0.
 * Zrzuty powstają tylko przy ustawionej zmiennej `PW_ZRZUTY`.
 */

const API = "http://localhost:8000/api/v1";
const META = { current_page: 1, per_page: 100, total: 0, last_page: 1 };
const ATRAPA_SESJI = {
  accessToken: ["atrapa", "tokenu", "testowego"].join("-"),
  expiresAt: Date.now() + 3_600_000,
};

const DLUGIE_SLOWO = "Psychologicznodiagnostycznoterapeutycznointerwencyjnokryzysowe".repeat(2);

const TRESC_Z_LISTAMI = [
  "## Cel lekcji",
  "",
  "Po tej lekcji rozróżniasz pytania **otwarte** i *zamknięte*.",
  "",
  "- pytanie otwarte zaprasza do opowieści",
  "- pytanie zamknięte porządkuje fakty",
  "",
  "### Kolejność rozmowy",
  "",
  "1. zacznij od pytania otwartego",
  "2. dopytaj pytaniem zamkniętym",
  "3. podsumuj własnymi słowami",
].join("\n");

const SPOZA_PODZBIORU = [
  "| A | B |\r\n|---|---|\r\n| 1 | 2 |",
  "![Opis](/obraz.png)",
  '<div class="x"><b>pogrubione</b></div>',
  "```\r\nconst a = 1;\r\n```",
  "> cytat w treści",
  "- punkt\r\n    - wcięty punkt",
  "# Tytuł pierwszego poziomu",
];

const TRESC_ZASTANA = [
  "  Akapit otwierający   ",
  "z drugim wierszem.  ",
  "",
  "",
  ...SPOZA_PODZBIORU.flatMap((fragment) => [fragment, ""]),
  "*  to nie lista",
  "",
  "Ostatni akapit.",
  "",
  "",
].join("\r\n");

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

function lekcja(id: number, title: string, content: string | null): Lekcja {
  return {
    id,
    course_id: 4,
    title,
    description: null,
    content,
    sequence_order: id - 20,
    topic_id: 7,
    topic_position: id - 20,
    video_provider_id: null,
    duration_seconds: 1500,
    materials_count: 0,
    created_at: null,
    updated_at: null,
  };
}

function json(dane: unknown, status = 200, meta?: unknown) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }),
  };
}

async function instalujSesje(page: Page, rola: string): Promise<void> {
  await page.route(`${API}/**`, (route) => route.fulfill(json([], 200, META)));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(json({ id: 1, role: rola, first_name: "Anna", program_completed_at: null })),
  );
  await page.route(`${API}/notifications**`, (route) =>
    route.fulfill(json([], 200, { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { unread: 0 } })),
  );
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json({ url: null })));
}

/** Atrapa administracji; zwraca surowe ciała kolejnych zapisów lekcji 22 (napisy, nie obiekty). */
async function instalujAdministracje(page: Page, tresc: string | null): Promise<{ zapisy: string[] }> {
  const zapisy: string[] = [];
  let lekcje = [lekcja(21, "Wprowadzenie do wywiadu", null), lekcja(22, "Pytania otwarte i zamknięte", tresc)];
  await instalujSesje(page, "super_admin");
  await page.route(
    (adres) => adres.pathname.startsWith("/api/v1/admin/"),
    async (route) => {
      const zadanie = route.request();
      const sciezka = new URL(zadanie.url()).pathname.replace("/api/v1", "");
      const metoda = zadanie.method();
      if (sciezka === "/admin/courses/4") return route.fulfill(json({ id: 4, title: "Wywiad psychologiczny" }));
      if (sciezka === "/admin/courses/4/lessons") return route.fulfill(json(lekcje));
      if (/^\/admin\/lessons\/\d+\/video-status$/.test(sciezka)) return route.fulfill(json({ status: "no_video" }));
      if (sciezka === "/admin/lessons/22" && metoda === "PATCH") {
        zapisy.push(zadanie.postData() ?? "");
        const cialo = zadanie.postDataJSON() as Partial<Lekcja>;
        lekcje = lekcje.map((wpis) => (wpis.id === 22 ? { ...wpis, ...cialo } : wpis));
        return route.fulfill(json(lekcje[1]));
      }
      return route.fallback();
    },
  );
  return { zapisy };
}

function trescZapisu(surowe: string): unknown {
  return (JSON.parse(surowe) as { content?: unknown }).content;
}

async function otworzStroneLekcji(page: Page): Promise<Locator> {
  const odpowiedz = await page.goto("/admin/kursy/4/lekcje/22");
  expect(odpowiedz?.status()).toBe(200);
  await zabezpieczeniePrzedEkranemDostepu(page);
  await expect(page.getByRole("heading", { level: 1, name: "Pytania otwarte i zamknięte" })).toBeVisible();
  // Obszar dostaje rolę dopiero po wczytaniu silnika edycji — od tej chwili da się pisać.
  const obszar = page.getByRole("textbox", { name: "Treść lekcji" });
  await expect(obszar).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Formatowanie treści" }).getByRole("button", { name: "Pogrubienie" })).toBeEnabled();
  return obszar;
}

function kartaTresci(page: Page): Locator {
  return page.locator("section", { has: page.getByRole("heading", { level: 2, name: "Treść lekcji", exact: true }) });
}

function stan(page: Page, tekst: string | RegExp): Locator {
  return page.getByRole("status").filter({ hasText: tekst });
}

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

async function bezPrzewijaniaPoziomego(page: Page): Promise<void> {
  const przewijanie = await page.evaluate(() => {
    const szerokoscOkna = document.documentElement.clientWidth;
    const wystajace = Array.from(document.querySelectorAll<HTMLElement>("main *"))
      .filter((element) => element.getBoundingClientRect().right > szerokoscOkna + 1)
      .slice(0, 8)
      .map((element) => `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 40)}`);
    return { nadmiar: document.documentElement.scrollWidth - szerokoscOkna, wystajace };
  });
  expect(przewijanie.nadmiar, `przewijanie poziome: ${przewijanie.wystajace.join(", ")}`).toBeLessThanOrEqual(0);
}

/** Jeden zielony przycisk, cele dotyku (także pasek edytora), brak przewijania poziomego, axe. */
async function zmierzStrone(page: Page, testInfo: TestInfo, nazwa: string): Promise<void> {
  await expect(page.locator("main")).toHaveCount(1);
  const zielone = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("main button"))
      .filter((przycisk) => /primary/.test(przycisk.className) && przycisk.getClientRects().length > 0)
      .map((przycisk) => (przycisk.textContent ?? "").trim()),
  );
  expect(zielone).toEqual(["Zapisz lekcję"]);

  await bezPrzewijaniaPoziomego(page);

  const cele = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        "main a[href], main button, main [role='button'], main [role='textbox'], main textarea, main input:not([type='file']):not([type='hidden'])",
      ),
    )
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const ramka = element.getBoundingClientRect();
        return {
          nazwa: (element.getAttribute("aria-label") ?? element.textContent ?? element.id).trim().slice(0, 50),
          wPasku: element.closest("[role='toolbar']") !== null,
          wysokosc: Math.round(ramka.height * 10) / 10,
          szerokosc: Math.round(ramka.width * 10) / 10,
          odnosnik: element.tagName === "A",
        };
      }),
  );
  // Pasek edytora jest wśród mierzonych celów: styl tekstu, 2 wyróżnienia, 2 listy, link, cofnij, ponów.
  expect(cele.filter((cel) => cel.wPasku)).toHaveLength(8);
  expect(
    cele.filter((cel) => cel.wysokosc < 44 || (!cel.odnosnik && cel.szerokosc < 44)),
    "cele dotyku poniżej 44 px",
  ).toEqual([]);

  await page.evaluate(() => window.scrollTo(0, 0));
  await sprawdzAxe(page, testInfo, `axe-${nazwa}`);
}

/** Wyliczony styl znaczników list w podanym obszarze: [rodzaj listy, znacznik, wcięcie w px]. */
async function znacznikiList(obszar: Locator): Promise<[string, string, boolean][]> {
  return obszar.evaluate((korzen) =>
    Array.from(korzen.querySelectorAll("ul, ol")).map((lista) => {
      const styl = getComputedStyle(lista);
      return [lista.tagName.toLowerCase(), styl.listStyleType, parseFloat(styl.paddingLeft) >= 16] as [string, string, boolean];
    }),
  );
}

const OKNA = [
  { szerokosc: 1280, wysokosc: 800 },
  { szerokosc: 390, wysokosc: 844 },
];

for (const { szerokosc, wysokosc } of OKNA) {
  test.describe(`strona lekcji: edytor treści — ${szerokosc} px`, () => {
    test.skip(!GRUPY.edycjaLekcji.wlaczona, "grupa ekranu lekcji jest wyłączona");
    test.use({ viewport: { width: szerokosc, height: wysokosc } });

    test("wpisany tekst, pogrubienie, długie słowo i zapis: żądanie niesie oczekiwany napis", async ({ page }, testInfo) => {
      const { zapisy } = await instalujAdministracje(page, null);
      const obszar = await otworzStroneLekcji(page);
      const karta = kartaTresci(page);
      const pasek = karta.getByRole("toolbar", { name: "Formatowanie treści" });

      // Jeden edytor w karcie; bez pola ze znacznikami i bez osobnego podglądu; licznik i zdanie raz.
      await expect(karta.locator("textarea")).toHaveCount(0);
      await expect(page.getByText("Podgląd treści")).toHaveCount(0);
      await expect(page.getByText(/ z 20 000 znaków$/)).toHaveCount(1);
      await expect(page.getByText("Uczestnik zobaczy treść w tych samych stylach.")).toHaveCount(1);
      await expect(stan(page, /^Wszystko zapisane$/)).toHaveCount(1);

      await obszar.click();
      await page.keyboard.type("Nowy akapit ");
      await pasek.getByRole("button", { name: "Pogrubienie" }).click();
      await expect(pasek.getByRole("button", { name: "Pogrubienie" })).toHaveAttribute("aria-pressed", "true");
      await page.keyboard.type("ważne");
      await pasek.getByRole("button", { name: "Pogrubienie" }).click();
      await page.keyboard.press("Enter");
      await page.keyboard.type(DLUGIE_SLOWO);

      await expect(obszar.locator("strong")).toHaveText("ważne");
      await expect(stan(page, /^Niezapisane: treść$/)).toHaveCount(1);
      const oczekiwana = `Nowy akapit **ważne**\n\n${DLUGIE_SLOWO}`;
      await expect(page.getByText(new RegExp(`^${[...oczekiwana].length} z 20 000 znaków$`))).toHaveCount(1);

      await zmierzStrone(page, testInfo, `edytor-tresci-${szerokosc}`);
      await zrzut(page, `administracja--lekcja-edycja--edytor-tresci--${szerokosc}`);

      await page.getByRole("button", { name: "Zapisz lekcję" }).click();
      await expect(stan(page, /Wszystko zapisane.*\d\d:\d\d/)).toHaveCount(1);
      expect(zapisy).toHaveLength(1);
      expect(trescZapisu(zapisy[0])).toBe(oczekiwana);
      // Po zapisie edytor trzyma tę samą treść i nic nie jest niezapisane.
      await expect(obszar.locator("strong")).toHaveText("ważne");
    });

    test("treść zastana: otwarcie i ruch kursora niczego nie zmieniają, zapis niesie ją bajt w bajt; po edycji akapitu nic nie ginie", async ({ page }) => {
      const { zapisy } = await instalujAdministracje(page, TRESC_ZASTANA);
      const obszar = await otworzStroneLekcji(page);

      await obszar.click();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("End");
      await expect(stan(page, /^Wszystko zapisane$/)).toHaveCount(1);

      await page.getByLabel(/^Tytuł lekcji/).fill("Pytania otwarte, zamknięte i pogłębiające");
      await expect(stan(page, /^Niezapisane: tytuł$/)).toHaveCount(1);
      await page.getByRole("button", { name: "Zapisz lekcję" }).click();
      await expect(stan(page, /Wszystko zapisane.*\d\d:\d\d/)).toHaveCount(1);
      expect(zapisy).toHaveLength(1);
      // Porównanie napisów: surowe ciało żądania niesie treść zakodowaną dokładnie tak jak wzorzec.
      expect(trescZapisu(zapisy[0])).toBe(TRESC_ZASTANA);
      expect(zapisy[0]).toContain(`"content":${JSON.stringify(TRESC_ZASTANA)}`);

      await obszar.getByText("Ostatni akapit.").click();
      await page.keyboard.press("End");
      await page.keyboard.type(" Dopisane.");
      await expect(stan(page, /^Niezapisane: treść/)).toHaveCount(1);
      await page.getByRole("button", { name: "Zapisz lekcję" }).click();
      await expect.poll(() => zapisy.length).toBe(2);
      const poEdycji = trescZapisu(zapisy[1]) as string;
      for (const fragment of SPOZA_PODZBIORU) {
        expect(poEdycji).toContain(fragment);
      }
      expect(poEdycji).toContain("Ostatni akapit. Dopisane.");
      const przedAkapitem = TRESC_ZASTANA.slice(0, TRESC_ZASTANA.indexOf("Ostatni akapit."));
      expect(poEdycji.startsWith(przedAkapitem)).toBe(true);
    });

    test("listy mają znaczniki w edytorze; kolejność fokusu pasek → treść → reszta; z listy wychodzi się klawiaturą bez zmiany treści", async ({ page }, testInfo) => {
      const { zapisy } = await instalujAdministracje(page, TRESC_Z_LISTAMI);
      const obszar = await otworzStroneLekcji(page);
      const karta = kartaTresci(page);
      const pasek = karta.getByRole("toolbar", { name: "Formatowanie treści" });

      expect(await znacznikiList(obszar)).toEqual([
        ["ul", "disc", true],
        ["ol", "decimal", true],
      ]);

      // Pasek ma jeden przystanek; po nim obszar treści, po nim pierwsza kontrolka za kartą treści.
      await expect(pasek.locator("button[tabindex='0']")).toHaveCount(1);
      await pasek.locator("button[tabindex='0']").focus();
      await page.keyboard.press("Tab");
      await expect(obszar).toBeFocused();
      await page.keyboard.press("Tab");
      const zaKarta = await page.evaluate(() => {
        const element = document.activeElement;
        const obszarTresci = document.querySelector("[role='textbox'][aria-label='Treść lekcji']");
        const karta = obszarTresci?.closest("section");
        return {
          wMain: Boolean(element && document.querySelector("main")?.contains(element)),
          pozaKarta: Boolean(element && karta && !karta.contains(element)),
          zaObszarem: Boolean(
            element && obszarTresci && obszarTresci.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING,
          ),
        };
      });
      expect(zaKarta).toEqual({ wMain: true, pozaKarta: true, zaObszarem: true });

      // Z pozycji listy: Shift+Tab prowadzi na pasek, Tab z powrotem do treści; pozycja zostaje w liście.
      await obszar.getByText("pytanie zamknięte porządkuje fakty").click();
      await page.keyboard.press("Shift+Tab");
      await expect(pasek.locator("button[tabindex='0']")).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(obszar).toBeFocused();
      await expect(obszar.locator("ul > li")).toHaveCount(2);
      await expect(obszar.locator("ol > li")).toHaveCount(3);
      await expect(stan(page, /^Wszystko zapisane$/)).toHaveCount(1);
      expect(zapisy).toEqual([]);

      await zmierzStrone(page, testInfo, `edytor-listy-${szerokosc}`);
      await zrzut(page, `administracja--lekcja-edycja--edytor-listy--${szerokosc}`);
    });

    test("uczestnik: listy w treści lekcji mają znaczniki — punkt i liczbę", async ({ page }) => {
      await instalujSesje(page, "volunteer");
      await page.route(`${API}/lessons/21`, (route) =>
        route.fulfill(
          json({
            id: 21,
            title: "Pytania otwarte i zamknięte",
            description: "Kiedy pytać otwarcie, a kiedy zamknąć pytanie.",
            content: TRESC_Z_LISTAMI,
            topic: { id: 7, title: "Rozmowa", position: 1 },
            duration_seconds: 1800,
            position_seconds: 0,
            watched_seconds: 0,
            active_seconds: 0,
            is_completed: false,
            completable: false,
            completable_at_percent: 60,
            video_status: "none",
          }),
        ),
      );
      const odpowiedz = await page.goto("/nowy-front/lekcja/21");
      expect(odpowiedz?.status()).toBe(200);
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.getByRole("heading", { level: 1, name: "Pytania otwarte i zamknięte" })).toBeVisible();
      const punkt = page.getByText("pytanie otwarte zaprasza do opowieści");
      await expect(punkt).toBeVisible();

      const tresc = page.locator("main div", { has: page.getByRole("heading", { level: 2, name: "Cel lekcji" }) }).last();
      expect(await znacznikiList(tresc)).toEqual([
        ["ul", "disc", true],
        ["ol", "decimal", true],
      ]);
      await bezPrzewijaniaPoziomego(page);
      await zrzut(page, `uczestnik--lekcja--tresc-listy--${szerokosc}`);
    });
  });
}
