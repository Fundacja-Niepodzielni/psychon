import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

/**
 * Świadek haka `useZasob` (C2 wariant C, część 3 „Haki danych").
 * Klient API jest zaślepiony — mierzymy cykl życia pobrania (ładowanie →
 * sukces/błąd → ponowienie), nie sieć.
 */

class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

vi.mock("@/lib/api", () => ({ ApiError }));

const { useZasob } = await import("@/lib/hooks/useZasob");

describe("useZasob", () => {
  it("zaczyna od ładowania i przechodzi w sukces z danymi", async () => {
    const pobierz = vi.fn().mockResolvedValue({ imie: "Marta" });

    const { result } = renderHook(() => useZasob(pobierz));

    expect(result.current.stan).toEqual({ status: "loading" });

    await waitFor(() =>
      expect(result.current.stan).toEqual({
        status: "success",
        data: { imie: "Marta" },
      }),
    );
    expect(pobierz).toHaveBeenCalledTimes(1);
  });

  it("noga negatywna: błąd ApiError trafia do stanu jako komunikat serwera", async () => {
    const pobierz = vi
      .fn()
      .mockRejectedValue(new ApiError(500, "server_error", "Serwer nie odpowiada."));

    const { result } = renderHook(() => useZasob(pobierz));

    await waitFor(() =>
      expect(result.current.stan).toEqual({
        status: "error",
        message: "Serwer nie odpowiada.",
      }),
    );
  });

  it("noga negatywna: błąd spoza ApiError dostaje domyślny komunikat po polsku", async () => {
    const pobierz = vi.fn().mockRejectedValue(new TypeError("network down"));

    const { result } = renderHook(() => useZasob(pobierz));

    await waitFor(() =>
      expect(result.current.stan).toEqual({
        status: "error",
        message: "Nie udało się połączyć z serwerem. Spróbuj ponownie.",
      }),
    );
  });

  it("ponow() wywołuje pobranie jeszcze raz", async () => {
    const pobierz = vi.fn().mockResolvedValue(1);
    const { result } = renderHook(() => useZasob(pobierz));

    await waitFor(() => expect(pobierz).toHaveBeenCalledTimes(1));

    act(() => result.current.ponow());

    await waitFor(() => expect(pobierz).toHaveBeenCalledTimes(2));
  });
});
