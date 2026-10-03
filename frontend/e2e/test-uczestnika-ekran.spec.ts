import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";
import { GRUPY } from "../lib/przelaczenie/grupy";

/**
 * Test końcowy uczestnika pod adresem produktu `/panel/kursy/[slug]/test`
 * (grupa `testUczestnika`, nowa ramka), na zbudowanej aplikacji, z atrapą API
 * i atrapą sesji, na 1280 i 390 px. Cztery stany: przed startem, w trakcie
 * (pytanie z zaznaczoną odpowiedzią), okno potwierdzenia wysłania i wynik
 * zaliczony; do tego test zaliczony już przy wejściu (bez „Rozpocznij”) i
 * odmowa „nie ma testu” (przycisk w treści na całą szerokość telefonu).
 * W każdym stanie: jeden `main`, poza oknem dokładnie jeden widoczny przycisk
 * główny (w nagłówku), brak przewijania poziomego, axe (WCAG 2.1 AA i
 * `best-practice`) = 0. Zrzuty całej strony powstają tylko przy ustawionej
 * zmiennej `PW_ZRZUTY`.
 */

const API = "http://localhost:8000/api/v1";
const SLUG = "pierwsza-pomoc-psychologiczna";
const ATRAPA_SESJI = {
  accessToken: ["atrapa", "tokenu", "testowego"].join("-"),
  expiresAt: Date.now() + 3_600_000,
};
const META = { current_page: 1, per_page: 25, total: 0, last_page: 1 };

const KURS = {
  id: 2,
  slug: SLUG,
  title: "Pierwsza pomoc psychologiczna",
  has_test: true,
  lessons: [
    { id: 21, is_completed: true },
    { id: 22, is_completed: true },
  ],
};

const PYTANIA = [
  {
    id: 41,
    body: "Co jest pierwszym krokiem w rozmowie z osobą w kryzysie?",
    sequence_order: 1,
    answers: [
      { id: 210, body: "Zadbanie o bezpieczeństwo i spokojne nawiązanie kontaktu" },
      { id: 211, body: "Ocena, kto ponosi winę za sytuację" },
    ],
  },
  {
    id: 42,
    body: "Która postawa wspiera rozmowę, która nie ocenia?",
    sequence_order: 2,
    answers: [
      { id: 220, body: "Uważne słuchanie i parafraza" },
      { id: 221, body: "Szybkie udzielanie rad" },
    ],
  },
  {
    id: 43,
    body: "Kiedy trzeba wezwać pomoc?",
    sequence_order: 3,
    answers: [
      { id: 230, body: "Gdy zagrożone jest życie lub zdrowie" },
      { id: 231, body: "Nigdy, rozmowa zawsze wystarcza" },
    ],
  },
];

const PODEJSCIE_1 = { attempt_number: 1, score_percent: 33, passed: false, created_at: "2026-09-30T18:50:00Z" };
const PODEJSCIE_2 = { attempt_number: 2, score_percent: 100, passed: true, created_at: "2026-10-03T09:15:00Z" };

function json(dane: unknown, status = 200, meta?: unknown) {
  return { status, contentType: "application/json", body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }) };
}

function blad(status: number, code: string, message: string) {
  return { status, contentType: "application/json", body: JSON.stringify({ error: { status, code, message } }) };
}

type Wariant = "zwykly" | "zaliczony" | "brak-testu";

/** Ogólna atrapa jest rejestrowana PRZED szczegółowymi (późniejsza trasa wygrywa). */
async function instalujAtrapy(page: Page, wariant: Wariant): Promise<void> {
  let wyslane = wariant === "zaliczony";
  await page.route(`${API}/**`, (route) => route.fulfill(json([], 200, META)));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(json({ id: 17, role: "volunteer", first_name: "Anna", last_name: "Kowalczyk", program_completed_at: null })),
  );
  await page.route(`${API}/notifications**`, (route) =>
    route.fulfill(json([], 200, { ...META, extra: { unread: 0 } })),
  );
  await page.route(`${API}/courses/${SLUG}`, (route) => route.fulfill(json(KURS)));
  await page.route(`${API}/courses/${SLUG}/test`, (route) =>
    route.fulfill(
      wariant === "brak-testu"
        ? blad(404, "not_found", "Nie znaleziono zasobu.")
        : json({ test_id: 10, pass_threshold: 70, attempts_used: wyslane ? 2 : 1, attempts_limit: 4, passed: wyslane, questions: PYTANIA }),
    ),
  );
  await page.route(`${API}/tests/10/attempts**`, (route) => {
    if (route.request().method() === "POST") {
      wyslane = true;
      return route.fulfill(json({ attempt_number: 2, score_percent: 100, passed: true, wrong_question_ids: [] }, 201));
    }
    const historia = wyslane ? [PODEJSCIE_1, PODEJSCIE_2] : [PODEJSCIE_1];
    return route.fulfill(json(historia, 200, { ...META, total: historia.length }));
  });
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json({ url: null })));
}

