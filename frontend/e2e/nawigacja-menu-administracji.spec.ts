import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Kliknięcie pozycji menu w nowej ramce administracji jest przejściem po
 * stronie klienta: dokument się nie przeładowuje. Na zbudowanej aplikacji,
 * z atrapą API przez `page.route` i atrapą sesji (jak w
 * `ramka-administracji.spec.ts`), na 1280 px (menu boczne) i 390 px (okno
 * menu):
 * - znacznik ustawiony w `window` przed kliknięciem przeżywa przejście
 *   `/admin` → „Sprawy”;
 * - w całym teście jest dokładnie jedno żądanie typu `document` (wejście);
 * - ekran docelowy ma nagłówek, a jego pozycja menu `aria-current="page"`;
 * - nowa ramka i `main` są pojedyncze, okno menu (390 px) zamyka się.
 * Wylogowanie zostaje pełnym przejściem: dokument przechodzi pod adres
 * wylogowania z odpowiedzi `/api/auth/end-session-url` (tu: atrapa).
 */

const ATRAPA_SESJI = {
  accessToken: "atrapa-tokenu-testowego",
  expiresAt: Date.now() + 3_600_000,
};

const EDYCJA = {
  id: 1,
  name: "Edycja 2026",
  starts_at: "2026-10-01",
  ends_at: "2027-03-31",
};

const META = { current_page: 1, per_page: 25, total: 0, last_page: 1 };

/** Adres wylogowania z atrapy — domena zastrzeżona do testów, obsługiwana przez `page.route`. */
const ADRES_WYLOGOWANIA = "https://konta.example.test/wylogowanie?id_token_hint=atrapa";

function odpowiedz(dane: unknown, meta?: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }) };
}

/**
 * Atrapy API roli administracji. Ogólna atrapa jest rejestrowana PIERWSZA —
 * Playwright wybiera trasę zarejestrowaną PÓŹNIEJ jako pierwszą.
 */
async function instalujAtrapyApi(page: Page): Promise<void> {
  const api = "http://localhost:8000/api/v1";
  await page.route(`${api}/**`, (route) => route.fulfill(odpowiedz([], META)));
  await page.route(`${api}/me`, (route) =>
    route.fulfill(odpowiedz({ id: 1, role: "project_manager", first_name: "Opiekun", last_name: "Demo", program_completed_at: null })),
  );
  await page.route(`${api}/notifications**`, (route) => route.fulfill(odpowiedz([], { ...META, extra: { unread: 0 } })));
  await page.route(`${api}/admin/dashboard`, (route) =>
    route.fulfill(
      odpowiedz({
        counters: { participants: 3, completed: 1, certificates: 1 },
        queues: [
          { key: "applications", count: 1, link: "/admin/uczestniczki" },
          { key: "internship_entries", count: 2, link: "/admin/staz" },
        ],
      }),
    ),
  );
  await page.route(`${api}/admin/edition`, (route) => route.fulfill(odpowiedz(EDYCJA)));

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ url: ADRES_WYLOGOWANIA }) }),
  );
  await page.route("https://konta.example.test/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: '<!doctype html><html lang="pl"><title>Atrapa wylogowania</title><h1>Atrapa wylogowania</h1></html>',
    }),
  );
}

/** Adresy żądań typu `document` od chwili wywołania (wejście na stronę i każde pełne przeładowanie). */
function zbierzDokumenty(page: Page): string[] {
  const dokumenty: string[] = [];
  page.on("request", (zadanie) => {
    if (zadanie.resourceType() === "document") dokumenty.push(zadanie.url());
  });
  return dokumenty;
}

/** Znacznik w `window`: przeżywa wyłącznie przejście po stronie klienta (pełne przeładowanie go kasuje). */
async function ustawZnacznik(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __znacznikDokumentu?: number }).__znacznikDokumentu = 1;
  });
}

