import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Świadek odstępu pionowego ekranu „Sprawy do decyzji”, przy 390 i 1280 px,
 * z liczbami z `getBoundingClientRect` (bez wartości wpisanych na sztywno):
 * - dół górnego paska → góra pierwszego elementu nagłówka ekranu (na „Dyżurach”
 *   to okruszek, na „Sprawach” `h1`): `/admin/sprawy` = `/admin/staz`;
 * - dół górnego paska → góra `h1`: `/admin/sprawy` = pulpit administracji =
 *   „Uczestnicy programu” (ekrany tego samego poziomu, bez okruszka podstrony;
 *   „Dyżury” są podstroną „Spraw” i mają nad `h1` okruszek, więc ich odstęp do
 *   `h1` jest większy o jego wysokość i nie jest tu porównywany);
 * - dół obszaru treści opakowania ekranu (pierwszego elementu łańcucha jedynych dzieci `main`, który ma kilka
 *   dzieci; bez jego wypełnienia i ramki dolnej) → koniec `main`: `/admin/sprawy` = `/admin/staz`;
 * - `/admin/sprawy` przy 390 px bez przewijania w poziomie.
 * Wszystkie ekrany dostają te same atrapy `/me`, `/admin/edition` i panelu, a
 * menu jest stałe (z rejestru), więc różnica może pochodzić tylko z opakowania
 * ekranu. Okno jest niskie (300 px): treść jest wyższa niż okno, więc koniec
 * `main` wyznacza treść z odstępem, a nie rozciągnięte do okna tło. Trasa
 * poligonu `/nowy-front/admin/sprawy` (bez powłoki panelu) dostaje tylko
 * pomiar odstępu góry dokumentu do `h1`, bez asercji o wartości.
 */

const API = "http://localhost:8000/api/v1";
const ATRAPA_SESJI = { accessToken: "atrapa-tokenu-testowego", expiresAt: Date.now() + 3_600_000 };
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
const META = (total: number) => ({ current_page: 1, per_page: 100, total, last_page: 1 });

function koperta(dane: unknown, meta?: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }) };
}

const WPIS = {
  id: 91,
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
  user: { id: 11, first_name: "Marta", last_name: "Demo" },
};
const ZGLOSZENIE = { id: 3, first_name: "Anna", last_name: "Kandydacka", created_at: "2026-09-20T10:00:00Z" };

/** Te same atrapy dla obu ekranów; ogólna pierwsza (Playwright bierze trasę zarejestrowaną później). */
async function instalujAtrapy(page: Page): Promise<void> {
  await page.route(`${API}/**`, (route) => route.fulfill(koperta([], META(0))));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(koperta({ id: 1, role: "project_manager", first_name: "Anna", last_name: "Demo", program_completed_at: null })),
  );
  await page.route(`${API}/notifications**`, (route) =>
    route.fulfill(koperta([], { ...META(0), extra: { unread: 0 } })),
  );
  await page.route(`${API}/admin/edition`, (route) => route.fulfill(koperta(EDYCJA)));
  await page.route(`${API}/admin/dashboard`, (route) =>
    route.fulfill(koperta({ counters: { participants: 3, completed: 1, certificates: 1 }, queues: [] })),
  );
  await page.route(`${API}/admin/internship/pending**`, (route) => route.fulfill(koperta([WPIS], META(1))));
  await page.route(`${API}/admin/applications**`, (route) => route.fulfill(koperta([ZGLOSZENIE], META(1))));
  await page.route(`${API}/admin/supervision/cases`, (route) => route.fulfill(koperta([])));
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(koperta({ url: null })));
}

interface Odstepy {
  paskiDoNaglowkaEkranu: number;
  paskiDoH1: number;
  trescDoKoncaMain: number;
  przewijaniePoziome: number;
  /** Tylko do logu: opakowanie ekranu, względem którego liczony jest odstęp dolny. */
  ostatni: string;
}

/**
 * Odstęp 1: dół górnego paska (`header` spoza `main`) → góra `h1`.
 * Odstęp 2: dół obszaru treści opakowania ekranu (dziecka `main`, bez
 * jego wypełnienia i ramki dolnej) → dół `main`.
 */
