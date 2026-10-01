import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Miara dla grup `listaOsob` i `nabor`, włączonych razem na wspólnej trasie
 * `/admin/uczestniczki` (`lib/przelaczenie/grupy.ts`, obie `wlaczona: true`):
 * - `/admin/uczestniczki` pokazuje nową listę „Uczestnicy programu” w nowej
 *   ramce administracji, z jednym `main` i jednym `#tresc`;
 * - stara zakładka `/admin/uczestniczki?zakladka=zgloszenia` przekierowuje
 *   na `/admin/nabor` (dyrektywa w strumieniu odpowiedzi, bez podążania za
 *   przekierowaniem), a w przeglądarce kończy na liście zgłoszeń, nie na 404;
 * - odnośnik „Zgłoszenia rekrutacyjne” z nagłówka listy osób prowadzi na
 *   `/admin/nabor`, a „Otwórz zgłoszenie” na `/admin/nabor/{id}`;
 * - odmowa 403 z zaplecza daje stan „brak dostępu” bez rekordów na każdej
 *   z trzech tras, rola spoza administracji — ekran 403 układu;
 * - zero odpowiedzi 404 w całym przebiegu każdego scenariusza.
 *
 * API i sesja to atrapy z `page.route` (bez prawdziwego IdP — `getToken()` w
 * `lib/api/klient.ts` czyta `/api/auth/session`).
 */

const ATRAPA_SESJI = {
  accessToken: "atrapa-tokenu-testowego",
  expiresAt: Date.now() + 3_600_000,
};

const ZAPLECZE = "http://localhost:8000";

const OSOBA = {
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
};

const ZGLOSZENIE = {
  id: 12,
  edition_id: 1,
  first_name: "Anna",
  last_name: "Kandydacka",
  email: "kandydacka@demo.pl",
  phone: null,
  source: null,
  role: "volunteer",
  payload: null,
  university: null,
  graduation_year: null,
  consent_regulamin_at: null,
  consent_polityka_at: null,
  status: "new",
  rejection_reason: null,
  decided_by: null,
  decided_at: null,
  user_id: null,
  has_diploma_scan: false,
  diploma_scan_url: null,
  created_at: "2026-09-20T10:00:00Z",
  updated_at: "2026-09-20T10:00:00Z",
};

interface OpcjeAtrap {
  rola: string;
  /** `zakaz` = 403 z zaplecza na odczycie listy osób, listy zgłoszeń i szczegółu. */
  odczyt: "dane" | "zakaz";
}

const META = { current_page: 1, per_page: 25, total: 1, last_page: 1, edition_id: 1 };

function json(status: number, cialo: unknown) {
  return { status, contentType: "application/json", body: JSON.stringify(cialo) };
}

/**
 * Atrapy API. Ogólna atrapa jest rejestrowana PRZED szczegółowymi —
 * Playwright wybiera trasę zarejestrowaną PÓŹNIEJ jako pierwszą.
 */
async function instalujAtrapyApi(page: Page, { rola, odczyt }: OpcjeAtrap): Promise<void> {
  const zakaz = json(403, { error: { status: 403, code: "forbidden", message: "Brak dostępu." } });
  const sciezkaApi = (sciezka: string) => (url: URL) => url.origin === ZAPLECZE && url.pathname === `/api/v1${sciezka}`;

  await page.route(`${ZAPLECZE}/api/v1/**`, (route) =>
    route.fulfill(json(200, { data: [], meta: { current_page: 1, per_page: 25, total: 0, last_page: 1 } })),
  );
  await page.route(sciezkaApi("/me"), (route) => route.fulfill(json(200, { data: { id: 1, role: rola, program_completed_at: null } })));
  await page.route(sciezkaApi("/admin/users"), (route) =>
    route.fulfill(odczyt === "zakaz" ? zakaz : json(200, { data: [OSOBA], meta: META })),
  );
  await page.route(sciezkaApi("/admin/applications"), (route) =>
    route.fulfill(odczyt === "zakaz" ? zakaz : json(200, { data: [ZGLOSZENIE], meta: META })),
  );
  await page.route(sciezkaApi("/admin/applications/12"), (route) =>
    route.fulfill(odczyt === "zakaz" ? zakaz : json(200, { data: ZGLOSZENIE })),
  );
  await page.route("**/api/auth/session", (route) => route.fulfill(json(200, ATRAPA_SESJI)));
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json(200, { data: { url: null } })));
}

function zbierz404(page: Page): string[] {
  const kody404: string[] = [];
  page.on("response", (res) => {
    if (res.status() === 404) kody404.push(res.url());
  });
  return kody404;
}

async function jedenMain(page: Page): Promise<void> {
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("#tresc")).toHaveCount(1);
}

