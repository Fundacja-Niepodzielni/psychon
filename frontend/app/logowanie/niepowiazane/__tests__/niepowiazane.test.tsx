import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek ekranu `/logowanie/niepowiazane` — cel, dokąd `lib/api.ts`
 * przekierowuje ważną sesję Kont Niepodzielni, której `sub` nie jest jeszcze
 * powiązany z żadnym kontem PsychON (patrz `lib/__tests__/api-401-bez-petli.test.ts`).
 * Mierzy dwie rzeczy: wyjaśnienie po polsku jest na ekranie, a wylogowanie
 * czyta adres Kont PRZED zakończeniem sesji aplikacji — ten sam wzorzec co
 * `/konto` i `PanelShell`.
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

const NiepowiazanePage = (await import("@/app/logowanie/niepowiazane/page")).default;

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

describe("/logowanie/niepowiazane", () => {
  it("wyjaśnia po polsku, że konto nie jest powiązane z PsychON", () => {
    render(<NiepowiazanePage />);
    expect(screen.getByRole("heading")).toHaveTextContent("Konto nie jest jeszcze połączone");
    expect(screen.getByText(/powiązane z żadnym kontem w PsychON/i)).toBeInTheDocument();
  });

  it("wylogowanie czyta adres Kont, potem kończy sesję, potem wychodzi", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ url: ADRES_WYLOGOWANIA }) })),
    );

    render(<NiepowiazanePage />);
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

    render(<NiepowiazanePage />);
    await userEvent.click(screen.getByRole("button", { name: /wyloguj/i }));

    await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith("/logowanie");
    expect(assign).not.toHaveBeenCalled();
  });
});
