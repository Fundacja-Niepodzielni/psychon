import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Przyrząd na punkt orientacyjny treści (`id="tresc"`) — cel skip-linku
 * z `PanelShell` (`href="#tresc"`) i jedyny landmark, na który czytnik
 * ekranu i klawiatura mogą przeskoczyć bez przesłuchiwania całej strony od
 * nagłówka. Pomiar w przeglądarce (02:12, `4a8c0d3`) naliczył go na
 * `/logowanie` i `/deklaracja-dostepnosci`, a nie naliczył na
 * `/dostep-wygasl`, `/logowanie/niepowiazane` i `/konto` — to była ręcznie
 * obejrzana piątka, nie cały router.
 *
 * LISTA TRAS NIE JEST WPISANA NA SZTYWNO: `wykryjTrasy()` niżej schodzi po
 * katalogu `app/` tak, jak robi to router Next.js (App Router), i buduje
 * listę z tego, co naprawdę tam jest.
 *
 * ŁAŃCUCH WARSTW, NIE JEDNA WARSTWA: Next.js renderuje stronę owiniętą we
 * WSZYSTKIE layouty po drodze od korzenia (`app/layout.tsx`, pomijany, bo
 * tylko owija `<html>`/`<body>`) aż do najbliższego layoutu przy stronie —
 * nie tylko w ostatni. `lancuchLayoutow()` schodzi po całej ścieżce i
 * zwraca WSZYSTKIE znalezione layouty w kolejności od korzenia do liścia;
 * `describe.each` niżej renderuje je zagnieżdżone w tej samej kolejności.
 * To ma znaczenie praktyczne: w panelu uczestnika punkt orientacyjny
 * (`<main id="tresc">`) siedzi w `panel/layout.tsx` (rodzic, renderowany
 * bezwarunkowo), a bramka `RequireRole` bywa dopiero w layoucie DZIECKA
 * (np. `panel/staz/layout.tsx`) i gate'uje tylko to, co jest wewnątrz
 * `<main>` — nie sam `<main>`. Branie „najbliższego” layoutu (poprzednia
 * wersja tego przyrządu) renderowało samo dziecko z pominięciem rodzica i
 * gubiło punkt orientacyjny, który naprawdę jest w DOM.
 *
 * Trzy grupy tras są świadomie WYPISANE Z NAZWY jako nieobjęte (a nie po
 * cichu pominięte) — dla każdej podana jest przyczyna strukturalna, wykryta
 * z kodu, a nie z uznania:
 *  - trasy z segmentem dynamicznym (`[id]`, `[slug]`) — przyrząd nie ma skąd
 *    wziąć konkretnego identyfikatora, więc nie zgaduje;
 *  - trasy, w których łańcuchu layoutów ISTNIEJE plik zawierający
 *    JEDNOCZEŚNIE `PanelShell` i `RequireRole` — czyli gate i punkt
 *    orientacyjny są w TYM SAMYM pliku, więc gate naprawdę stoi PRZED
 *    `<main id="tresc">` (np. `admin/layout.tsx`,
 *    `prowadzacy/layout.tsx`) i punkt orientacyjny trafia do DOM dopiero
 *    po odpowiedzi `GET /me` z rolą dopuszczoną AKURAT tej trasy. To NIE
 *    jest to samo, co „w łańcuchu jest gdzieś RequireRole” — jeśli
 *    `RequireRole` jest w layoucie DZIECKA, a `PanelShell` w layoucie
 *    RODZICA (osobne pliki), to gate chroni tylko zawartość `<main>`, a
 *    sam punkt orientacyjny jest bezwarunkowy — taka trasa NIE jest
 *    wykluczana, patrz niżej.
 *  - strony, których cała treść to serwerowe `redirect()` z
 *    `next/navigation` (wykryte po literalnym imporcie w źródle) — nie
 *    renderują żadnego DOM, do którego mógłby się odnosić punkt
 *    orientacyjny.
 *
 * Pozostałe trasy przyrząd RENDERUJE i mierzy: DOKŁADNIE jeden punkt
 * orientacyjny treści (rola „main" pod `id="tresc"`) i dokładnie jeden
 * nagłówek główny (`h1`) na trasę. To sprawdzenie WŁASNOŚCI (rola ARIA +
 * jej `id`), nie kształtu drzewa ani nazwy klasy CSS — element, który
 * wygląda jak punkt orientacyjny (ma `id="tresc"` na jakimś `<div>`), ale
 * nie ma roli „main", zostaje odrzucony; `<main>` bez właściwego `id`
 * (którego skip-link i tak nie trafi) — też.
 *
 * ATRAPA `api()` I NAGŁÓWEK GŁÓWNY — ZMIERZONE OSOBNO DLA KAŻDEJ Z SZEŚCIU
 * TRAS, NIE ZAŁOŻONE ZBIORCZO. Sześć tras mierzonych ma inny kod źródłowy
 * pod spodem, więc mają DWA różne zachowania `h1` w stanie ładowania i
 * błędu — zmierzone wprost (osobny render każdej trasy z obietnicą `api()`
 * zawieszoną na stałe = stan ładowania, i osobno z obietnicą odrzuconą =
 * stan błędu, DOM czytany zaraz po, bez żadnej podmiany atrapy):
 *  - `/panel/staz` (`InternshipJournal`) i `/panel/superwizja`
 *    (`SupervisionSlots`) renderują `h1` BEZWARUNKOWO, nad rozgałęzieniem
 *    ładowania/błędu w kodzie komponentu — `h1` jest w DOM w OBU stanach,
 *    zanim jakiekolwiek dane własne trasy się rozstrzygną;
 *  - `/panel/pulpit` (`PulpitDashboard`), `/panel/profil`,
 *    `/panel/certyfikat` i `/panel/profil-psychologa` renderują `h1`
 *    DOPIERO w gałęzi sukcesu — w stanie ładowania i błędu `h1` nie ma w
 *    DOM wcale, w żadnym z tych dwóch stanów, na żadnej z tych czterech tras.
 *
 * Przy atrapie generycznej z `beforeEach` (odrzuca KAŻDE wywołanie `api()`)
 * wszystkie sześć tras utykają w stanie błędu — dla dwóch pierwszych `h1`
 * i tak jest w DOM (bezwarunkowy), a dla pozostałych czterech nie ma go
 * wcale, NIEZALEŻNIE od tego, czy w łańcuchu jest `RequireRole` (`/panel/
 * pulpit` i `/panel/profil` nie mają żadnej bramki roli, a łapią ten sam
 * brak `h1` co `/panel/certyfikat` i `/panel/profil-psychologa`, które ją
 * mają). Samo doczekanie się rozstrzygnięcia (`await`/`waitFor`) NIE
 * naprawia braku `h1` na tych czterech — zmierzone wprost: przy atrapie
 * odrzucającej `GET /me`, `RequireRole` po rozstrzygnięciu obietnicy
 * wchodzi w stan „error” (karta „Nie udało się połączyć z serwerem”), a nie
 * w stan „allowed”, więc `h1` się tam nie pojawia NIGDY, nie tylko w
 * pierwszym, synchronicznym renderze; `/panel/pulpit` i `/panel/profil` mają
 * ten sam skutek bez żadnego `RequireRole` — same trzymają `h1` pod
 * warunkiem sukcesu własnego pobrania.
 *
 * Jedyna naprawa, która faktycznie usuwa czerwień `h1` (zmierzona
 * `REALISTYCZNE_LADUNKI` niżej — patrz też zastrzeżenie o zakresie dwóch z
 * sześciu wpisów w komentarzu przy tej stałej): podmiana atrapy na sukces
 * o kształcie, jakiego dana trasa naprawdę oczekuje. Po tej podmianie i
 * doczekaniu się DOM-u (`waitFor` w teście `h1` niżej) WSZYSTKICH SZEŚĆ
 * tras pokazuje dokładnie jeden `h1` — zmierzone `npx vitest run
 * __tests__/punkty-orientacyjne-tresc.test.tsx`, 2026-09-18: zero czerwieni
 * `h1` na tych sześciu trasach PO udanym pobraniu. Ten test sprawdza
 * WYŁĄCZNIE stan po sukcesie — stan ładowania i błędu (opisany wyżej, ze
 * zmierzonym podziałem 2/4) jest osobną, realną właściwością tych
 * komponentów, którą ten test świadomie NIE mierzy i o którą nie rozstrzyga
 * (nie jest ukryty — jest tu opisany, ale nie ma dla niego osobnej asercji
 * w tym pliku).
 */

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "app");

