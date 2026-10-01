import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecordList } from "../RecordList";

const PUSTY = { naglowek: "Brak", tresc: "Nic tu nie ma.", przycisk: { etykieta: "Odśwież", onClick: vi.fn() } };

function wiersze(...wartosci: number[]) {
  return wartosci.map((wartosc, i) => ({
    id: `w${i}`,
    tytul: `Wiersz ${i}`,
    wartosc,
    akcja: { etykieta: `Otwórz ${i}`, href: `/w/${i}` },
  }));
}

function napisyLicznikow(kontener: HTMLElement): string[] {
  return Array.from(kontener.querySelectorAll("span > span:first-child")).map(
    (liczba) => `${liczba.textContent} ${liczba.nextElementSibling?.textContent}`,
  );
}

describe("RecordList — jednostka sumy", () => {
  it("napis: ta sama jednostka przy każdym wierszu i w sumie (zachowanie dotychczasowe)", () => {
    const { container } = render(<RecordList tytul="Lista" jednostkaSumy="spraw" wiersze={wiersze(1, 2)} pusty={PUSTY} />);
    expect(napisyLicznikow(container)).toEqual(["1 spraw", "2 spraw", "3 spraw"]);
  });

  it("funkcja: dostaje liczbę wiersza i liczbę sumy, zwraca jednostkę w odpowiedniej formie", () => {
    const jednostka = vi.fn((liczba: number) => (liczba === 1 ? "sprawa" : liczba < 5 ? "sprawy" : "spraw"));
    const { container } = render(
      <RecordList tytul="Lista" jednostkaSumy={jednostka} wiersze={wiersze(1, 2)} pusty={PUSTY} />,
    );
    expect(napisyLicznikow(container)).toEqual(["1 sprawa", "2 sprawy", "3 sprawy"]);
    expect(jednostka).toHaveBeenCalledWith(1);
    expect(jednostka).toHaveBeenCalledWith(2);
    expect(jednostka).toHaveBeenCalledWith(3);
  });

  it("funkcja: suma 5 i więcej dostaje formę dopełniacza", () => {
    const { container } = render(
      <RecordList
        tytul="Lista"
        jednostkaSumy={(liczba) => (liczba === 1 ? "sprawa" : liczba < 5 ? "sprawy" : "spraw")}
        wiersze={wiersze(2, 3)}
        pusty={PUSTY}
      />,
    );
    expect(napisyLicznikow(container)).toEqual(["2 sprawy", "3 sprawy", "5 spraw"]);
  });

  it("bez jednostki: ani liczniki wierszy, ani stopka „Razem”", () => {
    const { container } = render(<RecordList tytul="Lista" wiersze={wiersze(1, 2)} pusty={PUSTY} />);
    expect(napisyLicznikow(container)).toEqual([]);
    expect(container.textContent).not.toContain("Razem");
  });
});

describe("RecordList — nazwa akcji", () => {
  it("etykietaDostepna z wiersza trafia do linku; stary wiersz jej nie ma", () => {
    render(
      <RecordList
        tytul="Lista"
        wiersze={[
          { id: "a", tytul: "A", akcja: { etykieta: "Otwórz", etykietaDostepna: "Otwórz: A", href: "/a" } },
          { id: "b", tytul: "B", akcja: { etykieta: "Otwórz: B", href: "/b" } },
        ]}
        pusty={PUSTY}
      />,
    );
    expect(screen.getByRole("link", { name: "Otwórz: A" })).toHaveAttribute("aria-label", "Otwórz: A");
    expect(screen.getByRole("link", { name: "Otwórz: B" })).not.toHaveAttribute("aria-label");
  });
});