async function otworz(page: Page): Promise<void> {
  const odpowiedz = await page.goto(`/panel/kursy/${SLUG}/test`);
  expect(odpowiedz?.status()).toBe(200);
  await zabezpieczeniePrzedEkranemDostepu(page);
}

async function zdjecie(page: Page, nazwa: string): Promise<void> {
  const katalog = process.env.PW_ZRZUTY;
  if (!katalog) return;
  mkdirSync(katalog, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(katalog, `${nazwa}.png`), fullPage: true, animations: "disabled" });
}

async function sprawdzAxe(page: Page, testInfo: TestInfo, nazwa: string): Promise<void> {
  const naruszenia = await uruchomAxe(page);
  await dolaczNaruszeniaDoRaportu(testInfo, nazwa, naruszenia);
  expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`), `axe: ${nazwa}`).toEqual([]);
  const pelny = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "best-practice"]).analyze();
  expect(
    pelny.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.map(String).join(" ")).join(" | ")}`),
    `axe z best-practice: ${nazwa}`,
  ).toEqual([]);
}

/** Brak przewijania w poziomie; przy błędzie komunikat wskazuje elementy wystające poza okno. */
async function sprawdzPrzewijanie(page: Page): Promise<void> {
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

/** Widoczne przyciski główne w treści strony poza oknem dialogowym: tekst i zdanie obok. */
async function przyciskiGlowne(page: Page): Promise<{ tekst: string; zdanie: string }[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("main button[class*='primary']"))
      .filter((element) => element.getClientRects().length > 0 && element.closest("dialog") === null)
      .map((element) => ({
        tekst: (element.textContent ?? "").trim(),
        zdanie: (document.getElementById((element.getAttribute("aria-describedby") ?? "").split(" ")[0])?.textContent ?? "").trim(),
      })),
  );
}

async function sprawdzStan(page: Page, testInfo: TestInfo, nazwa: string, glowny: { tekst: string; zdanie: string } | null): Promise<void> {
  await expect(page.locator("main")).toHaveCount(1);
  expect(await przyciskiGlowne(page), `przycisk główny: ${nazwa}`).toEqual(glowny === null ? [] : [glowny]);
  await sprawdzPrzewijanie(page);
  await sprawdzAxe(page, testInfo, nazwa);
}

const OKNA = [
  { szerokosc: 1280, wysokosc: 800 },
  { szerokosc: 390, wysokosc: 844 },
];