interface OdkrytaTrasa {
  /** Ścieżka URL wyprowadzona z katalogów (bez grup routingu w nawiasach). */
  url: string;
  /** Specyfikator importu modułu strony, np. "@/app/logowanie/page". */
  importPage: string;
  /** Specyfikatory importu layoutów w łańcuchu, KOLEJNOŚĆ: korzeń → liść.
   * Pusta tablica, gdy trasa nie ma żadnego layoutu poza `app/layout.tsx`. */
  importLayouty: string[];
  /** `true`, gdy w łańcuchu istnieje JEDEN plik layoutu zawierający
   * jednocześnie `RequireRole` i `PanelShell` (gate stoi przed punktem
   * orientacyjnym w tym samym pliku). */
  bramkaRoli: boolean;
  dynamiczna: boolean;
  przekierowanieSerwera: boolean;
}

function segmentyUrl(relDir: string): string[] {
  return relDir
    .split(sep)
    .filter((s) => s.length > 0)
    .filter((s) => !(s.startsWith("(") && s.endsWith(")"))); // grupy routingu nie wchodzą do URL
}

/** Cały łańcuch `layout.tsx` od korzenia (wyłączając `app/layout.tsx`) do
 * katalogu strony, w kolejności RODZIC → DZIECKO — dokładnie tak, jak
 * Next.js zagnieżdża je przy renderze. Poprzednia wersja tej funkcji
 * (`najblizszyLayout`) zwracała TYLKO pierwszy znaleziony przy wchodzeniu
 * w górę, czyli warstwę najbliższą stronie — to nie jest to, co robi
 * router: Next składa WSZYSTKIE warstwy po drodze, nie jedną. */
