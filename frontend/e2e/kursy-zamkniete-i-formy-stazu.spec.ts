import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Dwie zmiany wyglądu z jednego odbioru:
 * - kurs zamknięty na ścieżce uczestnika: plakietka „zamknięty”, nieaktywny
 *   przycisk „Zamknięty” z kłódką (`aria-disabled="true"`, bez odnośnika),
 *   w wierszu zamkniętym ani jednego „Otwórz”; kurs ukończony i w toku mają
 *   odnośnik „Otwórz”;
 * - słownik form stażu: lista w białej karcie (tło, ramka, zaokrąglenie jak
 *   sekcje list na pulpitach) z nagłówkiem h2, „Edytuj” jako przycisk
 *   drugorzędny (ramka 1 px, zaokrąglenie, wysokość ≥ 44 px), „Dodaj formę”
 *   w nagłówku o szerokości z treści (≤ 320 px).
 */

const ATRAPA_SESJI = { accessToken: "atrapa-tokenu-testowego", expiresAt: Date.now() + 3_600_000 };
const API = "http://localhost:8000/api/v1";
const STRONA = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

async function odpowiedz(page: Page, wzorzec: string, cialo: unknown): Promise<void> {
  await page.route(wzorzec, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cialo) }),
  );
}

async function instalujSesje(page: Page): Promise<void> {
  await odpowiedz(page, "**/api/auth/session", ATRAPA_SESJI);
  await odpowiedz(page, "**/api/auth/end-session-url", { data: { url: null } });
}

const KURSY = [
  { id: 1, slug: "podstawy-pomocy", title: "Podstawy pomocy psychologicznej", sequence_order: 1, product_group: "psychon", status: "completed", progress_percent: 100 },
  { id: 2, slug: "wywiad-psychologiczny", title: "Wywiad psychologiczny", sequence_order: 2, product_group: "psychon", status: "in_progress", progress_percent: 40 },
  { id: 3, slug: "interwencja-kryzysowa", title: "Interwencja kryzysowa", sequence_order: 3, product_group: "psychon", status: "locked", progress_percent: 0 },
];

async function atrapyUczestnika(page: Page): Promise<void> {
  await odpowiedz(page, `${API}/**`, { data: [], meta: STRONA });
  await odpowiedz(page, `${API}/me`, { data: { id: 1, role: "volunteer", first_name: "Marta", program_completed_at: null } });
  await odpowiedz(page, `${API}/courses`, { data: KURSY });
  await odpowiedz(page, `${API}/courses/wywiad-psychologiczny`, {
    data: { ...KURSY[1], lessons: [{ id: 21, title: "Wprowadzenie do wywiadu", sequence_order: 1, is_completed: false }] },
  });
  await odpowiedz(page, `${API}/certificate/conditions`, {
    data: {
      eligible: false,
      conditions: [{ key: "supervision", label: "Obecności na superwizjach", done: 2, required: 6, met: false }],
    },
  });
  await odpowiedz(page, `${API}/internship/entries**`, {
    data: [],
    meta: { ...STRONA, extra: { accepted_hours: "41.5", required_hours: "72.5" } },
  });
  await instalujSesje(page);
}

const FORMY = [
  { id: 7, name: "Dyżur telefoniczny", description: "Rozmowa z osobą w kryzysie.", is_active: true, sort_order: 1, created_at: null, updated_at: null },
  { id: 8, name: "Dyżur na czacie", description: null, is_active: false, sort_order: 2, created_at: null, updated_at: null },
];

async function atrapyFormStazu(page: Page): Promise<void> {
  await odpowiedz(page, `${API}/**`, { data: [], meta: STRONA });
  await odpowiedz(page, `${API}/me`, { data: { id: 1, role: "project_manager", first_name: "Anna" } });
  await odpowiedz(page, `${API}/admin/internship/forms`, { data: FORMY });
  await instalujSesje(page);
}

