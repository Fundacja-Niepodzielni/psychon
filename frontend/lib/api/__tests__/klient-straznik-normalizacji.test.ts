import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Kontrola ścieżki żądania PO normalizacji adresu. Parser `URL` (ten sam co w
 * `fetch`) usuwa z końca całego adresu spacje i znaki sterujące, a dopiero
 * potem zwija segmenty `.` i `..`: ostatni segment `.. ` albo `%2e%2e ` jest dla
 * niego segmentem `..` i żądanie z tokenem idzie piętro wyżej, choć napisany
 * wprost taki segment nie wygląda na kropkowy. Próby poniżej opierają się na
 * wynikach tego parsera (`pathname` wpisany w tabelę jest zmierzony), nie na
 * założeniu, jak parser powinien się zachować.
 *
 * Do tego zapytanie zbudowane przez `URLSearchParams` (np. wklejony tabulator
 * zakodowany jako `%09`) jest wartością, nie ścieżką: nie wolno go odrzucać.
 */

const signOutMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("next-auth/react", () => ({ signOut: signOutMock }));

const { adresApi, adresWBazie, zgodnaZLiteralem, NieprawidlowaSciezkaApi } = await import("@/lib/api/klient");
const { zapytanie } = await import("@/lib/api/sciezka");

const PUNKT_SESJI = "/api/auth/session";
const BAZA_API = "https://api.example.pl/api/v1";
const BAZY = ["", "/", BAZA_API, "http://localhost:8000/api/v1"];
const WZGLEDNY = "http://wzgledny.invalid";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (adres: RequestInfo | URL) => ({
    ok: true,
    status: 200,
    json: async () =>
      String(adres).includes(PUNKT_SESJI)
        ? { accessToken: "token-probny-normalizacji", expiresAt: Date.now() + 600_000 }
        : { data: "ok" },
  }));
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

function zlap(wywolanie: () => unknown): unknown {
  try {
    wywolanie();
  } catch (wyjatek) {
    return wyjatek;
  }
  return null;
}

/** Ścieżka adresu, jaki zbuduje parser `URL` dla bazy z przedrostkiem `/api/v1`. */
function pathnameParsera(sciezka: string): string {
  return new URL(`${BAZA_API}${sciezka}`, WZGLEDNY).pathname;
}

// ---------------------------------------------------------------------------
// Tabela: wartość, ścieżka, którą wyśle przeglądarka (pomiar parsera), czy przyjęta.
// ---------------------------------------------------------------------------

/** [ścieżka, `pathname` zmierzony na parserze dla bazy `…/api/v1`, czy klient ją przepuszcza] */
const TABELA: Array<[string, string, boolean]> = [
  // Ostatni segment kropkowy z końcową spacją albo znakiem, który parser usuwa.
  ["/me/exports/.. ", "/api/v1/me/", false],
  ["/me/exports/. ", "/api/v1/me/exports/", false],
  ["/me/exports/..\t", "/api/v1/me/", false],
  ["/me/exports/..\n", "/api/v1/me/", false],
  ["/me/exports/..\r\n", "/api/v1/me/", false],
  ["/me/exports/. \t", "/api/v1/me/exports/", false],
  ["/me/exports/%2e%2e ", "/api/v1/me/", false],
  ["/me/exports/%2E%2E ", "/api/v1/me/", false],
  ["/me/exports/.%2e ", "/api/v1/me/", false],
  ["/me/exports/%2e. ", "/api/v1/me/", false],
  ["/me/exports/%2e ", "/api/v1/me/exports/", false],
  // Kropki zakodowane dwa i trzy razy ze spacją: parser przycina spację i zostawia `%252e%252e`,
  // ale po zdekodowaniu to `..` — tak samo jak dla wersji bez spacji (odrzucanej od pierwszej wersji).
  ["/me/exports/%252e%252e ", "/api/v1/me/exports/%252e%252e", false],
  ["/me/exports/%25252e%25252e ", "/api/v1/me/exports/%25252e%25252e", false],
  ["/me/exports/%252e%252e", "/api/v1/me/exports/%252e%252e", false],
  // Ten sam segment dotarty tylko spacją zakodowaną albo nieprzycinany: parser go nie zwija.
  ["/me/exports/..%20", "/api/v1/me/exports/..%20", true],
  ["/me/exports/%2e%2e%20", "/api/v1/me/exports/%2e%2e%20", true],
  ["/me/exports/%2e%2e%2520", "/api/v1/me/exports/%2e%2e%2520", true],
  ["/me/exports/.. .", "/api/v1/me/exports/..%20.", true],
  // Spacja niełamiąca nie jest usuwana przez parser: segment zostaje cały.
  ["/me/exports/.. ", "/api/v1/me/exports/..%C2%A0", true],
  // Segment ze spacją w środku ścieżki: parser go nie przycina, więc `..%20` zostaje.
  ["/me/.. /x", "/api/v1/me/..%20/x", true],
  ["/me/ ../x", "/api/v1/me/%20../x", true],
  ["/me/%2e%2e /x", "/api/v1/me/%2e%2e%20/x", true],
  ["/me/exports/ ..", "/api/v1/me/exports/%20..", true],
  ["/me/.. ?q=1", "/api/v1/me/..%20", true],
  // Końcowa kropka (dopisek do pisma): parser jej nie przycina ani nie zwija.
  ["/me/exports/...", "/api/v1/me/exports/...", true],
  ["/me/exports/... ", "/api/v1/me/exports/...", true],
  ["/me/exports/x.", "/api/v1/me/exports/x.", true],
  ["/me/exports/x. ", "/api/v1/me/exports/x.", true],
  ["/a/..;/b", "/api/v1/a/..;/b", true],
  ["/a/.../b", "/api/v1/a/.../b", true],
  ["/a/..%20", "/api/v1/a/..%20", true],
  // Sama ścieżka z kropek i spacji: wychodzi nad `/api/v1` (to dawny przypadek jedynie przedrostka).
  ["/.. ", "/api/", false],
  ["/%2e%2e ", "/api/", false],
  ["/. ", "/api/v1/", false],
];

