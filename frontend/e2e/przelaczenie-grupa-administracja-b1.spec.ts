import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Miara dla partii przełączenia administracji (trasy proste): grupy
 * `pulpitAdministracji` (podmiana treści pod `/admin`) i `formyStazu` (nowa
 * trasa `/admin/formy-stazu`, bez starej) mają w `lib/przelaczenie/grupy.ts`
 * `wlaczona: true`; `powiadomienia`, `superwizje` i `sprawy` zostają
 * wyłączone, więc ich adresy niosą dalej starą treść.
 *
 * Sprawdzane w jednym pliku, z atrapą API przez `page.route` i atrapą sesji
 * (bez prawdziwego IdP — `getToken()` w `lib/api/klient.ts` czyta
 * `/api/auth/session`):
 * - `/admin` pokazuje ekran „Pulpit administracji”, z jednym `main` i jednym
 *   `#tresc`;
 * - wpis menu „Formy stażu” prowadzi na `/admin/formy-stazu`, ekran ma jeden
 *   `main`, a odmowa 403 z zaplecza daje stan „brak dostępu” bez rekordów;
 * - rola spoza administracji dostaje ekran 403 układu, bez menu;
 * - trzy grupy wyłączone zostają na starych ekranach (tytuł strony starej);
 * - zero odpowiedzi 404 w całym przebiegu każdego scenariusza.
 */

const ATRAPA_SESJI = {
  accessToken: "atrapa-tokenu-testowego",
  expiresAt: Date.now() + 3_600_000,
};

const FORMA = {
  id: 7,
  name: "Dyżur telefoniczny do pomiaru",
  description: "Rozmowa.",
  is_active: true,
  sort_order: 1,
  created_at: null,
  updated_at: null,
};

interface OpcjeAtrap {
  rola: string;
  formy: "dane" | "zakaz";
}

/**
 * Atrapy API: sesja Auth.js, `/me`, pulpit, słownik form stażu. Reszta
 * `/api/v1/*` dostaje ogólną atrapę rejestrowaną PRZED szczegółowymi —
 * Playwright wybiera trasę zarejestrowaną PÓŹNIEJ jako pierwszą.
 */
async function instalujAtrapyApi(page: Page, { rola, formy }: OpcjeAtrap): Promise<void> {
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
      body: JSON.stringify({ data: { id: 1, role: rola, program_completed_at: null } }),
    }),
  );

  await page.route("http://localhost:8000/api/v1/admin/dashboard", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          counters: { participants: 137, completed: 29, certificates: 23 },
          queues: [{ key: "applications", count: 11, link: "/admin/uczestniczki" }],
        },
      }),
    }),
  );

  await page.route("http://localhost:8000/api/v1/admin/internship/forms", (route) =>
    formy === "zakaz"
      ? route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({ error: { status: 403, code: "forbidden", message: "Brak dostępu." } }),
        })
      : route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: [FORMA] }),
        }),
  );

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );

  await page.route("**/api/auth/end-session-url", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { url: null } }) }),
  );
}

function zbierz404(page: Page): string[] {
  const kody404: string[] = [];
  page.on("response", (res) => {
    if (res.status() === 404) kody404.push(res.url());
  });
  return kody404;
}

