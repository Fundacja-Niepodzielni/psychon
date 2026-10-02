import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";
import { MB, instalujDostawce } from "./_dostawca-nagran";
import { GRUPY } from "../lib/przelaczenie/grupy";

/**
 * Strona lekcji administracji czyta stan nagrania z serwera — na zbudowanej
 * aplikacji, z atrapą API, atrapą sesji i atrapą dostawcy nagrań (żadne
 * żądanie nie wychodzi poza przeglądarkę). Stany na 1280 i 390 px:
 *  - brak nagrania;
 *  - wysyłanie stąd obok grającego nagrania (wymiana) — tu także pomiar trzech
 *    miejsc szkicu: barwa paska postępu, szerokość „Zapisz lekcję”, miejsce
 *    zdania „Zapisuje się samo”;
 *  - plik wysyłany z innej karty przeglądarki;
 *  - przetwarzanie, a po 30 s gotowe (czas trwania i podgląd z odpowiedzi);
 *  - gotowe: poza pierwszym odczytem zero pytań o stan;
 *  - błąd;
 *  - przerwane wysyłanie nowego nagrania;
 *  - wymiana: nowe się przetwarza, potem kończy się błędem — dotychczasowe zostaje;
 *  - ukryta karta przeglądarki: zero pytań, po powrocie jedno.
 * W każdym: jeden `main`, jeden widoczny zielony przycisk, brak przewijania
 * poziomego, cele dotyku co najmniej 44 px, kolejność fokusu zgodna z
 * kolejnością na ekranie, axe (WCAG 2.1 AA i `best-practice`) = 0. Zrzuty
 * całej strony powstają tylko przy ustawionej zmiennej `PW_ZRZUTY`.
 */

const API = "http://localhost:8000/api/v1";
const DOSTAWCA = "https://nagrania.atrapa.test";
const PODGLAD = "https://nagrania.atrapa.test/podglad/wideo-22";
const PROG_DWOCH_KOLUMN = 1100;
const ZDANIE_ODSWIEZANIA = "Stan nagrania odświeża się tutaj sam, dopóki ta karta przeglądarki jest otwarta.";

const ATRAPA_SESJI = {
  accessToken: ["atrapa", "tokenu", "testowego"].join("-"),
  expiresAt: Date.now() + 3_600_000,
};

const META = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

const DLUGIE_SLOWO = "Psychologicznodiagnostycznoterapeutycznointerwencyjnokryzysowe";
const DLUGI_TYTUL = `Pytania otwarte i zamknięte w rozmowie ${DLUGIE_SLOWO} — część druga, rozszerzona`;
const DLUGA_NAZWA_NAGRANIA = `nagranie_z_warsztatu_wywiad_psychologiczny_${"czesc_pierwsza_".repeat(4)}ostateczna.mp4`;
const TYTUL = "Pytania otwarte i zamknięte";

type Kod = "none" | "uploading" | "processing" | "ready" | "error" | null;

interface PolaStanu {
  video_status: Kod;
  video_status_at: string | null;
  video_ready: boolean;
  video_pending: boolean;
}

/** Odpowiedź trasy stanu nagrania z polami serwera. */
function stan(kod: Kod, grajace: boolean, wDrodze: boolean, czasSekundy = 1500) {
  const pola: PolaStanu = {
    video_status: kod,
    video_status_at: kod === "none" ? null : "2026-10-01T12:00:00Z",
    video_ready: grajace,
    video_pending: wDrodze,
  };
  if (kod === "none") return { status: "no_video", ...pola };
  return {
    status: kod === "ready" ? "finished" : kod === "error" ? "error" : "processing",
    duration_seconds: czasSekundy,
    preview_embed_url: grajace ? PODGLAD : null,
    ...pola,
  };
}

const BRAK = stan("none", false, false);
const WYSYLANE = stan("uploading", false, true, 0);
const PRZETWARZANE = stan("processing", false, true, 0);
const GOTOWE = stan("ready", true, false);
const BLAD = stan("error", false, false, 0);
const WYMIANA = stan("processing", true, true);
const WYMIANA_Z_BLEDEM = stan("error", true, true);

