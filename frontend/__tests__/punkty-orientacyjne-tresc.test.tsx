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
 * ATRAPA `api()` I NAGŁÓWEK GŁÓWNY — ZMIERZONE, NIE ZAŁOŻONE. Sześć tras
 * mierzonych (`/panel/pulpit`, `/panel/profil`, `/panel/certyfikat`,
 * `/panel/staz`, `/panel/superwizja`, `/panel/profil-psychologa`) renderuje
 * `h1` dopiero PO udanym pobraniu danych własnych — a atrapa generyczna
 * (`beforeEach` niżej) domyślnie ODRZUCA każde wywołanie `api()`, więc te
 * komponenty utykają w gałęzi błędu/ładowania bez `h1` NIEZALEŻNIE od tego,
 * czy w łańcuchu jest `RequireRole`, czy nie (`/panel/pulpit` i
 * `/panel/profil` nie mają żadnej bramki roli, a i tak łapią ten sam brak
 * `h1`). Samo doczekanie się rozstrzygnięcia (`await`/`waitFor`) NIE
 * naprawia tego — zmierzone wprost: przy atrapie odrzucającej `GET /me`,
 * `RequireRole` po rozstrzygnięciu obietnicy wchodzi w stan „error” (karta
 * „Nie udało się połączyć z serwerem”), a nie w stan „allowed”, więc `h1`
 * nie pojawia się NIGDY, nie tylko w pierwszym, synchronicznym renderze.
 *
 * Jedyna naprawa, która faktycznie działa (zmierzona `REALISTYCZNE_LADUNKI`
 * niżej): podmiana atrapy na sukces o kształcie, jakiego dana trasa
 * naprawdę oczekuje (`GET /me` z dopuszczoną rolą, `GET /courses`, `GET
 * /certificate/conditions`, `GET /psychologist-profile` — kształty z
 * `lib/pulpit/data.ts`, `lib/courses.ts`, kontraktu H13/H15). Po tej
 * podmianie i doczekaniu się DOM-u (`waitFor` w teście `h1` niżej)
 * WSZYSTKICH SZEŚĆ tras pokazuje dokładnie jeden `h1` — zmierzone
 * `npx vitest run __tests__/punkty-orientacyjne-tresc.test.tsx`, 2026-09-18:
 * zero czerwieni `h1` na tych sześciu trasach. Nie ma tu więc podziału na
 * „wadę ekranu” kontra „artefakt narzędzia" do utrzymania czerwono — cała
 * szóstka była artefaktem DOBORU ŁADUNKU atrapy w tym pliku, nie wadą
 * żadnego z sześciu ekranów. (Osobna, NIEMIERZONA tu obserwacja: w stanie
 * ładowania/błędu te same cztery komponenty poza `PulpitDashboard` i
 * `/panel/profil` też nie mają `h1` — to własność stanu przejściowego
 * całej rodziny ekranów panelu, a nie coś, co ten test — sprawdzający stan
 * PO udanym pobraniu — mierzy albo rozstrzyga.)
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

/**
 * Realistyczne odpowiedzi `api()` dla tras, których `h1` renderuje się
 * dopiero PO udanym pobraniu — zmierzone pojedynczo (patrz komentarz u
 * góry pliku). Klucz: `url` z `wykryjTrasy()`. Każda funkcja podmienia
 * `apiMock` na implementację świadomą ścieżki, z tym samym odrzuceniem
 * generycznym dla ścieżek spoza kontraktu danej trasy (żeby efekty
 * uboczne inne niż te opisane w kontrakcie — np. `GET /supervision/slots`
 * na pulpicie — nadal kończyły się zwykłym, spokojnym błędem, tak jak
 * przed podmianą).
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
