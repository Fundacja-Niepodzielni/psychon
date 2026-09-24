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

/**
 * Komunikat błędu pola jest powiązany z kontrolką przez `aria-describedby`
 * (atom `Field`, C2 §3) — czyta go program czytający ekran razem z polem,
 * niezależnie od tego, gdzie fizycznie wyląduje w drzewie. Ta funkcja czyta
 * DOKŁADNIE tamto powiązanie: bierze `aria-describedby` z kontrolki i zwraca
 * treść węzła o tym `id`. Sprawdzenie „komunikat gdziekolwiek w dokumencie"
 * (`findByText`) przechodzi też wtedy, gdy komunikat wyląduje przy złym polu
 * — to jest luka, którą ta funkcja zamyka.
 */
function komunikatPrzyPolu(pole: HTMLElement): string | null {
  const describedBy = pole.getAttribute("aria-describedby");
  if (!describedBy) return null;
  const id = describedBy.split(" ")[0];
  return document.getElementById(id)?.textContent ?? null;
}

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
  it("pozytywna: pole progu wczytuje wartość z API i przyjmuje wpisaną zmianę (type=number, 0–100)", async () => {
    const user = userEvent.setup();
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

    // Edytowalność mierzona wpisaniem: stan pola musi się zmienić, nie tylko
    // pozwolić na fokus. Pole bez onChange przejdzie test.value === "70" i
    // toBeEnabled(), ale nie przejdzie tej asercji.
    await user.clear(prog);
    await user.type(prog, "42");
    expect(prog.value).toBe("42");
  });

  it("pozytywna: pole limitu podejść wczytuje wartość z API i przyjmuje wpisaną zmianę (type=number, min=1)", async () => {
    const user = userEvent.setup();
    api.mockResolvedValueOnce(edycja);
    render(<EditionSettingsPage />);

    const limit = (await screen.findByLabelText(
      "Limit podejść do testu",
    )) as HTMLInputElement;

    expect(limit).toBeEnabled();
    expect(limit.type).toBe("number");
    expect(limit.min).toBe("1");
    expect(limit.value).toBe("3");

    // Edytowalność mierzona wpisaniem: stan pola musi się zmienić, nie tylko
    // pozwolić na fokus. Pole bez onChange przejdzie test.value === "3" i
    // toBeEnabled(), ale nie przejdzie tej asercji.
    await user.clear(limit);
    await user.type(limit, "7");
    expect(limit.value).toBe("7");
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

    // Odpowiedź serwera celowo RÓŻNA od tego, co wpisał użytkownik (85/5 →
    // serwer oddaje 90/4). Świadek i świadczone nie mogą być tą samą
    // wartością: gdyby atrapa oddawała wpisane liczby, asercja niżej
    // przeszłaby nawet bez odczytania odpowiedzi (np. gdyby page.tsx po
    // sukcesie w ogóle nie wołał setForm(toForm(updated))).
    api.mockResolvedValueOnce({
      ...edycja,
      test_pass_threshold: 90,
      test_attempts_limit: 4,
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
    // Pola mają pokazywać to, co PRZYSŁAŁ serwer (90/4), nie to, co wpisał
    // użytkownik (85/5) — to jest właściwy dowód, że ekran czyta odpowiedź.
    await waitFor(() => expect((prog as HTMLInputElement).value).toBe("90"));
    expect((limit as HTMLInputElement).value).toBe("4");
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

    // Komunikat musi wisieć PRZY polu progu (aria-describedby), nie tylko
    // gdziekolwiek w dokumencie — inaczej odpowiedź przypięta do złego pola
    // (np. do limitu) przeszłaby ten sam test.
    await waitFor(() =>
      expect(komunikatPrzyPolu(prog)).toBe(
        "Próg zaliczenia testu musi być liczbą od 0 do 100.",
      ),
    );
    expect(screen.queryByText("Zapisano zmiany.")).not.toBeInTheDocument();

    const limit = screen.getByLabelText("Limit podejść do testu") as HTMLInputElement;
    expect(limit.value).toBe("3");
    expect(komunikatPrzyPolu(limit)).toBeNull();
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

    // Komunikat musi wisieć PRZY polu limitu (aria-describedby), nie tylko
    // gdziekolwiek w dokumencie.
    await waitFor(() =>
      expect(komunikatPrzyPolu(limit)).toBe(
        "Limit podejść do testu musi być liczbą co najmniej 1.",
      ),
    );
    expect(screen.queryByText("Zapisano zmiany.")).not.toBeInTheDocument();

    const prog = screen.getByLabelText("Próg zaliczenia testu (%)") as HTMLInputElement;
    expect(prog.value).toBe("70");
    expect(komunikatPrzyPolu(prog)).toBeNull();
  });
});
