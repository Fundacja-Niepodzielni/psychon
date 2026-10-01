import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GrupaZwijana, type GrupaZwijanaDane } from "../GrupaZwijana";

/**
 * Jedna definicja zwijania grupy menu („Ustawienia (3)”, „Dotychczasowy panel (n)”):
 * zwinięta na wejściu, rozwinięta przy pozycji bieżącej (strona albo sekcja), przełączana
 * prawdziwym przyciskiem (klik, Enter, Spacja), z `aria-expanded` i `aria-controls`.
 */

afterEach(cleanup);

const GRUPA: GrupaZwijanaDane = {
  naglowek: "Ustawienia",
  pozycje: [
    { ikona: "clock", etykieta: "Słownik form stażu", href: "/admin/formy-stazu" },
    { ikona: "file", etykieta: "Wzory dokumentów", href: "/admin/wzory-dokumentow" },
    { ikona: "cog", etykieta: "Treść ekranu „Zacznij tutaj”", href: "/admin/ekran-startowy" },
  ],
  liniaWPrzygotowaniu: "ustawienia roku programu",
};

function zBiezaca(biezaca: boolean | "sekcja", indeks = 1): GrupaZwijanaDane {
  return { ...GRUPA, pozycje: GRUPA.pozycje.map((p, i) => (i === indeks ? { ...p, biezaca } : p)) };
}

function przycisk() {
  return screen.getByRole("button", { name: "Ustawienia (3)" });
}

function lista(): HTMLElement {
  const el = document.getElementById(przycisk().getAttribute("aria-controls") ?? "");
  if (!el) throw new Error("Brak listy wskazanej przez aria-controls");
  return el;
}

describe("GrupaZwijana", () => {
  it("na wejściu zwinięta: przycisk „Ustawienia (3)” ze znakiem „+”, aria-expanded=false, lista w DOM z hidden, pozycje poza drzewem dostępności", () => {
    render(<GrupaZwijana grupa={GRUPA} />);
    expect(przycisk().tagName).toBe("BUTTON");
    expect(przycisk().getAttribute("type")).toBe("button");
    expect(przycisk().getAttribute("aria-expanded")).toBe("false");
    expect(przycisk().textContent).toBe("Ustawienia (3)+");
    expect(lista().hidden).toBe(true);
    expect(lista().querySelectorAll("a")).toHaveLength(3);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("aria-controls wskazuje id listy z pozycjami i linią „W przygotowaniu” (obie wewnątrz części zwijanej)", () => {
    render(<GrupaZwijana grupa={GRUPA} />);
    const id = przycisk().getAttribute("aria-controls");
    expect(id).toBeTruthy();
    expect(lista().id).toBe(id);
    expect(lista().textContent).toContain("Słownik form stażu");
    expect(lista().textContent).toContain("W przygotowaniu: ustawienia roku programu.");
    // Linia stoi pod pozycjami.
    const linia = Array.from(lista().querySelectorAll("p")).find((p) => p.textContent?.startsWith("W przygotowaniu"));
    const ostatniaPozycja = lista().querySelectorAll("a")[2];
    expect(ostatniaPozycja.compareDocumentPosition(linia as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("bez linii „W przygotowaniu” w danych — brak linii", () => {
    render(<GrupaZwijana grupa={{ ...GRUPA, liniaWPrzygotowaniu: undefined }} />);
    expect(lista().textContent).not.toContain("W przygotowaniu");
  });

  it("pozycja bieżąca (true) — rozwinięta na wejściu, znak „−”, pozycje jako łącza", () => {
    render(<GrupaZwijana grupa={zBiezaca(true)} />);
    expect(przycisk().getAttribute("aria-expanded")).toBe("true");
    expect(przycisk().textContent).toBe("Ustawienia (3)−");
    expect(lista().hidden).toBe(false);
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Wzory dokumentów" }).getAttribute("aria-current")).toBe("page");
  });

  it("podstrona pozycji („sekcja”) — rozwinięta na wejściu", () => {
    render(<GrupaZwijana grupa={zBiezaca("sekcja")} />);
    expect(przycisk().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: "Wzory dokumentów" }).getAttribute("aria-current")).toBe("true");
  });

  it("klik przełącza: rozwija i zwija", () => {
    render(<GrupaZwijana grupa={GRUPA} />);
    fireEvent.click(przycisk());
    expect(przycisk().getAttribute("aria-expanded")).toBe("true");
    expect(lista().hidden).toBe(false);
    fireEvent.click(przycisk());
    expect(przycisk().getAttribute("aria-expanded")).toBe("false");
    expect(lista().hidden).toBe(true);
  });

  it("Enter i Spacja na przycisku przełączają (przycisk natywny)", async () => {
    const uzytkownik = userEvent.setup();
    render(<GrupaZwijana grupa={GRUPA} />);
    przycisk().focus();
    await uzytkownik.keyboard("{Enter}");
    expect(przycisk().getAttribute("aria-expanded")).toBe("true");
    await uzytkownik.keyboard(" ");
    expect(przycisk().getAttribute("aria-expanded")).toBe("false");
    await uzytkownik.keyboard(" ");
    expect(przycisk().getAttribute("aria-expanded")).toBe("true");
  });

  it("ręczne zwinięcie grupy z pozycją bieżącą działa", () => {
    render(<GrupaZwijana grupa={zBiezaca(true)} />);
    fireEvent.click(przycisk());
    expect(przycisk().getAttribute("aria-expanded")).toBe("false");
    expect(lista().hidden).toBe(true);
  });

  it("dwa wystąpienia (bok i okno menu) mają różne id listy i własny stan", () => {
    render(
      <>
        <GrupaZwijana grupa={GRUPA} />
        <GrupaZwijana grupa={GRUPA} />
      </>,
    );
    const [pierwszy, drugi] = screen.getAllByRole("button", { name: "Ustawienia (3)" });
    expect(pierwszy.getAttribute("aria-controls")).not.toBe(drugi.getAttribute("aria-controls"));
    fireEvent.click(pierwszy);
    expect(pierwszy.getAttribute("aria-expanded")).toBe("true");
    expect(drugi.getAttribute("aria-expanded")).toBe("false");
  });

  it("zmiana trasy na ekran w grupie rozwija ją bez kliknięcia; zmiana trasy poza grupę zwija", () => {
    const { rerender } = render(<GrupaZwijana grupa={GRUPA} />);
    expect(przycisk().getAttribute("aria-expanded")).toBe("false");
    rerender(<GrupaZwijana grupa={zBiezaca(true, 0)} />);
    expect(przycisk().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: "Słownik form stażu" }).getAttribute("aria-current")).toBe("page");
    rerender(<GrupaZwijana grupa={GRUPA} />);
    expect(przycisk().getAttribute("aria-expanded")).toBe("false");
  });

  it("przejście między pozycjami grupy zachowuje ręcznie wybrany stan", () => {
    const { rerender } = render(<GrupaZwijana grupa={zBiezaca(true, 0)} />);
    fireEvent.click(przycisk());
    expect(przycisk().getAttribute("aria-expanded")).toBe("false");
    rerender(<GrupaZwijana grupa={zBiezaca(true, 2)} />);
    expect(przycisk().getAttribute("aria-expanded")).toBe("false");
  });

  it("liczba w przycisku to liczba pozycji grupy", () => {
    render(<GrupaZwijana grupa={{ ...GRUPA, naglowek: "Dotychczasowy panel", pozycje: GRUPA.pozycje.slice(0, 2) }} />);
    expect(screen.getByRole("button", { name: "Dotychczasowy panel (2)" })).toBeTruthy();
  });
});
