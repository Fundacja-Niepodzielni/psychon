import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Student otwiera ręcznie cztery strony panelu uczestnika przeznaczone tylko dla wolontariusza
 * (dziennik stażu, superwizja, certyfikat, profil psychologa): zamiast formularza i danych
 * ekranu dostaje wspólny ekran odmowy nowej ramki („Nie masz dostępu do tego ekranu”, zdanie
 * o roli i jeden przycisk powrotu do pulpitu). Miara na 1280×800 i 390×844. API i sesja
 * Auth.js są atrapami (`page.route`), jak w `menu-studenta-w-przygotowaniu.spec.ts`.
 *
 * Gdy ustawiona jest zmienna `ZRZUTY_DROBNE` (katalog zakończony ukośnikiem), każdy
 * scenariusz zapisuje zrzut ekranu odmowy — wyłącznie do oglądania.
 */

const API = "http://localhost:8000/api/v1";
const STRONA = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

const STRONY = [
  { klucz: "staz", adres: "/panel/staz" },
  { klucz: "superwizja", adres: "/panel/superwizja" },
  { klucz: "certyfikat", adres: "/panel/certyfikat" },
  { klucz: "profil-psychologa", adres: "/panel/profil-psychologa" },
] as const;

const ROZMIARY = [
  { nazwa: "1280", szerokosc: 1280, wysokosc: 800 },
  { nazwa: "390", szerokosc: 390, wysokosc: 844 },
] as const;

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

for (const rozmiar of ROZMIARY) {
  test.describe(`odmowa studenta na stronach wolontariusza, ${rozmiar.nazwa} px`, () => {
    test.use({ viewport: { width: rozmiar.szerokosc, height: rozmiar.wysokosc } });

    for (const strona of STRONY) {
      test(`${strona.adres}: ekran odmowy zamiast formularza`, async ({ page }) => {
        await instalujAtrapyStudenta(page);
        const zadania: string[] = [];
        page.on("request", (zadanie) => {
          if (zadanie.url().startsWith(API)) zadania.push(new URL(zadanie.url()).pathname.replace("/api/v1", ""));
        });
        await page.goto(strona.adres);
        await zabezpieczeniePrzedEkranemDostepu(page);

        const naglowek = page.getByRole("heading", { level: 1, name: "Nie masz dostępu do tego ekranu" });
        await expect(naglowek).toBeVisible();
        await expect(page.getByText("Twoja rola: Student. Ten ekran jest dla wolontariuszy.")).toBeVisible();
        await expect(page.getByRole("button", { name: "Wróć do pulpitu" })).toBeVisible();

        const zrzuty = process.env.ZRZUTY_DROBNE;
        if (zrzuty) await page.screenshot({ path: `${zrzuty}odmowa-studenta-po-${strona.klucz}-${rozmiar.nazwa}.png`, fullPage: true });

        // Strona nie pobiera danych ekranu: żadne żądanie nie dotyczy dziennika stażu, superwizji, certyfikatu ani profilu psychologa.
        await page.waitForLoadState("networkidle");
        const danychEkranu = zadania.filter((sciezka) => /^\/(internship|supervision|certificate|psychologist-profile)(\/|$)/.test(sciezka));
        expect(danychEkranu, `żądania: ${JSON.stringify(zadania)}`).toEqual([]);
        expect(zadania).toContain("/me");

        // Bez formularza i pól ekranu; stary ekran „Błąd 403” się nie pojawia.
        await expect(page.locator("main form")).toHaveCount(0);
        await expect(page.locator("main input, main textarea, main select")).toHaveCount(0);
        await expect(page.getByText("Błąd 403")).toHaveCount(0);

        // Jeden nagłówek pierwszego stopnia na stronie.
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

        // Bez przewijania w bok.
        const szerokosci = await page.evaluate(() => ({ tresc: document.documentElement.scrollWidth, okno: document.documentElement.clientWidth }));
        expect(szerokosci.tresc, `szerokość treści ${szerokosci.tresc} px w oknie ${szerokosci.okno} px`).toBeLessThanOrEqual(szerokosci.okno);
      });
    }

    test("przycisk odmowy prowadzi do pulpitu", async ({ page }) => {
      await instalujAtrapyStudenta(page);
      await page.goto("/panel/staz");
      await zabezpieczeniePrzedEkranemDostepu(page);
      await page.getByRole("button", { name: "Wróć do pulpitu" }).click();
      await expect(page).toHaveURL(/\/panel\/pulpit$/);
    });
  });
}
