import { expect, test, type Page } from "@playwright/test";

/**
 * Adres strony kursu administracji (`/admin/kursy/[id]`) a żądania do API.
 *
 * Ekran kursu zamienia treść tylko dla identyfikatora liczbowego (`^[0-9]+$`,
 * `czyPoprawnyIdentyfikator`, tak jak trasa serwera `whereNumber('course')`).
 * Dla każdego innego identyfikatora nie wysyła ŻADNEGO żądania o kurs i pokazuje
 * stan błędu ekranu kursu; ramka panelu wysyła swoje własne żądania niezależnie od
 * adresu strony.
 *
 * Próba liczy ŻĄDANIA SIECIOWE widziane przez przeglądarkę (`page.on("request")`),
 * nie wywołania funkcji: atrapa API odpowiada przez `page.route`, a każde żądanie,
 * które wyszło z przeglądarki do `localhost:8000`, jest zapisane (także spoza
 * `/api/v1`). Zbudowana aplikacja, bez prawdziwego backendu i bez prawdziwego logowania.
 *
 * Dla adresu nieliczbowego wynik jest bezpieczny wyłącznie wtedy, gdy:
 *  - nie wyszło żadne żądanie o kurs (`/admin/courses/…`, `/admin/courses?…`), w żadnej postaci,
 *    także wysłane z opóźnieniem do `OKNO_CISZY_MS` po narysowaniu stanu błędu;
 *  - poza tłem ramki panelu (`ZADANIA_RAMKI`: żądania zmierzone w kontroli dodatniej)
 *    nie wyszło żadne inne żądanie;
 *  - żadne żądanie nie niesie segmentu kropkowego (`.` ani `..`);
 *  - ekran kursu się narysował: nagłówek „Kurs <id>” i komunikat „Nie udało się
 *    wczytać kursu”. Sama ramka panelu to za mało, żeby uznać, że ekran działa.
 *
 * Kontrola dodatnia: poprawny identyfikator (`4`) z atrapą prawdziwego kursu daje
 * `GET /admin/courses/4`, widoczny nagłówek kursu, a żadna ścieżka nie niesie
 * `undefined` ani `NaN`. Kontrolę kształtu identyfikatora sprawdzają też próby
 * jednostkowe (`nowy-front/kurs-publikacja/__tests__/dane-administracji.test.ts`,
 * `lib/api/__tests__/klient-straznik-*.test.ts`).
 */

const ORIGIN = "http://localhost:8000";
const API = `${ORIGIN}/api/v1`;

const ATRAPA_SESJI = {
  accessToken: "atrapa-tokenu-testowego",
  expiresAt: Date.now() + 3_600_000,
};

const META_PUSTA = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

/**
 * Żądania ramki panelu administracji (karta osoby, rok programu, dzwonek powiadomień),
 * zmierzone w kontroli dodatniej; nie zależą od identyfikatora w adresie.
 */
const ZADANIA_RAMKI: readonly string[] = ["/me", "/notifications?per_page=20", "/admin/edition"];

