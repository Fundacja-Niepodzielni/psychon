import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { straznikHostow } from "../../wspolne/strona-publiczna/__tests__/hosty";

/**
 * Ekran „Twoje konto”: wczytywanie, tożsamość (z rolami i bez), sesja (401),
 * odmowa (403), awaria serwera i sieci z ponowieniem, wylogowanie — te same
 * wywołania co `app/konto/page.tsx`.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

const fetchWhoAmI = vi.fn();
const endSession = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  fetchWhoAmI: (...a: unknown[]) => fetchWhoAmI(...a),
  endSession: (...a: unknown[]) => endSession(...a),
}));

const { ApiError } = await import("@/lib/api");
const { Konto } = await import("../Konto");

let straznik: ReturnType<typeof straznikHostow>;
const assign = vi.fn();

async function pokaz() {
  let wynik: ReturnType<typeof render> | undefined;
  await act(async () => {
    wynik = render(<Konto />);
  });
  return wynik!;
}

beforeEach(() => {
  push.mockReset();
  fetchWhoAmI.mockReset();
  endSession.mockReset();
  endSession.mockResolvedValue(undefined);
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

describe("konto — stany", () => {
  it("wczytywanie: status i przycisk wylogowania; jeden h1", async () => {
    fetchWhoAmI.mockReturnValue(new Promise(() => {}));
    const { container } = await pokaz();
    expect(screen.getByRole("status", { name: "Wczytywanie…" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Wyloguj" })).toBeTruthy();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(fetchWhoAmI).toHaveBeenCalledWith();
  });

  it("tożsamość: identyfikator i role z odpowiedzi", async () => {
    fetchWhoAmI.mockResolvedValue({ sub: "demo-sub-0001", roles: ["volunteer", "student"] });
    await pokaz();
    expect(screen.getByText("Identyfikator (sub)")).toBeTruthy();
    expect(screen.getByText("demo-sub-0001")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Role z tokenu" }).textContent).toBe("volunteerstudent");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("konto bez ról nazywa ten stan wprost", async () => {
    fetchWhoAmI.mockResolvedValue({ sub: "demo-sub-0002", roles: [] });
    await pokaz();
    expect(screen.getByText("Brak ról — to również jest poprawny stan.")).toBeTruthy();
  });

  it("401: komunikat z kodem, bez tożsamości i bez ponowienia", async () => {
    fetchWhoAmI.mockRejectedValue(new ApiError({ status: 401, code: "unauthenticated", message: "Sesja wygasła." }));
    await pokaz();
    expect(screen.getByRole("alert").textContent).toContain("Sesja wygasła. (kod: unauthenticated)");
    expect(screen.queryByText("Identyfikator (sub)")).toBeNull();
    expect(screen.queryByRole("button", { name: "Spróbuj ponownie" })).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("403: odmowa bez ponowienia", async () => {
    fetchWhoAmI.mockRejectedValue(new ApiError({ status: 403, code: "forbidden", message: "Brak uprawnień." }));
    await pokaz();
    expect(screen.getByRole("heading", { level: 2, name: "Brak dostępu" })).toBeTruthy();
    expect(screen.getByText("Brak uprawnień.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Spróbuj ponownie" })).toBeNull();
  });

  it("awaria sieci: zdanie o połączeniu i ponowienie, które pyta ponownie", async () => {
    fetchWhoAmI.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await pokaz();
    expect(screen.getByRole("alert").textContent).toContain("Nie udało się połączyć z serwerem.");
    fetchWhoAmI.mockResolvedValueOnce({ sub: "demo-sub-0001", roles: [] });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    });
    expect(fetchWhoAmI).toHaveBeenCalledTimes(2);
    expect(screen.getByText("demo-sub-0001")).toBeTruthy();
  });

  it("błąd serwera (500): komunikat serwera, bez kodu", async () => {
    fetchWhoAmI.mockRejectedValue(new ApiError({ status: 500, code: "server_error", message: "Błąd serwera." }));
    await pokaz();
    expect(screen.getByRole("alert").textContent).toContain("Błąd serwera.");
    expect(screen.getByRole("alert").textContent).not.toContain("server_error");
  });
});

describe("konto — wylogowanie", () => {
  it("odczyt adresu przed końcem sesji, potem wyjście", async () => {
    fetchWhoAmI.mockResolvedValue({ sub: "demo-sub-0001", roles: [] });
    await pokaz();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Wyloguj" }));
    });
    expect(straznik.adresy).toEqual(["/api/auth/end-session-url"]);
    expect(endSession).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/konta-wyloguj");
  });

  it("adres nieodczytany: sesja się kończy, powrót na /logowanie/konta", async () => {
    fetchWhoAmI.mockResolvedValue({ sub: "demo-sub-0001", roles: [] });
    straznik.atrapa.mockRejectedValueOnce(new TypeError("x"));
    await pokaz();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Wyloguj" }));
    });
    expect(endSession).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/logowanie/konta");
  });
});
