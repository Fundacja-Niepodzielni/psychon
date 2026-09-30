import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Zestaw testów dwustronnych dla ekranu `/nowy-front/po-programie`, sekcja
 * „Dalsza współpraca” (H01): pusta lista i wysyłka zgłoszenia, sekcja
 * niedostępna przed zakończeniem programu, błędy 422/409/403 przy wysyłce,
 * widoczność odpowiedzi administracji oraz brak dostępu dla ról spoza
 * wolontariusza/studenta.
 */

const pobierzJa = vi.fn();
const pobierzMojeZgloszenia = vi.fn();
const zglosWspolprace = vi.fn();
const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api/h01-wspolpraca", () => ({
  pobierzJa: (...args: unknown[]) => pobierzJa(...args),
  pobierzMojeZgloszenia: (...args: unknown[]) => pobierzMojeZgloszenia(...args),
  zglosWspolprace: (...args: unknown[]) => zglosWspolprace(...args),
}));

const { ApiError } = await import("@/lib/api/klient");
const { PoProgramieWspolpraca } = await import("../PoProgramieWspolpraca");

const ZGLOSZENIE_NOWE = {
  id: 5,
  body: "Chcę kontynuować współpracę.",
  status: "new" as const,
  response: null,
  responded_at: null,
  created_at: "2026-09-20T10:00:00Z",
  updated_at: "2026-09-20T10:00:00Z",
};

const ZGLOSZENIE_Z_ODPOWIEDZIA = {
  id: 4,
  body: "Zgłoszenie sprzed miesiąca.",
  status: "answered" as const,
  response: "Zapraszamy do dalszej współpracy od nowej edycji.",
  responded_at: "2026-09-15T09:00:00Z",
  created_at: "2026-08-20T10:00:00Z",
  updated_at: "2026-09-15T09:00:00Z",
};

beforeEach(() => {
  pobierzJa.mockReset();
  pobierzMojeZgloszenia.mockReset();
  zglosWspolprace.mockReset();
  back.mockReset();
});

describe("PoProgramieWspolpraca — świadek 1a", () => {
  it("program ukończony, pusta lista → formularz; wysyłka ma ciało {\"body\":\"…\"}; po 201 wiersz „Nowe” na górze, formularz zastąpiony Notice", async () => {
    const uzytkownik = userEvent.setup();
    pobierzJa.mockResolvedValue({ program_completed_at: "2026-09-01T00:00:00Z", role: "volunteer" });
    pobierzMojeZgloszenia.mockResolvedValue({ data: [], meta: undefined });
    zglosWspolprace.mockResolvedValue(ZGLOSZENIE_NOWE);

    render(<PoProgramieWspolpraca />);

    const pole = await screen.findByLabelText(/^Treść zgłoszenia/);
    await uzytkownik.type(pole, ZGLOSZENIE_NOWE.body);
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij zgłoszenie" }));

    await waitFor(() => expect(zglosWspolprace).toHaveBeenCalledTimes(1));
    expect(zglosWspolprace).toHaveBeenCalledWith(ZGLOSZENIE_NOWE.body);

    await waitFor(() => expect(screen.getByText("Nowe")).toBeInTheDocument());
    expect(screen.getByText(ZGLOSZENIE_NOWE.body)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Wyślij zgłoszenie" })).toBeNull();
    expect(screen.getByText("Masz otwarte zgłoszenie. Poczekaj na odpowiedź.")).toBeInTheDocument();
  });
});

describe("PoProgramieWspolpraca — świadek 1b", () => {
  it("program_completed_at = null → Notice informacyjny, zero wywołań POST (brak formularza)", async () => {
    pobierzJa.mockResolvedValue({ program_completed_at: null, role: "volunteer" });
    pobierzMojeZgloszenia.mockResolvedValue({ data: [], meta: undefined });

    render(<PoProgramieWspolpraca />);

    await waitFor(() =>
      expect(
        screen.getByText("Zgłoszenie dalszej współpracy będzie dostępne po zakończeniu programu."),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "Wyślij zgłoszenie" })).toBeNull();
    expect(zglosWspolprace).not.toHaveBeenCalled();
  });
});