type OdpowiedzStanu = ReturnType<typeof stan>;

interface Opcje {
  /** Kolejne odpowiedzi trasy stanu lekcji 22; ostatnia powtarza się. */
  stany: OdpowiedzStanu[];
  tytul?: string;
  /** Ile kawałków pliku dostawca przyjmuje, zanim kolejny zawiśnie bez odpowiedzi. */
  przyjeteKawalki?: number;
}

interface Atrapa {
  zapisy: string[];
  /** Ile razy strona zapytała o stan nagrania lekcji 22. */
  pytaniaOStan: () => number;
}

function json(dane: unknown, status = 200, meta?: unknown) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }),
  };
}

function lekcja(id: number, title: string, reszta: Record<string, unknown> = {}) {
  return {
    id,
    course_id: 4,
    title,
    description: null,
    content: null,
    sequence_order: id - 20,
    topic_id: 7,
    topic_position: id - 20,
    video_provider_id: null,
    duration_seconds: 1500,
    materials_count: 0,
    created_at: null,
    updated_at: null,
    video_status: "none",
    video_status_at: null,
    video_ready: false,
    video_pending: false,
    ...reszta,
  };
}

async function instalujAtrapy(page: Page, opcje: Opcje): Promise<Atrapa> {
  const zapisy: string[] = [];
  const kolejka = [...opcje.stany];
  let pytania = 0;
  const pierwszy = opcje.stany[0];
  let lekcje = [
    lekcja(21, "Wprowadzenie do wywiadu"),
    lekcja(22, opcje.tytul ?? TYTUL, {
      description: "Kiedy pytać otwarcie, a kiedy zamknąć pytanie.",
      content: "## Cel lekcji\n\nPo tej lekcji rozróżniasz pytania otwarte i zamknięte.",
      video_provider_id: pierwszy.video_ready ? "wideo-22" : null,
      video_status: pierwszy.video_status,
      video_status_at: pierwszy.video_status_at,
      video_ready: pierwszy.video_ready,
      video_pending: pierwszy.video_pending,
    }),
    lekcja(23, "Ćwiczenie w parach"),
  ];

  await page.route(`${API}/**`, (route) => route.fulfill(json([], 200, META)));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(json({ id: 1, role: "super_admin", first_name: "Anna", program_completed_at: null })),
  );
  await page.route(`${API}/notifications**`, (route) =>
    route.fulfill(json([], 200, { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { unread: 0 } })),
  );
  await page.route(
    (adres) => adres.pathname.startsWith("/api/v1/admin/"),
    async (route) => {
      const zadanie = route.request();
      const sciezka = new URL(zadanie.url()).pathname.replace("/api/v1", "");
      const metoda = zadanie.method();
      if (metoda !== "GET") zapisy.push(`${metoda} ${sciezka}`);

      if (sciezka === "/admin/courses/4") return route.fulfill(json({ id: 4, title: "Wywiad psychologiczny" }));
      if (sciezka === "/admin/courses/4/lessons") return route.fulfill(json(lekcje));
      if (sciezka === "/admin/lessons/22/video-status") {
        pytania += 1;
        return route.fulfill(json(kolejka.length > 1 ? kolejka.shift() : kolejka[0]));
      }
      if (/^\/admin\/lessons\/\d+\/video-status$/.test(sciezka)) return route.fulfill(json(BRAK));
      if (sciezka === "/admin/lessons/22/video-uploads" && metoda === "POST") {
        return route.fulfill(
          json(
            {
              video_id: "wideo-nowe",
              upload_url: `${DOSTAWCA}/tusupload`,
              library_id: "1",
              expiration_time: 1790000000,
              signature: ["atrapa", "podpisu"].join("-"),
              resumed: false,
            },
            201,
          ),
        );
      }
      const jedna = /^\/admin\/lessons\/(\d+)$/.exec(sciezka);
      if (jedna && metoda === "PATCH") {
        const id = Number(jedna[1]);
        const cialo = zadanie.postDataJSON() as Record<string, unknown>;
        lekcje = lekcje.map((wpis) => (wpis.id === id ? { ...wpis, ...cialo } : wpis));
        return route.fulfill(json(lekcje.find((wpis) => wpis.id === id)));
      }
      return route.fallback();
    },
  );

  await instalujDostawce(page, { przyjeteKawalki: opcje.przyjeteKawalki, potem: "wisi" });

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json({ url: null })));
  return { zapisy, pytaniaOStan: () => pytania };
}

