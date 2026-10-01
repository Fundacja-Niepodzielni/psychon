import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";
import { DOSTAWCA, MB, instalujDostawce, type OpcjeDostawcy } from "./_dostawca-nagran";
import { GRUPY } from "../lib/przelaczenie/grupy";

/**
 * Wysyłanie nagrania ponad ekranami panelu administracji, na zbudowanej
 * aplikacji, z atrapą API, atrapą sesji i atrapą dostawcy nagrań (żadne
 * żądanie nie wychodzi poza przeglądarkę):
 *  - wysyłanie trwa przy przejściu lekcja → kurs → inna lekcja → lista kursów,
 *    pasek u góry ramy i postęp w wierszu lekcji;
 *  - wejście na ekran bez paska najpierw pyta;
 *  - przerwane wysyłanie widać w trzech miejscach; inny plik jest odrzucany,
 *    ten sam plik kończy wysyłanie od miejsca przerwania;
 *  - serwer, który nie potwierdza tego samego nagrania, i „od nowa” — od zera.
 * Zrzuty powstają tylko przy ustawionej zmiennej `PW_ZRZUTY`.
 */

const API = "http://localhost:8000/api/v1";
const KLUCZ_PAMIECI = "psychon.wysylanie-nagrania";
const POLA_WPISU = ["adresLekcji", "adresWgrania", "idLekcji", "nazwa", "rozmiar", "tytulLekcji", "wyslano", "zapisano", "zmieniono"];

const ATRAPA_SESJI = {
  accessToken: ["atrapa", "tokenu", "testowego"].join("-"),
  expiresAt: Date.now() + 3_600_000,
};
const PODPIS = ["atrapa", "podpisu", "wgrania"].join("-");
const ID_NAGRANIA = ["wideo", "nowe", "640"].join("-");

const META = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

const KURS = {
  id: 4,
  title: "Wywiad psychologiczny",
  slug: "wywiad-psychologiczny",
  description: "Jak prowadzić pierwszą rozmowę i o co pytać.",
  type: "course",
  product_group: "psychon",
  sequence_order: 2,
  edition_id: 1,
  is_published: false,
  lessons_count: 3,
  materials_count: 0,
  created_at: "2026-09-01T08:00:00Z",
  updated_at: "2026-09-01T08:00:00Z",
};

function lekcja(id: number, title: string, topicId: number, pozycja: number, nagranie: string | null) {
  return {
    id,
    course_id: 4,
    title,
    description: "Opis lekcji.",
    content: "## Cel lekcji\n\nTreść lekcji.",
    sequence_order: id - 20,
    topic_id: topicId,
    topic_position: pozycja,
    video_provider_id: nagranie,
    duration_seconds: 1500,
    materials_count: 0,
    created_at: null,
    updated_at: null,
  };
}

const LEKCJE = [
  lekcja(21, "Wprowadzenie do wywiadu", 7, 1, "wideo-21"),
  lekcja(22, "Pytania otwarte i zamknięte", 7, 2, null),
  lekcja(23, "Ćwiczenie w parach", 8, 1, "wideo-23"),
];
const TEMATY = [
  { id: 7, course_id: 4, title: "Podstawy", position: 1, lesson_ids: [21, 22], created_at: null, updated_at: null },
  { id: 8, course_id: 4, title: "Praktyka", position: 2, lesson_ids: [23], created_at: null, updated_at: null },
];

function json(dane: unknown, status = 200, meta?: unknown) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }),
  };
}

interface Opcje extends OpcjeDostawcy {
  /** Co serwer mówi w drugim i kolejnych pozwoleniach: `true` — to samo nagranie; `null` — pola nie ma. */
  resumed?: boolean | null;
}

