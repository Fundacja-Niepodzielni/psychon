import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ListTemplate } from "../ListTemplate";

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