async function zmierz(page: Page): Promise<Odstepy> {
  return page.evaluate(() => {
    const naglowki = Array.from(document.querySelectorAll("header")).filter((el) => !el.closest("main"));
    const pasek = naglowki[0];
    const h1 = document.querySelector("h1");
    const main = document.querySelector("main");
    if (!pasek || !h1 || !main) throw new Error("brak paska, h1 albo main");
    const naglowekEkranu = main.querySelector("header");
    if (!naglowekEkranu) throw new Error("brak nagłówka ekranu w main");
    // Opakowanie ekranu: pierwszy element łańcucha jedynych dzieci `main`, który ma więcej niż jedno dziecko
    // (nagłówek, treść, sekcje). Jego dół BEZ własnego wypełnienia i
    // ramki dolnej to koniec treści ekranu; wypełnienie opakowania jest częścią odstępu do końca
    // `main`, więc dół pudełka opakowania by je ukrył, a potomkowie opakowania go nie zmieniają.
    let opakowanie = main.firstElementChild as HTMLElement;
    while (opakowanie.children.length === 1) opakowanie = opakowanie.firstElementChild as HTMLElement;
    const stylOpakowania = getComputedStyle(opakowanie);
    const najnizej =
      opakowanie.getBoundingClientRect().bottom -
      parseFloat(stylOpakowania.paddingBottom) -
      parseFloat(stylOpakowania.borderBottomWidth);
    const ostatni = `${opakowanie.tagName.toLowerCase()}.${String(opakowanie.className).slice(0, 40)} h=${Math.round(opakowanie.getBoundingClientRect().height)} pb=${stylOpakowania.paddingBottom} dzieci=${opakowanie.children.length} rodzenstwo=${main.children.length}`;
    const zaokr = (x: number) => Math.round(x * 100) / 100;
    return {
      paskiDoNaglowkaEkranu: zaokr(naglowekEkranu.getBoundingClientRect().top - pasek.getBoundingClientRect().bottom),
      paskiDoH1: Math.round((h1.getBoundingClientRect().top - pasek.getBoundingClientRect().bottom) * 100) / 100,
      trescDoKoncaMain: Math.round((main.getBoundingClientRect().bottom - najnizej) * 100) / 100,
      ostatni,
      przewijaniePoziome: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

const SZEROKOSCI = [390, 1280] as const;

test.describe("odstęp pionowy opakowania ekranu Spraw", () => {
  for (const szerokosc of SZEROKOSCI) {
    test(`/admin/sprawy @${szerokosc}: odstęp od paska do h1 i od treści do końca main równe /admin/staz`, async ({ page }) => {
      await page.setViewportSize({ width: szerokosc, height: 300 });
      await instalujAtrapy(page);

      await page.goto("/admin/staz");
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.getByRole("heading", { level: 1, name: "Dyżury do decyzji" })).toBeVisible();
      await expect(page.getByRole("list", { name: "Dyżury do decyzji" }).getByRole("listitem")).toHaveCount(1);
      const staz = await zmierz(page);

      await page.goto("/admin");
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Okruszki" })).toHaveCount(0);
      const pulpit = await zmierz(page);

      await page.goto("/admin/uczestniczki");
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.getByRole("heading", { level: 1, name: "Uczestnicy programu" })).toBeVisible();
      const uczestniczki = await zmierz(page);

      await page.goto("/admin/sprawy");
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.getByRole("heading", { level: 1, name: "Sprawy do decyzji" })).toBeVisible();
      await expect(page.getByText("Anna Kandydacka")).toBeVisible();
      await expect(page.getByText("Marta Demo")).toBeVisible();
      const sprawy = await zmierz(page);

      console.log(`POMIAR-ODSTEP @${szerokosc} staz ${JSON.stringify(staz)} pulpit ${JSON.stringify(pulpit)} uczestniczki ${JSON.stringify(uczestniczki)} sprawy ${JSON.stringify(sprawy)}`);

      expect.soft(sprawy.paskiDoNaglowkaEkranu, "dół paska → góra nagłówka ekranu: Sprawy = Dyżury").toBe(staz.paskiDoNaglowkaEkranu);
      expect.soft(sprawy.paskiDoH1, "dół paska → góra h1: Sprawy = pulpit administracji (ekran bez okruszka)").toBe(pulpit.paskiDoH1);
      expect.soft(sprawy.paskiDoH1, "dół paska → góra h1: Sprawy = Uczestnicy (ten sam poziom)").toBe(uczestniczki.paskiDoH1);
      expect.soft(sprawy.trescDoKoncaMain, "dół ostatniego elementu → koniec main: Sprawy = Dyżury").toBe(staz.trescDoKoncaMain);
      if (szerokosc === 390) expect(sprawy.przewijaniePoziome, "scrollWidth − clientWidth").toBeLessThanOrEqual(0);
    });
  }

  for (const szerokosc of SZEROKOSCI) {
    test(`poligon /nowy-front/admin/sprawy @${szerokosc}: pomiar odstępu góry okna do h1 (bez asercji o wartości)`, async ({ page }) => {
      await page.setViewportSize({ width: szerokosc, height: 300 });
      await instalujAtrapy(page);
      const odpowiedz = await page.goto("/nowy-front/admin/sprawy");
      expect(odpowiedz?.status()).toBe(200);
      const h1 = page.getByRole("heading", { level: 1, name: "Sprawy do decyzji" });
      await expect(h1).toBeVisible();
      await expect(page.getByText("Anna Kandydacka")).toBeVisible();
      const gora = await h1.evaluate((el) => ({
        top: Math.round((el.getBoundingClientRect().top + window.scrollY) * 100) / 100,
        scrollY: window.scrollY,
      }));
      console.log(`POMIAR-ODSTEP-POLIGON @${szerokosc} gora dokumentu → h1 ${gora.top} (scrollY ${gora.scrollY})`);
    });
  }
});
