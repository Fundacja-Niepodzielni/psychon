import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";

/**
 * Miara grupy przełączenia `sprawy` (`lib/przelaczenie/grupy.ts`,
 * `wlaczona: true`): rodzaj „podmiana treści” — pod adresem `/admin/sprawy`
 * stoi ekran „Sprawy do decyzji” w nowej ramce administracji, z kolejką
 * decyzji i sekcją „Sprawy zgłoszone przez prowadzących”. Sprawdzane na
 * zbudowanej aplikacji, z atrapą API przez `page.route` i atrapą sesji:
 * - adres bez zmian, tytuł karty „Sprawy — Niepodzielni”;
 * - dokładnie jeden `main` i jeden `#tresc`, przycisk „Menu” na 390 px,
 *   menu z pozycją „Sprawy” prowadzącą na ten sam adres;
 * - kolejka decyzji i sekcja spraw prowadzących z danymi atrap;
 * - kolejność wierszy od najstarszej sprawy (remis chwili: rodzaj, nazwisko po
 *   polsku), nazwy rodzajów z makiety, „czeka od dziś”;
 * - filtr: „Dyżury” i „Zgłoszenia rekrutacyjne” to odnośniki do swoich ekranów;
 * - metadane spraw prowadzących: poniżej 640 px w osobnych liniach bez „·”,
 *   od 640 px w jednej linii z „·” (pomiar w przeglądarce);
 * - odmowa 403 — ekran „brak uprawnień” bez rekordów;
 * - axe: reguła `heading-order` (tag `best-practice`, włączona jawnie) i cały
 *   skan WCAG — 0 naruszeń na 1280 i 390 px.
 * Zrzuty ekranu powstają tylko przy ustawionej zmiennej `PW_ZRZUTY`
 * (katalog poza repozytorium).
 */

const API = "http://localhost:8000/api/v1";

const ATRAPA_SESJI = {
  accessToken: "atrapa-tokenu-testowego",
  expiresAt: Date.now() + 3_600_000,
};

const META_PUSTA = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

const ZGLOSZENIE = {
  id: 3,
  first_name: "Marta",
  last_name: "Demo",
  created_at: "2026-09-20T10:00:00Z",
};

const DYZUR = {
  id: 5,
  created_at: "2026-09-22T10:00:00Z",
  user: { id: 18, first_name: "Ola", last_name: "Demo" },
};

const SPRAWY_PROWADZACYCH = [
  {
    id: 7,
    subject: "Nieobecność na dyżurze",
    body: "Osoba nie pojawiła się na dwóch dyżurach.\nProszę o kontakt.",
    created_at: "2026-09-01T10:00:00Z",
    reporter: { id: 5, first_name: "Joanna", last_name: "Demo" },
    volunteer: { id: 18, first_name: "Ola", last_name: "Demo" },
  },
  {
    id: 8,
    subject: "Prośba o dodatkowy termin superwizji",
    body: "<script>window.__zlamane = true</script> Sprawa ogólna.",
    created_at: "2026-09-02T12:30:00Z",
    volunteer: null,
  },
];

type TrybSpraw = "dane" | "bogate" | "pusto" | "blad" | "zakaz";

/** Dane do kolejności: remis chwili w trzech rodzajach i sprawa z dzisiaj (patrz test kolejności). */
const REMIS = "2026-09-20T10:00:00Z";
const ZGLOSZENIA_BOGATE = () => [
  { id: 3, first_name: "Marta", last_name: "Demo", created_at: REMIS },
  { id: 4, first_name: "Ewa", last_name: "Żak", created_at: REMIS },
  { id: 5, first_name: "Ola", last_name: "Łukasik", created_at: REMIS },
  { id: 6, first_name: "Dziś", last_name: "Nowak", created_at: new Date().toISOString() },
];
const DYZURY_BOGATE = [
  DYZUR,
  { id: 6, created_at: REMIS, user: { id: 19, first_name: "Filip", last_name: "Kot" } },
];
const PROFILE_BOGATE = [
  { id: 2, created_at: "2026-09-27T10:00:00Z", user: { id: 22, first_name: "Joanna", last_name: "Lis" } },
];

