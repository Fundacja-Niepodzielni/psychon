import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek `/aktywacja?token=…` — wiązanie konta Niepodzielni z zaproszeniem
 * PsychON (`POST /sso/powiaz`), bez ŻADNEGO hasła: konto go w ogóle nie ma,
 * jest tylko `sub` z tokenu Kont.
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
const ActivationPage = (await import("@/app/aktywacja/page")).default;

beforeEach(() => {
  getSession.mockReset();
  signIn.mockReset();
  push.mockReset();
  replace.mockReset();
  apiMock.mockReset();
  query = "token=zaproszenie-abc";
});

describe("/aktywacja — bez sesji", () => {
  it("pokazuje przycisk logowania, który wraca z tym samym tokenem w callbackUrl", async () => {
    getSession.mockResolvedValue(null);

    render(<ActivationPage />);

    const przycisk = await screen.findByRole("button", {
      name: /zaloguj przez konto niepodzielni/i,
    });
    await userEvent.click(przycisk);

    expect(signIn).toHaveBeenCalledWith("keycloak", {
      callbackUrl: "/aktywacja?token=zaproszenie-abc",
    });
    expect(apiMock).not.toHaveBeenCalled();
  });
});

describe("/aktywacja — sesja obecna", () => {
  it("wiąże token i ląduje wg roli z odpowiedzi /sso/powiaz", async () => {
    getSession.mockResolvedValue({ user: { id: "sub-1", roles: [] } });
    apiMock.mockResolvedValue({ role: "student" });

    render(<ActivationPage />);

    await vi.waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith("/sso/powiaz", {
        method: "POST",
        body: { token: "zaproszenie-abc" },
      }),
    );
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/panel/start"));
  });

  it("token nieprawidłowy lub wykorzystany: pokazuje dokładnie komunikat serwera", async () => {
    getSession.mockResolvedValue({ user: { id: "sub-1", roles: [] } });
    apiMock.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "invalid_token",
        message: "Nieprawidłowy lub wykorzystany token zaproszenia.",
      }),
    );

    render(<ActivationPage />);

    expect(
      await screen.findByText("Nieprawidłowy lub wykorzystany token zaproszenia."),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("konto już powiązane z innym kontem Niepodzielni: pokazuje komunikat konfliktu", async () => {
    getSession.mockResolvedValue({ user: { id: "sub-1", roles: [] } });
    apiMock.mockRejectedValue(
      new ApiError({
        status: 409,
        code: "already_bound",
        message: "To konto jest już połączone z innym kontem Niepodzielni.",
      }),
    );

    render(<ActivationPage />);

    expect(
      await screen.findByText("To konto jest już połączone z innym kontem Niepodzielni."),
    ).toBeInTheDocument();
  });

  it("brak tokenu w adresie: komunikat lokalny, bez wołania API", async () => {
    query = "";
    getSession.mockResolvedValue({ user: { id: "sub-1", roles: [] } });

    render(<ActivationPage />);

    expect(
      await screen.findByText("Link aktywacyjny nie zawiera tokenu."),
    ).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("żadnego pola hasła na ekranie — konto się nim nie wiąże", async () => {
    getSession.mockResolvedValue({ user: { id: "sub-1", roles: [] } });
    apiMock.mockResolvedValue({ role: "student" });

    render(<ActivationPage />);

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/panel/start"));
    expect(screen.queryByLabelText(/hasło/i)).not.toBeInTheDocument();
  });
});
