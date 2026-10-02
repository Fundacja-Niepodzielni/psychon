import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Pytanie o niezapisane zmiany we wspólnej ramie panelu, na zbudowanej aplikacji,
 * na ekranie „Formy stażu” (`/admin/formy-stazu`), w dwóch szerokościach:
 * - bez zmiany w formularzu zamknięcie karty nie jest wstrzymywane;
 * - po wpisaniu nazwy nowej formy zamknięcie karty jest wstrzymywane
 *   (`beforeunload` z `preventDefault`);
 * - pozycja menu „Sprawy” otwiera okno „Masz niezapisane zmiany”, adres się nie zmienia;
 * - „Zostań” zamyka okno, wpisana nazwa zostaje, na szerokim ekranie fokus wraca na pozycję menu;
 * - „Wyjdź bez zapisywania” przechodzi na „Sprawy” bez przeładowania dokumentu;
 * - okno ma rolę `dialog`, nazwę z tytułu, fokus na „Zostań”, przyciski o wysokości
 *   co najmniej 44 px, a axe nie zgłasza naruszeń.
 * API i sesja Auth.js to atrapy w przeglądarce (`page.route`), bez zaplecza i bez logowania.
 */

const ATRAPA_SESJI = { accessToken: "atrapa-tokenu-testowego", expiresAt: Date.now() + 3_600_000 };
const API = "http://localhost:8000/api/v1";
const META = { current_page: 1, per_page: 25, total: 0, last_page: 1 };
const TYTUL_OKNA = "Masz niezapisane zmiany";
const WPIS = "Dyżur w punkcie pomocy";

const FORMY = [
  { id: 7, name: "Dyżur telefoniczny", description: "Rozmowa z osobą w kryzysie.", is_active: true, sort_order: 1, created_at: null, updated_at: null },
];

function odpowiedz(dane: unknown, meta?: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }) };
}

/** Ogólna atrapa jest rejestrowana PIERWSZA — Playwright wybiera trasę zarejestrowaną później jako pierwszą. */
async function instalujAtrapy(page: Page): Promise<void> {
  await page.route(`${API}/**`, (route) => route.fulfill(odpowiedz([], META)));
  await page.route(`${API}/me`, (route) => route.fulfill(odpowiedz({ id: 1, role: "project_manager", first_name: "Anna" })));
  await page.route(`${API}/notifications**`, (route) => route.fulfill(odpowiedz([], { ...META, extra: { unread: 0 } })));
  await page.route(`${API}/admin/internship/forms`, (route) => route.fulfill(odpowiedz(FORMY)));
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(odpowiedz({ url: null })));
}

/** Czy przeglądarka dostałaby prośbę o wstrzymanie zamknięcia karty (`preventDefault` na `beforeunload`). */
async function zamkniecieKartyWstrzymane(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const zdarzenie = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(zdarzenie);
    return zdarzenie.defaultPrevented;
  });
}

async function kliknijSprawyWMenu(page: Page, waski: boolean): Promise<Locator> {
  let menu = page.getByRole("complementary", { name: "Menu i konto" }).getByRole("navigation", { name: "Menu — Administracja" });
  if (waski) {
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    const oknoMenu = page.getByRole("dialog", { name: "Menu i konto" });
    await expect(oknoMenu).toBeVisible();
    menu = oknoMenu.getByRole("navigation", { name: "Menu — Administracja" });
  }
  const pozycja = menu.getByRole("link", { name: "Sprawy", exact: true });
  await expect(pozycja).toHaveAttribute("href", "/admin/sprawy");
  await pozycja.click();
  return pozycja;
}

for (const [nazwa, wymiary] of [
  ["1280 px", { width: 1280, height: 800 }],
  ["390 px", { width: 390, height: 844 }],
] as const) {
  test.describe(`niezapisane zmiany w ramie panelu, ${nazwa}`, () => {
    test.use({ viewport: wymiary });
    const waski = wymiary.width < 1024;

    test("zmiana pola → menu → okno → „Zostań” → pole zachowane → menu → „Wyjdź bez zapisywania” → nowy ekran", async ({ page }) => {
      await instalujAtrapy(page);
      const dokumenty: string[] = [];
      page.on("request", (zadanie) => {
        if (zadanie.resourceType() === "document") dokumenty.push(zadanie.url());
      });

      await page.goto("/admin/formy-stazu");
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.getByText("Dyżur telefoniczny")).toBeVisible();
      await page.getByRole("button", { name: "Dodaj formę" }).first().click();
      await expect(page.getByRole("heading", { level: 2, name: "Nowa forma" })).toBeVisible();

      // Otwarty formularz bez wpisu: nic do utracenia, karta zamyka się bez pytania.
      expect(await zamkniecieKartyWstrzymane(page), "bez zmiany: zamknięcie karty nie jest wstrzymywane").toBe(false);

      await page.locator("#forma-nazwa").fill(WPIS);
      await expect
        .poll(() => zamkniecieKartyWstrzymane(page), { message: "po zmianie pola: zamknięcie karty jest wstrzymywane" })
        .toBe(true);

      // Menu → okno z pytaniem, adres bez zmian.
      const pozycja = await kliknijSprawyWMenu(page, waski);
      const okno = page.getByRole("dialog", { name: TYTUL_OKNA });
      await expect(okno).toBeVisible();
      await expect(okno).toContainText("Jeśli wyjdziesz, zmiany zostaną utracone.");
      await expect(page).toHaveURL(/\/admin\/formy-stazu$/);

      const zostan = okno.getByRole("button", { name: "Zostań", exact: true });
      const wyjdz = okno.getByRole("button", { name: "Wyjdź bez zapisywania", exact: true });
      await expect(zostan).toBeFocused();
      for (const przycisk of [zostan, wyjdz]) {
        const pudelko = (await przycisk.boundingBox())!;
        expect(pudelko.height, `wysokość przycisku w oknie: ${JSON.stringify(pudelko)}`).toBeGreaterThanOrEqual(44);
        expect(pudelko.width, `szerokość przycisku w oknie: ${JSON.stringify(pudelko)}`).toBeGreaterThanOrEqual(44);
      }

      await page.waitForFunction(() =>
        document.getAnimations().every((a) => a.constructor?.name !== "CSSTransition" || a.playState !== "running"),
      );
      const wynik = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "best-practice"]).analyze();
      const naruszenia = wynik.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
      expect(naruszenia, naruszenia.join("\n")).toEqual([]);

      // „Zostań”: okno znika, wpis zostaje, ekran ten sam.
      await zostan.click();
      await expect(okno).toHaveCount(0);
      await expect(page.locator("#forma-nazwa")).toHaveValue(WPIS);
      await expect(page).toHaveURL(/\/admin\/formy-stazu$/);
      if (!waski) await expect(pozycja).toBeFocused();

      // „Wyjdź bez zapisywania”: przejście po stronie klienta na kliknięty ekran.
      await kliknijSprawyWMenu(page, waski);
      await expect(okno).toBeVisible();
      await okno.getByRole("button", { name: "Wyjdź bez zapisywania", exact: true }).click();
      await expect(page).toHaveURL(/\/admin\/sprawy$/);
      await expect(page.getByRole("heading", { level: 1, name: "Sprawy do decyzji" })).toBeVisible();
      await expect(okno).toHaveCount(0);
      expect(await zamkniecieKartyWstrzymane(page), "po wyjściu: zamknięcie karty nie jest wstrzymywane").toBe(false);
      expect(dokumenty, `żądania typu document: ${dokumenty.join(", ")}`).toHaveLength(1);
    });
  });
}
