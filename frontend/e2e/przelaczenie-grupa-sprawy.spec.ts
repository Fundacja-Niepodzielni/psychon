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
const META_JEDEN = { current_page: 1, per_page: 100, total: 1, last_page: 1 };

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

type TrybSpraw = "dane" | "blad" | "zakaz";

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
  await page.route(`${API}/admin/applications**`, (route) => route.fulfill(json([ZGLOSZENIE], META_JEDEN)));
  await page.route(`${API}/admin/internship/pending**`, (route) => route.fulfill(json([DYZUR], META_JEDEN)));
  await page.route(`${API}/admin/profiles**`, (route) => route.fulfill(json([], META_PUSTA)));
  await page.route(`${API}/admin/supervision/cases`, (route) => {
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
  await page.screenshot({ path: join(katalog, `${nazwa}.png`), fullPage: true });
}

async function headingOrder(page: Page): Promise<string[]> {
  const wynik = await new AxeBuilder({ page }).withRules(["heading-order"]).analyze();
  return wynik.violations.map((w) => `${w.id}: ${w.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
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

      // Kolejka decyzji.
      await expect(page.getByText("Zgłoszenie — Marta Demo")).toBeVisible();
      await expect(page.getByText("Dyżur — Ola Demo")).toBeVisible();
      await expect(page.getByRole("button", { name: "Otwórz najstarszą sprawę" })).toBeVisible();

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

    test("błąd sekcji spraw prowadzących: kolejka działa, ponowienie, heading-order 0", async ({ page }) => {
      await instalujAtrapy(page, "blad");

      await page.goto("/admin/sprawy");
      await zabezpieczeniePrzedEkranemDostepu(page);

      await expect(page.getByText("Zgłoszenie — Marta Demo")).toBeVisible();
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
      await expect(page.getByText("Zgłoszenie — Marta Demo")).toHaveCount(0);
      await expect(page.getByText("Nieobecność na dyżurze")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Sprawy zgłoszone przez prowadzących" })).toHaveCount(0);
      expect(await page.locator("main").count()).toBe(1);
      expect(await page.locator("#tresc").count()).toBe(1);
    });
  });
}
