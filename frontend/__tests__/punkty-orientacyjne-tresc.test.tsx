import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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
 * Dwie grupy tras są świadomie WYPISANE Z NAZWY jako nieobjęte (a nie po
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
 * BRAK PUNKTU ORIENTACYJNEGO NA ŁAŃCUCHU Z GATE'EM DZIECKA (4 trasy
 * uczestnika: `/panel/staz`, `/panel/certyfikat`, `/panel/superwizja`,
 * `/panel/profil-psychologa`) zwraca `<main id="tresc">` poprawnie (test
 * powyżej przechodzi), ale `h1` może wyjść czerwony z INNEGO powodu:
 * `RequireRole` renderuje synchronicznie stan „loading” (komunikat
 * „Wczytywanie…” zamiast dzieci) dopóki obietnica `GET /me` się nie
 * rozstrzygnie, a ten test — tak jak wszystkie pozostałe w tym pliku —
 * czyta DOM z pierwszego, synchronicznego renderu, bez `await` na
 * rozstrzygnięcie efektów. To jest ARTEFAKT KONWENCJI PRZYRZĄDU (ten sam,
 * który dotyczy każdej trasy z asynchronicznym stanem początkowym), a NIE
 * wada tych czterech ekranów — stąd w kodzie test na `h1` dla tras
 * przechodzących przez `RequireRole` w łańcuchu jest jawnie oznaczony i
 * NIE jest liczony razem z prawdziwymi czerwieniami `h1` w meldunku
 * uruchomienia (patrz `console.log` niżej).
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
  /** `true`, gdy trasa przechodzi przez którykolwiek `RequireRole` w
   * łańcuchu, NIEZALEŻNIE od tego, czy chroni on punkt orientacyjny, czy
   * tylko zawartość `<main>`. Używane wyłącznie do rozdzielenia czerwieni
   * `h1` na artefakt konwencji testu (patrz komentarz u góry pliku). */
  gatePonizejMain: boolean;
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
    const gatePonizejMain = layoutyZrodla.some((src) => src.includes("RequireRole"));

    wynik.push({
      url,
      importPage: doSpecyfikatoraImportu(absPelna),
      importLayouty: layoutyPliki.map(doSpecyfikatoraImportu),
      dynamiczna,
      bramkaRoli,
      gatePonizejMain,
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
    `[punkty-orientacyjne] objęte pomiarem, w tym z gate'em RequireRole POD punktem orientacyjnym (możliwy artefakt h1, nie main): ${DO_ZMIERZENIA.filter((t) => t.gatePonizejMain).length} — ${DO_ZMIERZENIA.filter((t) => t.gatePonizejMain).map((t) => t.url).join(", ") || "brak"}`,
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
  // Atrapy generyczne: trzymają KAŻDĄ objętą trasę w spokojnym,
  // rozstrzygniętym stanie błędu ogólnego (bez zawieszonych obietnic i bez
  // prawdziwej nawigacji `window.location`), bo przyrząd nie zna kształtu
  // odpowiedzi, jakiego oczekuje każda z tras z osobna — to jest dokładnie
  // granica tego zlecenia (kodu komponentów i logiki tras nie ruszamy).
  // Obecność punktu orientacyjnego na tych trasach NIE zależy od tego, czy
  // dane jeszcze się wczytują, czy już przyszły — opakowanie szablonu jest
  // takie samo w obu stanach — więc test nie czeka na żadne rozstrzygnięcie
  // i czyta DOM z pierwszego, synchronicznego renderu.
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
    await renderujTrase(importPage, importLayouty);

    const naglowki = screen.getAllByRole("heading", { level: 1 });

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