function lancuchLayoutow(absDir: string): string[] {
  const znalezione: string[] = [];
  let dir = absDir;
  while (dir !== APP_DIR && dir.length >= APP_DIR.length) {
    const kandydat = join(dir, "layout.tsx");
    try {
      statSync(kandydat);
      znalezione.push(kandydat);
    } catch {
      // brak layoutu na tym poziomie — idź wyżej
    }
    const rodzic = dirname(dir);
    if (rodzic === dir) break;
    dir = rodzic;
  }
  return znalezione.reverse(); // korzeń → liść
}

function doSpecyfikatoraImportu(absPlik: string): string {
  const relFrontend = relative(join(APP_DIR, ".."), absPlik).split(sep).join("/");
  return `@/${relFrontend.replace(/\.tsx$/, "")}`;
}

function wykryjTrasy(dir = APP_DIR): OdkrytaTrasa[] {
  const wynik: OdkrytaTrasa[] = [];
  for (const wpis of readdirSync(dir, { withFileTypes: true })) {
    const absPelna = join(dir, wpis.name);
    if (wpis.isDirectory()) {
      wynik.push(...wykryjTrasy(absPelna));
      continue;
    }
    if (wpis.name !== "page.tsx") continue;

    const relDir = relative(APP_DIR, dir);
    const segmenty = segmentyUrl(relDir);
    const url = "/" + segmenty.join("/");
    const dynamiczna = segmenty.some((s) => s.startsWith("[") && s.endsWith("]"));

    const zrodloStrony = readFileSync(absPelna, "utf8");
    const przekierowanieSerwera = /^import\s*\{\s*redirect\s*\}\s*from\s*"next\/navigation";/m.test(
      zrodloStrony,
    );

    const layoutyPliki = lancuchLayoutow(dir);
    const layoutyZrodla = layoutyPliki.map((p) => readFileSync(p, "utf8"));
    const bramkaRoli = layoutyZrodla.some(
      (src) => src.includes("RequireRole") && src.includes("PanelShell"),
    );

    wynik.push({
      url,
      importPage: doSpecyfikatoraImportu(absPelna),
      importLayouty: layoutyPliki.map(doSpecyfikatoraImportu),
      dynamiczna,
      bramkaRoli,
      przekierowanieSerwera,
    });
  }
  return wynik;
}

