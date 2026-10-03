import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";

/**
 * Strzałki zmiany kolejności po lewej stronie wiersza, na zbudowanej aplikacji,
 * z atrapą API przez `page.route` i atrapą sesji. Dwa ekrany, każdy na 1280 i 390 px:
 * - drzewo kursu administracji (`/admin/kursy/4`) — lekcje w dwóch tematach,
 *   jedna z tytułem bez spacji;
 * - lista kursów w ścieżce (`/admin/kursy`, tryb „Zmień kolejność ścieżki”).
 * Sprawdzane: klik przenosi wiersz, fokus zostaje na tej samej strzałce, obszar
 * `aria-live` niesie zdanie dla czytnika, pole strzałki ma 44 × 44 px poniżej
 * 1100 px i 28 × 24 px od 1100 px, numer wiersza stoi w kolumnie strzałek między
 * nimi (strzałka w górę, numer, strzałka w dół), jest zwykłym tekstem bez fokusu i
 * nie powtarza się w wierszu, każdy przycisk ma co najmniej 24 × 24 px, strzałki
 * stoją przed tekstem wiersza, brak przewijania w poziomie, axe bez naruszeń; zamiana wierszy jest płynna
 * (przekształcenie CSS 200 ms), a przy „ogranicz ruch” natychmiastowa.
 * Zrzuty powstają tylko przy ustawionej zmiennej `PW_ZRZUTY` (katalog poza repozytorium).
 */

const API = "http://localhost:8000/api/v1";
const PROG_DWOCH_KOLUMN = 1100;

const ATRAPA_SESJI = {
  accessToken: ["atrapa", "tokenu", "testowego"].join("-"),
  expiresAt: Date.now() + 3_600_000,
};

const META_PUSTA = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

const DLUGI_TYTUL = `Rozmowa${"wstępnaZosobąWkryzysie".repeat(4)}`;

function json(dane: unknown, meta?: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }),
  };
}

function kurs(id: number, title: string, reszta: Record<string, unknown> = {}) {
  return {
    id,
    title,
    slug: `kurs-${id}`,
    description: "Opis kursu.",
    type: "course",
    product_group: "psychon",
    sequence_order: id,
    edition_id: 1,
    is_published: false,
    lessons_count: 4,
    materials_count: 0,
    created_at: "2026-09-01T08:00:00Z",
    updated_at: "2026-09-01T08:00:00Z",
    ...reszta,
  };
}

function lekcja(id: number, title: string, topicId: number, pozycja: number) {
  return {
    id,
    course_id: 4,
    title,
    description: null,
    content: null,
    sequence_order: id - 20,
    topic_id: topicId,
    topic_position: pozycja,
    video_provider_id: `wideo-${id}`,
    duration_seconds: 1500,
    materials_count: 0,
    created_at: null,
    updated_at: null,
  };
}

function temat(id: number, title: string, position: number, lesson_ids: number[]) {
  return { id, course_id: 4, title, position, lesson_ids, created_at: null, updated_at: null };
}

const LEKCJE = [
  lekcja(21, "Wprowadzenie do wywiadu", 7, 1),
  lekcja(22, DLUGI_TYTUL, 7, 2),
  lekcja(23, "Ćwiczenie w parach", 8, 1),
  lekcja(24, "Podsumowanie rozmowy", 8, 2),
];
const TEMATY = [temat(7, "Podstawy", 1, [21, 22]), temat(8, "Praktyka", 2, [23, 24])];

const KURSY = [
  kurs(1, "Podstawy pomocy psychologicznej", { is_published: true }),
  kurs(2, DLUGI_TYTUL, { is_published: true }),
  kurs(3, "Interwencja kryzysowa", { is_published: true }),
];

interface Zapis {
  metoda: string;
  sciezka: string;
  cialo: unknown;
}

