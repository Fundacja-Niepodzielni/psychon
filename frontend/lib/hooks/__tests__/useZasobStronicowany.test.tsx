import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

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

const { useZasobStronicowany } = await import("@/lib/hooks/useZasobStronicowany");

describe("useZasobStronicowany", () => {
  it("pobiera pierwszą stronę i wystawia meta", async () => {
    const pobierz = vi.fn().mockResolvedValue({
      data: [{ id: 1 }],
      meta: { current_page: 1, per_page: 10, total: 1, last_page: 1 },
    });

    const { result } = renderHook(() => useZasobStronicowany(pobierz));

    expect(result.current.stan).toEqual({ status: "loading" });

    await waitFor(() =>
      expect(result.current.stan).toEqual({
        status: "success",
        data: [{ id: 1 }],
      }),
    );
    expect(result.current.meta?.last_page).toBe(1);
    expect(pobierz).toHaveBeenCalledWith(1);
  });

  it("noga negatywna: błąd serwera na dowolnej stronie trafia do stanu error", async () => {
    const pobierz = vi
      .fn()
      .mockRejectedValue(new ApiError(500, "server_error", "Lista niedostępna."));

    const { result } = renderHook(() => useZasobStronicowany(pobierz));

    await waitFor(() =>
      expect(result.current.stan).toEqual({
        status: "error",
        message: "Lista niedostępna.",
      }),
    );
  });

  it("ustawStrone() odpytuje serwer o nową stronę", async () => {
    const pobierz = vi.fn().mockResolvedValue({ data: [], meta: undefined });
    const { result } = renderHook(() => useZasobStronicowany(pobierz));

    await waitFor(() => expect(pobierz).toHaveBeenCalledWith(1));

    act(() => result.current.ustawStrone(2));

    await waitFor(() => expect(pobierz).toHaveBeenCalledWith(2));
  });
});