const WSZYSTKIE = wykryjTrasy();

/**
 * STRAŻNIK LICZBY, NIE ISTNIENIA. Zmierzone dziś (`npx vitest run
 * __tests__/punkty-orientacyjne-tresc.test.tsx`, 2026-09-18, linia
 * `[punkty-orientacyjne] trasy znalezione: 46`): `wykryjTrasy()` znajduje
 * 46 tras. `toBeGreaterThan(0)` przepuściłby zielono nawet listę skurczoną
 * do jednej trasy (podział na kubełki jest tożsamościowy — suma ZAWSZE się
 * zgadza, to nie jest realny strażnik). Próg niżej pada, gdy detekcja
 * znajdzie MNIEJ tras niż dziś — dowód czerwieni i cofnięcie opisane w
 * meldunku zlecenia, nie w tym pliku.
 */
const MINIMUM_TRAS_ZMIERZONE_DZIS = 46;

// Meldunek o zasięgu przyrządu — zawsze w wyniku biegu, nie tylko gdy coś
// jest czerwone. Bez tego "nieobjęte" znika po cichu w logu, którego nikt
// nie czyta w całości.
const POMINIETE_DYNAMICZNE = WSZYSTKIE.filter((t) => t.dynamiczna);
const POMINIETE_BRAMKA = WSZYSTKIE.filter((t) => !t.dynamiczna && t.bramkaRoli);
const POMINIETE_PRZEKIEROWANIE = WSZYSTKIE.filter(
  (t) => !t.dynamiczna && !t.bramkaRoli && t.przekierowanieSerwera,
);
const DO_ZMIERZENIA = WSZYSTKIE.filter(
  (t) => !t.dynamiczna && !t.bramkaRoli && !t.przekierowanieSerwera,
);

// eslint-disable-next-line no-console
console.log(
  [
    `[punkty-orientacyjne] trasy znalezione: ${WSZYSTKIE.length}`,
    `[punkty-orientacyjne] pominięte (segment dynamiczny): ${POMINIETE_DYNAMICZNE.length} — ${POMINIETE_DYNAMICZNE.map((t) => t.url).join(", ") || "brak"}`,
    `[punkty-orientacyjne] pominięte (bramka RequireRole PRZED punktem orientacyjnym, ten sam plik): ${POMINIETE_BRAMKA.length} — ${POMINIETE_BRAMKA.map((t) => t.url).join(", ") || "brak"}`,
    `[punkty-orientacyjne] pominięte (przekierowanie serwera, brak DOM): ${POMINIETE_PRZEKIEROWANIE.length} — ${POMINIETE_PRZEKIEROWANIE.map((t) => t.url).join(", ") || "brak"}`,
    `[punkty-orientacyjne] objęte pomiarem: ${DO_ZMIERZENIA.length} — ${DO_ZMIERZENIA.map((t) => t.url).join(", ")}`,
  ].join("\n"),
);

const getSession = vi.fn();
const signIn = vi.fn();
const push = vi.fn();
const replace = vi.fn();
const checkAccountBinding = vi.fn();
const endSession = vi.fn();
const fetchWhoAmI = vi.fn();
const apiMock = vi.fn();

vi.mock("next-auth/react", () => ({
  getSession: (...args: unknown[]) => getSession(...args),
  signIn: (...args: unknown[]) => signIn(...args),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/instrument",
  notFound: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: (...args: unknown[]) => apiMock(...args),
    checkAccountBinding: (...args: unknown[]) => checkAccountBinding(...args),
    endSession: (...args: unknown[]) => endSession(...args),
    fetchWhoAmI: (...args: unknown[]) => fetchWhoAmI(...args),
  };
});

const { ApiError } = await import("@/lib/api");

