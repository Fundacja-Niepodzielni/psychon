import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, cleanup } from "@testing-library/react";

/** Przesuwa zegar i pod `act`, żeby aktualizacje stanu Reacta zdążyły trafić do DOM przed asercją. */
async function przesunZegar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/**
 * Świadek granicy czasu `/logowanie` (LOGIN_TIMEOUT_MS = 8000 ms).
 *
 * Nie mierzy obecności elementów ("czy jest przycisk") tylko wartości:
 * dokładny tekst komunikatu, dokładna liczba wywołań mocków, dokładny
 * moment (w ms symulowanego zegara), w którym stan się zmienia.
 */

const KOMUNIKAT_TIMEOUT = "Logowanie jest chwilowo niedostępne. Spróbuj ponownie później.";
const ETYKIETA_OCZEKIWANIA = "Przekierowuję do logowania…";

const getSession = vi.fn();
const signIn = vi.fn();
const replace = vi.fn();
const api = vi.fn();
let query = "";

vi.mock("next-auth/react", () => ({
  getSession: (...args: unknown[]) => getSession(...args),
  signIn: (...args: unknown[]) => signIn(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: replace, refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(query),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: (...args: unknown[]) => api(...args) };
});

const { ApiError } = await import("@/lib/api");
const LoginPage = (await import("@/app/logowanie/page")).default;

function nigdyRozstrzygniete<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

beforeEach(() => {
  getSession.mockReset();
  signIn.mockReset();
  replace.mockReset();
  api.mockReset();
  query = "";
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("/logowanie — granica czasu 8000 ms", () => {
  it("rozpoczęcie sesji nigdy się nie rozstrzyga: tuż przed granicą wciąż 'przekierowuję', po granicy komunikat i wyjście", async () => {
    getSession.mockResolvedValue(null);
    signIn.mockReturnValue(nigdyRozstrzygniete());

    vi.useFakeTimers();
    render(<LoginPage />);

    // odsącz mikrozadania (getSession → signIn zawołane), zanim zegar ruszy realnie
    await przesunZegar(0);
    expect(signIn).toHaveBeenCalledTimes(1);

    // 1 ms przed granicą: ekran wciąż twierdzi, że przekierowuje
    await przesunZegar(7_999);
    expect(screen.getByText(ETYKIETA_OCZEKIWANIA)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // przekroczenie granicy o 2 ms
    await przesunZegar(2);
    expect(screen.queryByText(ETYKIETA_OCZEKIWANIA)).not.toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(KOMUNIKAT_TIMEOUT);
    expect(
      screen.getByRole("button", { name: /Zaloguj przez konto Niepodzielni/i }),
    ).toBeInTheDocument();
  });

  it("powodzenie zatrzymuje zegar: po granicy 8000 ms NIE pojawia się komunikat o niedotrzymanym czasie", async () => {
    getSession.mockResolvedValue(null);
    signIn.mockResolvedValue(undefined);

    vi.useFakeTimers();
    render(<LoginPage />);

    await przesunZegar(0);
    expect(signIn).toHaveBeenCalledWith("keycloak", { callbackUrl: "/logowanie" });

    // dużo dalej niż granica
    await przesunZegar(9_000);

    expect(screen.queryByText(KOMUNIKAT_TIMEOUT)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // ekran zostaje w stanie oczekiwania (nawigacja w realnej przeglądarce
    // przerwałaby JS wcześniej) — zegar był zatrzymany, nie ubiegł
    expect(screen.getByText(ETYKIETA_OCZEKIWANIA)).toBeInTheDocument();
  });

  it("błąd natychmiastowy (?error=) pokazuje komunikat od razu, niezależnie od granicy 8000 ms", async () => {
    query = "error=AccessDenied";
    getSession.mockResolvedValue(null);
    signIn.mockReturnValue(nigdyRozstrzygniete());

    vi.useFakeTimers();
    render(<LoginPage />);

    // 1 ms wystarcza na odsączenie mikrozadania getSession() — daleko od 8000 ms
    await przesunZegar(1);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Logowanie zostało anulowane.");
    expect(signIn).not.toHaveBeenCalled();
  });

  it("anulowanie efektu: brak zapisu stanu po odmontowaniu (żadnej nawigacji, zegar skasowany)", async () => {
    let wznowSesje!: (v: unknown) => void;
    const sesja = new Promise((resolve) => {
      wznowSesje = resolve;
    });
    getSession.mockReturnValue(sesja);
    api.mockResolvedValue({ role: "student" });

    vi.useFakeTimers();
    const { unmount } = render(<LoginPage />);

    // odmontowanie ZANIM getSession() się rozstrzygnie
    act(() => {
      unmount();
    });

    // zegar (setTimeout w efekcie) musiał zostać skasowany w funkcji sprzątającej
    expect(vi.getTimerCount()).toBe(0);

    // dopiero teraz sesja się rozstrzyga — gdyby osłona `cancelled` nie
    // działała, poniższe doprowadziłoby do router.replace(...)
    wznowSesje({ user: { id: "u1" }, error: undefined });
    await przesunZegar(0);
    await przesunZegar(0);

    expect(replace).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
  });

  it("WADA DZISIEJSZA (do naprawy przez sesję frontową, nie tu): przerwane połączenie i przekroczony czas pokazują IDENTYCZNY tekst co błąd konfiguracji", async () => {
    // Scenariusz A: połączenie zerwane całkowicie (getSession() odrzuca się,
    // np. przeglądarka offline) — trafia w zewnętrzny catch, linia ok. 156.
    getSession.mockRejectedValue(new TypeError("Failed to fetch"));
    signIn.mockReturnValue(nigdyRozstrzygniete());
    vi.useFakeTimers();
    render(<LoginPage />);
    await przesunZegar(1);
    const tekstZerwanegoPolaczenia = screen.getByRole("alert").textContent;
    cleanup();
    vi.useRealTimers();

    // Scenariusz B: granica czasu (linia ok. 103) — nic się nie rozstrzyga.
    getSession.mockReset();
    signIn.mockReset();
    getSession.mockReturnValue(nigdyRozstrzygniete());
    signIn.mockReturnValue(nigdyRozstrzygniete());
    vi.useFakeTimers();
    render(<LoginPage />);
    await przesunZegar(8_001);
    const tekstGranicyCzasu = screen.getByRole("alert").textContent;

    // Stan dzisiejszy — nie pożądany: człowiek czekający na zawieszone
    // logowanie (zerwane połączenie) dostaje ten sam tekst co przy błędzie
    // konfiguracji, choć konfiguracja jest w porządku. To wada do naprawy.
    expect(tekstZerwanegoPolaczenia).toBe(KOMUNIKAT_TIMEOUT);
    expect(tekstGranicyCzasu).toBe(KOMUNIKAT_TIMEOUT);
    expect(tekstZerwanegoPolaczenia).toBe(tekstGranicyCzasu);
  });
});

// Referencja niewykorzystywana bezpośrednio, ale import musi się udać —
// pilnuje, że mock `@/lib/api` naprawdę re-eksportuje prawdziwą klasę
// `ApiError` (test 401-guard w page.tsx zależy od `instanceof`).
void ApiError;
