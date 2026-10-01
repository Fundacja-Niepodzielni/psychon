import { mkdirSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";

/**
 * Miara dla tej gałęzi: grupa przełączenia `kursyAdministracji`
 * (`lib/przelaczenie/grupy.ts`) ma tu `wlaczona: true`.
 *
 * Rodzaj „podmiana treści”: adres `/admin/kursy` się nie zmienia (bez
 * przekierowania), pod nim stoi lista kursów administracji w nowej ramce panelu.
 * Szczegół kursu (`/admin/kursy/{id}`) należy do osobnej grupy `kursAdministracji`
 * (`przelaczenie-grupa-kurs-administracji.spec.ts`) i stoi w tej samej nowej
 * ramce. Sprawdzane na zbudowanej aplikacji, z atrapą API przez
 * `page.route` i atrapą sesji (jak w `przelaczenie-grupa-kolejka-stazu.spec.ts`):
 * - adres po wejściu ten sam, `h1`, tytuł karty, jedyny `main` i `#tresc`,
 *   jedyny link skoku, nowa ramka, pozycja menu „Kursy” na tym samym adresie,
 *   jeden przycisk główny, brak przewijania w poziomie;
 * - axe (WCAG 2.1 AA) w stanach: dane, pusto, formularz otwarty, okno zmiany
 *   kolejności, na 1280 i 390 px; axe z tagiem `best-practice` po przełączeniu
 *   bez naruszeń, których nie było przed (poligon);
 * - utworzenie kursu (ciało żądania i przejście na ekran kursu), zmiana
 *   kolejności ścieżki (podgląd, potwierdzenie, ciało PATCH, fokus);
 * - zero odpowiedzi 404 w całym przebiegu.
 *
 * Zrzuty ekranu powstają tylko przy ustawionej zmiennej `PW_ZRZUTY_KURSY`
 * (katalog poza repozytorium).
 */

const API = "http://localhost:8000/api/v1";

const ATRAPA_SESJI = {
  accessToken: "atrapa-tokenu-testowego",
  expiresAt: Date.now() + 3_600_000,
};

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

function kurs(id: number, tytul: string, nadpisz: Record<string, unknown> = {}) {
  return {
    id,
    title: tytul,
    slug: `kurs-${id}`,
    description: null,
    type: "course",
    product_group: "psychon",
    sequence_order: id,
    edition_id: 1,
    is_published: true,
    lessons_count: 3,
    materials_count: 0,
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-01T10:00:00Z",
    ...nadpisz,
  };
}

function czteryKursy() {
  return [
    kurs(1, "Podstawy pomocy psychologicznej", { lessons_count: 1 }),
    kurs(2, "Wywiad psychologiczny", { is_published: false }),
    kurs(3, "Interwencja kryzysowa", { lessons_count: 5 }),
    kurs(4, "Webinar otwarty", { type: "webinar", sequence_order: null, product_group: "both", lessons_count: 0 }),
  ];
}

function koperta(dane: unknown, meta?: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }) };
}

function metaListy(total: number) {
  return { current_page: 1, per_page: 100, total, last_page: 1 };
}

interface Zapytanie {
  adres: string;
  cialo: unknown;
}

interface Atrapy {
  zapytania: Zapytanie[];
}

const PODGLAD = [
  { user_id: 17, first_name: "Marta", last_name: "Demo", course_id: 2, course_title: "Wywiad psychologiczny", from: "in_progress", to: "locked" },
];

/** Podgląd wpływu zmiany dla `liczba` osób: „Osoba Nr 1”, „Osoba Nr 2” … — każda z jednym kursem do zablokowania. */
function podgladDlaOsob(liczba: number) {
  return Array.from({ length: liczba }, (_, i) => ({
    user_id: 100 + i,
    first_name: "Osoba",
    last_name: `Nr ${i + 1}`,
    course_id: 2,
    course_title: "Wywiad psychologiczny",
    from: "in_progress",
    to: "locked",
  }));
}

/**
 * Atrapy API roli administracji. Ogólna atrapa jest rejestrowana PIERWSZA —
 * Playwright wybiera trasę zarejestrowaną PÓŹNIEJ jako pierwszą.
 */
