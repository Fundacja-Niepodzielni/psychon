import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ListRow } from "../ListRow";
import { naruszeniaSeparatora } from "./separator-linii";

describe("ListRow — akcja", () => {
  it("stare wywołanie (bez etykietaDostepna): nazwa dostępna to widoczny napis, bez aria-label", () => {
    render(<ListRow tytul="Wiersz" akcja={{ etykieta: "Otwórz: Wiersz", href: "/w" }} />);
    const odnosnik = screen.getByRole("link", { name: "Otwórz: Wiersz" });
    expect(odnosnik).toHaveAttribute("href", "/w");
    expect(odnosnik).not.toHaveAttribute("aria-label");
  });

  it("z etykietaDostepna: widoczny krótki napis, pełna nazwa dla czytnika", () => {
    render(
      <ListRow tytul="Wiersz" akcja={{ etykieta: "Otwórz", etykietaDostepna: "Otwórz: Wiersz", href: "/w" }} />,
    );
    const odnosnik = screen.getByRole("link", { name: "Otwórz: Wiersz" });
    expect(odnosnik.textContent).toMatch(/^Otwórz\s*›$/);
    expect(odnosnik).toHaveAttribute("aria-label", "Otwórz: Wiersz");
  });

  it("strzałka „›” jest ukryta przed czytnikiem", () => {
    render(<ListRow tytul="Wiersz" akcja={{ etykieta: "Otwórz", href: "/w" }} />);
    expect(screen.getByText("›")).toHaveAttribute("aria-hidden", "true");
  });

  it("akcja bez href to przycisk: stare wywołanie bez aria-label, nowe z pełną nazwą", () => {
    const onKliknij = vi.fn();
    const { unmount } = render(<ListRow tytul="Wiersz" akcja={{ etykieta: "Edytuj", onKliknij }} />);
    expect(screen.getByRole("button", { name: "Edytuj" })).not.toHaveAttribute("aria-label");
    unmount();
    render(<ListRow tytul="Wiersz" akcja={{ etykieta: "Edytuj", etykietaDostepna: "Edytuj: Wiersz", onKliknij }} />);
    expect(screen.getByRole("button", { name: "Edytuj: Wiersz" })).toHaveTextContent("Edytuj");
  });
});