describe("RecordList — stopień nagłówka sekcji", () => {
  it("domyślnie h3 (jak dotąd), z listą i ze stanem pustym", () => {
    const { unmount } = render(<RecordList tytul="Lista" wiersze={wiersze(1)} pusty={PUSTY} />);
    expect(screen.getByRole("heading", { level: 3, name: "Lista" })).toBeInTheDocument();
    unmount();
    render(<RecordList tytul="Lista" wiersze={[]} pusty={PUSTY} />);
    expect(screen.getByRole("heading", { level: 3, name: "Lista" })).toBeInTheDocument();
  });

  it("stopienNaglowka={2}: h2 z listą i ze stanem pustym (kontrola dodatnia: nie ma wtedy h3 tytułu)", () => {
    const { unmount } = render(<RecordList tytul="Lista" stopienNaglowka={2} wiersze={wiersze(1)} pusty={PUSTY} />);
    expect(screen.getByRole("heading", { level: 2, name: "Lista" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3, name: "Lista" })).toBeNull();
    unmount();
    render(<RecordList tytul="Lista" stopienNaglowka={2} wiersze={[]} pusty={PUSTY} />);
    expect(screen.getByRole("heading", { level: 2, name: "Lista" })).toBeInTheDocument();
  });
});

describe("RecordList — nagłówek tylko dla czytnika i wiersze bez wcięcia", () => {
  it("naglowekTylkoDlaCzytnika: nagłówek zostaje w drzewie nagłówków, ale w ukrytym kontenerze", () => {
    render(<RecordList tytul="Sprawy" stopienNaglowka={2} naglowekTylkoDlaCzytnika wiersze={wiersze(1)} pusty={PUSTY} />);
    const naglowek = screen.getByRole("heading", { level: 2, name: "Sprawy" });
    expect(naglowek.parentElement?.className).toMatch(/ukryte/);
  });

  it("domyślnie nagłówek jest widoczny (bez ukrytego kontenera); ukryty także w stanie pustym", () => {
    const { rerender } = render(<RecordList tytul="Sprawy" stopienNaglowka={2} wiersze={wiersze(1)} pusty={PUSTY} />);
    expect(screen.getByRole("heading", { level: 2, name: "Sprawy" }).parentElement?.className ?? "").not.toMatch(/ukryte/);
    rerender(<RecordList tytul="Sprawy" stopienNaglowka={2} naglowekTylkoDlaCzytnika wiersze={[]} pusty={PUSTY} />);
    expect(screen.getByRole("heading", { level: 2, name: "Sprawy" }).parentElement?.className).toMatch(/ukryte/);
  });

  it("punkt odniesienia dla ukrytego nagłówka (position) dostaje wyłącznie lista z naglowekTylkoDlaCzytnika", () => {
    const { container, rerender } = render(<RecordList tytul="Sprawy" wiersze={wiersze(1)} pusty={PUSTY} />);
    expect((container.querySelector("section") as HTMLElement).className).not.toMatch(/sekcjaZUkrytym/);
    rerender(<RecordList tytul="Sprawy" naglowekTylkoDlaCzytnika wiersze={wiersze(1)} pusty={PUSTY} />);
    expect((container.querySelector("section") as HTMLElement).className).toMatch(/sekcjaZUkrytym/);
    rerender(<RecordList tytul="Sprawy" naglowekTylkoDlaCzytnika wiersze={[]} pusty={PUSTY} />);
    expect((container.querySelector("section") as HTMLElement).className).toMatch(/sekcjaZUkrytym/);
  });

  it("wierszeBezWciecia przekazuje bezWciecia do każdego wiersza; pola wiersza docierają do ListRow", () => {
    const { container } = render(
      <RecordList
        tytul="Sprawy"
        wierszeBezWciecia
        wiersze={[
          {
            id: "a",
            tytul: "Dyżur",
            tytulPogrubiony: true,
            tytulDodatek: "Filip Demo",
            podpowiedz: "Czeka od 1 stycznia 2026",
            podpowiedzTylkoDlaCzytnika: true,
            akcja: { etykieta: "Otwórz", href: "/w" },
          },
        ]}
        pusty={PUSTY}
      />,
    );
    expect(container.querySelector('[data-wariant="z-licznikiem"]')?.className).toMatch(/bezWciecia/);
    expect(screen.getByText("Filip Demo")).toBeInTheDocument();
    expect(screen.getByText("Czeka od 1 stycznia 2026").className).toMatch(/ukryte/);
  });
});
