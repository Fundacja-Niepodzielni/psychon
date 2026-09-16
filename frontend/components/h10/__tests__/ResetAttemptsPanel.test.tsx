import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek panelu resetu limitu podejść (H10 · karta osoby, region
 * „user-actions"). Mierzone jest zachowanie opisane w zleceniu, nie kształt
 * komponentu:
 *
 * 1. powód jest obowiązkowy — bez niego żądanie w ogóle nie wychodzi;
 * 2. powód idzie do serwera przycięty z białych znaków na brzegach;
 * 3. ekran nazywa cztery stany: „czekam", „udało się", „nie udało się" i
 *    „nie wiem" — i „nie wiem" NIE jest porażką: ekran nie pokazuje wtedy
 *    komunikatu o porażce (rola „alert" tego panelu istnieje wyłącznie dla
 *    odmowy serwera, więc jej brak jest właśnie tą asercją).
 *
 * Klient API jest zaślepiony (`vi.mock`), bo przedmiotem pomiaru jest EKRAN.
 */

const resetTestAttempts = vi.fn();

class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

vi.mock("@/lib/api", () => ({
  resetTestAttempts: (...args: unknown[]) => resetTestAttempts(...args),
  ApiError,
}));

const { ResetAttemptsPanel } = await import(
  "@/components/h10/ResetAttemptsPanel"
);

function pokazPanel() {
  render(<ResetAttemptsPanel userId={7} />);
  return {
    testIdPole: screen.getByLabelText("Identyfikator testu"),
    powodPole: screen.getByLabelText("Powód resetu"),
    przycisk: screen.getByRole("button", { name: "Zresetuj limit podejść" }),
    formularz: screen
      .getByRole("button", { name: "Zresetuj limit podejść" })
      .closest("form") as HTMLFormElement,
  };
}

beforeEach(() => {
  resetTestAttempts.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("powód resetu jest obowiązkowy", () => {
  it("bez powodu formularz się wysyła, ale żądanie do serwera NIE wychodzi", async () => {
    // Kryterium 3, pierwsza połowa.
    const { testIdPole, formularz } = pokazPanel();
    await userEvent.type(testIdPole, "12");

    fireEvent.submit(formularz);

    await new Promise((r) => setTimeout(r, 0));
    expect(resetTestAttempts).not.toHaveBeenCalled();
  });

  it("z wypełnionym powodem żądanie wychodzi, a powód dociera przycięty", async () => {
    // Kryterium 3, druga połowa.
    resetTestAttempts.mockResolvedValue({
      test_id: 12,
      user_id: 7,
      cleared: 2,
      attempts_used: 0,
      attempts_limit: 3,
    });
    const { testIdPole, powodPole, przycisk } = pokazPanel();
    const user = userEvent.setup();
    await user.type(testIdPole, "12");
    await user.type(powodPole, "  powód z odstępami  ");

    await user.click(przycisk);

    await waitFor(() => expect(resetTestAttempts).toHaveBeenCalledTimes(1));
    expect(resetTestAttempts).toHaveBeenCalledWith(12, 7, "powód z odstępami");
  });
});

describe("cztery stany ekranu", () => {
  it("czekam — przycisk jest zajęty (aria-busy) w trakcie żądania", async () => {
    let uwolnij: (v: unknown) => void = () => {};
    resetTestAttempts.mockImplementation(
      () => new Promise((resolve) => (uwolnij = resolve)),
    );
    const { testIdPole, powodPole, przycisk } = pokazPanel();
    const user = userEvent.setup();
    await user.type(testIdPole, "12");
    await user.type(powodPole, "powód");

    await user.click(przycisk);

    expect(przycisk).toHaveAttribute("aria-busy", "true");
    uwolnij({ test_id: 12, user_id: 7, cleared: 1, attempts_used: 0, attempts_limit: 3 });
    await waitFor(() => expect(przycisk).not.toHaveAttribute("aria-busy"));
  });

  it("udało się — ekran podaje liczbę wyczyszczonych podejść i nowy limit", async () => {
    resetTestAttempts.mockResolvedValue({
      test_id: 12,
      user_id: 7,
      cleared: 4,
      attempts_used: 0,
      attempts_limit: 5,
    });
    const { testIdPole, powodPole, przycisk } = pokazPanel();
    const user = userEvent.setup();
    await user.type(testIdPole, "12");
    await user.type(powodPole, "powód");

    await user.click(przycisk);

    expect(
      await screen.findByText(
        "Wyczyszczono 4 podejścia — limit tej osoby do tego testu to teraz 5.",
      ),
    ).toBeInTheDocument();
  });

  it("nie udało się — serwer odmówił, ekran pokazuje jego komunikat rolą alert", async () => {
    resetTestAttempts.mockRejectedValue(
      new ApiError(422, "validation", "Powód jest wymagany."),
    );
    const { testIdPole, powodPole, przycisk } = pokazPanel();
    const user = userEvent.setup();
    await user.type(testIdPole, "12");
    await user.type(powodPole, "powód");

    await user.click(przycisk);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Powód jest wymagany.",
    );
  });

  it("nie wiem — błąd sieci NIE jest porażką: brak roli alert i informacja, że stan jest nieznany", async () => {
    // Kryterium 4, ostatni z czterech stanów — i najważniejszy w zleceniu.
    // Asercja sprawdza WPROST brak komunikatu o porażce (roli „alert"), a nie
    // tylko obecność własnego tekstu — inaczej test przeszedłby także wtedy,
    // gdyby ekran pokazywał OBA komunikaty naraz.
    resetTestAttempts.mockRejectedValue(new TypeError("Failed to fetch"));
    const { testIdPole, powodPole, przycisk } = pokazPanel();
    const user = userEvent.setup();
    await user.type(testIdPole, "12");
    await user.type(powodPole, "powód");

    await user.click(przycisk);

    expect(
      await screen.findByText(
        "Nie wiemy, czy reset się wykonał — odpowiedź serwera nie dotarła. Odśwież kartę osoby i sprawdź stan podejść, zanim spróbujesz ponownie.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
