import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek TRZECH stanów `/logowanie` — bez formularza, bo PsychON jest
 * wyłącznie SSO:
 *
 * 1. brak sesji, brak `?error=` → sama zaczyna logowanie przez konto
 *    Niepodzielni, zero kliknięć;
 * 2. `?error=` obecny → komunikat po polsku i przycisk, ŻADNEGO
 *    automatycznego przekierowania (inaczej błąd nigdy nie dałby się
 *    przeczytać — to jest KONTROLA MUTACJI (a) z karty zadania);
 * 3. sesja już żywa → `GET /me` i lądowanie wg roli.
 *
 * Druga grupa świadków dowodzi braku pętli: sesja żywa, której `/me`
 * odrzuca 401 (bo `lib/api.ts` już samo przekierowuje gdzie indziej — patrz
 * `lib/__tests__/api-401-bez-petli.test.ts`), NIE uruchamia tu drugiego
 * `signIn` — ekran milczy, zamiast dokładać własną próbę logowania na
 * wierzch tej, którą `lib/api.ts` już zaczęło.
 */

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

const { ApiError } = await import("@/lib/api");
const LoginPage = (await import("@/app/logowanie/page")).default;

beforeEach(() => {
  getSession.mockReset();
  signIn.mockReset();
  push.mockReset();
  replace.mockReset();
  apiMock.mockReset();
  query = "";
});

describe("/logowanie — trzy stany, bez formularza", () => {
  it("brak sesji i brak ?error=: sama zaczyna logowanie przez konto Niepodzielni", async () => {
    getSession.mockResolvedValue(null);

    render(<LoginPage />);

    await vi.waitFor(() =>
      expect(signIn).toHaveBeenCalledWith("keycloak", { callbackUrl: "/logowanie" }),
    );
    // Zero kliknięć: żadnego przycisku logowania na ekranie w tym stanie.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Przekierowuję do logowania…")).toBeInTheDocument();
  });

  it("?error= obecny: pokazuje komunikat i przycisk, bez automatycznego przekierowania", async () => {
    query = "error=OAuthCallbackError";
    getSession.mockResolvedValue(null);

    render(<LoginPage />);

    expect(
      await screen.findByText("Konto Niepodzielni nie potwierdziło logowania. Spróbuj ponownie."),
    ).toBeInTheDocument();
    // To jest cała treść stanu 2: bez tego automat próbowałby logować od razu
    // i błąd nigdy nie dałby się przeczytać.
    expect(signIn).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: /zaloguj przez konto niepodzielni/i }),
    );
    expect(signIn).toHaveBeenCalledWith("keycloak", { callbackUrl: "/logowanie" });
  });

  it("nieznany kod błędu dostaje zdanie zastępcze, a nie pustkę", async () => {
    query = "error=CoAppleWymysli";
    getSession.mockResolvedValue(null);

    render(<LoginPage />);

    expect(
      await screen.findByText("Logowanie się nie powiodło. Spróbuj ponownie."),
    ).toBeInTheDocument();
  });

  it("sesja obecna: czyta /me i ląduje wg roli", async () => {
    getSession.mockResolvedValue({ user: { id: "sub-1", roles: [] } });
    apiMock.mockResolvedValue({ role: "instructor" });

    render(<LoginPage />);

    await vi.waitFor(() => expect(apiMock).toHaveBeenCalledWith("/me"));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/prowadzacy"));
  });

  it("rola spoza słownika ląduje na starcie panelu uczestnika", async () => {
    getSession.mockResolvedValue({ user: { id: "sub-1", roles: [] } });
    apiMock.mockResolvedValue({ role: "nieznana-rola" });

    render(<LoginPage />);

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/panel/start"));
  });
});

describe("/logowanie — bez pętli", () => {
  it("sesja żywa, ale /me odrzuca 401: NIE zaczyna logowania od nowa", async () => {
    getSession.mockResolvedValue({ user: { id: "sub-1", roles: [] } });
    apiMock.mockRejectedValue(
      new ApiError({ status: 401, code: "unauthenticated", message: "Brak dostępu." }),
    );

    render(<LoginPage />);

    await vi.waitFor(() => expect(apiMock).toHaveBeenCalledWith("/me"));
    // `lib/api.ts` już przekierowuje gdzie trzeba (ekran niepowiązania albo
    // powrót tu) — ekran NIE dokłada drugiej próby logowania na wierzch.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(signIn).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("sesja z błędem rotacji tokenu liczy się jak brak sesji: zaczyna logowanie", async () => {
    getSession.mockResolvedValue({
      user: { id: "sub-1", roles: [] },
      error: "RefreshAccessTokenError",
    });

    render(<LoginPage />);

    await vi.waitFor(() =>
      expect(signIn).toHaveBeenCalledWith("keycloak", { callbackUrl: "/logowanie" }),
    );
    expect(apiMock).not.toHaveBeenCalled();
  });
});
