import { expect, test, type Locator, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Ekran decyzji o wniosku o profil (`/admin/profile/[id]`, grupa `decyzjaProfilu`):
 * wspólna kolumna etykiet w karcie i plakietka stanu przy h1 w stylu pigułki z wierszy.
 * API i sesja Auth.js to atrapy w przeglądarce (`page.route`), bez zaplecza i bez IdP.
 *
 * - 1280: wartości wszystkich par zaczynają się w jednej linii pionowej (`left` ±1 px),
 *   etykieta „Zgoda na publikację profilu” mieści się w kolumnie etykiet (szerokość kolumny
 *   jest podana w komunikacie), a szerokość kolumny jest ta sama w każdym wierszu pary;
 * - 390: układ jednokolumnowy, etykieta nad wartością;
 * - plakietka przy h1: tło nieprzezroczyste i równe tłu plakietki tego samego wariantu
 *   w wierszu listy wniosków, ten sam promień pigułki i wypełnienie.
 */

const ATRAPA_SESJI = { accessToken: "atrapa-tokenu-testowego", expiresAt: Date.now() + 3_600_000 };

const WNIOSEK = {
  id: 12,
  user: { id: 17, first_name: "Ola", last_name: "Demo" },
  specializations: ["interwencja kryzysowa", "terapia par"],
  approach: "poznawczo-behawioralne",
  city: "Gdańsk",
  bio: "Pracuję z osobami dorosłymi.",
  publication_consent_granted: true,
  status: "submitted",
  return_reason: null,
  decided_at: null,
  documents: [],
  created_at: "2026-09-10T08:00:00Z",
  updated_at: "2026-09-11T08:00:00Z",
};

const ZGLOSZENIE = {
  id: 5,
  edition_id: 1,
  first_name: "Marta",
  last_name: "Demo",
  email: "marta@demo.pl",
  phone: "+48 600 100 200",
  source: "strona programu",
  role: "volunteer",
  payload: null,
  university: "Uniwersytet Gdański",
  graduation_year: 2025,
  status: "new",
  rejection_reason: null,
  decided_by: null,
  decided_at: null,
  user_id: null,
  has_diploma_scan: false,
  diploma_scan_url: null,
  consent_regulamin_at: "2026-09-01T08:00:00Z",
  consent_polityka_at: "2026-09-01T08:00:00Z",
  created_at: "2026-09-01T08:00:00Z",
  updated_at: "2026-09-01T08:00:00Z",
};

const ETYKIETY_ZGLOSZENIA = [
  "E-mail",
  "Telefon",
  "Uczelnia",
  "Rok ukończenia",
  "Rola wskazana w zgłoszeniu",
  "Źródło zgłoszenia",
  "Zgłoszono",
  "Regulamin",
  "Polityka prywatności",
];

const META = { current_page: 1, per_page: 25, total: 1, last_page: 1 };

function odpowiedz(dane: unknown, meta?: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }) };
}

/** Ogólna atrapa jest rejestrowana PIERWSZA — Playwright wybiera trasę zarejestrowaną później jako pierwszą. */
async function instalujAtrapy(page: Page): Promise<void> {
  await page.route("http://localhost:8000/api/v1/**", (route) => route.fulfill(odpowiedz([])));
  await page.route("http://localhost:8000/api/v1/me", (route) =>
    route.fulfill(odpowiedz({ id: 1, role: "project_manager", program_completed_at: "2026-09-15T00:00:00Z" })),
  );
  await page.route("http://localhost:8000/api/v1/notifications**", (route) =>
    route.fulfill(odpowiedz([], { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { unread: 0 } })),
  );
  await page.route(
    (adres) => adres.pathname === "/api/v1/admin/profiles",
    (route) => route.fulfill(odpowiedz([WNIOSEK], META)),
  );
  await page.route("http://localhost:8000/api/v1/admin/applications/5", (route) => route.fulfill(odpowiedz(ZGLOSZENIE)));
  await page.route("http://localhost:8000/api/v1/admin/profiles/12", (route) => route.fulfill(odpowiedz(WNIOSEK)));
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(odpowiedz({ url: null })));
}

interface WygladPlakietki {
  tlo: string;
  promien: string;
  wypelnienie: string;
  obrys: string;
  kolor: string;
}

async function wyglad(plakietka: Locator): Promise<WygladPlakietki> {
  return plakietka.evaluate((el) => {
    const s = getComputedStyle(el);
    return { tlo: s.backgroundColor, promien: s.borderRadius, wypelnienie: s.padding, obrys: s.boxShadow, kolor: s.color };
  });
}

/** Obliczone `--warn-bg` i `--warn` (token rozwiązany przez przeglądarkę na próbnym elemencie). */
async function tokenyOstrzezenia(page: Page): Promise<{ tlo: string; kolor: string }> {
  return page.evaluate(() => {
    const probka = document.createElement("span");
    probka.style.backgroundColor = "var(--warn-bg)";
    probka.style.color = "var(--warn)";
    document.querySelector("main")!.appendChild(probka);
    const s = getComputedStyle(probka);
    const wynik = { tlo: s.backgroundColor, kolor: s.color };
    probka.remove();
    return wynik;
  });
}

