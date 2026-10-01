import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";

/**
 * Stopka „Razem” listy „Co czeka na decyzję” na pulpicie administracji:
 * - od 640 px (miara przy 1280) liczba „Razem” stoi w kolumnie liczb wierszy:
 *   prawa krawędź liczby jest równa prawej krawędzi liczb wierszy (±1 px), a przy
 *   liczbach o tej samej szerokości (jednocyfrowe, ta sama jednostka) także lewa;
 * - axe (WCAG 2.1 AA) na pulpicie przy 1280 i 390 px: bez naruszeń;
 * - poniżej 640 px (miara przy 390) stopka nie zmienia się: styl obliczony stopki i
 *   jej liczby oraz prostokąty są takie jak w stanie bazowym, a puste miejsce po akcji
 *   w stopce nie zajmuje miejsca.
 *
 * Atrapy API jak w `pulpit-administracji-390.spec.ts`. Zmienne środowiska (wszystkie
 * opcjonalne, bez nich spec tylko sprawdza krawędzie liczb):
 * - `PW_ZRZUTY` + `PW_ZRZUT_ETYKIETA`: zrzut okna przeglądarki po przewinięciu do stopki;
 * - `PW_POMIAR`: katalog zapisu pomiaru stopki przy 390 (`stopka-390.json`);
 * - `PW_POMIAR_BAZA`: katalog z takim samym plikiem ze stanu bazowego, z którym pomiar
 *   z tego biegu musi być identyczny.
 */

const ATRAPA_SESJI = { accessToken: "atrapa-tokenu-testowego", expiresAt: Date.now() + 3_600_000 };

interface DanePulpitu {
  counters: { participants: number; completed: number; certificates: number };
  queues: { key: string; count: number; link: string }[];
}

function pulpit(liczby: [number, number, number, number]): DanePulpitu {
  const klucze = ["applications", "internship_entries", "profiles", "questions"];
  const linki = ["/admin/uczestniczki", "/admin/staz", "/admin/profile", "/prowadzacy/pytania"];
  return {
    counters: { participants: 5, completed: 7, certificates: 9 },
    queues: klucze.map((key, i) => ({ key, count: liczby[i], link: linki[i] })),
  };
}

/** Wszystkie liczby od 5 w górę lub 0 („spraw”); suma 21 ma dwie cyfry. */
const DWUCYFROWA_SUMA = pulpit([5, 7, 0, 9]);
/** Jedna sprawa na jednym wierszu: wszędzie jednocyfrowe „spraw”, suma 5 — te same szerokości liczb. */
const JEDNOCYFROWE = pulpit([5, 0, 0, 0]);

const NAZWY = [
  "Zgłoszenia rekrutacyjne",
  "Dyżury czekające na decyzję",
  "Profile prowadzących do decyzji",
  "Pytania bez odpowiedzi",
];

async function instalujAtrapy(page: Page, dane: DanePulpitu): Promise<void> {
  // Ogólna atrapa pierwsza: Playwright bierze trasę zarejestrowaną PÓŹNIEJ jako pierwszą.
  await page.route("http://localhost:8000/api/v1/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [], meta: { current_page: 1, per_page: 25, total: 0, last_page: 1 } }),
    }),
  );
  await page.route("http://localhost:8000/api/v1/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { id: 1, role: "project_manager", program_completed_at: null } }),
    }),
  );
  await page.route("http://localhost:8000/api/v1/admin/dashboard", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: dane }) }),
  );
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { url: null } }) }),
  );
}

function listaSpraw(page: Page): Locator {
  return page.getByRole("region", { name: "Co czeka na decyzję" });
}

/** Stopka listy: element z napisem „Razem” i liczbą sumy. */
function stopka(page: Page, suma: number): Locator {
  return listaSpraw(page).getByText(new RegExp(`^Razem\\s*${suma}\\s*spraw$`));
}

async function krawedzie(liczba: Locator, opis: string): Promise<{ lewa: number; prawa: number }> {
  const pudelko = await liczba.boundingBox();
  expect(pudelko, opis).not.toBeNull();
  return { lewa: pudelko!.x, prawa: pudelko!.x + pudelko!.width };
}

async function otworz(page: Page, dane: DanePulpitu, suma: number): Promise<Locator> {
  await instalujAtrapy(page, dane);
  await page.goto("/admin");
  await zabezpieczeniePrzedEkranemDostepu(page);
  await expect(page.getByRole("heading", { level: 1, name: "Pulpit administracji" })).toBeVisible();
  const pasek = stopka(page, suma);
  await expect(pasek).toBeVisible();
  await pasek.scrollIntoViewIfNeeded();
  return pasek;
}

async function zrzutOkna(page: Page, szerokosc: number): Promise<void> {
  const katalog = process.env.PW_ZRZUTY;
  if (!katalog) return;
  mkdirSync(katalog, { recursive: true });
  const etykieta = process.env.PW_ZRZUT_ETYKIETA ?? "bieg";
  // Zrzut okna przeglądarki (nie całej strony), po przewinięciu do stopki listy.
  await page.screenshot({ path: join(katalog, `${etykieta}-admin-${szerokosc}.png`) });
}

