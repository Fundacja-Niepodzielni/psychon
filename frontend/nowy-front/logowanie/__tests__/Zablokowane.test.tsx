import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { straznikHostow } from "../../wspolne/strona-publiczna/__tests__/hosty";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

const endSession = vi.fn();
const api = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  endSession: (...a: unknown[]) => endSession(...a),
  api: (...a: unknown[]) => api(...a),
}));

const { Zablokowane } = await import("../Zablokowane");
let straznik: ReturnType<typeof straznikHostow>;
const assign = vi.fn();

beforeEach(() => {
  push.mockReset();
  endSession.mockReset();
  endSession.mockResolvedValue(undefined);
  api.mockReset();
  assign.mockReset();
  vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, assign } as unknown as Location);
  straznik = straznikHostow(() => ({ json: async () => ({ url: "/konta-wyloguj" }) }));
});

afterEach(() => {
  expect(straznik.obce()).toEqual([]);
  straznik.przywroc();
  cleanup();
  vi.restoreAllMocks();
});

describe("konto zablokowane", () => {
  it("nagłówek i komunikat o blokadzie; wejście niczego nie czyta z serwera", async () => {
    const { container } = render(<Zablokowane />);
    expect(screen.getByRole("heading", { level: 1, name: "Konto jest zablokowane" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "Nie możesz teraz korzystać z platformy. Jeśli to pomyłka, skontaktuj się z fundacją.",
    );
    expect(screen.queryByText(/powiąz|powód/i)).toBeNull();
    expect(api).not.toHaveBeenCalled();
    expect(straznik.adresy).toEqual([]);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
  });

  it("wylogowanie: odczyt adresu, koniec sesji, wyjście", async () => {
    render(<Zablokowane />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Wyloguj się" }));
    });
    expect(straznik.adresy).toEqual(["/api/auth/end-session-url"]);
    expect(endSession).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/konta-wyloguj");
  });

  it("adres nieodczytany: sesja się kończy, powrót na /logowanie", async () => {
    straznik.atrapa.mockRejectedValueOnce(new TypeError("x"));
    render(<Zablokowane />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Wyloguj się" }));
    });
    expect(endSession).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/logowanie");
  });
});
