import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";

/**
 * Sześć list administracji w kolumnach organizmu listy rekordów — pomiar na
 * zbudowanej aplikacji, API z atrap:
 * - 1280 px: nagłówki kolumn widoczne, lewa krawędź każdej kolumny ta sama w
 *   każdym wierszu (0 px), prawa krawędź liczb ta sama (0 px), plakietki o
 *   różnym tekście mają różne szerokości i wspólną lewą krawędź, akcja ostatnia;
 * - 390 px: nazwa pierwsza, pod nią wartości z widocznym podpisem kolumny,
 *   akcja jako odnośnik ze strzałką, bez przewijania w poziomie;
 * - obie szerokości: każda wartość ma nazwę swojej kolumny w drzewie
 *   dostępności, axe bez naruszeń;
 * - kolejka spraw stoi dokładnie tam, gdzie kolejka dyżurów (1280 i 1440 px);
 * - każda z sześciu list stoi na białej karcie (kontrast tła i obrysu plakietki
 *   do tła pod nią); pięć z nich na karcie z organizmu listy.
 *
 * Zrzuty ekranu powstają tylko przy ustawionej zmiennej `PW_ZRZUTY_LIST`
 * (katalog poza repozytorium).
 */

const ATRAPA_SESJI = { accessToken: "atrapa-tokenu-testowego", expiresAt: Date.now() + 3_600_000 };
const API = "http://localhost:8000/api/v1";
const DOBA_MS = 24 * 60 * 60 * 1000;

function strona(liczba: number, naStrone = 25) {
  return { current_page: 1, per_page: naStrone, total: liczba, last_page: 1 };
}

function dniTemu(dni: number): string {
  return new Date(Date.now() - dni * DOBA_MS).toISOString();
}

const OSOBY = [
  { id: 7, first_name: "Marta", last_name: "Osobowska", email: "osobowska@demo.pl", role: "volunteer", status: "active", product_group: "psychon", access_expires_at: "2027-02-01T00:00:00Z", program_completed_at: null, created_at: "2026-09-20T10:00:00Z" },
  { id: 8, first_name: "Jan", last_name: "Zablokowany", email: "zablokowany@demo.pl", role: "student", status: "blocked", product_group: "psychon", access_expires_at: "2027-02-01T00:00:00Z", program_completed_at: null, created_at: "2026-09-21T10:00:00Z" },
  { id: 9, first_name: "Joanna", last_name: "Prowadzaca", email: "prowadzaca@demo.pl", role: "instructor", status: "active", product_group: "psychon", access_expires_at: null, program_completed_at: null, created_at: "2026-09-22T10:00:00Z" },
];

function kurs(id: number, tytul: string, nadpisz: Record<string, unknown> = {}) {
  return { id, title: tytul, slug: `kurs-${id}`, description: null, type: "course", product_group: "psychon", sequence_order: id, edition_id: 1, is_published: true, lessons_count: 3, materials_count: 0, created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-01T10:00:00Z", ...nadpisz };
}

const KURSY = [
  kurs(1, "Podstawy pomocy psychologicznej", { lessons_count: 1 }),
  kurs(2, "Wywiad psychologiczny", { is_published: false }),
  kurs(3, "Interwencja kryzysowa", { lessons_count: 12 }),
  kurs(4, "Webinar otwarty", { type: "webinar", sequence_order: null, product_group: "both", lessons_count: 0 }),
];

function wpis(id: number, imie: string, nadpisz: Record<string, unknown> = {}) {
  return { id, date: "2026-08-27", hours: "3.5", form: "phone_duty", consultations_count: 4, description: "Dyżur telefoniczny — bez danych osób.", status: "submitted", review_comment: null, decided_at: null, created_at: dniTemu(35), updated_at: dniTemu(35), user: { id: 10 + id, first_name: imie, last_name: "Demo" }, ...nadpisz };
}

const WPISY = [
  wpis(91, "Marta"),
  wpis(92, "Filip", { form: "chat_duty", hours: "12", consultations_count: 0, description: null, created_at: dniTemu(2) }),
  wpis(93, "Ola", { form: "other", hours: "1.5", created_at: dniTemu(0) }),
];

const FORMY = [
  { id: 7, name: "Dyżur telefoniczny", description: "Rozmowa z osobą w kryzysie.", is_active: true, sort_order: 1, created_at: null, updated_at: null },
  { id: 8, name: "Dyżur na czacie", description: null, is_active: false, sort_order: 2, created_at: null, updated_at: null },
  { id: 9, name: "Inna forma", description: "Forma uzgodniona z opiekunem.", is_active: true, sort_order: 10, created_at: null, updated_at: null },
];

const PULPIT = {
  counters: { participants: 5, completed: 7, certificates: 9 },
  queues: [
    { key: "applications", count: 5, link: "/admin/uczestniczki" },
    { key: "internship_entries", count: 12, link: "/admin/staz" },
    { key: "profiles", count: 0, link: "/admin/profile" },
    { key: "questions", count: 1, link: "/prowadzacy/pytania" },
  ],
};

const EDYCJA = { id: 1, name: "Edycja 2026", starts_at: "2026-10-01", ends_at: "2027-03-31", seats_limit: 40, test_pass_threshold: 80, test_attempts_limit: 3, internship_hours_required: 72, supervision_required_count: 6, reliability_threshold: 60, lesson_completion_percent: 60 };

async function odpowiedz(page: Page, wzorzec: string | ((adres: URL) => boolean), cialo: unknown): Promise<void> {
  await page.route(wzorzec, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cialo) }),
  );
}