async function instalujAtrapy(page: Page, opcje: Opcje = {}) {
  const serwer = { pozwolenia: 0 };

  await page.route(`${API}/**`, (route) => route.fulfill(json([], 200, META)));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(json({ id: 1, role: "super_admin", first_name: "Anna", program_completed_at: null })),
  );
  await page.route(`${API}/notifications**`, (route) =>
    route.fulfill(json([], 200, { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { unread: 0 } })),
  );
  const dostawca = await instalujDostawce(page, opcje);
  await page.route(
    (adres) => adres.pathname.startsWith("/api/v1/admin/"),
    (route) => {
      const zadanie = route.request();
      const sciezka = new URL(zadanie.url()).pathname.replace("/api/v1", "");
      const metoda = zadanie.method();

      if (sciezka === "/admin/courses/4") return route.fulfill(json(KURS));
      if (sciezka === "/admin/courses/4/lessons") return route.fulfill(json(LEKCJE));
      if (sciezka === "/admin/courses/4/topics") return route.fulfill(json(TEMATY));
      if (sciezka === "/admin/courses/4/assignments") return route.fulfill(json([]));
      if (sciezka === "/admin/courses/4/tests") {
        return route.fulfill(json({ id: 31, course_id: 4, pass_threshold: 80, attempts_limit: 3, question_count: 5 }));
      }
      const nagranie = /^\/admin\/lessons\/(\d+)\/video-status$/.exec(sciezka);
      if (nagranie) {
        if (Number(nagranie[1]) !== 22) return route.fulfill(json({ status: "finished", duration_seconds: 1500, preview_embed_url: null }));
        // Lekcja 22: bez nagrania, a po wysłaniu całego pliku — przetwarzanie.
        const calyPlik = dostawca.rozmiar > 0 && dostawca.przyjete === dostawca.rozmiar;
        return route.fulfill(json(calyPlik ? { status: "processing", duration_seconds: null, preview_embed_url: null } : { status: "no_video" }));
      }
      if (/^\/admin\/lessons\/\d+\/video-uploads$/.test(sciezka) && metoda === "POST") {
        serwer.pozwolenia += 1;
        const resumed = serwer.pozwolenia === 1 ? false : opcje.resumed === undefined ? true : opcje.resumed;
        return route.fulfill(
          json(
            {
              video_id: ID_NAGRANIA,
              upload_url: `${DOSTAWCA}/tusupload`,
              library_id: "1",
              expiration_time: 1790000000,
              signature: PODPIS,
              ...(resumed === null ? {} : { resumed }),
            },
            201,
          ),
        );
      }
      return route.fallback();
    },
  );

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json({ url: null })));
  return { serwer, dostawca };
}

async function otworzLekcje(page: Page, idLekcji: number, tytul: string): Promise<void> {
  const odpowiedz = await page.goto(`/admin/kursy/4/lekcje/${idLekcji}`);
  expect(odpowiedz?.status()).toBe(200);
  await zabezpieczeniePrzedEkranemDostepu(page);
  await expect(page.getByRole("heading", { level: 1, name: tytul })).toBeVisible();
}

/**
 * Plik nagrania na dysku próby. Ta sama ścieżka wybrana drugi raz to ten sam
 * plik: ta sama nazwa, rozmiar i data modyfikacji.
 */
