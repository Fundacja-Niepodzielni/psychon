import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Zwinięte filtry list na telefonie: Sprawy (`/admin/sprawy`), Osoby
 * (`/admin/uczestniczki`) i Dziennik działań (`/admin/dziennik`). Zbudowana
 * aplikacja, API i sesja to atrapy z `page.route`.
 * - 390 px: filtry to jeden wiersz („Rodzaj: …” w Sprawach, „Filtry: …” w Osobach
 *   i Dzienniku) z `aria-expanded`; panel jest ukryty, otwiera się klikiem,
 *   Escape zwija go i oddaje fokus na wiersz, a wybór („Wszystkie”, „Filtruj”,
 *   „Pokaż wyniki”) zwija panel i też oddaje fokus na wiersz;
 * - 1280 px: wiersza nie ma, kontrolki filtrów stoją jak dotąd;
 * - 390 i 320 px: brak przewijania w bok na trzech ekranach (otwarte i zamknięte).
 */

const API = "http://localhost:8000/api/v1";
const ATRAPA_SESJI = { accessToken: "atrapa-tokenu-testowego", expiresAt: Date.now() + 3_600_000 };
const META = (total: number) => ({ current_page: 1, per_page: 25, total, last_page: 1 });

function json(cialo: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(cialo) };
}

const OSOBY = [
  {
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
  },
];

function zgloszenie(id: number, imie: string, nazwisko: string) {
  return {
    id,
    edition_id: 1,
    first_name: imie,
    last_name: nazwisko,
    email: `${nazwisko.toLowerCase()}@demo.pl`,
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
}

const DYZUR = { id: 5, created_at: "2026-09-22T10:00:00Z", user: { id: 18, first_name: "Ola", last_name: "Demo" } };

const WPIS_DZIENNIKA = {
  id: 7,
  action: "internship.accepted",
  actor: { id: 1, first_name: "Ola", last_name: "Nowak" },
  subject_type: "internship_entry",
  subject_id: 12,
  details: null,
  created_at: "2026-09-05T10:00:00Z",
};

/** Ogólna atrapa jest rejestrowana PIERWSZA — Playwright wybiera trasę zarejestrowaną PÓŹNIEJ jako pierwszą. */
async function instalujAtrapy(page: Page): Promise<void> {
  await page.route(`${API}/**`, (route) => route.fulfill(json({ data: [], meta: META(0) })));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(json({ data: { id: 1, role: "project_manager", first_name: "Anna", program_completed_at: null } })),
  );
  await page.route(`${API}/notifications**`, (route) =>
    route.fulfill(json({ data: [], meta: { ...META(0), extra: { unread: 0 } } })),
  );
  await page.route((url) => url.origin === "http://localhost:8000" && url.pathname === "/api/v1/admin/users", (route) =>
    route.fulfill(json({ data: OSOBY, meta: META(OSOBY.length) })),
  );
  await page.route(`${API}/admin/applications**`, (route) =>
    route.fulfill(json({ data: [zgloszenie(12, "Anna", "Kandydacka")], meta: META(1) })),
  );
  await page.route(`${API}/admin/internship/pending**`, (route) => route.fulfill(json({ data: [DYZUR], meta: META(1) })));
  await page.route(`${API}/admin/supervision/cases`, (route) => route.fulfill(json({ data: [] })));
  await page.route(`${API}/admin/audit**`, (route) => route.fulfill(json({ data: [WPIS_DZIENNIKA], meta: META(1) })));
  await page.route("**/api/auth/session", (route) => route.fulfill(json(ATRAPA_SESJI)));
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json({ data: { url: null } })));
}

interface Ekran {
  nazwa: string;
  adres: string;
  /** Wiersz zwiniętych filtrów (telefon). */
  wiersz: RegExp;
  /** Kontrolka panelu, która musi być widoczna po rozwinięciu i na komputerze. */
  kontrolka: (page: Page) => ReturnType<Page["getByRole"]>;
  /** Wybór, który zwija panel. */
  wybierz: (page: Page) => Promise<void>;
  /** Czego na komputerze nie ma albo co zostaje bez zmian. */
  komputer: (page: Page) => ReturnType<Page["getByRole"]>;
}

