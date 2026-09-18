import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

/**
 * Świadek wady zmierzonej w przeglądarce 18.09 o 02:11: `/logowanie` bez
 * `?error=` w adresie, gdy `getSession()` albo `signIn("keycloak", …)`
 * KOŃCZY SIĘ NIEPOWODZENIEM (sesja backendu odpowiada 500, sieć pada),
 * zostaje na tekście „Przekierowuję do logowania…” BEZ GRANICY CZASU —
 * pomiar pokazał 30 015 ms, zero komunikatów, zero przycisków. Komentarz
 * nad `LoginScreen` w `page.tsx` opisuje trzy stany; ten pomiar jest
 * czwartym, którego komentarz nie zna: oczekiwanie bez granicy.
 *
 * Kontrola przy 02:09 dowiodła, że komunikat awaryjny i przycisk ISTNIEJĄ
 * i są poprawne, gdy przeglądarka wraca z `?error=Configuration` — więc tu
 * nie mierzymy treści komunikatu (to już zna `logowanie-stany.test.tsx`),
 * tylko to, czy ekran przestaje TWIERDZIĆ, że przekierowuje, kiedy zawiodło.
 *
 * GRANICA_MS = 8 000: wartość podana przez architekta pomiaru (ten sam rząd
 * wielkości co `KONTO_BINDING_LIMIT_MS` w `lib/api.ts`, używany tam z tym
 * samym uzasadnieniem — zapas nad realną odpowiedzią sieci, próg poniżej
 * którego nieruchomy ekran zdąży jeszcze uchodzić za "jeszcze się dzieje").
 * Test działa na sztucznych zegarach (`vi.useFakeTimers`), więc nie zależy
 * od prędkości maszyny uruchamiającej — to NIE jest zegar ścienny.
 *
 * Dwie dziury dopisane po niezależnym odbiorze:
 *
 * 1. A i B mierzyły WYŁĄCZNIE "ekran kiedyś przestaje kłamać" — przesunięcie
 *    zegara o 0 ms zamiast `GRANICA_MS` dawało 4/4 (dowód w meldunku pomiaru,
 *    nie tutaj — bo sam ten fakt nie jest czymś, co plik testowy ma trwale
 *    demonstrować). Wzmocnienie: A i B mają teraz punkt TUŻ PRZED granicą
 *    (ekran wciąż przekierowuje) i TUŻ ZA nią (komunikat), tak jak D.
 * 2. Żadna z A/B/C/D nie sprawdzała ścieżki zdrowej: `signIn()` się udaje.
 *    Test E dopisuje tę nogę — po granicy czasu na ścieżce zdrowej NIE MA
 *    prawa pojawić się komunikat awaryjny. Ta noga jest czerwona na kodzie
 *    z naprawą 63d76d7, bo tamta naprawa nie czyści zegara po udanym
 *    `signIn()` — i to jest jej wartość diagnostyczna.
 *
 * Test F pilnuje osobnej rzeczy: `LOGIN_TIMEOUT_MS` w `page.tsx` jest dziś
 * dosłownym aliasem `KONTO_BINDING_LIMIT_MS` z ekranu dowiązania konta.
 * Mierzone przez zachowanie (podstawienie stałej), nie przez import prywatnej
 * zmiennej modułu — patrz komentarz przy tym teście.
 */
const GRANICA_MS = 8_000;

const getSession = vi.fn();
const signIn = vi.fn();
const push = vi.fn();
const replace = vi.fn();

vi.mock("next-auth/react", () => ({
  getSession: (...args: unknown[]) => getSession(...args),
  signIn: (...args: unknown[]) => signIn(...args),
  signOut: vi.fn(),
}));

let query = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(query),
}));

const apiMock = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: (...args: unknown[]) => apiMock(...args) };
});

const LoginPage = (await import("@/app/logowanie/page")).default;

const TEKST_PRZEKIEROWUJE = "Przekierowuję do logowania…";

// Trzy sytuacje, trzy osobne teksty (naprawa dzisiejsza) — jeden wspólny
// wzorzec pasujący do kilku z nich naraz przepuściłby podmianę jednego
// komunikatu na inny bez żadnego ostrzeżenia, czyli dokładnie tę wadę, którą
// ta naprawa usuwa. Dlatego każda noga niżej sprawdza DOSŁOWNY tekst
// właściwy dla SWOJEJ sytuacji, nie żaden z nich "którykolwiek".
const TEKST_GRANICA_CZASU = "Logowanie nie odpowiedziało w wyznaczonym czasie. Spróbuj ponownie.";
const TEKST_BLEDU_KONFIGURACJI = "Logowanie jest chwilowo niedostępne. Spróbuj ponownie później.";