/** Atrapa ogólna pierwsza — później zarejestrowana trasa wygrywa. */
async function atrapy(page: Page, opcje: { kursyPuste?: boolean } = {}): Promise<void> {
  const kursy = opcje.kursyPuste ? [] : KURSY;
  await odpowiedz(page, `${API}/**`, { data: [], meta: strona(0) });
  await odpowiedz(page, `${API}/me`, { data: { id: 1, role: "project_manager", first_name: "Opiekun", last_name: "Demo", program_completed_at: null } });
  await odpowiedz(page, `${API}/notifications**`, { data: [], meta: { ...strona(0), extra: { unread: 0 } } });
  await odpowiedz(page, `${API}/admin/dashboard`, { data: PULPIT });
  await odpowiedz(page, `${API}/admin/edition`, { data: EDYCJA });
  await odpowiedz(page, (adres) => adres.origin === "http://localhost:8000" && adres.pathname === "/api/v1/admin/users", { data: OSOBY, meta: strona(OSOBY.length) });
  await odpowiedz(page, `${API}/admin/applications**`, { data: [{ id: 3, first_name: "Marta", last_name: "Demo", created_at: dniTemu(11) }], meta: strona(1, 100) });
  await odpowiedz(page, `${API}/admin/internship/pending**`, { data: WPISY, meta: strona(WPISY.length) });
  await odpowiedz(page, `${API}/admin/internship/forms`, { data: FORMY });
  await odpowiedz(page, `${API}/admin/profiles**`, { data: [], meta: strona(0, 100) });
  await odpowiedz(page, `${API}/admin/supervision/cases`, { data: [] });
  await odpowiedz(page, (adres) => adres.pathname.startsWith("/api/v1/admin/courses"), { data: kursy, meta: strona(kursy.length, 100) });
  await odpowiedz(page, "**/api/auth/session", ATRAPA_SESJI);
  await odpowiedz(page, "**/api/auth/end-session-url", { data: { url: null } });
}

interface OpisListy {
  nazwa: string;
  adres: string;
  /** Nazwa listy: nazwa dostępna tabeli i regionu. */
  lista: string;
  kolumny: string[];
  /** Indeksy kolumn z liczbami (prawa krawędź wartości wspólna). */
  liczbowe: number[];
  /** Widoczny napis akcji wiersza. */
  akcja: string;
  wierszy: number;
  /** Prawda, gdy lista ma stopkę z sumą w kolumnie liczb. */
  suma?: boolean;
}

const LISTY: OpisListy[] = [
  { nazwa: "kursy", adres: "/admin/kursy", lista: "Lista kursów", kolumny: ["Kurs", "Stan", "Miejsce w ścieżce", "Lekcje", "Akcja"], liczbowe: [2, 3], akcja: "Otwórz", wierszy: 4 },
  { nazwa: "sprawy", adres: "/admin/sprawy", lista: "Sprawy", kolumny: ["Sprawa", "Stan", "Akcja"], liczbowe: [], akcja: "Otwórz", wierszy: 4 },
  { nazwa: "dyżury", adres: "/admin/staz", lista: "Dyżury do decyzji", kolumny: ["Dyżur", "Stan", "Godziny", "Akcja"], liczbowe: [2], akcja: "Otwórz", wierszy: 3 },
  { nazwa: "pulpit administracji", adres: "/admin", lista: "Co czeka na decyzję", kolumny: ["Kolejka", "Stan", "Liczba", "Akcja"], liczbowe: [2], akcja: "Otwórz", wierszy: 4, suma: true },
  { nazwa: "uczestnicy", adres: "/admin/uczestniczki", lista: "Lista osób", kolumny: ["Osoba", "Rola", "Stan", "Akcja"], liczbowe: [], akcja: "Otwórz", wierszy: 3 },
  { nazwa: "formy stażu", adres: "/admin/formy-stazu", lista: "Formy stażu", kolumny: ["Forma", "Stan", "Miejsce na liście", "Akcja"], liczbowe: [2], akcja: "Edytuj", wierszy: 3 },
];