function json(dane: unknown, meta?: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }),
  };
}

/**
 * Atrapy API administracji. Ogólna atrapa (pusta lista) jest rejestrowana
 * PIERWSZA — Playwright wybiera trasę zarejestrowaną PÓŹNIEJ jako pierwszą.
 */
async function instalujAtrapy(page: Page, tryb: TrybSpraw): Promise<void> {
  await page.route(`${API}/**`, (route) => route.fulfill(json([], META_PUSTA)));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(json({ id: 1, role: "project_manager", first_name: "Anna", program_completed_at: null })),
  );
  await page.route(`${API}/notifications**`, (route) =>
    route.fulfill(json([], { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { unread: 0 } })),
  );
  const bogate = tryb === "bogate";
  const pusto = tryb === "pusto";
  const zgloszenia = pusto ? [] : bogate ? ZGLOSZENIA_BOGATE() : [ZGLOSZENIE];
  const dyzury = pusto ? [] : bogate ? DYZURY_BOGATE : [DYZUR];
  const profile = bogate ? PROFILE_BOGATE : [];
  const meta = (lista: unknown[]) => ({ ...META_PUSTA, total: lista.length });
  await page.route(`${API}/admin/applications**`, (route) => route.fulfill(json(zgloszenia, meta(zgloszenia))));
  await page.route(`${API}/admin/internship/pending**`, (route) => route.fulfill(json(dyzury, meta(dyzury))));
  await page.route(`${API}/admin/profiles**`, (route) => route.fulfill(json(profile, meta(profile))));
  await page.route(`${API}/admin/supervision/cases`, (route) => {
    if (pusto) return route.fulfill(json([]));
    if (tryb === "zakaz") {
      return route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: { status: 403, code: "forbidden", message: "Brak uprawnień." } }),
      });
    }
    if (tryb === "blad") {
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { status: 500, code: "server_error", message: "Serwer nie odpowiada." } }),
      });
    }
    return route.fulfill(json(SPRAWY_PROWADZACYCH));
  });

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json({ url: null })));
}

function zbierz404(page: Page): string[] {
  const kody404: string[] = [];
  page.on("response", (res) => {
    if (res.status() === 404) kody404.push(res.url());
  });
  return kody404;
}

async function zrzut(page: Page, nazwa: string): Promise<void> {
  const katalog = process.env.PW_ZRZUTY;
  if (!katalog) return;
  mkdirSync(katalog, { recursive: true });
  // Bez animacji: strzałka zwijanego filtru obraca się przejściem CSS, więc zrzut
  // zrobiony w trakcie obrotu różnił się między biegami o kilkadziesiąt pikseli.
  await page.screenshot({ path: join(katalog, `${nazwa}.png`), fullPage: true, animations: "disabled" });
}