/** Żądanie o kurs w każdej postaci: `/admin/courses/…`, `/admin/courses?…` albo sam `/admin/courses`. */
const ZADANIE_O_KURS = /^\/admin\/courses(?:[/?#]|$)/;

/** Najdłuższy czas oczekiwania na nagłówek stanu ekranu kursu; po nim przypadek pada na asercji ekranu. */
const LIMIT_EKRANU_MS = 10_000;

/**
 * Okno ciszy po narysowaniu nagłówka stanu: próba czeka tyle, zanim zliczy żądania, żeby
 * zobaczyć także żądanie wysłane z opóźnieniem po narysowaniu stanu błędu (ponowienie,
 * licznik, efekt uboczny). Granica: żądanie wysłane później niż `OKNO_CISZY_MS` po
 * narysowaniu nagłówka nie jest widziane przez próbę.
 */
const OKNO_CISZY_MS = 3000;

const TYTUL_KURSU = "Wywiad psychologiczny";

function json(dane: unknown, meta?: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(meta === undefined ? { data: dane } : { data: dane, meta }),
  };
}

const KURS = {
  id: 4,
  title: TYTUL_KURSU,
  slug: "wywiad-psychologiczny",
  description: "Jak prowadzić pierwszą rozmowę.",
  type: "course",
  product_group: "psychon",
  sequence_order: 2,
  edition_id: 1,
  is_published: false,
  lessons_count: 2,
  materials_count: 0,
  created_at: "2026-09-01T08:00:00Z",
  updated_at: "2026-09-01T08:00:00Z",
  publication_gaps: { blocking: [], waiting: [] },
};

function lekcja(id: number, title: string, pozycja: number) {
  return {
    id,
    course_id: 4,
    title,
    description: null,
    content: null,
    sequence_order: pozycja,
    topic_id: 7,
    topic_position: pozycja,
    video_provider_id: `wideo-${id}`,
    duration_seconds: 1500,
    materials_count: 0,
    created_at: null,
    updated_at: null,
    video_status: "ready",
    video_status_at: "2026-10-01T12:00:00Z",
    video_ready: true,
    video_pending: false,
  };
}

const LEKCJE = [lekcja(21, "Wprowadzenie do wywiadu", 1), lekcja(22, "Pytania otwarte i zamknięte", 2)];
const TEMATY = [{ id: 7, course_id: 4, title: "Podstawy", position: 1, lesson_ids: [21, 22], created_at: null, updated_at: null }];

/**
 * Atrapy API i zapis ścieżek żądań wysłanych do `localhost:8000`. Ścieżki spod
 * `/api/v1` są zapisane bez adresu bazowego; żądanie spoza `/api/v1` dostaje
 * przedrostek `!`, więc nigdy nie wygląda jak tło ramki ani jak żądanie o kurs.
 * Z atrapą kursu (`zKursem`) trasy kursu `4` zwracają prawdziwe dane.
 */
async function instalujAtrapy(page: Page, zKursem = false): Promise<{ sciezki: string[] }> {
  const sciezki: string[] = [];
  page.on("request", (zadanie) => {
    const adres = zadanie.url();
    if (adres.startsWith(`${API}/`) || adres === API) sciezki.push(adres.slice(API.length));
    else if (adres.startsWith(ORIGIN)) sciezki.push(`!${adres.slice(ORIGIN.length)}`);
  });

  // Ogólna atrapa jest rejestrowana PIERWSZA: Playwright wybiera trasę zarejestrowaną później jako pierwszą.
  await page.route(`${API}/**`, (route) => route.fulfill(json([], META_PUSTA)));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(json({ id: 1, role: "project_manager", first_name: "Anna", program_completed_at: null })),
  );
  await page.route(`${API}/notifications**`, (route) =>
    route.fulfill(json([], { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { unread: 0 } })),
  );
  if (zKursem) {
    await page.route(`${API}/admin/courses/4`, (route) => route.fulfill(json(KURS)));
    await page.route(`${API}/admin/courses/4/lessons`, (route) => route.fulfill(json(LEKCJE)));
    await page.route(`${API}/admin/courses/4/topics`, (route) => route.fulfill(json(TEMATY)));
    await page.route(`${API}/admin/courses/4/assignments`, (route) =>
      route.fulfill(
        json([{ id: 1, course_id: 4, lesson_id: null, instructor: { id: 5, first_name: "Joanna", last_name: "Demo" } }]),
      ),
    );
    await page.route(`${API}/admin/courses/4/tests`, (route) =>
      route.fulfill(json({ id: 31, course_id: 4, pass_threshold: 80, attempts_limit: 3, question_count: 2 })),
    );
  }
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json({ url: null })));
  return { sciezki };
}

function zadaniaKursu(sciezki: string[]): string[] {
  return sciezki.filter((sciezka) => ZADANIE_O_KURS.test(sciezka));
}

/** Żądania spoza kursu i spoza tła ramki panelu: z adresu strony nie powinno wyjść żadne. */
function zadaniaPozaTlem(sciezki: string[]): string[] {
  return sciezki.filter((sciezka) => !ZADANIE_O_KURS.test(sciezka) && !ZADANIA_RAMKI.includes(sciezka));
}

/** Ścieżki z segmentem kropkowym (`.` albo `..`), także na końcu: parser zwinąłby je i żądanie zmieniłoby cel. */
function zadaniaZSegmentemKropkowym(sciezki: string[]): string[] {
  return sciezki.filter((sciezka) => /(^|\/)\.{1,2}(\/|$|\?)/.test(sciezka));
}

