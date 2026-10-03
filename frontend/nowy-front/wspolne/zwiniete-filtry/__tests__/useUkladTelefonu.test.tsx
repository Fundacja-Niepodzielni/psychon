import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useUkladTelefonu, ZAPYTANIE_TELEFONU } from "../useUkladTelefonu";

function atrapaMatchMedia(pasuje: boolean) {
  const zapytania: string[] = [];
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (zapytanie: string) => {
      zapytania.push(zapytanie);
      return { matches: pasuje, media: zapytanie, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    },
  });
  return zapytania;
}

afterEach(() => {
  Reflect.deleteProperty(window, "matchMedia");
});

describe("useUkladTelefonu", () => {
  it("bez matchMedia (jsdom, render po stronie serwera) uznaje układ szeroki", () => {
    const { result } = renderHook(() => useUkladTelefonu());
    expect(result.current).toBe(false);
  });

  it("pyta o szerokość poniżej 600 px i zwraca odpowiedź przeglądarki", () => {
    const zapytania = atrapaMatchMedia(true);
    const { result } = renderHook(() => useUkladTelefonu());
    expect(result.current).toBe(true);
    expect(ZAPYTANIE_TELEFONU).toBe("(max-width: 599px)");
    expect(zapytania).toContain(ZAPYTANIE_TELEFONU);
  });

  it("od 600 px zwraca fałsz", () => {
    atrapaMatchMedia(false);
    const { result } = renderHook(() => useUkladTelefonu());
    expect(result.current).toBe(false);
  });
});
