import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { uruchomAxe } from "./_axe";

/**
 * Miara dla grup `certyfikat` i `dokumentyUczestnika` (`lib/przelaczenie/grupy.ts`, obie
 * `wlaczona: true`). Adres się nie zmienia — zmienia się treść strony — więc sprawdzane jest to,
 * co widzi osoba w przeglądarce, na trzech szerokościach okna (320, 390, 1280 px):
 * - `/panel/certyfikat` pokazuje listę warunków (nagłówek drugiego stopnia „Warunki ukończenia
 *   programu”) i jeden przycisk główny w nagłówku, a nie dotychczasową kartę „Warunki ukończenia”;
 * - `/panel/dokumenty` pokazuje dwie listy („Dokumenty do wygenerowania”, „Twoje dokumenty”)
 *   bez tabeli i bez przycisku głównego;
 * - brak przewijania w poziomie, jeden `main`, brak naruszeń axe, 0 odpowiedzi 404.
 *
 * API jest atrapą (`page.route`), sesja Auth.js też — bez prawdziwego IdP.
 */

const ATRAPA_SESJI = { accessToken: "atrapa-tokenu-testowego", expiresAt: Date.now() + 3_600_000 };
const STRONA = { current_page: 1, per_page: 100, total: 0, last_page: 1 };
const API = "http://localhost:8000/api/v1";
const PRZYCISK_GLOWNY = "[data-testid='pageheader-przycisk-glowny'] button";

const WARUNKI_NIESPELNIONE = {
  eligible: false,
  conditions: [
    { key: "courses", label: "Wszystkie etapy i testy", done: 8, required: 10, met: false },
    { key: "internship", label: "Godziny stażu", done: "41.5", required: "72", met: false },
    { key: "supervision", label: "Obecności na superwizjach", done: 5, required: 6, met: false },
    { key: "workshop", label: "Warsztat stacjonarny", met: false },
  ],
  passed_tests_count: 8,
};

const WARUNKI_SPELNIONE = {
  eligible: true,
  conditions: [
    { key: "courses", label: "Wszystkie etapy i testy", done: 10, required: 10, met: true },
    { key: "internship", label: "Godziny stażu", done: "72", required: "72", met: true },
    { key: "supervision", label: "Obecności na superwizjach", done: 6, required: 6, met: true },
    { key: "workshop", label: "Warsztat stacjonarny", met: true },
  ],
  passed_tests_count: 10,
};

const DOKUMENT = {
  id: 3,
  type: "volunteer_agreement",
  number: "NP/PW/2026/003",
  generated_at: "2026-09-10T08:00:00Z",
  signature_status: "none",
  download_url: `${API}/documents/3/download`,
};

const TYPY_Z_DOKUMENTEM = {
  volunteer_agreement: { available: false, reason: "already_generated", document_id: 3 },
  internship_certificate: { available: false, reason: "conditions_not_met", hours_accepted: "41.5", hours_required: "72" },
};

const TYPY_PUSTE = {
  volunteer_agreement: { available: true },
  internship_certificate: { available: false, reason: "conditions_not_met", hours_accepted: "0", hours_required: "72" },
};

async function odpowiedz(page: Page, wzorzec: string, cialo: unknown): Promise<void> {
  await page.route(wzorzec, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cialo) }),
  );
}

/** Ogólna atrapa jest rejestrowana PRZED szczegółowymi — Playwright wybiera trasę zarejestrowaną później. */
async function instalujAtrapy(
  page: Page,
  { warunki, dokumenty, typy }: { warunki: unknown; dokumenty: unknown[]; typy: unknown },
): Promise<void> {
  await odpowiedz(page, `${API}/**`, { data: [], meta: STRONA });
  await odpowiedz(page, `${API}/me`, {
    data: { id: 1, role: "volunteer", first_name: "Marta", program_completed_at: null },
  });
  await odpowiedz(page, `${API}/certificate/conditions`, { data: warunki });
  await odpowiedz(page, `${API}/documents**`, {
    data: dokumenty,
    meta: { ...STRONA, total: dokumenty.length, extra: { available_types: typy } },
  });
  await odpowiedz(page, `${API}/notifications**`, { data: [], meta: { ...STRONA, extra: { unread: 0 } } });
  await odpowiedz(page, "**/api/auth/session", ATRAPA_SESJI);
  await odpowiedz(page, "**/api/auth/end-session-url", { data: { url: null } });
}

function zbierz404(page: Page): string[] {
  const kody404: string[] = [];
  page.on("response", (res) => {
    if (res.status() === 404) kody404.push(res.url());
  });
  return kody404;
}

async function bezPrzewijaniaWBok(page: Page): Promise<void> {
  const przewijanie = await page.evaluate(() => {
    const szerokoscOkna = document.documentElement.clientWidth;
    const wystajace = Array.from(document.querySelectorAll<HTMLElement>("main *"))
      .filter((element) => element.getBoundingClientRect().right > szerokoscOkna + 1)
      .slice(0, 8)
      .map((element) => `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 40)}`);
    return { nadmiar: document.documentElement.scrollWidth - szerokoscOkna, wystajace };
  });
  expect(przewijanie.nadmiar, `przewijanie poziome: ${przewijanie.wystajace.join(", ")}`).toBeLessThanOrEqual(0);
}