/** Ścieżki z napisem, który zdradza nieustalony identyfikator (`undefined`, `NaN`). */
function zadaniaZNieustalonymId(sciezki: string[]): string[] {
  return sciezki.filter((sciezka) => /undefined|NaN/.test(sciezka));
}

test.use({ viewport: { width: 1280, height: 900 } });

test.describe("spreparowany adres strony a żądanie do API", () => {
  test("kontrola dodatnia: poprawny identyfikator i prawdziwy kurs dają GET /admin/courses/4 i nagłówek kursu", async ({
    page,
  }) => {
    const { sciezki } = await instalujAtrapy(page, true);

    await page.goto("/admin/kursy/4", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { level: 1, name: TYTUL_KURSU })).toBeVisible();
    await expect(page.getByText("Coś poszło nie tak")).toHaveCount(0);
    const opisZadan = `żądania do API: ${JSON.stringify(sciezki)}`;
    expect(sciezki, opisZadan).toContain("/admin/courses/4");
    expect(sciezki, opisZadan).toContain("/admin/edition");
    expect(zadaniaZNieustalonymId(sciezki), `żądanie z nieustalonym identyfikatorem; ${opisZadan}`).toEqual([]);
    expect(zadaniaPozaTlem(sciezki), `ramka panelu wysłała żądanie spoza znanego tła; ${opisZadan}`).toEqual([]);
  });

  // Adres wpisany w pasek.
  const SPREPAROWANE: Array<[string, string]> = [
    ["/admin/kursy/..%20", "kropki ze spacją (spacja zakodowana)"],
    ["/admin/kursy/%2e%2e%20", "kropki zakodowane ze spacją"],
    ["/admin/kursy/%2E%2E%20", "kropki zakodowane wielką literą ze spacją"],
    ["/admin/kursy/.%2e%20", "kropka i zakodowana kropka ze spacją"],
    ["/admin/kursy/.%20", "pojedyncza kropka ze spacją"],
    ["/admin/kursy/%2e%20", "zakodowana pojedyncza kropka ze spacją"],
    ["/admin/kursy/..%09", "kropki z tabulatorem"],
    ["/admin/kursy/..%0A", "kropki ze znakiem nowego wiersza"],
    ["/admin/kursy/...", "trzy kropki"],
    ["/admin/kursy/x.", "segment z końcową kropką"],
  ];

  for (const [adres, opis] of SPREPAROWANE) {
    test(`${adres} (${opis}) — zero żądań o kurs, żadne żądanie nie wychodzi poza tło ramki i nie niesie segmentu kropkowego`, async ({
      page,
    }) => {
      // Zbieranie żądań startuje tu, przed wejściem na stronę (`page.on("request")` w `instalujAtrapy`).
      const { sciezki } = await instalujAtrapy(page);

      await page.goto(adres, { waitUntil: "networkidle" });

      // Brak ekranu kursu pada tu, w 10 s, na asercji ekranu, a nie na limicie całego przypadku.
      await expect(
        page.getByRole("heading", { level: 1, name: /^Kurs / }),
        "ekran kursu się nie narysował (brak nagłówka „Kurs <id>” w 10 s)",
      ).toBeVisible({ timeout: LIMIT_EKRANU_MS });

      // Okno ciszy: żądania wysłane z opóźnieniem po narysowaniu stanu błędu też są zliczone.
      await page.waitForTimeout(OKNO_CISZY_MS);

      const opisZadan = `żądania do API: ${JSON.stringify(sciezki)}`;
      expect(zadaniaKursu(sciezki), `żądanie o kurs (/admin/courses/… albo /admin/courses?…) przy nieliczbowym adresie; ${opisZadan}`).toEqual([]);
      expect(zadaniaPozaTlem(sciezki), `żądanie spoza kursu i spoza tła ramki; ${opisZadan}`).toEqual([]);
      expect(zadaniaZSegmentemKropkowym(sciezki), `segment kropkowy w żądaniu; ${opisZadan}`).toEqual([]);
      await expect(page.getByText("Nie udało się wczytać kursu"), "ekran kursu nie pokazał stanu błędu").toBeVisible({
        timeout: LIMIT_EKRANU_MS,
      });
    });
  }
});
