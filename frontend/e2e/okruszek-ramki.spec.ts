import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";

/**
 * Okruszek w nagłówku ekranu nowej ramki panelu na zbudowanej aplikacji, z
 * atrapą API przez `page.route` i atrapą sesji (jak w `ramka-administracji`).
 * Jedna reguła (`design-system/szablony/OkruszekRamki.ts`) dla wszystkich
 * ekranów trzech ról: „Codziennie” bez okruszka, pozostałe „korzeń ›
 * [rodzic ›] bieżąca”, szczegół zawsze z łańcuchem, jedna pozycja nigdy;
 * korzeń „Administracja” tylko w administracji.
 *
 * Tryby:
 * - bez zmiennych: asercje na każdej trasie ramki, axe (WCAG 2.1 AA) na trzech
 *   ekranach (1280 i 390 px);
 * - `PW_SPIS_OKRUSZKA` (plik): zamiast asercji dopisuje wiersz „trasa →
 *   okruszek” do pliku — spis ekranów do porównania przed/po zmianą;
 * - `PW_ZRZUTY_OKRUSZKA` (katalog poza repozytorium): zrzuty ekranów.
 */

const ATRAPA_SESJI = { accessToken: "atrapa-tokenu-testowego", expiresAt: Date.now() + 3_600_000 };
const API = "http://localhost:8000/api/v1";
const META = { current_page: 1, per_page: 25, total: 1, last_page: 1 };

const EDYCJA = {
  id: 1,
  name: "Edycja 2026",
  starts_at: "2026-10-01",
  ends_at: "2027-03-31",
  seats_limit: 40,
  test_pass_threshold: 80,
  test_attempts_limit: 3,
  internship_hours_required: 72,
  supervision_required_count: 6,
  reliability_threshold: 60,
  lesson_completion_percent: 60,
};

const WNIOSEK = {
  id: 12,
  user: { id: 18, first_name: "Ola", last_name: "Demo" },
  specializations: ["interwencja kryzysowa"],
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

const ZGLOSZENIE_REKRUTACYJNE = {
  id: 12,
  edition_id: 1,
  first_name: "Anna",
  last_name: "Kandydacka",
  email: "kandydacka@demo.pl",
  phone: null,
  source: null,
  role: "volunteer",
  payload: null,
  university: null,
  graduation_year: null,
  consent_regulamin_at: null,
  consent_polityka_at: null,
  status: "new",
  rejection_reason: null,
  decided_by: null,
  decided_at: null,
  user_id: null,
  has_diploma_scan: false,
  diploma_scan_url: null,
  created_at: "2026-09-20T10:00:00Z",
  updated_at: "2026-09-20T10:00:00Z",
};

const FORMA = {
  id: 7,
  name: "Dyżur telefoniczny",
  description: "Rozmowa telefoniczna w godzinach dyżuru.",
  is_active: true,
  sort_order: 1,
  created_at: null,
  updated_at: null,
};

function odpowiedz(dane: unknown, meta?: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }) };
}

type RolaAtrapy = "administracja" | "uczestnik" | "prowadzacy";

const OSOBA_ROLI: Record<RolaAtrapy, unknown> = {
  administracja: { id: 1, role: "project_manager", first_name: "Opiekun", last_name: "Demo", program_completed_at: null },
  uczestnik: { id: 17, role: "volunteer", first_name: "Marta", last_name: "Demo", program_completed_at: null },
  prowadzacy: { id: 5, role: "instructor", first_name: "Joanna", last_name: "Demo" },
};

/** Ogólna atrapa jest rejestrowana PIERWSZA — Playwright wybiera trasę zarejestrowaną PÓŹNIEJ jako pierwszą. */
async function instalujAtrapyApi(page: Page, rola: RolaAtrapy): Promise<void> {
  await page.route(`${API}/**`, (route) => route.fulfill(odpowiedz([], { ...META, total: 0 })));
  await page.route(`${API}/me`, (route) => route.fulfill(odpowiedz(OSOBA_ROLI[rola])));
  await page.route(`${API}/notifications**`, (route) =>
    route.fulfill(odpowiedz([], { ...META, total: 0, extra: { unread: 0 } })),
  );
  await page.route(`${API}/admin/edition`, (route) => route.fulfill(odpowiedz(EDYCJA)));
  await page.route(`${API}/admin/profiles/12`, (route) => route.fulfill(odpowiedz(WNIOSEK)));
  await page.route(`${API}/admin/applications/12`, (route) => route.fulfill(odpowiedz(ZGLOSZENIE_REKRUTACYJNE)));
  await page.route(`${API}/admin/internship/forms**`, (route) => route.fulfill(odpowiedz([FORMA])));
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(odpowiedz({ url: null })));
}

interface Trasa {
  rola: RolaAtrapy;
  adres: string;
  /** Okruszek jako „A › B › C”; `null` — ekran bez okruszka. */
  okruszek: string | null;
}