describe("ListRow — plakietka", () => {
  it("plakietka stoi w DOM przed tytułem, w jednym nagłówku z nim", () => {
    render(
      <ListRow
        tytul="Tytuł wiersza"
        plakietka={{ wariant: "warn", tekst: "czeka na decyzję" }}
        akcja={{ etykieta: "Otwórz", href: "/w" }}
      />,
    );
    const plakietka = screen.getByText("czeka na decyzję");
    const tytul = screen.getByText("Tytuł wiersza");
    expect(plakietka.compareDocumentPosition(tytul) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const naglowek = plakietka.closest("div");
    expect(naglowek?.contains(tytul)).toBe(true);
  });

  it("bez plakietki tytuł nadal się renderuje", () => {
    render(<ListRow tytul="Sam tytuł" akcja={{ etykieta: "Otwórz", href: "/w" }} />);
    expect(screen.getByText("Sam tytuł")).toBeInTheDocument();
  });
});

describe("ListRow — akcja nieaktywna", () => {
  it("przycisk z kłódką i aria-disabled, bez odnośnika i bez obsługi kliknięcia", () => {
    const onKliknij = vi.fn();
    const { container } = render(
      <ListRow tytul="Kurs" akcja={{ etykieta: "Zamknięty", nieaktywna: true, href: "/k", onKliknij }} />,
    );
    const przycisk = screen.getByRole("button", { name: "Zamknięty" });
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    expect(przycisk.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("a")).toBeNull();
    przycisk.click();
    expect(onKliknij).not.toHaveBeenCalled();
  });

  it("z etykietaDostepna: pełna nazwa dla czytnika, widoczny krótki napis", () => {
    render(<ListRow tytul="Kurs" akcja={{ etykieta: "Zamknięty", etykietaDostepna: "Zamknięty: Kurs", nieaktywna: true }} />);
    expect(screen.getByRole("button", { name: "Zamknięty: Kurs" })).toHaveTextContent("Zamknięty");
  });

  it("bez `nieaktywna` akcja z href zostaje odnośnikiem (stare wywołania bez zmian)", () => {
    render(<ListRow tytul="Kurs" akcja={{ etykieta: "Otwórz", href: "/k" }} />);
    expect(screen.getByRole("link", { name: /^Otwórz/ })).toHaveAttribute("href", "/k");
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("ListRow — wiersz kolejki decyzji (makieta A-02)", () => {
  it("tytuł pogrubiony i druga część tytułu po separatorze, który należy do tej drugiej części", () => {
    render(
      <ListRow
        tytul="Dyżur"
        tytulPogrubiony
        tytulDodatek="Filip Demo"
        plakietka={{ wariant: "warn", tekst: "czeka 5 dni" }}
        akcja={{ etykieta: "Otwórz", href: "/w" }}
      />,
    );
    const naglowek = screen.getByText("Dyżur").parentElement!;
    expect(naglowek.className).toMatch(/pogrubiony/);
    const dodatek = screen.getByText("Filip Demo").parentElement!;
    expect(dodatek.textContent).toBe("·Filip Demo");
    // Separator jest pierwszym dzieckiem dodatku i nigdy nie zostaje na końcu linii.
    expect(naruszeniaSeparatora(naglowek)).toEqual([]);
    // Kolejność w DOM: plakietka, tytuł, dodatek (poniżej 640 px układ przestawia `order`).
    const tekst = naglowek.textContent ?? "";
    expect(tekst.indexOf("czeka 5 dni")).toBeLessThan(tekst.indexOf("Dyżur"));
    expect(tekst.indexOf("Dyżur")).toBeLessThan(tekst.indexOf("Filip Demo"));
  });

  it("kontrola dodatnia miernika separatora: separator osobno, na końcu albo bez tekstu jest naruszeniem", () => {
    const osobno = document.createElement("div");
    osobno.innerHTML = '<span>Dyżur</span><span aria-hidden="true">·</span><span>Filip Demo</span>';
    expect(naruszeniaSeparatora(osobno)).toHaveLength(1);

    const naKoncu = document.createElement("div");
    naKoncu.innerHTML = '<span><span>Filip Demo</span><span aria-hidden="true">·</span></span>';
    expect(naruszeniaSeparatora(naKoncu)).not.toEqual([]);

    const poprawny = document.createElement("div");
    poprawny.innerHTML = '<span><span aria-hidden="true">·</span><span>Filip Demo</span></span>';
    expect(naruszeniaSeparatora(poprawny)).toEqual([]);
  });

  it("podpowiedzTylkoDlaCzytnika: tekst jest w drzewie dostępności, ale wzrokowo ukryty (bez Hint)", () => {
    render(
      <ListRow
        tytul="Dyżur"
        podpowiedz="Czeka od 1 stycznia 2026"
        podpowiedzTylkoDlaCzytnika
        akcja={{ etykieta: "Otwórz", href: "/w" }}
      />,
    );
    expect(screen.getByText("Czeka od 1 stycznia 2026").className).toMatch(/ukryte/);
  });

  it("bez podpowiedzTylkoDlaCzytnika podpowiedź jest widoczna jak dotąd", () => {
    render(<ListRow tytul="Dyżur" podpowiedz="Czeka od 1 stycznia 2026" akcja={{ etykieta: "Otwórz", href: "/w" }} />);
    expect(screen.getByText("Czeka od 1 stycznia 2026").className).not.toMatch(/ukryte/);
  });

  it("bezWciecia dodaje klasę bez wcięcia; domyślnie wiersz ma wcięcie", () => {
    const { container, rerender } = render(<ListRow tytul="Wiersz" akcja={{ etykieta: "Otwórz", href: "/w" }} />);
    expect((container.firstElementChild as HTMLElement).className).not.toMatch(/bezWciecia/);
    rerender(<ListRow tytul="Wiersz" bezWciecia akcja={{ etykieta: "Otwórz", href: "/w" }} />);
    expect((container.firstElementChild as HTMLElement).className).toMatch(/bezWciecia/);
  });

  it("bez tytulDodatek nie ma separatora ani drugiej części (dotychczasowe wywołania)", () => {
    const { container } = render(<ListRow tytul="Wiersz" akcja={{ etykieta: "Otwórz", href: "/w" }} />);
    expect(container.textContent).not.toContain("·");
  });
});