beforeEach(() => {
  // Atrapa generyczna domyślna: rozstrzygnięty stan błędu ogólnego (bez
  // zawieszonych obietnic i bez prawdziwej nawigacji `window.location`).
  // Rządzi testem punktu orientacyjnego (`main#tresc`) na WSZYSTKICH 21
  // trasach bez wyjątku — zmierzone: obecność `main#tresc` nie zależy od
  // wyniku `api()` na żadnej z nich (siedzi w layoucie, nie w komponencie
  // strony, patrz komentarz na górze pliku o łańcuchu warstw). Rządzi też
  // testem `h1` na 15 z 21 tras — zmierzone: te 15 przechodzi test `h1` przy
  // tej właśnie atrapie odrzucającej, więc ich `h1` też nie zależy od
  // sukcesu `api()`. Dla pozostałych sześciu tras (`REALISTYCZNE_LADUNKI`
  // niżej, w teście `h1` podmieniane PRZED renderem) ta atrapa domyślna NIE
  // wystarcza — zmierzone osobno w komentarzu na górze pliku, z podziałem
  // na dwie trasy z `h1` bezwarunkowym i cztery z `h1` zależnym od sukcesu.
  // Test czyta DOM przez `waitFor` (nie z pierwszego, synchronicznego
  // renderu) w teście `h1` — patrz uzasadnienie przy `queryAllByRole` niżej
  // w pliku. Test `main#tresc` zostaje synchroniczny: na 10 tras z layoutem
  // w łańcuchu (`/panel/...`) `main#tresc` pochodzi z JSX layoutu, poza
  // jakimkolwiek `if` warunkowanym stanem — sprawdzone czytaniem źródła
  // każdego layoutu w łańcuchu (to samo źródło, na którym stoi `bramkaRoli`
  // wyżej). Na pozostałych 11 tras (bez layoutu, `importLayouty` puste)
  // `main#tresc` pochodzi wprost ze strony i albo jest w DOM od razu, albo
  // wcale — 9 z tych 11 to dziś znane czerwienie main-landmarku (brak
  // `id="tresc"` w źródle strony, poza zakresem tej naprawy), którym
  // czekanie nie pomoże. Ten test NIE był osobno mierzony przez porównanie
  // „zaraz po renderze” z „po `waitFor`” dla wszystkich 21 tras.
  getSession.mockReset().mockResolvedValue(null);
  signIn.mockReset();
  push.mockReset();
  replace.mockReset();
  checkAccountBinding.mockReset().mockResolvedValue(null);
  endSession.mockReset().mockResolvedValue(undefined);
  fetchWhoAmI.mockReset().mockResolvedValue({ sub: "sub-instrument", roles: [] });
  apiMock
    .mockReset()
    .mockRejectedValue(
      new ApiError({ status: 500, code: "instrument", message: "Zamockowana odpowiedź ogólna." }),
    );
});

/**
 * Realistyczne odpowiedzi `api()` — zmierzone pojedynczo dla każdej z
 * sześciu tras (patrz komentarz u góry pliku), NIE ten sam powód dla
 * wszystkich sześciu. Klucz: `url` z `wykryjTrasy()`. Każda funkcja
 * podmienia `apiMock` na implementację świadomą ścieżki, z tym samym
 * odrzuceniem generycznym dla ścieżek spoza kontraktu danej trasy (żeby
 * efekty uboczne inne niż te opisane w kontrakcie — np. `GET
 * /supervision/slots` na pulpicie — nadal kończyły się zwykłym, spokojnym
 * błędem, tak jak przed podmianą).
 *
 * ZASTRZEŻENIE O ZAKRESIE (`/panel/staz`, `/panel/superwizja`): `h1` w tych
 * dwóch komponentach jest bezwarunkowy (patrz komentarz u góry pliku) —
 * nie zależy od żadnego wywołania `api()` poza `/me`, którego potrzebuje
 * WYŁĄCZNIE `RequireRole` w layoucie, żeby przejść w stan „allowed”. Te
 * dwie funkcje podstawiają WIĘC TYLKO `/me`, a każdy INNY punkt końcowy
 * (np. `/internship/entries`, `/supervision/slots`) zostaje odrzucony jak
 * w atrapie domyślnej. Te dwie nogi `h1` mierzą więc PRZEJŚCIE PRZEZ
 * BRAMKĘ ROLI, nie zachowanie ekranu z prawdziwymi danymi treści — dla
 * pozostałych czterech wpisów (`/panel/pulpit`, `/panel/profil`,
 * `/panel/certyfikat`, `/panel/profil-psychologa`) mapa faktycznie
 * podstawia i punkt tożsamości, i własny punkt końcowy treści danej trasy,
 * bo tam `h1` zależy od obu.
 */