async function instalujAtrapy(page: Page): Promise<{ zapisy: Zapis[] }> {
  const zapisy: Zapis[] = [];
  let tematy = TEMATY;
  await page.route(`${API}/**`, (route) => route.fulfill(json([], META_PUSTA)));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(json({ id: 1, role: "project_manager", first_name: "Anna", program_completed_at: null })),
  );
  await page.route(`${API}/notifications**`, (route) =>
    route.fulfill(json([], { ...META_PUSTA, per_page: 25, extra: { unread: 0 } })),
  );
  await page.route(`${API}/admin/dashboard`, (route) =>
    route.fulfill(json({ counters: { participants: 3, completed: 1, certificates: 1 }, queues: [] })),
  );
  await page.route(`${API}/admin/edition`, (route) =>
    route.fulfill(
      json({
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
      }),
    ),
  );
  await page.route(
    (adres) => adres.pathname.startsWith("/api/v1/admin/"),
    (route) => {
      const zadanie = route.request();
      const sciezka = new URL(zadanie.url()).pathname.replace("/api/v1", "");
      const metoda = zadanie.method();
      if (sciezka === "/admin/courses" && metoda === "GET") return route.fulfill(json(KURSY, META_PUSTA));
      if (sciezka === "/admin/courses/reorder/preview") return route.fulfill(json([]));
      if (sciezka === "/admin/courses/4") return route.fulfill(json(kurs(4, "Wywiad psychologiczny")));
      if (sciezka === "/admin/courses/4/lessons") return route.fulfill(json(LEKCJE));
      if (sciezka === "/admin/courses/4/topics") return route.fulfill(json(tematy));
      if (sciezka === "/admin/courses/4/topics/reorder") {
        const cialo = zadanie.postDataJSON() as { topics: { id: number; lesson_ids: number[] }[] };
        zapisy.push({ metoda, sciezka, cialo });
        tematy = cialo.topics.map((wpis, indeks) => ({
          ...tematy.find((kandydat) => kandydat.id === wpis.id)!,
          position: indeks + 1,
          lesson_ids: wpis.lesson_ids,
        }));
        return route.fulfill(json(tematy));
      }
      if (sciezka === "/admin/courses/4/assignments") {
        return route.fulfill(
          json([{ id: 1, course_id: 4, lesson_id: null, instructor: { id: 5, first_name: "Joanna", last_name: "Demo" } }]),
        );
      }
      if (sciezka === "/admin/courses/4/tests") {
        return route.fulfill(json({ id: 31, course_id: 4, pass_threshold: 80, attempts_limit: 3, question_count: 2 }));
      }
      if (/^\/admin\/lessons\/\d+\/video-status$/.test(sciezka)) {
        return route.fulfill(json({ status: "finished", duration_seconds: 1500, preview_embed_url: null }));
      }
      return route.fallback();
    },
  );
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json({ url: null })));
  return { zapisy };
}

async function zrzut(page: Page, nazwa: string): Promise<void> {
  const katalog = process.env.PW_ZRZUTY;
  if (!katalog) return;
  mkdirSync(katalog, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(katalog, `${nazwa}.png`), fullPage: true, animations: "disabled" });
}

async function bezPrzewijaniaPoziomego(page: Page): Promise<void> {
  const przewijanie = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(przewijanie, "przewijanie poziome").toBeLessThanOrEqual(0);
}

/** Wymiary pól wszystkich strzałek na stronie i położenie względem numeru wiersza. */
async function zmierzStrzalki(page: Page, selektorWiersza: string) {
  return page.evaluate((selektor) => {
    const wynik: { nazwa: string; szerokosc: number; wysokosc: number; poLewejOdTekstu: boolean }[] = [];
    for (const wiersz of Array.from(document.querySelectorAll<HTMLElement>(selektor))) {
      const strzalki = Array.from(wiersz.querySelectorAll<HTMLElement>("[data-strzalka]"));
      const reszta = Array.from(wiersz.children).find((dziecko) => !dziecko.querySelector("[data-strzalka]"));
      const lewa = reszta ? reszta.getBoundingClientRect().left : Number.POSITIVE_INFINITY;
      for (const strzalka of strzalki) {
        const ramka = strzalka.getBoundingClientRect();
        wynik.push({
          nazwa: strzalka.getAttribute("aria-label") ?? "",
          szerokosc: Math.round(ramka.width),
          wysokosc: Math.round(ramka.height),
          poLewejOdTekstu: ramka.right <= lewa + 0.5,
        });
      }
    }
    return wynik;
  }, selektorWiersza);
}

