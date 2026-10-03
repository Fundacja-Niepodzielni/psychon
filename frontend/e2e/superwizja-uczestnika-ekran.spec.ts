import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";
import { GRUPY } from "../lib/przelaczenie/grupy";

/**
 * Superwizja osoby wolontariackiej pod adresem produktu `/panel/superwizja`
 * (grupa `superwizjaUczestnika`, nowa ramka), na zbudowanej aplikacji, z atrapą
 * API i atrapą sesji, na 1280 i 390 px. W każdym oknie: odpowiedź 200, jeden
 * `main`, nagłówek „Superwizja”, części „Twoje terminy” i „Wolne terminy”, brak
 * przewijania w poziomie, axe = 0; okno wypisu ma potwierdzenie we wspólnym
 * wariancie „niebezpieczne” (czerwone tło, biały napis). Zrzuty całej strony
 * powstają tylko przy ustawionej zmiennej `PW_ZRZUTY`.
 */

const API = "http://localhost:8000/api/v1";

const ATRAPA_SESJI = {
  accessToken: ["atrapa", "tokenu", "testowego"].join("-"),
  expiresAt: Date.now() + 3_600_000,
};

function termin(id: number, nadpisz: Record<string, unknown> = {}) {
  return {
    id,
    starts_at: "2026-10-15T12:00:00Z",
    duration_minutes: 60,
    seats_limit: 6,
    location_or_link: null,
    active_signups_count: 2,
    available_seats: 4,
    is_full: false,
    can_sign_up: true,
    signup: null,
    ...nadpisz,
  };
}

const TERMINY = [
  termin(1, {
    starts_at: "2026-09-10T09:00:00Z",
    location_or_link: "Sala szkoleniowa, piętro 1",
    active_signups_count: 5,
    available_seats: 1,
    can_sign_up: false,
    signup: { signed_up_at: "2026-09-01T10:00:00Z", attendance: "present" },
  }),
  termin(3, {
    starts_at: "2026-10-08T12:00:00Z",
    location_or_link: "https://przyklad.test/superwizja-1",
    active_signups_count: 3,
    available_seats: 3,
    signup: { signed_up_at: "2026-09-01T10:00:00Z", attendance: null },
  }),
  termin(4),
  termin(5, { starts_at: "2026-10-22T12:00:00Z", active_signups_count: 6, available_seats: 0, is_full: true }),
  termin(6, { starts_at: "2026-10-29T13:00:00Z", duration_minutes: 90, active_signups_count: 1, available_seats: 5 }),
];

const META = { current_page: 1, per_page: 25, total: TERMINY.length, last_page: 1 };

function json(dane: unknown, meta?: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }) };
}

async function instalujAtrapy(page: Page): Promise<void> {
  await page.route(`${API}/**`, (route) => route.fulfill(json([], { current_page: 1, per_page: 100, total: 0, last_page: 1 })));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(json({ id: 17, role: "volunteer", first_name: "Marta", last_name: "Demo", program_completed_at: null })),
  );
  await page.route(`${API}/notifications**`, (route) =>
    route.fulfill(json([], { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { unread: 0 } })),
  );
  await page.route(`${API}/supervision/slots**`, (route) => route.fulfill(json(TERMINY, META)));
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json({ url: null })));
}

async function zrzut(page: Page, nazwa: string): Promise<void> {
  const katalog = process.env.PW_ZRZUTY;
  if (!katalog) return;
  mkdirSync(katalog, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(katalog, `${nazwa}.png`), fullPage: true, animations: "disabled" });
}

const OKNA = [
  { szerokosc: 1280, wysokosc: 800 },
  { szerokosc: 390, wysokosc: 844 },
];

for (const { szerokosc, wysokosc } of OKNA) {
  test.describe(`superwizja uczestnika — ${szerokosc} px`, () => {
    test.skip(!GRUPY.superwizjaUczestnika.wlaczona, "grupa superwizji uczestnika jest wyłączona");
    test.use({ viewport: { width: szerokosc, height: wysokosc } });

    test("ekran nowego frontu pod /panel/superwizja: nagłówek, części, bez przewijania w bok, axe = 0", async ({ page }, testInfo) => {
      await instalujAtrapy(page);
      const odpowiedz = await page.goto("/panel/superwizja");
      expect(odpowiedz?.status()).toBe(200);
      await zabezpieczeniePrzedEkranemDostepu(page);

      await expect(page.getByRole("heading", { level: 1, name: "Superwizja" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: "Twoje terminy" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: "Wolne terminy" })).toBeVisible();
      await expect(page.locator("main")).toHaveCount(1);

      const nadmiar = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(nadmiar).toBeLessThanOrEqual(0);

      const naruszenia = await uruchomAxe(page);
      await dolaczNaruszeniaDoRaportu(testInfo, `superwizja-${szerokosc}`, naruszenia);
      expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);

      await zrzut(page, `nowy-${szerokosc}`);
    });

    test("okno wypisu: potwierdzenie w wariancie „niebezpieczne” — czerwone tło, biały napis", async ({ page }) => {
      await instalujAtrapy(page);
      await page.goto("/panel/superwizja");
      await page.getByRole("button", { name: "Wypisz się z terminu 8 października 2026, 14:00" }).click();
      const okno = page.getByRole("dialog", { name: "Wypisać Cię z terminu?" });
      await expect(okno).toBeVisible();
      const potwierdz = okno.getByRole("button", { name: "Wypisz się" });
      const barwy = await potwierdz.evaluate((element) => {
        const styl = getComputedStyle(element);
        return { tlo: styl.backgroundColor, napis: styl.color };
      });
      expect(barwy).toEqual({ tlo: "rgb(178, 51, 36)", napis: "rgb(255, 255, 255)" });
      await zrzut(page, `nowy-${szerokosc}-okno-wypisu`);
    });
  });
}
