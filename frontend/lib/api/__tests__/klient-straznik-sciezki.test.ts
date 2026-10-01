import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Kontrola ścieżki żądania w kliencie API (`lib/api/klient.ts`): wartość z
 * adresu strony, parametru trasy albo pola formularza, która wchodzi do ścieżki
 * `api()`, nie może skierować żądania z tokenem pod inną ścieżkę niż zamierzona
 * (`..`, zakodowane `..`, ukośnik wsteczny, zakodowany ukośnik, `//`, `#`,
 * znaki sterujące, adres bezwzględny, brak wiodącego ukośnika).
 *
 * Dwie warstwy prób: sama funkcja `adresApi(ścieżka, baza)` na tabeli wartości
 * dla czterech baz oraz `api()` / `apiPaged()` z atrapą na `fetch` — piętro
 * niżej niż ekrany. Moduł klienta jest w próbach `api()` ładowany za każdym
 * razem od nowa, więc jego pamięć sesji jest pusta: gdyby odrzucone żądanie
 * czytało token, zrobiłoby to przez `fetch` do punktu sesji i licznik wywołań
 * by to pokazał.
 */

const signOutMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("next-auth/react", () => ({ signOut: signOutMock }));

const { adresApi, NieprawidlowaSciezkaApi } = await import("@/lib/api/klient");

const PUNKT_SESJI = "/api/auth/session";
const TOKEN_PROBNY = "token-probny-straznika";

const fetchMock = vi.fn();

function odpowiedz(dane: unknown) {
  return { ok: true, status: 200, json: async () => dane };
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (adres: RequestInfo | URL) =>
    String(adres).includes(PUNKT_SESJI)
      ? odpowiedz({ accessToken: TOKEN_PROBNY, expiresAt: Date.now() + 600_000 })
      : odpowiedz({ data: "ok" }),
  );
  vi.stubGlobal("fetch", fetchMock);
  signOutMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function swiezyKlient() {
  vi.resetModules();
  return import("@/lib/api/klient");
}

function wywolaniaPunktuSesji() {
  return fetchMock.mock.calls.filter((wywolanie) => String(wywolanie[0]).includes(PUNKT_SESJI));
}

function wywolaniaApi() {
  return fetchMock.mock.calls.filter((wywolanie) => !String(wywolanie[0]).includes(PUNKT_SESJI));
}

function zlap(wywolanie: () => unknown): unknown {
  try {
    wywolanie();
  } catch (wyjatek) {
    return wyjatek;
  }
  return null;
}

