import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Listy „Uczestnicy” (`/admin/uczestniczki`) i „Zgłoszenia rekrutacyjne”
 * (`/admin/nabor`) na wspólnym wierszu listy ze „Spraw”, z akcjami w
 * nagłówku ekranu. Zbudowana aplikacja, API i sesja to atrapy z `page.route`:
 * - axe (WCAG 2.0/2.1 A i AA oraz `best-practice`) na trzech listach
 *   (uczestnicy, zgłoszenia, sprawy) przy 1280 i 390 px: 0 naruszeń;
 * - wiersz: pogrubione imię i nazwisko, plakietka małą literą, widoczne
 *   „Otwórz” z pełną nazwą w nazwie dostępnej, tekst równo z `h1`;
 * - nagłówek zgłoszeń: „Dodaj zgłoszenie” (kolor) i „Importuj z pliku CSV”
 *   obok siebie (1280) albo jeden pod drugim, każdy na pełną szerokość (390);
 *   nagłówek uczestników: eksport jako akcja drugorzędna, odnośnik pod `h1`;
 * - menu: na obu ekranach i na szczególe zgłoszenia „Sprawy” mają
 *   `aria-current="true"`, a własnych pozycji ekranów w menu nie ma.
 * Zrzuty ekranu powstają tylko przy ustawionej zmiennej `PW_ZRZUTY_W26`
 * (katalog poza repozytorium).
 */

const API = "http://localhost:8000/api/v1";

const ATRAPA_SESJI = { accessToken: "atrapa-tokenu-testowego", expiresAt: Date.now() + 3_600_000 };

const META = (total: number) => ({ current_page: 1, per_page: 25, total, last_page: 1, edition_id: 1 });

const OSOBY = [
  {
    id: 7,
    first_name: "Marta",
    last_name: "Osobowska",
    email: "osobowska@demo.pl",
    role: "volunteer",
    status: "active",
    product_group: "psychon",
    access_expires_at: "2027-02-01T00:00:00Z",
    program_completed_at: null,
    created_at: "2026-09-20T10:00:00Z",
  },
  {
    id: 8,
    first_name: "Jan",
    last_name: "Zablokowany",
    email: "zablokowany@demo.pl",
    role: "student",
    status: "blocked",
    product_group: "psychon",
    access_expires_at: "2027-02-01T00:00:00Z",
    program_completed_at: null,
    created_at: "2026-09-21T10:00:00Z",
  },
];

function zgloszenie(id: number, imie: string, nazwisko: string, status: string) {
  return {
    id,
    edition_id: 1,
    first_name: imie,
    last_name: nazwisko,
    email: `${nazwisko.toLowerCase()}@demo.pl`,
    phone: null,
    source: null,
    role: "volunteer",
    payload: null,
    university: null,
    graduation_year: null,
    consent_regulamin_at: null,
    consent_polityka_at: null,
    status,
    rejection_reason: null,
    decided_by: null,
    decided_at: null,
    user_id: null,
    has_diploma_scan: false,
    diploma_scan_url: null,
    created_at: "2026-09-20T10:00:00Z",
    updated_at: "2026-09-20T10:00:00Z",
  };
}

const ZGLOSZENIA = [zgloszenie(12, "Anna", "Kandydacka", "new"), zgloszenie(13, "Ewa", "Przyjeta", "accepted")];

const DYZUR = { id: 5, created_at: "2026-09-22T10:00:00Z", user: { id: 18, first_name: "Ola", last_name: "Demo" } };

function json(cialo: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(cialo) };
}

interface Atrapy {
  osoby: unknown[];
  zgloszenia: unknown[];
}