function plikNagrania(testInfo: TestInfo, nazwa: string, megabajty: number): string {
  const sciezka = testInfo.outputPath(nazwa);
  writeFileSync(sciezka, Buffer.alloc(megabajty * MB));
  return sciezka;
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

/** Pasek stoi na samej górze treści ramy, od krawędzi do krawędzi; strona nie przewija się w poziomie. */
async function zmierzPasek(page: Page): Promise<void> {
  const pomiar = await page.evaluate(() => {
    const pasek = document.querySelector("[data-pasek-wysylania]")!.getBoundingClientRect();
    const tresc = document.querySelector("main")!.getBoundingClientRect();
    const odnosniki = Array.from(document.querySelectorAll<HTMLElement>("[data-pasek-wysylania] a")).map(
      (odnosnik) => Math.round(odnosnik.getBoundingClientRect().height * 10) / 10,
    );
    return {
      lewo: Math.round(pasek.left - tresc.left),
      prawo: Math.round(tresc.right - pasek.right),
      gora: Math.round(pasek.top - tresc.top),
      wysokosc: Math.round(pasek.height),
      odnosniki,
      nadmiar: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      mainow: document.querySelectorAll("main").length,
    };
  });
  expect(pomiar.lewo, "pasek od lewej krawędzi treści").toBe(0);
  expect(pomiar.prawo, "pasek do prawej krawędzi treści").toBe(0);
  expect(pomiar.gora, "pasek na samej górze treści").toBe(0);
  expect(pomiar.wysokosc).toBeGreaterThanOrEqual(44);
  expect(pomiar.wysokosc).toBeLessThanOrEqual(48);
  for (const wysokosc of pomiar.odnosniki) expect(wysokosc, "cel dotyku w pasku").toBeGreaterThanOrEqual(44);
  expect(pomiar.nadmiar, "przewijanie poziome").toBeLessThanOrEqual(0);
  expect(pomiar.mainow).toBe(1);
}

/** Wpis w pamięci przeglądarki: wyłącznie pola z listy, nic z pozwolenia. */
async function sprawdzPamiec(page: Page): Promise<Record<string, unknown>> {
  const pamiec = await page.evaluate((klucz) => {
    const wszystko: Record<string, string> = {};
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const nazwa = window.localStorage.key(i)!;
      wszystko[nazwa] = window.localStorage.getItem(nazwa) ?? "";
    }
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const nazwa = window.sessionStorage.key(i)!;
      wszystko[`sesja:${nazwa}`] = window.sessionStorage.getItem(nazwa) ?? "";
    }
    return { wpis: window.localStorage.getItem(klucz), wszystko: JSON.stringify(wszystko) };
  }, KLUCZ_PAMIECI);
  expect(pamiec.wpis, "wpis o przerwanym wysyłaniu").not.toBeNull();
  const wpis = JSON.parse(pamiec.wpis!) as Record<string, unknown>;
  expect(Object.keys(wpis).sort()).toEqual(POLA_WPISU);
  expect(wpis.adresWgrania).toBe(`${DOSTAWCA}/tusupload/1`);
  // Podpis i identyfikator nagrania nie leżą nigdzie w pamięci przeglądarki — ani w tym wpisie, ani obok.
  expect(pamiec.wszystko).not.toContain(PODPIS);
  expect(pamiec.wszystko).not.toContain(ID_NAGRANIA);
  expect(pamiec.wszystko).not.toMatch(/signature|expiration_time|library_id/);
  return wpis;
}

function poleNagrania(page: Page) {
  return page.locator("input[type='file'][id$='-nagranie-plik']");
}

function kartaNagrania(page: Page) {
  return page.locator("section", { has: page.getByRole("heading", { level: 2, name: "Nagranie", exact: true }) });
}

function pasek(page: Page, stan: "wysylanie" | "przerwane") {
  return page.locator(`[data-pasek-wysylania='${stan}']`);
}

/** Wysyła plik 16 MB i przerywa po pierwszym kawałku (31 %): karta, pasek i pamięć w stanie „przerwane”. */
async function przerwijPrzyJednejTrzeciej(page: Page, testInfo: TestInfo): Promise<string> {
  const plik = plikNagrania(testInfo, "pytania-otwarte.mp4", 16);
  await poleNagrania(page).setInputFiles(plik);
  await expect(kartaNagrania(page).getByText(/Wysyłanie stanęło przy 31.%/)).toBeVisible();
  await expect(pasek(page, "przerwane")).toBeVisible();
  return plik;
}

const OKNA = [
  { szerokosc: 1280, wysokosc: 800 },
  { szerokosc: 390, wysokosc: 844 },
];