test.describe("grupy listaOsob i nabor — włączone razem na /admin/uczestniczki", () => {
  test("opiekun projektu: lista osób w nowej ramce, odnośnik do naboru, lista zgłoszeń i szczegół; 0 odpowiedzi 404", async ({ page }) => {
    const kody404 = zbierz404(page);
    await instalujAtrapyApi(page, { rola: "project_manager", odczyt: "dane" });

    await page.goto("/admin/uczestniczki");
    await zabezpieczeniePrzedEkranemDostepu(page);

    await expect(page.getByRole("heading", { level: 1, name: "Uczestnicy programu" })).toBeVisible();
    await expect(page.getByText(`${OSOBA.first_name} ${OSOBA.last_name}`, { exact: true })).toBeVisible();
    await expect(page.locator("[data-powloka-panelu]")).toHaveCount(1);
    await jedenMain(page);

    await page.getByRole("link", { name: "Zgłoszenia rekrutacyjne" }).first().click();
    await expect(page).toHaveURL(/\/admin\/nabor$/);
    await expect(page.getByRole("heading", { level: 1, name: "Zgłoszenia rekrutacyjne" })).toBeVisible();
    await expect(page.getByText(`${ZGLOSZENIE.first_name} ${ZGLOSZENIE.last_name}`, { exact: true })).toBeVisible();
    await jedenMain(page);

    await page.getByRole("link", { name: "Otwórz zgłoszenie" }).first().click();
    await expect(page).toHaveURL(/\/admin\/nabor\/12$/);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(page.getByText(ZGLOSZENIE.email).first()).toBeVisible();
    await jedenMain(page);

    expect(kody404, `odpowiedzi 404: ${kody404.join(", ")}`).toEqual([]);
  });

  test("stara zakładka zgłoszeń: przekierowanie na /admin/nabor, w przeglądarce lista zgłoszeń, nie 404", async ({ page }) => {
    const kody404 = zbierz404(page);
    await instalujAtrapyApi(page, { rola: "project_manager", odczyt: "dane" });

    // Strona czyta parametr zapytania, więc jest dynamiczna: przekierowanie wychodzi w strumieniu
    // odpowiedzi (status 200, dyrektywa `NEXT_REDIRECT;replace;/admin/nabor;307;` w treści), nie jako
    // nagłówek 307 — tak mierzy to zbudowana aplikacja. Test przyjmuje oba kształty, ale wymaga celu.
    const odpowiedz = await page.request.get("/admin/uczestniczki?zakladka=zgloszenia", { maxRedirects: 0 });
    if ([307, 308].includes(odpowiedz.status())) {
      expect(odpowiedz.headers()["location"] ?? "").toMatch(/\/admin\/nabor$/);
    } else {
      expect(odpowiedz.status()).toBe(200);
      expect(await odpowiedz.text()).toContain("NEXT_REDIRECT;replace;/admin/nabor;307;");
    }

    const bezParametru = await page.request.get("/admin/uczestniczki", { maxRedirects: 0 });
    expect(bezParametru.status()).toBe(200);
    expect(await bezParametru.text()).not.toContain("NEXT_REDIRECT");

    await page.goto("/admin/uczestniczki?zakladka=zgloszenia");
    await zabezpieczeniePrzedEkranemDostepu(page);
    await expect(page).toHaveURL(/\/admin\/nabor$/);
    await expect(page.getByRole("heading", { level: 1, name: "Zgłoszenia rekrutacyjne" })).toBeVisible();
    await expect(page.getByText(`${ZGLOSZENIE.first_name} ${ZGLOSZENIE.last_name}`, { exact: true })).toBeVisible();

    expect(kody404, `odpowiedzi 404: ${kody404.join(", ")}`).toEqual([]);
  });

  for (const adres of ["/admin/uczestniczki", "/admin/nabor", "/admin/nabor/12"]) {
    test(`super-admin: odmowa 403 z zaplecza na ${adres} to ekran „brak dostępu” bez rekordów i z jednym main`, async ({ page }) => {
      const kody404 = zbierz404(page);
      await instalujAtrapyApi(page, { rola: "super_admin", odczyt: "zakaz" });

      await page.goto(adres);
      await zabezpieczeniePrzedEkranemDostepu(page);

      await expect(page.getByText("Ta funkcja jest dostępna tylko dla administracji.")).toBeVisible();
      await expect(page.getByText(`${OSOBA.first_name} ${OSOBA.last_name}`, { exact: true })).toHaveCount(0);
      await expect(page.getByText(`${ZGLOSZENIE.first_name} ${ZGLOSZENIE.last_name}`, { exact: true })).toHaveCount(0);
      await jedenMain(page);

      expect(kody404, `odpowiedzi 404: ${kody404.join(", ")}`).toEqual([]);
    });
  }

  test("prowadzący: /admin/nabor daje ekran 403 układu, bez menu administracji i bez rekordów", async ({ page }) => {
    await instalujAtrapyApi(page, { rola: "instructor", odczyt: "dane" });

    await page.goto("/admin/nabor");

    await expect(page.getByText(`${ZGLOSZENIE.first_name} ${ZGLOSZENIE.last_name}`, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Menu — Administracja" })).toHaveCount(0);
  });
});
