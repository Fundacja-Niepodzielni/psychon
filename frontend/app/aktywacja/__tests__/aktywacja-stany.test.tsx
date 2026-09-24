import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
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
// `null` = brak zawieszenia; obietnica = `useSearchParams` rzuca ją tak, jak
// Next robi to przy renderze dynamicznym pod granicą `Suspense` — bez `use()`
// z Reacta 19, bez zmian w kodzie ekranu.
let zawieszenieParametrow: Promise<unknown> | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => {
    if (zawieszenieParametrow) throw zawieszenieParametrow;
    return new URLSearchParams(query);
  },
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
  zawieszenieParametrow = null;
});

describe("/aktywacja — granica zawieszenia", () => {
  it("w czasie zawieszenia użytkownik widzi komunikat ładowania ogłoszony jako status", () => {
    // Obietnica celowo nierozstrzygnięta — mierzymy WYŁĄCZNIE to, co jest na
    // ekranie w trakcie zawieszenia, nie stan po jego ustąpieniu.
    zawieszenieParametrow = new Promise(() => {});

    render(<ActivationPage />);

    // `role="status"` ogłasza treść regionu na żywo — to jego tekst, nie
    // (wyliczana wg innego algorytmu) nazwa dostępna, dociera do czytnika
    // ekranu przy aktualizacji. `role="status"` jest jawnie wyłączona z
    // „nazwy z treści" w specyfikacji accname, więc `toHaveAccessibleName`
    // dałoby fałszywy czerwony na węźle równoważnym dla użytkownika.
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Wczytywanie…");
    expect(getSession).not.toHaveBeenCalled();
  });
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
    // Nagłówek strony ("Aktywacja konta") pochodzi wyłącznie z szablonu —
    // karta poniżej nie ma prawa powielić go jako własny nagłówek.
    expect(screen.getAllByRole("heading", { name: "Aktywacja konta" })).toHaveLength(1);
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
    expect(screen.getAllByRole("heading", { name: "Aktywacja konta" })).toHaveLength(1);
  });

  it("odmowa (konto zablokowane/usunięte): pokazuje dokładnie komunikat serwera, bez powielonego nagłówka karty", async () => {
    getSession.mockResolvedValue({ user: { id: "sub-1", roles: [] } });
    apiMock.mockRejectedValue(
      new ApiError({
        status: 403,
        code: "account_disabled",
        message: "To konto zostało zablokowane.",
      }),
    );

    render(<ActivationPage />);

    expect(await screen.findByText("To konto zostało zablokowane.")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Aktywacja konta" })).toHaveLength(1);
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
    expect(screen.getAllByRole("heading", { name: "Aktywacja konta" })).toHaveLength(1);
  });

  it("nieudane ponowienie nie usuwa już wyświetlonego komunikatu błędu ani przycisku ponów", async () => {
    getSession.mockResolvedValueOnce({ user: { id: "sub-1", roles: [] } });
    apiMock.mockRejectedValueOnce(new Error("network down"));

    render(<ActivationPage />);

    expect(
      await screen.findByText("Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę."),
    ).toBeInTheDocument();
    const ponow = screen.getByRole("button", { name: "Spróbuj ponownie" });

    // Druga sesja celowo NIE rozstrzyga się od razu — pozwala to sprawdzić
    // ekran w trakcie ponowienia, zanim cokolwiek nowego się rozstrzygnie.
    let uwolnijSesje: (wartosc: unknown) => void = () => {};
    getSession.mockImplementationOnce(
      () => new Promise((resolve) => { uwolnijSesje = resolve; }),
    );

    fireEvent.click(ponow);

    // W trakcie ponowienia (przed rozstrzygnięciem drugiej próby) treść
    // poprzedniego błędu wciąż jest na ekranie — nie znika w trakcie.
    expect(
      screen.getByText("Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę."),
    ).toBeInTheDocument();

    apiMock.mockRejectedValueOnce(new Error("network down again"));
    await act(async () => {
      uwolnijSesje({ user: { id: "sub-1", roles: [] } });
    });

    await vi.waitFor(() => expect(apiMock).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByText("Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Aktywacja konta" })).toHaveLength(1);
  });
});