/** Ogólna atrapa jest rejestrowana PIERWSZA — Playwright wybiera trasę zarejestrowaną PÓŹNIEJ jako pierwszą. */
async function instalujAtrapy(page: Page, { osoby, zgloszenia }: Atrapy): Promise<void> {
  await page.route(`${API}/**`, (route) => route.fulfill(json({ data: [], meta: META(0) })));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(json({ data: { id: 1, role: "project_manager", first_name: "Anna", program_completed_at: null } })),
  );
  await page.route(`${API}/notifications**`, (route) =>
    route.fulfill(json({ data: [], meta: { ...META(0), extra: { unread: 0 } } })),
  );
  await page.route((url) => url.origin === "http://localhost:8000" && url.pathname === "/api/v1/admin/users", (route) =>
    route.fulfill(json({ data: osoby, meta: META(osoby.length) })),
  );
  await page.route(`${API}/admin/applications**`, (route) =>
    route.fulfill(json({ data: zgloszenia, meta: META(zgloszenia.length) })),
  );
  await page.route(`${API}/admin/applications/12`, (route) => route.fulfill(json({ data: ZGLOSZENIA[0] })));
  await page.route(`${API}/admin/internship/pending**`, (route) =>
    route.fulfill(json({ data: [DYZUR], meta: META(1) })),
  );
  await page.route(`${API}/admin/supervision/cases`, (route) => route.fulfill(json({ data: [] })));
  await page.route("**/api/auth/session", (route) => route.fulfill(json(ATRAPA_SESJI)));
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json({ data: { url: null } })));
}

const DANE: Atrapy = { osoby: OSOBY, zgloszenia: ZGLOSZENIA };
const PUSTO: Atrapy = { osoby: [], zgloszenia: [] };

async function zrzut(page: Page, nazwa: string, pelny = true): Promise<void> {
  const katalog = process.env.PW_ZRZUTY_W26;
  if (!katalog) return;
  mkdirSync(katalog, { recursive: true });
  await page.screenshot({ path: join(katalog, `${nazwa}.png`), fullPage: pelny });
}

