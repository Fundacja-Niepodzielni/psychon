import { expect, test, type Page } from "@playwright/test";

/**
 * Spreparowany adres strony nie kieruje żądania z tokenem poza ścieżkę kursu.
 *
 * Stary ekran kursu administracji (`/admin/kursy/[id]`) wstawia parametr trasy
 * do ścieżki żądania bez żadnej kontroli kształtu (`api(`/admin/courses/${id}`)`).
 * Gdyby do ścieżki trafił segment `.. ` (kropki ze spacją na końcu), parser
 * adresów w przeglądarce usunąłby końcową spację i zwinął `..`, a żądanie z
 * tokenem poszłoby piętro wyżej niż `/admin/courses/`, pod `GET /api/v1/admin/`.
 *
 * Test liczy ŻĄDANIA SIECIOWE widziane przez przeglądarkę (`page.on("request")`),
 * nie wywołania funkcji: atrapa API odpowiada przez `page.route`, a każde żądanie,
 * które wyszło z przeglądarki do `localhost:8000`, jest zapisane. Zbudowana
 * aplikacja, bez prawdziwego backendu i bez prawdziwego logowania.
 *
 * Co zmierzono na zbudowanej aplikacji (nie założenie): ekran dostaje parametr
 * trasy jeszcze zakodowany, więc adres `/admin/kursy/..%20` daje żądanie
 * `GET /admin/courses/..%20` (jeden segment pod `/admin/courses/`, nigdzie wyżej),
 * a `/admin/kursy/%2e%2e%20` daje to samo po kanonizacji adresu przez przeglądarkę.
 * Zakodowany znak sterujący (`..%09`, `..%0A`) kontrola odrzuca, więc żądania o kurs
 * nie ma wcale. Dlatego ta próba pilnuje niezmiennika po stronie przeglądarki (żadne żądanie nie
 * wychodzi poza `/admin/courses/` i żadne nie niesie segmentu `.` ani `..`), ale
 * NIE odróżnia kodu z poprawką od kodu bez niej: tę różnicę pokazują próby
 * jednostkowe (`lib/api/__tests__/klient-straznik-*.test.ts`), które podają
 * kontroli zdekodowany napis z końcową spacją. Ta próba zaczerwieni się, gdy
 * aplikacja zacznie przekazywać ekranowi parametr zdekodowany, a kontrola go nie
 * zatrzyma.
 *
 * Kontrola dodatnia: poprawny identyfikator (`4`) daje żądanie `GET
 * /admin/courses/4`, a każda próba sprawdza też, że ekran w ogóle zapytał o kurs,
 * więc brak żądań poza kursem nie bierze się z tego, że ekran nic nie wysłał.
 */

const API = "http://localhost:8000/api/v1";

const ATRAPA_SESJI = {
  accessToken: "atrapa-tokenu-testowego",
  expiresAt: Date.now() + 3_600_000,
};

const META_PUSTA = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

function json(dane: unknown, meta?: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(meta === undefined ? { data: dane } : { data: dane, meta }),
  };
}

/** Atrapy API i zapis ścieżek żądań wysłanych do API (bez adresu bazowego). */
async function instalujAtrapy(page: Page): Promise<{ sciezki: string[] }> {
  const sciezki: string[] = [];
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
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json({ url: null })));
  return { sciezki };
}

/** Żądania spoza `/admin/courses/`, ale w obrębie administracji albo w korzeniu API: tam żądanie z kursu nigdy nie powinno trafić. */
function zadaniaPozaKursem(sciezki: string[]): string[] {
  return sciezki.filter(
    (sciezka) =>
      sciezka === "/" || sciezka === "/admin" || (sciezka.startsWith("/admin/") && !sciezka.startsWith("/admin/courses/")),
  );
}

/** Ścieżki z segmentem kropkowym (`.` albo `..`), także na końcu: parser zwinąłby je i żądanie zmieniłoby cel. */
function zadaniaZSegmentemKropkowym(sciezki: string[]): string[] {
  return sciezki.filter((sciezka) => /(^|\/)\.{1,2}(\/|$|\?)/.test(sciezka));
}

function zadaniaKursu(sciezki: string[]): string[] {
  return sciezki.filter((sciezka) => sciezka.startsWith("/admin/courses/"));
}

test.use({ viewport: { width: 1280, height: 900 } });

test.describe("spreparowany adres strony a żądanie do API", () => {
  test("kontrola dodatnia: poprawny identyfikator daje żądanie GET /admin/courses/4", async ({ page }) => {
    const { sciezki } = await instalujAtrapy(page);

    await page.goto("/admin/kursy/4", { waitUntil: "networkidle" });

    expect(sciezki, `żądania do API: ${JSON.stringify(sciezki)}`).toContain("/admin/courses/4");
  });

  // Adres wpisany w pasek; trzeci element: czy ekran ma wysłać żądanie o kurs (jeden segment pod
  // `/admin/courses/`), czy kontrola ma je odrzucić (zakodowany znak sterujący w ścieżce).
  const SPREPAROWANE: Array<[string, string, boolean]> = [
    ["/admin/kursy/..%20", "kropki ze spacją (spacja zakodowana)", true],
    ["/admin/kursy/%2e%2e%20", "kropki zakodowane ze spacją", true],
    ["/admin/kursy/%2E%2E%20", "kropki zakodowane wielką literą ze spacją", true],
    ["/admin/kursy/.%2e%20", "kropka i zakodowana kropka ze spacją", true],
    ["/admin/kursy/.%20", "pojedyncza kropka ze spacją", true],
    ["/admin/kursy/%2e%20", "zakodowana pojedyncza kropka ze spacją", true],
    ["/admin/kursy/..%09", "kropki z tabulatorem: kontrola odrzuca, zero żądań o kurs", false],
    ["/admin/kursy/..%0A", "kropki ze znakiem nowego wiersza: kontrola odrzuca, zero żądań o kurs", false],
    // Końcowa kropka (nie spacja): parser jej nie przycina ani nie zwija, segment zostaje cały.
    ["/admin/kursy/...", "trzy kropki", true],
    ["/admin/kursy/x.", "segment z końcową kropką", true],
  ];

  for (const [adres, opis, wysyla] of SPREPAROWANE) {
    test(`${adres} (${opis}) — żadne żądanie do API nie wychodzi poza /admin/courses/ i nie niesie segmentu kropkowego`, async ({
      page,
    }) => {
      const { sciezki } = await instalujAtrapy(page);

      await page.goto(adres, { waitUntil: "networkidle" });

      const opisZadan = `żądania do API: ${JSON.stringify(sciezki)}`;
      if (wysyla) {
        expect(zadaniaKursu(sciezki).length, `ekran nie zapytał o kurs — próba byłaby pusta; ${opisZadan}`).toBeGreaterThan(0);
      } else {
        expect(zadaniaKursu(sciezki), `kontrola miała odrzucić żądanie o kurs; ${opisZadan}`).toEqual([]);
      }
      expect(zadaniaPozaKursem(sciezki), opisZadan).toEqual([]);
      expect(zadaniaZSegmentemKropkowym(sciezki), opisZadan).toEqual([]);
    });
  }
});
