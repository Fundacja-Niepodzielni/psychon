import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";
import { GRUPY } from "../lib/przelaczenie/grupy";

/**
 * Strona kursu uczestnika pod adresem produktu `/panel/kursy/[slug]` (grupa
 * `kursUczestnika`, nowa ramka), na zbudowanej aplikacji, z atrapą API i atrapą
 * sesji. Cztery stany zatwierdzonego szkicu na 1280 i 390 px (stan 4, pas
 * podglądu, pod `/panel/kursy/[slug]?podglad=1` z rolą personelu) oraz stany
 * spoza szkicu, pola odczytu dochodzące w zapleczu i cztery nogi trybu
 * podglądu (parametr i rola). W każdym stanie:
 * jeden `main`, dokładnie jeden widoczny przycisk główny z tekstem i zdaniem
 * obok równymi zapisowi szkicu, brak przewijania poziomego (także z długim
 * tytułem kursu i lekcji), cele dotyku co najmniej 44 px, pasek dolny na
 * telefonie nie zasłania ostatniej karty, kolejność fokusu zgodna z
 * kolejnością na ekranie, axe (WCAG 2.1 AA i `best-practice`) = 0.
 * Zrzuty całej strony powstają tylko przy ustawionej zmiennej `PW_ZRZUTY`.
 */

const API = "http://localhost:8000/api/v1";
const SLUG = "pierwsza-pomoc-psychologiczna";

const ATRAPA_SESJI = {
  accessToken: ["atrapa", "tokenu", "testowego"].join("-"),
  expiresAt: Date.now() + 3_600_000,
};

const META = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

const TYTULY = [
  "Czym jest kryzys psychiczny",
  "Fazy kryzysu",
  "Rozpoznawanie kryzysu psychicznego",
  "Rozmowa, która nie ocenia",
  "Schemat rozmowy w kryzysie",
  "Kiedy i jak wezwać pomoc",
  "Dbanie o siebie po rozmowie",
];
const CZASY = [840, 1080, 1200, 960, 720, null, 600];
const DLUGIE_SLOWO = "Psychologicznodiagnostycznoterapeutycznointerwencyjnokryzysowe";

interface KursAtrapy {
  ukonczone: number;
  zamknieteOd: number | null;
  tytul?: string;
  tytulLekcji?: string;
  /** Pola postępu lekcji i `has_recording` w odczycie (dochodzą w zapleczu). */
  nowePola?: boolean;
  /** Lekcja (1-based) z czasem aktywnym 12 z 16 potrzebnych minut; wymaga `nowePola`. */
  wTrakcieNr?: number;
  testZaliczony?: boolean;
}

function kurs({ ukonczone, zamknieteOd, tytul, tytulLekcji, nowePola, wTrakcieNr, testZaliczony }: KursAtrapy) {
  return {
    id: 2,
    slug: SLUG,
    title: tytul ?? "Pierwsza pomoc psychologiczna",
    sequence_order: 1,
    product_group: "psychon",
    status: "in_progress",
    progress_percent: Math.round((ukonczone / TYTULY.length) * 100),
    instructor: null,
    topics: [
      { id: 7, title: "Kryzys i jego przebieg", position: 1 },
      { id: 8, title: "Rozmowa wspierająca", position: 2 },
    ],
    lessons: TYTULY.map((tytulSzkicu, indeks) => ({
      id: 21 + indeks,
      title: indeks === 3 && tytulLekcji ? tytulLekcji : tytulSzkicu,
      sequence_order: indeks + 1,
      duration_seconds: CZASY[indeks],
      is_completed: indeks < ukonczone,
      topic_id: indeks < 4 ? 7 : 8,
      ...(zamknieteOd !== null ? { locked: indeks + 1 >= zamknieteOd } : {}),
      ...(nowePola
        ? {
            has_recording: CZASY[indeks] !== null,
            required_active_seconds: CZASY[indeks] === null ? 480 : Math.round((CZASY[indeks] as number) * 0.8),
            active_seconds: indeks < ukonczone ? 600 : wTrakcieNr === indeks + 1 ? 720 : 0,
          }
        : {}),
    })),
    ...(testZaliczony !== undefined ? { test_passed: testZaliczony } : {}),
    materials: [],
  };
}

