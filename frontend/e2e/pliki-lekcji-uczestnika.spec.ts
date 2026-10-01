import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";

/**
 * Pliki do pobrania na ekranie lekcji uczestnika (`/nowy-front/lekcja/[id]`),
 * na zbudowanej aplikacji, z atrapą API i atrapą sesji (żadne żądanie nie
 * wychodzi poza przeglądarkę). Kurs lekcji pochodzi wyłącznie z parametru
 * adresu `?kurs=<slug>`. Cztery stany na 1280 i 390 px:
 *  - kurs w adresie, lekcja z dwoma plikami (jeden o długiej nazwie bez spacji);
 *  - kurs w adresie, lekcja bez plików (karta nie zajmuje miejsca);
 *  - brak parametru kursu albo parametr o złym kształcie (zero zapytań o kurs);
 *  - wygasły link pobrania: odświeżenie danych kursu i jedna ponowna próba.
 * W każdym: jeden `main`, brak przewijania poziomego, cele dotyku w karcie co
 * najmniej 44 px, axe (WCAG 2.1 AA i `best-practice`) = 0. Zrzuty całej strony
 * powstają tylko przy ustawionej zmiennej `PW_ZRZUTY`.
 */

const API = "http://localhost:8000/api/v1";
const SLUG = "wywiad-psychologiczny";
const META = { current_page: 1, per_page: 100, total: 0, last_page: 1 };
const ATRAPA_SESJI = {
  accessToken: ["atrapa", "tokenu", "testowego"].join("-"),
  expiresAt: Date.now() + 3_600_000,
};

const DLUGA_NAZWA = `karta_pracy_do_lekcji_o_pytaniach_otwartych_i_zamknietych_${"wersja_poprawiona_".repeat(5)}2026.pdf`;

const LEKCJA = {
  id: 21,
  title: "Wprowadzenie do wywiadu",
  description: "Kiedy pytać otwarcie, a kiedy zamknąć pytanie.",
  content: "## Cel lekcji\n\nPo tej lekcji rozróżniasz pytania otwarte i zamknięte.",
  topic: { id: 7, title: "Rozmowa", position: 1 },
  duration_seconds: 1800,
  position_seconds: 0,
  watched_seconds: 812,
  active_seconds: 700,
  is_completed: false,
  completable: false,
  completable_at_percent: 60,
};

function material(id: number, name: string, lesson_id: number | null, wersjaLinku = "stary") {
  return {
    id,
    name,
    size: 245760 + id * 1000,
    lesson_id,
    download_url: `${API}/materials/${id}/download?signature=${wersjaLinku}`,
  };
}

interface Opcje {
  /** Pliki w odpowiedzi kursu (domyślnie: dwa pliki lekcji 21, jeden lekcji 22, jeden plik kursu). */
  materialy?: ReturnType<typeof material>[];
  /** Które linki pobrania serwer przyjmuje (reszta dostaje 403 `link_expired`). */
  waznyPodpis?: string;
}

interface Atrapa {
  zapytaniaOKurs: string[];
}

function json(dane: unknown, status = 200, meta?: unknown) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }),
  };
}

