import { expect, test, type Locator, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Menu nowej ramki uczestnika zalogowanego jako student (`/panel/pulpit`):
 * linia „W przygotowaniu” w grupie „Program” nie zapowiada dziennika stażu
 * ani superwizji, których rola student nie ma — brzmi „pytania i odpowiedzi ·
 * ścieżka programu · zaświadczenie o ukończeniu kursu”. Miara na 1280×800
 * (menu boczne) i 390×844 (okno menu otwarte). API i sesja Auth.js są
 * atrapami (`page.route`), jak w `ramka-uczestnika.spec.ts`.
 *
 * Gdy ustawiona jest zmienna `ZRZUTY_DROBNE` (ścieżka z przedrostkiem nazwy
 * pliku), scenariusz zapisuje zrzut ekranu z menu — wyłącznie do oglądania.
 */

const API = "http://localhost:8000/api/v1";
const STRONA = { current_page: 1, per_page: 100, total: 0, last_page: 1 };
const LINIA_PROGRAMU = "W przygotowaniu: pytania i odpowiedzi · ścieżka programu · zaświadczenie o ukończeniu kursu.";

async function odpowiedz(page: Page, wzorzec: string, cialo: unknown): Promise<void> {
  await page.route(wzorzec, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cialo) }),
  );
}

/** Ogólna atrapa jest rejestrowana PRZED szczegółowymi (późniejsza trasa wygrywa). */
async function instalujAtrapyStudenta(page: Page): Promise<void> {
  await odpowiedz(page, `${API}/**`, { data: [], meta: STRONA });
  await odpowiedz(page, `${API}/me`, { data: { id: 1, role: "student", first_name: "Ola", program_completed_at: null } });
  await odpowiedz(page, `${API}/notifications**`, { data: [], meta: { ...STRONA, extra: { unread: 0 } } });
  await odpowiedz(page, "**/api/auth/session", { accessToken: "atrapa-tokenu-testowego", expiresAt: Date.now() + 3_600_000 });
  await odpowiedz(page, "**/api/auth/end-session-url", { data: { url: null } });
}

async function menuWidoczne(page: Page, szerokosc: number): Promise<Locator> {
  if (szerokosc >= 1024) {
    return page.getByRole("complementary", { name: "Menu i konto" }).getByRole("navigation", { name: "Menu — Panel uczestnika" });
  }
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const okno = page.getByRole("dialog", { name: "Menu i konto" });
  await expect(okno).toBeVisible();
  return okno.getByRole("navigation", { name: "Menu — Panel uczestnika" });
}

const ROZMIARY = [
  { nazwa: "1280", szerokosc: 1280, wysokosc: 800 },
  { nazwa: "390", szerokosc: 390, wysokosc: 844 },
];

for (const rozmiar of ROZMIARY) {
  test.describe(`menu studenta w nowej ramce, ${rozmiar.nazwa} px`, () => {
    test.use({ viewport: { width: rozmiar.szerokosc, height: rozmiar.wysokosc } });

    test("linia „W przygotowaniu” grupy „Program” bez dziennika stażu i superwizji", async ({ page }) => {
      await instalujAtrapyStudenta(page);
      await page.goto("/panel/pulpit");
      await zabezpieczeniePrzedEkranemDostepu(page);
      const nav = await menuWidoczne(page, rozmiar.szerokosc);
      await expect(nav.getByRole("link", { name: "Pulpit" })).toBeVisible();
      const linie = nav.locator("p").filter({ hasText: /^W przygotowaniu/ });
      await expect(linie.first()).toBeVisible();

      const zrzuty = process.env.ZRZUTY_DROBNE;
      if (zrzuty) await page.screenshot({ path: `${zrzuty}-menu-studenta-${rozmiar.nazwa}.png` });

      const teksty = (await linie.allTextContents()).map((t) => t.trim());
      expect(teksty, `linie „W przygotowaniu”: ${JSON.stringify(teksty)}`).toContain(LINIA_PROGRAMU);
      for (const tekst of teksty) {
        expect(tekst, "bez dziennika stażu").not.toContain("dziennik stażu");
        expect(tekst, "bez superwizji").not.toContain("superwizja");
      }
    });
  });
}
