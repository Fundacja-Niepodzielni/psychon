import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";

/**
 * Ekran kursu administracji `/admin/kursy/{id}` w układzie dwóch kolumn, na
 * zbudowanej aplikacji, z atrapą API przez `page.route` i atrapą sesji.
 * Cztery stany kursu, każdy na 1280 i 390 px:
 * - `kurs` — szkic z brakami (brak opisu, lekcja pusta, nagranie z błędem,
 *   nagranie w przetwarzaniu, długie tytuły bez spacji);
 * - `kurs-gotowy` — szkic bez braków;
 * - `kurs-opublikowany` — kurs opublikowany bez uwag;
 * - `kurs-opublikowany-uwaga` — kurs opublikowany z lekcją wymagającą uwagi.
 * W każdym: 0 naruszeń axe, dokładnie jeden widoczny przycisk główny, brak
 * przewijania w poziomie, cele dotyku zmierzone ramką elementu, kolejność
 * fokusu równa kolejności ekranu.
 * Zrzuty całej strony powstają tylko przy ustawionej zmiennej `PW_ZRZUTY`
 * (katalog poza repozytorium).
 */

const API = "http://localhost:8000/api/v1";
const ADRES = "/admin/kursy/4";
const PROG_DWOCH_KOLUMN = 1100;

const ATRAPA_SESJI = {
  accessToken: ["atrapa", "tokenu", "testowego"].join("-"),
  expiresAt: Date.now() + 3_600_000,
};

const META_PUSTA = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

const KURS = {
  id: 4,
  title: "Wywiad psychologiczny",
  slug: "wywiad-psychologiczny",
  description: "Jak prowadzić pierwszą rozmowę i o co pytać." as string | null,
  type: "course",
  product_group: "psychon",
  sequence_order: 2,
  edition_id: 1,
  is_published: false,
  lessons_count: 4,
  materials_count: 0,
  created_at: "2026-09-01T08:00:00Z",
  updated_at: "2026-09-01T08:00:00Z",
};

function lekcja(id: number, title: string, topicId: number, pozycja: number, reszta: Record<string, unknown> = {}) {
  return {
    id,
    course_id: 4,
    title,
    description: null,
    content: null as string | null,
    sequence_order: id - 20,
    topic_id: topicId,
    topic_position: pozycja,
    video_provider_id: `wideo-${id}` as string | null,
    duration_seconds: 1500,
    materials_count: 0,
    created_at: null,
    updated_at: null,
    ...reszta,
  };
}

function temat(id: number, title: string, position: number, lesson_ids: number[]) {
  return { id, course_id: 4, title, position, lesson_ids, created_at: null, updated_at: null };
}

const DLUGI_TYTUL = `Rozmowa${"wstępnaZosobąWkryzysie".repeat(4)}`;
const DLUGI_TEMAT = `Podstawy${"ProwadzeniaRozmowy".repeat(4)}`;

type StanNagrania = "finished" | "processing" | "error";

interface Stan {
  nazwa: string;
  kurs: typeof KURS;
  lekcje: ReturnType<typeof lekcja>[];
  tematy: ReturnType<typeof temat>[];
  nagrania: Record<number, StanNagrania>;
  /** Nagłówek listy w karcie „Publikacja” albo `null`, gdy listy nie ma. */
  naglowekListy: string | null;
  glowny: { rola: "button" | "link"; nazwa: string };
  /** Zdanie w wąskim pasie obok stanu. */
  pas: string | null;
}

const LEKCJE_GOTOWE = [
  lekcja(21, "Wprowadzenie do wywiadu", 7, 1, { materials_count: 2 }),
  lekcja(22, "Pytania otwarte i zamknięte", 7, 2),
  lekcja(23, "Ćwiczenie w parach", 8, 1),
  lekcja(24, "Podsumowanie rozmowy", 8, 2, { video_provider_id: null, content: "## Podsumowanie" }),
];
const TEMATY = [temat(7, "Podstawy", 1, [21, 22]), temat(8, "Praktyka", 2, [23, 24])];