async function otworzLekcje(page: Page, tytul = TYTUL): Promise<void> {
  const odpowiedz = await page.goto("/admin/kursy/4/lekcje/22");
  expect(odpowiedz?.status()).toBe(200);
  await zabezpieczeniePrzedEkranemDostepu(page);
  await expect(page.getByRole("heading", { level: 1, name: tytul })).toBeVisible();
}

/** Zrzut całej strony, od góry. */
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

interface PunktFokusu {
  nazwa: string;
  obszar: string;
  gora: number;
  lewo: number;
  prawo: number;
  zaPoprzednim: boolean;
}

/** Przechodzi klawiszem Tab przez całą treść strony i zwraca kolejne elementy z fokusem. */
async function przejdzTabulatorem(page: Page): Promise<PunktFokusu[]> {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    // Drugi pomiar na tej samej stronie zaczyna od zera.
    delete (window as unknown as { poprzedniFokus?: Element }).poprzedniFokus;
  });
  await page.locator("main#tresc").focus();
  const punkty: PunktFokusu[] = [];
  for (let krok = 0; krok < 80; krok += 1) {
    await page.keyboard.press("Tab");
    const punkt = await page.evaluate(() => {
      const okno = window as unknown as { poprzedniFokus?: Element };
      const element = document.activeElement as HTMLElement | null;
      const main = document.querySelector("main");
      if (!element || !main || element === main || !main.contains(element)) return null;
      const ramka = element.getBoundingClientRect();
      const poprzedni = okno.poprzedniFokus;
      const zaPoprzednim =
        !poprzedni || Boolean(poprzedni.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING);
      okno.poprzedniFokus = element;
      return {
        nazwa: (element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 70),
        obszar: element.closest("[data-obszar]")?.getAttribute("data-obszar") ?? "",
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

/**
 * Wspólne pomiary stanu strony: jeden `main`, jeden widoczny zielony przycisk,
 * brak przewijania poziomego, cele dotyku, kolejność fokusu, axe, zrzut.
 */
async function zmierzStan(page: Page, testInfo: TestInfo, szerokosc: number, nazwa: string): Promise<void> {
  const dwieKolumny = szerokosc >= PROG_DWOCH_KOLUMN;
  await expect(page.locator("main")).toHaveCount(1);

  const zielone = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("main button"))
      .filter((przycisk) => /primary/.test(przycisk.className) && przycisk.getClientRects().length > 0)
      .map((przycisk) => ({
        tekst: (przycisk.textContent ?? "").trim(),
        obszar: przycisk.closest("[data-obszar]")?.getAttribute("data-obszar") ?? "",
      })),
  );
  expect(zielone).toEqual([{ tekst: "Zapisz lekcję", obszar: dwieKolumny ? "tylko-od-dwoch-kolumn" : "pasek-waski" }]);

  const przewijanie = await page.evaluate(() => {
    const szerokoscOkna = document.documentElement.clientWidth;
    const wystajace = Array.from(document.querySelectorAll<HTMLElement>("main *"))
      .filter((element) => element.getBoundingClientRect().right > szerokoscOkna + 1)
      .slice(0, 8)
      .map((element) => `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 40)}`);
    return { nadmiar: document.documentElement.scrollWidth - szerokoscOkna, wystajace };
  });
  expect(przewijanie.nadmiar, `przewijanie poziome: ${przewijanie.wystajace.join(", ")}`).toBeLessThanOrEqual(0);

  const zaMale = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        "main a[href], main button, main [role='button'], main textarea, main input:not([type='file']):not([type='hidden'])",
      ),
    )
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const ramka = element.getBoundingClientRect();
        return {
          nazwa: (element.getAttribute("aria-label") ?? element.textContent ?? element.id).trim().slice(0, 50),
          wysokosc: Math.round(ramka.height * 10) / 10,
          szerokosc: Math.round(ramka.width * 10) / 10,
          odnosnik: element.tagName === "A",
        };
      })
      // Odnośnik w tekście ma szerokość swojej treści; mierzona jest jego wysokość.
      .filter((cel) => cel.wysokosc < 44 || (!cel.odnosnik && cel.szerokosc < 44)),
  );
  expect(zaMale, "cele dotyku poniżej 44 px").toEqual([]);

  const fokus = await przejdzTabulatorem(page);
  await testInfo.attach(`fokus-${nazwa}`, { body: JSON.stringify(fokus, null, 2), contentType: "application/json" });
  expect(fokus.length, "liczba elementów z fokusem").toBeGreaterThan(5);
  expect(fokus.filter((punkt) => !punkt.zaPoprzednim).map((punkt) => punkt.nazwa)).toEqual([]);
  const obszary = fokus.map((punkt) => punkt.obszar).filter((obszar, indeks, lista) => obszar !== lista[indeks - 1]);
  const odnosnikWPasku = (await page.locator("[data-pasek-wysylania] a").count()) > 0;
  expect(obszary).toEqual([
    ...(odnosnikWPasku ? ["pasek-wysylania"] : []),
    ...(dwieKolumny ? ["naglowek", "glowna", "tylko-od-dwoch-kolumn", "boczna"] : ["naglowek", "pasek-waski", "glowna", "boczna"]),
  ]);
  const cofniecia = fokus
    .slice(1)
    .filter((punkt, indeks) => punkt.gora < fokus[indeks].gora - 8 && punkt.lewo < fokus[indeks].prawo - 8)
    .map((punkt) => punkt.nazwa);
  expect(cofniecia, "fokus cofa się na ekranie").toEqual([]);

  await page.evaluate(() => window.scrollTo(0, 0));
  await sprawdzAxe(page, testInfo, `axe-${nazwa}`);
  await zrzut(page, nazwa);
}

