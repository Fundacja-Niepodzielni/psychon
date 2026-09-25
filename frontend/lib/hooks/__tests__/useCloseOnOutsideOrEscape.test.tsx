import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import useCloseOnOutsideOrEscape from "@/lib/hooks/useCloseOnOutsideOrEscape";

/**
 * Test hooka `useCloseOnOutsideOrEscape` w izolacji (bez `HelpWidget` ani
 * `NotificationBell`) — mierzy sam mechanizm: klik poza kontenerem i Escape
 * zamykaja panel, klik wewnatrz kontenera NIE zamyka go, a nasluch znika po
 * odmontowaniu.
 *
 * Kontrola negatywna: podmiana ciala haka na pusty efekt gasi te proby
 * (sam `return;` w `useEffect`, linia 19 pliku hooka) — wszystkie ponizsze
 * testy padaja na czerwono, bo hook przestaje cokolwiek robic.
 */

function Testowy() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(true);

  useCloseOnOutsideOrEscape(containerRef, open, setOpen);

  return (
    <div>
      <p data-testid="stan">{open ? "otwarty" : "zamkniety"}</p>
      <div ref={containerRef} data-testid="panel">
        <button type="button">przycisk wewnatrz</button>
      </div>
      <button type="button" data-testid="na-zewnatrz">
        przycisk na zewnatrz
      </button>
    </div>
  );
}

describe("useCloseOnOutsideOrEscape", () => {
  it("klik poza kontenerem zamyka panel", () => {
    render(<Testowy />);
    expect(screen.getByTestId("stan")).toHaveTextContent("otwarty");

    fireEvent.mouseDown(screen.getByTestId("na-zewnatrz"));

    expect(screen.getByTestId("stan")).toHaveTextContent("zamkniety");
  });

  it("klawisz Escape zamyka panel", () => {
    render(<Testowy />);
    expect(screen.getByTestId("stan")).toHaveTextContent("otwarty");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.getByTestId("stan")).toHaveTextContent("zamkniety");
  });

  it("klik wewnatrz kontenera NIE zamyka panelu", () => {
    render(<Testowy />);
    expect(screen.getByTestId("stan")).toHaveTextContent("otwarty");

    fireEvent.mouseDown(screen.getByRole("button", { name: "przycisk wewnatrz" }));

    expect(screen.getByTestId("stan")).toHaveTextContent("otwarty");
  });

  it("nasluch jest zdejmowany przy odmontowaniu — brak wycieku", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { unmount } = render(<Testowy />);

    unmount();

    const zdjeteTypy = removeSpy.mock.calls.map(([typ]) => typ);
    expect(zdjeteTypy).toContain("mousedown");
    expect(zdjeteTypy).toContain("keydown");

    removeSpy.mockRestore();
  });
});