interface Stan {
  n: number;
  nazwa: string;
  dane: KursAtrapy;
  primaryText: string;
  powod: string;
  podglad: boolean;
  /** Etykiety przycisków wierszy lekcji (otwartych) w kolejności ekranu. */
  wiersze: string[];
}

// Teksty przycisku głównego i zdania obok — zapis z pomiaru zatwierdzonego szkicu.
const STANY: Stan[] = [
  {
    n: 1,
    nazwa: "nierozpoczety",
    dane: { ukonczone: 0, zamknieteOd: 2 },
    primaryText: "Rozpocznij lekcję 1",
    powod: "„Czym jest kryzys psychiczny”",
    podglad: false,
    wiersze: ["Rozpocznij lekcję: lekcja 1, Czym jest kryzys psychiczny"],
  },
  {
    n: 2,
    nazwa: "w-toku",
    dane: { ukonczone: 2, zamknieteOd: 4, nowePola: true, wTrakcieNr: 3 },
    primaryText: "Kontynuuj lekcję 3",
    powod: "„Rozpoznawanie kryzysu psychicznego”",
    podglad: false,
    wiersze: [
      "Otwórz ponownie: lekcja 1, Czym jest kryzys psychiczny",
      "Otwórz ponownie: lekcja 2, Fazy kryzysu",
      "Kontynuuj: lekcja 3, Rozpoznawanie kryzysu psychicznego",
    ],
  },
  {
    n: 3,
    nazwa: "zostal-test",
    dane: { ukonczone: 7, zamknieteOd: null },
    primaryText: "Przejdź do testu",
    powod: "Wszystkie lekcje ukończone. Został test.",
    podglad: false,
    wiersze: TYTULY.map((tytul, indeks) => `Otwórz ponownie: lekcja ${indeks + 1}, ${tytul}`),
  },
  {
    n: 4,
    nazwa: "podglad",
    dane: { ukonczone: 2, zamknieteOd: 4, nowePola: true, wTrakcieNr: 3 },
    primaryText: "Kontynuuj lekcję 3",
    powod: "„Rozpoznawanie kryzysu psychicznego”",
    podglad: true,
    wiersze: [
      "Otwórz ponownie: lekcja 1, Czym jest kryzys psychiczny",
      "Otwórz ponownie: lekcja 2, Fazy kryzysu",
      "Kontynuuj: lekcja 3, Rozpoznawanie kryzysu psychicznego",
      ...TYTULY.slice(3).map((tytul, indeks) => `Rozpocznij lekcję: lekcja ${indeks + 4}, ${tytul}`),
    ],
  },
];

function json(dane: unknown, status = 200, meta?: unknown) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }),
  };
}

type OdpowiedzKursu = { status: number; cialo: unknown } | { opoznienie: true };

async function instalujAtrapy(page: Page, odpowiedzKursu: () => OdpowiedzKursu, rola = "volunteer"): Promise<{ odczyty: () => number }> {
  let odczyty = 0;
  await page.route(`${API}/**`, (route) => route.fulfill(json([], 200, META)));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(json({ id: 17, role: rola, first_name: "Anna", last_name: "Kowalczyk", program_completed_at: null })),
  );
  await page.route(`${API}/notifications**`, (route) =>
    route.fulfill(json([], 200, { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { unread: 0 } })),
  );
  await page.route(`${API}/courses`, (route) => route.fulfill(json([])));
  await page.route(`${API}/courses/${SLUG}`, (route) => {
    odczyty += 1;
    const wynik = odpowiedzKursu();
    if ("opoznienie" in wynik) return; // odczyt wisi: ekran ładowania
    return route.fulfill(
      wynik.status === 200
        ? json(wynik.cialo)
        : { status: wynik.status, contentType: "application/json", body: JSON.stringify({ error: wynik.cialo }) },
    );
  });
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json({ url: null })));
  return { odczyty: () => odczyty };
}

async function otworz(page: Page, adres: string): Promise<void> {
  const odpowiedz = await page.goto(adres);
  expect(odpowiedz?.status()).toBe(200);
  await zabezpieczeniePrzedEkranemDostepu(page);
}

async function zrzut(page: Page, nazwa: string): Promise<void> {
  const katalog = process.env.PW_ZRZUTY;
  if (!katalog) return;
  mkdirSync(katalog, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(katalog, `${nazwa}.png`), fullPage: true, animations: "disabled" });
}