const OKNA = [
  { szerokosc: 320, wysokosc: 700 },
  { szerokosc: 390, wysokosc: 844 },
  { szerokosc: 1280, wysokosc: 800 },
];

for (const { szerokosc, wysokosc } of OKNA) {
  test.describe(`certyfikat i dokumenty uczestnika (grupy włączone) — ${szerokosc} px`, () => {
    test.use({ viewport: { width: szerokosc, height: wysokosc } });

    test("certyfikat: lista warunków i jeden przycisk główny, bez przewijania w bok, bez naruszeń axe", async ({ page }) => {
      const kody404 = zbierz404(page);
      await instalujAtrapy(page, { warunki: WARUNKI_NIESPELNIONE, dokumenty: [], typy: TYPY_PUSTE });

      const odpowiedzStrony = await page.goto("/panel/certyfikat");
      expect(odpowiedzStrony?.status()).toBe(200);
      await zabezpieczeniePrzedEkranemDostepu(page);

      await expect(page.getByRole("heading", { level: 1, name: "Certyfikat" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: "Warunki ukończenia programu" })).toBeVisible();
      await expect(page.getByText("Spełniasz 0 warunków z 4.")).toBeVisible();
      await expect(page.getByText("Masz 41,5 z 72 godz.")).toBeVisible();
      await expect(page.getByText("Warunki ukończenia", { exact: true })).toHaveCount(0);
      await expect(page.locator(PRZYCISK_GLOWNY)).toHaveCount(1);
      await expect(page.locator("main")).toHaveCount(1);

      await bezPrzewijaniaWBok(page);
      const naruszenia = await uruchomAxe(page);
      expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);
      expect(kody404, `odpowiedzi 404: ${kody404.join(", ")}`).toEqual([]);
    });

    test("certyfikat: spełnione warunki — przycisk „Wygeneruj certyfikat”, bez przewijania w bok", async ({ page }) => {
      await instalujAtrapy(page, { warunki: WARUNKI_SPELNIONE, dokumenty: [], typy: TYPY_PUSTE });

      await page.goto("/panel/certyfikat");
      await zabezpieczeniePrzedEkranemDostepu(page);

      await expect(page.getByRole("button", { name: "Wygeneruj certyfikat" })).toBeVisible();
      await bezPrzewijaniaWBok(page);
    });

    test("dokumenty: dwie listy bez tabeli i bez przycisku głównego, bez przewijania w bok, bez naruszeń axe", async ({ page }) => {
      const kody404 = zbierz404(page);
      await instalujAtrapy(page, { warunki: WARUNKI_NIESPELNIONE, dokumenty: [DOKUMENT], typy: TYPY_Z_DOKUMENTEM });

      const odpowiedzStrony = await page.goto("/panel/dokumenty");
      expect(odpowiedzStrony?.status()).toBe(200);
      await zabezpieczeniePrzedEkranemDostepu(page);

      await expect(page.getByRole("heading", { level: 2, name: "Dokumenty do wygenerowania" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: "Twoje dokumenty" })).toBeVisible();
      await expect(page.getByText("NP/PW/2026/003").first()).toBeVisible();
      await expect(page.getByRole("table")).toHaveCount(0);
      await expect(page.locator(PRZYCISK_GLOWNY)).toHaveCount(0);
      await expect(page.locator("main")).toHaveCount(1);

      await bezPrzewijaniaWBok(page);
      const naruszenia = await uruchomAxe(page);
      expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);
      expect(kody404, `odpowiedzi 404: ${kody404.join(", ")}`).toEqual([]);
    });

    test("dokumenty: stan pusty (brak wygenerowanych dokumentów), bez przewijania w bok", async ({ page }) => {
      await instalujAtrapy(page, { warunki: WARUNKI_NIESPELNIONE, dokumenty: [], typy: TYPY_PUSTE });

      await page.goto("/panel/dokumenty");
      await zabezpieczeniePrzedEkranemDostepu(page);

      await expect(page.getByRole("heading", { level: 2, name: "Twoje dokumenty" })).toBeVisible();
      await bezPrzewijaniaWBok(page);
    });
  });
}

test("adres się nie zmienia: obie trasy odpowiadają 200 bez przekierowania", async ({ page }) => {
  for (const trasa of ["/panel/certyfikat", "/panel/dokumenty"]) {
    const odpowiedzStrony = await page.request.get(trasa, { maxRedirects: 0 });
    expect(odpowiedzStrony.status(), trasa).toBe(200);
  }
});

test("certyfikat: osoba w roli studenta dostaje wspólny ekran odmowy w nowej ramce — jeden main, bez listy warunków", async ({ page }) => {
  await instalujAtrapy(page, { warunki: WARUNKI_NIESPELNIONE, dokumenty: [], typy: TYPY_PUSTE });
  await odpowiedz(page, `${API}/me`, {
    data: { id: 2, role: "student", first_name: "Jan", program_completed_at: null },
  });

  await page.goto("/panel/certyfikat");
  await zabezpieczeniePrzedEkranemDostepu(page);

  await expect(page.getByRole("heading", { name: "Nie masz dostępu do tego ekranu" })).toBeVisible();
  await expect(page.getByText("Warunki ukończenia programu")).toHaveCount(0);
  await expect(page.locator("main")).toHaveCount(1);
});
