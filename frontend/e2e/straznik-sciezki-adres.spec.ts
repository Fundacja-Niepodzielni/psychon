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
 * nie wywołania funkcji: atrapa API odpowiada przez `page.route`, a rejestr zapisuje
 * KAŻDE żądanie strony od wejścia, bez filtra hosta (api, własny origin frontu, każdy
 * inny origin). Zbudowana aplikacja, bez prawdziwego backendu i bez prawdziwego logowania.
 *
 * Każde żądanie jest rozbite przez `new URL(...)` na metodę, origin i ścieżkę i porównywane
 * DOKŁADNIE (równość trójki metoda + origin + pathname z listą), bez `includes`, `startsWith`
 * i wyrażeń częściowych na adresie; ta sama ścieżka z inną metodą nie jest dozwolona. Ścieżka
 * jest przed wyrażeniem o kurs porównywana w postaci zdekodowanej do stabilizacji (najwyżej
 * `MAKS_DEKODOWAN` razy; błędne kodowanie albo niestabilna ścieżka = żądanie odrzucone), więc
 * `/admin/%63ourses/…` jest tym samym żądaniem o kurs co `/admin/courses/…`. Jedyny wyjątek od
 * porównania dokładnego to przedrostek zasobów statycznych własnego frontu (patrz
 * `PRZEDROSTKI_ZASOBOW_FRONTU`).
 *
 * Dla adresu nieliczbowego wynik jest bezpieczny wyłącznie wtedy, gdy:
 *  - nie wyszło żadne żądanie o kurs (ścieżka z `/admin/courses`, na KAŻDYM originie
 *    i w każdej postaci), także wysłane z opóźnieniem do `OKNO_CISZY_MS` po narysowaniu
 *    stanu błędu;
 *  - poza dozwolonymi żądaniami (tło ramki panelu, dokument strony i zasoby statyczne
 *    własnego frontu, zmierzone w kontroli dodatniej) nie wyszło żadne inne żądanie;
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
const PRZEDROSTEK_API = "/api/v1";

const ATRAPA_SESJI = {
  accessToken: "atrapa-tokenu-testowego",
  expiresAt: Date.now() + 3_600_000,
};

const META_PUSTA = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

/**
 * Trójka metoda + origin + pathname jako jeden klucz; metoda nie zawiera spacji, a origin
 * nie niesie ścieżki, więc złączenie jest jednoznaczne.
 */
function klucz(metoda: string, origin: string, pathname: string): string {
  return `${metoda} ${origin}${pathname}`;
}

/**
 * Żądania ramki panelu administracji (karta osoby, rok programu, dzwonek powiadomień),
 * zmierzone w kontroli dodatniej (wszystkie to `GET` typu `fetch`); nie zależą od
 * identyfikatora w adresie. Porównanie: równość trójki metoda + origin + pathname
 * (zapytanie nie jest porównywane). Inna metoda na tym samym adresie (np. `PATCH`
 * na `/admin/edition`) nie jest dozwolona.
 */
const ZADANIA_RAMKI: ReadonlySet<string> = new Set(
  [
    ["GET", "/me"],
    ["GET", "/notifications"],
    ["GET", "/admin/edition"],
  ].map(([metoda, sciezka]) => klucz(metoda, ORIGIN, `${PRZEDROSTEK_API}${sciezka}`)),
);

/**
 * Żądania, które ramka panelu i stopka wysyłają do WŁASNEGO originu frontu, zmierzone w
 * biegu (wszystkie to `GET`): odczyt sesji i podglądy tras ze stopki (`?_rsc=…` z losowym
 * zapytaniem, więc porównywana jest sama ścieżka). Origin frontu to origin `baseURL` biegu.
 * To dokładne trójki metoda + ścieżka, nie przedrostki: żądanie o kurs, inna metoda ani
 * żadna inna ścieżka frontu się nie zmieści.
 */
const ZADANIA_FRONTU: ReadonlyArray<readonly [string, string]> = [
  ["GET", "/api/auth/session"],
  ["GET", "/dokumenty-prawne/regulamin"],
  ["GET", "/dokumenty-prawne/polityka"],
  ["GET", "/deklaracja-dostepnosci"],
];

