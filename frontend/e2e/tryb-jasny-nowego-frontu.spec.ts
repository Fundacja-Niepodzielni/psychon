import { expect, test } from "@playwright/test";

/**
 * Miara skutku wyłącznika jasnego motywu w przeglądarce. Nowy front
 * (`app/nowy-front/layout.tsx`) owija treść w `<div data-theme="light">`;
 * przy systemie w trybie ciemnym (`colorScheme: "dark"`) tokeny na tym `div`
 * muszą mimo to być jasne. jsdom nie liczy `@media (prefers-color-scheme)`,
 * więc tylko prawdziwa przeglądarka jest tu świadkiem.
 *
 * Backend nie jest stawiany: ekran `/nowy-front/pulpit` woła API z
 * przeglądarki, więc każde żądanie `/api/v1/*` i sesja Auth.js dostają
 * atrapę (inaczej połączenie wisi). Korzeń układu istnieje niezależnie od
 * odpowiedzi API.
 */

test.use({ colorScheme: "dark" });

const JASNE_TLO = "#f3f1ed";

test("nowy front jest jasny mimo ciemnego trybu systemu", async ({ page }) => {
  await page.route("http://localhost:8000/api/v1/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    }),
  );
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        accessToken: "atrapa-tokenu-testowego",
        expiresAt: Date.now() + 3_600_000,
      }),
    }),
  );

  // Przeglądarka rzeczywiście zgłasza ciemny tryb systemu.
  await page.goto("/nowy-front/pulpit");
  expect(await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches)).toBe(true);

  const korzen = page.locator('[data-theme="light"]').first();
  await expect(korzen).toBeAttached();

  const { bg, schemat } = await korzen.evaluate((el) => {
    const styl = getComputedStyle(el);
    return {
      bg: styl.getPropertyValue("--bg").trim().toLowerCase(),
      schemat: styl.colorScheme,
    };
  });

  expect(bg).toBe(JASNE_TLO);
  expect(schemat).toBe("light");
});
