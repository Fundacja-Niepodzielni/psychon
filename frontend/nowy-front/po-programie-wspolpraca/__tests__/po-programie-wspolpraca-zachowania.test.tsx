import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Zachowania ekranu „Po programie”: pusta lista i wysyłka zgłoszenia,
 * ekran przed ukończeniem programu, błędy 422/409/403 przy wysyłce,
 * widoczność odpowiedzi administracji oraz odmowa dla ról spoza
 * wolontariusza i studenta. Funkcje danych są tu podmienione; stany szablonu,
 * transport i kartę „Program ukończony” mierzy `po-programie-wspolpraca.test.tsx`.
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

describe("PoProgramieWspolpraca — wysyłka zgłoszenia", () => {
  it("program ukończony, pusta lista → formularz; wysyłka ma ciało {\"body\":\"…\"}; po 201 wiersz „Nowe” na górze, formularz zastąpiony Notice", async () => {
    const uzytkownik = userEvent.setup();
    pobierzJa.mockResolvedValue({ program_completed_at: "2026-09-01T00:00:00Z", role: "volunteer" });
    pobierzMojeZgloszenia.mockResolvedValue({ data: [], meta: undefined });
    zglosWspolprace.mockResolvedValue(ZGLOSZENIE_NOWE);

    render(<PoProgramieWspolpraca />);

    const pole = await screen.findByLabelText(/^Treść prośby/);
    await uzytkownik.type(pole, ZGLOSZENIE_NOWE.body);
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij prośbę" }));

    await waitFor(() => expect(zglosWspolprace).toHaveBeenCalledTimes(1));
    expect(zglosWspolprace).toHaveBeenCalledWith(ZGLOSZENIE_NOWE.body);

    await waitFor(() => expect(screen.getByText("nowe")).toBeInTheDocument());
    expect(screen.getByText(ZGLOSZENIE_NOWE.body)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Wyślij prośbę" })).toBeNull();
    expect(screen.getByText("Masz otwartą prośbę. Poczekaj na odpowiedź.")).toBeInTheDocument();
  });
});

describe("PoProgramieWspolpraca — program nieukończony", () => {
  it("program_completed_at = null → ekran otworzy się po ukończeniu programu, zero wywołań POST (brak formularza)", async () => {
    pobierzJa.mockResolvedValue({ program_completed_at: null, role: "volunteer" });
    pobierzMojeZgloszenia.mockResolvedValue({ data: [], meta: undefined });

    render(<PoProgramieWspolpraca />);

    expect(
      await screen.findByRole("heading", { name: "Ten ekran otworzy się po ukończeniu programu" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Wyślij prośbę" })).toBeNull();
    expect(zglosWspolprace).not.toHaveBeenCalled();
  });
});

describe("PoProgramieWspolpraca — błędy wysyłki", () => {
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
    const pole = await screen.findByLabelText(/^Treść prośby/);
    await uzytkownik.type(pole, "x");
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij prośbę" }));

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
    const pole = await screen.findByLabelText(/^Treść prośby/);
    await uzytkownik.type(pole, "x");
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij prośbę" }));

    expect(
      await screen.findByText("Masz już otwarte zgłoszenie współpracy. Poczekaj na odpowiedź."),
    ).toBeInTheDocument();
  });

  it("403 program_not_completed → ekran otworzy się po ukończeniu programu, formularz znika", async () => {
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
    const pole = await screen.findByLabelText(/^Treść prośby/);
    await uzytkownik.type(pole, "x");
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij prośbę" }));

    expect(
      await screen.findByRole("heading", { name: "Ten ekran otworzy się po ukończeniu programu" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Wyślij prośbę" })).toBeNull();
  });
});

describe("PoProgramieWspolpraca — odpowiedź administracji", () => {
  it("zgłoszenie answered → widoczna odpowiedź i jej data", async () => {
    pobierzJa.mockResolvedValue({ program_completed_at: "2026-09-01T00:00:00Z", role: "volunteer" });
    pobierzMojeZgloszenia.mockResolvedValue({ data: [ZGLOSZENIE_Z_ODPOWIEDZIA], meta: undefined });

    render(<PoProgramieWspolpraca />);

    await waitFor(() => expect(screen.getByText(ZGLOSZENIE_Z_ODPOWIEDZIA.body)).toBeInTheDocument());
    const odpowiedz = screen.getByTestId(`odpowiedz-${ZGLOSZENIE_Z_ODPOWIEDZIA.id}`);
    expect(odpowiedz.textContent).toContain(ZGLOSZENIE_Z_ODPOWIEDZIA.response);
    expect(odpowiedz.textContent).toContain("Odpowiedź z 15 września 2026, 11:00");
  });
});

describe("PoProgramieWspolpraca — odmowa roli", () => {
  it("rola spoza wolontariusza i studenta → odmowa z nazwą roli, brak listy i formularza", async () => {
    pobierzJa.mockResolvedValue({ program_completed_at: "2026-09-01T00:00:00Z", role: "instructor" });
    pobierzMojeZgloszenia.mockRejectedValue(
      new ApiError({ status: 403, code: "forbidden", message: "Nie masz dostępu do tej sekcji." }),
    );

    const { container } = render(<PoProgramieWspolpraca />);

    await waitFor(() => expect(container.textContent).toContain("uczestników"));
    expect(screen.queryByRole("button", { name: "Wyślij prośbę" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Moje prośby" })).toBeNull();
  });
});
