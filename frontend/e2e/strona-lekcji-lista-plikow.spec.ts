import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";
import { GRUPY } from "../lib/przelaczenie/grupy";

/**
 * Karta „Pliki do tej lekcji” strony lekcji administracji, na zbudowanej
 * aplikacji z atrapą API i atrapą sesji (żadne żądanie nie wychodzi poza
 * przeglądarkę), na 1280 i 390 px:
 *  - wejście na lekcję z czterema plikami (jeden o długiej nazwie bez spacji):
 *    wszystkie w liście, licznik = długość listy, zdania roboczego nie ma,
 *    odczyt idzie pod `GET /admin/lessons/22/materials` bez parametrów;
 *  - usunięcie pliku: lista krótsza, licznik niższy, fokus na następnym wierszu
 *    (po usunięciu ostatniego — na zdaniu licznika), bez przeładowania strony;
 *  - błąd odczytu listy: zdanie bez kodu, „Spróbuj ponownie”, dodawanie działa.
 * W każdym stanie: brak przewijania poziomego, cele dotyku co najmniej 44 px,
 * jeden widoczny zielony przycisk, axe (WCAG 2.1 AA i `best-practice`) = 0.
 * Zrzuty całej strony powstają tylko przy ustawionej zmiennej `PW_ZRZUTY`.
 */

const API = "http://localhost:8000/api/v1";

const ATRAPA_SESJI = {
  accessToken: ["atrapa", "tokenu", "testowego"].join("-"),
  expiresAt: Date.now() + 3_600_000,
};

const META = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

const TRESC_LEKCJI = [
  "## Cel lekcji",
  "",
  "Po tej lekcji rozróżniasz pytania otwarte i zamknięte.",
  "",
  "- pytanie otwarte zaprasza do opowiadania",
  "- pytanie zamknięte prowadzi do krótkiej odpowiedzi",
  "",
  "1. Zadaj pytanie otwarte.",
  "2. Posłuchaj odpowiedzi.",
  "3. Podsumuj własnymi słowami.",
  "",
  "Więcej: [materiały pomocnicze](https://przyklad.test/materialy)",
].join("\n");

const DLUGA_NAZWA_PLIKU = `karta_pracy_do_lekcji_o_pytaniach_otwartych_i_zamknietych_${"wersja_poprawiona_".repeat(5)}2026.pdf`;

interface Material {
  id: number;
  name: string;
  mime: string;
  size: number;
  lesson_id: number;
  course_id: null;
  created_at: null;
}

function material(id: number, name: string, mime: string, size: number): Material {
  return { id, name, mime, size, lesson_id: 22, course_id: null, created_at: null };
}

const PLIKI_LEKCJI = [
  material(71, "porady-do-rozmowy.pdf", "application/pdf", 2048),
  material(72, "slajdy-z-warsztatu.pptx", "application/vnd.ms-powerpoint", 1_048_576),
  material(73, DLUGA_NAZWA_PLIKU, "application/pdf", 410 * 1024),
  material(74, "mapa-pytan.png", "image/png", 512),
];

function lekcja(id: number, title: string, materialsCount: number) {
  return {
    id,
    course_id: 4,
    title,
    description: "Kiedy pytać otwarcie, a kiedy zamknąć pytanie.",
    content: id === 22 ? TRESC_LEKCJI : null,
    sequence_order: id - 20,
    topic_id: 7,
    topic_position: id - 20,
    video_provider_id: null,
    duration_seconds: 1500,
    materials_count: materialsCount,
    created_at: null,
    updated_at: null,
  };
}

function json(dane: unknown, status = 200, meta?: unknown) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }),
  };
}

interface Opcje {
  pliki: Material[];
  /** Ile pierwszych odczytów listy kończy się błędem serwera. */
  bledneOdczyty?: number;
}