test.describe("pulpit administracji 1280 px — liczba „Razem” w kolumnie liczb wierszy", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const [opis, dane, suma, takaSamaSzerokosc] of [
    ["suma dwucyfrowa (21): prawa krawędź liczby w kolumnie sąsiadów", DWUCYFROWA_SUMA, 21, false],
    ["liczby jednocyfrowe (suma 5): lewa i prawa krawędź liczby w kolumnie sąsiadów", JEDNOCYFROWE, 5, true],
  ] as const) {
    test(opis, async ({ page }) => {
      const pasek = await otworz(page, dane, suma);
      await zrzutOkna(page, 1280);

      const liczbaRazem = await krawedzie(pasek.getByText(/^\d+\s*spraw$/), "liczba w stopce „Razem”");
      let sprawdzone = 0;
      for (const nazwa of NAZWY) {
        const wiersz = listaSpraw(page).locator('[data-wariant="z-licznikiem"]').filter({ hasText: nazwa });
        const sasiad = await krawedzie(wiersz.getByText(/^\d+\s*spraw$/), `liczba w wierszu „${nazwa}”`);
        expect(
          Math.abs(liczbaRazem.prawa - sasiad.prawa),
          `prawa krawędź liczby: „Razem” (${liczbaRazem.prawa}) a „${nazwa}” (${sasiad.prawa})`,
        ).toBeLessThanOrEqual(1);
        if (takaSamaSzerokosc) {
          expect(
            Math.abs(liczbaRazem.lewa - sasiad.lewa),
            `lewa krawędź liczby: „Razem” (${liczbaRazem.lewa}) a „${nazwa}” (${sasiad.lewa})`,
          ).toBeLessThanOrEqual(1);
        }
        sprawdzone += 1;
      }
      expect(sprawdzone, "porównane wiersze").toBe(NAZWY.length);
    });
  }
});

test.describe("pulpit administracji 390 px — stopka „Razem” bez zmian", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("styl obliczony stopki, jej liczby i prostokąty są takie jak w stanie bazowym", async ({ page }) => {
    const pasek = await otworz(page, DWUCYFROWA_SUMA, 21);
    await zrzutOkna(page, 390);

    // Puste miejsce po akcji (jeśli stopka je ma) nie zajmuje miejsca poniżej 640 px.
    const miejsca = pasek.locator('[aria-hidden="true"]');
    for (let i = 0; i < (await miejsca.count()); i += 1) {
      const element = miejsca.nth(i);
      expect(await element.evaluate((el) => getComputedStyle(el).display), "puste miejsce po akcji w stopce").toBe("none");
    }

    const pomiar = await pasek.evaluate((el) => {
      const styl = (cel: Element) => {
        const obliczony = getComputedStyle(cel);
        const wynik: Record<string, string> = {};
        for (let i = 0; i < obliczony.length; i += 1) {
          const nazwa = obliczony[i];
          wynik[nazwa] = obliczony.getPropertyValue(nazwa);
        }
        return wynik;
      };
      const prostokat = (cel: Element) => {
        const p = cel.getBoundingClientRect();
        return { x: p.x + window.scrollX, y: p.y + window.scrollY, width: p.width, height: p.height };
      };
      const napis = Array.from(el.querySelectorAll("span")).find((s) => s.textContent === "Razem");
      const liczba = Array.from(el.querySelectorAll("span")).find((s) => /^\d+\s*spraw$/.test(s.textContent ?? ""));
      return {
        stopka: { styl: styl(el), prostokat: prostokat(el) },
        napis: napis ? { styl: styl(napis), prostokat: prostokat(napis) } : null,
        liczba: liczba ? { styl: styl(liczba), prostokat: prostokat(liczba) } : null,
      };
    });
    expect(pomiar.napis, "napis „Razem” w stopce").not.toBeNull();
    expect(pomiar.liczba, "liczba w stopce").not.toBeNull();

    const katalog = process.env.PW_POMIAR;
    if (katalog) {
      mkdirSync(katalog, { recursive: true });
      writeFileSync(join(katalog, "stopka-390.json"), JSON.stringify(pomiar, null, 1), "utf8");
    }
    const baza = process.env.PW_POMIAR_BAZA;
    if (baza) {
      const wzorzec = JSON.parse(readFileSync(join(baza, "stopka-390.json"), "utf8"));
      expect(pomiar).toEqual(wzorzec);
    }
  });
});

for (const [szerokosc, wysokosc] of [
  [1280, 800],
  [390, 844],
] as const) {
  test.describe(`pulpit administracji ${szerokosc} px — dostępność`, () => {
    test.use({ viewport: { width: szerokosc, height: wysokosc } });

    test("axe: pulpit z listą i stopką „Razem” bez naruszeń", async ({ page }, testInfo) => {
      await otworz(page, DWUCYFROWA_SUMA, 21);
      const naruszenia = await uruchomAxe(page);
      await dolaczNaruszeniaDoRaportu(testInfo, `axe-admin-${szerokosc}`, naruszenia);
      console.log(`POMIAR-AXE admin @${szerokosc}: ${naruszenia.length} naruszeń`);
      expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);
    });
  });
}