async function instalujAtrapyApi(
  page: Page,
  opcje: { kursy?: ReturnType<typeof kurs>[]; odmowa?: boolean; blad?: boolean; osoby?: number } = {},
): Promise<Atrapy> {
  const stan: Atrapy = { zapytania: [] };
  const podglad = opcje.osoby === undefined ? PODGLAD : podgladDlaOsob(opcje.osoby);
  const kursy = opcje.kursy ?? czteryKursy();

  await page.route(`${API}/**`, (route) => route.fulfill(koperta([], metaListy(0))));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(koperta({ id: 1, role: "project_manager", first_name: "Opiekun", last_name: "Demo", program_completed_at: null })),
  );
  await page.route(`${API}/notifications**`, (route) => route.fulfill(koperta([], { ...metaListy(0), extra: { unread: 0 } })));
  await page.route(`${API}/admin/dashboard`, (route) =>
    route.fulfill(koperta({ counters: { participants: 3, completed: 1, certificates: 1 }, queues: [] })),
  );
  await page.route(`${API}/admin/edition`, (route) => route.fulfill(koperta(EDYCJA)));
  await page.route(
    (adres) => adres.pathname.startsWith("/api/v1/admin/courses"),
    async (route) => {
      const zadanie = route.request();
      const sciezka = new URL(zadanie.url()).pathname.replace("/api/v1", "");
      const metoda = zadanie.method();
      if (opcje.odmowa) {
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({ error: { status: 403, code: "forbidden", message: "Brak uprawnień." } }),
        });
        return;
      }
      if (opcje.blad) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: { status: 500, code: "server_error", message: "Błąd serwera." } }),
        });
        return;
      }
      if (sciezka === "/admin/courses" && metoda === "GET") {
        await route.fulfill(koperta(kursy, metaListy(kursy.length)));
      } else if (sciezka === "/admin/courses" && metoda === "POST") {
        stan.zapytania.push({ adres: "POST /admin/courses", cialo: zadanie.postDataJSON() });
        await route.fulfill({ ...koperta(kurs(9, "Nowy kurs", { is_published: false, sequence_order: null, lessons_count: 0 })), status: 201 });
      } else if (sciezka === "/admin/courses/reorder/preview") {
        stan.zapytania.push({ adres: "POST /admin/courses/reorder/preview", cialo: zadanie.postDataJSON() });
        await route.fulfill(koperta(podglad));
      } else if (sciezka === "/admin/courses/reorder") {
        stan.zapytania.push({ adres: "PATCH /admin/courses/reorder", cialo: zadanie.postDataJSON() });
        await route.fulfill(koperta(kursy));
      } else if (/^\/admin\/courses\/\d+$/.test(sciezka)) {
        // Jeden kurs — obiekt w kopercie.
        await route.fulfill(koperta(kurs(Number(sciezka.split("/")[3]), "Nowy kurs", { is_published: false })));
      } else if (/^\/admin\/courses\/\d+\/tests$/.test(sciezka)) {
        // Kurs bez testu.
        await route.fulfill(koperta(null));
      } else {
        // Adresy pod kursem (lekcje, tematy, przypisania) to listy w kopercie.
        await route.fulfill(koperta([], metaListy(0)));
      }
    },
  );

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

function katalogZrzutow(): string | null {
  const katalog = process.env.PW_ZRZUTY_KURSY;
  if (!katalog) return null;
  mkdirSync(katalog, { recursive: true });
  return katalog;
}

/**
 * Pomiar przeglądarki dla okna: wyrazy łamane w środku (wyraz, którego prostokąty leżą w dwóch liniach) oraz
 * poziome przewinięcie okna (`scrollWidth - clientWidth`). Wyraz = ciąg znaków bez białych w jednym węźle tekstu.
 */
async function zmierzOkno(okno: Locator): Promise<{ lamane: string[]; przewiniecie: number; wyrazy: number }> {
  return okno.evaluate((element) => {
    const lamane: string[] = [];
    let wyrazy = 0;
    const przechodzenie = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let wezel = przechodzenie.nextNode(); wezel; wezel = przechodzenie.nextNode()) {
      const tekst = wezel.textContent ?? "";
      for (const wyraz of tekst.matchAll(/\S+/g)) {
        const zakres = document.createRange();
        zakres.setStart(wezel, wyraz.index ?? 0);
        zakres.setEnd(wezel, (wyraz.index ?? 0) + wyraz[0].length);
        const linie = new Set(
          Array.from(zakres.getClientRects())
            .filter((prostokat) => prostokat.width > 0)
            .map((prostokat) => Math.round(prostokat.top)),
        );
        if (linie.size === 0) continue;
        wyrazy += 1;
        if (linie.size > 1) lamane.push(wyraz[0]);
      }
    }
    return { lamane, przewiniecie: element.scrollWidth - element.clientWidth, wyrazy };
  });
}