async function instalujAtrapy(page: Page, opcje: Opcje): Promise<{ zadania: string[]; odczytyListy: string[] }> {
  const zadania: string[] = [];
  const odczytyListy: string[] = [];
  let pliki = [...opcje.pliki];
  let pozostaleBledy = opcje.bledneOdczyty ?? 0;
  let nastepnyId = 500;

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
      const adres = new URL(zadanie.url());
      const sciezka = adres.pathname.replace("/api/v1", "");
      const metoda = zadanie.method();
      zadania.push(`${metoda} ${sciezka}${adres.search}`);

      if (sciezka === "/admin/courses/4") return route.fulfill(json({ id: 4, title: "Wywiad psychologiczny" }));
      if (sciezka === "/admin/courses/4/lessons") {
        return route.fulfill(json([lekcja(21, "Wprowadzenie do wywiadu", 0), lekcja(22, "Pytania otwarte i zamknięte", opcje.pliki.length)]));
      }
      if (/^\/admin\/lessons\/\d+\/video-status$/.test(sciezka)) return route.fulfill(json({ status: "no_video" }));
      if (sciezka === "/admin/lessons/22/materials" && metoda === "GET") {
        odczytyListy.push(`${sciezka}${adres.search}`);
        if (pozostaleBledy > 0) {
          pozostaleBledy -= 1;
          return route.fulfill(json(null, 500));
        }
        return route.fulfill(json(pliki));
      }
      if (sciezka === "/admin/lessons/22/materials" && metoda === "POST") {
        const nowy = material(nastepnyId++, "nowa-karta.pdf", "application/pdf", 4096);
        pliki = [...pliki, nowy];
        return route.fulfill(json(nowy, 201));
      }
      const usuwany = /^\/admin\/materials\/(\d+)$/.exec(sciezka);
      if (usuwany && metoda === "DELETE") {
        const id = Number(usuwany[1]);
        pliki = pliki.filter((plik) => plik.id !== id);
        return route.fulfill(json({ id, deleted: true }));
      }
      return route.fallback();
    },
  );
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json({ url: null })));
  return { zadania, odczytyListy };
}

async function otworzLekcje(page: Page): Promise<void> {
  const odpowiedz = await page.goto("/admin/kursy/4/lekcje/22");
  expect(odpowiedz?.status()).toBe(200);
  await zabezpieczeniePrzedEkranemDostepu(page);
  await expect(page.getByRole("heading", { level: 1, name: "Pytania otwarte i zamknięte" })).toBeVisible();
}

function karta(page: Page) {
  return page.locator("section", { has: page.getByRole("heading", { level: 2, name: "Pliki do tej lekcji", exact: true }) });
}

function wiersze(page: Page) {
  return karta(page).getByRole("list", { name: "Pliki lekcji" }).getByRole("listitem");
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

/** Brak przewijania poziomego, cele dotyku co najmniej 44 px, jeden widoczny zielony przycisk. */
async function zmierzStan(page: Page): Promise<void> {
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
      // Odnośnik w samym tekście treści jest wyjęty z miary (reguła 2.5.8: odnośnik w zdaniu).
      .filter((element) => !(element.tagName === "A" && element.closest("[contenteditable]")))
      .map((element) => {
        const ramka = element.getBoundingClientRect();
        return {
          nazwa: (element.getAttribute("aria-label") ?? element.textContent ?? element.id).trim().slice(0, 50),
          wysokosc: Math.round(ramka.height * 10) / 10,
          szerokosc: Math.round(ramka.width * 10) / 10,
          odnosnik: element.tagName === "A",
        };
      })
      .filter((cel) => cel.wysokosc < 44 || (!cel.odnosnik && cel.szerokosc < 44)),
  );
  expect(zaMale, "cele dotyku poniżej 44 px").toEqual([]);

  const zielone = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("main button"))
      .filter((przycisk) => /primary/.test(przycisk.className) && przycisk.getClientRects().length > 0)
      .map((przycisk) => (przycisk.textContent ?? "").trim()),
  );
  expect(zielone).toEqual(["Zapisz lekcję"]);
}

/** Elementy z fokusem w karcie plików przy przechodzeniu klawiszem Tab — w kolejności ekranu (z góry na dół). */
async function kolejnoscFokusuWKarcie(page: Page): Promise<string[]> {
  await karta(page).getByRole("heading", { level: 2, name: "Pliki do tej lekcji", exact: true }).scrollIntoViewIfNeeded();
  await karta(page).getByRole("list", { name: "Pliki lekcji" }).getByRole("button").first().focus();
  const nazwy: string[] = [];
  const gory: number[] = [];
  for (let krok = 0; krok < 5; krok += 1) {
    const punkt = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element) return null;
      return {
        nazwa: (element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 300),
        gora: Math.round(element.getBoundingClientRect().top + window.scrollY),
      };
    });
    if (punkt === null) break;
    nazwy.push(punkt.nazwa);
    gory.push(punkt.gora);
    await page.keyboard.press("Tab");
  }
  expect(gory, "fokus idzie w dół ekranu").toEqual([...gory].sort((a, b) => a - b));
  return nazwy;
}

