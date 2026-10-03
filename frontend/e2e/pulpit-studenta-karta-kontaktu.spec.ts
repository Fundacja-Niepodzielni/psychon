import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Pulpit studenta, karta „Masz pytanie?”: zdanie i adres zaczynają się tam,
 * gdzie nagłówek karty (wcięcie tokenu karty), a nie przy jej lewej krawędzi,
 * i nie dotykają dolnej krawędzi karty. Pomiar na 1280×800 i 390×844.
 * API i sesja Auth.js są atrapami (`page.route`).
 *
 * Gdy ustawiona jest zmienna `ZRZUTY_DROBNE` (ścieżka z przedrostkiem nazwy
 * pliku), scenariusz zapisuje też zrzut ekranu — wyłącznie do oglądania.
 */

const API = "http://localhost:8000/api/v1";
const STRONA = { current_page: 1, per_page: 100, total: 0, last_page: 1 };
const KURS = {
  id: 2,
  slug: "wywiad-psychologiczny",
  title: "Wywiad psychologiczny",
  sequence_order: 1,
  product_group: "psychon",
  status: "in_progress",
  progress_percent: 40,
};

async function odpowiedz(page: Page, wzorzec: string, cialo: unknown): Promise<void> {
  await page.route(wzorzec, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cialo) }),
  );
}

/** Ogólna atrapa jest rejestrowana PRZED szczegółowymi (późniejsza trasa wygrywa). */
async function instalujAtrapyStudenta(page: Page): Promise<void> {
  await odpowiedz(page, `${API}/**`, { data: [], meta: STRONA });
  await odpowiedz(page, `${API}/me`, { data: { id: 1, role: "student", first_name: "Ola", program_completed_at: null } });
  await odpowiedz(page, `${API}/courses`, { data: [KURS] });
  await odpowiedz(page, `${API}/courses/${KURS.slug}`, {
    data: {
      ...KURS,
      instructor: null,
      topics: [],
      materials: [],
      lessons: [{ id: 21, title: "Wprowadzenie do wywiadu", sequence_order: 1, duration_seconds: 600, is_completed: false }],
    },
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
  test.describe(`pulpit studenta, karta „Masz pytanie?”, ${rozmiar.nazwa} px`, () => {
    test.use({ viewport: { width: rozmiar.szerokosc, height: rozmiar.wysokosc } });

    test("zdanie i adres mają wcięcie nagłówka karty i odstęp od dolnej krawędzi", async ({ page }) => {
      await instalujAtrapyStudenta(page);
      await page.goto("/panel/pulpit");
      await zabezpieczeniePrzedEkranemDostepu(page);
      const karta = page.getByRole("region", { name: "Kontakt" });
      await expect(karta.getByRole("heading", { name: "Masz pytanie?" })).toBeVisible();
      await expect(karta.getByRole("link", { name: "kontakt@niepodzielni.com" })).toBeVisible();

      const zrzuty = process.env.ZRZUTY_DROBNE;
      if (zrzuty) await page.screenshot({ path: `${zrzuty}-pulpit-studenta-${rozmiar.nazwa}.png`, fullPage: true });

      const miary = await karta.evaluate((sekcja) => {
        const lewyTekstu = (element: Element) => {
          const zakres = document.createRange();
          zakres.selectNodeContents(element);
          const prostokat = zakres.getBoundingClientRect();
          return { lewy: prostokat.left, dol: prostokat.bottom };
        };
        const ramka = sekcja.getBoundingClientRect();
        const naglowek = sekcja.querySelector("h3")!;
        const zdanie = Array.from(sekcja.querySelectorAll("p")).find((p) => p.textContent?.includes("napisz do nas"))!;
        const adres = sekcja.querySelector("a")!;
        return {
          lewaKrawedz: ramka.left,
          dolnaKrawedz: ramka.bottom,
          naglowek: lewyTekstu(naglowek).lewy,
          zdanie: lewyTekstu(zdanie).lewy,
          adres: lewyTekstu(adres).lewy,
          dolAdresu: lewyTekstu(adres).dol,
        };
      });

      const opis = JSON.stringify(miary);
      expect(miary.naglowek - miary.lewaKrawedz, `nagłówek ma wcięcie: ${opis}`).toBeGreaterThanOrEqual(16);
      expect(Math.abs(miary.zdanie - miary.naglowek), `zdanie zaczyna się tam, gdzie nagłówek: ${opis}`).toBeLessThanOrEqual(1);
      expect(Math.abs(miary.adres - miary.naglowek), `adres zaczyna się tam, gdzie nagłówek: ${opis}`).toBeLessThanOrEqual(1);
      expect(miary.dolnaKrawedz - miary.dolAdresu, `adres nie dotyka dolnej krawędzi: ${opis}`).toBeGreaterThanOrEqual(12);
    });
  });
}