describe("parser URL: ścieżka po normalizacji jest taka, jak zapisano w tabeli", () => {
  it.each(TABELA)("%j → %j", (sciezka, oczekiwany) => {
    expect(pathnameParsera(sciezka)).toBe(oczekiwany);
  });
});

describe.each(BAZY)("adresApi — normalizacja końca ścieżki, baza %j", (baza) => {
  it.each(TABELA)("%j → %s", (sciezka, _pathname, przyjeta) => {
    if (przyjeta) {
      expect(adresApi(sciezka, baza)).toBe(`${baza.replace(/\/+$/, "")}${sciezka}`);
      return;
    }
    const blad = zlap(() => adresApi(sciezka, baza));
    expect(blad).toBeInstanceOf(NieprawidlowaSciezkaApi);
    const komunikat = (blad as Error).message;
    for (const segment of sciezka.split(/[/?]/).filter((czesc) => czesc.trim().length >= 2)) {
      expect(komunikat).not.toContain(segment);
    }
  });
});

describe("adresApi — odrzucone ścieżki nie zostawiają żadnego żądania", () => {
  it.each(TABELA.filter(([, , przyjeta]) => !przyjeta).map(([sciezka]) => [sciezka]))(
    "api(%j): zero fetch, zero odczytów tokenu",
    async (sciezka) => {
      const { api, NieprawidlowaSciezkaApi: Klasa } = await swiezyKlient();

      await expect(api(sciezka)).rejects.toBeInstanceOf(Klasa);

      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});

// ---------------------------------------------------------------------------
// Wyrocznia: parser URL jako sędzia. Co klient przepuszcza, musi dla parsera
// mieć tę samą liczbę i treść segmentów co napisano.
// ---------------------------------------------------------------------------

const ELEMENTY = ["", ".", "..", "...", " ", "%2e", "%2E", "%2e%2e", ".%2e", "%2e.", "x", "x.", "%20", "%252e", "..%20", " "];
const KONCOWKI = ["", "?q=1"];

function sciezkiProbne(): string[] {
  const wynik: string[] = [];
  const dolacz = (glebokosc: number, przedrostek: string) => {
    if (glebokosc === 0) return;
    for (const element of ELEMENTY) {
      const sciezka = `${przedrostek}/${element}`;
      for (const koncowka of KONCOWKI) wynik.push(`${sciezka}${koncowka}`);
      dolacz(glebokosc - 1, sciezka);
    }
  };
  dolacz(3, "");
  return wynik;
}

/** Segment po stronie parsera i po stronie zapisu, porównywane po zdekodowaniu. */
function parserNieZmienilStruktury(sciezka: string, baza: string): boolean {
  const czysta = baza.replace(/\/+$/, "");
  const bazaUrl = new URL(`${czysta}/`, WZGLEDNY);
  const adres = new URL(`${czysta}${sciezka}`, WZGLEDNY);
  if (adres.origin !== bazaUrl.origin || !adres.pathname.startsWith(bazaUrl.pathname)) return false;

  const znakZapytania = sciezka.indexOf("?");
  const literal = znakZapytania === -1 ? sciezka : sciezka.slice(0, znakZapytania);
  const zapisane = literal.split("/").slice(1);
  // Parser przycina końcowe spacje z końca całego adresu; tylko wtedy dotyczy to ścieżki.
  if (znakZapytania === -1) zapisane[zapisane.length - 1] = zapisane[zapisane.length - 1].replace(/ +$/, "");

  const segmentyParsera = adres.pathname.split("/");
  const ogon = segmentyParsera.slice(segmentyParsera.length - zapisane.length);
  if (segmentyParsera.length - zapisane.length < 1) return false;
  const rozkoduj = (tekst: string) => {
    try {
      return decodeURIComponent(tekst);
    } catch {
      return tekst;
    }
  };
  return zapisane.every((segment, indeks) => rozkoduj(segment) === rozkoduj(ogon[indeks]));
}

describe("adresApi — wyrocznia: parser URL nie zmienia struktury żadnej przyjętej ścieżki", () => {
  const sciezki = sciezkiProbne();

  it("korpus nie jest pusty i zawiera przypadki przyjęte i odrzucone", () => {
    expect(sciezki.length).toBeGreaterThan(3000);
    const przyjete = sciezki.filter((sciezka) => zlap(() => adresApi(sciezka, BAZA_API)) === null);
    expect(przyjete.length).toBeGreaterThan(100);
    expect(przyjete.length).toBeLessThan(sciezki.length);
  });

  it.each(BAZY)("baza %j: każda przyjęta ścieżka zachowuje strukturę po normalizacji", (baza) => {
    const naruszenia: string[] = [];
    for (const sciezka of sciezki) {
      const wynik = zlap(() => adresApi(sciezka, baza));
      if (wynik === null && !parserNieZmienilStruktury(sciezka, baza)) naruszenia.push(JSON.stringify(sciezka));
    }
    expect(naruszenia).toEqual([]);
  });

  it("wyrocznia sama jest czuła: dla ścieżek z tabeli odrzucanych przez klienta mówi, że parser zmienia strukturę", () => {
    const zmieniane = TABELA.filter(([, , przyjeta]) => !przyjeta).map(([sciezka]) => sciezka);
    // Wiersze z kropkami kodowanymi wielokrotnie parser zostawia nietknięte (odrzuca je dekodowanie, nie parser).
    for (const sciezka of zmieniane.filter((s) => !/[\t\r\n]/.test(s) && !/%25/.test(s))) {
      expect(parserNieZmienilStruktury(sciezka, BAZA_API), JSON.stringify(sciezka)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Porównanie z bazą: osobna próba jednostkowa, bo po poprawce normalizacja
// struktury łapie te same ścieżki co przedrostek (druga linia obrony).
// ---------------------------------------------------------------------------

describe("adresWBazie — origin i przedrostek ścieżki bazy", () => {
  const baza = new URL("https://api.example.pl/api/v1/");
  const adres = (tekst: string) => new URL(tekst);

  it("przyjmuje adres pod bazą", () => {
    expect(adresWBazie(adres("https://api.example.pl/api/v1/me"), baza)).toBe(true);
    expect(adresWBazie(adres("https://api.example.pl/api/v1/"), baza)).toBe(true);
  });

  it("odrzuca adres piętro wyżej niż baza", () => {
    expect(adresWBazie(adres("https://api.example.pl/api/"), baza)).toBe(false);
    expect(adresWBazie(adres("https://api.example.pl/api/v1"), baza)).toBe(false);
    expect(adresWBazie(adres("https://api.example.pl/"), baza)).toBe(false);
  });

  it("odrzuca adres pod sąsiednim przedrostkiem o tej samej początkowej nazwie", () => {
    expect(adresWBazie(adres("https://api.example.pl/api/v10/me"), baza)).toBe(false);
  });

  it("odrzuca inny host, port i schemat przy tej samej ścieżce", () => {
    expect(adresWBazie(adres("https://obcy.example/api/v1/me"), baza)).toBe(false);
    expect(adresWBazie(adres("https://api.example.pl:8443/api/v1/me"), baza)).toBe(false);
    expect(adresWBazie(adres("http://api.example.pl/api/v1/me"), baza)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Struktura po normalizacji: osobna próba jednostkowa, bo kontrola tekstu
// ścieżki po przycięciu końcowej spacji łapie te same ścieżki co ona.
// ---------------------------------------------------------------------------

describe("zgodnaZLiteralem — parser nie zwija ani nie przycina segmentu", () => {
  function dla(czysta: string, literal: string, zapytanieSurowe = ""): boolean {
    const rzeczywisty = new URL(`${czysta}${literal}${zapytanieSurowe}`, WZGLEDNY);
    return zgodnaZLiteralem(czysta, literal, zapytanieSurowe, rzeczywisty, WZGLEDNY);
  }

  it.each(["", BAZA_API])("baza %j: przyjmuje segmenty, które parser zostawia", (czysta) => {
    for (const literal of [
      "/",
      "/me/exports/x",
      "/me/exports/..%20",
      "/me/.. /x",
      "/me/ ../x",
      "/me/exports/...",
      "/me/exports/x.",
      "/me/exports/x ",
      "/me/exports/.. ",
    ]) {
      expect(dla(czysta, literal), JSON.stringify(literal)).toBe(true);
    }
    expect(dla(czysta, "/me/.. ", "?q=1")).toBe(true);
  });

  it.each(["", BAZA_API])("baza %j: odrzuca segmenty, które parser zwija albo przycina", (czysta) => {
    for (const literal of [
      "/me/exports/.. ",
      "/me/exports/. ",
      "/me/exports/%2e%2e ",
      "/me/exports/.%2e ",
      "/me/exports/..",
      "/me/exports/.",
      "/me/../exports/x",
      "/me/./exports/x",
      "/me/%2e%2e/exports/x",
      "/.. ",
    ]) {
      expect(dla(czysta, literal), JSON.stringify(literal)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Zapytanie: wartość zakodowana jest daną, a nie ścieżką, więc nie jest odrzucana.
// ---------------------------------------------------------------------------

describe("zapytanie ze znakiem sterującym: kodowane, nie odrzucane", () => {
  it("tabulator z wyszukiwania daje %09 i klient go przepuszcza", () => {
    const wartosc = zapytanie({ search: "kowal\tjan" });
    expect(wartosc).toBe("?search=kowal%09jan");
    expect(adresApi(`/admin/users${wartosc}`, BAZA_API)).toBe(`${BAZA_API}/admin/users?search=kowal%09jan`);
  });

  it("każdy znak sterujący C0, DEL i C1 w wartości zapytania przechodzi przez klienta", () => {
    const kody = [...Array.from({ length: 0x20 }, (_, i) => i), ...Array.from({ length: 0x21 }, (_, i) => 0x7f + i)];
    for (const kod of kody) {
      const wartosc = zapytanie({ q: `a${String.fromCharCode(kod)}b` });
      expect(zlap(() => adresApi(`/admin/users${wartosc}`, BAZA_API)), `U+${kod.toString(16)}`).toBeNull();
    }
  });

  it("api() wysyła żądanie z zakodowanym tabulatorem i nie zgłasza wyjątku klienta", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.pl");
    const { api } = await swiezyKlient();

    await expect(api(`/admin/users${zapytanie({ search: "kowal\tjan" })}`)).resolves.toBe("ok");

    const wywolania = fetchMock.mock.calls.filter((wywolanie) => !String(wywolanie[0]).includes(PUNKT_SESJI));
    expect(wywolania).toHaveLength(1);
    expect(String(wywolania[0][0])).toBe("https://api.example.pl/api/v1/admin/users?search=kowal%09jan");
  });

  it.each([
    ["surowy tabulator w zapytaniu", "/a/b?q=a\tb"],
    ["surowy znak nowego wiersza w zapytaniu", "/a/b?q=a\nb"],
    ["surowy znak powrotu karetki w zapytaniu", "/a/b?q=a\rb"],
    ["znak sterujący C1 wprost w zapytaniu", "/a/b?q=a\u0085b"],
    ["błędne kodowanie procentowe w zapytaniu", "/a/b?q=100%"],
    ["zakodowany znak sterujący w ŚCIEŻCE", "/a/b%09c"],
    ["zakodowany znak nowego wiersza w ścieżce", "/a/%0d%0a/b"],
  ])("nadal odrzuca: %s", (_nazwa, sciezka) => {
    expect(zlap(() => adresApi(sciezka, BAZA_API))).toBeInstanceOf(NieprawidlowaSciezkaApi);
  });

  it("procent zakodowany (%25) w zapytaniu przechodzi", () => {
    expect(adresApi(`/a/b${zapytanie({ q: "100%" })}`, BAZA_API)).toBe(`${BAZA_API}/a/b?q=100%25`);
  });
});