const STANY: Stan[] = [
  {
    nazwa: "kurs",
    kurs: { ...KURS, description: null, materials_count: 1 },
    lekcje: [
      lekcja(21, "Wprowadzenie do wywiadu", 7, 1, { materials_count: 2 }),
      lekcja(22, DLUGI_TYTUL, 7, 2, { video_provider_id: null }),
      lekcja(23, "Ćwiczenie w parach", 8, 1),
      lekcja(24, "Podsumowanie rozmowy", 8, 2),
    ],
    tematy: [temat(7, DLUGI_TEMAT, 1, [21, 22]), temat(8, "Praktyka", 2, [23, 24])],
    nagrania: { 21: "finished", 23: "processing", 24: "error" },
    naglowekListy: "Do zrobienia (3)",
    glowny: { rola: "button", nazwa: "Opublikuj kurs" },
    pas: "do zrobienia 3 rzeczy",
  },
  {
    nazwa: "kurs-gotowy",
    kurs: KURS,
    lekcje: LEKCJE_GOTOWE,
    tematy: TEMATY,
    nagrania: { 21: "finished", 22: "finished", 23: "finished" },
    naglowekListy: null,
    glowny: { rola: "button", nazwa: "Opublikuj kurs" },
    pas: null,
  },
  {
    nazwa: "kurs-opublikowany",
    kurs: { ...KURS, is_published: true },
    lekcje: LEKCJE_GOTOWE,
    tematy: TEMATY,
    nagrania: { 21: "finished", 22: "finished", 23: "finished" },
    naglowekListy: null,
    glowny: { rola: "link", nazwa: "Podgląd jako uczestnik" },
    pas: null,
  },
  {
    nazwa: "kurs-opublikowany-uwaga",
    kurs: { ...KURS, is_published: true },
    lekcje: LEKCJE_GOTOWE,
    tematy: TEMATY,
    nagrania: { 21: "finished", 22: "error", 23: "finished" },
    naglowekListy: "Wymaga uwagi (1)",
    glowny: { rola: "link", nazwa: "Podgląd jako uczestnik" },
    pas: "wymaga uwagi: 1",
  },
];

function json(dane: unknown, meta?: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }),
  };
}

interface Zapis {
  metoda: string;
  sciezka: string;
  cialo: unknown;
}

/**
 * Atrapy API. Ogólna atrapa (pusta lista) jest rejestrowana PIERWSZA —
 * Playwright wybiera trasę zarejestrowaną PÓŹNIEJ jako pierwszą.
 */
async function instalujAtrapy(page: Page, stan: Stan): Promise<{ zapisy: Zapis[]; sciezki: string[] }> {
  const zapisy: Zapis[] = [];
  const sciezki: string[] = [];
  let kurs = stan.kurs;
  let tematy = stan.tematy;

  page.on("request", (zadanie) => {
    if (zadanie.url().startsWith(API)) sciezki.push(zadanie.url().slice(API.length));
  });

  await page.route(`${API}/**`, (route) => route.fulfill(json([], META_PUSTA)));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(json({ id: 1, role: "project_manager", first_name: "Anna", program_completed_at: null })),
  );
  await page.route(`${API}/notifications**`, (route) =>
    route.fulfill(json([], { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { unread: 0 } })),
  );
  await page.route(
    (adres) => adres.pathname.startsWith("/api/v1/admin/"),
    (route) => {
      const zadanie = route.request();
      const sciezka = new URL(zadanie.url()).pathname.replace("/api/v1", "");
      const metoda = zadanie.method();
      if (sciezka === "/admin/courses/4") {
        if (metoda === "PATCH") {
          const cialo = zadanie.postDataJSON() as Record<string, unknown>;
          zapisy.push({ metoda, sciezka, cialo });
          kurs = { ...kurs, ...cialo };
        }
        return route.fulfill(json(kurs));
      }
      if (sciezka === "/admin/courses/4/lessons") return route.fulfill(json(stan.lekcje));
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
      const nagranie = /^\/admin\/lessons\/(\d+)\/video-status$/.exec(sciezka);
      if (nagranie) {
        const status = stan.nagrania[Number(nagranie[1])] ?? "finished";
        return route.fulfill(json({ status, duration_seconds: 1500, preview_embed_url: null }));
      }
      return route.fallback();
    },
  );

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json({ url: null })));
  return { zapisy, sciezki };
}