async function odczytajZnacznik(page: Page): Promise<number | null> {
  return page.evaluate(() => (window as unknown as { __znacznikDokumentu?: number }).__znacznikDokumentu ?? null);
}

const SZEROKOSCI = [1280, 390] as const;

test.describe("menu nowej ramki administracji — przejście bez przeładowania dokumentu", () => {
  for (const szerokosc of SZEROKOSCI) {
    test(`/admin → „Sprawy” kliknięciem w menu @${szerokosc}: znacznik przeżywa, jedno żądanie dokumentu, nagłówek i bieżąca pozycja`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: szerokosc, height: szerokosc >= 1024 ? 900 : 844 });
      await instalujAtrapyApi(page);
      const dokumenty = zbierzDokumenty(page);

      const odpowiedzStrony = await page.goto("/admin");
      await zabezpieczeniePrzedEkranemDostepu(page);
      expect(odpowiedzStrony?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: "Pulpit administracji" })).toBeVisible();
      await expect(page.locator("[data-powloka-panelu]")).toHaveCount(1);
      await ustawZnacznik(page);

      // Menu: bok na szerokim ekranie, okno menu pod przyciskiem „Menu” na wąskim.
      let menu = page.getByRole("complementary", { name: "Menu i konto" }).getByRole("navigation", { name: "Menu — Administracja" });
      if (szerokosc < 1024) {
        await page.getByRole("button", { name: "Menu", exact: true }).click();
        const okno = page.getByRole("dialog", { name: "Menu i konto" });
        await expect(okno).toBeVisible();
        menu = okno.getByRole("navigation", { name: "Menu — Administracja" });
      }
      const pozycja = menu.getByRole("link", { name: "Sprawy", exact: true });
      await expect(pozycja).toHaveAttribute("href", "/admin/sprawy");
      await pozycja.click();

      await expect(page).toHaveURL(/\/admin\/sprawy$/);
      await expect(page.getByRole("heading", { level: 1, name: "Sprawy do decyzji" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

      // Bieżąca pozycja w menu bocznym (na wąskim ekranie menu boczne jest w DOM, schowane stylem).
      const bok = page.locator("[data-powloka-panelu] aside");
      await expect(bok.locator('a[href="/admin/sprawy"]')).toHaveAttribute("aria-current", "page");
      await expect(bok.locator('a[aria-current="page"]')).toHaveCount(1);
      if (szerokosc < 1024) await expect(page.getByRole("dialog", { name: "Menu i konto" })).toHaveCount(0);

      await expect(page.locator("[data-powloka-panelu]")).toHaveCount(1);
      await expect(page.locator("main")).toHaveCount(1);

      expect(await odczytajZnacznik(page), "znacznik w window po kliknięciu (pełne przeładowanie go kasuje)").toBe(1);
      expect(dokumenty, `żądania typu document: ${dokumenty.join(", ")}`).toHaveLength(1);
    });
  }

  test("wylogowanie @1280: dokument przechodzi pod adres wylogowania z odpowiedzi", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await instalujAtrapyApi(page);
    const dokumenty = zbierzDokumenty(page);

    await page.goto("/admin");
    await zabezpieczeniePrzedEkranemDostepu(page);
    await expect(page.getByRole("heading", { level: 1, name: "Pulpit administracji" })).toBeVisible();
    await ustawZnacznik(page);

    await page.getByRole("complementary", { name: "Menu i konto" }).getByRole("button", { name: "Wyloguj", exact: true }).click();

    await page.waitForURL(ADRES_WYLOGOWANIA);
    await expect(page.getByRole("heading", { level: 1, name: "Atrapa wylogowania" })).toBeVisible();
    expect(await odczytajZnacznik(page), "znacznik w window po wylogowaniu (nowy dokument go nie ma)").toBeNull();
    expect(dokumenty.filter((adres) => adres === ADRES_WYLOGOWANIA), `żądania typu document: ${dokumenty.join(", ")}`).toHaveLength(1);
    expect(dokumenty).toHaveLength(2);
  });
});