function poleNagrania(page: Page) {
  return page.locator("input[type='file'][id$='-nagranie-plik']");
}

function kartaNagrania(page: Page) {
  return page.locator("section", { has: page.getByRole("heading", { level: 2, name: "Nagranie", exact: true }) });
}

function kartaStanu(page: Page) {
  return page.locator("section", { has: page.getByRole("heading", { level: 2, name: "Stan lekcji", exact: true }) });
}

/** Zmienia widoczność karty przeglądarki tak, jak widzi ją strona. */
async function ukryjKarte(page: Page, ukryta: boolean): Promise<void> {
  await page.evaluate((wartosc) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => wartosc });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (wartosc ? "hidden" : "visible") });
    document.dispatchEvent(new Event("visibilitychange"));
  }, ukryta);
}

const OKNA = [
  { szerokosc: 1280, wysokosc: 800 },
  { szerokosc: 390, wysokosc: 844 },
];

for (const { szerokosc, wysokosc } of OKNA) {
  test.describe(`strona lekcji: stan nagrania z serwera — ${szerokosc} px`, () => {
    test.skip(!GRUPY.edycjaLekcji.wlaczona, "grupa ekranu lekcji jest wyłączona");
    test.use({ viewport: { width: szerokosc, height: wysokosc } });

    test("brak nagrania: jedno pytanie o stan, potem żadnego", async ({ page }, testInfo) => {
      await page.clock.install();
      const atrapa = await instalujAtrapy(page, { stany: [BRAK] });
      await otworzLekcje(page);

      const karta = kartaNagrania(page);
      await expect(karta.getByText("Ta lekcja nie ma jeszcze nagrania.")).toBeVisible();
      await expect(karta.locator("[data-stan-nagrania='brak']")).toHaveCount(1);
      await expect(kartaStanu(page)).not.toContainText(/nagranie się/);
      await page.clock.fastForward(5 * 60_000);
      expect(atrapa.pytaniaOStan()).toBe(1);

      await zmierzStan(page, testInfo, szerokosc, `stan-brak-${szerokosc}`);
    });

    test("wysyłanie stąd obok grającego nagrania; pasek postępu, „Zapisz lekcję” i „Zapisuje się samo” jak na szkicu", async ({ page }, testInfo) => {
      const atrapa = await instalujAtrapy(page, { stany: [GOTOWE], przyjeteKawalki: 2 });
      await otworzLekcje(page);

      const karta = kartaNagrania(page);
      await expect(karta.getByText("Uczestnicy będą oglądać obecne nagranie, dopóki nowe nie będzie gotowe.")).toBeVisible();
      await poleNagrania(page).setInputFiles({ name: DLUGA_NAZWA_NAGRANIA, mimeType: "video/mp4", buffer: Buffer.alloc(13 * MB) });
      await expect(karta.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "76");
      await expect(karta.getByText(DLUGA_NAZWA_NAGRANIA)).toBeVisible();
      await expect(karta.getByText("1. Wysyłanie (teraz)")).toHaveAttribute("aria-current", "step");
      await expect(
        karta.getByText("Uczestnicy oglądają dotychczasowe nagranie. Nowe zastąpi je samo, gdy będzie gotowe. Jeśli się nie uda, zostanie dotychczasowe."),
      ).toBeVisible();
      await expect(kartaStanu(page)).toContainText(/Gotowe:.*nagranie/);
      await expect(kartaStanu(page)).toContainText(/nowe nagranie się wysyła \(76.%\)/);
      // W czasie wysyłania stąd strona nie pyta serwera o stan.
      expect(atrapa.pytaniaOStan()).toBe(1);

      // Szkic, miejsce 1: postęp w barwie marki, nie w zieleni przycisku głównego.
      const barwy = await page.evaluate(() => {
        const tlo = (wezel: Element | null) => (wezel ? getComputedStyle(wezel).backgroundColor : "");
        const zielony = Array.from(document.querySelectorAll("main button")).find(
          (przycisk) => /primary/.test(przycisk.className) && przycisk.getClientRects().length > 0,
        );
        return {
          przycisk: tlo(zielony ?? null),
          postepy: Array.from(document.querySelectorAll("[data-postep-wysylania] > span")).map(tlo),
        };
      });
      expect(new Set(barwy.postepy).size).toBe(1);
      expect(barwy.postepy[0]).toBe("rgb(21, 0, 187)");
      expect(barwy.postepy[0]).not.toBe(barwy.przycisk);

      // Szkic, miejsce 2: „Zapisz lekcję” na całą szerokość treści karty „Zapis” (od dwóch kolumn).
      if (szerokosc >= PROG_DWOCH_KOLUMN) {
        const zapis = await page.evaluate(() => {
          const naglowek = Array.from(document.querySelectorAll("main h2")).find((h) => h.textContent?.trim() === "Zapis");
          const sekcja = naglowek?.closest("section");
          const przycisk = Array.from(sekcja?.querySelectorAll("button") ?? []).find((b) => b.textContent?.trim() === "Zapisz lekcję");
          if (!sekcja || !przycisk) return null;
          // Zdanie pod przyciskiem jest blokiem na całą szerokość treści karty.
          const zdanie = Array.from(sekcja.querySelectorAll("p")).find((p) => p.textContent?.trim() === "Nagranie i pliki zapisują się same.");
          if (!zdanie) return null;
          const p = przycisk.getBoundingClientRect();
          const z = zdanie.getBoundingClientRect();
          return { przycisk: p.width, wnetrze: z.width, lewo: Math.abs(p.left - z.left), karta: sekcja.getBoundingClientRect().width };
        });
        expect(zapis).not.toBeNull();
        await testInfo.attach("szkic-zapisz-lekcje", { body: JSON.stringify(zapis), contentType: "application/json" });
        expect(Math.abs(zapis!.przycisk - zapis!.wnetrze), `przycisk ${zapis!.przycisk} px, wnętrze karty ${zapis!.wnetrze} px`).toBeLessThanOrEqual(1);
        expect(zapis!.lewo).toBeLessThanOrEqual(1);
        expect(zapis!.przycisk / zapis!.karta, "przycisk zajmuje kartę poza jej marginesem wewnętrznym").toBeGreaterThan(0.85);
      }

      // Szkic, miejsce 3: „Zapisuje się samo” w wierszu tytułu karty, po jego prawej stronie.
      const naglowki = await page.evaluate(() =>
        Array.from(document.querySelectorAll("main h2"))
          .filter((h) => ["Nagranie", "Pliki do tej lekcji"].includes(h.textContent?.trim() ?? ""))
          .map((h) => {
            const opis = h.nextElementSibling as HTMLElement | null;
            const sekcja = h.closest("section") as HTMLElement;
            const t = h.getBoundingClientRect();
            const o = opis?.getBoundingClientRect();
            const s = sekcja.getBoundingClientRect();
            return {
              tytul: h.textContent?.trim(),
              opis: opis?.textContent?.trim(),
              wspolnyWiersz: o ? o.top < t.bottom && o.bottom > t.top : false,
              poPrawej: o ? o.left >= t.right : false,
              odPrawejKrawedzi: o ? Math.round(s.right - o.right) : -1,
            };
          }),
      );
      await testInfo.attach("szkic-zapisuje-sie-samo", { body: JSON.stringify(naglowki), contentType: "application/json" });
      expect(naglowki.map((n) => [n.tytul, n.opis, n.wspolnyWiersz, n.poPrawej])).toEqual([
        ["Nagranie", "Zapisuje się samo", true, true],
        ["Pliki do tej lekcji", "Zapisuje się samo", true, true],
      ]);
      for (const naglowek of naglowki) expect(naglowek.odPrawejKrawedzi).toBeLessThanOrEqual(40);

      await zmierzStan(page, testInfo, szerokosc, `stan-wysylanie-${szerokosc}`);
    });

    test("plik wysyłany z innej karty przeglądarki: zdanie wprost i pytanie o stan po 30 s", async ({ page }, testInfo) => {
      await page.clock.install();
      const atrapa = await instalujAtrapy(page, { stany: [WYSYLANE] });
      await otworzLekcje(page);

      const karta = kartaNagrania(page);
      await expect(karta.getByText("Nagranie jest wysyłane z innej karty przeglądarki albo z innego urządzenia.")).toBeVisible();
      await expect(karta.getByText(ZDANIE_ODSWIEZANIA)).toBeVisible();
      await expect(karta.getByText("Wyślij nagranie stąd")).toBeVisible();
      await expect(karta.getByRole("progressbar")).toHaveCount(0);
      await expect(kartaStanu(page)).toContainText(/Czekamy:.*nagranie się wysyła/);
      expect(atrapa.pytaniaOStan()).toBe(1);
      await page.clock.fastForward(31_000);
      await expect.poll(() => atrapa.pytaniaOStan()).toBe(2);

      await zmierzStan(page, testInfo, szerokosc, `stan-wysylane-skadinad-${szerokosc}`);
    });

    test("przetwarzanie, po 30 s gotowe: czas trwania i podgląd z odpowiedzi, dalej zero pytań", async ({ page }, testInfo) => {
      await page.clock.install();
      const atrapa = await instalujAtrapy(page, { stany: [PRZETWARZANE, stan("ready", true, false, 245)] });
      await otworzLekcje(page);

      const karta = kartaNagrania(page);
      await expect(karta.getByText("Przetwarzanie trwa zwykle 10–30 minut.")).toBeVisible();
      await expect(karta.getByText(ZDANIE_ODSWIEZANIA)).toBeVisible();
      await expect(karta.getByText("2. Przetwarzanie (teraz)")).toHaveAttribute("aria-current", "step");
      await expect(kartaStanu(page)).toContainText(/Czekamy:.*nagranie się przetwarza/);
      await zmierzStan(page, testInfo, szerokosc, `stan-przetwarzanie-${szerokosc}`);

      const przed = atrapa.pytaniaOStan();
      expect(przed).toBe(1);
      await page.clock.fastForward(20_000);
      expect(atrapa.pytaniaOStan(), "przed upływem 30 s").toBe(1);
      await page.clock.fastForward(11_000);
      await expect(karta.getByText("Nagranie jest gotowe. Czas trwania: 4 min 5 s.")).toBeVisible();
      expect(atrapa.pytaniaOStan()).toBe(2);
      await expect(karta.getByRole("link", { name: "Otwórz podgląd nagrania w nowej karcie przeglądarki" })).toHaveAttribute("href", PODGLAD);
      await expect(kartaStanu(page)).toContainText(/Gotowe:.*nagranie/);
      await page.clock.fastForward(5 * 60_000);
      expect(atrapa.pytaniaOStan(), "po `ready` strona nie pyta").toBe(2);

      await zrzut(page, `stan-przetwarzanie-po-gotowe-${szerokosc}`);
    });

    test("gotowe, długi tytuł: poza pierwszym odczytem zero pytań o stan", async ({ page }, testInfo) => {
      await page.clock.install();
      const atrapa = await instalujAtrapy(page, { stany: [GOTOWE], tytul: DLUGI_TYTUL });
      await otworzLekcje(page, DLUGI_TYTUL);

      const karta = kartaNagrania(page);
      await expect(karta.getByText("Nagranie jest gotowe. Czas trwania: 25 min 0 s.", { exact: false })).toBeVisible();
      const podglad = karta.getByRole("link", { name: "Otwórz podgląd nagrania w nowej karcie przeglądarki" });
      await expect(podglad).toHaveAttribute("href", PODGLAD);
      await expect(podglad).toHaveAttribute("target", "_blank");
      await expect(podglad).toHaveAttribute("rel", "noopener noreferrer");
      await expect(karta.getByText(ZDANIE_ODSWIEZANIA)).toHaveCount(0);
      await page.clock.fastForward(10 * 60_000);
      await ukryjKarte(page, true);
      await ukryjKarte(page, false);
      await page.clock.fastForward(60_000);
      expect(atrapa.pytaniaOStan(), "pytania o stan gotowej lekcji przez 11 minut").toBe(1);
      await testInfo.attach("pytania-o-stan-gotowej-lekcji", { body: String(atrapa.pytaniaOStan()), contentType: "text/plain" });

      await zmierzStan(page, testInfo, szerokosc, `stan-gotowe-${szerokosc}`);
    });

    test("błąd: zdanie o błędzie i ponowne wysłanie; zero pytań o stan", async ({ page }, testInfo) => {
      await page.clock.install();
      const atrapa = await instalujAtrapy(page, { stany: [BLAD] });
      await otworzLekcje(page);

      const karta = kartaNagrania(page);
      await expect(karta.getByText("Przetwarzanie nagrania zakończyło się błędem.")).toBeVisible();
      await expect(karta.locator("[data-stan-nagrania='blad']")).toHaveCount(1);
      await expect(poleNagrania(page)).toHaveCount(1);
      await expect(kartaStanu(page)).toContainText(/Wymaga uwagi:/);
      await page.clock.fastForward(5 * 60_000);
      expect(atrapa.pytaniaOStan()).toBe(1);

      await zmierzStan(page, testInfo, szerokosc, `stan-blad-${szerokosc}`);
    });

    test("przerwane wysyłanie nowego nagrania: dotychczasowe zostaje w gotowych", async ({ page }, testInfo) => {
      await instalujAtrapy(page, { stany: [GOTOWE], przyjeteKawalki: 1 });
      await otworzLekcje(page);

      await poleNagrania(page).setInputFiles({ name: "wywiad-nagranie.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(11 * MB) });
      const karta = kartaNagrania(page);
      await expect(karta.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "45");
      await karta.getByRole("button", { name: "Przerwij wysyłanie" }).click();
      await expect(karta.getByText(/Wysyłanie stanęło przy 45.%/)).toBeVisible();
      await expect(karta.getByText("Wybierz plik, żeby dokończyć")).toBeVisible();
      await expect(kartaStanu(page)).toContainText(/Gotowe:.*nagranie/);
      await expect(kartaStanu(page)).toContainText(/Wymaga uwagi:.*wysyłanie nowego nagrania przerwane/);

      await zmierzStan(page, testInfo, szerokosc, `stan-przerwane-${szerokosc}`);
    });

    test("wymiana: nowe się przetwarza, potem kończy się błędem — uczestnicy nadal oglądają dotychczasowe", async ({ page }, testInfo) => {
      await page.clock.install();
      const atrapa = await instalujAtrapy(page, { stany: [WYMIANA, WYMIANA_Z_BLEDEM], tytul: DLUGI_TYTUL });
      await otworzLekcje(page, DLUGI_TYTUL);

      const karta = kartaNagrania(page);
      await expect(karta.getByText("Nagranie jest gotowe. Czas trwania: 25 min 0 s.", { exact: false })).toBeVisible();
      await expect(
        karta.getByText(
          "Uczestnicy oglądają dotychczasowe nagranie. Nowe nagranie się przetwarza – zwykle 10–30 minut – i zastąpi dotychczasowe samo, gdy będzie gotowe.",
        ),
      ).toBeVisible();
      await expect(karta.locator("[data-stan-nagrania='gotowe'][data-nowe-nagranie='przetwarzanie']")).toHaveCount(1);
      await expect(kartaStanu(page)).toContainText(/Gotowe:.*nagranie/);
      await expect(kartaStanu(page)).toContainText(/Czekamy:.*nowe nagranie się przetwarza/);
      await zmierzStan(page, testInfo, szerokosc, `stan-wymiana-${szerokosc}`);

      await page.clock.fastForward(31_000);
      await expect(
        karta.getByText("Nowe nagranie nie zostało przetworzone. Uczestnicy nadal oglądają dotychczasowe nagranie."),
      ).toBeVisible();
      expect(atrapa.pytaniaOStan()).toBe(2);
      await expect(karta.getByText("Nagranie jest gotowe. Czas trwania: 25 min 0 s.", { exact: false })).toBeVisible();
      await expect(karta.getByText("Wyślij nowe nagranie ponownie")).toBeVisible();
      await expect(karta.locator("[data-stan-nagrania='blad']")).toHaveCount(0);
      await expect(kartaStanu(page)).toContainText(/Gotowe:.*nagranie/);
      await expect(kartaStanu(page)).toContainText(/Wymaga uwagi:.*nowe nagranie trzeba wysłać ponownie/);
      await page.clock.fastForward(5 * 60_000);
      expect(atrapa.pytaniaOStan(), "po błędzie nowego nagrania strona nie pyta").toBe(2);

      await zmierzStan(page, testInfo, szerokosc, `stan-wymiana-blad-nowego-${szerokosc}`);
    });

    test("ukryta karta przeglądarki: zero pytań o stan; po powrocie jedno", async ({ page }) => {
      await page.clock.install();
      const atrapa = await instalujAtrapy(page, { stany: [PRZETWARZANE] });
      await otworzLekcje(page);
      await expect(kartaNagrania(page).getByText("Przetwarzanie trwa zwykle 10–30 minut.")).toBeVisible();
      expect(atrapa.pytaniaOStan()).toBe(1);

      await ukryjKarte(page, true);
      await page.clock.fastForward(5 * 60_000);
      expect(atrapa.pytaniaOStan(), "karta ukryta przez 5 minut").toBe(1);

      await ukryjKarte(page, false);
      await expect.poll(() => atrapa.pytaniaOStan()).toBe(2);
      await page.clock.fastForward(10_000);
      expect(atrapa.pytaniaOStan(), "10 s po powrocie").toBe(2);
      await page.clock.fastForward(21_000);
      await expect.poll(() => atrapa.pytaniaOStan()).toBe(3);
    });
  });
}
