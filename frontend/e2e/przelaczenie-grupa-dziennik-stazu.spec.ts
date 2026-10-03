import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";

/**
 * Grupa przełączenia `dziennikStazu` (`lib/przelaczenie/grupy.ts`) jest
 * włączona: adres `/panel/staz` się nie zmienia (bez przekierowania), pod nim
 * stoi dziennik stażu nowego frontu w nowej ramce panelu uczestnika.
 * Sprawdzane na zbudowanej aplikacji, z atrapą API przez `page.route` i atrapą
 * sesji (jak w `przelaczenie-grupa-kolejka-stazu.spec.ts`):
 * - adres po wejściu ten sam, `h1`, tytuł karty, jedyny `main` i `#tresc`,
 *   jeden link skoku, nowa ramka, karta zatwierdzonych godzin i wiersze listy;
 * - dodanie wpisu: formularz, ciało żądania z pięcioma polami, wpis na liście;
 * - stan pusty;
 * - bez przewijania w poziomie przy 1280, 390 i 320 px (lista, formularz, stan
 *   pusty), axe (WCAG 2.1 AA) na liście i na otwartym formularzu;
 * - zero odpowiedzi 404 w całym przebiegu.
 */

const API = "http://localhost:8000/api/v1";
const ATRAPA_SESJI = { accessToken: "atrapa-tokenu-testowego", expiresAt: Date.now() + 3_600_000 };

function wpis(id: number, nadpisz: Record<string, unknown> = {}) {
  return {
    id,
    date: "2026-08-27",
    hours: "3.5",
    form: "phone_duty",
    consultations_count: 4,
    description: "Dyżur telefoniczny — bez danych osób.",
    status: "submitted",
    review_comment: null,
    decided_at: null,
    created_at: "2026-08-27T18:00:00Z",
    updated_at: "2026-08-27T18:00:00Z",
    ...nadpisz,
  };
}

function wpisyPrzykladowe() {
  return [
    wpis(91),
    wpis(92, { date: "2026-08-20", form: "chat_duty", hours: "2", consultations_count: 1, status: "accepted", decided_at: "2026-08-21T09:00:00Z" }),
    wpis(93, {
      date: "2026-08-13",
      form: "other",
      hours: "1.5",
      consultations_count: 0,
      status: "returned",
      review_comment: "Uzupełnij opis dyżuru.",
    }),
    wpis(94, { date: "2026-08-06", status: "rejected", review_comment: "Wpis dotyczy dyżuru spoza programu." }),
  ];
}

function koperta(dane: unknown, meta?: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }) };
}

function metaListy(total: number) {
  return { current_page: 1, per_page: 25, total, last_page: 1, extra: { accepted_hours: "41.5", required_hours: "72" } };
}

interface Atrapy {
  zapisy: { metoda: string; adres: string; cialo: unknown }[];
  wpisy: ReturnType<typeof wpis>[];
}

/** Atrapy API roli wolontariackiej; ogólna atrapa pierwsza — późniejsza trasa wygrywa. */
async function instalujAtrapyApi(page: Page, wpisy: ReturnType<typeof wpis>[]): Promise<Atrapy> {
  const stan: Atrapy = { zapisy: [], wpisy };
  await page.route(`${API}/**`, (route) => route.fulfill(koperta([], { current_page: 1, per_page: 25, total: 0, last_page: 1 })));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(koperta({ id: 17, role: "volunteer", first_name: "Marta", last_name: "Demo", program_completed_at: null })),
  );
  await page.route(`${API}/notifications**`, (route) =>
    route.fulfill(koperta([], { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { unread: 0 } })),
  );
  await page.route(`${API}/internship/entries**`, async (route) => {
    const zadanie = route.request();
    if (zadanie.method() === "GET") {
      await route.fulfill(koperta(stan.wpisy, metaListy(stan.wpisy.length)));
      return;
    }
    const cialo = zadanie.postDataJSON() as Record<string, unknown>;
    stan.zapisy.push({ metoda: zadanie.method(), adres: new URL(zadanie.url()).pathname.replace("/api/v1", ""), cialo });
    const nowy = wpis(200 + stan.zapisy.length, { ...cialo, status: "submitted" });
    stan.wpisy = [nowy, ...stan.wpisy];
    await route.fulfill({ ...koperta(nowy), status: 201 });
  });
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(koperta({ url: null })));
  return stan;
}

function zbierz404(page: Page): string[] {
  const kody404: string[] = [];
  page.on("response", (res) => {
    if (res.status() === 404) kody404.push(res.url());
  });
  return kody404;
}