/** Komunikat wyjątku (i jego pola) nie niesie odrzuconej ścieżki ani jej segmentów. */
function oczekujBezSciezki(blad: unknown, sciezka: string) {
  const komunikat = (blad as Error).message;
  if (sciezka !== "") expect(komunikat).not.toContain(sciezka);
  for (const segment of sciezka.split(/[/\\?#]/).filter((czesc) => czesc.length >= 2)) {
    expect(komunikat).not.toContain(segment);
  }
  for (const [, wartosc] of Object.entries(blad as object)) {
    if (sciezka !== "") expect(String(wartosc)).not.toContain(sciezka);
  }
}

// ---------------------------------------------------------------------------
// Tabela wartości z przeglądu zewnętrznego — dosłownie, z oczekiwanym wynikiem.
// Literały JS: `\\` to jeden ukośnik wsteczny, `\n` to znak nowego wiersza.
// ---------------------------------------------------------------------------

const TABELA_WARTOSCI: Array<[string, boolean]> = [
  ["/me", true],
  ["/courses/12/lessons?page=2&sort=-created_at", true],
  ["/users?search=a/../b", true],
  ["/kursy/zażółć", true],
  ["/files/raport%20Q3.pdf", true],
  ["/search?q=%2500", true],
  ["", false],
  ["courses/1", false],
  ["//evil.example/x", false],
  ["https://evil.example/x", false],
  ["/\\evil.example/x", false],
  ["/../../admin", false],
  ["/courses/..", false],
  ["/courses/./1", false],
  ["/%2e%2e/%2e%2e/admin", false],
  ["/.%2E/x", false],
  ["/%252e%252e/admin", false],
  ["/%25252e%25252e/x", false],
  ["/x/..%2f..%2fadmin", false],
  ["/courses/%2F%2Fevil.example", false],
  ["/..\\..\\horizon", false],
  ["/.\n./telescope", false],
  ["/a\tb", false],
  ["/courses/1%00", false],
  // Znak sterujący ZAKODOWANY w zapytaniu to zwykła wartość (tak koduje
  // `URLSearchParams`), nie ścieżka — przyjęty. Surowy znak sterujący w zapytaniu
  // zostaje odrzucony (próby w pliku normalizacji).
  ["/search?q=%0d%0aX", true],
  ["/lessons/7#/progress", false],
  ["/courses/%E0%A4%A", false],
  ["/a//b", false],
];

const BAZY = ["", "/", "https://api.example.pl/api/v1", "http://localhost:8000/api/v1"];

describe.each(BAZY)("adresApi — tabela wartości, baza %j", (baza) => {
  for (const [sciezka, przyjeta] of TABELA_WARTOSCI) {
    it(`${JSON.stringify(sciezka)} → ${przyjeta ? "przyjęta" : "odrzucona"}`, () => {
      if (przyjeta) {
        // Ten sam napis co zawsze: baza bez końcowych ukośników + ścieżka.
        expect(adresApi(sciezka, baza)).toBe(`${baza.replace(/\/+$/, "")}${sciezka}`);
        return;
      }
      const blad = zlap(() => adresApi(sciezka, baza));
      expect(blad).toBeInstanceOf(NieprawidlowaSciezkaApi);
      oczekujBezSciezki(blad, sciezka);
    });
  }
});

describe("adresApi — adres powstaje przez sklejenie napisów, nie przez new URL", () => {
  it.each(BAZY)("//evil.example/x i https://evil.example/x są odrzucone, baza %j", (baza) => {
    expect(zlap(() => adresApi("//evil.example/x", baza))).toBeInstanceOf(NieprawidlowaSciezkaApi);
    expect(zlap(() => adresApi("https://evil.example/x", baza))).toBeInstanceOf(NieprawidlowaSciezkaApi);
    expect(zlap(() => adresApi("/\\evil.example/x", baza))).toBeInstanceOf(NieprawidlowaSciezkaApi);
    expect(zlap(() => adresApi("\\\\evil.example/x", baza))).toBeInstanceOf(NieprawidlowaSciezkaApi);
  });

  it.each([
    ["https://api.example.pl/api/v1", "/courses/1", "https://api.example.pl/api/v1/courses/1"],
    ["https://api.example.pl/api/v1/", "/courses/1", "https://api.example.pl/api/v1/courses/1"],
    ["http://localhost:8000/api/v1", "/me", "http://localhost:8000/api/v1/me"],
    // `new URL(...).href` zakodowałoby polskie litery i uprościło ścieżkę —
    // adres zwrócony jest bajt w bajt tym, co wpisano.
    ["https://api.example.pl/api/v1", "/kursy/zażółć", "https://api.example.pl/api/v1/kursy/zażółć"],
    ["https://api.example.pl/api/v1", "/search?q=%2500", "https://api.example.pl/api/v1/search?q=%2500"],
    ["https://api.example.pl/api/v1", "/files/raport%20Q3.pdf", "https://api.example.pl/api/v1/files/raport%20Q3.pdf"],
    ["https://api.example.pl/api/v1", "/users?search=a/../b", "https://api.example.pl/api/v1/users?search=a/../b"],
    ["https://api.example.pl/api/v1", "/", "https://api.example.pl/api/v1/"],
    ["/api/v1", "/courses/1", "/api/v1/courses/1"],
  ])("baza %j + ścieżka %j daje dokładnie %j", (baza, sciezka, oczekiwany) => {
    expect(adresApi(sciezka, baza)).toBe(oczekiwany);
  });
});

describe("adresApi — dalsze odrzucenia", () => {
  it.each([
    ["znak sterujący C1 w ścieżce", "/a/\u0085b"],
    ["znak DEL w ścieżce", "/a/b\u007F"],
    ["znak sterujący zakodowany dwukrotnie w ścieżce", "/a/%250ab"],
    ["fragment w zapytaniu", "/a?x=1#y"],
    ["sam fragment", "/a#"],
    ["zakodowany ukośnik bez kropek", "/a/b%2fc"],
    ["zakodowany ukośnik wielką literą", "/a/b%2Fc"],
    ["ukośnik zakodowany dwukrotnie", "/a/b%252fc"],
    ["ukośnik wsteczny zakodowany", "/a/%5c../b"],
    ["ukośnik wsteczny zakodowany dwukrotnie", "/a/%255c/b"],
    ["dosłowny procent w segmencie", "/a/%/b"],
    ["procent po zdekodowaniu (%25 w segmencie)", "/a/50%25/b"],
    ["kodowanie głębsze niż trzy poziomy", "/a/%2525252e%2525252e/b"],
    ["błędne kodowanie w zapytaniu", "/a?x=%zz"],
    ["zakodowana pojedyncza kropka", "/a/%2e/b"],
    ["segment .. przed zapytaniem", "/a/..?x=1"],
    ["adres z nazwą użytkownika zamiast ścieżki", "@obcy.example/x"],
    ["numer certyfikatu z segmentem wstecznym", "/verify/NP/2026/017/../../me"],
  ])("%s", (_nazwa, sciezka) => {
    const blad = zlap(() => adresApi(sciezka, "https://api.example.pl/api/v1"));
    expect(blad).toBeInstanceOf(NieprawidlowaSciezkaApi);
    oczekujBezSciezki(blad, sciezka);
  });

  it.each([
    ["segment zaczynający się od dwóch kropek", "/a/..b"],
    ["segment kończący się dwiema kropkami", "/a/b.."],
    ["segment ukryty (kropka na początku)", "/a/.ukryty"],
    ["zakodowana spacja", "/a/%20b"],
    ["zakodowany znak spoza ASCII", "/a/%C5%BC"],
    ["kropki i zakodowany ukośnik w zapytaniu", "/a/b?x=%2e%2e%2f%5c"],
    ["numer certyfikatu z ukośnikami", "/verify/NP/2026/017"],
    ["kurs po slugu", "/courses/wywiad-psychologiczny"],
    ["zapytanie ze stronicowaniem", "/admin/users?page=2&per_page=25"],
    ["znak sterujący zakodowany w zapytaniu (wartość, nie ścieżka)", "/a?x=%0a"],
  ])("przepuszcza: %s", (_nazwa, sciezka) => {
    expect(adresApi(sciezka, "https://api.example.pl/api/v1")).toBe(`https://api.example.pl/api/v1${sciezka}`);
  });
});

// ---------------------------------------------------------------------------
// Przez klienta: zero fetch, zero odczytów tokenu, komunikat bez ścieżki.
// ---------------------------------------------------------------------------

const ODRZUCANE: Array<[string, string]> = [
  ["segment .. w środku", "/a/../b"],
  ["segment . w środku", "/a/./b"],
  ["sam segment .. na początku", "/.."],
  ["segment .. na końcu", "/a/.."],
  ["zakodowane kropki", "/a/%2e%2e/b"],
  ["zakodowane kropki, mieszana wielkość liter", "/a/%2E%2e/b"],
  ["kropki zakodowane dwukrotnie", "/a/%252e%252e/b"],
  ["kropki zakodowane trzykrotnie", "/a/%25252e%25252e/b"],
  ["zakodowany ukośnik tuż za kropkami", "/a/..%2fb"],
  ["zakodowany ukośnik wielką literą przed kropkami", "/a/%2F../b"],
  ["zakodowany ukośnik bez kropek", "/a/b%2fc"],
  ["ukośnik wsteczny dosłowny", "/a\\b"],
  ["ukośnik wsteczny zakodowany", "/a/%5c../b"],
  ["ukośnik wsteczny zakodowany dwukrotnie", "/a/%255c/b"],
  ["brak wiodącego ukośnika", "a/b"],
  ["pusta ścieżka", ""],
  ["błąd dekodowania", "/a/%zz/b"],
  ["kodowanie głębsze niż trzy poziomy", "/a/%2525252e%2525252e/b"],
  ["kropki rozdzielone znakiem nowego wiersza (parser adresów go usuwa)", "/a/.\n./b"],
  ["kropki rozdzielone tabulacją (parser adresów ją usuwa)", "/a/.\t./b"],
  ["kropki rozdzielone znakiem powrotu karetki (parser adresów go usuwa)", "/a/.\r./b"],
  ["fragment w adresie", "/lessons/7#/progress"],
  ["podwójny ukośnik na początku", "//obcy.example/x"],
  ["adres bezwzględny", "https://obcy.example/x"],
  ["podwójny ukośnik w środku", "/a//b"],
];

describe("klient API — ścieżka odrzucona: zero fetch, zero odczytów tokenu, komunikat bez ścieżki", () => {
  it.each(ODRZUCANE)("api(): %s", async (_nazwa, sciezka) => {
    const { api, ApiError, NieprawidlowaSciezkaApi: Klasa } = await swiezyKlient();
    const konsola = [
      vi.spyOn(console, "error").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "info").mockImplementation(() => {}),
      vi.spyOn(console, "debug").mockImplementation(() => {}),
    ];

    const blad = await api(sciezka).then(
      () => null,
      (wyjatek: unknown) => wyjatek,
    );

    expect(blad).toBeInstanceOf(Klasa);
    // Wyjątek klienta, nie udawana odpowiedź serwera.
    expect(blad).not.toBeInstanceOf(ApiError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(wywolaniaPunktuSesji()).toHaveLength(0);
    oczekujBezSciezki(blad, sciezka);
    for (const szpieg of konsola) expect(szpieg).not.toHaveBeenCalled();
  });

  it("apiPaged() odrzuca tak samo jak api()", async () => {
    const { apiPaged, NieprawidlowaSciezkaApi: Klasa } = await swiezyKlient();

    await expect(apiPaged("/a/../b")).rejects.toBeInstanceOf(Klasa);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("odrzucenie nie zatruwa klienta: kolejne poprawne żądanie przechodzi", async () => {
    const { api, baseUrl, NieprawidlowaSciezkaApi: Klasa } = await swiezyKlient();

    await expect(api("/a/../b")).rejects.toBeInstanceOf(Klasa);
    await expect(api("/courses")).resolves.toBe("ok");

    expect(wywolaniaApi()).toHaveLength(1);
    expect(wywolaniaApi()[0][0]).toBe(`${baseUrl()}/courses`);
  });
});

describe("klient API — kontrola jest pierwszą instrukcją żądania, przed pamięcią konta", () => {
  it("/me/../admin/users nie dotyka pamięci /me, nie czyta tokenu i nie woła fetch", async () => {
    const { api, NieprawidlowaSciezkaApi: Klasa } = await swiezyKlient();

    await expect(api("/me/../admin/users")).rejects.toBeInstanceOf(Klasa);
    await expect(api("/me/%2e%2e/admin/users")).rejects.toBeInstanceOf(Klasa);
    await expect(
      api("/me/../admin/users", { method: "PATCH", body: { first_name: "X" } }),
    ).rejects.toBeInstanceOf(Klasa);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(wywolaniaPunktuSesji()).toHaveLength(0);
  });

  it("odrzucone żądanie z przedrostkiem /me nie czyści i nie podmienia pamięci konta", async () => {
    const { api, NieprawidlowaSciezkaApi: Klasa } = await swiezyKlient();
    fetchMock.mockImplementation(async (adres: RequestInfo | URL) =>
      String(adres).includes(PUNKT_SESJI)
        ? odpowiedz({ accessToken: TOKEN_PROBNY, expiresAt: Date.now() + 600_000 })
        : odpowiedz({ data: { id: 7 } }),
    );

    await expect(api("/me")).resolves.toEqual({ id: 7 });
    expect(wywolaniaApi()).toHaveLength(1);

    await expect(api("/me/../admin/users")).rejects.toBeInstanceOf(Klasa);
    await expect(api("/me/../admin/users", { method: "PATCH", body: {} })).rejects.toBeInstanceOf(Klasa);

    // Pamięć konta nie została wyczyszczona przez odrzucone PATCH-e: drugi
    // odczyt `/me` jest z pamięci, bez nowego żądania.
    await expect(api("/me")).resolves.toEqual({ id: 7 });
    expect(wywolaniaApi()).toHaveLength(1);
  });
});

const PRZEPUSZCZANE: Array<[string, string]> = [
  ["numer certyfikatu z ukośnikami", "/verify/NP/2026/017"],
  ["kurs po slugu", "/courses/wywiad-psychologiczny"],
  ["kropki w zapytaniu", "/a/b?x=../y"],
  ["zakodowane kropki i ukośnik w zapytaniu", "/a/b?x=%2e%2e%2f%5c"],
  ["segment zaczynający się od dwóch kropek", "/a/..b"],
  ["segment kończący się dwiema kropkami", "/a/b.."],
  ["segment ukryty (kropka na początku)", "/a/.ukryty"],
  ["zakodowana spacja", "/a/%20b"],
  ["zapytanie ze stronicowaniem", "/admin/users?page=2&per_page=25"],
  ["sam ukośnik", "/"],
  ["zakodowany znak spoza ASCII", "/a/%C5%BC"],
  ["polskie litery dosłownie", "/kursy/zażółć"],
  ["plik ze spacją zakodowaną", "/files/raport%20Q3.pdf"],
  ["zapytanie z zakodowanym zerem", "/search?q=%2500"],
];

describe("klient API — ścieżka poprawna: jedno fetch pod niezmienioną ścieżką", () => {
  it.each(PRZEPUSZCZANE)("%s", async (_nazwa, sciezka) => {
    const { api, baseUrl } = await swiezyKlient();

    await expect(api(sciezka)).resolves.toBe("ok");

    const wywolania = wywolaniaApi();
    expect(wywolania).toHaveLength(1);
    expect(wywolania[0][0]).toBe(`${baseUrl()}${sciezka}`);
    // Token jest odczytany i dołożony jak dotąd.
    expect(wywolaniaPunktuSesji()).toHaveLength(1);
    expect(new Headers(wywolania[0][1].headers).get("Authorization")).toBe(`Bearer ${TOKEN_PROBNY}`);
  });

  it("apiPaged() przepuszcza poprawną ścieżkę z metadanymi", async () => {
    const { apiPaged, baseUrl } = await swiezyKlient();
    fetchMock.mockImplementation(async (adres: RequestInfo | URL) =>
      String(adres).includes(PUNKT_SESJI)
        ? odpowiedz({ accessToken: null, expiresAt: 0 })
        : odpowiedz({ data: [1], meta: { current_page: 1 } }),
    );

    await expect(apiPaged("/notifications?page=1")).resolves.toEqual({ data: [1], meta: { current_page: 1 } });

    expect(wywolaniaApi()[0][0]).toBe(`${baseUrl()}/notifications?page=1`);
  });

  it("zmiana konta (PATCH /me) nadal idzie z tokenem i ciałem", async () => {
    const { api, baseUrl } = await swiezyKlient();

    await expect(api("/me", { method: "PATCH", body: { first_name: "Ola" } })).resolves.toBe("ok");

    const wywolania = wywolaniaApi();
    expect(wywolania).toHaveLength(1);
    expect(wywolania[0][0]).toBe(`${baseUrl()}/me`);
    expect(wywolania[0][1].method).toBe("PATCH");
    expect(wywolania[0][1].body).toBe(JSON.stringify({ first_name: "Ola" }));
  });

  it("względna baza (pusty NEXT_PUBLIC_API_URL) daje adres /api/v1/…", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    const { api } = await swiezyKlient();

    await expect(api("/courses?page=1")).resolves.toBe("ok");

    expect(wywolaniaApi()[0][0]).toBe("/api/v1/courses?page=1");
  });
});

describe("klient API — fetch z opcją redirect: error", () => {
  it("żądanie do API niesie redirect: error", async () => {
    const { api } = await swiezyKlient();

    await api("/courses");

    expect(wywolaniaApi()).toHaveLength(1);
    expect(wywolaniaApi()[0][1].redirect).toBe("error");
  });

  it("wywołujący nie nadpisze opcji redirect", async () => {
    const { api } = await swiezyKlient();

    await api("/courses", { redirect: "follow" });

    expect(wywolaniaApi()[0][1].redirect).toBe("error");
  });

  it("zachowuje pozostałe opcje żądania (metoda, nagłówki, ciało)", async () => {
    const { api } = await swiezyKlient();

    await api("/courses", { method: "POST", body: { a: 1 }, headers: { "X-Probny": "tak" } });

    const [, init] = wywolaniaApi()[0];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    expect(new Headers(init.headers).get("X-Probny")).toBe("tak");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
  });
});