async function sprawdzAxe(page: Page, testInfo: TestInfo, nazwa: string): Promise<void> {
  const naruszenia = await uruchomAxe(page);
  await dolaczNaruszeniaDoRaportu(testInfo, nazwa, naruszenia);
  expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);
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

/** Cele dotyku: każdy widoczny element czynny w treści ma co najmniej 44 px wysokości (odnośnik w tekście) albo 44 x 44 px. */
async function celeDotyku(page: Page): Promise<{ zmierzone: number; zaMale: { nazwa: string; wysokosc: number; szerokosc: number }[] }> {
  return page.evaluate(() => {
    const cele = Array.from(
      document.querySelectorAll<HTMLElement>("main a[href], main button, main [role='button']"),
    ).filter((element) => element.getClientRects().length > 0);
    const zaMale = cele
      .map((element) => {
        const ramka = element.getBoundingClientRect();
        return {
          nazwa: (element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 60),
          wysokosc: Math.round(ramka.height * 10) / 10,
          szerokosc: Math.round(ramka.width * 10) / 10,
        };
      })
      .filter((cel) => cel.wysokosc < 44 || cel.szerokosc < 44);
    return { zmierzone: cele.length, zaMale };
  });
}

interface PunktFokusu {
  nazwa: string;
  gora: number;
  lewo: number;
  prawo: number;
  zaPoprzednim: boolean;
}

/** Tab przez całą treść strony: kolejne elementy z fokusem (tylko wewnątrz `main`). */
async function przejdzTabulatorem(page: Page): Promise<PunktFokusu[]> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator("main#tresc").focus();
  const punkty: PunktFokusu[] = [];
  for (let krok = 0; krok < 60; krok += 1) {
    await page.keyboard.press("Tab");
    const punkt = await page.evaluate(() => {
      const okno = window as unknown as { poprzedniFokus?: Element };
      const element = document.activeElement as HTMLElement | null;
      const main = document.querySelector("main");
      if (!element || !main || element === main || !main.contains(element)) return null;
      const ramka = element.getBoundingClientRect();
      const poprzedni = okno.poprzedniFokus;
      const zaPoprzednim = !poprzedni || Boolean(poprzedni.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING);
      okno.poprzedniFokus = element;
      return {
        nazwa: (element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 80),
        gora: Math.round(ramka.top + window.scrollY),
        lewo: Math.round(ramka.left),
        prawo: Math.round(ramka.right),
        zaPoprzednim,
      };
    });
    if (punkt === null) break;
    punkty.push(punkt);
  }
  return punkty;
}

async function przyciskiGlowne(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("[data-przycisk-glowny]"))
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => ({
        tekst: (element.textContent ?? "").trim(),
        powod: (document.getElementById(element.getAttribute("aria-describedby") ?? "")?.textContent ?? "").trim(),
        zielony: getComputedStyle(element).backgroundColor,
      })),
  );
}

const OKNA = [
  { szerokosc: 1280, wysokosc: 800 },
  { szerokosc: 390, wysokosc: 844 },
];

