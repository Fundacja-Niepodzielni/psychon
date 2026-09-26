import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Wysylka zgloszenia z okna pomocy i potwierdzenie numerem zgloszenia.
 *
 * Backend: `POST /help-messages` w `backend/routes/api/pomoc.php:21`.
 * `sendHelpMessage` jest tu atrapa; kod produktu
 * (`components/layout/HelpWidget.tsx`) wola prawdziwa trase.
 *
 * Kontrola negatywna kryterium "zalogowany wysyla wiadomosc": usuniecie
 * pola `screen` z zadania (`lib/api/help.ts` / `HelpWidget.tsx`) gasi test
 * "wysyla tresc i sciezke biezacego ekranu" na czerwono.
 *
 * Kontrola negatywna kryterium "nadawca dostaje potwierdzenie": usuniecie
 * numeru zgloszenia z komunikatu gasi test "pokazuje numer zgloszenia" na
 * czerwono.
 */

let sciezka = "/panel/kursy/123";

vi.mock("next/navigation", () => ({
  usePathname: () => sciezka,
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

beforeEach(() => {
  sciezka = "/panel/kursy/123";
  sendHelpMessage.mockReset();
});

async function otworzIWpisz(tresc: string) {
  const user = userEvent.setup();
  render(<HelpWidget />);

  await user.click(screen.getByRole("button", { name: "Pomoc" }));
  await user.type(
    screen.getByLabelText("Opisz, w czym możemy pomóc"),
    tresc,
  );
  return user;
}

describe("HelpWidget — wysyłka zgłoszenia", () => {
  it("wysyła żądanie POST z treścią i ścieżką bieżącego ekranu, bez roli ani identyfikatora nadawcy", async () => {
    sendHelpMessage.mockResolvedValue({
      id: 1,
      reference: "POM-000123",
      created_at: "2026-09-25T10:00:00Z",
    });

    const user = await otworzIWpisz("Nie mogę otworzyć lekcji 3.");
    await user.click(screen.getByRole("button", { name: "Wyślij zgłoszenie" }));

    expect(sendHelpMessage).toHaveBeenCalledTimes(1);
    expect(sendHelpMessage).toHaveBeenCalledWith({
      content: "Nie mogę otworzyć lekcji 3.",
      screen: "/panel/kursy/123",
    });
  });

  it("pokazuje numer zgłoszenia z odpowiedzi jako potwierdzenie", async () => {
    sendHelpMessage.mockResolvedValue({
      id: 42,
      reference: "POM-000456",
      created_at: "2026-09-25T10:05:00Z",
    });

    const user = await otworzIWpisz("Pytanie o certyfikat.");
    await user.click(screen.getByRole("button", { name: "Wyślij zgłoszenie" }));

    expect(await screen.findByText("Zgłoszenie wysłane, numer POM-000456.")).toBeInTheDocument();
  });
});
