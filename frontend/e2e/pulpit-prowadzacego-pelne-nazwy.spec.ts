import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Pulpit prowadzącego `/prowadzacy`: karty „Nadchodzące superwizje” i „Moja
 * grupa” zostają, a przyciski w ich wierszach mają pełne nazwy — „Zobacz
 * terminy superwizji” i „Zobacz swoją grupę” (dotąd oba „Otwórz grupę”).
 * Miara na 1280×800 i 390×844, API i sesja Auth.js są atrapami (`page.route`).
 *
 * Gdy ustawiona jest zmienna `ZRZUTY_DROBNE` (ścieżka z przedrostkiem nazwy
 * pliku), scenariusz zapisuje zrzut pulpitu — wyłącznie do oglądania.
 */

const API = "http://localhost:8000/api/v1";
const STRONA = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

async function odpowiedz(page: Page, wzorzec: string, cialo: unknown): Promise<void> {
  await page.route(wzorzec, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cialo) }),
  );
}

/** Ogólna atrapa jest rejestrowana PRZED szczegółowymi (późniejsza trasa wygrywa). */
async function instalujAtrapy(page: Page): Promise<void> {
  await odpowiedz(page, `${API}/**`, { data: [], meta: STRONA });
  await odpowiedz(page, `${API}/me`, { data: { id: 1, role: "instructor" } });
  await odpowiedz(page, `${API}/instructor/group`, {
    data: {
      members: [1, 2].map((numer) => ({
        id: 100 + numer,
        first_name: `Osoba${numer}`,
        last_name: "Demo",
        progress: { courses_done: 2, courses_total: 10, hours_accepted: "41.5", supervision_present: 5, workshop_done: false },
      })),
      slots: [
        {
          id: 7,
          starts_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
          duration_minutes: 90,
          seats_limit: 8,
          location_or_link: "https://example.org/spotkanie",
          active_signups_count: 3,
          available_seats: 5,
          can_mark_attendance: false,
          signups: [],
        },
      ],
    },
  });
  await odpowiedz(page, `${API}/instructor/courses`, {
    data: [{ id: 5, slug: "wywiad", title: "Wywiad psychologiczny", sequence_order: 2 }],
  });
  await odpowiedz(page, `${API}/notifications**`, { data: [], meta: { ...STRONA, extra: { unread: 0 } } });
  await odpowiedz(page, "**/api/auth/session", { accessToken: "atrapa-tokenu-testowego", expiresAt: Date.now() + 3_600_000 });
  await odpowiedz(page, "**/api/auth/end-session-url", { data: { url: null } });
}

const ROZMIARY = [
  { nazwa: "1280", szerokosc: 1280, wysokosc: 800 },
  { nazwa: "390", szerokosc: 390, wysokosc: 844 },
];

for (const rozmiar of ROZMIARY) {
  test.describe(`pulpit prowadzącego, pełne nazwy przycisków, ${rozmiar.nazwa} px`, () => {
    test.use({ viewport: { width: rozmiar.szerokosc, height: rozmiar.wysokosc } });

    test("wiersz terminu: „Zobacz terminy superwizji”, wiersz osoby: „Zobacz swoją grupę”, bez „Otwórz grupę”", async ({ page }) => {
      await instalujAtrapy(page);
      await page.goto("/prowadzacy");
      await zabezpieczeniePrzedEkranemDostepu(page);
      const superwizje = page.locator("section").filter({ has: page.getByRole("heading", { name: "Nadchodzące superwizje" }) });
      const grupa = page.locator("section").filter({ has: page.getByRole("heading", { name: "Moja grupa" }) });
      await expect(superwizje.getByRole("link", { name: "Zobacz terminy superwizji" })).toHaveCount(1);
      await expect(grupa.getByRole("link", { name: "Zobacz swoją grupę" })).toHaveCount(2);

      const zrzuty = process.env.ZRZUTY_DROBNE;
      if (zrzuty) await page.screenshot({ path: `${zrzuty}-pulpit-prowadzacego-${rozmiar.nazwa}.png`, fullPage: true });

      for (const odnosnik of [
        ...(await superwizje.getByRole("link", { name: "Zobacz terminy superwizji" }).all()),
        ...(await grupa.getByRole("link", { name: "Zobacz swoją grupę" }).all()),
      ]) {
        await expect(odnosnik).toHaveAttribute("href", "/prowadzacy/grupa");
        await expect(odnosnik).toBeVisible();
      }
      await expect(page.getByText("Otwórz grupę", { exact: true })).toHaveCount(0);
    });
  });
}