const EKRANY: Ekran[] = [
  {
    nazwa: "Sprawy",
    adres: "/admin/sprawy",
    wiersz: /^Rodzaj:/,
    kontrolka: (page) => page.getByRole("group", { name: "Rodzaj sprawy" }),
    wybierz: async (page) => {
      await page.getByRole("button", { name: /^Wszystkie \(\d+\)/ }).click();
    },
    komputer: (page) => page.getByRole("button", { name: /^Filtr:/ }),
  },
  {
    nazwa: "Osoby",
    adres: "/admin/uczestniczki",
    wiersz: /^Filtry:/,
    kontrolka: (page) => page.getByRole("combobox", { name: /^Rola/ }),
    wybierz: async (page) => {
      await page.getByRole("button", { name: "Filtruj" }).click();
    },
    komputer: (page) => page.getByRole("button", { name: "Filtruj" }),
  },
  {
    nazwa: "Dziennik działań",
    adres: "/admin/dziennik",
    wiersz: /^Filtry:/,
    kontrolka: (page) => page.getByLabel("Zdarzenie"),
    wybierz: async (page) => {
      await page.getByRole("button", { name: "Pokaż wyniki" }).click();
    },
    komputer: (page) => page.getByRole("button", { name: "Filtruj" }),
  },
];

async function otworz(page: Page, adres: string): Promise<void> {
  await instalujAtrapy(page);
  await page.goto(adres);
  await zabezpieczeniePrzedEkranemDostepu(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
}

async function przewijanieWBok(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("zwinięte filtry, telefon 390 px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const ekran of EKRANY) {
    test(`${ekran.nazwa}: wiersz zwinięty, rozwija się klikiem, Escape i wybór oddają fokus na wiersz`, async ({ page }) => {
      await otworz(page, ekran.adres);
      const wiersz = page.getByRole("button", { name: ekran.wiersz });
      await expect(wiersz).toBeVisible();
      await expect(wiersz).toHaveAttribute("aria-expanded", "false");
      const ramka = await wiersz.boundingBox();
      expect(ramka?.height ?? 0, "cel dotyku wiersza (px)").toBeGreaterThanOrEqual(44);
      await expect(ekran.kontrolka(page)).toBeHidden();

      await wiersz.click();
      await expect(wiersz).toHaveAttribute("aria-expanded", "true");
      await expect(ekran.kontrolka(page)).toBeVisible();
      expect(await przewijanieWBok(page), "rozwinięty panel nie przewija strony w bok").toBeLessThanOrEqual(0);

      await page.keyboard.press("Escape");
      await expect(wiersz).toHaveAttribute("aria-expanded", "false");
      await expect(wiersz).toBeFocused();

      await wiersz.click();
      await ekran.wybierz(page);
      await expect(wiersz).toHaveAttribute("aria-expanded", "false");
      await expect(wiersz).toBeFocused();
    });

    test(`${ekran.nazwa}: brak przewijania w bok przy 390 i 320 px`, async ({ page }) => {
      await otworz(page, ekran.adres);
      expect(await przewijanieWBok(page), "390 px").toBeLessThanOrEqual(0);
      await page.setViewportSize({ width: 320, height: 800 });
      await page.waitForLoadState("networkidle");
      expect(await przewijanieWBok(page), "320 px zwinięty").toBeLessThanOrEqual(0);
      await page.getByRole("button", { name: ekran.wiersz }).click();
      await expect(ekran.kontrolka(page)).toBeVisible();
      expect(await przewijanieWBok(page), "320 px rozwinięty").toBeLessThanOrEqual(0);
    });
  }
});

test.describe("zwinięte filtry, komputer 1280 px", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  for (const ekran of EKRANY) {
    test(`${ekran.nazwa}: bez wiersza zwiniętych filtrów, kontrolki stoją jak dotąd`, async ({ page }) => {
      await otworz(page, ekran.adres);
      await expect(page.getByRole("button", { name: ekran.wiersz }).filter({ visible: true })).toHaveCount(0);
      await expect(ekran.komputer(page)).toBeVisible();
      if (ekran.nazwa !== "Sprawy") await expect(ekran.kontrolka(page)).toBeVisible();
    });
  }
});