describe("PoProgramieWspolpraca — świadek 1c", () => {
  it("422 z errors.body pokazuje tekst pod polem", async () => {
    const uzytkownik = userEvent.setup();
    pobierzJa.mockResolvedValue({ program_completed_at: "2026-09-01T00:00:00Z", role: "volunteer" });
    pobierzMojeZgloszenia.mockResolvedValue({ data: [], meta: undefined });
    zglosWspolprace.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "validation_failed",
        message: "Popraw zaznaczone pola.",
        errors: { body: ["Treść zgłoszenia może mieć najwyżej 2000 znaków."] },
      }),
    );

    render(<PoProgramieWspolpraca />);
    const pole = await screen.findByLabelText(/^Treść zgłoszenia/);
    await uzytkownik.type(pole, "x");
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij zgłoszenie" }));

    expect(await screen.findByText("Treść zgłoszenia może mieć najwyżej 2000 znaków.")).toBeInTheDocument();
  });

  it("409 cooperation_request_open → Notice z message serwera", async () => {
    const uzytkownik = userEvent.setup();
    pobierzJa.mockResolvedValue({ program_completed_at: "2026-09-01T00:00:00Z", role: "volunteer" });
    pobierzMojeZgloszenia.mockResolvedValue({ data: [], meta: undefined });
    zglosWspolprace.mockRejectedValue(
      new ApiError({
        status: 409,
        code: "cooperation_request_open",
        message: "Masz już otwarte zgłoszenie współpracy. Poczekaj na odpowiedź.",
      }),
    );

    render(<PoProgramieWspolpraca />);
    const pole = await screen.findByLabelText(/^Treść zgłoszenia/);
    await uzytkownik.type(pole, "x");
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij zgłoszenie" }));

    expect(
      await screen.findByText("Masz już otwarte zgłoszenie współpracy. Poczekaj na odpowiedź."),
    ).toBeInTheDocument();
  });

  it("403 program_not_completed → Notice z message serwera", async () => {
    const uzytkownik = userEvent.setup();
    pobierzJa.mockResolvedValue({ program_completed_at: "2026-09-01T00:00:00Z", role: "volunteer" });
    pobierzMojeZgloszenia.mockResolvedValue({ data: [], meta: undefined });
    zglosWspolprace.mockRejectedValue(
      new ApiError({
        status: 403,
        code: "program_not_completed",
        message: "Zgłoszenie współpracy jest dostępne po zakończeniu programu.",
      }),
    );

    render(<PoProgramieWspolpraca />);
    const pole = await screen.findByLabelText(/^Treść zgłoszenia/);
    await uzytkownik.type(pole, "x");
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij zgłoszenie" }));

    expect(
      await screen.findByText("Zgłoszenie współpracy jest dostępne po zakończeniu programu."),
    ).toBeInTheDocument();
  });
});

describe("PoProgramieWspolpraca — świadek 1d", () => {
  it("zgłoszenie answered → widoczna odpowiedź i jej data", async () => {
    pobierzJa.mockResolvedValue({ program_completed_at: "2026-09-01T00:00:00Z", role: "volunteer" });
    pobierzMojeZgloszenia.mockResolvedValue({ data: [ZGLOSZENIE_Z_ODPOWIEDZIA], meta: undefined });

    render(<PoProgramieWspolpraca />);

    await waitFor(() => expect(screen.getByText(ZGLOSZENIE_Z_ODPOWIEDZIA.body)).toBeInTheDocument());
    const wiersz = screen.getByText(ZGLOSZENIE_Z_ODPOWIEDZIA.body).closest("div");
    expect(wiersz?.textContent).toContain(ZGLOSZENIE_Z_ODPOWIEDZIA.response);
    expect(wiersz?.textContent).toContain(ZGLOSZENIE_Z_ODPOWIEDZIA.responded_at);
  });
});

describe("PoProgramieWspolpraca — świadek 1h (osoba)", () => {
  it("403 forbidden z mine → Notice, brak listy i formularza", async () => {
    pobierzJa.mockResolvedValue({ program_completed_at: "2026-09-01T00:00:00Z", role: "instructor" });
    pobierzMojeZgloszenia.mockRejectedValue(
      new ApiError({ status: 403, code: "forbidden", message: "Nie masz dostępu do tej sekcji." }),
    );

    render(<PoProgramieWspolpraca />);

    expect(
      await screen.findByText("Ta sekcja jest dostępna dla wolontariuszy i studentów."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Wyślij zgłoszenie" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Moje zgłoszenia" })).toBeNull();
  });
});