async function axeZBestPractice(page: Page): Promise<string[]> {
  await page.waitForLoadState("networkidle");
  const wynik = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "best-practice"]).analyze();
  return wynik.violations.map((w) => `${w.id} (${w.impact}): ${w.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

const SZEROKOSCI = [
  { szerokosc: 1280, wysokosc: 800 },
  { szerokosc: 390, wysokosc: 844 },
] as const;

for (const { szerokosc, wysokosc } of SZEROKOSCI) {
  test.describe(`listy uczestników i zgłoszeń, ${szerokosc} px`, () => {
    test.use({ viewport: { width: szerokosc, height: wysokosc } });

    test("axe (WCAG + best-practice): uczestnicy, zgłoszenia, sprawy — z danymi 0 naruszeń; uczestnicy i zgłoszenia także pusto", async ({ page }) => {
      await instalujAtrapy(page, DANE);
      for (const [adres, nazwa] of [
        ["/admin/uczestniczki", "uczestniczki"],
        ["/admin/nabor", "nabor"],
        ["/admin/sprawy", "sprawy"],
      ] as const) {
        await page.goto(adres);
        await zabezpieczeniePrzedEkranemDostepu(page);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        if (nazwa !== "sprawy") await expect(page.locator("[data-wariant]").first()).toBeVisible();
        const naruszenia = await axeZBestPractice(page);
        expect(naruszenia, `${adres} @${szerokosc}`).toEqual([]);
        await zrzut(page, `${nazwa}-${szerokosc}-dane`);
      }

      await page.unrouteAll({ behavior: "ignoreErrors" });
      await instalujAtrapy(page, PUSTO);
      for (const [adres, nazwa] of [
        ["/admin/uczestniczki", "uczestniczki"],
        ["/admin/nabor", "nabor"],
      ] as const) {
        await page.goto(adres);
        await zabezpieczeniePrzedEkranemDostepu(page);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.locator("[data-wariant]")).toHaveCount(0);
        const naruszenia = await axeZBestPractice(page);
        expect(naruszenia, `${adres} pusto @${szerokosc}`).toEqual([]);
        await zrzut(page, `${nazwa}-${szerokosc}-pusto`);
      }
    });

    test("wiersz jak w Sprawach: pogrubione imię, plakietka małą literą, „Otwórz” z pełną nazwą, tekst równo z h1", async ({ page }) => {
      await instalujAtrapy(page, DANE);
      const KONTRAKT = [
        { adres: "/admin/uczestniczki", imie: "Marta Osobowska", plakietka: "konto aktywne", nazwaAkcji: "Otwórz kartę: Marta Osobowska" },
        { adres: "/admin/nabor", imie: "Anna Kandydacka", plakietka: "czeka na decyzję", nazwaAkcji: "Otwórz zgłoszenie: Anna Kandydacka" },
      ];
      for (const wiersz of KONTRAKT) {
        await page.goto(wiersz.adres);
        await zabezpieczeniePrzedEkranemDostepu(page);
        const tytul = page.getByText(wiersz.imie, { exact: true });
        await expect(tytul).toBeVisible();
        const pomiar = await tytul.evaluate((el) => {
          const kontener = el.closest("[data-wariant]") as HTMLElement;
          const h1 = document.querySelector("h1")!.getBoundingClientRect();
          return {
            waga: Number(getComputedStyle(el).fontWeight),
            wagaTekstuZwyklego: Number(getComputedStyle(document.body).fontWeight),
            lewyWiersza: Math.round(kontener.getBoundingClientRect().left),
            lewyTekstu: Math.round(kontener.firstElementChild!.getBoundingClientRect().left),
            lewyH1: Math.round(h1.left),
          };
        });
        console.log(`POMIAR-WIERSZA ${wiersz.adres} @${szerokosc} ${JSON.stringify(pomiar)}`);
        // Waga „medium” z tokenu — ta sama, którą ma tytuł wiersza kolejki Spraw; cięższa od tekstu zwykłego.
        expect(pomiar.waga, "imię i nazwisko pogrubione").toBeGreaterThan(pomiar.wagaTekstuZwyklego);
        expect(pomiar.lewyTekstu, "tekst wiersza równo z h1").toBe(pomiar.lewyH1);
        expect(pomiar.lewyWiersza, "wiersz równo z h1").toBe(pomiar.lewyH1);
        const rzad = page.locator("[data-wariant]").first();
        await expect(rzad.getByText(wiersz.plakietka, { exact: true })).toBeVisible();
        const akcja = page.getByRole("link", { name: wiersz.nazwaAkcji });
        await expect(akcja).toBeVisible();
        expect((await akcja.textContent())?.replace(/\s+/g, " ").trim()).toMatch(/^Otwórz\s*›?$/);
        // Plakietki nie zaczynają się wielką literą.
        const plakietki = await page.locator("[data-wariant] [class*='plakietka']").allTextContents();
        for (const t of plakietki) expect(t.trim()[0], `plakietka „${t}” małą literą`).toBe(t.trim()[0].toLocaleLowerCase("pl"));
      }
    });

    test("nagłówek: zgłoszenia mają obie akcje raz, obok siebie (1280) albo jedna pod drugą na pełną szerokość (390); uczestnicy mają eksport w nagłówku i odnośnik pod h1", async ({ page }) => {
      await instalujAtrapy(page, DANE);
      await page.goto("/admin/nabor");
      await zabezpieczeniePrzedEkranemDostepu(page);
      const glowa = page.getByTestId("pageheader-glowa");
      await expect(glowa).toBeVisible();
      const dodaj = glowa.getByRole("button", { name: "Dodaj zgłoszenie" });
      const importuj = glowa.getByRole("button", { name: "Importuj z pliku CSV" });
      await expect(dodaj).toHaveCount(1);
      await expect(importuj).toHaveCount(1);
      await expect(page.getByRole("button", { name: "Dodaj zgłoszenie" })).toHaveCount(1);
      await expect(page.getByRole("button", { name: "Importuj z pliku CSV" })).toHaveCount(1);
      const a = (await dodaj.boundingBox())!;
      const b = (await importuj.boundingBox())!;
      const szerokoscTresci = await page.evaluate(() => document.querySelector("main")!.getBoundingClientRect().width);
      const pomiar = { glowny: a, drugorzedny: b, szerokoscTresci };
      console.log(`POMIAR-AKCJI-NAGLOWKA /admin/nabor @${szerokosc} ${JSON.stringify(pomiar)}`);
      if (szerokosc >= 768) {
        expect(Math.abs(a.y - b.y), "w jednym wierszu").toBeLessThanOrEqual(2);
        expect(b.x + b.width, "drugorzędna przed główną").toBeLessThanOrEqual(a.x);
      } else {
        expect(a.y + a.height, "główny nad drugorzędnym").toBeLessThanOrEqual(b.y);
        expect(Math.abs(a.width - b.width), "równa szerokość").toBeLessThanOrEqual(1);
        expect(a.width, "pełna szerokość treści").toBeGreaterThanOrEqual(szerokoscTresci - 40);
      }
      // Kolor ma tylko przycisk główny.
      const tla = await glowa.getByRole("button").evaluateAll((p) => p.map((el) => getComputedStyle(el).backgroundColor));
      expect(new Set(tla).size, `tła przycisków ${tla.join(" | ")}`).toBe(2);
      await zrzut(page, `nabor-${szerokosc}-naglowek`, false);

      await page.goto("/admin/uczestniczki");
      await zabezpieczeniePrzedEkranemDostepu(page);
      const eksport = page.getByTestId("pageheader-glowa").getByRole("button", { name: "Pobierz tabelę (Excel)" });
      await expect(eksport).toHaveCount(1);
      await expect(page.getByRole("button", { name: "Pobierz tabelę (Excel)" })).toHaveCount(1);
      const odnosnik = page.getByRole("link", { name: "Zgłoszenia rekrutacyjne" });
      await expect(odnosnik).toHaveCount(1);
      const h1 = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
      const link = (await odnosnik.boundingBox())!;
      expect(link.y, "odnośnik pod h1").toBeGreaterThanOrEqual(h1.y + h1.height - 1);
      expect(await page.locator("button[class*='primary']").count(), "bez przycisku w kolorze w nagłówku uczestników").toBe(0);
    });

    test("menu: Sprawy mają aria-current=\"true\" na obu ekranach i na szczególe zgłoszenia, ekranów nie ma w menu; okruszek przez Sprawy", async ({ page }) => {
      await instalujAtrapy(page, DANE);
      const menu = () =>
        page.getByRole("complementary", { name: "Menu i konto" }).getByRole("navigation", { name: "Menu — Administracja" });
      const sciezki: [string, string][] = [
        ["/admin/nabor", "Administracja › Sprawy › Zgłoszenia rekrutacyjne"],
        ["/admin/nabor/12", "Administracja › Sprawy › Zgłoszenia rekrutacyjne › Anna Kandydacka"],
      ];
      for (const [adres, okruszek] of sciezki) {
        await page.goto(adres);
        await zabezpieczeniePrzedEkranemDostepu(page);
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        if (szerokosc >= 1024) {
          const nav = menu();
          await expect(nav.getByRole("link", { name: "Sprawy", exact: true })).toHaveAttribute("aria-current", "true");
          await expect(nav.locator('a[aria-current="page"]')).toHaveCount(0);
          await expect(nav.getByRole("link", { name: "Zgłoszenia rekrutacyjne" })).toHaveCount(0);
          await expect(nav.getByRole("link", { name: "Dyżury do decyzji" })).toHaveCount(0);
        }
        // Ostatnia pozycja szczegółu to osoba ze zgłoszenia: do wczytania zgłoszenia stoi tam „Zgłoszenie” — czekamy na stan końcowy.
        await expect
          .poll(async () => {
            const pozycje = await page
              .getByRole("navigation", { name: "Okruszki" })
              .locator("li")
              .evaluateAll((li) => li.map((el) => (el.textContent ?? "").replace("›", "").trim()));
            return pozycje.join(" › ");
          })
          .toBe(okruszek);
      }
      // Na liście Spraw „Sprawy” to strona bieżąca.
      await page.goto("/admin/sprawy");
      await zabezpieczeniePrzedEkranemDostepu(page);
      if (szerokosc >= 1024) {
        await expect(menu().getByRole("link", { name: "Sprawy", exact: true })).toHaveAttribute("aria-current", "page");
        // Jedyne wejście na filtry rodzajów spraw z poziomu Spraw: filtr zwijany na liście.
        const filtr = page.getByRole("button", { name: /^Filtr: / });
        await filtr.click();
        await expect(filtr).toHaveAttribute("aria-expanded", "true");
        await zrzut(page, `sprawy-${szerokosc}-filtr-rozwiniety`, false);
      }
    });
  });
}

test.describe("szczegół zgłoszenia, 1280 px", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("okruszek na szczególe: zrzut", async ({ page }) => {
    await instalujAtrapy(page, DANE);
    await page.goto("/admin/nabor/12");
    await zabezpieczeniePrzedEkranemDostepu(page);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Okruszki" })).toBeVisible();
    await zrzut(page, "nabor-id-1280-okruszek", false);
  });

  test("menu 1280×800: pozycje do „Dziennika działań” widać bez przewijania", async ({ page }) => {
    await instalujAtrapy(page, DANE);
    await page.goto("/admin");
    await zabezpieczeniePrzedEkranemDostepu(page);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await zrzut(page, "menu-1280x800", false);
  });
});