test.describe("partia przełączenia administracji — pulpit i formy stażu włączone", () => {
  test("opiekun projektu: /admin pokazuje nowy pulpit z jednym main; wpis „Formy stażu” prowadzi na nową trasę; 0 odpowiedzi 404", async ({
    page,
  }) => {
    const kody404 = zbierz404(page);
    await instalujAtrapyApi(page, { rola: "project_manager", formy: "dane" });

    await page.goto("/admin");
    await zabezpieczeniePrzedEkranemDostepu(page);

    await expect(page.getByRole("heading", { level: 1, name: "Pulpit administracji" })).toBeVisible();
    await expect(page.getByText("137")).toBeVisible();
    // Ekran nowego frontu ma zmienne stylu tylko wtedy, gdy strona ładuje arkusz tokenów;
    // arkusz działa wyłącznie w poddrzewie korzenia ekranu, nie na elemencie głównym dokumentu.
    const marka = await page
      .locator('#tresc [data-theme="light"]')
      .first()
      .evaluate((el) => getComputedStyle(el).getPropertyValue("--brand").trim());
    expect(marka).not.toBe("");
    const markaNaDokumencie = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--brand").trim(),
    );
    expect(markaNaDokumencie).toBe("");
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("#tresc")).toHaveCount(1);

    const nav = page.getByRole("navigation", { name: "Menu — Administracja" }).first();
    await expect(nav.getByRole("link", { name: "Pulpit" })).toHaveAttribute("href", "/admin");
    // „Słownik form stażu” stoi w zwijanej grupie „Ustawienia” (na /admin zwiniętej): rozwijamy ją przed wejściem w pozycję.
    await nav.getByRole("button", { name: "Ustawienia (4)" }).click();
    const link = nav.getByRole("link", { name: "Słownik form stażu" });
    await expect(link).toHaveAttribute("href", "/admin/formy-stazu");

    await link.click();
    await expect(page).toHaveURL(/\/admin\/formy-stazu$/);
    await expect(page.getByRole("heading", { level: 1, name: "Słownik form stażu" })).toBeVisible();
    await expect(page.getByText(FORMA.name)).toBeVisible();
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("#tresc")).toHaveCount(1);

    expect(kody404, `odpowiedzi 404: ${kody404.join(", ")}`).toEqual([]);
  });

  test("super-admin: odmowa 403 słownika form stażu to ekran „brak dostępu” bez rekordów i z jednym main", async ({ page }) => {
    const kody404 = zbierz404(page);
    await instalujAtrapyApi(page, { rola: "super_admin", formy: "zakaz" });

    await page.goto("/admin/formy-stazu");
    await zabezpieczeniePrzedEkranemDostepu(page);

    await expect(page.getByRole("heading", { level: 2, name: "Nie masz dostępu do tego ekranu" })).toBeVisible();
    await expect(page.getByText(FORMA.name)).toHaveCount(0);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("#tresc")).toHaveCount(1);

    expect(kody404, `odpowiedzi 404: ${kody404.join(", ")}`).toEqual([]);
  });

  test("prowadzący: /admin/formy-stazu daje ekran 403 układu, bez menu administracji i bez rekordów", async ({ page }) => {
    await instalujAtrapyApi(page, { rola: "instructor", formy: "dane" });

    await page.goto("/admin/formy-stazu");

    await expect(page.getByText(FORMA.name)).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Menu — Administracja" })).toHaveCount(0);
  });

  test("dwie grupy wyłączone zostają na starych ekranach: tytuły stron starych", async ({ page }) => {
    await instalujAtrapyApi(page, { rola: "project_manager", formy: "dane" });

    for (const [adres, tytul] of [
      ["/admin/emails", /^Niepodzielni — platforma szkoleniowa$/],
      ["/admin/superwizje", /^Superwizje — Niepodzielni$/],
    ] as const) {
      const odpowiedz = await page.goto(adres);
      expect(odpowiedz?.status(), adres).toBe(200);
      await expect(page, adres).toHaveTitle(tytul);
    }
    await expect(page.getByRole("heading", { level: 1, name: "Superwizje" })).toBeVisible();
  });

  test("/admin/sprawy (grupa włączona): ten sam tytuł karty co dotąd, ale nowy ekran „Sprawy do decyzji”", async ({ page }) => {
    await instalujAtrapyApi(page, { rola: "project_manager", formy: "dane" });

    const odpowiedz = await page.goto("/admin/sprawy");
    expect(odpowiedz?.status()).toBe(200);
    await expect(page).toHaveTitle(/^Sprawy — Niepodzielni$/);
    await expect(page.getByRole("heading", { level: 1, name: "Sprawy do decyzji", exact: true })).toBeVisible();
  });
});