for (const { szerokosc, wysokosc } of OKNA) {
  test.describe(`wysyłanie nagrania ponad ekranami — ${szerokosc} px`, () => {
    test.skip(!GRUPY.edycjaLekcji.wlaczona, "grupa ekranu lekcji jest wyłączona");
    test.use({ viewport: { width: szerokosc, height: wysokosc } });

    test("wysyłanie trwa przy przejściu: kurs, inna lekcja, lista kursów; pasek u góry i postęp w wierszu", async ({ page }, testInfo) => {
      const { serwer, dostawca } = await instalujAtrapy(page, { przyjeteKawalki: 2, potem: "wisi" });
      await otworzLekcje(page, 22, "Pytania otwarte i zamknięte");
      // Znak w oknie przeglądarki: przeładowanie dokumentu by go zgubiło.
      await page.evaluate(() => {
        (window as unknown as { znakBezPrzeladowania?: boolean }).znakBezPrzeladowania = true;
      });

      await poleNagrania(page).setInputFiles(plikNagrania(testInfo, "pytania-otwarte.mp4", 13));
      await expect(kartaNagrania(page).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "76");
      await expect(pasek(page, "wysylanie")).toContainText("Wysyłanie nagrania:");
      await expect(pasek(page, "wysylanie")).toContainText("Pytania otwarte i zamknięte");
      await expect(pasek(page, "wysylanie")).toContainText(/76.%/);
      await zmierzPasek(page);

      // Strona lekcji: „Zapisuje się samo” po prawej stronie nagłówka karty, w wierszu tytułu.
      const naglowki = await page.evaluate(() =>
        Array.from(document.querySelectorAll("main section"))
          .map((karta) => {
            const tytul = karta.querySelector("h2");
            const opis = tytul?.nextElementSibling;
            if (!tytul || !opis || opis.textContent !== "Zapisuje się samo") return null;
            const ramkaKarty = karta.getBoundingClientRect();
            const ramkaTytulu = tytul.getBoundingClientRect();
            const ramkaOpisu = opis.getBoundingClientRect();
            return {
              tytul: tytul.textContent,
              odPrawej: Math.round(ramkaKarty.right - ramkaOpisu.right),
              odLewejTytulu: Math.round(ramkaTytulu.left - ramkaKarty.left),
              wJednymWierszu: ramkaOpisu.top < ramkaTytulu.bottom && ramkaOpisu.bottom > ramkaTytulu.top,
              zaTytulem: ramkaOpisu.left >= ramkaTytulu.right,
            };
          })
          .filter((wpis) => wpis !== null),
      );
      expect(naglowki.map((wpis) => wpis.tytul)).toEqual(["Nagranie", "Pliki do tej lekcji"]);
      for (const wpis of naglowki) {
        expect(wpis.wJednymWierszu, `„Zapisuje się samo” w wierszu tytułu: ${wpis.tytul}`).toBe(true);
        expect(wpis.zaTytulem).toBe(true);
        // Ten sam odstęp od prawej krawędzi karty, co tytuł od lewej.
        expect(Math.abs(wpis.odPrawej - wpis.odLewejTytulu)).toBeLessThanOrEqual(2);
      }

      // „Zapisz lekcję” w karcie „Zapis” na całą szerokość karty.
      if (szerokosc >= 1100) {
        const przycisk = await page.evaluate(() => {
          const zapisz = Array.from(document.querySelectorAll<HTMLElement>("main [data-obszar='tylko-od-dwoch-kolumn'] button")).find(
            (wezel) => wezel.textContent?.trim() === "Zapisz lekcję",
          )!;
          const karta = zapisz.closest("section")!;
          const tytul = karta.querySelector("h2")!.getBoundingClientRect();
          const ramka = zapisz.getBoundingClientRect();
          const ramkaKarty = karta.getBoundingClientRect();
          return {
            lewo: Math.round(ramka.left - tytul.left),
            prawo: Math.round(ramkaKarty.right - ramka.right - (tytul.left - ramkaKarty.left)),
          };
        });
        expect(Math.abs(przycisk.lewo), "lewa krawędź przycisku równo z tytułem karty").toBeLessThanOrEqual(1);
        expect(Math.abs(przycisk.prawo), "prawa krawędź przycisku w tym samym odstępie").toBeLessThanOrEqual(1);
      }

      // Kurs: pasek z odnośnikiem do lekcji, postęp w wierszu lekcji.
      await page.getByRole("link", { name: "← Wróć do kursu" }).click();
      await expect(page).toHaveURL(/\/admin\/kursy\/4$/);
      await expect(page.getByRole("heading", { level: 2, name: "Tematy i lekcje" })).toBeVisible();
      await expect(pasek(page, "wysylanie")).toContainText(/76.%/);
      const wiersz = page.locator("li[data-lekcja='22']");
      const wWierszu = wiersz.locator("[data-wysylanie-w-wierszu='wysylanie']");
      await expect(wWierszu).toHaveText(/^Wysyłanie 76.%$/);
      await expect(wWierszu.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "76");
      await expect(page.locator("[data-wysylanie-w-wierszu]")).toHaveCount(1);
      await expect(pasek(page, "wysylanie").getByRole("link", { name: "Pokaż lekcję Pytania otwarte i zamknięte" })).toBeVisible();
      await zmierzPasek(page);
      await sprawdzAxe(page, testInfo, `axe-wysylanie-kurs-${szerokosc}`);
      await zrzut(page, `d-kurs-wysylanie-${szerokosc}`);

      // Inna lekcja: pasek zostaje, karta tej lekcji pokazuje własne nagranie.
      await page.getByRole("link", { name: "Otwórz lekcję 3: Ćwiczenie w parach" }).click();
      await expect(page).toHaveURL(/\/admin\/kursy\/4\/lekcje\/23$/);
      await expect(page.getByRole("heading", { level: 1, name: "Ćwiczenie w parach" })).toBeVisible();
      await expect(pasek(page, "wysylanie")).toContainText("Pytania otwarte i zamknięte");
      await expect(page.locator("[data-stan-nagrania='wysylanie']")).toHaveCount(0);
      await zmierzPasek(page);

      // Z paska z powrotem do lekcji, której nagranie się wysyła.
      await pasek(page, "wysylanie").getByRole("link", { name: "Pokaż lekcję Pytania otwarte i zamknięte" }).click();
      await expect(page).toHaveURL(/\/admin\/kursy\/4\/lekcje\/22#nagranie$/);
      await expect(kartaNagrania(page).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "76");

      // Lista kursów.
      await page.getByRole("link", { name: "← Wróć do kursu" }).click();
      await expect(page).toHaveURL(/\/admin\/kursy\/4$/);
      await page.locator("main").getByRole("link", { name: "Kursy", exact: true }).click();
      await expect(page).toHaveURL(/\/admin\/kursy$/);
      await expect(pasek(page, "wysylanie")).toContainText(/76.%/);
      await zmierzPasek(page);
      await zrzut(page, `d-lista-kursow-wysylanie-${szerokosc}`);

      // Przez cały ten czas: jedno pozwolenie, jedno wgranie, żadnego przeładowania dokumentu.
      expect(serwer.pozwolenia).toBe(1);
      expect(dostawca.utworzone).toBe(1);
      expect(await page.evaluate(() => (window as unknown as { znakBezPrzeladowania?: boolean }).znakBezPrzeladowania)).toBe(true);

      // Dostawca przyjmuje resztę: wysyłanie kończy się na liście kursów i pasek znika, bez pustego miejsca.
      await dostawca.przyjmujWszystko();
      await expect(page.locator("[data-pasek-wysylania]")).toHaveCount(0);
      expect(dostawca.przyjete).toBe(13 * MB);
      expect(dostawca.utworzone).toBe(1);
    });

    test("ekran bez paska: pytanie przed wejściem; „Zostań” zostawia wysyłanie, „Przejdź” je przerywa", async ({ page }, testInfo) => {
      const { dostawca } = await instalujAtrapy(page, { przyjeteKawalki: 2, potem: "wisi" });
      await otworzLekcje(page, 22, "Pytania otwarte i zamknięte");
      await poleNagrania(page).setInputFiles(plikNagrania(testInfo, "pytania-otwarte.mp4", 13));
      await expect(pasek(page, "wysylanie")).toContainText(/76.%/);

      const odnosnik = page.getByRole("link", { name: "Deklaracja dostępności" }).first();
      await odnosnik.click();
      const okno = page.getByRole("dialog", { name: "Wysyłanie nagrania zostanie przerwane" });
      await expect(okno).toBeVisible();
      await expect(okno).toContainText("wysyłanie nagrania lekcji „Pytania otwarte i zamknięte” zostanie przerwane");
      await sprawdzAxe(page, testInfo, `axe-pytanie-o-wyjscie-${szerokosc}`);
      await zrzut(page, `d-pytanie-o-wyjscie-${szerokosc}`);

      await okno.getByRole("button", { name: "Zostań" }).click();
      await expect(okno).toHaveCount(0);
      await expect(odnosnik).toBeFocused();
      await expect(page).toHaveURL(/\/admin\/kursy\/4\/lekcje\/22$/);
      await expect(pasek(page, "wysylanie")).toContainText(/76.%/);
      expect(dostawca.utworzone).toBe(1);

      await odnosnik.click();
      await okno.getByRole("button", { name: "Przejdź i przerwij wysyłanie" }).click();
      await expect(page).toHaveURL(/\/deklaracja-dostepnosci$/);
      const wpis = await sprawdzPamiec(page);
      expect(wpis).toMatchObject({ idLekcji: 22, nazwa: "pytania-otwarte.mp4", rozmiar: 13 * MB, wyslano: 10 * MB });

      // Po powrocie: przerwane wysyłanie w pasku i w karcie.
      await otworzLekcje(page, 22, "Pytania otwarte i zamknięte");
      await expect(pasek(page, "przerwane")).toContainText("Wysyłanie przerwane: Pytania otwarte i zamknięte");
      await expect(kartaNagrania(page).getByText(/Wysyłanie stanęło przy 76.%/)).toBeVisible();
    });

    test("przerwane przy ok. 30 %: trzy miejsca, inny plik odrzucony, ten sam plik kończy od miejsca przerwania", async ({ page }, testInfo) => {
      const { serwer, dostawca } = await instalujAtrapy(page, { przyjeteKawalki: 1, potem: "blad", resumed: true });
      await otworzLekcje(page, 22, "Pytania otwarte i zamknięte");
      const plik = await przerwijPrzyJednejTrzeciej(page, testInfo);
      const karta = kartaNagrania(page);

      // Miejsce pierwsze i drugie: karta nagrania i pasek u góry ramy.
      await expect(karta.getByText("Wybierz plik, żeby dokończyć")).toBeVisible();
      await expect(karta.getByRole("button", { name: "Wyślij inny plik od nowa" })).toBeVisible();
      await expect(karta.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "31");
      await expect(pasek(page, "przerwane")).toContainText("Wysyłanie przerwane: Pytania otwarte i zamknięte");
      await expect(pasek(page, "przerwane").getByRole("link")).toHaveText("Dokończ");
      await zmierzPasek(page);
      expect(await sprawdzPamiec(page)).toMatchObject({ idLekcji: 22, rozmiar: 16 * MB, wyslano: 5 * MB });

      // Miejsce trzecie: wiersz lekcji na ekranie kursu.
      await page.getByRole("link", { name: "← Wróć do kursu" }).click();
      await expect(page).toHaveURL(/\/admin\/kursy\/4$/);
      await expect(page.locator("li[data-lekcja='22'] [data-wysylanie-w-wierszu='przerwane']")).toHaveText("Wysyłanie przerwane");
      await expect(pasek(page, "przerwane")).toBeVisible();
      await zmierzPasek(page);
      await sprawdzAxe(page, testInfo, `axe-przerwane-kurs-${szerokosc}`);
      await zrzut(page, `d-kurs-przerwane-${szerokosc}`);

      // „Dokończ” prowadzi do karty nagrania; stan przetrwał przeładowanie dokumentu.
      await pasek(page, "przerwane").getByRole("link", { name: "Dokończ wysyłanie nagrania lekcji Pytania otwarte i zamknięte" }).click();
      await expect(page).toHaveURL(/\/admin\/kursy\/4\/lekcje\/22#nagranie$/);
      await page.reload();
      await expect(karta.getByText(/Wysyłanie stanęło przy 31.%/)).toBeVisible();
      await expect(karta.getByText("pytania-otwarte.mp4")).toBeVisible();

      // Inny plik: odmowa słowami, bez nowego pozwolenia i bez żądań do dostawcy.
      const zadanPrzed = dostawca.kawalki.length;
      await poleNagrania(page).setInputFiles(plikNagrania(testInfo, "inne-nagranie.mp4", 6));
      await expect(karta.getByText("To nie jest ten sam plik")).toBeVisible();
      await expect(karta.getByText(/Wysyłanie stanęło przy 31.%/)).toBeVisible();
      expect(serwer.pozwolenia).toBe(1);
      expect(dostawca.kawalki).toHaveLength(zadanPrzed);
      expect(dostawca.pytaniaOPostep).toBe(0);

      // Ten sam plik: nowe pozwolenie, pytanie o postęp i tylko reszta pliku.
      await dostawca.przyjmujWszystko();
      await poleNagrania(page).setInputFiles(plik);
      await expect(page.locator("[data-pasek-wysylania]")).toHaveCount(0);
      await expect(page.locator("[data-stan-nagrania='przerwane'], [data-stan-nagrania='wysylanie']")).toHaveCount(0);
      expect(serwer.pozwolenia).toBe(2);
      expect(dostawca.pytaniaOPostep).toBe(1);
      expect(dostawca.utworzone, "wgranie założone tylko raz").toBe(1);
      const poWznowieniu = dostawca.kawalki.slice(zadanPrzed);
      expect(poWznowieniu.map((kawalek) => kawalek.od)).toEqual([5 * MB, 10 * MB, 15 * MB]);
      const bajtyPoWznowieniu = poWznowieniu.reduce((suma, kawalek) => suma + kawalek.bajty, 0);
      expect(bajtyPoWznowieniu).toBe(11 * MB);
      expect(bajtyPoWznowieniu).toBeLessThan(16 * MB);
      expect(dostawca.przyjete).toBe(16 * MB);
      expect(await page.evaluate((klucz) => window.localStorage.getItem(klucz), KLUCZ_PAMIECI)).toBeNull();
    });

    test("serwer nie potwierdza tego samego nagrania: ten sam plik idzie od zera", async ({ page }, testInfo) => {
      const { serwer, dostawca } = await instalujAtrapy(page, { przyjeteKawalki: 1, potem: "blad", resumed: null });
      await otworzLekcje(page, 22, "Pytania otwarte i zamknięte");
      const plik = await przerwijPrzyJednejTrzeciej(page, testInfo);
      const zadanPrzed = dostawca.kawalki.length;

      await dostawca.przyjmujWszystko();
      await poleNagrania(page).setInputFiles(plik);
      await expect(page.locator("[data-pasek-wysylania]")).toHaveCount(0);
      expect(serwer.pozwolenia).toBe(2);
      expect(dostawca.pytaniaOPostep).toBe(0);
      expect(dostawca.utworzone).toBe(2);
      expect(dostawca.kawalki.slice(zadanPrzed).map((kawalek) => kawalek.od)).toEqual([0, 5 * MB, 10 * MB, 15 * MB]);
      expect(dostawca.przyjete).toBe(16 * MB);
    });

    test("„Wyślij inny plik od nowa”: inny plik idzie od zera, bez pytania dostawcy o postęp", async ({ page }, testInfo) => {
      const { serwer, dostawca } = await instalujAtrapy(page, { przyjeteKawalki: 1, potem: "blad", resumed: true });
      await otworzLekcje(page, 22, "Pytania otwarte i zamknięte");
      await przerwijPrzyJednejTrzeciej(page, testInfo);
      const zadanPrzed = dostawca.kawalki.length;
      const karta = kartaNagrania(page);

      await karta.getByRole("button", { name: "Wyślij inny plik od nowa" }).click();
      await expect(karta.getByText("Wybierz inny plik")).toBeVisible();
      await dostawca.przyjmujWszystko();
      await poleNagrania(page).setInputFiles(plikNagrania(testInfo, "inne-nagranie.mp4", 6));
      await expect(page.locator("[data-pasek-wysylania]")).toHaveCount(0);
      expect(serwer.pozwolenia).toBe(2);
      expect(dostawca.pytaniaOPostep).toBe(0);
      expect(dostawca.utworzone).toBe(2);
      expect(dostawca.kawalki.slice(zadanPrzed).map((kawalek) => kawalek.od)).toEqual([0, 5 * MB]);
      expect(dostawca.przyjete).toBe(6 * MB);
    });
  });
}