const REALISTYCZNE_LADUNKI: Record<string, () => void> = {
  "/panel/pulpit": () => {
    apiMock.mockImplementation((path: string) => {
      if (path === "/me") return Promise.resolve({ first_name: "Zmierzona", role: "student" });
      if (path.startsWith("/courses")) return Promise.resolve([]);
      return Promise.reject(
        new ApiError({ status: 500, code: "instrument", message: "Zamockowana odpowiedź ogólna." }),
      );
    });
  },
  "/panel/profil": () => {
    apiMock.mockImplementation((path: string) => {
      if (path === "/me") {
        return Promise.resolve({
          id: 1,
          first_name: "Zmierzona",
          last_name: "Testowa",
          email: "zmierzona@example.test",
          role: "student",
          phone: null,
          pesel: null,
          address: { street: null, city: null, zip: null },
          access_expires_at: null,
          program_completed_at: null,
          product_group: "podstawowy",
          consents: [],
        });
      }
      return Promise.reject(
        new ApiError({ status: 500, code: "instrument", message: "Zamockowana odpowiedź ogólna." }),
      );
    });
  },
  "/panel/certyfikat": () => {
    apiMock.mockImplementation((path: string) => {
      if (path === "/me") return Promise.resolve({ role: "volunteer" });
      if (path === "/certificate/conditions") {
        return Promise.resolve({ eligible: true, conditions: [] });
      }
      return Promise.reject(
        new ApiError({ status: 500, code: "instrument", message: "Zamockowana odpowiedź ogólna." }),
      );
    });
  },
  "/panel/staz": () => {
    apiMock.mockImplementation((path: string) => {
      if (path === "/me") return Promise.resolve({ role: "volunteer" });
      return Promise.reject(
        new ApiError({ status: 500, code: "instrument", message: "Zamockowana odpowiedź ogólna." }),
      );
    });
  },
  "/panel/superwizja": () => {
    apiMock.mockImplementation((path: string) => {
      if (path === "/me") return Promise.resolve({ role: "volunteer" });
      return Promise.reject(
        new ApiError({ status: 500, code: "instrument", message: "Zamockowana odpowiedź ogólna." }),
      );
    });
  },
  "/panel/profil-psychologa": () => {
    apiMock.mockImplementation((path: string) => {
      if (path === "/me") return Promise.resolve({ role: "volunteer" });
      if (path === "/psychologist-profile") {
        return Promise.resolve({
          eligible: true,
          specializations: [],
          approach: null,
          city: null,
          bio: null,
          publication_consent_granted: false,
          status: "draft",
          return_reason: null,
          documents: [],
          created_at: null,
          updated_at: null,
        });
      }
      return Promise.reject(
        new ApiError({ status: 500, code: "instrument", message: "Zamockowana odpowiedź ogólna." }),
      );
    });
  },
};

/** Renderuje stronę zagnieżdżoną we WSZYSTKICH layoutach łańcucha, korzeń
 * na zewnątrz — dokładnie tak, jak składa je Next.js. */
async function renderujTrase(importPage: string, importLayouty: string[]) {
  const Page = (await import(/* @vite-ignore */ importPage)).default;
  const Layouty = await Promise.all(
    importLayouty.map(async (spec) => (await import(/* @vite-ignore */ spec)).default),
  );

  let drzewo = <Page />;
  for (let i = Layouty.length - 1; i >= 0; i--) {
    const Layout = Layouty[i];
    drzewo = <Layout>{drzewo}</Layout>;
  }
  render(drzewo);
}