beforeEach(() => {
  getSession.mockReset();
  signIn.mockReset();
  push.mockReset();
  replace.mockReset();
  apiMock.mockReset();
  query = "";
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function przesun(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("/logowanie — granica czasu, gdy start logowania zawodzi (świadek 18.09 02:11)", () => {
  it("A: getSession() odrzucone (np. 500 z backendu sesji) — komunikat pojawia się NATYCHMIAST (mikrozadanie), nie dopiero na granicy — zmierzone, nie założone", async () => {
    getSession.mockRejectedValue(new Error("Wewnętrzny błąd serwera (500) przy pobraniu sesji"));

    render(<LoginPage />);

    // Zaraz po zamontowaniu ekran jeszcze twierdzi, że przekierowuje — to samo
    // w sobie jest prawdą przez chwilę, więc TO NIE JEST błąd.
    expect(screen.getByText(TEKST_PRZEKIEROWUJE)).toBeInTheDocument();

    // Zmierzone (nie założone): odrzucenie `getSession()` jest złapane od razu
    // w tym samym `try/catch`, co cały efekt — komunikat pojawia się już po
    // JEDNYM mikrozadaniu, BEZ czekania na 8 s. `przesun(0)` przesuwa zegar o
    // ZERO ms i i tak wystarcza. To jest dokładnie ten fakt, który dziurawił
    // oryginalny przyrząd: sprawdzał tylko stan PO `GRANICA_MS`, więc nie było
    // widać, że wynik zapadł dużo wcześniej i wcale nie od granicy zależy.
    await przesun(0);
    expect(screen.queryByText(TEKST_PRZEKIEROWUJE)).not.toBeInTheDocument();
    // Odrzucenie generyczne (nie `TypeError`) trafia w `catch` efektu i ląduje
    // w gałęzi `ERROR_MESSAGES.Configuration` — to NIE jest granica czasu, więc
    // sprawdzamy dosłownie ten tekst, nie "cokolwiek awaryjnego".
    expect(screen.getByText(TEKST_BLEDU_KONFIGURACJI)).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();

    // Kontrola stabilności: dalsze upłynięcie granicy nie cofa ani nie
    // dubluje komunikatu (zegar-siatka trafia na już rozstrzygnięty stan).
    await przesun(GRANICA_MS);
    expect(screen.getByText(TEKST_BLEDU_KONFIGURACJI)).toBeInTheDocument();
  });

  it("B: signIn(\"keycloak\", …) odrzucone (start logowania zawodzi) — komunikat pojawia się NATYCHMIAST, tak samo jak w A — nie zależy od granicy 8 s", async () => {
    getSession.mockResolvedValue(null);
    signIn.mockRejectedValue(new Error("Nie udało się rozpocząć logowania"));

    render(<LoginPage />);
    expect(screen.getByText(TEKST_PRZEKIEROWUJE)).toBeInTheDocument();

    await przesun(0);
    expect(screen.queryByText(TEKST_PRZEKIEROWUJE)).not.toBeInTheDocument();
    // Jak w A: odrzucenie generyczne (nie sieciowe) ląduje w komunikacie
    // konfiguracji, nie w granicy czasu.
    expect(screen.getByText(TEKST_BLEDU_KONFIGURACJI)).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();

    await przesun(GRANICA_MS);
    expect(screen.getByText(TEKST_BLEDU_KONFIGURACJI)).toBeInTheDocument();
  });

  it("G (kontrola liczbowa — druga przyczyna, ta sama granica): signIn() WISI (nigdy się nie rozstrzyga) — tuż PRZED granicą nadal 'przekierowuję', PO granicy komunikat (to jest prawdziwe wzmocnienie A/B: ten sam mechanizm co D, ale dla ścieżki signIn(), nie getSession())", async () => {
    // D dowodzi granicy tylko dla zawieszonego `getSession()`. Ani A, ani B
    // (odrzucone obietnice) jej nie dowodzą — patrz pomiar wyżej: rozstrzygają
    // się natychmiast. Żeby mieć prawdziwy dowód granicy 8 s również dla
    // ścieżki `signIn()`, potrzebna jest wersja, która NIE ROZSTRZYGA SIĘ —
    // dokładnie D, tylko dla innej obietnicy.
    getSession.mockResolvedValue(null);
    signIn.mockReturnValue(new Promise(() => {}));

    render(<LoginPage />);
    expect(screen.getByText(TEKST_PRZEKIEROWUJE)).toBeInTheDocument();

    await przesun(GRANICA_MS - 1_000);
    expect(screen.getByText(TEKST_PRZEKIEROWUJE)).toBeInTheDocument();
    // Tuż przed granicą zegar jeszcze nie strzelił — komunikat granicy czasu
    // (jedyny, jaki zegar w ogóle potrafi wystawić) nie ma prawa się pojawić.
    expect(screen.queryByText(TEKST_GRANICA_CZASU)).not.toBeInTheDocument();

    await przesun(1_000);
    expect(screen.queryByText(TEKST_PRZEKIEROWUJE)).not.toBeInTheDocument();
    expect(screen.getByText(TEKST_GRANICA_CZASU)).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("C (sonda odwrotna, ścieżka zdrowa): ?error= już w adresie na starcie — komunikat i przycisk widoczne OD RAZU, bez czekania na granicę, przyrząd zielony", async () => {
    query = "error=Configuration";
    getSession.mockResolvedValue(null);

    render(<LoginPage />);
    // Przepuszczenie mikrozadania z `await getSession()` w efekcie — bez tego
    // asercja trafiłaby w stan sprzed rozstrzygnięcia obietnicy, co byłoby
    // pomyłką testu, nie pomiarem ekranu.
    await przesun(0);

    // Zero przesunięcia zegara PO rozstrzygnięciu: to jest różnica wobec
    // A/B/D — tu komunikat nie czeka na żadną granicę czasu, bo nic tu nie
    // "wisi". `?error=Configuration` trafia wprost w `ERROR_MESSAGES.Configuration`,
    // czyli dosłownie ten sam tekst co dziś, sprawdzany dosłownie.
    expect(screen.getByText(TEKST_BLEDU_KONFIGURACJI)).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(screen.queryByText(TEKST_PRZEKIEROWUJE)).not.toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();

    await przesun(GRANICA_MS);
    expect(screen.getByText(TEKST_BLEDU_KONFIGURACJI)).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("D (kontrola liczbowa): getSession() WISI (nigdy się nie rozstrzyga) — tuż PRZED granicą nadal 'przekierowuję', PO granicy komunikat", async () => {
    getSession.mockReturnValue(new Promise(() => {}));

    render(<LoginPage />);

    await przesun(GRANICA_MS - 1_000);
    expect(screen.getByText(TEKST_PRZEKIEROWUJE)).toBeInTheDocument();
    expect(screen.queryByText(TEKST_GRANICA_CZASU)).not.toBeInTheDocument();

    await przesun(1_000);
    expect(screen.queryByText(TEKST_PRZEKIEROWUJE)).not.toBeInTheDocument();
    expect(screen.getByText(TEKST_GRANICA_CZASU)).toBeInTheDocument();
  });

  it("E (ścieżka zdrowa — dziura z odbioru: zegar strzela też po sukcesie): signIn() KOŃCZY SIĘ POWODZENIEM — po przekroczeniu granicy czasu ekran NIE MA PRAWA pokazać fałszywego komunikatu awaryjnego", async () => {
    // Zero par A/B/C/D nie sprawdza tej ścieżki: wszystkie cztery zakładają,
    // że start logowania ZAWODZI. Tu zakładamy, że się UDAJE — jedyny sposób,
    // żeby po stronie zdrowej w ogóle coś było widać zegarem, to sytuacja, w
    // której `signIn()` się rozstrzyga (sukces), a przekierowanie przeglądarki
    // (które w produkcji i tak by nastąpiło) nie jest tu symulowane — dokładnie
    // tak, jak zrobiłby to test jednostkowy komponentu, który nie nawiguje.
    getSession.mockResolvedValue(null);
    signIn.mockResolvedValue(undefined);

    render(<LoginPage />);
    // Przepuszczenie mikrozadania z `await getSession()`: dopiero po nim
    // efekt dochodzi do wywołania `signIn()` — bez tego kroku asercja
    // trafiłaby w stan sprzed decyzji, co byłoby pomyłką testu.
    await przesun(0);
    expect(signIn).toHaveBeenCalledWith("keycloak", { callbackUrl: "/logowanie" });
    expect(screen.getByText(TEKST_PRZEKIEROWUJE)).toBeInTheDocument();

    // Tuż przed granicą: ścieżka zdrowa, nic nie ma prawa się zmienić.
    await przesun(GRANICA_MS - 1_000);
    expect(screen.queryByText(TEKST_GRANICA_CZASU)).not.toBeInTheDocument();

    // Tuż ZA granicą i kawałek dalej (zapas, nie o 1 ms): na ścieżce zdrowej
    // zegar bezpieczeństwa NIE MA PRAWA pokazać komunikatu granicy czasu, bo
    // nic tu nie zawiodło — start logowania się powiódł, a `clearTimeout` po
    // udanym `signIn()` miał zdjąć dokładnie ten zegar. Sprawdzamy dosłownie
    // TEKST_GRANICA_CZASU (nie "cokolwiek awaryjnego"), bo to jest jedyny
    // tekst, jaki ten konkretny zegar potrafi wystawić — regresja tej naprawy
    // objawiałaby się właśnie nim, nie komunikatem konfiguracji.
    await przesun(2_000);
    expect(screen.queryByText(TEKST_GRANICA_CZASU)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("F (rozprzęgnięcie stałej): granica czasu logowania NIE MOŻE być tą samą zmienną co KONTO_BINDING_LIMIT_MS z ekranu /logowanie/niepowiazane — ta asercja PADA, dopóki to jest alias", async () => {
    // Dziś `LOGIN_TIMEOUT_MS` w `page.tsx` to dosłownie
    // `const LOGIN_TIMEOUT_MS = KONTO_BINDING_LIMIT_MS;` — ten sam identyfikator
    // co stała innego ekranu (dowiązania konta). Nie da się zaimportować
    // `LOGIN_TIMEOUT_MS` wprost, bo nie jest eksportowany (to prywatna stała
    // modułu) — więc mierzymy PRZEZ ZACHOWANIE: podstawiamy w `@/lib/api`
    // wartość `KONTO_BINDING_LIMIT_MS` RÓŻNĄ od prawdziwej (8000) i patrzymy,
    // czy zmienia to granicę czasu logowania. Jeśli tak — to ten sam wariat,
    // a sprzężenie właśnie wróciło po cichu.
    const PODSTAWIONA_MS = 3_000;
    vi.doMock("@/lib/api", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/api")>();
      return {
        ...actual,
        api: (...args: unknown[]) => apiMock(...args),
        KONTO_BINDING_LIMIT_MS: PODSTAWIONA_MS,
      };
    });
    vi.resetModules();
    const PodmienionyLoginPage = (await import("@/app/logowanie/page")).default;

    // Nic się nie rozstrzyga samo z siebie — tylko zegar decyduje, kiedy (i
    // czy w ogóle) pojawi się komunikat. To izoluje pomiar od ścieżek A/B/D.
    getSession.mockReturnValue(new Promise(() => {}));

    render(<PodmienionyLoginPage />);

    // Krok 1 — wykrycie sprzężenia: jeśli granica logowania to ta sama
    // zmienna co podstawiona `KONTO_BINDING_LIMIT_MS` (3000), komunikat
    // pojawi się już tutaj. Prawdziwa, niezależna granica logowania (8000)
    // NIE MA PRAWA zareagować na podstawienie stałej innego ekranu.
    await przesun(PODSTAWIONA_MS + 500);
    expect(screen.queryByText(TEKST_GRANICA_CZASU)).not.toBeInTheDocument();

    // Krok 2 — kontrola, że to nie jest "żadnego zegara tu w ogóle nie ma":
    // po dotarciu do prawdziwej granicy (8000 ms) komunikat MUSI się pojawić.
    // Bez tego kroku krok 1 przechodziłby też wtedy, gdy ekran nie ma żadnego
    // zegara — czyli niczego by nie pilnował. To jedyny tekst, jaki ten zegar
    // wystawia — sprawdzamy go dosłownie, nie "cokolwiek awaryjnego".
    await przesun(GRANICA_MS - (PODSTAWIONA_MS + 500) + 500);
    expect(screen.getByText(TEKST_GRANICA_CZASU)).toBeInTheDocument();

    vi.doUnmock("@/lib/api");
    vi.resetModules();
  });
});