for (const { szerokosc, wysokosc } of OKNA) {
  test.describe(`strona kursu uczestnika — ${szerokosc} px`, () => {
    test.skip(!GRUPY.kursUczestnika.wlaczona, "grupa strony kursu uczestnika jest wyłączona");
    test.use({ viewport: { width: szerokosc, height: wysokosc } });
    const telefon = szerokosc < 640;

    for (const stan of STANY) {
      test(`stan ${stan.n} (${stan.nazwa}): tekst przycisku głównego i zdanie jak w szkicu, jeden przycisk główny, miary i axe`, async ({ page }, testInfo) => {
        await instalujAtrapy(page, () => ({ status: 200, cialo: kurs(stan.dane) }), stan.podglad ? "project_manager" : "volunteer");
        await otworz(page, stan.podglad ? `/panel/kursy/${SLUG}?podglad=1` : `/panel/kursy/${SLUG}`);
        await expect(page.getByRole("heading", { level: 1, name: "Pierwsza pomoc psychologiczna" })).toBeVisible();

        await expect(page.locator("main")).toHaveCount(1);
        await expect(page.locator("main#tresc")).toHaveCount(1);
        await expect(page.locator("h1")).toHaveCount(1);

        // dokładnie jeden przycisk główny, tekst i zdanie obok równe zapisowi szkicu.
        const glowne = await przyciskiGlowne(page);
        expect(glowne.map(({ tekst, powod }) => ({ tekst, powod }))).toEqual([{ tekst: stan.primaryText, powod: stan.powod }]);
        expect(glowne[0].zielony).toBe("rgb(0, 128, 58)");

        // nie ma pytania do prowadzącego ani materiałów kursu.
        await expect(page.getByText(/Zadaj pytanie prowadzącemu/i)).toHaveCount(0);
        await expect(page.getByRole("heading", { name: /materiał/i })).toHaveCount(0);

        // Pas podglądu: tylko w stanie 4.
        const pas = page.getByRole("region", { name: "Tryb podglądu" });
        if (stan.podglad) {
          await expect(pas).toContainText("Tryb podglądu. Widzisz kurs tak, jak uczestnik. Nic się nie zapisuje.");
          await expect(pas.getByRole("link", { name: "Wróć do edycji kursu" })).toHaveAttribute("href", "/admin/kursy/2");
        } else {
          await expect(pas).toHaveCount(0);
        }

        // Pola postępu obecne: linia „W trakcie…” tylko przy lekcji w toku (stany 2 i 4).
        await expect(page.getByText(/W trakcie · obejrzane/)).toHaveCount(stan.dane.nowePola ? 1 : 0);
        if (stan.dane.nowePola) await expect(page.getByText("W trakcie · obejrzane 12 z 16 potrzebnych minut")).toBeVisible();
        if (stan.podglad) {
          // Podgląd: każdy odnośnik do lekcji i do testu niesie parametr podglądu.
          const doLekcji = await page.locator('a[href^="/panel/lekcje/"]').evaluateAll((el) => el.map((a) => a.getAttribute("href")));
          // siedem wierszy lekcji i odnośnik przycisku głównego do następnej lekcji.
          expect(doLekcji).toHaveLength(8);
          for (const href of doLekcji) expect(href).toMatch(/[?&]podglad=1(&|$)/);
        }

        // Opis, tematy, wiersze i karta testu.
        await expect(page.getByText("7 lekcji · około 2 godziny · na końcu test")).toBeVisible();
        await expect(page.getByRole("heading", { level: 2, name: "Kryzys i jego przebieg" })).toBeVisible();
        await expect(page.getByRole("heading", { level: 2, name: "Rozmowa wspierająca" })).toBeVisible();
        await expect(page.getByRole("heading", { level: 2, name: "Test końcowy" })).toBeVisible();
        const wierszeEkranu = await page.locator("[data-lekcja] a[aria-label]").evaluateAll((elementy) => elementy.map((element) => element.getAttribute("aria-label")));
        expect(wierszeEkranu).toEqual(stan.wiersze);
        // W podglądzie pole `locked` z odczytu jest ignorowane: zero kłódek, każdy wiersz z przyciskiem.
        expect(await page.locator("[data-zamknieta]").count()).toBe(stan.podglad || stan.dane.zamknieteOd === null ? 0 : 8 - stan.dane.zamknieteOd);
        await expect(page.locator("[data-zamknieta] a, [data-zamknieta] button")).toHaveCount(0);

        // Karta testu: w stanie 3 czynny odnośnik, w pozostałych nieczynny przycisk (aria-disabled, w kolejności fokusu).
        const karta = page.locator("[data-karta-testu]");
        if (stan.n === 3) {
          await expect(karta.getByRole("link", { name: "Przejdź do testu" })).toHaveAttribute("href", `/panel/kursy/${SLUG}/test`);
        } else {
          const nieczynny = karta.getByRole("button", { name: "Przejdź do testu" });
          await expect(nieczynny).toHaveAttribute("aria-disabled", "true");
          const adresPrzed = page.url();
          await nieczynny.click({ force: true }); // przycisk z aria-disabled nie jest „enabled” dla Playwright; klik wymuszony
          expect(page.url()).toBe(adresPrzed);
        }

        // brak przewijania w poziomie, cele dotyku, pasek dolny nie zasłania ostatniej karty.
        await sprawdzPrzewijanie(page);
        const cele = await celeDotyku(page);
        expect(cele.zmierzone).toBeGreaterThanOrEqual(4);
        expect(cele.zaMale, "cele dotyku poniżej 44 px").toEqual([]);
        if (telefon) {
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          const zaslona = await page.evaluate(() => {
            let dok: HTMLElement | null = document.querySelector<HTMLElement>("[data-przycisk-glowny]");
            while (dok !== null && getComputedStyle(dok).position !== "fixed") dok = dok.parentElement;
            const karty = Array.from(document.querySelectorAll<HTMLElement>("main section"));
            const ostatnia = karty[karty.length - 1];
            const ramkaDoku = dok?.getBoundingClientRect() ?? null;
            const ramkaKarty = ostatnia.getBoundingClientRect();
            return {
              dokJest: dok !== null,
              doku: ramkaDoku === null ? null : { gora: Math.round(ramkaDoku.top), dol: Math.round(ramkaDoku.bottom) },
              kartaDol: Math.round(ramkaKarty.bottom),
              okno: window.innerHeight,
            };
          });
          expect(zaslona.dokJest, "pasek z przyciskiem głównym jest przypięty u dołu").toBe(true);
          if (zaslona.doku !== null) expect(zaslona.kartaDol, "ostatnia karta kończy się nad paskiem dolnym").toBeLessThanOrEqual(zaslona.doku.gora);
          await page.evaluate(() => window.scrollTo(0, 0));
        }

        // kolejność fokusu = kolejność ekranu.
        const fokus = await przejdzTabulatorem(page);
        await testInfo.attach(`fokus-${stan.n}-${szerokosc}`, { body: JSON.stringify(fokus, null, 2), contentType: "application/json" });
        const nazwy = fokus.map((punkt) => punkt.nazwa);
        expect(fokus.filter((punkt) => !punkt.zaPoprzednim).map((punkt) => punkt.nazwa), "fokus cofa się w dokumencie").toEqual([]);
        const poczatek = nazwy.indexOf(stan.primaryText);
        expect(poczatek, `przycisk główny w kolejności fokusu: ${nazwy.join(" | ")}`).toBeGreaterThanOrEqual(0);
        expect(nazwy.slice(poczatek)).toEqual([stan.primaryText, ...stan.wiersze, "Przejdź do testu"]);
        if (stan.podglad) expect(nazwy[0]).toBe("Wróć do edycji kursu");
        const cofniecia = fokus
          .slice(1)
          // Na wąskim ekranie przycisk główny jest paskiem przypiętym u dołu (jak w szkicu: pierwszy w kolejności fokusu, poza przepływem) — skok z niego na pierwszą lekcję nie jest cofnięciem w obrębie treści.
          .filter((punkt, indeks) => !(szerokosc < 640 && fokus[indeks].nazwa === stan.primaryText) && punkt.gora < fokus[indeks].gora - 8 && punkt.lewo < fokus[indeks].prawo - 8)
          .map((punkt) => punkt.nazwa);
        expect(cofniecia, "fokus cofa się na ekranie").toEqual([]);

        await page.evaluate(() => window.scrollTo(0, 0));
        await sprawdzAxe(page, testInfo, `axe-kurs-${stan.n}-${szerokosc}`);
        await zrzut(page, `uczestnik--kurs-szkic--${stan.n}-${stan.nazwa}--${szerokosc}`);
      });
    }

    test("długi tytuł kursu i lekcji bez spacji: bez przewijania w poziomie, cele dotyku, axe", async ({ page }, testInfo) => {
      const dlugiTytul = `Pierwsza pomoc psychologiczna ${DLUGIE_SLOWO} — część druga, rozszerzona`;
      const dlugaLekcja = `Rozmowa, która nie ocenia ${DLUGIE_SLOWO} ${DLUGIE_SLOWO}`;
      await instalujAtrapy(page, () => ({ status: 200, cialo: kurs({ ukonczone: 2, zamknieteOd: 4, tytul: dlugiTytul, tytulLekcji: dlugaLekcja }) }));
      await otworz(page, `/panel/kursy/${SLUG}`);
      await expect(page.getByRole("heading", { level: 1, name: dlugiTytul })).toBeVisible();
      await expect(page.locator("[data-lekcja='24']").getByText(dlugaLekcja)).toBeVisible();
      await sprawdzPrzewijanie(page);
      expect((await celeDotyku(page)).zaMale).toEqual([]);
      await sprawdzAxe(page, testInfo, `axe-kurs-dlugie-${szerokosc}`);
    });

    test("kurs zamknięty kolejnością (403 course_locked): zdanie z serwera i odnośnik do listy kursów", async ({ page }, testInfo) => {
      const zdanie = "Ukończ najpierw etap 2: Wywiad psychologiczny.";
      await instalujAtrapy(page, () => ({ status: 403, cialo: { status: 403, code: "course_locked", message: zdanie } }));
      await otworz(page, `/panel/kursy/${SLUG}`);
      await expect(page.getByRole("heading", { level: 2, name: "Ten kurs jest jeszcze zamknięty" })).toBeVisible();
      await expect(page.getByText(zdanie)).toBeVisible();
      await expect(page.getByRole("link", { name: "Wróć do listy kursów" }).first()).toHaveAttribute("href", "/panel/kursy");
      await expect(page.locator("main")).toHaveCount(1);
      await sprawdzPrzewijanie(page);
      expect((await celeDotyku(page)).zaMale).toEqual([]);
      await sprawdzAxe(page, testInfo, `axe-kurs-zamkniety-${szerokosc}`);
      await zrzut(page, `uczestnik--kurs-szkic--zamkniety-kolejnoscia--${szerokosc}`);
    });

    test("404: „Nie znaleziono kursu” z odnośnikiem do listy kursów", async ({ page }, testInfo) => {
      await instalujAtrapy(page, () => ({ status: 404, cialo: { status: 404, code: "not_found", message: "Nie znaleziono zasobu." } }));
      await otworz(page, `/panel/kursy/${SLUG}`);
      await expect(page.getByRole("heading", { level: 2, name: "Nie znaleziono kursu" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Wróć do listy kursów" }).first()).toHaveAttribute("href", "/panel/kursy");
      await sprawdzPrzewijanie(page);
      await sprawdzAxe(page, testInfo, `axe-kurs-404-${szerokosc}`);
    });

    test("błąd odczytu: komunikat i „Spróbuj ponownie”, które po ponowieniu pokazuje kurs", async ({ page }, testInfo) => {
      let psuj = true;
      const atrapy = await instalujAtrapy(page, () =>
        psuj ? { status: 500, cialo: { status: 500, code: "server_error", message: "Błąd serwera." } } : { status: 200, cialo: kurs({ ukonczone: 2, zamknieteOd: 4 }) },
      );
      await otworz(page, `/panel/kursy/${SLUG}`);
      await expect(page.getByText("Nie udało się wczytać kursu")).toBeVisible();
      await sprawdzAxe(page, testInfo, `axe-kurs-blad-${szerokosc}`);
      psuj = false;
      await page.getByRole("button", { name: "Spróbuj ponownie" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Pierwsza pomoc psychologiczna" })).toBeVisible();
      expect(atrapy.odczyty()).toBe(2);
      expect(await przyciskiGlowne(page)).toHaveLength(1);
    });

    test("ładowanie: nagłówek „Kurs” i komunikat o ładowaniu, dopóki odczyt trwa", async ({ page }) => {
      await instalujAtrapy(page, () => ({ opoznienie: true }));
      await otworz(page, `/panel/kursy/${SLUG}`);
      await expect(page.getByRole("heading", { level: 1, name: "Kurs", exact: true })).toBeVisible();
      await expect(page.getByRole("status").filter({ hasText: "Ładowanie kursu…" })).toBeVisible();
      // Odczyt wisi celowo, więc strona nigdy nie jest sieciowo bezczynna: skan bez czekania na ciszę w sieci.
      const wynik = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "best-practice"]).analyze();
      expect(wynik.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.map(String).join(" ")).join(" | ")}`), `axe: ładowanie ${szerokosc}`).toEqual([]);
    });

    test("kurs bez lekcji: zdanie o braku lekcji, bez przycisku głównego i karty testu", async ({ page }, testInfo) => {
      await instalujAtrapy(page, () => ({ status: 200, cialo: { ...kurs({ ukonczone: 0, zamknieteOd: null }), lessons: [], topics: [] } }));
      await otworz(page, `/panel/kursy/${SLUG}`);
      await expect(page.getByText("Ten kurs nie ma jeszcze opublikowanych lekcji.")).toBeVisible();
      expect(await przyciskiGlowne(page)).toHaveLength(0);
      await expect(page.locator("[data-karta-testu]")).toHaveCount(0);
      await sprawdzPrzewijanie(page);
      await sprawdzAxe(page, testInfo, `axe-kurs-bez-lekcji-${szerokosc}`);
    });

    test("podgląd, cztery nogi: personel i prowadzący z parametrem — pas; personel bez parametru i uczestnik z parametrem — zwykły ekran", async ({ page }) => {
      const sprawdz = async (rola: string, adres: string) => {
        await instalujAtrapy(page, () => ({ status: 200, cialo: kurs({ ukonczone: 2, zamknieteOd: 4 }) }), rola);
        await otworz(page, adres);
        await expect(page.getByRole("heading", { level: 1, name: "Pierwsza pomoc psychologiczna" })).toBeVisible();
        await page.waitForLoadState("networkidle");
      };
      const pas = page.getByRole("region", { name: "Tryb podglądu" });

      await sprawdz("instructor", `/panel/kursy/${SLUG}?podglad=1`);
      await expect(pas).toBeVisible();
      await expect(pas.getByRole("link", { name: "Wróć do edycji kursu" })).toHaveAttribute("href", "/prowadzacy/kursy/2");
      await expect(page.locator("[data-zamknieta]")).toHaveCount(0);
      await page.unrouteAll({ behavior: "ignoreErrors" });

      await sprawdz("super_admin", `/panel/kursy/${SLUG}?podglad=1`);
      await expect(pas.getByRole("link", { name: "Wróć do edycji kursu" })).toHaveAttribute("href", "/admin/kursy/2");
      await page.unrouteAll({ behavior: "ignoreErrors" });

      await sprawdz("project_manager", `/panel/kursy/${SLUG}`);
      await expect(pas).toHaveCount(0);
      await expect(page.locator("[data-zamknieta]")).toHaveCount(4);
      await page.unrouteAll({ behavior: "ignoreErrors" });

      await sprawdz("volunteer", `/panel/kursy/${SLUG}?podglad=1`);
      await expect(pas).toHaveCount(0);
      await expect(page.locator("[data-zamknieta]")).toHaveCount(4);
    });

    test("pól postępu w odczycie brak: ekran bez linii „W trakcie”, „Kontynuuj lekcję 3”, bez błędów w konsoli", async ({ page }) => {
      const bledy: string[] = [];
      page.on("console", (komunikat) => {
        if (komunikat.type() === "error") bledy.push(komunikat.text());
      });
      page.on("pageerror", (blad) => bledy.push(blad.message));
      await instalujAtrapy(page, () => ({ status: 200, cialo: kurs({ ukonczone: 2, zamknieteOd: 4 }) }));
      await otworz(page, `/panel/kursy/${SLUG}`);
      await expect(page.getByRole("heading", { level: 1, name: "Pierwsza pomoc psychologiczna" })).toBeVisible();
      await expect(page.getByText(/W trakcie/)).toHaveCount(0);
      expect((await przyciskiGlowne(page)).map(({ tekst }) => tekst)).toEqual(["Kontynuuj lekcję 3"]);
      expect(bledy).toEqual([]);
    });

    test("czas aktywny przy lekcji 3, wcześniejsza nieukończona bez postępu: „Kontynuuj lekcję 3”; lekcja do czytania bez minut", async ({ page }) => {
      await instalujAtrapy(page, () => ({ status: 200, cialo: kurs({ ukonczone: 0, zamknieteOd: null, nowePola: true, wTrakcieNr: 3 }) }));
      await otworz(page, `/panel/kursy/${SLUG}`);
      await expect(page.getByRole("heading", { level: 1, name: "Pierwsza pomoc psychologiczna" })).toBeVisible();
      expect((await przyciskiGlowne(page)).map(({ tekst, powod }) => ({ tekst, powod }))).toEqual([
        { tekst: "Kontynuuj lekcję 3", powod: "„Rozpoznawanie kryzysu psychicznego”" },
      ]);
      await expect(page.locator('[data-lekcja="26"]')).toContainText("do czytania");
      await expect(page.locator('[data-lekcja="26"]')).not.toContainText("min nagrania");
    });

    test("test_passed: karta testu „Test zaliczony.”, bez przycisku głównego", async ({ page }) => {
      await instalujAtrapy(page, () => ({ status: 200, cialo: kurs({ ukonczone: 7, zamknieteOd: null, nowePola: true, testZaliczony: true }) }));
      await otworz(page, `/panel/kursy/${SLUG}`);
      await expect(page.getByRole("heading", { level: 1, name: "Pierwsza pomoc psychologiczna" })).toBeVisible();
      await expect(page.locator("[data-karta-testu]")).toContainText("Test zaliczony.");
      expect(await przyciskiGlowne(page)).toHaveLength(0);
    });
  });
}