interface PomiarKomorki {
  rodzaj: string | null;
  lewa: number;
  prawa: number;
  gora: number;
  dol: number;
  pusta: boolean;
  /** Prawa krawędź samej wartości (ostatni element komórki). */
  prawaWartosci: number | null;
  /** Podpis kolumny przy wartości: napis i to, czy jest widoczny. */
  podpis: { tekst: string; widoczny: boolean } | null;
}

interface PomiarAkcji {
  znacznik: string;
  tekst: string;
  ramka: string;
  odstepDzieci: string;
  strzalkaWidoczna: boolean;
  nazwaDostepna: string | null;
}

interface PomiarListy {
  /** Wiersz nagłówków kolumn: rozmiar pola, w którym nagłówki są widoczne. */
  wierszNaglowkow: { szerokosc: number; wysokosc: number };
  naglowki: { tekst: string; szerokosc: number; wysokosc: number; lewa: number }[];
  wiersze: { komorki: PomiarKomorki[]; akcja: PomiarAkcji | null }[];
  plakietki: { tekst: string; szerokosc: number; lewa: number; minSzerokosc: string }[];
  suma: { prawaWartosci: number | null; indeksKomorki: number } | null;
  przewijaniePoziome: number;
}

async function otworz(page: Page, okno: { width: number; height: number }, lista: OpisListy): Promise<void> {
  await page.setViewportSize(okno);
  await atrapy(page);
  await page.goto(lista.adres);
  await zabezpieczeniePrzedEkranemDostepu(page);
  await expect(page.locator(`main [role="table"][aria-label="${lista.lista}"] [role="row"][data-wiersz]`)).toHaveCount(lista.wierszy);
}