async function zrzut(page: Page, nazwa: string): Promise<void> {
  const katalog = katalogZrzutow();
  if (katalog) await page.screenshot({ path: path.join(katalog, `${nazwa}.png`), fullPage: true });
}

async function licznikiTresci(page: Page) {
  return {
    main: await page.locator("main").count(),
    cele: await page.locator("#tresc").count(),
  };
}

async function naruszeniaZBestPractice(page: Page): Promise<{ id: string; impact: string; wezly: string[] }[]> {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.constructor?.name !== "CSSTransition" || a.playState !== "running"),
  );
  const wynik = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "best-practice"]).analyze();
  return wynik.violations.map((v) => ({
    id: v.id,
    impact: String(v.impact),
    wezly: v.nodes.map((n) => n.target.map(String).join(" ")),
  }));
}

async function sprawdzAxe(page: Page, testInfo: Parameters<typeof dolaczNaruszeniaDoRaportu>[0], nazwa: string) {
  const naruszenia = await uruchomAxe(page);
  await dolaczNaruszeniaDoRaportu(testInfo, nazwa, naruszenia);
  expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);
}

function wiersze(page: Page) {
  return page.locator('section[aria-label="Lista kursów"] [role="row"][data-wiersz]');
}

const SZEROKOSCI = [1280, 390] as const;
const WIDOKI_OKNA = [
  { szerokosc: 1280, wysokosc: 800 },
  { szerokosc: 390, wysokosc: 844 },
  { szerokosc: 390, wysokosc: 600 },
] as const;
const LICZBY_OSOB = [1, 4, 30] as const;
const NAZWA_LISTY_PODGLADU = "Wpływ nowej kolejności na statusy kursów";