/** Zrzut do katalogu z `ZRZUTY_DIR` (porównanie przed/po); bez zmiennej nic nie robi. */
async function zrzut(page: Page, nazwa: string): Promise<void> {
  const katalog = process.env.ZRZUTY_DIR;
  if (!katalog) return;
  await page.screenshot({ path: `${katalog}/${nazwa}.png`, fullPage: true });
}

const ETYKIETA_DLUGA = "Zgoda na publikację profilu";
const ETYKIETY = ["Miasto", "Podejście", "Specjalizacje", ETYKIETA_DLUGA, "Złożono"];

/**
 * Mierzy parę po parze (etykieta `label`, wartość `span[id$='-wartosc']`) w karcie: przy 1280 wspólna
 * kolumna etykiet (`left` wartości ±1 px, ta sama szerokość kolumny), przy 390 etykieta nad wartością.
 * Podaje szerokość kolumny etykiet w komunikatach błędów.
 */
async function sprawdzKarte(karta: Locator, etykiety: string[], nazwa: string, dluga: string): Promise<void> {
  const pary = karta.locator("label").locator("xpath=..");
  await expect(pary).toHaveCount(etykiety.length);

  const pudelka: { etykieta: string; lewaEtykiety: number; szerEtykiety: number; lewaWartosci: number; gornaEtykiety: number; gornaWartosci: number; liczbaLinii: number }[] = [];
  for (let i = 0; i < etykiety.length; i++) {
    const para = pary.nth(i);
    const etykieta = para.locator("label");
    const wartosc = para.locator("span[id$='-wartosc']");
    const bE = (await etykieta.boundingBox())!;
    const bW = (await wartosc.boundingBox())!;
    const wysokoscLinii = await etykieta.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) || 0);
    pudelka.push({
      etykieta: (await etykieta.innerText()).trim(),
      lewaEtykiety: bE.x,
      szerEtykiety: bE.width,
      lewaWartosci: bW.x,
      gornaEtykiety: bE.y,
      gornaWartosci: bW.y,
      liczbaLinii: wysokoscLinii > 0 ? Math.round(bE.height / wysokoscLinii) : 1,
    });
  }
  expect(pudelka.map((p) => p.etykieta)).toEqual(etykiety);

  if (nazwa === "1280") {
    const lewe = pudelka.map((p) => p.lewaWartosci);
    const rozrzut = Math.max(...lewe) - Math.min(...lewe);
    expect(rozrzut, `left wartości: ${lewe.join(", ")}`).toBeLessThanOrEqual(1);

    const szerokosci = pudelka.map((p) => p.szerEtykiety);
    const szerokoscKolumny = Math.min(...szerokosci);
    test.info().annotations.push({ type: "kolumna etykiet (px)", description: String(Math.round(szerokoscKolumny)) });
    expect(
      Math.max(...szerokosci) - Math.min(...szerokosci),
      `szerokość kolumny etykiet w wierszach: ${szerokosci.join(", ")}`,
    ).toBeLessThanOrEqual(1);

    const wierszDlugiej = pudelka.find((p) => p.etykieta === dluga)!;
    expect(
      wierszDlugiej.liczbaLinii > 1 || wierszDlugiej.szerEtykiety <= szerokoscKolumny + 1,
      `„${dluga}”: ${wierszDlugiej.liczbaLinii} linii, kolumna etykiet ${szerokoscKolumny} px`,
    ).toBe(true);
    for (const p of pudelka) {
      expect(p.lewaWartosci, `wartość „${p.etykieta}” stoi na prawo od etykiety`).toBeGreaterThan(p.lewaEtykiety + p.szerEtykiety - 1);
      expect(Math.abs(p.gornaWartosci - p.gornaEtykiety), `„${p.etykieta}”: etykieta i wartość w jednym wierszu siatki`).toBeLessThanOrEqual(12);
    }
  } else {
    for (const p of pudelka) {
      expect(p.gornaWartosci, `„${p.etykieta}”: wartość pod etykietą`).toBeGreaterThan(p.gornaEtykiety + 8);
      expect(Math.abs(p.lewaWartosci - p.lewaEtykiety), `„${p.etykieta}”: lewe krawędzie`).toBeLessThanOrEqual(1);
    }
  }
}

const SZEROKOSCI = [
  { nazwa: "1280", viewport: { width: 1280, height: 800 } },
  { nazwa: "390", viewport: { width: 390, height: 844 } },
];

