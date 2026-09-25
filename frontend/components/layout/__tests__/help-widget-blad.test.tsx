import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Stan bledu okna pomocy: komunikat PRZY POLU dla 422, komunikat ogolny dla
 * 401 i dla awarii sieci. We wszystkich trzech tresc wpisana przez nadawce
 * zostaje w polu — formularz nie zeruje sie przy bledzie.
 *
 * Kontrola negatywna kryterium "stan bledu": usuniecie obslugi bledu
 * w `components/layout/HelpWidget.tsx` (galaz `catch` w `handleSubmit`)
 * gasi test "422 pokazuje komunikat przy polu, tresc zostaje" na czerwono.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/panel/start",
}));

const sendHelpMessage = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    sendHelpMessage: (...args: unknown[]) => sendHelpMessage(...args),
  };
});

const HelpWidget = (await import("@/components/layout/HelpWidget")).default;
const { ApiError } = await import("@/lib/api");

const TRESC = "Nie mogę pobrać certyfikatu.";

beforeEach(() => {
  sendHelpMessage.mockReset();
});

async function otworzIWpisz() {
  const user = userEvent.setup();
  render(<HelpWidget />);

  await user.click(screen.getByRole("button", { name: "Pomoc" }));
  await user.type(screen.getByLabelText("Opisz, w czym możemy pomóc"), TRESC);
  return user;
}

describe("HelpWidget — stan błędu", () => {
  it("422: komunikat przy polu treści, wpisana treść zostaje w formularzu", async () => {
    sendHelpMessage.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "validation_error",
        message: "Nieprawidłowe dane.",
        errors: { content: ["Treść zgłoszenia jest wymagana."] },
      }),
    );

    const user = await otworzIWpisz();
    await user.click(screen.getByRole("button", { name: "Wyślij zgłoszenie" }));

    const pole = await screen.findByLabelText("Opisz, w czym możemy pomóc");
    expect(screen.getByText("Treść zgłoszenia jest wymagana.")).toBeInTheDocument();
    expect(pole).toHaveValue(TRESC);
    expect(pole).toHaveAttribute("aria-invalid", "true");
  });

  it("401: komunikat ogólny, wpisana treść zostaje w formularzu", async () => {
    sendHelpMessage.mockRejectedValue(
      new ApiError({
        status: 401,
        code: "unauthenticated",
        message: "Brak tokena.",
      }),
    );

    const user = await otworzIWpisz();
    await user.click(screen.getByRole("button", { name: "Wyślij zgłoszenie" }));

    expect(
      await screen.findByText(
        "Sesja wygasła. Zaloguj się ponownie, aby wysłać zgłoszenie.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Opisz, w czym możemy pomóc")).toHaveValue(TRESC);
  });

  it("awaria sieci: komunikat ogólny, wpisana treść zostaje w formularzu", async () => {
    sendHelpMessage.mockRejectedValue(new TypeError("Failed to fetch"));

    const user = await otworzIWpisz();
    await user.click(screen.getByRole("button", { name: "Wyślij zgłoszenie" }));

    expect(
      await screen.findByText(
        "Nie udało się wysłać zgłoszenia. Sprawdź połączenie i spróbuj ponownie.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Opisz, w czym możemy pomóc")).toHaveValue(TRESC);
  });
});