/**
 * Numer wiersza w kolumnie strzałek: strzałka w górę nad numerem, numer nad strzałką w dół,
 * wszystko w jednej pionowej osi; numer nie ma fokusu; w wierszu stoi tylko raz jako samodzielny
 * tekst; oba przyciski mają co najmniej 24 × 24 px. Zwraca listę odstępstw (pusta = zgodne).
 */
async function zmierzNumerMiedzyStrzalkami(page: Page, selektorWiersza: string) {
  return page.evaluate((selektor) => {
    const odstepstwa: string[] = [];
    const wiersze = Array.from(document.querySelectorAll<HTMLElement>(selektor));
    wiersze.forEach((wiersz, indeks) => {
      const opis = `wiersz ${indeks + 1}`;
      const wyzej = wiersz.querySelector<HTMLElement>('[data-strzalka="wyzej"]');
      const nizej = wiersz.querySelector<HTMLElement>('[data-strzalka="nizej"]');
      const numer = wiersz.querySelector<HTMLElement>("[data-numer-kolejnosci]");
      if (!wyzej || !nizej || !numer) {
        odstepstwa.push(`${opis}: brak strzałki albo numeru w kolumnie`);
        return;
      }
      const w = wyzej.getBoundingClientRect();
      const n = numer.getBoundingClientRect();
      const d = nizej.getBoundingClientRect();
      if (w.bottom > n.top + 0.5) odstepstwa.push(`${opis}: numer nie stoi pod strzałką w górę`);
      if (n.bottom > d.top + 0.5) odstepstwa.push(`${opis}: numer nie stoi nad strzałką w dół`);
      const os = (r: DOMRect) => (r.left + r.right) / 2;
      if (Math.abs(os(w) - os(n)) > 1 || Math.abs(os(d) - os(n)) > 1) odstepstwa.push(`${opis}: numer poza osią strzałek`);
      for (const [nazwa, r] of [["w górę", w], ["w dół", d]] as const) {
        if (r.width < 24 || r.height < 24) odstepstwa.push(`${opis}: strzałka ${nazwa} ma ${r.width} × ${r.height} px`);
      }
      if (numer.hasAttribute("tabindex") || numer.closest("button, a, [tabindex]:not([tabindex=\"-1\"])")) odstepstwa.push(`${opis}: numer przyjmuje fokus`);
      if (!numer.parentElement?.contains(wyzej) || numer.parentElement !== nizej.parentElement) odstepstwa.push(`${opis}: numer w innej kolumnie niż strzałki`);
      const tekst = (numer.textContent ?? "").trim();
      if (!/^\d+$/.test(tekst)) odstepstwa.push(`${opis}: numer „${tekst}” nie jest samą liczbą`);
      const samodzielne = Array.from(wiersz.querySelectorAll<HTMLElement>("*")).filter(
        (el) => el.children.length === 0 && (el.textContent ?? "").trim() === tekst,
      );
      if (samodzielne.length !== 1) odstepstwa.push(`${opis}: numer ${tekst} występuje w wierszu ${samodzielne.length} razy`);
    });
    return odstepstwa;
  }, selektorWiersza);
}

/** Zapisuje wartości atrybutu `style` wierszy w trakcie działania — z nich widać, czy leciały z dawnych miejsc. */
async function zacznijObserwacjeStylu(page: Page, selektor: string): Promise<void> {
  await page.evaluate((s) => {
    const zapis: string[] = [];
    (window as unknown as { __style: string[] }).__style = zapis;
    const korzen = document.querySelector(s);
    if (!korzen) throw new Error("brak korzenia obserwacji");
    new MutationObserver((rekordy) => {
      for (const rekord of rekordy) zapis.push(rekord.oldValue ?? "");
    }).observe(korzen, { attributes: true, attributeFilter: ["style"], attributeOldValue: true, subtree: true });
  }, selektor);
}