for (const { nazwa, viewport } of SZEROKOSCI) {
  test.describe(`decyzja o profilu, karta i plakietka — ${nazwa} px`, () => {
    test.use({ viewport });

    test("karta: wspólna kolumna etykiet (1280) albo etykieta nad wartością (390)", async ({ page }) => {
      await instalujAtrapy(page);
      await page.goto("/admin/profile/12");
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.getByRole("heading", { level: 1, name: /^Wniosek o profil: Ola Demo/ })).toBeVisible();

      const karta = page.locator("article[data-rodzaj='podstawowa']");
      await expect(karta).toBeVisible();
      await zrzut(page, `decyzja-profilu-${nazwa}`);

      await sprawdzKarte(karta, ETYKIETY, nazwa, ETYKIETA_DLUGA);

      for (const wartosc of ["Gdańsk", "poznawczo-behawioralne", "interwencja kryzysowa, terapia par", "udzielona"]) {
        await expect(karta.getByText(wartosc, { exact: true })).toBeVisible();
      }
      const przewijanie = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(przewijanie.scroll).toBeLessThanOrEqual(przewijanie.client);
    });

    test("ten sam układ karty na innym ekranie (zgłoszenie rekrutacyjne), wartości czytelne", async ({ page }) => {
      await instalujAtrapy(page);
      await page.goto("/nowy-front/admin/zgloszenia/5");
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.getByRole("heading", { level: 1, name: /^Zgłoszenie: Marta Demo/ })).toBeVisible();

      const karta = page.locator("article[data-rodzaj='podstawowa']");
      await expect(karta).toBeVisible();
      await zrzut(page, `zgloszenie-${nazwa}`);
      await sprawdzKarte(karta, ETYKIETY_ZGLOSZENIA, nazwa, "Rola wskazana w zgłoszeniu");

      for (const wartosc of ["marta@demo.pl", "+48 600 100 200", "Uniwersytet Gdański", "2025", "strona programu"]) {
        await expect(karta.getByText(wartosc, { exact: true })).toBeVisible();
      }
      const przewijanie = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(przewijanie.scroll).toBeLessThanOrEqual(przewijanie.client);
    });

    test("plakietka stanu przy h1 ma tło i kształt pigułki z wiersza listy", async ({ page }) => {
      await instalujAtrapy(page);

      await page.goto("/nowy-front/admin/profile");
      await zabezpieczeniePrzedEkranemDostepu(page);
      const wiersz = page.locator("main [data-wariant]").filter({ hasText: "Ola Demo" }).first();
      await expect(wiersz).toBeVisible();
      const plakietkaWiersza = wiersz.locator("[class*='plakietka'] > [class*='plakietka']");
      await expect(plakietkaWiersza).toHaveText(/czeka na decyzję/i);
      const wzorzec = await wyglad(plakietkaWiersza);

      await page.goto("/admin/profile/12");
      await zabezpieczeniePrzedEkranemDostepu(page);
      const h1 = page.getByRole("heading", { level: 1, name: /^Wniosek o profil: Ola Demo/ });
      await expect(h1).toBeVisible();
      const plakietkaNaglowka = page.locator("main header [class*='plakietka']").first();
      await expect(plakietkaNaglowka).toHaveText(/czeka na decyzję/i);
      const naglowek = await wyglad(plakietkaNaglowka);

      expect(naglowek.tlo, "tło plakietki przy h1 nie jest przezroczyste").not.toBe("rgba(0, 0, 0, 0)");
      expect(naglowek.tlo, "tło plakietki przy h1 == tło plakietki w wierszu listy").toBe(wzorzec.tlo);
      expect(naglowek.promien, "promień pigułki").toBe(wzorzec.promien);
      expect(parseFloat(naglowek.promien)).toBeGreaterThanOrEqual(100);
      expect(naglowek.wypelnienie, "wypełnienie").toBe(wzorzec.wypelnienie);
      // Stan „czeka na decyzję” to wariant ostrzegawczy: tło i tekst z tokenów `--warn-bg` i `--warn`, bez obrysu.
      const token = await tokenyOstrzezenia(page);
      expect(naglowek.tlo, "tło plakietki przy h1 == --warn-bg").toBe(token.tlo);
      expect(naglowek.kolor, "tekst plakietki przy h1 == --warn").toBe(token.kolor);
      expect(wzorzec.tlo, "tło plakietki w wierszu listy == --warn-bg").toBe(token.tlo);
      expect(naglowek.obrys, "plakietka przy h1 bez obrysu").toBe("none");

      // Plakietka stoi w linii pod h1 (ekran nie ma opisu, więc sama w tej linii), nie obok niego.
      const bH1 = (await h1.boundingBox())!;
      const bPlakietki = (await plakietkaNaglowka.boundingBox())!;
      expect(bPlakietki.y, "plakietka pod h1 (top >= bottom h1)").toBeGreaterThanOrEqual(bH1.y + bH1.height - 1);
      expect(Math.abs(bPlakietki.x - bH1.x), "lewa krawędź plakietki == lewa krawędź h1").toBeLessThanOrEqual(2);
    });
  });
}
