import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Miara: formularz będący treścią strony od wejścia nie zabiera fokusu, więc
 * po załadowaniu ekranu pierwszy Tab trafia w odnośnik „Przejdź do treści”
 * (a nie w pole formularza, które stałoby wcześniej w kolejności fokusu).
 * Dotyczy ekranów `/admin/ekran-startowy` i `/admin/wzory-dokumentow` przy
 * włączonej grupie przełączenia (`wzoryDokumentow`, `ekranStartowy`),
 * w szerokości 1280 i 390 px. Atrapy API i sesji jak w
 * `przelaczenie-grupa-administracja-b3.spec.ts`.
 */

const ATRAPA_SESJI = {
  accessToken: "atrapa-tokenu-testowego",
  expiresAt: Date.now() + 3_600_000,
};

const EKRAN_STARTOWY = {
  video: { title: "Film powitalny", url: null, caption: null },
  program: { title: "Przebieg programu", body: "Treść o programie." },
  expectations: { title: "Oczekiwania", body: "Treść o oczekiwaniach." },
  updated_at: null,
};

function odpowiedz(dane: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify({ data: dane }) };
}

/** Ogólna atrapa jest rejestrowana PIERWSZA — Playwright wybiera trasę zarejestrowaną PÓŹNIEJ jako pierwszą. */
async function instalujAtrapyApi(page: Page): Promise<void> {
  await page.route("http://localhost:8000/api/v1/**", (route) => route.fulfill(odpowiedz([])));
  await page.route("http://localhost:8000/api/v1/me", (route) =>
    route.fulfill(odpowiedz({ id: 1, role: "project_manager", program_completed_at: null })),
  );
  await page.route("http://localhost:8000/api/v1/notifications**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [],
        meta: { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { unread: 0 } },
      }),
    }),
  );
  await page.route("http://localhost:8000/api/v1/admin/dashboard", (route) =>
    route.fulfill(odpowiedz({ counters: { participants: 0, completed: 0, certificates: 0 }, queues: [] })),
  );
  await page.route("http://localhost:8000/api/v1/document-templates/agreement", (route) =>
    route.fulfill(
      odpowiedz({
        type: "agreement",
        content: "<p>Treść porozumienia</p>",
        version: 2,
        updated_at: "2026-09-28T10:00:00Z",
        updated_by: { id: 5, name: "Anna Testowa" },
      }),
    ),
  );
  await page.route("http://localhost:8000/api/v1/document-templates/agreement/versions", (route) =>
    route.fulfill(odpowiedz([{ version: 2, updated_at: "2026-09-28T10:00:00Z", updated_by: { id: 5, name: "Anna Testowa" } }])),
  );
  await page.route("http://localhost:8000/api/v1/onboarding", (route) => route.fulfill(odpowiedz(EKRAN_STARTOWY)));

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(odpowiedz({ url: null })));
}

const EKRANY = [
  {
    adres: "/admin/ekran-startowy",
    naglowek: /^Treść ekranu „Zacznij tutaj”$/,
    pole: "#ekran-startowy-video-title",
  },
  {
    adres: "/admin/wzory-dokumentow",
    naglowek: /^Wzory dokumentów$/,
    pole: "#tresc-wzoru",
  },
] as const;

const SZEROKOSCI = [
  { nazwa: "1280", viewport: { width: 1280, height: 800 } },
  { nazwa: "390", viewport: { width: 390, height: 844 } },
] as const;

for (const szerokosc of SZEROKOSCI) {
  test.describe(`fokus przy wejściu na ekran — ${szerokosc.nazwa} px`, () => {
    test.use({ viewport: szerokosc.viewport });

    for (const ekran of EKRANY) {
      test(`${ekran.adres}: po załadowaniu pole nie ma fokusu, pierwszy Tab trafia w „Przejdź do treści”`, async ({ page }) => {
        await instalujAtrapyApi(page);

        await page.goto(ekran.adres);
        await zabezpieczeniePrzedEkranemDostepu(page);
        await expect(page.getByRole("heading", { level: 1, name: ekran.naglowek })).toBeVisible();

        const pole = page.locator(ekran.pole);
        await expect(pole).toBeVisible();
        await expect(pole).not.toBeFocused();
        expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);

        await page.keyboard.press("Tab");
        await expect(page.getByRole("link", { name: "Przejdź do treści" })).toBeFocused();
        await expect(pole).not.toBeFocused();
      });
    }
  });
}
