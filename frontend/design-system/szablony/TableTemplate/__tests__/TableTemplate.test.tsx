import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { TableTemplate } from "../TableTemplate";

function znacznik(nazwa: string) {
  return <div data-testid={`sonda-${nazwa}`}>{nazwa}</div>;
}

function identyfikatoryObszarow(kontener: HTMLElement): string[] {
  return Array.from(kontener.querySelectorAll<HTMLElement>("[data-testid^='sonda-']")).map(
    (wezel) => wezel.dataset.testid!.replace("sonda-", ""),
  );
}

describe("TableTemplate", () => {
  it("renderuje obszary w kolejnosci naglowek, statystyki, zdanie, zakres, wykres, tabela, wsparcie (§5, w.185)", () => {
    const { container } = render(
      <TableTemplate
        naglowek={znacznik("naglowek")}
        statystyki={znacznik("statystyki")}
        zdanie={znacznik("zdanie")}
        zakres={znacznik("zakres")}
        wykres={znacznik("wykres")}
        tabela={znacznik("tabela")}
        wsparcie={znacznik("wsparcie")}
      />,
    );
    expect(identyfikatoryObszarow(container)).toEqual([
      "naglowek",
      "statystyki",
      "zdanie",
      "zakres",
      "wykres",
      "tabela",
      "wsparcie",
    ]);
  });

  it("tabela zostaje jedynym obowiazkowym obszarem, gdy reszta pominieta", () => {
    const { container } = render(<TableTemplate naglowek={znacznik("naglowek")} tabela={znacznik("tabela")} />);
    expect(identyfikatoryObszarow(container)).toEqual(["naglowek", "tabela"]);
  });
});
