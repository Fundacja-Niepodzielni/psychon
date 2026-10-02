import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.fn();
let adres = "";

vi.mock("@/lib/api/klient", () => ({ api: (...argumenty: unknown[]) => api(...argumenty) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(adres) }));

import { useTrybPodgladu } from "../useTrybPodgladu";

beforeEach(() => {
  api.mockReset();
  adres = "";
});

describe("useTrybPodgladu", () => {
  it("bez parametru w adresie nie czyta konta i nie włącza podglądu", async () => {
    api.mockResolvedValue({ role: "instructor" });
    const { result } = renderHook(() => useTrybPodgladu());
    expect(result.current).toEqual({ podglad: false, rola: null });
    expect(api).not.toHaveBeenCalled();
  });

  it.each([["project_manager"], ["super_admin"], ["instructor"]])("parametr i rola %s włączają podgląd z jednym odczytem konta", async (rola) => {
    adres = "podglad=1";
    api.mockResolvedValue({ role: rola });
    const { result } = renderHook(() => useTrybPodgladu());
    expect(result.current.podglad).toBe(false);
    await waitFor(() => expect(result.current).toEqual({ podglad: true, rola }));
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/me");
  });

  it("uczestnik z parametrem: rola znana, podglądu nie ma", async () => {
    adres = "podglad=1";
    api.mockResolvedValue({ role: "volunteer" });
    const { result } = renderHook(() => useTrybPodgladu());
    await waitFor(() => expect(result.current.rola).toBe("volunteer"));
    expect(result.current.podglad).toBe(false);
  });

  it("błąd odczytu konta: bez podglądu, bez wyjątku", async () => {
    adres = "podglad=1";
    api.mockRejectedValue(new Error("sieć"));
    const { result } = renderHook(() => useTrybPodgladu());
    await waitFor(() => expect(api).toHaveBeenCalled());
    expect(result.current).toEqual({ podglad: false, rola: null });
  });

  it("rola nie jest tekstem: bez podglądu", async () => {
    adres = "podglad=1";
    api.mockResolvedValue({ role: 7 });
    const { result } = renderHook(() => useTrybPodgladu());
    await waitFor(() => expect(api).toHaveBeenCalled());
    expect(result.current).toEqual({ podglad: false, rola: null });
  });
});
