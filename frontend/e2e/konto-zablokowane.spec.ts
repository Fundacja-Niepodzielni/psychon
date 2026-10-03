import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Konto zablokowane po zalogowaniu widzi osobny ekran o blokadzie, a nie
 * „Konto nie jest jeszcze połączone”:
 * - serwer odpowiada na `GET /me` 401 z `error.code = "konto_zablokowane"`
 *   (koperta bez `reason`, bez powodu blokady) → klient API przechodzi na
 *   `/logowanie/zablokowane` bez pytania `GET /sso/whoami`;
 * - konto jeszcze niepowiązane (401 `konto_niepowiazane` z `sub`) dalej ląduje na
 *   `/logowanie/niepowiazane` — bez zmian;
 * - po odblokowaniu (`GET /me` znów 200) wejście działa.
 *
 * Atrapy API jak w `pulpit-administracji-390.spec.ts` (bez prawdziwego serwera).
 * Okna: 1280×800 i 390×844. Nie dotyka katalogu `e2e/logowanie/`.
 */

const ATRAPA_SESJI = { accessToken: "atrapa-tokenu-testowego", expiresAt: Date.now() + 3_600_000 };
const SUB = "88522d2e-aaaa-bbbb-cccc-111122223333";
const API = "http://localhost:8000/api/v1";

type StanMe = "zablokowane" | "niepowiazane" | "aktywne";

const OKNA = [
  { nazwa: "1280", okno: { width: 1280, height: 800 } },
  { nazwa: "390", okno: { width: 390, height: 844 } },
] as const;

interface Liczniki {
  whoami: number;
}

async function instalujAtrapy(page: Page, stan: StanMe): Promise<Liczniki> {
  const liczniki: Liczniki = { whoami: 0 };
  // Ogólna atrapa pierwsza: Playwright bierze trasę zarejestrowaną PÓŹNIEJ jako pierwszą.
  await page.route(`${API}/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [], meta: { current_page: 1, per_page: 25, total: 0, last_page: 1 } }),
    }),
  );
  await page.route(`${API}/me`, (route) => {
    if (stan === "aktywne") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { id: 1, role: "project_manager", program_completed_at: null } }),
      });
    }
    const blad =
      stan === "zablokowane"
        ? {
            status: 401,
            code: "konto_zablokowane",
            message: "To konto jest zablokowane.",
          }
        : {
            status: 401,
            code: "konto_niepowiazane",
            message: "To konto nie jest jeszcze powiązane z kontem w PsychON.",
            reason: { sub: SUB },
          };
    return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: blad }) });
  });
  await page.route(`${API}/sso/whoami`, (route) => {
    liczniki.whoami += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sub: SUB, roles: [] }),
    });
  });
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { url: null } }) }),
  );
  return liczniki;
}

async function bezPrzewijaniaPoziomego(page: Page): Promise<void> {
  const miary = await page.evaluate(() => ({
    dokument: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
  expect(miary, "przewijanie poziome strony (px ponad szerokość okna)").toEqual({ dokument: 0, body: 0 });
}

for (const { nazwa, okno } of OKNA) {
  test.describe(`logowanie konta zablokowanego ${nazwa} px`, () => {
    test.use({ viewport: okno });

    test("konto zablokowane: osobny ekran o blokadzie, bez „Konto nie jest jeszcze połączone” i bez pytania o whoami", async ({
      page,
    }) => {
      const liczniki = await instalujAtrapy(page, "zablokowane");
      await page.goto("/admin");
      await zabezpieczeniePrzedEkranemDostepu(page);

      await page.waitForURL(/\/logowanie\/zablokowane$/);
      await expect(page.getByRole("heading", { level: 1, name: "Konto jest zablokowane" })).toBeVisible();
      await expect(
        page.getByText("Nie możesz teraz korzystać z platformy. Jeśli to pomyłka, skontaktuj się z fundacją."),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Wyloguj się" })).toBeVisible();
      await expect(page.getByText("Konto nie jest jeszcze połączone")).toHaveCount(0);
      await expect(page.getByText("Przekaż administratorowi")).toHaveCount(0);
      expect(liczniki.whoami, "serwer sam nazwał stan konta, whoami niepotrzebne").toBe(0);
      await bezPrzewijaniaPoziomego(page);
    });

    test("konto niepowiązane: bez zmian — ekran „Konto nie jest jeszcze połączone” z identyfikatorem", async ({ page }) => {
      await instalujAtrapy(page, "niepowiazane");
      await page.goto("/admin");
      await zabezpieczeniePrzedEkranemDostepu(page);

      await page.waitForURL(/\/logowanie\/niepowiazane$/);
      await expect(page.getByRole("heading", { level: 1, name: "Konto nie jest jeszcze połączone" })).toBeVisible();
      await expect(page.getByText(SUB)).toBeVisible();
      await expect(page.getByText("Konto jest zablokowane")).toHaveCount(0);
      await bezPrzewijaniaPoziomego(page);
    });

    test("po odblokowaniu wejście działa: `/admin` zostaje na pulpicie, bez ekranu blokady", async ({ page }) => {
      await instalujAtrapy(page, "aktywne");
      await page.goto("/admin");
      await zabezpieczeniePrzedEkranemDostepu(page);

      await expect(page.getByRole("heading", { level: 1, name: "Pulpit administracji" })).toBeVisible();
      expect(new URL(page.url()).pathname).toBe("/admin");
      await expect(page.getByText("Konto jest zablokowane")).toHaveCount(0);
    });
  });
}