async function headingOrder(page: Page): Promise<string[]> {
  const wynik = await new AxeBuilder({ page }).withRules(["heading-order"]).analyze();
  return wynik.violations.map((w) => `${w.id}: ${w.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

interface PomiarMetadanych {
  elementy: { tekst: string; top: number }[];
  separatory: { display: string; szerokosc: number; wysokosc: number }[];
  separatoryAriaHidden: boolean[];
  /** Linie wzrokowe (grupy po `top`), w których pierwszym albo ostatnim elementem jest „·”. */
  liniiPoczatkuLubKonca: string[];
}

/** Pomiar linii „data · zgłaszający · osoba” każdej sprawy prowadzącego, z `getBoundingClientRect` i `getClientRects`. */
async function pomierzMetadane(page: Page): Promise<PomiarMetadanych[]> {
  return page.evaluate(() => {
    const wynik: PomiarMetadanych[] = [];
    for (const meta of Array.from(document.querySelectorAll<HTMLElement>("[data-testid^='sprawa-prowadzacego-'] p:first-of-type"))) {
      const liscie = Array.from(meta.querySelectorAll<HTMLElement>("span")).filter((el) => el.querySelector("span") === null);
      const separatory = liscie.filter((el) => el.getAttribute("aria-hidden") === "true");
      const tresci = liscie.filter((el) => el.getAttribute("aria-hidden") !== "true");
      const linie = new Map<number, { x: number; tekst: string }[]>();
      for (const el of liscie) {
        for (const prostokat of Array.from(el.getClientRects())) {
          if (prostokat.width === 0 && prostokat.height === 0) continue;
          const top = Math.round(prostokat.top);
          const grupa = linie.get(top) ?? [];
          grupa.push({ x: prostokat.left, tekst: el.textContent ?? "" });
          linie.set(top, grupa);
        }
      }
      const zleLinie: string[] = [];
      for (const [top, grupa] of linie) {
        grupa.sort((a, b) => a.x - b.x);
        if (grupa[0].tekst === "·") zleLinie.push(`linia @${top} zaczyna się od „·”`);
        if (grupa[grupa.length - 1].tekst === "·") zleLinie.push(`linia @${top} kończy się na „·”`);
      }
      wynik.push({
        elementy: tresci.map((el) => ({ tekst: el.textContent ?? "", top: Math.round(el.getBoundingClientRect().top) })),
        separatory: separatory.map((el) => {
          const ramka = el.getBoundingClientRect();
          return { display: getComputedStyle(el).display, szerokosc: ramka.width, wysokosc: ramka.height };
        }),
        separatoryAriaHidden: separatory.map((el) => el.getAttribute("aria-hidden") === "true"),
        liniiPoczatkuLubKonca: zleLinie,
      });
    }
    return wynik;
  });
}

const SZEROKOSCI = [
  { szerokosc: 1280, wysokosc: 800 },
  { szerokosc: 390, wysokosc: 844 },
] as const;

for (const { szerokosc, wysokosc } of SZEROKOSCI) {
  test.describe(`/admin/sprawy — nowy ekran w nowej ramce, ${szerokosc} px`, () => {
    test.use({ viewport: { width: szerokosc, height: wysokosc } });

    test("adres bez zmian, tytuł karty, jeden main, ramka, kolejka i sprawy prowadzących, 0 odpowiedzi 404", async ({ page }, testInfo) => {
      const kody404 = zbierz404(page);
      await instalujAtrapy(page, "dane");

      const odpowiedzStrony = await page.goto("/admin/sprawy");
      await zabezpieczeniePrzedEkranemDostepu(page);

      expect(odpowiedzStrony?.status()).toBe(200);
      await expect(page).toHaveURL(/\/admin\/sprawy$/);
      await expect(page).toHaveTitle("Sprawy — Niepodzielni");
      await expect(page.getByRole("heading", { level: 1, name: "Sprawy do decyzji" })).toBeVisible();

      // Jeden main i jeden cel linku skoku.
      expect(await page.locator("main").count()).toBe(1);
      expect(await page.locator("#tresc").count()).toBe(1);
      await expect(page.locator('a[href="#tresc"]')).toHaveCount(1);

      // Nowa ramka: na 390 px przycisk „Menu”, na 1280 px menu stale widoczne.
      if (szerokosc < 1024) {
        await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeVisible();
      } else {
        await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeHidden();
        const menu = page
          .getByRole("complementary", { name: "Menu i konto" })
          .getByRole("navigation", { name: "Menu — Administracja" });
        await expect(menu.getByRole("link", { name: "Sprawy", exact: true })).toHaveAttribute("href", "/admin/sprawy");
      }

      // Kolejka decyzji: rodzaj i osoba osobno, plakietka „czeka N dni”, akcja „Otwórz”
      // z pełną nazwą dla czytnika; nagłówek listy tylko dla czytnika.
      await expect(page.getByText("Marta Demo", { exact: true })).toBeVisible();
      // Osoba z kolejki (to samo imię stoi też w sekcji spraw prowadzących — stąd zawężenie do wierszy kolejki).
      await expect(page.locator("[data-wariant='z-licznikiem']").getByText("Ola Demo", { exact: true })).toBeVisible();
      await expect(page.getByText(/^czeka \d+ (dni|dzień)$/)).toHaveCount(2);
      await expect(page.getByRole("link", { name: "Otwórz sprawę: Dyżur — Ola Demo" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Otwórz sprawę: Zgłoszenie rekrutacyjne — Marta Demo" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Otwórz najstarszą sprawę" })).toBeVisible();
      await expect(page.getByText(/Najstarsza sprawa czeka \d+ (dni|dzień)\./)).toBeVisible();
      // Nagłówek listy jest w drzewie (czytnik go ma), ale wzrokowo zajmuje 1 px × 1 px, ucięty.
      const naglowekListy = page.getByRole("heading", { level: 2, name: "Sprawy", exact: true });
      await expect(naglowekListy).toHaveCount(1);
      const ramkaNaglowka = await naglowekListy.evaluate((el) => {
        const kontener = el.parentElement!.getBoundingClientRect();
        return { szerokosc: kontener.width, wysokosc: kontener.height, ucieto: getComputedStyle(el.parentElement!).clipPath };
      });
      expect(ramkaNaglowka.szerokosc).toBeLessThanOrEqual(1);
      expect(ramkaNaglowka.wysokosc).toBeLessThanOrEqual(1);
      expect(ramkaNaglowka.ucieto).not.toBe("none");
      // Filtr zwijany, z licznikami rodzajów obecnych w danych.
      const filtr = page.getByRole("button", { name: "Filtr: Wszystkie (2)" });
      await expect(filtr).toHaveAttribute("aria-expanded", "false");
      await filtr.focus();
      await page.keyboard.press("Enter");
      await expect(filtr).toHaveAttribute("aria-expanded", "true");
      // Dyżury i zgłoszenia rekrutacyjne prowadzą na swoje ekrany (odnośniki), nie zawężają listy.
      await expect(page.getByRole("link", { name: "Zgłoszenia rekrutacyjne (1)" })).toHaveAttribute("href", "/admin/nabor");
      await expect(page.getByRole("link", { name: "Dyżury (1)" })).toHaveAttribute("href", "/admin/staz");
      await expect(page.getByRole("button", { name: "Zgłoszenia rekrutacyjne (1)" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Dyżury (1)" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Wszystkie (2)", exact: true })).toHaveAttribute("aria-pressed", "true");
      await page.keyboard.press("Enter");
      await expect(filtr).toHaveAttribute("aria-expanded", "false");

      // Sprawy zgłoszone przez prowadzących.
      await expect(page.getByRole("heading", { level: 2, name: "Sprawy zgłoszone przez prowadzących" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 3, name: "Nieobecność na dyżurze" })).toBeVisible();
      await expect(page.getByText("Zgłosił/a: Joanna Demo")).toBeVisible();
      await expect(page.getByText("Zgłaszający/a nieznany/a")).toBeVisible();
      await expect(page.getByText("Sprawa ogólna — bez wskazania osoby")).toBeVisible();
      // Treść ze znacznikiem jest tekstem; podział wierszy zostaje.
      await expect(page.getByText("<script>window.__zlamane = true</script>", { exact: false })).toBeVisible();
      expect(await page.evaluate(() => (window as unknown as { __zlamane?: boolean }).__zlamane)).toBeUndefined();
      const tresc = page.getByText("Osoba nie pojawiła się na dwóch dyżurach.");
      expect(await tresc.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe("pre-wrap");

      // Bez przewijania w poziomie.
      const przewijanie = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(przewijanie, "przewijanie poziome").toBeLessThanOrEqual(0);

      expect(await headingOrder(page), "heading-order").toEqual([]);
      const naruszenia = await uruchomAxe(page);
      await dolaczNaruszeniaDoRaportu(testInfo, `axe-sprawy-${szerokosc}`, naruszenia);
      expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);

      await zrzut(page, `sprawy-${szerokosc}-dane`);
      expect(kody404, `odpowiedzi 404: ${kody404.join(", ")}`).toEqual([]);
    });

    test("kolejność od najstarszej, nazwy rodzajów, „czeka od dziś”, filtr z odnośnikami, axe 0", async ({ page }, testInfo) => {
      await instalujAtrapy(page, "bogate");
      await page.goto("/admin/sprawy");
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.locator("[data-wariant='z-licznikiem']").first()).toBeVisible();

      // Od najstarszej; remis chwili: rodzaj, potem nazwisko po polsku (Demo < Łukasik < Żak); sprawa z dzisiaj na końcu.
      const nazwy = await page.getByRole("link", { name: /^Otwórz sprawę: / }).evaluateAll((el) =>
        el.map((a) => a.getAttribute("aria-label") ?? a.textContent ?? ""),
      );
      expect(nazwy).toEqual([
        "Otwórz sprawę: Zgłoszenie rekrutacyjne — Marta Demo",
        "Otwórz sprawę: Zgłoszenie rekrutacyjne — Ola Łukasik",
        "Otwórz sprawę: Zgłoszenie rekrutacyjne — Ewa Żak",
        "Otwórz sprawę: Dyżur — Filip Kot",
        "Otwórz sprawę: Dyżur — Ola Demo",
        "Otwórz sprawę: Wniosek o profil psychologa — Joanna Lis",
        "Otwórz sprawę: Zgłoszenie rekrutacyjne — Dziś Nowak",
      ]);
      // Główna akcja prowadzi do pierwszego wiersza.
      const pierwszy = await page.getByRole("link", { name: /^Otwórz sprawę: / }).first().getAttribute("href");
      expect(pierwszy).toBe("/admin/uczestniczki?zakladka=zgloszenia");

      // Sprawa z dzisiaj: „czeka od dziś”, nigdy „czeka 0 dni”.
      await expect(page.getByText("czeka od dziś", { exact: true })).toHaveCount(1);
      await expect(page.getByText("czeka 0 dni")).toHaveCount(0);
      // Najstarsza sprawa czeka kilka dni (liczone z remisu 20 września), podtytuł w tej samej postaci.
      await expect(page.getByText(/Najstarsza sprawa czeka \d+ (dni|dzień)\./)).toBeVisible();
      // Opis ekranu nazywa rodzaje tak jak filtr.
      await expect(
        page.getByText("Zgłoszenia rekrutacyjne, dyżury i wnioski o profil psychologa czekające na Twoją decyzję", { exact: false }),
      ).toBeVisible();

      // Filtr rozwinięty: dwa odnośniki i dwa przyciski.
      await page.getByRole("button", { name: /^Filtr:/ }).click();
      const grupa = page.getByRole("group", { name: "Rodzaj sprawy" });
      await expect(grupa.getByRole("link")).toHaveText(["Zgłoszenia rekrutacyjne (4)", "Dyżury (2)"]);
      await expect(grupa.getByRole("button")).toHaveText(["Wszystkie (7)", "Wnioski o profil psychologa (1)"]);
      await expect(grupa.getByRole("link", { name: "Dyżury (2)" })).toHaveAttribute("href", "/admin/staz");
      await expect(grupa.getByRole("link", { name: "Zgłoszenia rekrutacyjne (4)" })).toHaveAttribute("href", "/admin/nabor");
      await zrzut(page, `sprawy-${szerokosc}-bogate-filtr`);

      const naruszenia = await uruchomAxe(page);
      await dolaczNaruszeniaDoRaportu(testInfo, `axe-sprawy-bogate-${szerokosc}`, naruszenia);
      expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);
      expect(await headingOrder(page), "heading-order").toEqual([]);
    });

    test("stan pusty: „Brak spraw do decyzji”, axe 0, heading-order 0", async ({ page }, testInfo) => {
      await instalujAtrapy(page, "pusto");
      await page.goto("/admin/sprawy");
      await zabezpieczeniePrzedEkranemDostepu(page);

      await expect(page.getByText("Brak spraw do decyzji")).toBeVisible();
      await expect(page.getByText("Brak spraw zgłoszonych przez prowadzących.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Otwórz najstarszą sprawę" })).toHaveCount(0);
      expect(await page.locator("main").count()).toBe(1);

      expect(await headingOrder(page), "heading-order").toEqual([]);
      const naruszenia = await uruchomAxe(page);
      await dolaczNaruszeniaDoRaportu(testInfo, `axe-sprawy-pusto-${szerokosc}`, naruszenia);
      expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);
      await zrzut(page, `sprawy-${szerokosc}-pusto`);
    });

    test("metadane spraw prowadzących: układ zależny od progu 640 px (pomiar w przeglądarce)", async ({ page }) => {
      await instalujAtrapy(page, "dane");
      await page.goto("/admin/sprawy");
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.getByTestId("sprawa-prowadzacego-7")).toBeVisible();

      const pomiar = await pomierzMetadane(page);
      console.log(`Pomiar układu metadanych spraw prowadzących /admin/sprawy @${szerokosc} ${JSON.stringify(pomiar)}`);
      for (const sprawa of pomiar) {
        expect(sprawa.elementy, "data, zgłaszający, osoba").toHaveLength(3);
        expect(sprawa.liniiPoczatkuLubKonca, "linia zaczynająca się albo kończąca na „·”").toEqual([]);
        if (szerokosc < 640) {
          // Każdy element w osobnej linii, bez separatora.
          expect(new Set(sprawa.elementy.map((e) => e.top)).size, "osobne linie").toBe(3);
          expect(sprawa.separatory.map((x) => x.display), "separatory ukryte").toEqual(["none", "none"]);
        } else {
          // Jedna linia z „·” między elementami.
          expect(new Set(sprawa.elementy.map((e) => e.top)).size, "jedna linia").toBe(1);
          expect(sprawa.separatory.map((x) => x.display), "separatory widoczne").not.toContain("none");
          expect(sprawa.separatory.every((x) => x.szerokosc > 0 && x.wysokosc > 0), "separator ma rozmiar").toBe(true);
        }
        // Separator zostaje ukryty przed czytnikiem.
        expect(sprawa.separatoryAriaHidden).toEqual([true, true]);
      }
      await zrzut(page, `sprawy-${szerokosc}-prowadzacych`);
    });

    test("margines boczny treści: odstęp h1 i wiersza od krawędzi jak na innych ekranach ramki", async ({ page }) => {
      await instalujAtrapy(page, "dane");
      await page.goto("/admin/sprawy");
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.locator("[data-wariant='z-licznikiem']").first()).toBeVisible();

      const pomiar = await page.evaluate(() => {
        const szerokosc = document.documentElement.clientWidth;
        const h1 = document.querySelector("h1")!.getBoundingClientRect();
        const wiersz = document.querySelector("[data-wariant='z-licznikiem']")!.getBoundingClientRect();
        const tekst = document.querySelector("[data-wariant='z-licznikiem']")!.firstElementChild!.getBoundingClientRect();
        return {
          h1Lewy: Math.round(h1.left),
          wierszPrawy: Math.round(szerokosc - wiersz.right),
          wierszLewy: Math.round(wiersz.left),
          tekstLewy: Math.round(tekst.left),
        };
      });
      console.log(`POMIAR-MARGINESU /admin/sprawy @${szerokosc} ${JSON.stringify(pomiar)}`);
      if (szerokosc < 1024) {
        expect(pomiar.h1Lewy, "odstęp lewy h1").toBeGreaterThanOrEqual(16);
        expect(pomiar.h1Lewy, "odstęp lewy h1").toBeLessThanOrEqual(18);
        expect(pomiar.wierszPrawy, "odstęp prawy wiersza").toBeGreaterThanOrEqual(16);
        expect(pomiar.wierszPrawy, "odstęp prawy wiersza").toBeLessThanOrEqual(18);
      }
      // Wiersz bez wcięcia: tekst wiersza równo z h1.
      expect(pomiar.wierszLewy, "wiersz równo z h1").toBe(pomiar.h1Lewy);
      expect(pomiar.tekstLewy, "treść wiersza równo z h1").toBe(pomiar.h1Lewy);
    });

    test("błąd sekcji spraw prowadzących: kolejka działa, ponowienie, heading-order 0", async ({ page }) => {
      await instalujAtrapy(page, "blad");

      await page.goto("/admin/sprawy");
      await zabezpieczeniePrzedEkranemDostepu(page);

      await expect(page.getByText("Marta Demo", { exact: true })).toBeVisible();
      await expect(page.getByText("Nie udało się wczytać spraw zgłoszonych przez prowadzących")).toBeVisible();
      await expect(page.getByText("Serwer nie odpowiada.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Spróbuj ponownie" })).toBeVisible();
      expect(await page.locator("main").count()).toBe(1);
      expect(await headingOrder(page), "heading-order").toEqual([]);
      await zrzut(page, `sprawy-${szerokosc}-blad-sekcji`);
    });

    test("odmowa 403: ekran „brak uprawnień”, bez rekordów kolejki i spraw prowadzących, jeden main", async ({ page }) => {
      await instalujAtrapy(page, "zakaz");

      await page.goto("/admin/sprawy");
      await zabezpieczeniePrzedEkranemDostepu(page);

      await expect(page.getByText("Ta funkcja jest dostępna tylko dla administracji.")).toBeVisible();
      await expect(page.getByText("Marta Demo", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Nieobecność na dyżurze")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Sprawy zgłoszone przez prowadzących" })).toHaveCount(0);
      expect(await page.locator("main").count()).toBe(1);
      expect(await page.locator("#tresc").count()).toBe(1);
    });
  });
}

// Granica progu 640 px: tuż poniżej separatory znikają, od progu stoją w jednej linii.
for (const { szerokosc, ukryte } of [
  { szerokosc: 639, ukryte: true },
  { szerokosc: 640, ukryte: false },
] as const) {
  test.describe(`/admin/sprawy — granica progu 640 px, ${szerokosc} px`, () => {
    test.use({ viewport: { width: szerokosc, height: 844 } });

    test(ukryte ? "poniżej progu: osobne linie, separatory ukryte" : "od progu: jedna linia, separatory widoczne", async ({ page }) => {
      await instalujAtrapy(page, "dane");
      await page.goto("/admin/sprawy");
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.getByTestId("sprawa-prowadzacego-7")).toBeVisible();

      const pomiar = await pomierzMetadane(page);
      console.log(`Pomiar układu metadanych spraw prowadzących /admin/sprawy @${szerokosc} ${JSON.stringify(pomiar)}`);
      for (const sprawa of pomiar) {
        expect(new Set(sprawa.elementy.map((e) => e.top)).size).toBe(ukryte ? 3 : 1);
        expect(sprawa.separatory.map((x) => x.display).includes("none")).toBe(ukryte);
        expect(sprawa.liniiPoczatkuLubKonca).toEqual([]);
      }
    });
  });
}
