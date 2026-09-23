import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek ekranu Ustawienia edycji (`/admin/ustawienia`): dwa pola reguł
 * programu — próg zaliczenia testu i limit podejść do testu — są edytowalne
 * z panelu i zapisują się przez PATCH /admin/edition. Ten plik mierzy
 * zachowanie ekranu (wartość pola, ciało żądania, odpowiedź po zapisie,
 * odmowa przy wartości niedozwolonej), nie jego opakowanie wizualne.
 */

const api = vi.fn();

class ApiError extends Error {
  status: number;
  code: string;
  errors?: Record<string, string[]>;

  constructor(status: number, code: string, message: string, errors?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => api(...args),
  ApiError,
}));

const { default: EditionSettingsPage } = await import(
  "@/app/(administracja)/admin/ustawienia/page"
);

const edycja = {
  id: 1,
  name: "Edycja 2026",
  starts_at: "2026-01-01",
  ends_at: "2026-12-31",
  seats_limit: 30,
  test_pass_threshold: 70,
  test_attempts_limit: 3,
  internship_hours_required: 40,
  supervision_required_count: 5,
  reliability_threshold: 80,
  lesson_completion_percent: 90,
};

beforeEach(() => {
  api.mockReset();
});

describe("EditionSettingsPage — próg zaliczenia testu i limit podejść", () => {
  it("pozytywna: pole progu wczytuje wartość z API i jest edytowalne (type=number, 0–100)", async () => {
    api.mockResolvedValueOnce(edycja);
    render(<EditionSettingsPage />);

    const prog = (await screen.findByLabelText(
      "Próg zaliczenia testu (%)",
    )) as HTMLInputElement;

    expect(prog).toBeEnabled();
    expect(prog.type).toBe("number");
    expect(prog.min).toBe("0");
    expect(prog.max).toBe("100");
    expect(prog.value).toBe("70");
  });

  it("pozytywna: pole limitu podejść wczytuje wartość z API i jest edytowalne (type=number, min=1)", async () => {
    api.mockResolvedValueOnce(edycja);
    render(<EditionSettingsPage />);

    const limit = (await screen.findByLabelText(
      "Limit podejść do testu",
    )) as HTMLInputElement;

    expect(limit).toBeEnabled();
    expect(limit.type).toBe("number");
    expect(limit.min).toBe("1");
    expect(limit.value).toBe("3");
  });

  it("pozytywna: zmiana progu i limitu w panelu wysyła PATCH /admin/edition z nowymi wartościami, odpowiedź odświeża pola", async () => {
    const user = userEvent.setup();
    api.mockResolvedValueOnce(edycja); // GET /admin/edition
    render(<EditionSettingsPage />);

    const prog = await screen.findByLabelText("Próg zaliczenia testu (%)");
    const limit = await screen.findByLabelText("Limit podejść do testu");

    await user.clear(prog);
    await user.type(prog, "85");
    await user.clear(limit);
    await user.type(limit, "5");

    api.mockResolvedValueOnce({
      ...edycja,
      test_pass_threshold: 85,
      test_attempts_limit: 5,
    }); // PATCH response

    await user.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(api).toHaveBeenNthCalledWith(2, "/admin/edition", {
      method: "PATCH",
      body: expect.objectContaining({
        test_pass_threshold: 85,
        test_attempts_limit: 5,
      }),
    });

    expect(await screen.findByText("Zapisano zmiany.")).toBeInTheDocument();
    expect((prog as HTMLInputElement).value).toBe("85");
    expect((limit as HTMLInputElement).value).toBe("5");
  });

  it("negatywna: próg poza zakresem (422 z backendu) pokazuje błąd przy polu progu, nie zapisuje wartości, limit zostaje nietknięty", async () => {
    const user = userEvent.setup();
    api.mockResolvedValueOnce(edycja); // GET
    render(<EditionSettingsPage />);

    const prog = await screen.findByLabelText("Próg zaliczenia testu (%)");

    await user.clear(prog);
    await user.type(prog, "150");

    api.mockRejectedValueOnce(
      new ApiError(422, "validation_failed", "Popraw zaznaczone pola.", {
        test_pass_threshold: ["Próg zaliczenia testu musi być liczbą od 0 do 100."],
      }),
    );

    await user.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(api).toHaveBeenNthCalledWith(2, "/admin/edition", {
      method: "PATCH",
      body: expect.objectContaining({ test_pass_threshold: 150 }),
    });

    expect(
      await screen.findByText("Próg zaliczenia testu musi być liczbą od 0 do 100."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Zapisano zmiany.")).not.toBeInTheDocument();

    const limit = screen.getByLabelText("Limit podejść do testu") as HTMLInputElement;
    expect(limit.value).toBe("3");
  });

  it("negatywna: limit podejść poza zakresem (422 z backendu) pokazuje błąd przy polu limitu, nie zapisuje wartości", async () => {
    const user = userEvent.setup();
    api.mockResolvedValueOnce(edycja); // GET
    render(<EditionSettingsPage />);

    const limit = await screen.findByLabelText("Limit podejść do testu");

    await user.clear(limit);
    await user.type(limit, "0");

    api.mockRejectedValueOnce(
      new ApiError(422, "validation_failed", "Popraw zaznaczone pola.", {
        test_attempts_limit: ["Limit podejść do testu musi być liczbą co najmniej 1."],
      }),
    );

    await user.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(api).toHaveBeenNthCalledWith(2, "/admin/edition", {
      method: "PATCH",
      body: expect.objectContaining({ test_attempts_limit: 0 }),
    });

    expect(
      await screen.findByText("Limit podejść do testu musi być liczbą co najmniej 1."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Zapisano zmiany.")).not.toBeInTheDocument();

    const prog = screen.getByLabelText("Próg zaliczenia testu (%)") as HTMLInputElement;
    expect(prog.value).toBe("70");
  });
});
