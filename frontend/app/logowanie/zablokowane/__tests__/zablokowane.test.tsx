import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek ekranu `/logowanie/zablokowane` — cel, dokąd `lib/api/logowanie.ts`
 * (`handleUnauthorized`) przekierowuje ważną sesję Kont Niepodzielni, której
 * konto w PsychON jest zablokowane (401 z
 * kodem `konto_zablokowane`). Mierzy: komunikat o blokadzie jest na
 * ekranie, ekran NIE mówi o powiązaniu konta i NIE ma żadnego powodu blokady,
 * a wylogowanie czyta adres Kont PRZED zakończeniem sesji aplikacji (ten sam
 * wzorzec co `/logowanie/niepowiazane`).
 */

const endSession = vi.fn();
const push = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, endSession: (...args: unknown[]) => endSession(...args) };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push, refresh: vi.fn(), prefetch: vi.fn() }),
}));

const ZablokowanePage = (await import("@/app/logowanie/zablokowane/StaraTresc")).default;

const ADRES_WYLOGOWANIA = "https://konta.example.org/realms/niepodzielni/protocol/openid-connect/logout";

let assign: ReturnType<typeof vi.fn>;
let prawdziwaLokalizacja: PropertyDescriptor | undefined;

beforeEach(() => {
  endSession.mockReset().mockResolvedValue(undefined);
  push.mockReset();
  assign = vi.fn();
  prawdziwaLokalizacja = Object.getOwnPropertyDescriptor(window, "location");
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign, origin: "https://platforma.example.org" },
  });
});

afterEach(() => {
  if (prawdziwaLokalizacja) Object.defineProperty(window, "location", prawdziwaLokalizacja);
  vi.unstubAllGlobals();
});

describe("/logowanie/zablokowane", () => {
  it("nagłówek i komunikat mówią o blokadzie konta", () => {
    render(<ZablokowanePage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Konto jest zablokowane$/);
    expect(
      screen.getByText("Nie możesz teraz korzystać z platformy. Jeśli to pomyłka, skontaktuj się z fundacją."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wyloguj się" })).toBeInTheDocument();
  });

  it("nie twierdzi niczego o powiązaniu konta i nie podaje powodu blokady", () => {
    const { container } = render(<ZablokowanePage />);

    expect(screen.queryByText(/nie jest jeszcze połączone/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/powiązane z żadnym kontem/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Przekaż administratorowi/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/powód/i)).not.toBeInTheDocument();
    expect(container.querySelector("code")).toBeNull();
    expect(screen.queryByRole("button", { name: /kopiuj/i })).not.toBeInTheDocument();
  });

  it("niczego nie czyta z serwera przy montowaniu (stan niesie sam adres)", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<ZablokowanePage />);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(endSession).not.toHaveBeenCalled();
  });

  it("wylogowanie czyta adres Kont, potem kończy sesję, potem wychodzi", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ url: ADRES_WYLOGOWANIA }) })),
    );

    render(<ZablokowanePage />);
    await userEvent.click(screen.getByRole("button", { name: /wyloguj/i }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith(ADRES_WYLOGOWANIA));
    expect(endSession).toHaveBeenCalledTimes(1);
  });

  it("gdy adresu nie da się odczytać: sesja i tak się kończy, powrót na /logowanie", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    render(<ZablokowanePage />);
    await userEvent.click(screen.getByRole("button", { name: /wyloguj/i }));

    await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith("/logowanie");
    expect(assign).not.toHaveBeenCalled();
  });
});
