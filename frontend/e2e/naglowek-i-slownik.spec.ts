import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Miara dla przycisku głównego nagłówka (`PageHeader`) i słownika na ekranach
 * słownika form stażu, decyzji o profilu, zgłoszeń współpracy (A-34) i „Po
 * programie” (U-19). Grupy przełączenia tych ekranów są tu włączone
 * (`lib/przelaczenie/grupy.ts`). API i sesja Auth.js to atrapy w przeglądarce
 * (`page.route`), bez zaplecza i bez IdP.
 *
 * Geometria (makieta 2.0.4, `.head .acts`):
 * - 1280: przycisk główny ma górną krawędź w pasie h1 (|top przycisku − top h1| ≤ 12 px)
 *   i prawą krawędź przy prawej krawędzi nagłówka (≤ 2 px);
 * - 390: przycisk ma szerokość nagłówka (± 2 px) i leży pod opisem.
 * Słownik: w `main` zero „(H11)”, „Zaakceptuj”, „Status”; „Wróć do listy” prowadzi na
 * `/admin/profile`; plakietki stanu małą literą; zero poziomego przewijania.
 */

const ATRAPA_SESJI = { accessToken: "atrapa-tokenu-testowego", expiresAt: Date.now() + 3_600_000 };

const FORMY = [
  { id: 1, name: "Dyżur telefoniczny", description: "Rozmowa telefoniczna w godzinach dyżuru.", is_active: true, sort_order: 1, created_at: null, updated_at: null },
  { id: 2, name: "Dyżur czatu", description: "Rozmowa na czacie w godzinach dyżuru.", is_active: true, sort_order: 2, created_at: null, updated_at: null },
  { id: 3, name: "Inna", description: "Pozostałe formy stażu.", is_active: false, sort_order: 3, created_at: null, updated_at: null },
];

const WNIOSEK = {
  id: 12,
  user: { id: 17, first_name: "Ola", last_name: "Demo" },
  specializations: ["interwencja kryzysowa"],
  approach: "poznawczo-behawioralne",
  city: "Gdańsk",
  bio: "Pracuję z osobami dorosłymi.",
  publication_consent_granted: true,
  status: "submitted",
  return_reason: null,
  decided_at: null,
  documents: [],
  created_at: "2026-09-10T08:00:00Z",
  updated_at: "2026-09-11T08:00:00Z",
};

const ZGLOSZENIA = [
  { id: 11, body: "Chcę dalej prowadzić dyżury czatu.", status: "new", response: null, responded_at: null, created_at: "2026-09-20T08:00:00Z", updated_at: "2026-09-20T08:00:00Z", responded_by: null, user: { id: 17, first_name: "Ola", last_name: "Demo", email: "ola@demo.pl" } },
  { id: 12, body: "Proszę o informację o kolejnej edycji.", status: "answered", response: "Dziękujemy, odezwiemy się w październiku.", responded_at: "2026-09-22T08:00:00Z", created_at: "2026-09-18T08:00:00Z", updated_at: "2026-09-22T08:00:00Z", responded_by: 5, user: { id: 18, first_name: "Marta", last_name: "Demo", email: "marta@demo.pl" } },
  { id: 13, body: "Dziękuję za program.", status: "closed", response: "Zamykamy zgłoszenie.", responded_at: "2026-09-23T08:00:00Z", created_at: "2026-09-19T08:00:00Z", updated_at: "2026-09-23T08:00:00Z", responded_by: 5, user: { id: 19, first_name: "Ewa", last_name: "Demo", email: "ewa@demo.pl" } },
];

function odpowiedz(dane: unknown, meta?: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }) };
}

const META = { current_page: 1, per_page: 25, total: 3, last_page: 1 };

/** Ogólna atrapa jest rejestrowana PIERWSZA — Playwright wybiera trasę zarejestrowaną później jako pierwszą. */
async function instalujAtrapy(page: Page, rola: string): Promise<void> {
  await page.route("http://localhost:8000/api/v1/**", (route) => route.fulfill(odpowiedz([])));
  await page.route("http://localhost:8000/api/v1/me", (route) =>
    route.fulfill(odpowiedz({ id: 1, role: rola, program_completed_at: "2026-09-15T00:00:00Z" })),
  );
  await page.route("http://localhost:8000/api/v1/notifications**", (route) =>
    route.fulfill(odpowiedz([], { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { unread: 0 } })),
  );
  await page.route("http://localhost:8000/api/v1/admin/internship/forms", (route) => route.fulfill(odpowiedz(FORMY)));
  await page.route("http://localhost:8000/api/v1/admin/profiles/12", (route) => route.fulfill(odpowiedz(WNIOSEK)));
  await page.route("http://localhost:8000/api/v1/admin/cooperation-requests**", (route) =>
    route.fulfill(odpowiedz(ZGLOSZENIA, META)),
  );
  await page.route("http://localhost:8000/api/v1/cooperation-requests/mine**", (route) =>
    route.fulfill(odpowiedz(ZGLOSZENIA, META)),
  );
  await page.route("http://localhost:8000/api/v1/admin/dashboard", (route) =>
    route.fulfill(odpowiedz({ counters: { participants: 0, completed: 0, certificates: 0 }, queues: [] })),
  );
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(odpowiedz({ url: null })));
}

async function sprawdzSlownikIPrzewijanie(page: Page): Promise<void> {
  const tekst = await page.locator("main").innerText();
  expect(tekst).not.toContain("(H11)");
  expect(tekst).not.toContain("Zaakceptuj");
  expect(tekst).not.toMatch(/\bStatus\b/);
  const przewijanie = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(przewijanie.scroll, `scrollWidth ${przewijanie.scroll} > clientWidth ${przewijanie.client}`).toBeLessThanOrEqual(
    przewijanie.client,
  );
}