async function zmierz(page: Page, lista: OpisListy): Promise<PomiarListy> {
  return page.locator(`main [role="table"][aria-label="${lista.lista}"]`).evaluate((tabela) => {
    const widoczny = (el: Element) => {
      const r = el.getBoundingClientRect();
      const styl = getComputedStyle(el);
      return r.width > 1 && r.height > 1 && styl.display !== "none" && styl.visibility !== "hidden";
    };
    const naglowki = Array.from(tabela.querySelectorAll('[role="columnheader"]')).map((naglowek) => {
      const r = naglowek.getBoundingClientRect();
      return { tekst: (naglowek.textContent ?? "").trim(), szerokosc: r.width, wysokosc: r.height, lewa: r.left };
    });
    const pomiarKomorki = (komorka: Element) => {
      const r = komorka.getBoundingClientRect();
      const podpis = komorka.querySelector(':scope > [aria-hidden="true"]');
      const wartosc = komorka.lastElementChild;
      return {
        rodzaj: komorka.getAttribute("data-rodzaj"),
        lewa: r.left,
        prawa: r.right,
        gora: r.top,
        dol: r.bottom,
        pusta: komorka.childElementCount === 0 && (komorka.textContent ?? "") === "",
        prawaWartosci: wartosc ? wartosc.getBoundingClientRect().right : null,
        podpis: podpis ? { tekst: (podpis.textContent ?? "").trim(), widoczny: widoczny(podpis) } : null,
      };
    };
    const wiersze = Array.from(tabela.querySelectorAll(':scope > [role="row"][data-wiersz]')).map((wiersz) => {
      const komorki = Array.from(wiersz.querySelectorAll(':scope > [role="cell"]'));
      const element = komorki.at(-1)?.querySelector("a, button") ?? null;
      const strzalka = element?.querySelector('[aria-hidden="true"]') ?? null;
      return {
        komorki: komorki.map(pomiarKomorki),
        akcja: element
          ? {
              znacznik: element.tagName,
              tekst: (element.textContent ?? "").trim(),
              ramka: getComputedStyle(element).borderTopWidth,
              odstepDzieci: getComputedStyle(element).columnGap,
              strzalkaWidoczna: strzalka !== null && widoczny(strzalka),
              nazwaDostepna: element.getAttribute("aria-label"),
            }
          : null,
      };
    });
    // Plakietka stanu: element atomu wewnątrz komórki kolumny stanu.
    const plakietki = Array.from(tabela.querySelectorAll(':scope > [role="row"][data-wiersz] > [role="cell"][data-rodzaj="stan"]'))
      .map((komorka) => komorka.lastElementChild?.firstElementChild ?? null)
      .filter((el): el is Element => el !== null)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { tekst: (el.textContent ?? "").trim(), szerokosc: r.width, lewa: r.left, minSzerokosc: getComputedStyle(el).minWidth };
      });
    const wierszSumy = Array.from(tabela.querySelectorAll(':scope > [role="row"]:not([data-wiersz])')).find((wiersz) =>
      (wiersz.textContent ?? "").startsWith("Razem"),
    );
    const komorkiSumy = wierszSumy ? Array.from(wierszSumy.querySelectorAll(':scope > [role="cell"]')) : [];
    const indeksSumy = komorkiSumy.findIndex((komorka, indeks) => indeks > 0 && komorka.childElementCount > 0);
    const poleNaglowkow = tabela.querySelector(':scope > [role="row"]')!.getBoundingClientRect();
    return {
      wierszNaglowkow: { szerokosc: poleNaglowkow.width, wysokosc: poleNaglowkow.height },
      naglowki,
      wiersze,
      plakietki,
      suma: wierszSumy
        ? { prawaWartosci: komorkiSumy[indeksSumy]?.lastElementChild?.getBoundingClientRect().right ?? null, indeksKomorki: indeksSumy }
        : null,
      przewijaniePoziome: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

/** Zrzut całej strony do katalogu ze zmiennej środowiska; bez zmiennej nic nie robi. */
async function zrzut(page: Page, lista: OpisListy, szerokosc: number): Promise<void> {
  const katalog = process.env.PW_ZRZUTY_LIST;
  if (!katalog) return;
  mkdirSync(katalog, { recursive: true });
  const nazwa = lista.adres.replace(/^\//, "").replace(/\//g, "-");
  await page.screenshot({ path: join(katalog, `${nazwa}-${szerokosc}.png`), fullPage: true, animations: "disabled" });
}

function rozrzut(wartosci: number[]): number {
  return Math.max(...wartosci) - Math.min(...wartosci);
}

for (const lista of LISTY) {
  test(`${lista.nazwa} @1280: nagłówki kolumn, wspólne krawędzie kolumn, plakietka o szerokości treści, akcja ostatnia, axe`, async ({ page }, testInfo) => {
    await otworz(page, { width: 1280, height: 800 }, lista);
    const m = await zmierz(page, lista);
    console.log(`POMIAR-KOLUMN ${lista.nazwa} @1280 ${JSON.stringify(m)}`);
    await zrzut(page, lista, 1280);

    // Nagłówki: skład i kolejność; kolumny treści widoczne, kolumna akcji ma nazwę tylko dla czytnika.
    expect(m.naglowki.map((naglowek) => naglowek.tekst)).toEqual(lista.kolumny);
    await expect(page.getByRole("table", { name: lista.lista }).getByRole("columnheader")).toHaveCount(lista.kolumny.length);
    expect(m.wierszNaglowkow.wysokosc, "wiersz nagłówków widoczny").toBeGreaterThan(16);
    for (const naglowek of m.naglowki.slice(0, -1)) {
      expect(naglowek.szerokosc, `nagłówek „${naglowek.tekst}” widoczny`).toBeGreaterThan(1);
      expect(naglowek.wysokosc, `nagłówek „${naglowek.tekst}” widoczny`).toBeGreaterThan(1);
    }

    // Każdy wiersz ma tyle komórek, ile jest kolumn — wartość stoi pod nazwą swojej kolumny.
    for (const wiersz of m.wiersze) expect(wiersz.komorki).toHaveLength(lista.kolumny.length);

    // Lewa krawędź każdej kolumny jest ta sama w każdym wierszu (0 px); nazwa stoi pierwsza z lewej.
    for (let kolumna = 0; kolumna < lista.kolumny.length; kolumna++) {
      // Kolumny liczb są dosunięte do prawej — ich wspólną krawędź mierzy pętla niżej.
      if (lista.liczbowe.includes(kolumna)) continue;
      const lewe = m.wiersze.map((wiersz) => wiersz.komorki[kolumna]).filter((komorka) => !komorka.pusta).map((komorka) => komorka.lewa);
      expect(lewe.length).toBeGreaterThanOrEqual(lista.wierszy - 1);
      expect(rozrzut(lewe), `lewa krawędź kolumny „${lista.kolumny[kolumna]}” ${JSON.stringify(lewe)}`).toBe(0);
    }
    for (const wiersz of m.wiersze) {
      for (let kolumna = 1; kolumna < lista.kolumny.length; kolumna++) {
        if (wiersz.komorki[kolumna].pusta) continue;
        expect(wiersz.komorki[kolumna].lewa, `kolumna „${lista.kolumny[kolumna]}” na prawo od nazwy`).toBeGreaterThanOrEqual(wiersz.komorki[0].prawa);
      }
    }

    // Prawa krawędź liczb jest ta sama w każdym wierszu (0 px), także w stopce z sumą.
    for (const kolumna of lista.liczbowe) {
      const prawe = m.wiersze.map((wiersz) => wiersz.komorki[kolumna].prawaWartosci).filter((prawa): prawa is number => prawa !== null);
      expect(prawe).toHaveLength(lista.wierszy);
      if (lista.suma) {
        expect(m.suma?.indeksKomorki).toBe(kolumna);
        expect(m.suma?.prawaWartosci).not.toBeNull();
        prawe.push(m.suma!.prawaWartosci!);
      }
      expect(rozrzut(prawe), `prawa krawędź liczb w kolumnie „${lista.kolumny[kolumna]}” ${JSON.stringify(prawe)}`).toBe(0);
    }

    // Plakietki: wspólna lewa krawędź, szerokość z treści — różne napisy, różne szerokości.
    expect(m.plakietki.length).toBeGreaterThanOrEqual(2);
    expect(rozrzut(m.plakietki.map((plakietka) => plakietka.lewa)), `lewa krawędź plakietek ${JSON.stringify(m.plakietki)}`).toBe(0);
    const szerokosci = new Map(m.plakietki.map((plakietka) => [plakietka.tekst, plakietka.szerokosc]));
    expect(szerokosci.size, "co najmniej dwa różne napisy plakietek w atrapie").toBeGreaterThanOrEqual(2);
    const napisy = Array.from(szerokosci.keys());
    for (const pierwszy of napisy) {
      for (const drugi of napisy) {
        if (pierwszy.length === drugi.length) continue;
        expect(szerokosci.get(pierwszy), `szerokość plakietki „${pierwszy}” wobec „${drugi}”`).not.toBe(szerokosci.get(drugi));
      }
    }

    // Akcja stoi w ostatniej kolumnie, od 640 px z obrysem przycisku drugorzędnego.
    const akcje = m.wiersze.filter((wiersz) => wiersz.akcja !== null);
    expect(akcje.length).toBeGreaterThanOrEqual(lista.wierszy - 1);
    for (const wiersz of akcje) {
      expect(wiersz.komorki.at(-1)?.rodzaj).toBe("akcja");
      expect(wiersz.akcja!.tekst.replace(/\s*›$/, "")).toBe(lista.akcja);
      expect(wiersz.akcja!.ramka).toBe("1px");
      expect(wiersz.akcja!.strzalkaWidoczna).toBe(false);
    }
    expect(m.przewijaniePoziome).toBe(0);

    const naruszenia = await uruchomAxe(page);
    await dolaczNaruszeniaDoRaportu(testInfo, `axe ${lista.nazwa}`, naruszenia);
    expect(naruszenia, JSON.stringify(naruszenia)).toEqual([]);
  });

  test(`${lista.nazwa} @390: nazwa pierwsza, wartości z podpisem kolumny, akcja jako odnośnik ze strzałką, bez przewijania w poziomie, axe`, async ({ page }, testInfo) => {
    await otworz(page, { width: 390, height: 844 }, lista);
    const m = await zmierz(page, lista);
    console.log(`POMIAR-KOLUMN ${lista.nazwa} @390 ${JSON.stringify(m)}`);
    await zrzut(page, lista, 390);

    // Nagłówki kolumn zostają w drzewie dostępności (wzrokowo zastępuje je podpis przy wartości).
    expect(m.naglowki.map((naglowek) => naglowek.tekst)).toEqual(lista.kolumny);
    await expect(page.getByRole("table", { name: lista.lista }).getByRole("columnheader")).toHaveCount(lista.kolumny.length);
    expect(m.wierszNaglowkow.szerokosc, "wiersz nagłówków ukryty wzrokowo").toBeLessThanOrEqual(1);
    expect(m.wierszNaglowkow.wysokosc, "wiersz nagłówków ukryty wzrokowo").toBeLessThanOrEqual(1);

    for (const wiersz of m.wiersze) {
      expect(wiersz.komorki).toHaveLength(lista.kolumny.length);
      const nazwa = wiersz.komorki[0];
      for (let kolumna = 1; kolumna < lista.kolumny.length - 1; kolumna++) {
        const komorka = wiersz.komorki[kolumna];
        if (komorka.pusta) continue;
        // Wartość stoi pod nazwą, od tej samej lewej krawędzi, z widocznym podpisem swojej kolumny.
        expect(komorka.gora, `„${lista.kolumny[kolumna]}” pod nazwą`).toBeGreaterThanOrEqual(nazwa.dol);
        expect(komorka.lewa, `„${lista.kolumny[kolumna]}” od lewej krawędzi nazwy`).toBe(nazwa.lewa);
        expect(komorka.podpis).toEqual({ tekst: lista.kolumny[kolumna], widoczny: true });
      }
      if (wiersz.akcja) {
        expect(wiersz.akcja.tekst).toMatch(new RegExp(`^${lista.akcja}\\s*›$`));
        expect(wiersz.akcja.strzalkaWidoczna).toBe(true);
        expect(wiersz.akcja.ramka).toBe("0px");
        // Odnośnik i przycisk wyglądają jednakowo: napis od strzałki dzieli tylko margines strzałki.
        expect(wiersz.akcja.odstepDzieci, "odstęp między napisem a strzałką poza marginesem strzałki").toBe("0px");
        expect(wiersz.komorki.at(-1)!.lewa, "akcja z prawej strony treści").toBeGreaterThanOrEqual(nazwa.prawa);
      }
    }
    expect(m.wiersze.filter((wiersz) => wiersz.akcja !== null).length).toBeGreaterThanOrEqual(lista.wierszy - 1);
    expect(m.przewijaniePoziome).toBe(0);

    const naruszenia = await uruchomAxe(page);
    await dolaczNaruszeniaDoRaportu(testInfo, `axe ${lista.nazwa}`, naruszenia);
    expect(naruszenia, JSON.stringify(naruszenia)).toEqual([]);
  });
}

/**
 * Kolumny miejsca: w komórce stoi sama liczba — znaczenie niesie nagłówek
 * kolumny (od 640 px) albo podpis kolumny przy wartości (poniżej). Kurs spoza
 * ścieżki zostaje opisany słownie.
 */
const KOLUMNY_MIEJSCA = [
  { lista: LISTY[0], kolumna: "Miejsce w ścieżce", wartosci: ["1", "2", "3", "poza ścieżką"], poLiczbie: /\d\s*w ścieżce/ },
  { lista: LISTY[5], kolumna: "Miejsce na liście", wartosci: ["1", "2", "10"], poLiczbie: /\d\s*na liście/ },
];

for (const { lista, kolumna, wartosci, poLiczbie } of KOLUMNY_MIEJSCA) {
  for (const okno of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    test(`${lista.nazwa} @${okno.width}: w kolumnie „${kolumna}” stoi sama liczba, bez dopisku po liczbie`, async ({ page }) => {
      await otworz(page, okno, lista);
      const tabela = page.locator(`main [role="table"][aria-label="${lista.lista}"]`);
      const indeks = lista.kolumny.indexOf(kolumna);
      const teksty = await tabela.locator('[role="row"][data-wiersz]').evaluateAll((wiersze, indeksKolumny) => {
        const zwin = (napis: string) => napis.replace(/\s+/g, " ").trim();
        return wiersze.map((wiersz) => {
          const komorka = wiersz.querySelectorAll(':scope > [role="cell"]')[indeksKolumny] as HTMLElement;
          return { rodzaj: komorka.getAttribute("data-rodzaj"), komorka: zwin(komorka.innerText), wiersz: zwin((wiersz as HTMLElement).innerText) };
        });
      }, indeks);
      console.log(`POMIAR-MIEJSCA ${lista.nazwa} @${okno.width} ${JSON.stringify(teksty)}`);

      expect(teksty.map((tekst) => tekst.rodzaj)).toEqual(wartosci.map(() => "liczba"));
      if (okno.width >= 640) {
        // Komórka to sama wartość; nazwę kolumny niesie widoczny nagłówek.
        expect(teksty.map((tekst) => tekst.komorka)).toEqual(wartosci);
        await expect(tabela.getByRole("columnheader", { name: kolumna })).toBeVisible();
      } else {
        // Wiersz zawiera podpis kolumny i zaraz po nim wartość.
        expect(teksty.map((tekst) => tekst.komorka)).toEqual(wartosci.map((wartosc) => `${kolumna} ${wartosc}`));
        for (const [numer, tekst] of teksty.entries()) expect(tekst.wiersz).toContain(`${kolumna} ${wartosci[numer]}`);
      }
      for (const tekst of teksty) expect(tekst.wiersz, "dopisek po liczbie").not.toMatch(poLiczbie);
    });
  }
}

/** Krawędzie kontenera ekranu i listy oraz tło kontenera. */
async function krawedzie(page: Page, kontener: string, lista: string) {
  return page.evaluate(
    ({ kontener, lista }) => {
      const k = document.querySelector(kontener);
      const l = document.querySelector(`main section[aria-label="${lista}"]`);
      const h1 = document.querySelector("main h1");
      if (!k || !l || !h1) return null;
      const rk = k.getBoundingClientRect();
      const rl = l.getBoundingClientRect();
      return {
        kontenerLewa: rk.left,
        kontenerPrawa: rk.right,
        listaLewa: rl.left,
        listaPrawa: rl.right,
        naglowekLewa: h1.getBoundingClientRect().left,
        tlo: getComputedStyle(k).backgroundColor,
        maksymalnaSzerokosc: getComputedStyle(k).maxWidth,
        przewijaniePoziome: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    },
    { kontener, lista },
  );
}

for (const okno of [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
]) {
  test(`kolejka spraw @${okno.width}: krawędzie ekranu i listy równe krawędziom kolejki dyżurów (0 px), tło ekranu przezroczyste`, async ({ page }) => {
    await otworz(page, okno, LISTY[2]);
    const dyzury = await krawedzie(page, 'main [class*="uklad"]', "Dyżury do decyzji");
    await page.goto("/admin/sprawy");
    await expect(page.locator('main [role="table"][aria-label="Sprawy"] [role="row"][data-wiersz]')).toHaveCount(4);
    const sprawy = await krawedzie(page, 'main [class*="strona"]', "Sprawy");
    const uklad = await krawedzie(page, 'main [class*="uklad"]', "Sprawy");
    console.log(`POMIAR-KRAWEDZI @${okno.width} ${JSON.stringify({ dyzury, sprawy, uklad })}`);
    expect(dyzury).not.toBeNull();
    expect(sprawy).not.toBeNull();
    expect(uklad).not.toBeNull();

    expect(sprawy!.kontenerLewa - dyzury!.kontenerLewa, "lewa krawędź kontenera").toBe(0);
    expect(sprawy!.kontenerPrawa - dyzury!.kontenerPrawa, "prawa krawędź kontenera").toBe(0);
    expect(uklad!.kontenerLewa - dyzury!.kontenerLewa, "lewa krawędź układu").toBe(0);
    expect(uklad!.kontenerPrawa - dyzury!.kontenerPrawa, "prawa krawędź układu").toBe(0);
    expect(sprawy!.listaLewa - dyzury!.listaLewa, "lewa krawędź listy").toBe(0);
    expect(sprawy!.listaPrawa - dyzury!.listaPrawa, "prawa krawędź listy").toBe(0);
    expect(sprawy!.naglowekLewa - dyzury!.naglowekLewa, "lewa krawędź nagłówka").toBe(0);
    expect(sprawy!.tlo).toBe("rgba(0, 0, 0, 0)");
    expect(sprawy!.maksymalnaSzerokosc).toBe("none");
  });
}

test("kolejka spraw @390: bez przewijania w poziomie", async ({ page }) => {
  await otworz(page, { width: 390, height: 844 }, LISTY[1]);
  const sprawy = await krawedzie(page, 'main [class*="strona"]', "Sprawy");
  expect(sprawy).not.toBeNull();
  expect(sprawy!.przewijaniePoziome).toBe(0);
  expect(sprawy!.tlo).toBe("rgba(0, 0, 0, 0)");
});

/**
 * Plakietki listy wobec pierwszego nieprzezroczystego tła pod nimi: kontrast
 * tła plakietki i kontrast jej obrysu (dwa miejsca po przecinku), wariant
 * plakietki oraz to, czy tym tłem jest karta samej listy.
 */
async function kontrastPlakietek(page: Page, lista: string) {
  return page.locator(`main [role="table"][aria-label="${lista}"]`).evaluate((tabela) => {
    const skladowe = (zapis: string) => {
      const plotno = document.createElement("canvas");
      plotno.width = plotno.height = 1;
      const kontekst = plotno.getContext("2d")!;
      kontekst.clearRect(0, 0, 1, 1);
      kontekst.fillStyle = zapis;
      kontekst.fillRect(0, 0, 1, 1);
      const d = kontekst.getImageData(0, 0, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    };
    const jasnosc = (kolor: { r: number; g: number; b: number }) => {
      const kanal = (v: number) => {
        const u = v / 255;
        return u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * kanal(kolor.r) + 0.7152 * kanal(kolor.g) + 0.0722 * kanal(kolor.b);
    };
    const kontrast = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) => {
      const [jasna, ciemna] = [jasnosc(a), jasnosc(b)].sort((x, y) => y - x);
      return Math.round(((jasna + 0.05) / (ciemna + 0.05)) * 100) / 100;
    };
    const sekcja = tabela.closest("section");
    return Array.from(tabela.querySelectorAll('[role="cell"][data-rodzaj="stan"]'))
      .map((komorka) => komorka.lastElementChild?.firstElementChild ?? null)
      .filter((el): el is Element => el !== null)
      .map((plakietka) => {
        const styl = getComputedStyle(plakietka);
        let przodek = plakietka.parentElement;
        let pod = { r: 255, g: 255, b: 255, a: 1 };
        let opisPrzodka = "";
        let podToKartaListy = false;
        while (przodek) {
          const kolor = skladowe(getComputedStyle(przodek).backgroundColor);
          if (kolor.a >= 1) {
            pod = kolor;
            opisPrzodka = `${przodek.tagName.toLowerCase()} ${getComputedStyle(przodek).backgroundColor}`;
            podToKartaListy = przodek === sekcja;
            break;
          }
          przodek = przodek.parentElement;
        }
        return {
          tekst: (plakietka.textContent ?? "").trim(),
          neutralna: /neutral|pending/.test(plakietka.className),
          kontrast: kontrast(skladowe(styl.backgroundColor), pod),
          obrys: kontrast(skladowe(styl.borderTopColor), pod),
          gruboscObrysu: styl.borderTopWidth,
          pod: opisPrzodka,
          podToKartaListy,
        };
      });
  });
}

/**
 * Jedna reguła tła: każda z sześciu list stoi na białej karcie. Pięć list
 * dostaje kartę z organizmu listy (tłem pod plakietką jest sekcja samej
 * listy); lista pulpitu stoi na karcie szablonu pulpitu.
 */
const NA_KARCIE: { lista: OpisListy; plakietek: number; kartaOrganizmu: boolean }[] = [
  { lista: LISTY[0], plakietek: 4, kartaOrganizmu: true },
  { lista: LISTY[1], plakietek: 4, kartaOrganizmu: true },
  { lista: LISTY[2], plakietek: 3, kartaOrganizmu: true },
  { lista: LISTY[3], plakietek: 4, kartaOrganizmu: false },
  { lista: LISTY[4], plakietek: 3, kartaOrganizmu: true },
  { lista: LISTY[5], plakietek: 3, kartaOrganizmu: true },
];

for (const okno of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  for (const { lista, plakietek, kartaOrganizmu } of NA_KARCIE) {
    test(`${lista.nazwa} @${okno.width}: lista na białej karcie — tło plakietki neutralnej 1,14, obrys plakietki neutralnej 3,58, każdy obrys co najmniej 3,0`, async ({ page }) => {
      await otworz(page, okno, lista);
      // Plakietka wieku pojawia się po odczytaniu bieżącej chwili — pomiar czeka na komplet.
      await expect(
        page.locator(`main [role="table"][aria-label="${lista.lista}"] [role="cell"][data-rodzaj="stan"] > span:not([aria-hidden])`),
      ).toHaveCount(plakietek);
      const plakietki = await kontrastPlakietek(page, lista.lista);
      console.log(`POMIAR-KONTRASTU ${lista.nazwa} @${okno.width} ${JSON.stringify(plakietki)}`);
      expect(plakietki).toHaveLength(plakietek);
      expect(plakietki.filter((plakietka) => plakietka.neutralna).length, "co najmniej jedna plakietka neutralna w atrapie").toBeGreaterThanOrEqual(1);
      for (const plakietka of plakietki) {
        const opis = `plakietka „${plakietka.tekst}” na ${plakietka.pod}`;
        // Pod plakietką jest biała karta, nie tło strony.
        expect(plakietka.pod, opis).toMatch(/rgb\(255, 255, 255\)$/);
        if (kartaOrganizmu) expect(plakietka.podToKartaListy, `${opis}: kartą jest sekcja samej listy`).toBe(true);
        expect(plakietka.gruboscObrysu, opis).toBe("1px");
        expect(plakietka.obrys, `obrys: ${opis}`).toBeGreaterThanOrEqual(3);
        if (plakietka.neutralna) {
          expect(plakietka.kontrast, `tło: ${opis}`).toBe(1.14);
          expect(plakietka.obrys, `obrys: ${opis}`).toBe(3.58);
        }
      }
      if (lista.nazwa === "dyżury") {
        // Otwarty wiersz dyżuru stoi na ciepłym tle — obrys plakietki neutralnej także wobec niego co najmniej 3,0.
        await page.getByRole("button", { name: /^Otwórz dyżur: Filip Demo/ }).click();
        const otwarta = async () => (await kontrastPlakietek(page, lista.lista)).find((plakietka) => plakietka.tekst === "czeka 2 dni");
        await expect.poll(async () => (await otwarta())?.pod, { timeout: 5000 }).toBe("div rgb(245, 244, 239)");
        const plakietka = (await otwarta())!;
        console.log(`POMIAR-KONTRASTU-OTWARTY ${lista.nazwa} @${okno.width} ${JSON.stringify(plakietka)}`);
        expect(plakietka.neutralna, "plakietka otwartego wiersza jest neutralna").toBe(true);
        expect(plakietka.obrys, `obrys plakietki „${plakietka.tekst}” na ciepłym tle otwartego wiersza (${plakietka.pod})`).toBeGreaterThanOrEqual(3);
      }
    });
  }
}

test("lista kursów @1280: stan pusty stoi na co najwyżej jednej karcie", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await atrapy(page, { kursyPuste: true });
  await page.goto("/admin/kursy");
  await zabezpieczeniePrzedEkranemDostepu(page);
  await expect(page.locator("main h1")).toBeVisible();
  await expect(page.locator('main [role="table"]')).toHaveCount(0);
  const karty = await page.locator("main").evaluate((main) => {
    // Karta: element z ramką i nieprzezroczystym tłem; liczone są karty zagnieżdżone jedna w drugiej.
    const jestKarta = (el: Element) => {
      const styl = getComputedStyle(el);
      return styl.borderTopWidth !== "0px" && styl.borderTopStyle !== "none" && styl.backgroundColor !== "rgba(0, 0, 0, 0)";
    };
    const karty = Array.from(main.querySelectorAll("section, div")).filter(jestKarta);
    return karty.filter((karta) => karty.some((inna) => inna !== karta && inna.contains(karta))).length;
  });
  expect(karty, "karty zagnieżdżone w karcie").toBe(0);
});
