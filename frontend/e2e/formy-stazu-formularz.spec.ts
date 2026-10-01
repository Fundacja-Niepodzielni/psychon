import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Formularz „Nowa forma” / „Edytuj formę” w słowniku form stażu (`/admin/formy-stazu`),
 * na buildzie produkcyjnym w dwóch szerokościach (makieta 2.0.4, `.dacts`, `.btn.q`):
 * - cztery kontrolki („Nazwa”, „Opis”, „Miejsce na liście”, „Stan”) mają tę samą lewą
 *   i prawą krawędź (|różnica| ≤ 1 px), mierzone z DOM;
 * - strona nie przewija się poziomo;
 * - „Anuluj” (przycisk cichy, nie odnośnik) i „Zapisz” stoją w jednym rzędzie i w widoku;
 * - domyślne miejsce nowej formy to następne wolne (lista 1, 2, 5 → 6);
 * - axe (wcag2a, wcag2aa, wcag21aa i best-practice) z otwartym formularzem: 0 naruszeń.
 * API i sesja Auth.js to atrapy w przeglądarce (`page.route`), bez zaplecza i bez IdP.
 */

const ATRAPA_SESJI = { accessToken: "atrapa-tokenu-testowego", expiresAt: Date.now() + 3_600_000 };
const API = "http://localhost:8000/api/v1";

const FORMY = [
  { id: 7, name: "Dyżur telefoniczny", description: "Rozmowa z osobą w kryzysie.", is_active: true, sort_order: 1, created_at: null, updated_at: null },
  { id: 8, name: "Dyżur na czacie", description: null, is_active: false, sort_order: 2, created_at: null, updated_at: null },
  { id: 9, name: "Inna", description: "Pozostałe formy.", is_active: true, sort_order: 5, created_at: null, updated_at: null },
];

function odpowiedz(dane: unknown, meta?: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }) };
}

/** Ogólna atrapa jest rejestrowana PIERWSZA — Playwright wybiera trasę zarejestrowaną później jako pierwszą. */
async function instalujAtrapy(page: Page): Promise<void> {
  await page.route(`${API}/**`, (route) => route.fulfill(odpowiedz([])));
  await page.route(`${API}/me`, (route) => route.fulfill(odpowiedz({ id: 1, role: "project_manager", first_name: "Anna" })));
  await page.route(`${API}/notifications**`, (route) =>
    route.fulfill(odpowiedz([], { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { unread: 0 } })),
  );
  await page.route(`${API}/admin/internship/forms`, (route) => route.fulfill(odpowiedz(FORMY)));
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(odpowiedz({ url: null })));
}

async function otworzSlownik(page: Page): Promise<void> {
  await instalujAtrapy(page);
  await page.goto("/admin/formy-stazu");
  await zabezpieczeniePrzedEkranemDostepu(page);
  await expect(page.getByText("Dyżur telefoniczny")).toBeVisible();
}

const KONTROLKI = ["forma-nazwa", "forma-opis", "forma-kolejnosc", "forma-aktywna"] as const;

async function krawedzie(page: Page): Promise<Record<string, { lewa: number; prawa: number }>> {
  const wynik: Record<string, { lewa: number; prawa: number }> = {};
  for (const id of KONTROLKI) {
    const pudelko = await page.locator(`#${id}`).boundingBox();
    expect(pudelko, `kontrolka #${id} ma prostokąt`).not.toBeNull();
    wynik[id] = { lewa: pudelko!.x, prawa: pudelko!.x + pudelko!.width };
  }
  return wynik;
}

async function sprawdzJednaSzerokosc(page: Page): Promise<void> {
  const k = await krawedzie(page);
  const opis = JSON.stringify(k);
  const wzorzec = k["forma-nazwa"];
  for (const id of KONTROLKI) {
    expect(Math.abs(k[id].lewa - wzorzec.lewa), `lewa krawędź ${id}: ${opis}`).toBeLessThanOrEqual(1);
    expect(Math.abs(k[id].prawa - wzorzec.prawa), `prawa krawędź ${id}: ${opis}`).toBeLessThanOrEqual(1);
  }
  const przewijanie = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(przewijanie.scroll, `scrollWidth ${przewijanie.scroll} > clientWidth ${przewijanie.client}`).toBeLessThanOrEqual(
    przewijanie.client,
  );
}