async function otworz(page: Page, stan: Stan): Promise<void> {
  const odpowiedz = await page.goto(ADRES);
  expect(odpowiedz?.status()).toBe(200);
  await zabezpieczeniePrzedEkranemDostepu(page);
  await expect(page.getByRole("heading", { level: 1, name: stan.kurs.title })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Tematy i lekcje" })).toBeVisible();
  // Dane dochodzące po pierwszym rysowaniu: test kursu, prowadzący, stany nagrań.
  await expect(page.getByRole("link", { name: "Otwórz pytania" })).toBeVisible();
  await expect(page.locator("#ustawienia-prowadzacy")).toContainText("Joanna Demo");
  const karta = page.getByRole("region", { name: "Publikacja" });
  if (stan.naglowekListy) {
    await expect(karta.getByRole("heading", { level: 3, name: stan.naglowekListy })).toBeVisible();
  } else {
    await expect(page.locator("li[data-lekcja]").filter({ hasText: "Gotowa" })).toHaveCount(stan.lekcje.length);
    await expect(karta.getByRole("heading", { level: 3 })).toHaveCount(0);
  }
}

async function zrzut(page: Page, nazwa: string): Promise<void> {
  const katalog = process.env.PW_ZRZUTY;
  if (!katalog) return;
  mkdirSync(katalog, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  // Kolumna boczna stoi w miejscu i przewija się w sobie; na czas zrzutu okno
  // rośnie tak, żeby zmieściła się cała, potem wraca do swojej wysokości.
  const okno = page.viewportSize()!;
  const potrzebna = await page.evaluate(() => {
    const boczna = document.querySelector<HTMLElement>("[data-obszar='boczna']");
    const dol = boczna ? boczna.getBoundingClientRect().top + boczna.scrollHeight + 48 : 0;
    return Math.ceil(Math.max(dol, window.innerHeight));
  });
  await page.setViewportSize({ width: okno.width, height: potrzebna });
  await page.screenshot({ path: join(katalog, `${nazwa}.png`), fullPage: true, animations: "disabled" });
  await page.setViewportSize(okno);
}

async function bezPrzewijaniaPoziomego(page: Page): Promise<void> {
  const przewijanie = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(przewijanie, "przewijanie poziome").toBeLessThanOrEqual(0);
}

interface Cel {
  indeks: number;
  opis: string;
  obszar: string;
  strzalka: boolean;
  wOkruszkach: boolean;
  tlo: string;
  x: number;
  y: number;
  szerokosc: number;
  wysokosc: number;
}

/**
 * Widoczne elementy fokusowalne w `main`, w kolejności dokumentu. Każdy
 * dostaje `data-kolejnosc`, po którym próba rozpoznaje go po naciśnięciu Tab.
 */
async function celeEkranu(page: Page): Promise<Cel[]> {
  return page.evaluate(() => {
    const selektor = "a[href], button:not([disabled]), input:not([type='hidden']), select, textarea, [tabindex]";
    const wezly = Array.from(document.querySelectorAll<HTMLElement>(`main ${selektor.split(", ").join(", main ")}`));
    const wynik: Cel[] = [];
    for (const wezel of wezly) {
      if (wezel.tabIndex < 0) continue;
      const ramka = wezel.getBoundingClientRect();
      const styl = getComputedStyle(wezel);
      if (ramka.width === 0 || ramka.height === 0 || styl.visibility === "hidden") continue;
      const indeks = wynik.length;
      wezel.dataset.kolejnosc = String(indeks);
      wynik.push({
        indeks,
        opis: (wezel.getAttribute("aria-label") ?? wezel.textContent ?? "").trim().slice(0, 70),
        obszar: wezel.closest<HTMLElement>("[data-obszar]:not([data-obszar='tylko-od-dwoch-kolumn'])")?.dataset.obszar ?? "",
        strzalka: wezel.hasAttribute("data-strzalka"),
        wOkruszkach: wezel.closest("nav") !== null,
        tlo: styl.backgroundColor,
        x: ramka.left + window.scrollX,
        y: ramka.top + window.scrollY,
        szerokosc: ramka.width,
        wysokosc: ramka.height,
      });
    }
    return wynik;
  });
}

const OKNA = [
  { szerokosc: 1280, wysokosc: 800 },
  { szerokosc: 390, wysokosc: 844 },
];

for (const { szerokosc, wysokosc } of OKNA) {
  const dwieKolumny = szerokosc >= PROG_DWOCH_KOLUMN;

  test.describe(`ekran kursu administracji — ${szerokosc} px`, () => {
    test.use({ viewport: { width: szerokosc, height: wysokosc } });

    for (const stan of STANY) {
      test(`${stan.nazwa}: axe, jeden przycisk główny, bez przewijania w poziomie, cele dotyku, kolejność fokusu`, async ({
        page,
      }, testInfo) => {
        const { zapisy, sciezki } = await instalujAtrapy(page, stan);
        await otworz(page, stan);

        expect(await page.locator("main").count()).toBe(1);
        expect(await page.locator("#tresc").count()).toBe(1);
        await expect(page.locator("[data-powloka-panelu]")).toHaveCount(1);

        // Karty w kolejności ekranu.
        const naglowki = await page.locator("main h2").allTextContents();
        expect(naglowki).toEqual([
          "Tematy i lekcje",
          "Publikacja",
          "Ustawienia kursu",
          ...(stan.kurs.materials_count > 0 ? ["Starsze pliki kursu"] : []),
          stan.kurs.is_published ? "Cofnięcie publikacji i usunięcie kursu" : "Usunięcie kursu",
        ]);
        await expect(page.locator("#ustawienia-dane, #ustawienia-prowadzacy, #ustawienia-zaproszenia")).toHaveCount(3);
        for (const id of ["ustawienia-dane", "ustawienia-prowadzacy", "ustawienia-zaproszenia"]) {
          await expect(page.locator(`#${id}`)).toHaveAttribute("aria-expanded", "false");
        }

        // Pas pod nagłówkiem tylko poniżej dwóch kolumn; stan i liczba z tych samych danych co karta.
        const pas = page.locator("[data-obszar='pasek-waski']");
        if (dwieKolumny) {
          await expect(pas).toBeHidden();
        } else {
          await expect(pas).toBeVisible();
          await expect(pas).toContainText(stan.kurs.is_published ? "Opublikowany" : "Szkic");
          if (stan.pas) await expect(pas.getByRole("link", { name: stan.pas })).toHaveAttribute("href", "#publikacja");
        }

        // Dokładnie jeden widoczny przycisk główny: w karcie od dwóch kolumn, w pasie poniżej.
        // W dokumencie stoją oba (karta i pas), arkusz pokazuje zawsze jeden.
        await expect(page.getByRole(stan.glowny.rola, { name: stan.glowny.nazwa })).toHaveCount(1);
        const obaGlowne = await page
          .locator("main")
          .getByText(stan.glowny.nazwa, { exact: true })
          .evaluateAll((wezly) =>
            wezly.map((wezel) => ({
              obszar: wezel.closest<HTMLElement>("[data-obszar]")?.dataset.obszar,
              widoczny: wezel.getBoundingClientRect().width > 0,
            })),
          );
        expect(obaGlowne).toEqual([
          { obszar: "pasek-waski", widoczny: !dwieKolumny },
          { obszar: "tylko-od-dwoch-kolumn", widoczny: dwieKolumny },
        ]);

        const cele = await celeEkranu(page);
        const celGlowny = cele.filter((cel) => cel.opis === stan.glowny.nazwa);
        expect(celGlowny).toHaveLength(1);
        // Żaden inny widoczny element ekranu nie ma tła przycisku głównego.
        expect(
          cele.filter((cel) => cel.tlo === celGlowny[0].tlo).map((cel) => cel.opis),
          "elementy z tłem przycisku głównego",
        ).toEqual([stan.glowny.nazwa]);

        await bezPrzewijaniaPoziomego(page);

        // Cele dotyku: 44 px; strzałki kolejności od dwóch kolumn 28 × 24.
        const zaMale = cele
          .filter((cel) => !cel.wOkruszkach)
          .filter((cel) => {
            const [minSzerokosc, minWysokosc] = cel.strzalka && dwieKolumny ? [28, 24] : [44, 44];
            return cel.szerokosc < minSzerokosc - 0.5 || cel.wysokosc < minWysokosc - 0.5;
          })
          .map((cel) => `${cel.opis}: ${Math.round(cel.szerokosc)}×${Math.round(cel.wysokosc)}`);
        expect(zaMale, "cele dotyku poniżej progu").toEqual([]);
        const strzalki = cele.filter((cel) => cel.strzalka);
        expect(strzalki).toHaveLength(stan.lekcje.length * 2);
        if (dwieKolumny) {
          expect(new Set(strzalki.map((cel) => `${Math.round(cel.szerokosc)}×${Math.round(cel.wysokosc)}`))).toEqual(
            new Set(["28×24"]),
          );
        }

        // Kolejność fokusu = kolejność ekranu: obszary po kolei, w obszarze nigdy wstecz.
        const kolejnoscObszarow = cele.map((cel) => cel.obszar).filter((obszar, i, lista) => obszar !== lista[i - 1]);
        expect(kolejnoscObszarow).toEqual(
          dwieKolumny ? ["naglowek", "glowna", "boczna"] : ["naglowek", "pasek-waski", "glowna", "boczna"],
        );
        const wstecz = cele
          .slice(1)
          .filter((cel, i) => cel.obszar === cele[i].obszar && cel.y + cel.wysokosc <= cele[i].y)
          .map((cel) => cel.opis);
        expect(wstecz, "elementy stojące nad poprzednikiem w kolejności fokusu").toEqual([]);
        if (dwieKolumny) {
          const lewa = cele.filter((cel) => cel.obszar === "glowna");
          const prawa = cele.filter((cel) => cel.obszar === "boczna");
          expect(Math.max(...lewa.map((cel) => cel.x + cel.szerokosc))).toBeLessThanOrEqual(
            Math.min(...prawa.map((cel) => cel.x)),
          );
        }

        const naruszenia = await uruchomAxe(page);
        await dolaczNaruszeniaDoRaportu(testInfo, `axe-${stan.nazwa}-${szerokosc}`, naruszenia);
        expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);

        await zrzut(page, `${stan.nazwa}-${szerokosc}`);

        // Tab przechodzi elementy w tej samej kolejności, w jakiej stoją w dokumencie.
        await page.locator("[data-kolejnosc='0']").focus();
        const przejscie: (string | null)[] = [];
        for (let krok = 0; krok < cele.length; krok += 1) {
          przejscie.push(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.kolejnosc ?? null));
          await page.keyboard.press("Tab");
        }
        expect(przejscie).toEqual(cele.map((cel) => String(cel.indeks)));

        expect(zapisy).toEqual([]);
        expect(sciezki.filter((sciezka) => sciezka.startsWith("/instructor/"))).toEqual([]);
        expect(sciezki).toEqual(
          expect.arrayContaining(["/admin/courses/4", "/admin/courses/4/lessons", "/admin/courses/4/topics"]),
        );
      });
    }

    test("kolejność zapisuje się sama, publikacja jednym żądaniem, rozwinięty wiersz ustawień bez naruszeń", async ({
      page,
    }, testInfo) => {
      const stan = STANY[1];
      const { zapisy } = await instalujAtrapy(page, stan);
      await otworz(page, stan);

      const wDol = page.getByRole("button", { name: "Przenieś „Wprowadzenie do wywiadu” niżej" });
      await wDol.click();
      await expect(page.locator("li[data-lekcja]").first()).toHaveAttribute("data-lekcja", "22");
      await expect(wDol).toBeFocused();
      await expect(page.locator("[data-ogloszenia]")).toHaveText(
        "Przeniesiono „Wprowadzenie do wywiadu” na miejsce 2 z 2.",
      );
      await expect.poll(() => zapisy.length).toBe(1);
      expect(zapisy[0]).toEqual({
        metoda: "PATCH",
        sciezka: "/admin/courses/4/topics/reorder",
        cialo: {
          topics: [
            { id: 7, lesson_ids: [22, 21] },
            { id: 8, lesson_ids: [23, 24] },
          ],
        },
      });
      await expect(page.getByRole("button", { name: /^Zapisz (zmiany|kolejność)$/ })).toHaveCount(0);

      // Wiersz ustawień rozwija się w miejscu; drugi otwarty zamyka pierwszy.
      await page.locator("#ustawienia-dane").click();
      await expect(page.getByRole("button", { name: "Zapisz dane kursu" })).toBeVisible();
      await bezPrzewijaniaPoziomego(page);
      const naruszenia = await uruchomAxe(page);
      await dolaczNaruszeniaDoRaportu(testInfo, `axe-kurs-ustawienia-${szerokosc}`, naruszenia);
      expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);
      await zrzut(page, `kurs-gotowy-ustawienia-${szerokosc}`);
      await page.locator("#ustawienia-zaproszenia").click();
      await expect(page.locator("#ustawienia-dane")).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator("#ustawienia-zaproszenia")).toHaveAttribute("aria-expanded", "true");
      await page.locator("#ustawienia-zaproszenia").click();

      await page.getByRole("button", { name: "Opublikuj kurs" }).locator("visible=true").click();
      await expect(page.getByRole("region", { name: "Publikacja" }).getByText("Kurs jest opublikowany.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Opublikuj kurs" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Podgląd jako uczestnik" }).locator("visible=true")).toHaveAttribute(
        "href",
        "/panel/kursy/wywiad-psychologiczny",
      );
      expect(zapisy[1]).toEqual({ metoda: "PATCH", sciezka: "/admin/courses/4", cialo: { is_published: true } });
      expect(zapisy).toHaveLength(2);
    });
  });
}
