import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Pulpit administracji `/admin`: przycisk główny „Otwórz sprawy” prowadzi do
 * ekranu „Sprawy” (`/admin/sprawy`, wszystkie rodzaje spraw), nigdy do listy
 * osób. Kolejka profili nazywa się na liście „Wnioski o profil psychologa”,
 * tak samo jak na ekranie „Sprawy”. Miara na 1280×800 i 390×844, API i sesja
 * Auth.js są atrapami (`page.route`).
 *
 * Gdy ustawiona jest zmienna `ZRZUTY_DROBNE` (ścieżka z przedrostkiem nazwy
 * pliku), scenariusz zapisuje zrzut pulpitu — wyłącznie do oglądania.
 */

const API = "http://localhost:8000/api/v1";
const STRONA = { current_page: 1, per_page: 25, total: 0, last_page: 1 };

/** Linki kolejek tak, jak je dziś podaje zaplecze (zgłoszenia — lista osób). */
const PULPIT = {
  counters: { participants: 137, completed: 29, certificates: 23 },
  queues: [
    { key: "applications", count: 4, link: "/admin/uczestniczki" },
    { key: "internship_entries", count: 7, link: "/admin/staz" },
    { key: "profiles", count: 2, link: "/admin/profile" },
    { key: "questions", count: 3, link: "/prowadzacy/pytania" },
  ],
};

async function odpowiedz(page: Page, wzorzec: string, cialo: unknown): Promise<void> {
  await page.route(wzorzec, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cialo) }),
  );
}

/** Ogólna atrapa jest rejestrowana PRZED szczegółowymi (późniejsza trasa wygrywa). */
async function instalujAtrapy(page: Page): Promise<void> {
  await odpowiedz(page, `${API}/**`, { data: [], meta: STRONA });
  await odpowiedz(page, `${API}/me`, { data: { id: 1, role: "project_manager", first_name: "Anna", program_completed_at: null } });
  await odpowiedz(page, `${API}/admin/dashboard`, { data: PULPIT });
  await odpowiedz(page, `${API}/notifications**`, { data: [], meta: { ...STRONA, extra: { unread: 0 } } });
  await odpowiedz(page, "**/api/auth/session", { accessToken: "atrapa-tokenu-testowego", expiresAt: Date.now() + 3_600_000 });
  await odpowiedz(page, "**/api/auth/end-session-url", { data: { url: null } });
}

const ROZMIARY = [
  { nazwa: "1280", szerokosc: 1280, wysokosc: 800 },
  { nazwa: "390", szerokosc: 390, wysokosc: 844 },
];

for (const rozmiar of ROZMIARY) {
  test.describe(`pulpit administracji, „Otwórz sprawy”, ${rozmiar.nazwa} px`, () => {
    test.use({ viewport: { width: rozmiar.szerokosc, height: rozmiar.wysokosc } });

    test("„Otwórz sprawy” prowadzi do ekranu „Sprawy”, nie do listy osób; kolejka profili to „Wnioski o profil psychologa”", async ({
      page,
    }) => {
      await instalujAtrapy(page);
      await page.goto("/admin");
      await zabezpieczeniePrzedEkranemDostepu(page);
      const przycisk = page.getByRole("button", { name: "Otwórz sprawy" });
      await expect(przycisk).toBeVisible();
      await expect(page.getByText("Wnioski o profil psychologa", { exact: true })).toBeVisible();
      await expect(page.getByText("Profile prowadzących do decyzji")).toHaveCount(0);

      const zrzuty = process.env.ZRZUTY_DROBNE;
      if (zrzuty) await page.screenshot({ path: `${zrzuty}-pulpit-administracji-${rozmiar.nazwa}.png`, fullPage: true });

      await przycisk.click();
      await expect(page).toHaveURL(/\/admin\/sprawy$/);
      expect(new URL(page.url()).pathname).not.toBe("/admin/uczestniczki");
    });
  });
}