async function sprawdzPrzyciskiWRzedzie(page: Page): Promise<void> {
  const anuluj = page.getByRole("button", { name: "Anuluj", exact: true });
  const zapisz = page.getByRole("button", { name: "Zapisz", exact: true });
  await zapisz.scrollIntoViewIfNeeded();
  const a = (await anuluj.boundingBox())!;
  const z = (await zapisz.boundingBox())!;
  const okno = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const opis = JSON.stringify({ a, z, okno });

  expect(Math.abs(a.y + a.height / 2 - (z.y + z.height / 2)), `środki w pionie: ${opis}`).toBeLessThanOrEqual(1);
  expect(a.x + a.width, `„Anuluj” przed „Zapisz”: ${opis}`).toBeLessThanOrEqual(z.x);
  for (const pudelko of [a, z]) {
    expect(pudelko.x, opis).toBeGreaterThanOrEqual(0);
    expect(pudelko.y, opis).toBeGreaterThanOrEqual(0);
    expect(pudelko.x + pudelko.width, opis).toBeLessThanOrEqual(okno.w);
    expect(pudelko.y + pudelko.height, opis).toBeLessThanOrEqual(okno.h);
  }
}

/** „Anuluj” to przycisk cichy z makiety (`.btn.q`): element `button`, bez tła, widocznej ramki i podkreślenia. */
async function sprawdzAnulujJakPrzyciskCichy(anuluj: Locator): Promise<void> {
  expect(await anuluj.evaluate((el) => el.tagName)).toBe("BUTTON");
  await expect(anuluj).not.toHaveAttribute("href", /.*/);
  const styl = await anuluj.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      tlo: s.backgroundColor,
      ramka: s.borderTopColor,
      ramkaSzer: s.borderTopWidth,
      podkreslenie: s.textDecorationLine,
      wysokosc: el.getBoundingClientRect().height,
    };
  });
  const opis = JSON.stringify(styl);
  expect(styl.tlo, opis).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  expect(styl.ramka, opis).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  expect(styl.ramkaSzer, opis).toBe("1px");
  expect(styl.podkreslenie, opis).toBe("none");
  expect(styl.wysokosc, opis).toBeGreaterThanOrEqual(44);
}

for (const [nazwa, wymiary] of [
  ["1280 px", { width: 1280, height: 800 }],
  ["390 px", { width: 390, height: 844 }],
] as const) {
  test.describe(`słownik form stażu, formularz, ${nazwa}`, () => {
    test.use({ viewport: wymiary });

    test("Nowa forma: cztery kontrolki o równych krawędziach, bez przewijania poziomego, „Anuluj” i „Zapisz” w jednym rzędzie i w widoku", async ({ page }) => {
      await otworzSlownik(page);
      await page.getByRole("button", { name: "Dodaj formę" }).first().click();
      await expect(page.getByRole("heading", { level: 2, name: "Nowa forma" })).toBeVisible();

      await sprawdzJednaSzerokosc(page);
      await sprawdzPrzyciskiWRzedzie(page);
      await sprawdzAnulujJakPrzyciskCichy(page.getByRole("button", { name: "Anuluj", exact: true }));
      // Lista ma miejsca 1, 2, 5 — następne wolne to 6.
      await expect(page.locator("#forma-kolejnosc")).toHaveValue("6");
      await expect(page.getByText("1 = na górze listy form")).toBeVisible();
      await expect(page.locator("main")).not.toContainText(/Kolejność|sort order/i);
    });

    test("Edytuj formę: te same krawędzie, wartość miejsca z listy, „Anuluj” zamyka panel", async ({ page }) => {
      await otworzSlownik(page);
      await page.getByRole("button", { name: "Edytuj" }).nth(1).click();
      await expect(page.getByRole("heading", { level: 2, name: "Edytuj formę" })).toBeVisible();

      await sprawdzJednaSzerokosc(page);
      await sprawdzPrzyciskiWRzedzie(page);
      await expect(page.locator("#forma-kolejnosc")).toHaveValue("2");

      await page.getByRole("button", { name: "Anuluj", exact: true }).click();
      await expect(page.getByRole("heading", { level: 2, name: "Edytuj formę" })).toHaveCount(0);
    });

    test("axe (wcag2a, wcag2aa, wcag21aa, best-practice) z otwartym formularzem: 0 naruszeń", async ({ page }) => {
      await otworzSlownik(page);
      await page.getByRole("button", { name: "Dodaj formę" }).first().click();
      await expect(page.getByRole("heading", { level: 2, name: "Nowa forma" })).toBeVisible();
      await page.waitForFunction(() =>
        document.getAnimations().every((a) => a.constructor?.name !== "CSSTransition" || a.playState !== "running"),
      );
      const wynik = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "best-practice"]).analyze();
      const opis = wynik.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
      expect(opis, opis.join("\n")).toEqual([]);
    });
  });
}
