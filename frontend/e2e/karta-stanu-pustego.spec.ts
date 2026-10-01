import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Karta stanu pustego na zbudowanej aplikacji, przy 1280, 390 i 1440 px, z
 * liczbami z `getBoundingClientRect` (bez wartości wpisanych na sztywno):
 * - `/admin/wzory-dokumentow` (brak wzoru, 404 odczytu wzoru) i
 *   `/panel/dalsza-wspolpraca` (program w toku) pokazują stan pusty w białej
 *   karcie (`data-testid="karta-stanu-pustego"`);
 * - środek tekstu nagłówka i środek przycisku leżą w osi karty (|różnica| <= 1 px);
 * - karta zajmuje całą szerokość obszaru treści (|różnica| <= 1 px względem
 *   pola treści `main` bez wypełnienia) — także przy 1440 px, gdzie szablon
 *   szczegółu dzieli treść na kolumny 7/5;
 * - brak przewijania w poziomie.
 * Środek tekstu mierzony zakresem (`Range`), żeby odróżnić wyśrodkowany tekst
 * od wyśrodkowanego pudełka. Backend nie jest stawiany: każde żądanie
 * `/api/v1/*` ma atrapę, sesja Auth.js też.
 */

const API = "http://localhost:8000/api/v1";
const ATRAPA_SESJI = { accessToken: "atrapa-tokenu-testowego", expiresAt: Date.now() + 3_600_000 };
const META = { current_page: 1, per_page: 25, total: 0, last_page: 1 };

function koperta(dane: unknown, meta?: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }) };
}

/** Atrapy wspólne: ogólna pierwsza (Playwright bierze trasę zarejestrowaną później). */
async function instalujAtrapy(page: Page, rola: string): Promise<void> {
  await page.route(`${API}/**`, (route) => route.fulfill(koperta([], META)));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(koperta({ id: 1, role: rola, first_name: "Anna", last_name: "Demo", program_completed_at: null })),
  );
  await page.route(`${API}/notifications**`, (route) => route.fulfill(koperta([], { ...META, extra: { unread: 0 } })));
  await page.route(`${API}/admin/edition`, (route) =>
    route.fulfill(koperta({ id: 1, name: "Edycja 2026", starts_at: "2026-10-01", ends_at: "2027-03-31" })),
  );
  await page.route(`${API}/admin/dashboard`, (route) =>
    route.fulfill(koperta({ counters: { participants: 0, completed: 0, certificates: 0 }, queues: [] })),
  );
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(koperta({ url: null })));
}

interface Pomiar {
  szerokoscKarty: number;
  szerokoscPolaTresci: number;
  lewyKarty: number;
  lewyPolaTresci: number;
  srodekKarty: number;
  srodekNaglowka: number;
  srodekPrzycisku: number;
  przyciskow: number;
  przewijaniePoziome: number;
}

async function zmierz(page: Page): Promise<Pomiar> {
  return page.evaluate(() => {
    const karta = document.querySelector<HTMLElement>('[data-testid="karta-stanu-pustego"]');
    if (!karta) throw new Error("brak karty stanu pustego");
    const main = karta.closest("main");
    const naglowek = karta.querySelector("h2");
    const przyciski = karta.querySelectorAll("button");
    if (!main || !naglowek || przyciski.length === 0) throw new Error("brak main, nagłówka albo przycisku w karcie");
    const srodek = (r: { left: number; width: number }) => r.left + r.width / 2;
    const zakres = document.createRange();
    zakres.selectNodeContents(naglowek);
    const styl = getComputedStyle(main);
    const polo = main.getBoundingClientRect();
    const lewyPola = polo.left + parseFloat(styl.paddingLeft) + parseFloat(styl.borderLeftWidth);
    const prawyPola = polo.right - parseFloat(styl.paddingRight) - parseFloat(styl.borderRightWidth);
    const k = karta.getBoundingClientRect();
    return {
      szerokoscKarty: k.width,
      szerokoscPolaTresci: prawyPola - lewyPola,
      lewyKarty: k.left,
      lewyPolaTresci: lewyPola,
      srodekKarty: srodek(k),
      srodekNaglowka: srodek(zakres.getBoundingClientRect()),
      srodekPrzycisku: srodek(przyciski[0].getBoundingClientRect()),
      przyciskow: przyciski.length,
      przewijaniePoziome: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

function sprawdz(pomiar: Pomiar): void {
  expect(pomiar.przyciskow, "jedyny przycisk karty").toBe(1);
  expect(Math.abs(pomiar.srodekNaglowka - pomiar.srodekKarty), "środek nagłówka wobec osi karty").toBeLessThanOrEqual(1);
  expect(Math.abs(pomiar.srodekPrzycisku - pomiar.srodekKarty), "środek przycisku wobec osi karty").toBeLessThanOrEqual(1);
  expect(Math.abs(pomiar.szerokoscKarty - pomiar.szerokoscPolaTresci), "szerokość karty wobec pola treści").toBeLessThanOrEqual(1);
  expect(Math.abs(pomiar.lewyKarty - pomiar.lewyPolaTresci), "lewa krawędź karty wobec pola treści").toBeLessThanOrEqual(1);
  expect(pomiar.przewijaniePoziome, "przewijanie w poziomie").toBe(0);
}

const SZEROKOSCI = [1280, 390, 1440] as const;

test.describe("karta stanu pustego na zbudowanej aplikacji", () => {
  for (const szerokosc of SZEROKOSCI) {
    test(`/admin/wzory-dokumentow, brak wzoru @${szerokosc}: karta, oś, szerokość treści`, async ({ page }) => {
      await page.setViewportSize({ width: szerokosc, height: 800 });
      await instalujAtrapy(page, "project_manager");
      await page.route(`${API}/document-templates/**`, (route) =>
        route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: { status: 404, code: "not_found", message: "Nie znaleziono." } }),
        }),
      );

      await page.goto("/admin/wzory-dokumentow");
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.getByRole("heading", { level: 2, name: "Brak wzoru tego typu" })).toBeVisible();
      await expect(page.getByTestId("karta-stanu-pustego")).toHaveCount(1);
      await expect(page.getByTestId("karta-stanu-pustego")).toContainText(
        "Dla tego rodzaju dokumentu nie ma jeszcze zapisanego wzoru. Dokumenty tego rodzaju powstają z wbudowanego wzoru.",
      );
      sprawdz(await zmierz(page));
    });

    test(`/panel/dalsza-wspolpraca, program w toku @${szerokosc}: karta, oś, szerokość treści`, async ({ page }) => {
      await page.setViewportSize({ width: szerokosc, height: 800 });
      await instalujAtrapy(page, "volunteer");

      await page.goto("/panel/dalsza-wspolpraca");
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.getByRole("heading", { level: 2, name: "Ten ekran otworzy się po ukończeniu programu" })).toBeVisible();
      await expect(page.getByTestId("karta-stanu-pustego")).toHaveCount(1);
      sprawdz(await zmierz(page));
    });
  }
});