async function przewijanieWPoziomie(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

const SZEROKOSCI = [1280, 390, 320] as const;

test.describe("grupa przełączenia dziennika stażu — ekran nowego frontu pod adresem /panel/staz", () => {
  for (const szerokosc of SZEROKOSCI) {
    test(`/panel/staz @${szerokosc}: adres bez zmian, h1, jeden main, nowa ramka, lista, formularz, brak przewijania w poziomie, axe, 0 odpowiedzi 404`, async ({
      page,
    }, testInfo) => {
      const kody404 = zbierz404(page);
      await page.setViewportSize({ width: szerokosc, height: szerokosc >= 1024 ? 900 : 844 });
      const stan = await instalujAtrapyApi(page, wpisyPrzykladowe());

      const odpowiedz = await page.goto("/panel/staz");
      await zabezpieczeniePrzedEkranemDostepu(page);

      expect(odpowiedz?.status()).toBe(200);
      await expect(page).toHaveURL(/\/panel\/staz$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1, name: "Dziennik stażu" })).toBeVisible();
      await expect(page).toHaveTitle("Dziennik stażu — Niepodzielni");
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("#tresc")).toHaveCount(1);
      await expect(page.locator('a[href="#tresc"]')).toHaveCount(1);
      await expect(page.locator("[data-powloka-panelu]")).toHaveCount(1);
      // Nic ze starego ekranu.
      await expect(page.getByText("Twój postęp")).toHaveCount(0);

      await expect(page.getByRole("heading", { level: 2, name: "Zatwierdzone godziny" })).toBeVisible();
      await expect(page.getByText("41,5 z 72 godz.")).toBeVisible();
      const wiersze = page.getByRole("table", { name: "Twoje wpisy" }).locator('[role="row"][data-wiersz]');
      await expect(wiersze).toHaveCount(4);
      await expect(wiersze.nth(0)).toContainText("27 sierpnia 2026");
      await expect(wiersze.nth(0)).toContainText("Czeka na decyzję");
      await expect(wiersze.nth(1)).toContainText("Zatwierdzony");
      await expect(wiersze.nth(2)).toContainText("Odesłany do poprawy");
      await expect(wiersze.nth(2)).toContainText("Inna forma");
      await expect(wiersze.nth(3)).toContainText("Odrzucony");

      const poziom = await przewijanieWPoziomie(page);
      console.log(`POMIAR-SZEROKOSC dziennik-stazu @${szerokosc} lista ${JSON.stringify(poziom)}`);
      expect(poziom.scrollWidth, "przewijanie w poziomie: lista").toBeLessThanOrEqual(poziom.clientWidth);

      const naruszeniaListy = await uruchomAxe(page);
      await dolaczNaruszeniaDoRaportu(testInfo, `axe-dziennik-stazu-lista-${szerokosc}`, naruszeniaListy);
      expect(naruszeniaListy.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);

      // Dodanie wpisu: jedyny przycisk główny w nagłówku, formularz z pięcioma polami.
      await page.getByRole("button", { name: "Dodaj wpis" }).first().click();
      await expect(page.getByRole("form", { name: "Dodaj wpis" })).toBeVisible();
      await page.getByLabel("Liczba godzin").fill("2.5");
      await page.getByLabel("Opis dyżuru").fill("Dyżur czatowy — bez danych osób.");

      const poziomFormularza = await przewijanieWPoziomie(page);
      console.log(`POMIAR-SZEROKOSC dziennik-stazu @${szerokosc} formularz ${JSON.stringify(poziomFormularza)}`);
      expect(poziomFormularza.scrollWidth, "przewijanie w poziomie: formularz").toBeLessThanOrEqual(poziomFormularza.clientWidth);

      const naruszeniaFormularza = await uruchomAxe(page);
      await dolaczNaruszeniaDoRaportu(testInfo, `axe-dziennik-stazu-formularz-${szerokosc}`, naruszeniaFormularza);
      expect(naruszeniaFormularza.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);

      await page.getByRole("button", { name: "Zapisz i wyślij" }).click();
      await expect(page.getByText("Wpis zapisany i wysłany do decyzji.")).toBeVisible();
      expect(stan.zapisy).toHaveLength(1);
      expect(stan.zapisy[0].metoda).toBe("POST");
      expect(stan.zapisy[0].adres).toBe("/internship/entries");
      expect(Object.keys(stan.zapisy[0].cialo as object).sort()).toEqual(["consultations_count", "date", "description", "form", "hours"]);
      expect((stan.zapisy[0].cialo as { hours: string }).hours).toBe("2.5");
      await expect(wiersze).toHaveCount(5);

      expect(kody404, `odpowiedzi 404: ${kody404.join(", ")}`).toEqual([]);
    });

    test(`/panel/staz @${szerokosc}: pusty dziennik pokazuje stan pusty z przyciskiem, bez przewijania w poziomie, axe`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: szerokosc, height: szerokosc >= 1024 ? 900 : 844 });
      await instalujAtrapyApi(page, []);

      await page.goto("/panel/staz");
      await zabezpieczeniePrzedEkranemDostepu(page);

      await expect(page.getByRole("heading", { level: 1, name: "Dziennik stażu" })).toBeVisible();
      await expect(page.getByText("Nie masz jeszcze wpisów")).toBeVisible();
      await expect(page.getByRole("button", { name: "Dodaj pierwszy wpis" })).toBeVisible();
      await expect(page.locator("main")).toHaveCount(1);

      const poziom = await przewijanieWPoziomie(page);
      console.log(`POMIAR-SZEROKOSC dziennik-stazu @${szerokosc} pusty ${JSON.stringify(poziom)}`);
      expect(poziom.scrollWidth, "przewijanie w poziomie: stan pusty").toBeLessThanOrEqual(poziom.clientWidth);

      const naruszenia = await uruchomAxe(page);
      await dolaczNaruszeniaDoRaportu(testInfo, `axe-dziennik-stazu-pusty-${szerokosc}`, naruszenia);
      expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);
    });
  }
});
