import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
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