/** Ekrany stojące w nowej ramce przy domyślnym rejestrze przełączenia. */
const TRASY: Trasa[] = [
  // „Codziennie” — bez okruszka.
  { rola: "administracja", adres: "/admin", okruszek: null },
  { rola: "administracja", adres: "/admin/sprawy", okruszek: null },
  { rola: "administracja", adres: "/admin/staz", okruszek: null },
  { rola: "administracja", adres: "/admin/uczestniczki", okruszek: null },
  { rola: "administracja", adres: "/admin/nabor", okruszek: null },
  { rola: "administracja", adres: "/admin/zgloszenia-wspolpracy", okruszek: null },
  // „Program” i „Rozliczenie” — korzeń „Administracja” i bieżąca z nazwą pozycji menu.
  { rola: "administracja", adres: "/admin/formy-stazu", okruszek: "Administracja › Słownik form stażu" },
  { rola: "administracja", adres: "/admin/wzory-dokumentow", okruszek: "Administracja › Wzory dokumentów" },
  { rola: "administracja", adres: "/admin/ekran-startowy", okruszek: "Administracja › Treść ekranu „Zacznij tutaj”" },
  // Szczegół — zawsze łańcuch, także gdy lista stoi w „Codziennie”.
  { rola: "administracja", adres: "/admin/nabor/12", okruszek: "Administracja › Zgłoszenia rekrutacyjne › Zgłoszenie" },
  { rola: "administracja", adres: "/admin/profile/12", okruszek: "Administracja › Profile psychologa › Wniosek o profil" },
  // Uczestnik i prowadzący: bez korzenia roli, jedna pozycja nigdy.
  { rola: "uczestnik", adres: "/panel/pulpit", okruszek: null },
  { rola: "uczestnik", adres: "/panel/dalsza-wspolpraca", okruszek: null },
  { rola: "prowadzacy", adres: "/prowadzacy", okruszek: null },
];

/** Ekrany z axe i zrzutami: z korzeniem, ze szczegółem i „Codziennie”. */
const EKRANY_AXE = ["/admin/formy-stazu", "/admin/nabor/12", "/admin/sprawy"];

async function odczytajOkruszek(page: Page): Promise<string | null> {
  const nav = page.getByRole("navigation", { name: "Okruszki" });
  if ((await nav.count()) === 0) return null;
  const pozycje = await nav.locator("li").evaluateAll((li) =>
    li.map((el) => (el.textContent ?? "").replace("›", "").trim()),
  );
  return pozycje.join(" › ");
}

async function otworz(page: Page, trasa: Trasa, szerokosc: number): Promise<void> {
  await page.setViewportSize({ width: szerokosc, height: szerokosc >= 1024 ? 900 : 844 });
  await instalujAtrapyApi(page, trasa.rola);
  const odpowiedzStrony = await page.goto(trasa.adres);
  await zabezpieczeniePrzedEkranemDostepu(page);
  expect(odpowiedzStrony?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(page.locator("[data-powloka-panelu]")).toHaveCount(1);
}

const TAGI_WCAG = ["wcag2a", "wcag2aa", "wcag21aa"];
const plikSpisu = process.env.PW_SPIS_OKRUSZKA;
const katalogZrzutow = process.env.PW_ZRZUTY_OKRUSZKA;

test.describe("okruszek nowej ramki panelu", () => {
  for (const trasa of TRASY) {
    test(`${trasa.adres}: ${trasa.okruszek ?? "bez okruszka"}`, async ({ page }) => {
      await otworz(page, trasa, 1280);
      const okruszek = await odczytajOkruszek(page);

      if (plikSpisu) {
        mkdirSync(path.dirname(plikSpisu), { recursive: true });
        appendFileSync(plikSpisu, `${trasa.adres}\t${okruszek ?? "(brak)"}\n`);
        return;
      }

      await expect(page.getByRole("button", { name: "Wstecz" })).toHaveCount(0);
      expect(okruszek, trasa.adres).toBe(trasa.okruszek);
      if (trasa.okruszek) {
        // Bieżąca pozycja: tekst z aria-current="page", nie łącze; poprzednie pozycje są łączami.
        const nav = page.getByRole("navigation", { name: "Okruszki" });
        const liczba = await nav.locator("li").count();
        await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
        await expect(nav.locator("li").last()).toHaveAttribute("aria-current", "page");
        await expect(nav.getByRole("link")).toHaveCount(liczba - 1);
        expect(liczba).toBeGreaterThanOrEqual(2);
        if (trasa.rola === "administracja") {
          await expect(nav.getByRole("link").first()).toHaveAttribute("href", "/admin");
        }
      }
    });
  }

  for (const szerokosc of [1280, 390]) {
    for (const adres of EKRANY_AXE) {
      test(`${adres} @${szerokosc}: axe (WCAG 2.1 AA) bez naruszeń z okruszkiem wg reguły`, async ({ page }, testInfo) => {
        const trasa = TRASY.find((t) => t.adres === adres);
        expect(trasa, adres).toBeTruthy();
        await otworz(page, trasa as Trasa, szerokosc);
        if (!plikSpisu) expect(await odczytajOkruszek(page)).toBe((trasa as Trasa).okruszek);

        const naruszenia = await uruchomAxe(page);
        await dolaczNaruszeniaDoRaportu(testInfo, `axe-okruszek-${szerokosc}`, naruszenia);
        expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);

        if (plikSpisu) {
          const wynik = await new AxeBuilder({ page }).withTags([...TAGI_WCAG, "best-practice"]).analyze();
          const wiersze = wynik.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.map(String).join(" ")).join(" | ")}`);
          const opis = wiersze.length === 0 ? "(0 naruszeń)" : wiersze.join(" ;; ");
          appendFileSync(`${plikSpisu}.axe`, `${adres} @${szerokosc}\t${opis}\n`);
        }

        if (katalogZrzutow) {
          mkdirSync(katalogZrzutow, { recursive: true });
          await page.screenshot({
            path: path.join(katalogZrzutow, `okruszek${adres.replaceAll("/", "-")}-${szerokosc}.png`),
            fullPage: true,
          });
        }
      });
    }
  }
});
