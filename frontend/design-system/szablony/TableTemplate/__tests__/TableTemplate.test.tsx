import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { TableTemplate } from "../TableTemplate";
import { jedenMain } from "../../__tests__/jeden-main";
import { Skeleton } from "../../../atomy/Skeleton/Skeleton";
import { Notice } from "../../../molekuly/Notice/Notice";
import { EmptyState } from "../../../molekuly/EmptyState/EmptyState";

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

describe("TableTemplate — świadek jedenMain, pięć stanów obszaru treści", () => {
  it("stan sukces: korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <TableTemplate naglowek={znacznik("naglowek")} tabela={<div>Zwykła treść tabeli.</div>} />,
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-tabela");
  });

  it("stan ladowanie (Skeleton): korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <TableTemplate naglowek={znacznik("naglowek")} tabela={<Skeleton wiersze={3} />} />,
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-tabela");
  });

  it("stan blad (Notice): korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <TableTemplate
        naglowek={znacznik("naglowek")}
        tabela={
          <Notice wariant="error" tytul="Błąd">
            Nie udało się pobrać tabeli.
          </Notice>
        }
      />,
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-tabela");
  });

  it("stan brak uprawnien (Notice): korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <TableTemplate
        naglowek={znacznik("naglowek")}
        tabela={
          <Notice wariant="warn" tytul="Brak uprawnień">
            Ten widok wymaga innej roli.
          </Notice>
        }
      />,
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-tabela");
  });

  it("stan pusty (EmptyState): korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <TableTemplate
        naglowek={znacznik("naglowek")}
        tabela={
          <EmptyState
            naglowek="Brak wierszy"
            tresc="Nie ma jeszcze żadnych wierszy."
            przycisk={{ etykieta: "Dodaj", onClick: () => {} }}
          />
        }
      />,
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-tabela");
  });
});
