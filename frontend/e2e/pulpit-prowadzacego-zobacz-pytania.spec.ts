import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Pulpit prowadzącego, przycisk główny w nagłówku (makieta 2.0.4,
 * `goPytL`): przy pytaniach bez odpowiedzi „Odpowiedz na pytania”, przy zerze
 * pytań AKTYWNY „Zobacz pytania”. W obu stanach jedyny przycisk w kolorze,
 * w nagłówku na wysokości h1 (1280 px) albo pod opisem na całą szerokość
 * (390 px), a w treści nie ma nieaktywnego przycisku obrysowego ani zdania
 * „Nie ma pytań bez odpowiedzi.”.
 */

const ATRAPA_SESJI = { accessToken: "atrapa-tokenu-testowego", expiresAt: Date.now() + 3_600_000 };
const API = "http://localhost:8000/api/v1";
const STRONA = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

async function odpowiedz(page: Page, wzorzec: string, cialo: unknown): Promise<void> {
  await page.route(wzorzec, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cialo) }),
  );
}

const PYTANIE = {
  id: 1,
  lesson_id: 21,
  question: "Jak zacząć rozmowę z osobą w kryzysie?",
  answer: null,
  answered_by: null,
  answered_by_name: null,
  answered_at: null,
  created_at: "2026-09-30T08:00:00Z",
  updated_at: "2026-09-30T08:00:00Z",
  user: { id: 17, first_name: "Marta", last_name: "Demo" },
  lesson: { id: 21, title: "Wprowadzenie do wywiadu", course: { id: 2, slug: "wywiad", title: "Wywiad psychologiczny" } },
};

async function atrapy(page: Page, pytania: number): Promise<void> {
  await odpowiedz(page, `${API}/**`, { data: [], meta: STRONA });
  await odpowiedz(page, `${API}/me`, { data: { id: 1, role: "instructor" } });
  await odpowiedz(page, `${API}/instructor/group`, {
    data: {
      members: [
        {
          id: 100,
          first_name: "Osoba",
          last_name: "Demo",
          progress: { courses_done: 2, courses_total: 10, hours_accepted: "41.5", supervision_present: 5, workshop_done: false },
        },
      ],
      slots: [],
    },
  });
  await odpowiedz(page, `${API}/instructor/questions**`, {
    data: pytania > 0 ? [PYTANIE] : [],
    meta: { ...STRONA, total: pytania, extra: { unanswered: pytania } },
  });
  await odpowiedz(page, `${API}/instructor/courses`, {
    data: [{ id: 5, slug: "wywiad", title: "Wywiad psychologiczny", sequence_order: 2 }],
  });
  await odpowiedz(page, "**/api/auth/session", ATRAPA_SESJI);
  await odpowiedz(page, "**/api/auth/end-session-url", { data: { url: null } });
}

for (const [nazwa, wymiary] of [
  ["1280 px", { width: 1280, height: 800 }],
  ["390 px", { width: 390, height: 844 }],
] as const) {
  test.describe(`pulpit prowadzącego, przycisk główny, ${nazwa}`, () => {
    test.use({ viewport: wymiary });

    for (const [pytania, etykieta] of [
      [0, "Zobacz pytania"],
      [1, "Odpowiedz na pytania"],
    ] as const) {
      test(`${pytania} pytań: aktywny „${etykieta}” w nagłówku, jedyny w kolorze`, async ({ page }) => {
        await atrapy(page, pytania);
        await page.goto("/prowadzacy");
        await zabezpieczeniePrzedEkranemDostepu(page);
        const przycisk = page.getByRole("button", { name: etykieta, exact: true });
        await expect(przycisk).toHaveCount(1);
        await expect(przycisk).toBeEnabled();
        await expect(przycisk).not.toHaveAttribute("aria-disabled", "true");
        expect(await page.locator("main button[class*='primary']").count()).toBe(1);
        await expect(page.getByText("Nie ma pytań bez odpowiedzi.")).toHaveCount(0);
        await expect(page.locator("main button[disabled]")).toHaveCount(0);

        const h1 = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
        const b = (await przycisk.boundingBox())!;
        if (wymiary.width >= 768) {
          expect(Math.abs(b.y - h1.y)).toBeLessThanOrEqual(12);
          expect(b.width).toBeLessThanOrEqual(320);
        } else {
          expect(b.y).toBeGreaterThan(h1.y);
        }
      });
    }

    test("klik w „Zobacz pytania” prowadzi do skrzynki pytań", async ({ page }) => {
      await atrapy(page, 0);
      await page.goto("/prowadzacy");
      await zabezpieczeniePrzedEkranemDostepu(page);
      await page.getByRole("button", { name: "Zobacz pytania", exact: true }).click();
      await page.waitForURL(/\/prowadzacy\/pytania$/);
    });
  });
}