test.describe("grupa przełączenia kursów administracji — lista pod adresem /admin/kursy", () => {
  for (const szerokosc of SZEROKOSCI) {
    test(`/admin/kursy @${szerokosc}: adres bez zmian, h1, tytuł, jeden main, nowa ramka, menu, axe, 0 odpowiedzi 404`, async ({ page }, testInfo) => {
      const kody404 = zbierz404(page);
      await page.setViewportSize({ width: szerokosc, height: szerokosc >= 1024 ? 900 : 844 });
      await instalujAtrapyApi(page);

      const odpowiedzStrony = await page.goto("/admin/kursy");
      await zabezpieczeniePrzedEkranemDostepu(page);

      expect(odpowiedzStrony?.status()).toBe(200);
      await expect(page).toHaveURL(/\/admin\/kursy$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1, name: "Kursy" })).toBeVisible();
      await expect(page).toHaveTitle("Kursy — Niepodzielni");

      await expect(wiersze(page)).toHaveCount(4);
      await expect(wiersze(page).first()).toContainText("Podstawy pomocy psychologicznej");
      // Typ i grupa pod nazwą kursu; miejsce w ścieżce i liczba lekcji w swoich kolumnach.
      const pierwszy = wiersze(page).first().getByRole("cell");
      await expect(pierwszy.nth(0)).toContainText("Kurs · PsychON");
      await expect(pierwszy.nth(2)).toHaveText(/^Miejsce w ścieżce\s*1$/);
      await expect(pierwszy.nth(3)).toHaveText(/^Lekcje\s*1\s*lekcja$/);
      const ostatni = wiersze(page).nth(3).getByRole("cell");
      await expect(ostatni.nth(0)).toContainText("Webinar · Obie grupy");
      await expect(ostatni.nth(2)).toHaveText(/^Miejsce w ścieżce\s*poza ścieżką$/);
      await expect(ostatni.nth(3)).toHaveText(/^Lekcje\s*0\s*lekcji$/);
      await expect(page.getByRole("link", { name: "Otwórz kurs: Wywiad psychologiczny" })).toHaveAttribute("href", "/admin/kursy/2");

      // Jeden przycisk główny w nagłówku, drugorzędna akcja obok.
      await expect(page.getByRole("button", { name: "Utwórz kurs" })).toHaveCount(1);
      await expect(page.getByRole("button", { name: "Zmień kolejność ścieżki" })).toBeVisible();

      expect(await licznikiTresci(page)).toEqual({ main: 1, cele: 1 });
      await expect(page.locator('a[href="#tresc"]')).toHaveCount(1);

      await expect(page.locator("[data-powloka-panelu]")).toHaveCount(1);
      const przyciskMenu = page.getByRole("button", { name: "Menu", exact: true });
      if (szerokosc >= 1024) {
        await expect(przyciskMenu).toBeHidden();
        const nav = page.getByRole("complementary", { name: "Menu i konto" }).getByRole("navigation", { name: "Menu — Administracja" });
        await expect(nav.getByRole("link", { name: "Kursy", exact: true })).toHaveAttribute("href", "/admin/kursy");
        await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
      } else {
        await expect(przyciskMenu).toBeVisible();
        await przyciskMenu.click();
        const okno = page.getByRole("dialog", { name: "Menu i konto" });
        await expect(okno).toBeVisible();
        await expect(okno.getByRole("navigation", { name: "Menu — Administracja" }).getByRole("link", { name: "Kursy", exact: true })).toHaveAttribute("href", "/admin/kursy");
        await okno.getByRole("button", { name: "Zamknij" }).click();
        await expect(page.getByRole("dialog", { name: "Menu i konto" })).toHaveCount(0);
      }

      const przewijanie = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(przewijanie, "przewijanie w poziomie").toBe(false);

      await sprawdzAxe(page, testInfo, `axe-kursy-dane-${szerokosc}`);
      await zrzut(page, `kursy-${szerokosc}-dane`);
      expect(kody404, `odpowiedzi 404: ${kody404.join(", ")}`).toEqual([]);
    });

    test(`/admin/kursy @${szerokosc}: pusta lista, formularz otwarty i okno zmiany kolejności przechodzą axe`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: szerokosc, height: szerokosc >= 1024 ? 900 : 844 });

      // Pusta lista.
      await instalujAtrapyApi(page, { kursy: [] });
      await page.goto("/admin/kursy");
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.getByRole("heading", { name: "Brak kursów w tej edycji" })).toBeVisible();
      expect(await licznikiTresci(page)).toEqual({ main: 1, cele: 1 });
      await sprawdzAxe(page, testInfo, `axe-kursy-pusto-${szerokosc}`);
      await zrzut(page, `kursy-${szerokosc}-pusto`);
    });

    test(`/admin/kursy @${szerokosc}: formularz „Utwórz kurs” otwarty (z rozwiniętym miejscem w ścieżce) przechodzi axe`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: szerokosc, height: szerokosc >= 1024 ? 900 : 844 });
      await instalujAtrapyApi(page);
      await page.goto("/admin/kursy");
      await zabezpieczeniePrzedEkranemDostepu(page);

      await page.getByRole("button", { name: "Utwórz kurs" }).click();
      await expect(page.getByRole("heading", { name: "Nowy kurs" })).toBeVisible();
      await expect(page.getByLabel(/^Tytuł/)).toBeFocused();
      await expect(page.getByRole("button", { name: "Utwórz kurs" })).toHaveCount(1);
      await page.getByRole("button", { name: /Miejsce w ścieżce/ }).click();
      await expect(page.getByLabel(/^Pozycja w ścieżce/)).toBeVisible();
      await sprawdzAxe(page, testInfo, `axe-kursy-formularz-${szerokosc}`);
      await zrzut(page, `kursy-${szerokosc}-formularz`);
    });

    test(`/admin/kursy @${szerokosc}: lista zmiany kolejności przechodzi axe`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: szerokosc, height: szerokosc >= 1024 ? 900 : 844 });
      await instalujAtrapyApi(page);
      await page.goto("/admin/kursy");
      await zabezpieczeniePrzedEkranemDostepu(page);

      await page.getByRole("button", { name: "Zmień kolejność ścieżki" }).click();
      await expect(page.getByRole("heading", { name: "Kolejność ścieżki" })).toBeVisible();
      await sprawdzAxe(page, testInfo, `axe-kursy-kolejnosc-${szerokosc}`);
      await zrzut(page, `kursy-${szerokosc}-kolejnosc`);
    });

    // Skan axe instaluje własną trasę sieciową nad atrapami API, więc żądania wpływu zmiany idą przed skanem.
    test(`/admin/kursy @${szerokosc}: okno potwierdzenia zmiany kolejności przechodzi axe`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: szerokosc, height: szerokosc >= 1024 ? 900 : 844 });
      await instalujAtrapyApi(page);
      await page.goto("/admin/kursy");
      await zabezpieczeniePrzedEkranemDostepu(page);

      await page.getByRole("button", { name: "Zmień kolejność ścieżki" }).click();
      await page.getByRole("button", { name: "Przesuń w dół: Podstawy pomocy psychologicznej" }).click();
      await page.getByRole("button", { name: "Sprawdź wpływ zmiany" }).click();
      const okno = page.getByRole("dialog", { name: "Potwierdź zmianę kolejności" });
      await expect(okno).toBeVisible();
      await expect(okno.getByText("Marta Demo")).toBeVisible();
      await sprawdzAxe(page, testInfo, `axe-kursy-okno-${szerokosc}`);
      await zrzut(page, `kursy-${szerokosc}-okno`);
    });

    test(`/admin/kursy @${szerokosc}: stan błędu wczytania listy bez naruszeń axe (z best-practice), nagłówki w kolejności`, async ({ page }) => {
      await page.setViewportSize({ width: szerokosc, height: szerokosc >= 1024 ? 900 : 844 });
      await instalujAtrapyApi(page, { blad: true });
      await page.goto("/admin/kursy");
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.getByText("Nie udało się wczytać listy kursów")).toBeVisible();
      await expect(page.getByRole("button", { name: "Spróbuj ponownie" })).toBeVisible();

      const poziomy = await page.locator("main").locator("h1, h2, h3, h4").evaluateAll((e) => e.map((x) => Number(x.tagName.slice(1))));
      poziomy.forEach((poziom, i) => expect(i === 0 || poziom <= poziomy[i - 1] + 1).toBe(true));
      expect(await naruszeniaZBestPractice(page)).toEqual([]);
    });

    test(`/admin/kursy @${szerokosc}: okno potwierdzenia nie łamie wyrazów w środku i nie przewija się poziomo`, async ({ page }) => {
      await page.setViewportSize({ width: szerokosc, height: szerokosc >= 1024 ? 900 : 844 });
      await instalujAtrapyApi(page);
      await page.goto("/admin/kursy");
      await zabezpieczeniePrzedEkranemDostepu(page);

      await page.getByRole("button", { name: "Zmień kolejność ścieżki" }).click();
      await page.getByRole("button", { name: "Przesuń w dół: Podstawy pomocy psychologicznej" }).click();
      await page.getByRole("button", { name: "Sprawdź wpływ zmiany" }).click();
      const okno = page.getByRole("dialog", { name: "Potwierdź zmianę kolejności" });
      await expect(okno.getByText("Marta Demo")).toBeVisible();
      await expect(okno.getByText("Wywiad psychologiczny")).toBeVisible();

      // Wyrazy liczone WEWNĄTRZ listy podglądu: pusta lista (zero pozycji) nie może przejść jako „nic nie łamie się”.
      const lista = okno.getByRole("list", { name: NAZWA_LISTY_PODGLADU });
      const pozycje = await lista.getByRole("listitem").count();
      expect(pozycje).toBeGreaterThanOrEqual(1);
      const wLiscie = await zmierzOkno(lista);
      expect(wLiscie.wyrazy).toBeGreaterThanOrEqual(pozycje * 8);
      expect(wLiscie.lamane).toEqual([]);

      const pomiar = await zmierzOkno(okno);
      expect(pomiar.wyrazy).toBeGreaterThanOrEqual(wLiscie.wyrazy);
      expect(pomiar.lamane).toEqual([]);
      expect(pomiar.przewiniecie).toBeLessThanOrEqual(0);
    });
  }

  for (const widok of WIDOKI_OKNA) {
    for (const osoby of LICZBY_OSOB) {
      test(`okno potwierdzenia @${widok.szerokosc}x${widok.wysokosc}, ${osoby} os.: mieści się w widoku, przyciski osiągalne, lista przewija się w pionie`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: widok.szerokosc, height: widok.wysokosc });
        await instalujAtrapyApi(page, { osoby });
        await page.goto("/admin/kursy");
        await zabezpieczeniePrzedEkranemDostepu(page);

        await page.getByRole("button", { name: "Zmień kolejność ścieżki" }).click();
        await page.getByRole("button", { name: "Przesuń w dół: Podstawy pomocy psychologicznej" }).click();
        await page.getByRole("button", { name: "Sprawdź wpływ zmiany" }).click();
        const okno = page.getByRole("dialog", { name: "Potwierdź zmianę kolejności" });
        const lista = okno.getByRole("list", { name: NAZWA_LISTY_PODGLADU });
        await expect(lista.getByRole("listitem")).toHaveCount(osoby);
        await expect(okno.getByRole("button", { name: "Anuluj" })).toBeFocused();
        await page.waitForFunction(() =>
          document.getAnimations().every((a) => a.constructor?.name !== "CSSTransition" || a.playState !== "running"),
        );

        const pomiar = await page.evaluate((nazwaListy) => {
          const okienko = document.querySelector('[role="dialog"]') as HTMLElement;
          const wykaz = okienko.querySelector(`ul[aria-label="${nazwaListy}"]`) as HTMLElement;
          const ramka = okienko.getBoundingClientRect();
          const trafienie = (tekst: string) => {
            const przycisk = Array.from(okienko.querySelectorAll("button")).find((b) => b.textContent?.trim() === tekst);
            if (!przycisk) return { znaleziony: false, trafiony: false, w_widoku: false };
            const r = przycisk.getBoundingClientRect();
            const trafiony = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return {
              znaleziony: true,
              trafiony: !!trafiony && przycisk.contains(trafiony),
              w_widoku: r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth,
            };
          };
          return {
            gora: Math.round(ramka.top),
            dol: Math.round(ramka.bottom),
            wysokoscWidoku: window.innerHeight,
            wysokoscListy: Math.round(wykaz.getBoundingClientRect().height),
            przewijalna: wykaz.scrollHeight > wykaz.clientHeight,
            przewinieciePoziomeStrony: document.documentElement.scrollWidth - window.innerWidth,
            anuluj: trafienie("Anuluj"),
            potwierdz: trafienie("Potwierdź zmianę kolejności"),
          };
        }, NAZWA_LISTY_PODGLADU);
        console.log(`POMIAR587 ${JSON.stringify({ osoby, widok: `${widok.szerokosc}x${widok.wysokosc}`, ...pomiar })}`);
        await testInfo.attach(`pomiar-okna-${widok.szerokosc}x${widok.wysokosc}-${osoby}`, {
          body: JSON.stringify(pomiar, null, 2),
          contentType: "application/json",
        });

        expect(pomiar.gora).toBeGreaterThanOrEqual(0);
        expect(pomiar.dol).toBeLessThanOrEqual(pomiar.wysokoscWidoku);
        expect(pomiar.anuluj).toEqual({ znaleziony: true, trafiony: true, w_widoku: true });
        expect(pomiar.potwierdz).toEqual({ znaleziony: true, trafiony: true, w_widoku: true });
        expect(pomiar.przewinieciePoziomeStrony).toBeLessThanOrEqual(0);
        if (osoby === 30) expect(pomiar.przewijalna).toBe(true);

        // Zrzut samego okna przeglądarki (widok, nie cała strona) — tylko trzy kadry z zakresu zlecenia.
        const katalog = katalogZrzutow();
        const nazwaZrzutu = `kursy-${widok.szerokosc}-okno-${osoby}`;
        if (katalog && widok.wysokosc !== 600 && ["kursy-1280-okno-30", "kursy-390-okno-30", "kursy-390-okno-4"].includes(nazwaZrzutu)) {
          await page.screenshot({ path: path.join(katalog, `${nazwaZrzutu}.png`) });
        }

        // Wyrazy w oknie i w liście, bez poziomego przewinięcia okna.
        const wOknie = await zmierzOkno(okno);
        expect(wOknie.lamane).toEqual([]);
        expect(wOknie.przewiniecie).toBeLessThanOrEqual(0);
        const wLiscie = await zmierzOkno(lista);
        expect(wLiscie.wyrazy).toBeGreaterThanOrEqual(osoby * 8);
        expect(wLiscie.lamane).toEqual([]);

        // Klawiatura: lista przewijana ma nazwę i jest osiągalna (Shift+Tab z „Anuluj”), a przyciski nadal działają.
        await okno.getByRole("button", { name: "Anuluj" }).focus();
        await page.keyboard.press("Shift+Tab");
        await expect(lista).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(okno.getByRole("button", { name: "Anuluj" })).toBeFocused();

        // Po przewinięciu listy do końca ostatnia osoba jest widoczna w obrębie listy i widoku.
        await lista.evaluate((e) => {
          e.scrollTop = e.scrollHeight;
        });
        await expect(lista.getByRole("listitem").last()).toContainText(`Nr ${osoby}`);
        const wObrebie = await page.evaluate((nazwaListy) => {
          const wykaz = document.querySelector(`[role="dialog"] ul[aria-label="${nazwaListy}"]`) as HTMLElement;
          const r = wykaz.getBoundingClientRect();
          const o = (wykaz.lastElementChild as HTMLElement).getBoundingClientRect();
          return { wListie: o.bottom <= r.bottom + 1 && o.top >= r.top - 1, wWidoku: o.bottom <= window.innerHeight && o.top >= 0 };
        }, NAZWA_LISTY_PODGLADU);
        expect(wObrebie).toEqual({ wListie: true, wWidoku: true });

        // Axe z best-practice (w tym scrollable-region-focusable) przy 30 osobach, listą w fokusie.
        if (osoby === 30 && widok.wysokosc !== 600) {
          await lista.focus();
          expect(await naruszeniaZBestPractice(page)).toEqual([]);
        }
      });
    }
  }

  test("odmowa 403: ekran „tylko dla administracji”, jeden main, bez przycisków akcji", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await instalujAtrapyApi(page, { odmowa: true });
    await page.goto("/admin/kursy");
    await zabezpieczeniePrzedEkranemDostepu(page);
    await expect(page.getByText(/tylko dla administracji/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Utwórz kurs" })).toHaveCount(0);
    expect(await licznikiTresci(page)).toEqual({ main: 1, cele: 1 });
    await sprawdzAxe(page, testInfo, "axe-kursy-odmowa-1280");
  });

  test("axe z tagiem best-practice: po przełączeniu (/admin/kursy) żadnego naruszenia, którego nie było przed (poligon)", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await instalujAtrapyApi(page);

    await page.goto("/nowy-front/admin/kursy");
    await zabezpieczeniePrzedEkranemDostepu(page);
    await expect(wiersze(page)).toHaveCount(4);
    const przed = await naruszeniaZBestPractice(page);

    await page.goto("/admin/kursy");
    await expect(wiersze(page)).toHaveCount(4);
    const po = await naruszeniaZBestPractice(page);

    await testInfo.attach("axe-best-practice-przed-poligon", { body: JSON.stringify(przed, null, 2), contentType: "application/json" });
    await testInfo.attach("axe-best-practice-po-admin-kursy", { body: JSON.stringify(po, null, 2), contentType: "application/json" });
    testInfo.annotations.push({ type: "axe best-practice przed (poligon)", description: przed.map((n) => `${n.id}×${n.wezly.length}`).join(", ") || "0" });
    testInfo.annotations.push({ type: "axe best-practice po (/admin/kursy)", description: po.map((n) => `${n.id}×${n.wezly.length}`).join(", ") || "0" });

    const znaneId = new Set(przed.map((n) => n.id));
    const nowe = po.filter((n) => !znaneId.has(n.id));
    expect(nowe, `nowe naruszenia: ${JSON.stringify(nowe)}`).toEqual([]);
    expect(po.filter((n) => n.id === "heading-order"), "heading-order po przełączeniu").toEqual([]);
  });

  test("kontrola dodatnia przyrządu: nagłówek h4 wstrzyknięty pod h1 daje naruszenie heading-order z tagiem best-practice", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await instalujAtrapyApi(page);
    await page.goto("/admin/kursy");
    await zabezpieczeniePrzedEkranemDostepu(page);
    await expect(wiersze(page)).toHaveCount(4);
    expect((await naruszeniaZBestPractice(page)).map((n) => n.id)).not.toContain("heading-order");

    await page.evaluate(() => {
      const h4 = document.createElement("h4");
      h4.textContent = "Wstrzyknięty nagłówek";
      document.querySelector("main")?.appendChild(h4);
    });
    expect((await naruszeniaZBestPractice(page)).map((n) => n.id)).toContain("heading-order");
  });

  test("utworzenie kursu: identyfikator z tytułu, POST z ciałem formularza, przejście na ekran kursu", async ({ page }) => {
    const atrapy = await instalujAtrapyApi(page);
    await page.goto("/admin/kursy");
    await zabezpieczeniePrzedEkranemDostepu(page);

    await page.getByRole("button", { name: "Utwórz kurs" }).click();
    await page.getByLabel(/^Tytuł/).fill("Zażółć gęślą");
    await expect(page.getByLabel(/^Identyfikator/)).toHaveValue("zazolc-gesla");
    await page.getByRole("button", { name: "Utwórz kurs" }).click();

    await expect(page).toHaveURL(/\/admin\/kursy\/9$/);
    expect(atrapy.zapytania).toEqual([
      {
        adres: "POST /admin/courses",
        cialo: { title: "Zażółć gęślą", slug: "zazolc-gesla", type: "course", product_group: "psychon", sequence_order: null, description: null },
      },
    ]);
  });

  test("anulowanie formularza oddaje fokus przyciskowi „Utwórz kurs” w nagłówku", async ({ page }) => {
    await instalujAtrapyApi(page);
    await page.goto("/admin/kursy");
    await zabezpieczeniePrzedEkranemDostepu(page);

    await page.getByRole("button", { name: "Utwórz kurs" }).click();
    await page.getByRole("button", { name: "Anuluj" }).click();
    await expect(page.getByRole("heading", { name: "Nowy kurs" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Utwórz kurs" })).toBeFocused();
  });

  test("zmiana kolejności: przesunięcie, podgląd, potwierdzenie — ciała żądań, komunikat, fokus na „Zmień kolejność ścieżki”", async ({ page }) => {
    const atrapy = await instalujAtrapyApi(page);
    await page.goto("/admin/kursy");
    await zabezpieczeniePrzedEkranemDostepu(page);

    await page.getByRole("button", { name: "Zmień kolejność ścieżki" }).click();
    await page.getByRole("button", { name: "Przesuń w dół: Podstawy pomocy psychologicznej" }).click();
    await expect(page.getByRole("button", { name: "Przesuń w dół: Podstawy pomocy psychologicznej" })).toBeFocused();
    await page.getByRole("button", { name: "Sprawdź wpływ zmiany" }).click();

    const okno = page.getByRole("dialog", { name: "Potwierdź zmianę kolejności" });
    await expect(okno.getByText("Marta Demo")).toBeVisible();
    await okno.getByRole("button", { name: "Potwierdź zmianę kolejności" }).click();

    await expect(page.getByText("Zapisano nową kolejność ścieżki.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Zmień kolejność ścieżki" })).toBeFocused();
    expect(atrapy.zapytania).toEqual([
      { adres: "POST /admin/courses/reorder/preview", cialo: { course_ids: [2, 1, 3] } },
      { adres: "PATCH /admin/courses/reorder", cialo: { course_ids: [2, 1, 3] } },
    ]);
  });

  test("szczegół kursu /admin/kursy/5 stoi w tej samej nowej ramce co lista kursów", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await instalujAtrapyApi(page);
    await page.goto("/admin/kursy/5");
    await zabezpieczeniePrzedEkranemDostepu(page);
    await expect(page.getByRole("navigation", { name: "Menu — Administracja" }).first()).toBeVisible();
    await expect(page.locator("[data-powloka-panelu]")).toHaveCount(1);
    expect(await page.locator("main").count()).toBe(1);
  });

  test("trasa poligonu /nowy-front/admin/kursy odpowiada 200", async ({ page }) => {
    await instalujAtrapyApi(page);
    const odpowiedzStrony = await page.goto("/nowy-front/admin/kursy");
    expect(odpowiedzStrony?.status()).toBe(200);
  });
});
