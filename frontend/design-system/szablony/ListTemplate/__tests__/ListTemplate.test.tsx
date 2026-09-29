import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ListTemplate } from "../ListTemplate";
import { jedenMain } from "../../__tests__/jeden-main";
import { Skeleton } from "../../../atomy/Skeleton/Skeleton";
import { Notice } from "../../../molekuly/Notice/Notice";
import { EmptyState } from "../../../molekuly/EmptyState/EmptyState";

/** Znaczniki obszarow — zadny nie jest prawdziwym organizmem, tylko sondą
 * kolejnosci w DOM (test kolejnosci obszarow, nie wygladu). */
function znacznik(nazwa: string) {
  return <div data-testid={`sonda-${nazwa}`}>{nazwa}</div>;
}

function identyfikatoryObszarow(kontener: HTMLElement): string[] {
  return Array.from(kontener.querySelectorAll<HTMLElement>("[data-testid^='sonda-']")).map(
    (wezel) => wezel.dataset.testid!.replace("sonda-", ""),
  );
}

describe("ListTemplate", () => {
  it("renderuje obszary w kolejnosci naglowek, filtry, lista, stronicowanie (§5, w.183)", () => {
    const { container } = render(
      <ListTemplate
        naglowek={znacznik("naglowek")}
        filtry={znacznik("filtry")}
        lista={znacznik("lista")}
        stronicowanie={znacznik("stronicowanie")}
      />,
    );
    expect(identyfikatoryObszarow(container)).toEqual(["naglowek", "filtry", "lista", "stronicowanie"]);
  });

  it("pomija filtry i stronicowanie, gdy nie sa podane — lista zostaje obszarem glownym", () => {
    const { container } = render(<ListTemplate naglowek={znacznik("naglowek")} lista={znacznik("lista")} />);
    expect(identyfikatoryObszarow(container)).toEqual(["naglowek", "lista"]);
  });
});

describe("ListTemplate — świadek jedenMain, pięć stanów obszaru treści", () => {
  it("stan sukces: korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <ListTemplate naglowek={znacznik("naglowek")} lista={<div>Zwykła treść listy.</div>} />,
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-lista");
  });

  it("stan ladowanie (Skeleton): korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <ListTemplate naglowek={znacznik("naglowek")} lista={<Skeleton wiersze={3} />} />,
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-lista");
  });

  it("stan blad (Notice): korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <ListTemplate
        naglowek={znacznik("naglowek")}
        lista={
          <Notice wariant="error" tytul="Błąd">
            Nie udało się pobrać listy.
          </Notice>
        }
      />,
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-lista");
  });

  it("stan brak uprawnien (Notice): korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <ListTemplate
        naglowek={znacznik("naglowek")}
        lista={
          <Notice wariant="warn" tytul="Brak uprawnień">
            Ten widok wymaga innej roli.
          </Notice>
        }
      />,
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-lista");
  });

  it("stan pusty (EmptyState): korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <ListTemplate
        naglowek={znacznik("naglowek")}
        lista={
          <EmptyState
            naglowek="Brak wpisów"
            tresc="Nie ma jeszcze żadnych wpisów."
            przycisk={{ etykieta: "Dodaj", onClick: () => {} }}
          />
        }
      />,
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-lista");
  });
});