/**
 * Zasoby statyczne zbudowanej aplikacji, pobierane z własnego originu frontu przy
 * każdym wejściu na stronę: skrypty i arkusze z `/_next/static/` oraz czcionki z `/fonts/`
 * (zmierzone: 15 skryptów i 3 arkusze o nazwach z sumą kontrolną, które zmieniają się
 * z każdym budowaniem, więc nie da się ich wypisać z nazwy). Przedrostek dotyczy
 * wyłącznie originu frontu, metody GET i typów zasobu `TYPY_ZASOBOW_STATYCZNYCH` (żądanie
 * `fetch` pod tym przedrostkiem nie jest zasobem statycznym) i nigdy nie obejmuje
 * ścieżki o kurs: ta jest odrzucana wcześniej, na każdym originie i w postaci zdekodowanej.
 */
const PRZEDROSTKI_ZASOBOW_FRONTU: readonly string[] = ["/_next/static/", "/fonts/"];
const TYPY_ZASOBOW_STATYCZNYCH: readonly string[] = ["script", "stylesheet", "font", "image"];

/**
 * Żądanie o kurs w każdej postaci i na KAŻDYM originie: ścieżka niosąca `/admin/courses`
 * jako segment (`/api/v1/admin/courses/…`, `/admin/courses?…`, sam `/admin/courses`),
 * także gdy zapytanie ma w sobie dozwolony fragment. Sprawdzane po `new URL`, na ścieżce
 * w postaci ZNORMALIZOWANEJ (`znormalizujSciezke`), a nie surowej: `/admin/%63ourses/…`,
 * `%2563` i `%2F` są tym samym żądaniem o kurs co `/admin/courses/…`.
 */
const ZADANIE_O_KURS = /\/admin\/courses(?:\/|$)/i;

/** Ile razy ścieżka jest dekodowana, zanim uznamy, że się nie stabilizuje (zakodowana wielokrotnie ponad miarę). */
const MAKS_DEKODOWAN = 3;

/**
 * Ścieżka żądania w postaci znormalizowanej: dekodowana (`decodeURIComponent`) do stabilizacji,
 * najwyżej `MAKS_DEKODOWAN` razy. Zwraca `null` (żądanie odrzucane), gdy kodowanie jest błędne
 * (`URIError`) albo ścieżka po `MAKS_DEKODOWAN` dekodowaniach nadal się zmienia.
 */
function znormalizujSciezke(pathname: string): string | null {
  let biezaca = pathname;
  for (let i = 0; i < MAKS_DEKODOWAN; i += 1) {
    let dalej: string;
    try {
      dalej = decodeURIComponent(biezaca);
    } catch {
      return null;
    }
    if (dalej === biezaca) return biezaca;
    biezaca = dalej;
  }
  try {
    return decodeURIComponent(biezaca) === biezaca ? biezaca : null;
  } catch {
    return null;
  }
}

/** Czy żądanie jest o kurs (po normalizacji). Ścieżka, której nie da się znormalizować, nie jest tu „o kurs”: odrzuca ją `czyDozwolone`. */
function czyZadanieOKurs(pathname: string): boolean {
  const znormalizowana = znormalizujSciezke(pathname);
  return znormalizowana !== null && ZADANIE_O_KURS.test(znormalizowana);
}

/**
 * Trasy atrapy prawdziwego kursu `4`, jedyne żądania o kurs dozwolone w kontroli
 * dodatniej (dokładne trójki metoda + origin + pathname; wszystkie `GET`, zmierzone w biegu).
 */
const ZADANIA_KURSU_4: ReadonlySet<string> = new Set(
  ["/admin/courses/4", "/admin/courses/4/lessons", "/admin/courses/4/topics", "/admin/courses/4/assignments", "/admin/courses/4/tests"].map(
    (sciezka) => klucz("GET", ORIGIN, `${PRZEDROSTEK_API}${sciezka}`),
  ),
);

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

/** Jedno żądanie strony, rozbite przez `new URL(...)`. */
interface ZapisZadania {
  metoda: string;
  typ: string;
  origin: string;
  pathname: string;
  search: string;
}

/** Skrócony zapis do komunikatów asercji. */
function opis(zadanie: ZapisZadania): string {
  return `${zadanie.metoda} ${zadanie.typ} ${zadanie.origin}${zadanie.pathname}${zadanie.search}`;
}