async function odczytajObserwacjeStylu(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __style: string[] }).__style);
}

const OKNA = [
  { szerokosc: 1280, wysokosc: 900, pole: { szerokosc: 28, wysokosc: 24 } },
  { szerokosc: 390, wysokosc: 844, pole: { szerokosc: 44, wysokosc: 44 } },
];

for (const okno of OKNA) {
  test.describe(`kolejność strzałkami — ${okno.szerokosc} px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: okno.szerokosc, height: okno.wysokosc });
      expect(okno.szerokosc >= PROG_DWOCH_KOLUMN).toBe(okno.pole.szerokosc === 28);
    });

    test("drzewo kursu: klik zamienia wiersze, fokus zostaje na strzałce, czytnik dostaje zdanie, pola, axe", async ({
      page,
    }, testInfo) => {
      const { zapisy } = await instalujAtrapy(page);
      const odpowiedz = await page.goto("/admin/kursy/4");
      expect(odpowiedz?.status()).toBe(200);
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.getByRole("heading", { level: 2, name: "Tematy i lekcje" })).toBeVisible();
      await expect(page.locator("li[data-lekcja]")).toHaveCount(4);

      // Pole strzałki, położenie przed numerem, brak przewijania przy tytule bez spacji.
      const strzalki = await zmierzStrzalki(page, "li[data-lekcja]");
      expect(strzalki).toHaveLength(8);
      expect(
        strzalki.filter((s) => s.szerokosc !== okno.pole.szerokosc || s.wysokosc !== okno.pole.wysokosc).map((s) => s.nazwa),
        "strzałki o innym polu niż oczekiwane",
      ).toEqual([]);
      expect(strzalki.filter((s) => !s.poLewejOdTekstu).map((s) => s.nazwa)).toEqual([]);
      expect(await zmierzNumerMiedzyStrzalkami(page, "li[data-lekcja]"), "numer między strzałkami").toEqual([]);
      const numery = await page.locator("li[data-lekcja] [data-numer-kolejnosci]").allTextContents();
      expect(numery).toEqual(["1", "2", "3", "4"]);
      await bezPrzewijaniaPoziomego(page);
      await expect(page.locator("[draggable]")).toHaveCount(0);

      const naruszenia = await uruchomAxe(page);
      await dolaczNaruszeniaDoRaportu(testInfo, `axe-kolejnosc-drzewo-${okno.szerokosc}`, naruszenia);
      expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);
      await zrzut(page, `po-drzewo-kursu-${okno.szerokosc}`);

      // Ruch: wiersze lecą ze starych miejsc przekształceniem, a po chwili nie noszą śladu.
      await zacznijObserwacjeStylu(page, "main");
      const wDol = page.getByRole("button", { name: "Przenieś „Wprowadzenie do wywiadu” niżej" });
      await wDol.click();
      await expect(page.locator("li[data-lekcja]").first()).toHaveAttribute("data-lekcja", "22");
      await expect(wDol).toBeFocused();
      await expect(page.locator("[data-ogloszenia]")).toHaveText("Przeniesiono „Wprowadzenie do wywiadu” na miejsce 2 z 2.");
      expect((await odczytajObserwacjeStylu(page)).some((wartosc) => wartosc.includes("translate("))).toBe(true);
      await expect.poll(() => zapisy.length).toBe(1);
      await expect(page.locator("li[data-lekcja]").first()).not.toHaveAttribute("style", /transition/, { timeout: 2_000 });

      // Przejście do innego tematu: fokus na tej samej strzałce, zdanie z nazwą tematu.
      const przenies = page.getByRole("button", { name: "Przenieś „Wprowadzenie do wywiadu” niżej" });
      await przenies.click();
      await expect(page.locator("[data-ogloszenia]")).toHaveText(
        "Przeniesiono „Wprowadzenie do wywiadu” do tematu „Praktyka”, miejsce 1 z 3.",
      );
      await expect(page.getByRole("button", { name: "Przenieś „Wprowadzenie do wywiadu” niżej" })).toBeFocused();
      await bezPrzewijaniaPoziomego(page);
    });

    test("drzewo kursu przy „ogranicz ruch”: zamiana natychmiastowa, bez przekształceń", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await instalujAtrapy(page);
      await page.goto("/admin/kursy/4");
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.locator("li[data-lekcja]")).toHaveCount(4);

      await zacznijObserwacjeStylu(page, "main");
      const wDol = page.getByRole("button", { name: "Przenieś „Wprowadzenie do wywiadu” niżej" });
      await wDol.click();
      await expect(page.locator("li[data-lekcja]").first()).toHaveAttribute("data-lekcja", "22");
      await expect(wDol).toBeFocused();
      expect((await odczytajObserwacjeStylu(page)).filter((wartosc) => wartosc.includes("translate("))).toEqual([]);
    });

    test("lista kursów w ścieżce: strzałki przed numerem, klik, fokus, zdanie, pola, axe", async ({ page }, testInfo) => {
      await instalujAtrapy(page);
      const odpowiedz = await page.goto("/admin/kursy");
      expect(odpowiedz?.status()).toBe(200);
      await zabezpieczeniePrzedEkranemDostepu(page);
      await page.getByRole("button", { name: "Zmień kolejność ścieżki" }).click();
      await expect(page.getByRole("button", { name: "Przenieś „Podstawy pomocy psychologicznej” niżej" })).toBeVisible();

      const strzalki = await zmierzStrzalki(page, "li:has([data-strzalka])");
      expect(strzalki).toHaveLength(6);
      expect(
        strzalki.filter((s) => s.szerokosc !== okno.pole.szerokosc || s.wysokosc !== okno.pole.wysokosc).map((s) => s.nazwa),
        "strzałki o innym polu niż oczekiwane",
      ).toEqual([]);
      expect(strzalki.filter((s) => !s.poLewejOdTekstu).map((s) => s.nazwa)).toEqual([]);
      expect(await zmierzNumerMiedzyStrzalkami(page, "li:has([data-strzalka])"), "numer między strzałkami").toEqual([]);
      expect(await page.locator("li:has([data-strzalka]) [data-numer-kolejnosci]").allTextContents()).toEqual(["1", "2", "3"]);
      await bezPrzewijaniaPoziomego(page);
      // Numer („2”) zostaje w jednym wierszu także przy długim tytule bez spacji.
      const liniiNumerow = await page.evaluate(() =>
        Array.from(document.querySelectorAll("li:has([data-strzalka]) [class*='numer']")).map((numer) => {
          const zakres = document.createRange();
          zakres.selectNodeContents(numer.firstChild ?? numer);
          return zakres.getClientRects().length;
        }),
      );
      expect(liniiNumerow).toEqual([1, 1, 1]);

      const naruszenia = await uruchomAxe(page);
      await dolaczNaruszeniaDoRaportu(testInfo, `axe-kolejnosc-kursy-${okno.szerokosc}`, naruszenia);
      expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);
      await zrzut(page, `po-lista-kursow-${okno.szerokosc}`);

      const wDol = page.getByRole("button", { name: "Przenieś „Podstawy pomocy psychologicznej” niżej" });
      await wDol.click();
      await expect(page.locator("li:has([data-strzalka])").first()).toContainText(DLUGI_TYTUL.slice(0, 20));
      await expect(wDol).toBeFocused();
      await expect(page.getByRole("status").filter({ hasText: "Przeniesiono" })).toHaveText(
        "Przeniesiono „Podstawy pomocy psychologicznej” na miejsce 2 z 3.",
      );
      await bezPrzewijaniaPoziomego(page);
    });
  });
}