async function instalujAtrapy(page: Page, opcje: Opcje = {}): Promise<Atrapa> {
  const atrapa: Atrapa = { zapytaniaOKurs: [] };
  let odczytyKursu = 0;
  const materialy = opcje.materialy ?? [
    material(1, "Karta pracy.pdf", 21),
    material(2, DLUGA_NAZWA, 21),
    material(3, "Slajdy drugiej lekcji.pdf", 22),
    material(4, "Regulamin kursu.pdf", null),
  ];

  await page.route(`${API}/**`, (route) => route.fulfill(json([], 200, META)));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(json({ id: 1, role: "volunteer", first_name: "Marta", program_completed_at: null })),
  );
  await page.route(`${API}/notifications**`, (route) =>
    route.fulfill(json([], 200, { ...META, extra: { unread: 0 } })),
  );
  await page.route(`${API}/lessons/21`, (route) => route.fulfill(json(LEKCJA)));
  await page.route(`${API}/lessons/21/progress`, (route) =>
    route.fulfill(json({ watched_seconds: 812, active_seconds: 700, completable: false, completable_at_percent: 60 })),
  );
  await page.route(`${API}/lessons/21/video-link`, (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: { status: 404, code: "video_missing", message: "Brak nagrania." } }),
    }),
  );
  await page.route(`${API}/courses/**`, (route) => {
    const sciezka = new URL(route.request().url()).pathname.replace("/api/v1", "");
    atrapa.zapytaniaOKurs.push(sciezka);
    odczytyKursu += 1;
    // Każdy kolejny odczyt kursu niesie świeże linki pobrania (podpis „nowy”).
    const wersja = odczytyKursu > 1 ? "nowy" : "stary";
    return route.fulfill(
      json({
        id: 2,
        slug: SLUG,
        title: "Wywiad psychologiczny",
        status: "in_progress",
        progress_percent: 40,
        lessons: [
          { id: 21, title: LEKCJA.title, sequence_order: 1, duration_seconds: 1800, is_completed: false, topic_id: 7 },
          { id: 22, title: "Pytania otwarte i zamknięte", sequence_order: 2, duration_seconds: 1500, is_completed: false, topic_id: 7 },
        ],
        materials: materialy.map((plik) => ({ ...plik, download_url: plik.download_url.replace(/signature=\w+/, `signature=${wersja}`) })),
      }),
    );
  });
  await page.route(`${API}/materials/*/download**`, (route) => {
    const podpis = new URL(route.request().url()).searchParams.get("signature");
    if (podpis !== (opcje.waznyPodpis ?? "stary")) {
      return route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: { status: 403, code: "link_expired", message: "Ten link do pobrania już wygasł." } }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: "%PDF-1.4 atrapa",
    });
  });
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json({ url: null })));
  return atrapa;
}

async function otworzLekcje(page: Page, zapytanie: string): Promise<void> {
  const odpowiedz = await page.goto(`/nowy-front/lekcja/21${zapytanie}`);
  expect(odpowiedz?.status()).toBe(200);
  await zabezpieczeniePrzedEkranemDostepu(page);
  await expect(page.getByRole("heading", { level: 1, name: LEKCJA.title })).toBeVisible();
}

function karta(page: Page) {
  return page.getByRole("region", { name: "Pliki do pobrania" });
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

/** Jeden `main`, brak przewijania poziomego (z listą elementów wystających poza okno w komunikacie błędu). */
async function zmierzUklad(page: Page): Promise<void> {
  await expect(page.locator("main")).toHaveCount(1);
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

/** Cele dotyku w karcie plików: każdy widoczny element czynny ma co najmniej 44 px w obu wymiarach. */
async function zmierzCeleKarty(page: Page): Promise<void> {
  const zaMale = await karta(page).evaluate((korzen) =>
    Array.from(korzen.querySelectorAll<HTMLElement>("a[href], button, [role='button']"))
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const ramka = element.getBoundingClientRect();
        return {
          nazwa: (element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 60),
          wysokosc: Math.round(ramka.height * 10) / 10,
          szerokosc: Math.round(ramka.width * 10) / 10,
        };
      })
      .filter((cel) => cel.wysokosc < 44 || cel.szerokosc < 44),
  );
  expect(zaMale, "cele dotyku w karcie plików poniżej 44 px").toEqual([]);
}

const OKNA = [
  { szerokosc: 1280, wysokosc: 800 },
  { szerokosc: 390, wysokosc: 844 },
];

