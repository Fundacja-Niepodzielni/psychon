import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

/**
 * `/panel/po-programie` na tej gałęzi (grupa przełączenia `wspolpraca`
 * włączona, `lib/przelaczenie/grupy.ts`): stara trasa produktu ma
 * przekierować na nową (`/panel/dalsza-wspolpraca`), bez renderowania
 * starej treści. Stara treść (dawny zakres tego testu: stany ładowania,
 * błędu, zakazu, karty programu) żyje teraz niezmieniona w
 * `StaraTresc.tsx` — tam, gdzie grupa jest wyłączona (gałąź mechanizmu),
 * to właśnie ten plik dalej renderuje się i jest pokryty tamtejszym
 * odpowiednikiem tego testu.
 */

const redirectMock = vi.fn();

// Prawdziwy `redirect()` z `next/navigation` przerywa renderowanie
// (rzuca specjalny błąd rozpoznawany przez Next) — atrapa robi to samo,
// żeby test sprawdzał realny kształt: strona NIE renderuje żadnej treści
// po wywołaniu `redirect`, tylko przerywa się na nim.
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    redirectMock(...args);
    throw new Error("NEXT_REDIRECT (atrapa testu)");
  },
}));

const { default: PoProgramiePage } = await import("@/app/(uczestnik)/panel/po-programie/page");

beforeEach(() => {
  redirectMock.mockReset();
});

describe("PoProgramiePage — grupa wspolpraca włączona", () => {
  it("przekierowuje na nową trasę produktu, bez renderowania starej treści", () => {
    expect(() => render(<PoProgramiePage />)).toThrow();
    // React (tryb deweloperski testów) może wywołać funkcję komponentu więcej
    // niż raz przy błędzie w renderze — liczy się WYŁĄCZNIE cel przekierowania,
    // nie liczba wywołań.
    expect(redirectMock).toHaveBeenCalled();
    for (const wywolanie of redirectMock.mock.calls) {
      expect(wywolanie).toEqual(["/panel/dalsza-wspolpraca"]);
    }
  });
});