interface Rejestr {
  /** Wszystkie żądania strony od wejścia, w kolejności wysłania, bez żadnego filtra. */
  zadania: ZapisZadania[];
}

/**
 * Atrapy API i rejestr WSZYSTKICH żądań strony (`page.on("request")` przed `page.goto`).
 * Atrapa odpowiada tylko na `localhost:8000/api/v1/**`; żądanie na inny origin nie dostaje
 * atrapy, ale i tak jest w rejestrze. Z atrapą kursu (`zKursem`) trasy kursu `4` zwracają
 * prawdziwe dane.
 */
async function instalujAtrapy(page: Page, zKursem = false): Promise<Rejestr> {
  const zadania: ZapisZadania[] = [];
  page.on("request", (zadanie) => {
    const adres = new URL(zadanie.url());
    zadania.push({
      metoda: zadanie.method(),
      typ: zadanie.resourceType(),
      origin: adres.origin,
      pathname: adres.pathname,
      search: adres.search,
    });
  });

  // Ogólna atrapa jest rejestrowana PIERWSZA: Playwright wybiera trasę zarejestrowaną później jako pierwszą.
  const API = `${ORIGIN}${PRZEDROSTEK_API}`;
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
  return { zadania };
}

/** Kontekst klasyfikacji: origin frontu (z `baseURL`) i ścieżka dokumentu, na który wchodzi próba. */
interface Kontekst {
  originFrontu: string;
  sciezkaDokumentu: string;
  /** Dodatkowe dokładne pary origin + pathname dozwolone w tym przypadku (kontrola dodatnia: trasy kursu `4`). */
  dodatkowe?: ReadonlySet<string>;
}

function kontekst(baseURL: string | undefined, adres: string, dodatkowe?: ReadonlySet<string>): Kontekst {
  if (baseURL === undefined) throw new Error("brak baseURL biegu: nie da się ustalić originu frontu");
  const wejscie = new URL(adres, baseURL);
  return { originFrontu: new URL(baseURL).origin, sciezkaDokumentu: wejscie.pathname, dodatkowe };
}

/** Czy żądanie jest na liście dozwolonych. Kolejność: dokładne wyjątki, ścieżka nienormalizowalna i żądanie o kurs (zawsze odmowa), listy (zawsze z metodą). */
function czyDozwolone(zadanie: ZapisZadania, ctx: Kontekst): boolean {
  const para = klucz(zadanie.metoda, zadanie.origin, zadanie.pathname);
  if (ctx.dodatkowe?.has(para)) return true;
  if (znormalizujSciezke(zadanie.pathname) === null) return false;
  if (czyZadanieOKurs(zadanie.pathname)) return false;
  if (ZADANIA_RAMKI.has(para)) return true;
  if (zadanie.origin !== ctx.originFrontu) return false;
  if (zadanie.metoda === "GET" && zadanie.typ === "document" && zadanie.pathname === ctx.sciezkaDokumentu) return true;
  if (ZADANIA_FRONTU.some(([metoda, sciezka]) => klucz(metoda, ctx.originFrontu, sciezka) === para)) return true;
  return (
    zadanie.metoda === "GET" &&
    TYPY_ZASOBOW_STATYCZNYCH.includes(zadanie.typ) &&
    PRZEDROSTKI_ZASOBOW_FRONTU.some((przedrostek) => zadanie.pathname.startsWith(przedrostek))
  );
}

/** Żądania o kurs, na dowolnym originie. */
function zadaniaKursu(rejestr: Rejestr): string[] {
  return rejestr.zadania.filter((zadanie) => czyZadanieOKurs(zadanie.pathname)).map(opis);
}

/** Żądania spoza listy dozwolonych (w tym każde żądanie o kurs, które nie jest wyjątkiem przypadku). */
function zadaniaZakazane(rejestr: Rejestr, ctx: Kontekst): string[] {
  return rejestr.zadania.filter((zadanie) => !czyDozwolone(zadanie, ctx)).map(opis);
}