describe.each(DO_ZMIERZENIA)("$url", ({ url, importPage, importLayouty }) => {
  it(`ma dokładnie jeden punkt orientacyjny treści (rola "main" pod id="tresc"), na który wskazuje skip-link`, async () => {
    await renderujTrase(importPage, importLayouty);

    const wszystkieMain = screen.queryAllByRole("main");
    const punktOrientacyjny = wszystkieMain.filter((el) => el.id === "tresc");

    expect(
      punktOrientacyjny,
      `${url}: oczekiwano dokładnie jednego elementu z rolą "main" i id="tresc" ` +
        `(cel skip-linku „Przejdź do treści” z PanelShell), znaleziono ${punktOrientacyjny.length} ` +
        `(elementów z rolą "main" w ogóle: ${wszystkieMain.length}). Bez tego punktu czytnik ekranu ` +
        `nie ma dokąd przeskoczyć i słucha całego ekranu od nagłówka za każdym wejściem.`,
    ).toHaveLength(1);
  });

  it("ma dokładnie jeden nagłówek główny (h1) — dla porównania z punktem orientacyjnym powyżej", async () => {
    // Trasy, których `h1` renderuje się dopiero po udanym pobraniu, dostają
    // tu realistyczną atrapę zamiast generycznego odrzucenia z `beforeEach`
    // — zmierzone osobno, patrz `REALISTYCZNE_LADUNKI` i komentarz u góry
    // pliku. Reszta tras zostaje na atrapie generycznej bez zmian.
    REALISTYCZNE_LADUNKI[url]?.();

    await renderujTrase(importPage, importLayouty);

    // `queryAllByRole` (nie `getAllByRole`) NIE rzuca, gdy nic nie znajdzie
    // — inaczej komunikat `expect` niżej nigdy by nie padał: wyjątek
    // przerywałby test wcześniej, zanim asercja go użyje. `waitFor` daje
    // czas na rozstrzygnięcie efektów (patrz komentarz u góry pliku o tym,
    // że samo czekanie bez realistycznej atrapy i tak nie wystarcza).
    const naglowki = await waitFor(
      () => {
        const znalezione = screen.queryAllByRole("heading", { level: 1 });
        if (znalezione.length === 0) throw new Error("jeszcze brak h1");
        return znalezione;
      },
      { timeout: 1000 },
    ).catch(() => screen.queryAllByRole("heading", { level: 1 }));

    expect(
      naglowki,
      `${url}: oczekiwano dokładnie jednego <h1>, znaleziono ${naglowki.length}.`,
    ).toHaveLength(1);
  });
});

describe("zasięg przyrządu — trasy wypisane z nazwy jako nieobjęte", () => {
  it("każda pominięta trasa ma podaną przyczynę, a suma się zgadza z liczbą znalezionych", () => {
    const suma =
      POMINIETE_DYNAMICZNE.length +
      POMINIETE_BRAMKA.length +
      POMINIETE_PRZEKIEROWANIE.length +
      DO_ZMIERZENIA.length;

    // Ten warunek jest tożsamościowy (podział na kubełki zawsze się zsumuje
    // do WSZYSTKIE.length) — pilnuje SPÓJNOŚCI klasyfikacji, nie liczby tras.
    // Prawdziwym strażnikiem liczby jest asercja niżej.
    expect(suma, "każda znaleziona trasa ma trafić do DOKŁADNIE jednej z czterech grup").toBe(
      WSZYSTKIE.length,
    );
  });

  it("liczba wykrytych tras nie spadła poniżej zmierzonej dziś wartości", () => {
    expect(
      WSZYSTKIE.length,
      `wykryjTrasy() znalazło ${WSZYSTKIE.length} tras, a zmierzona dziś wartość to ` +
        `${MINIMUM_TRAS_ZMIERZONE_DZIS} — lista tras SKURCZYŁA SIĘ względem pomiaru z dziś ` +
        `(${MINIMUM_TRAS_ZMIERZONE_DZIS} → ${WSZYSTKIE.length}); przyrząd przestał widzieć część ` +
        `ekranów aplikacji zamiast zgłosić ich zniknięcie.`,
    ).toBeGreaterThanOrEqual(MINIMUM_TRAS_ZMIERZONE_DZIS);
  });
});
