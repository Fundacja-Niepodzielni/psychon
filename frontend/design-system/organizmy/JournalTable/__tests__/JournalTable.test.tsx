import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { JournalTable, type FiltrJournalTable } from "../JournalTable";

const kolumny = [{ klucz: "zdarzenie", etykieta: "Zdarzenie" }];

function filtrRodzaju(): FiltrJournalTable {
  return {
    id: "rodzaj",
    etykieta: "Rodzaj zdarzenia",
    rodzaj: "wybor",
    opcje: [
      { wartosc: "wszystkie", etykieta: "Wszystkie" },
      { wartosc: "internship", etykieta: "Staż" },
    ],
    wartosc: "wszystkie",
    onZmiana: () => {},
  };
}

describe("JournalTable", () => {
  it("pokazuje filtr, licznik zgodny z wierszami i tabelę", () => {
    render(
      <JournalTable
        tytul="Dziennik zdarzeń"
        filtry={[filtrRodzaju()]}
        kolumny={kolumny}
        wiersze={[
          { id: "z1", wartosci: { zdarzenie: "Zatwierdzenie dyżuru z 22 września" } },
          { id: "z2", wartosci: { zdarzenie: "Odesłanie wpisu z 20 września" } },
        ]}
        szukajka={{ id: "szukaj", etykieta: "Szukaj zdarzenia", wartosc: "", onZmiana: () => {} }}
      />,
    );
    expect(screen.getByRole("region", { name: "Dziennik zdarzeń" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Rodzaj zdarzenia" })).toBeInTheDocument();
    expect(screen.getByText("2 zdarzenia w tym widoku.")).toBeInTheDocument();
    expect(screen.getByText("Zatwierdzenie dyżuru z 22 września")).toBeInTheDocument();
  });

  it("licznik liczy WYŁĄCZNIE z przekazanych (już przefiltrowanych) wierszy", () => {
    render(
      <JournalTable
        tytul="Dziennik zdarzeń"
        filtry={[filtrRodzaju()]}
        kolumny={kolumny}
        wiersze={[{ id: "z1", wartosci: { zdarzenie: "Jedno zdarzenie" } }]}
        szukajka={{ id: "szukaj", etykieta: "Szukaj zdarzenia", wartosc: "", onZmiana: () => {} }}
      />,
    );
    expect(screen.getByText("1 zdarzenie w tym widoku.")).toBeInTheDocument();
  });

  it("pusty wybor pokazuje zdanie o braku zdarzen, licznik zero", () => {
    render(
      <JournalTable
        tytul="Dziennik zdarzeń"
        filtry={[filtrRodzaju()]}
        kolumny={kolumny}
        wiersze={[]}
        szukajka={{ id: "szukaj", etykieta: "Szukaj zdarzenia", wartosc: "", onZmiana: () => {} }}
      />,
    );
    expect(screen.getByText("0 zdarzeń w tym widoku.")).toBeInTheDocument();
    expect(screen.getByText("Dla tego wyboru nie ma zdarzeń. Zmień filtry i spróbuj ponownie.")).toBeInTheDocument();
  });

  it("odnośnik pobrania w nagłówku pojawia się tylko, gdy podany", () => {
    const { rerender } = render(
      <JournalTable
        tytul="Dziennik zdarzeń"
        filtry={[]}
        kolumny={kolumny}
        wiersze={[]}
        szukajka={{ id: "szukaj", etykieta: "Szukaj zdarzenia", wartosc: "", onZmiana: () => {} }}
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    rerender(
      <JournalTable
        tytul="Dziennik zdarzeń"
        filtry={[]}
        kolumny={kolumny}
        wiersze={[]}
        szukajka={{ id: "szukaj", etykieta: "Szukaj zdarzenia", wartosc: "", onZmiana: () => {} }}
        pobranie={{ etykieta: "Pobierz CSV", href: "/admin/audit/export.csv" }}
      />,
    );
    expect(screen.getByRole("link", { name: "Pobierz CSV" })).toHaveAttribute("href", "/admin/audit/export.csv");
  });

  it("nowy wiersz z bieżącej sesji podnosi licznik bez dodatkowej obsługi", () => {
    const { rerender } = render(
      <JournalTable
        tytul="Dziennik zdarzeń"
        filtry={[]}
        kolumny={kolumny}
        wiersze={[{ id: "z1", wartosci: { zdarzenie: "Pierwsze zdarzenie" } }]}
        szukajka={{ id: "szukaj", etykieta: "Szukaj zdarzenia", wartosc: "", onZmiana: () => {} }}
      />,
    );
    expect(screen.getByText("1 zdarzenie w tym widoku.")).toBeInTheDocument();

    rerender(
      <JournalTable
        tytul="Dziennik zdarzeń"
        filtry={[]}
        kolumny={kolumny}
        wiersze={[
          { id: "z1", wartosci: { zdarzenie: "Pierwsze zdarzenie" } },
          { id: "z2", wartosci: { zdarzenie: "Wgląd w dane" } },
        ]}
        szukajka={{ id: "szukaj", etykieta: "Szukaj zdarzenia", wartosc: "", onZmiana: () => {} }}
      />,
    );
    expect(screen.getByText("2 zdarzenia w tym widoku.")).toBeInTheDocument();
    expect(screen.getByText("Wgląd w dane")).toBeInTheDocument();
  });

  it.each([
    [0, "0 zdarzeń w tym widoku."],
    [1, "1 zdarzenie w tym widoku."],
    [2, "2 zdarzenia w tym widoku."],
    [4, "4 zdarzenia w tym widoku."],
    [5, "5 zdarzeń w tym widoku."],
    [12, "12 zdarzeń w tym widoku."],
    [22, "22 zdarzenia w tym widoku."],
  ])("liczba %i wiersze daje odmiane: %s", (liczba, oczekiwany) => {
    render(
      <JournalTable
        tytul="Dziennik zdarzeń"
        filtry={[]}
        kolumny={kolumny}
        wiersze={Array.from({ length: liczba }, (_, indeks) => ({
          id: `z${indeks}`,
          wartosci: { zdarzenie: `Zdarzenie ${indeks}` },
        }))}
        szukajka={{ id: "szukaj", etykieta: "Szukaj zdarzenia", wartosc: "", onZmiana: () => {} }}
      />,
    );
    expect(screen.getByText(oczekiwany)).toBeInTheDocument();
  });
});