for (const { szerokosc, wysokosc } of OKNA) {
  test.describe(`pliki do pobrania na ekranie lekcji — ${szerokosc} px`, () => {
    test.use({ viewport: { width: szerokosc, height: wysokosc } });

    test("kurs w adresie, dwa pliki lekcji (jeden o długiej nazwie bez spacji): karta tylko z plikami tej lekcji", async ({ page }, testInfo) => {
      const atrapa = await instalujAtrapy(page);
      await otworzLekcje(page, `?kurs=${SLUG}`);

      await expect(karta(page)).toBeVisible();
      await expect(karta(page).getByRole("heading", { level: 2, name: "Pliki do pobrania" })).toBeVisible();
      await expect(karta(page).getByRole("listitem")).toHaveCount(2);
      await expect(karta(page).getByText(DLUGA_NAZWA, { exact: true })).toBeVisible();
      await expect(karta(page).getByRole("button", { name: `Pobierz plik: ${DLUGA_NAZWA}` })).toBeVisible();
      await expect(karta(page).getByRole("button", { name: "Pobierz plik: Karta pracy.pdf" })).toBeVisible();
      await expect(page.getByText("Slajdy drugiej lekcji.pdf")).toHaveCount(0);
      await expect(page.getByText("Regulamin kursu.pdf")).toHaveCount(0);
      await expect(page.getByText(/materiałów do pobrania/)).toHaveCount(0);
      expect(atrapa.zapytaniaOKurs).toEqual([`/courses/${SLUG}`]);

      await zmierzUklad(page);
      await zmierzCeleKarty(page);
      await karta(page).scrollIntoViewIfNeeded();
      await sprawdzAxe(page, testInfo, `axe-lekcja-z-plikami-${szerokosc}`);
      await zrzut(page, `lekcja-z-plikami-${szerokosc}`);
    });

    test("kurs w adresie, lekcja bez plików: karty nie ma, nie ma zdania zastępczego", async ({ page }, testInfo) => {
      const atrapa = await instalujAtrapy(page, { materialy: [material(3, "Slajdy drugiej lekcji.pdf", 22), material(4, "Regulamin kursu.pdf", null)] });
      await otworzLekcje(page, `?kurs=${SLUG}`);

      await expect.poll(() => atrapa.zapytaniaOKurs.length).toBe(1);
      await expect(karta(page)).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Pliki do pobrania" })).toHaveCount(0);
      await expect(page.getByText(/materiałów do pobrania/)).toHaveCount(0);
      await expect(page.getByText(/widoku/)).toHaveCount(0);

      await zmierzUklad(page);
      await sprawdzAxe(page, testInfo, `axe-lekcja-bez-plikow-${szerokosc}`);
      await zrzut(page, `lekcja-bez-plikow-${szerokosc}`);
    });

    test("bez parametru kursu albo z parametrem o złym kształcie: zero zapytań o kurs, karty nie ma", async ({ page }) => {
      const atrapa = await instalujAtrapy(page);

      await otworzLekcje(page, "");
      await expect(page.getByRole("heading", { name: "Pliki do pobrania" })).toHaveCount(0);
      await zmierzUklad(page);

      await otworzLekcje(page, "?kurs=Zly%20Kurs%2F..%2Fme");
      await expect(page.getByRole("heading", { name: "Pliki do pobrania" })).toHaveCount(0);
      await zmierzUklad(page);

      expect(atrapa.zapytaniaOKurs).toEqual([]);
    });

    test("wygasły link: odświeżenie danych kursu i jedna ponowna próba kończą się pobraniem pliku", async ({ page }) => {
      // Serwer przyjmuje już tylko linki z podpisem „nowy”; pierwszy odczyt kursu niósł „stary”.
      const atrapa = await instalujAtrapy(page, { waznyPodpis: "nowy" });
      await otworzLekcje(page, `?kurs=${SLUG}`);
      await expect(karta(page)).toBeVisible();

      const pobranie = page.waitForEvent("download");
      await karta(page).getByRole("button", { name: "Pobierz plik: Karta pracy.pdf" }).click();
      expect((await pobranie).suggestedFilename()).toBe("Karta pracy.pdf");

      expect(atrapa.zapytaniaOKurs).toEqual([`/courses/${SLUG}`, `/courses/${SLUG}`]);
      await expect(karta(page).getByRole("alert")).toHaveCount(0);
    });

    test("link wygasły także po odświeżeniu: zdanie błędu przy pliku, ekran lekcji cały", async ({ page }, testInfo) => {
      // Żaden podpis nie jest przyjmowany: po jednej ponownej próbie zostaje zdanie przy pliku.
      const atrapa = await instalujAtrapy(page, { waznyPodpis: "zaden" });
      await otworzLekcje(page, `?kurs=${SLUG}`);
      await expect(karta(page)).toBeVisible();

      await karta(page).getByRole("button", { name: "Pobierz plik: Karta pracy.pdf" }).click();

      const zdanie = karta(page).getByRole("alert");
      await expect(zdanie).toHaveText(/Nie udało się pobrać pliku\. Spróbuj ponownie za chwilę\./);
      await expect(karta(page).getByRole("listitem").nth(0).getByRole("alert")).toHaveCount(1);
      await expect(karta(page).getByRole("listitem").nth(1).getByRole("alert")).toHaveCount(0);
      await expect(page.getByRole("heading", { level: 1, name: LEKCJA.title })).toBeVisible();
      expect(atrapa.zapytaniaOKurs).toEqual([`/courses/${SLUG}`, `/courses/${SLUG}`]);

      await zmierzUklad(page);
      await zmierzCeleKarty(page);
      await sprawdzAxe(page, testInfo, `axe-lekcja-blad-pobrania-${szerokosc}`);
      await zrzut(page, `lekcja-blad-pobrania-${szerokosc}`);
    });
  });
}