for (const [nazwa, wymiary] of [
  ["1280 px", { width: 1280, height: 800 }],
  ["390 px", { width: 390, height: 844 }],
] as const) {
  test.describe(`kurs zamknięty i słownik form stażu, ${nazwa}`, () => {
    test.use({ viewport: wymiary });

    test("kurs zamknięty: „Zamknięty” z kłódką, aria-disabled, bez odnośnika i bez „Otwórz”", async ({ page }) => {
      await atrapyUczestnika(page);
      await page.goto("/panel/pulpit");
      await zabezpieczeniePrzedEkranemDostepu(page);
      const zamkniety = page.locator('[data-kurs-stan="locked"]');
      await expect(zamkniety).toHaveCount(1);

      await expect(zamkniety.getByText("zamknięty", { exact: true })).toHaveCount(1);
      const przycisk = zamkniety.getByRole("button", { name: "Zamknięty" });
      await expect(przycisk).toHaveAttribute("aria-disabled", "true");
      await expect(przycisk.locator("svg")).toHaveCount(1);
      await expect(zamkniety.locator("a, [href]")).toHaveCount(0);
      await expect(zamkniety.getByText(/Otwórz/)).toHaveCount(0);

      for (const stan of ["completed", "in_progress"]) {
        const wiersz = page.locator(`[data-kurs-stan="${stan}"]`);
        await expect(wiersz.locator("a", { hasText: "Otwórz" })).toHaveCount(1);
        await expect(wiersz.locator('button[aria-disabled="true"]')).toHaveCount(0);
      }
      await expect(page.getByText("zablokowany")).toHaveCount(0);
    });

    test("słownik form stażu: biała karta z h2, „Edytuj” jako przycisk drugorzędny, „Dodaj formę” z treści", async ({ page }) => {
      await atrapyFormStazu(page);
      await page.goto("/admin/formy-stazu");
      await zabezpieczeniePrzedEkranemDostepu(page);
      const karta = page.locator('[data-obszar="lista-form"] section');
      await expect(karta).toHaveCount(1);

      await expect(karta.getByRole("heading", { level: 2, name: "Formy stażu" })).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 3, name: "Formy stażu" })).toHaveCount(0);

      const wyglad = await karta.evaluate((el) => {
        const s = getComputedStyle(el);
        return { tlo: s.backgroundColor, ramka: s.borderTopWidth, promien: parseFloat(s.borderTopLeftRadius) };
      });
      expect(wyglad.tlo, JSON.stringify(wyglad)).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
      expect(wyglad.ramka).toBe("1px");
      expect(wyglad.promien).toBeGreaterThan(0);

      if (wymiary.width >= 640) {
        const edytuj = await karta.getByRole("button", { name: "Edytuj" }).first().evaluate((el) => {
          const s = getComputedStyle(el);
          return {
            ramka: s.borderTopWidth,
            promien: parseFloat(s.borderTopLeftRadius),
            wysokosc: el.getBoundingClientRect().height,
          };
        });
        expect(edytuj.ramka, JSON.stringify(edytuj)).toBe("1px");
        expect(edytuj.promien).toBeGreaterThan(0);
        expect(edytuj.wysokosc).toBeGreaterThanOrEqual(44);
      }

      const naglowek = page.locator("header", { has: page.getByRole("heading", { level: 1 }) }).first();
      const dodaj = naglowek.getByRole("button", { name: "Dodaj formę" });
      const pudelko = (await dodaj.boundingBox())!;
      const pudelkoNaglowka = (await naglowek.boundingBox())!;
      if (wymiary.width >= 768) {
        expect(pudelko.width).toBeLessThanOrEqual(320);
        expect(pudelko.width).toBeLessThan(pudelkoNaglowka.width - 100);
      } else {
        expect(Math.abs(pudelko.width - pudelkoNaglowka.width)).toBeLessThanOrEqual(2);
      }
    });
  });
}
