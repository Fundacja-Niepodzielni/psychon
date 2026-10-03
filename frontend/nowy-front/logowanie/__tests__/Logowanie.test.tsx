import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { straznikHostow } from "../../wspolne/strona-publiczna/__tests__/hosty";

/**
 * Ekran logowania w nowym wyglądzie: stany (oczekiwanie, błąd z adresu, błąd
 * serwera, brak połączenia, granica czasu, lądowanie wg roli), te same
 * wywołania co stara strona (`signIn("keycloak", { callbackUrl: "/logowanie" })`,
 * `getSession()`, `api("/me")`, `homeForRole`) i zero innych hostów.
 */

const getSession = vi.fn();
const signIn = vi.fn();
vi.mock("next-auth/react", () => ({
  getSession: (...a: unknown[]) => getSession(...a),
  signIn: (...a: unknown[]) => signIn(...a),
}));

const replace = vi.fn();
let zapytanie = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(zapytanie),
}));

const api = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: (...a: unknown[]) => api(...a),
}));

const homeForRole = vi.fn((rola: string | undefined) => `/dom/${rola ?? "brak"}`);
vi.mock("@/lib/home-by-role", () => ({ homeForRole: (r: string | undefined) => homeForRole(r) }));

const { ApiError } = await import("@/lib/api");
const { Logowanie } = await import("../Logowanie");

const SESJA = { user: { id: "17" } };
let straznik: ReturnType<typeof straznikHostow>;

async function pokaz() {
  let wynik: ReturnType<typeof render> | undefined;
  await act(async () => {
    wynik = render(<Logowanie logo={<span role="img" aria-label="Fundacja Niepodzielni" />} />);
  });
  return wynik!;
}

beforeEach(() => {
  getSession.mockReset();
  signIn.mockReset();
  signIn.mockResolvedValue(undefined);
  replace.mockReset();
  api.mockReset();
  homeForRole.mockClear();
  zapytanie = "";
  straznik = straznikHostow();
});

afterEach(() => {
  expect(straznik.obce()).toEqual([]);
  straznik.przywroc();
  cleanup();
  vi.useRealTimers();
});

describe("logowanie — stany", () => {
  it("brak sesji: oczekiwanie ogłaszane jako status i logowanie bez kliknięcia, z tymi samymi argumentami", async () => {
    getSession.mockResolvedValue(null);
    const { container } = await pokaz();
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(signIn).toHaveBeenCalledWith("keycloak", { callbackUrl: "/logowanie" });
    expect(screen.getByRole("status", { name: "Przekierowuję do logowania…" })).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Zaloguj się" })).toBeTruthy();
    expect(screen.getByText("Platforma szkoleniowa programu Niepodzielni. Logujesz się kontem Niepodzielni.")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Fundacja Niepodzielni" })).toBeTruthy();
    expect(api).not.toHaveBeenCalled();
  });

  it("?error= w adresie: komunikat i przycisk, bez automatycznego logowania; przycisk woła signIn tak samo", async () => {
    zapytanie = "error=AccessDenied";
    getSession.mockResolvedValue(null);
    await pokaz();
    expect(screen.getByRole("alert").textContent).toContain("Logowanie zostało anulowane.");
    expect(signIn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Zaloguj przez konto Niepodzielni" }));
    expect(signIn).toHaveBeenCalledWith("keycloak", { callbackUrl: "/logowanie" });
  });

  it("nieznany kod błędu: zdanie zastępcze", async () => {
    zapytanie = "error=CosNowego";
    getSession.mockResolvedValue(null);
    await pokaz();
    expect(screen.getByRole("alert").textContent).toContain("Logowanie się nie powiodło. Spróbuj ponownie.");
  });

  it("sesja żywa: GET /me i lądowanie wg roli", async () => {
    getSession.mockResolvedValue(SESJA);
    api.mockResolvedValue({ role: "instructor" });
    await pokaz();
    expect(api).toHaveBeenCalledWith("/me");
    expect(homeForRole).toHaveBeenCalledWith("instructor");
    expect(replace).toHaveBeenCalledWith("/dom/instructor");
    expect(signIn).not.toHaveBeenCalled();
  });

  it("sesja żywa, /me odrzuca 401: ani logowania od nowa, ani komunikatu", async () => {
    getSession.mockResolvedValue(SESJA);
    api.mockRejectedValue(new ApiError({ status: 401, code: "unauthenticated", message: "x" }));
    await pokaz();
    expect(signIn).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status", { name: "Przekierowuję do logowania…" })).toBeTruthy();
  });

  it("błąd serwera przy /me (500): komunikat o połączeniu", async () => {
    getSession.mockResolvedValue(SESJA);
    api.mockRejectedValue(new ApiError({ status: 500, code: "server_error", message: "x" }));
    await pokaz();
    expect(screen.getByRole("alert").textContent).toContain("Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę.");
  });

  it("sesja z błędem odświeżenia liczy się jak brak sesji", async () => {
    getSession.mockResolvedValue({ ...SESJA, error: "RefreshAccessTokenError" });
    await pokaz();
    expect(api).not.toHaveBeenCalled();
    expect(signIn).toHaveBeenCalledWith("keycloak", { callbackUrl: "/logowanie" });
  });

  it("zerwane połączenie i błąd konfiguracji dają różne komunikaty", async () => {
    getSession.mockRejectedValue(new TypeError("Failed to fetch"));
    await pokaz();
    expect(screen.getByRole("alert").textContent).toContain("Nie udało się połączyć z serwerem.");
    cleanup();
    getSession.mockReset();
    getSession.mockRejectedValue(new Error("500"));
    await pokaz();
    expect(screen.getByRole("alert").textContent).toContain("Logowanie jest chwilowo niedostępne. Spróbuj ponownie później.");
  });
});

describe("logowanie — granica czasu 8000 ms", () => {
  it("start wisi: przed granicą oczekiwanie, po granicy komunikat", async () => {
    vi.useFakeTimers();
    getSession.mockReturnValue(new Promise(() => {}));
    await pokaz();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7_999);
    });
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByRole("alert").textContent).toContain(
      "Logowanie nie odpowiedziało w wyznaczonym czasie. Spróbuj ponownie.",
    );
  });

  it("powodzenie zatrzymuje zegar: po granicy brak fałszywego komunikatu", async () => {
    vi.useFakeTimers();
    getSession.mockResolvedValue(null);
    await pokaz();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("odmontowanie kasuje zegar i niczego nie zapisuje", async () => {
    vi.useFakeTimers();
    getSession.mockReturnValue(new Promise(() => {}));
    const { unmount } = await pokaz();
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(replace).not.toHaveBeenCalled();
  });
});