/** Zrzut pełnej strony do katalogu z `ZRZUTY_DIR` (porównanie przed/po); bez zmiennej nic nie robi. */
async function zrzut(page: Page, ekran: string, szerokosc: string): Promise<void> {
  const katalog = process.env.ZRZUTY_DIR;
  if (!katalog) return;
  await page.screenshot({ path: `${katalog}/${ekran}-${szerokosc}.png`, fullPage: true });
}

const SZEROKOSCI = [
  { nazwa: "1280", viewport: { width: 1280, height: 800 } },
  { nazwa: "390", viewport: { width: 390, height: 844 } },
];

for (const { nazwa, viewport } of SZEROKOSCI) {
  test.describe(`nagłówek i słownik — ${nazwa} px`, () => {
    test.use({ viewport });

    test("słownik form stażu: „Dodaj formę” w nagłówku, jedyny w kolorze, opis bez kodu pakietu", async ({ page }) => {
      await instalujAtrapy(page, "project_manager");
      await page.goto("/admin/formy-stazu");
      await zabezpieczeniePrzedEkranemDostepu(page);

      const h1 = page.getByRole("heading", { level: 1, name: "Słownik form stażu" });
      await expect(h1).toBeVisible();
      await expect(page.getByText("Dyżur telefoniczny")).toBeVisible();

      const naglowek = page.locator("main header").first();
      const przycisk = naglowek.getByRole("button", { name: "Dodaj formę" });
      await expect(przycisk).toBeVisible();
      await expect(page.locator("main button[class*='primary']")).toHaveCount(1);

      const bNaglowek = (await naglowek.boundingBox())!;
      const bPrzycisk = (await przycisk.boundingBox())!;
      const bH1 = (await h1.boundingBox())!;
      if (nazwa === "1280") {
        expect(Math.abs(bPrzycisk.y - bH1.y), `top przycisku ${bPrzycisk.y}, top h1 ${bH1.y}`).toBeLessThanOrEqual(12);
        const prawa = bPrzycisk.x + bPrzycisk.width;
        expect(Math.abs(prawa - (bNaglowek.x + bNaglowek.width)), `prawa ${prawa}`).toBeLessThanOrEqual(2);
      } else {
        expect(Math.abs(bPrzycisk.width - bNaglowek.width)).toBeLessThanOrEqual(2);
        const opis = naglowek.locator("p").first();
        const bOpis = (await opis.boundingBox())!;
        expect(bPrzycisk.y).toBeGreaterThanOrEqual(bOpis.y + bOpis.height - 1);
      }

      await expect(page.getByText("aktywna", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("Aktywna", { exact: true })).toHaveCount(0);
      await sprawdzSlownikIPrzewijanie(page);
      await zrzut(page, "formy-stazu", nazwa);
    });

    test("decyzja o profilu: „Zatwierdź”, „Wróć do listy” prowadzi na /admin/profile, plakietka małą literą", async ({ page }) => {
      await instalujAtrapy(page, "project_manager");
      await page.goto("/admin/profile/12");
      await zabezpieczeniePrzedEkranemDostepu(page);

      await expect(page.getByRole("heading", { level: 1, name: /^Wniosek o profil: Ola Demo/ })).toBeVisible();
      await expect(page.getByRole("button", { name: "Zatwierdź" })).toBeVisible();
      await expect(page.getByText("czeka na decyzję", { exact: true })).toBeVisible();
      await expect(page.getByText("Czeka na decyzję", { exact: true })).toHaveCount(0);
      await sprawdzSlownikIPrzewijanie(page);
      await zrzut(page, "decyzja-profilu", nazwa);

      const wroc = page.getByRole("button", { name: "Wróć do listy" });
      await expect(wroc).toBeVisible();
      await wroc.click();
      await expect(page).toHaveURL(/\/admin\/profile$/);
    });

    test("A-34: „Stan” zamiast „Status”, plakietki małą literą", async ({ page }) => {
      await instalujAtrapy(page, "project_manager");
      await page.goto("/admin/zgloszenia-wspolpracy");
      await zabezpieczeniePrzedEkranemDostepu(page);

      await expect(page.getByRole("heading", { level: 1, name: "Zgłoszenia współpracy" })).toBeVisible();
      await expect(page.getByText("Ola Demo")).toBeVisible();
      await expect(page.getByText("Stan", { exact: true })).toBeVisible();
      for (const plakietka of ["nowe", "z odpowiedzią", "zamknięte"]) {
        await expect(page.getByText(plakietka, { exact: true }).first()).toBeVisible();
      }
      await sprawdzSlownikIPrzewijanie(page);
      await zrzut(page, "A-34-zgloszenia-wspolpracy", nazwa);
    });

    test("U-19: plakietki historii zgłoszeń małą literą", async ({ page }) => {
      await instalujAtrapy(page, "volunteer");
      await page.goto("/panel/dalsza-wspolpraca");
      await zabezpieczeniePrzedEkranemDostepu(page);

      await expect(page.getByRole("heading", { level: 1, name: "Po programie" })).toBeVisible();
      await expect(page.getByText("nowe", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("Nowe", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Czeka na odpowiedź", { exact: true })).toHaveCount(0);
      await sprawdzSlownikIPrzewijanie(page);
      await zrzut(page, "U-19-dalsza-wspolpraca", nazwa);
    });
  });
}