const OKNA = [
  { szerokosc: 1280, wysokosc: 800 },
  { szerokosc: 390, wysokosc: 844 },
];

for (const { szerokosc, wysokosc } of OKNA) {
  test.describe(`lista plików na stronie lekcji — ${szerokosc} px`, () => {
    test.skip(!GRUPY.edycjaLekcji.wlaczona, "grupa ekranu lekcji jest wyłączona");
    test.use({ viewport: { width: szerokosc, height: wysokosc } });

    test("wejście na lekcję z czterema plikami: wszystkie w liście z nazwą, typem, rozmiarem i „Usuń”; licznik = długość listy", async ({
      page,
    }, testInfo) => {
      const { odczytyListy } = await instalujAtrapy(page, { pliki: PLIKI_LEKCJI });
      await otworzLekcje(page);

      await expect(wiersze(page)).toHaveCount(4);
      await expect(karta(page).getByText("Ta lekcja ma 4 pliki.")).toBeVisible();
      await expect(wiersze(page).nth(0)).toContainText("porady-do-rozmowy.pdf");
      await expect(wiersze(page).nth(0)).toContainText(/PDF · 2.KB/);
      await expect(wiersze(page).nth(1)).toContainText(/PPTX · 1,0.MB/);
      await expect(wiersze(page).nth(2)).toContainText(DLUGA_NAZWA_PLIKU.slice(0, 40));
      await expect(wiersze(page).nth(3)).toContainText(/PNG · 512.B/);
      await expect(karta(page).getByRole("button", { name: /^Usuń plik / })).toHaveCount(4);
      await expect(page.getByText(/pojawi się tu/)).toHaveCount(0);
      await expect(page.getByText(/Wczytywanie listy plików/)).toHaveCount(0);
      expect(odczytyListy, "odczyt listy: dokładnie jedno GET, bez parametrów").toEqual(["/admin/lessons/22/materials"]);

      await zmierzStan(page);
      const fokus = await kolejnoscFokusuWKarcie(page);
      expect(fokus.slice(0, 5)).toEqual([
        "Usuń plik porady-do-rozmowy.pdf",
        "Usuń plik slajdy-z-warsztatu.pptx",
        `Usuń plik ${DLUGA_NAZWA_PLIKU}`,
        "Usuń plik mapa-pytan.png",
        expect.stringContaining("Dodaj plik"),
      ]);
      await sprawdzAxe(page, testInfo, `axe-lista-plikow-${szerokosc}`);
      await zrzut(page, `administracja--lekcja-edycja--lista-plikow--${szerokosc}`);
    });

    test("usunięcie i dodanie pliku odświeżają listę i licznik bez przeładowania; fokus nie ginie", async ({ page }, testInfo) => {
      const { zadania, odczytyListy } = await instalujAtrapy(page, { pliki: PLIKI_LEKCJI });
      await otworzLekcje(page);
      await expect(wiersze(page)).toHaveCount(4);
      await page.evaluate(() => {
        (window as unknown as { znacznikStrony?: string }).znacznikStrony = "ta-sama-strona";
      });

      // Usunięcie drugiego pliku: lista krótsza, licznik niższy, fokus na „Usuń” następnego wiersza.
      await page.getByRole("button", { name: "Usuń plik slajdy-z-warsztatu.pptx" }).click();
      const okno = page.getByRole("dialog", { name: "Usunąć plik „slajdy-z-warsztatu.pptx”?" });
      await expect(okno).toBeVisible();
      await sprawdzAxe(page, testInfo, `axe-lista-plikow-okno-usuniecia-${szerokosc}`);
      await okno.getByRole("button", { name: "Usuń plik" }).click();
      await expect(wiersze(page)).toHaveCount(3);
      await expect(karta(page).getByText("Ta lekcja ma 3 pliki.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Usuń plik slajdy-z-warsztatu.pptx" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: `Usuń plik ${DLUGA_NAZWA_PLIKU}` })).toBeFocused();

      // Dodanie pliku: wiersz na końcu listy, licznik wyżej.
      await karta(page)
        .locator("input[type='file']")
        .setInputFiles({ name: "nowa-karta.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-") });
      await expect(wiersze(page)).toHaveCount(4);
      await expect(wiersze(page).last()).toContainText("nowa-karta.pdf");
      await expect(karta(page).getByText("Ta lekcja ma 4 pliki.")).toBeVisible();

      // Usunięcie ostatniego wiersza: fokus na zdaniu licznika.
      await page.getByRole("button", { name: "Usuń plik nowa-karta.pdf" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Usuń plik" }).click();
      await expect(wiersze(page)).toHaveCount(3);
      const zdanie = karta(page).getByText("Ta lekcja ma 3 pliki.");
      await expect(zdanie).toBeVisible();
      expect(await zdanie.evaluate((wezel) => wezel.parentElement === document.activeElement)).toBe(true);

      await zmierzStan(page);
      expect(await page.evaluate(() => (window as unknown as { znacznikStrony?: string }).znacznikStrony)).toBe("ta-sama-strona");
      expect(odczytyListy, "po dodaniu i usunięciu lista nie jest czytana ponownie").toHaveLength(1);
      expect(zadania.filter((zadanie) => zadanie.startsWith("DELETE"))).toEqual([
        "DELETE /admin/materials/72",
        "DELETE /admin/materials/500",
      ]);
      expect(zadania.filter((zadanie) => zadanie.startsWith("POST"))).toEqual(["POST /admin/lessons/22/materials"]);
    });

    test("lekcja bez plików: zdanie stanu pustego, bez listy; axe", async ({ page }, testInfo) => {
      await instalujAtrapy(page, { pliki: [] });
      await otworzLekcje(page);

      await expect(karta(page).getByText("Ta lekcja nie ma jeszcze plików.")).toBeVisible();
      await expect(karta(page).getByRole("list", { name: "Pliki lekcji" })).toHaveCount(0);
      await expect(karta(page).getByRole("alert")).toHaveCount(0);
      await zmierzStan(page);
      await sprawdzAxe(page, testInfo, `axe-lista-plikow-pusta-${szerokosc}`);
    });

    test("błąd odczytu listy: zdanie bez kodu i trasy, dodawanie działa, „Spróbuj ponownie” wczytuje listę", async ({ page }, testInfo) => {
      const { odczytyListy } = await instalujAtrapy(page, { pliki: PLIKI_LEKCJI, bledneOdczyty: 1 });
      await otworzLekcje(page);

      const alarm = karta(page).getByRole("alert");
      await expect(alarm).toContainText("Nie udało się wczytać listy plików. Sprawdź połączenie i spróbuj ponownie.");
      await expect(alarm).not.toContainText(/\/admin|materials|500|SQL/);
      await expect(karta(page).getByText("Ta lekcja ma 4 pliki.")).toBeVisible();
      await expect(karta(page).getByRole("list", { name: "Pliki lekcji" })).toHaveCount(0);
      await zmierzStan(page);
      await sprawdzAxe(page, testInfo, `axe-lista-plikow-blad-odczytu-${szerokosc}`);
      await zrzut(page, `administracja--lekcja-edycja--lista-plikow-blad-odczytu--${szerokosc}`);

      // Dodawanie działa mimo błędu odczytu.
      await karta(page)
        .locator("input[type='file']")
        .setInputFiles({ name: "nowa-karta.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-") });
      await expect(wiersze(page)).toHaveCount(1);
      await expect(wiersze(page).first()).toContainText("nowa-karta.pdf");

      await alarm.getByRole("button", { name: "Spróbuj ponownie" }).click();
      await expect(wiersze(page)).toHaveCount(5);
      await expect(karta(page).getByRole("alert")).toHaveCount(0);
      await expect(karta(page).getByText("Ta lekcja ma 5 plików.")).toBeVisible();
      expect(odczytyListy).toEqual(["/admin/lessons/22/materials", "/admin/lessons/22/materials"]);
      await zmierzStan(page);
    });
  });
}