/** Ścieżki z segmentem kropkowym (`.` albo `..`), także na końcu: parser zwinąłby je i żądanie zmieniłoby cel. */
function zadaniaZSegmentemKropkowym(rejestr: Rejestr): string[] {
  return rejestr.zadania
    .filter((zadanie) => /(^|\/)\.{1,2}(\/|$|\?)/.test(`${zadanie.pathname}${zadanie.search}`))
    .map(opis);
}

/** Żądania z napisem, który zdradza nieustalony identyfikator (`undefined`, `NaN`). */
function zadaniaZNieustalonymId(rejestr: Rejestr): string[] {
  return rejestr.zadania.filter((zadanie) => /undefined|NaN/.test(`${zadanie.pathname}${zadanie.search}`)).map(opis);
}

test.use({ viewport: { width: 1280, height: 900 } });

test.describe("spreparowany adres strony a żądanie do API", () => {
  test("kontrola dodatnia: poprawny identyfikator i prawdziwy kurs dają GET /admin/courses/4 i nagłówek kursu", async ({
    page,
    baseURL,
  }) => {
    const rejestr = await instalujAtrapy(page, true);
    const adres = "/admin/kursy/4";
    const ctx = kontekst(baseURL, adres, ZADANIA_KURSU_4);

    await page.goto(adres, { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { level: 1, name: TYTUL_KURSU })).toBeVisible();
    await expect(page.getByText("Coś poszło nie tak")).toHaveCount(0);
    const wyszly = new Set(rejestr.zadania.map((zadanie) => klucz(zadanie.metoda, zadanie.origin, zadanie.pathname)));
    const opisZadan = `żądań strony: ${rejestr.zadania.length}`;
    expect(wyszly.has(klucz("GET", ORIGIN, `${PRZEDROSTEK_API}/admin/courses/4`)), `brak GET /admin/courses/4; ${opisZadan}`).toBe(true);
    expect(wyszly.has(klucz("GET", ORIGIN, `${PRZEDROSTEK_API}/admin/edition`)), `brak GET /admin/edition; ${opisZadan}`).toBe(true);
    expect(zadaniaZNieustalonymId(rejestr), `żądanie z nieustalonym identyfikatorem; ${opisZadan}`).toEqual([]);
    expect(zadaniaZakazane(rejestr, ctx), `żądanie spoza listy dozwolonych; ${opisZadan}`).toEqual([]);
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

  for (const [adres, opisAdresu] of SPREPAROWANE) {
    test(`${adres} (${opisAdresu}) — zero żądań o kurs, żadne żądanie nie wychodzi poza listę dozwolonych i nie niesie segmentu kropkowego`, async ({
      page,
      baseURL,
    }) => {
      // Zbieranie żądań startuje tu, przed wejściem na stronę (`page.on("request")` w `instalujAtrapy`).
      const rejestr = await instalujAtrapy(page);
      const ctx = kontekst(baseURL, adres);

      await page.goto(adres, { waitUntil: "networkidle" });

      // Brak ekranu kursu pada tu, w 10 s, na asercji ekranu, a nie na limicie całego przypadku.
      await expect(
        page.getByRole("heading", { level: 1, name: /^Kurs / }),
        "ekran kursu się nie narysował (brak nagłówka „Kurs <id>” w 10 s)",
      ).toBeVisible({ timeout: LIMIT_EKRANU_MS });

      // Okno ciszy: żądania wysłane z opóźnieniem po narysowaniu stanu błędu też są zliczone.
      await page.waitForTimeout(OKNO_CISZY_MS);

      const opisZadan = `żądań strony: ${rejestr.zadania.length}`;
      expect(zadaniaKursu(rejestr), `żądanie o kurs (ścieżka z /admin/courses, dowolny origin) przy nieliczbowym adresie; ${opisZadan}`).toEqual([]);
      expect(zadaniaZakazane(rejestr, ctx), `żądanie spoza listy dozwolonych (tło ramki, dokument i zasoby własnego frontu); ${opisZadan}`).toEqual([]);
      expect(zadaniaZSegmentemKropkowym(rejestr), `segment kropkowy w żądaniu; ${opisZadan}`).toEqual([]);
      await expect(page.getByText("Nie udało się wczytać kursu"), "ekran kursu nie pokazał stanu błędu").toBeVisible({
        timeout: LIMIT_EKRANU_MS,
      });
    });
  }
});