for (const { szerokosc, wysokosc } of OKNA) {
  test.describe(`test końcowy uczestnika — ${szerokosc} px`, () => {
    test.skip(!GRUPY.testUczestnika.wlaczona, "grupa testu końcowego uczestnika jest wyłączona");
    test.use({ viewport: { width: szerokosc, height: wysokosc } });

    test("cztery stany: przed startem, w trakcie, okno potwierdzenia, wynik zaliczony", async ({ page }, testInfo) => {
      await instalujAtrapy(page, "zwykly");
      await otworz(page);

      await expect(page.getByRole("heading", { level: 1, name: "Test końcowy" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: "Zanim zaczniesz" })).toBeVisible();
      await expect(page.getByText(KURS.title, { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: "Historia podejść" })).toBeVisible();
      await sprawdzStan(page, testInfo, "przed startem", { tekst: "Rozpocznij test", zdanie: "Zostały Ci 3 podejścia z 4." });
      await zdjecie(page, `nowy-${szerokosc}-1-przed-startem`);

      await page.getByRole("button", { name: "Rozpocznij test" }).click();
      await expect(page.getByRole("heading", { level: 2, name: "Pytanie 1 z 3" })).toBeVisible();
      await page.getByRole("radio", { name: PYTANIA[0].answers[0].body }).check();
      await expect(page.getByText("Odpowiedzi: 1 z 3")).toBeVisible();
      await sprawdzStan(page, testInfo, "w trakcie", {
        tekst: "Następne pytanie",
        zdanie: "Do tego pytania nie wrócisz po przejściu dalej.",
      });
      await zdjecie(page, `nowy-${szerokosc}-2-w-trakcie`);

      await page.getByRole("button", { name: "Następne pytanie" }).click();
      await page.getByRole("radio", { name: PYTANIA[1].answers[0].body }).check();
      await page.getByRole("button", { name: "Następne pytanie" }).click();
      await page.getByRole("radio", { name: PYTANIA[2].answers[0].body }).check();
      await page.getByRole("button", { name: "Zakończ i sprawdź" }).click();

      const okno = page.getByRole("dialog", { name: "Wysłać odpowiedzi?" });
      await expect(okno).toBeVisible();
      await expect(okno.getByText("Po wysłaniu nie zmienisz odpowiedzi.")).toBeVisible();
      await expect(okno.getByText(/Bez odpowiedzi/)).toHaveCount(0);
      await expect(okno.getByRole("button", { name: "Wróć do pytania" })).toBeFocused();
      await expect(okno.getByRole("button", { name: "Wyślij odpowiedzi" })).toHaveClass(/niebezpieczny/);
      await sprawdzStan(page, testInfo, "okno potwierdzenia", {
        tekst: "Zakończ i sprawdź",
        zdanie: "Przed wysłaniem poprosimy Cię o potwierdzenie.",
      });
      await zdjecie(page, `nowy-${szerokosc}-3-okno-potwierdzenia`);

      await okno.getByRole("button", { name: "Wyślij odpowiedzi" }).click();
      await expect(page.getByRole("heading", { level: 2, name: "Test zaliczony" })).toBeVisible();
      await expect(page.getByText("Gratulacje — kolejny etap ścieżki został odblokowany.")).toBeVisible();
      await expect(page.getByRole("button", { name: /Rozpocznij|Podejdź ponownie/ })).toHaveCount(0);
      await sprawdzStan(page, testInfo, "wynik zaliczony", { tekst: "Wróć do kursu", zdanie: "Test zaliczony." });
      await zdjecie(page, `nowy-${szerokosc}-4-wynik-zaliczony`);
    });

    test("test zaliczony już przy wejściu: wynik z historii i „Test zaliczony”, bez „Rozpocznij”", async ({ page }, testInfo) => {
      await instalujAtrapy(page, "zaliczony");
      await otworz(page);

      await expect(page.getByRole("heading", { level: 2, name: "Test zaliczony" })).toBeVisible();
      await expect(page.locator("main section p").filter({ hasText: /^100%$/ })).toHaveCount(1);
      await expect(page.getByText("Próg zaliczenia: 70% · Podejście 2 z 4")).toBeVisible();
      await expect(page.getByRole("button", { name: /Rozpocznij/ })).toHaveCount(0);
      await sprawdzStan(page, testInfo, "zaliczony przy wejściu", { tekst: "Wróć do kursu", zdanie: "Test zaliczony." });
      await zdjecie(page, `nowy-${szerokosc}-5-zaliczony-przy-wejsciu`);
    });

    test("kurs bez testu (404): odmowa ze wspólnego ekranu, przycisk w treści na telefonie na całą szerokość", async ({ page }, testInfo) => {
      await instalujAtrapy(page, "brak-testu");
      await otworz(page);

      const przycisk = page.locator("main").getByRole("button", { name: "Wróć do kursu" });
      await expect(przycisk).toBeVisible();
      await sprawdzStan(page, testInfo, "odmowa 404", null);
      if (szerokosc < 640) {
        // Szerokość treści karty odmowy (bez jej wypełnienia i ramki) — przycisk zajmuje ją całą.
        const szerokosci = await przycisk.evaluate((element) => {
          const karta = element.closest("section") as HTMLElement;
          const styl = getComputedStyle(karta);
          const tresc = karta.clientWidth - parseFloat(styl.paddingLeft) - parseFloat(styl.paddingRight);
          return { przycisk: element.getBoundingClientRect().width, tresc };
        });
        expect(Math.abs(szerokosci.przycisk - szerokosci.tresc)).toBeLessThanOrEqual(2);
      }
      await zdjecie(page, `nowy-${szerokosc}-6-odmowa-brak-testu`);
    });
  });
}
