import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { DashboardTemplate } from "../DashboardTemplate/DashboardTemplate";
import { DetailTemplate } from "../DetailTemplate/DetailTemplate";
import { FormTemplate } from "../FormTemplate/FormTemplate";
import { LessonTemplate } from "../LessonTemplate/LessonTemplate";
import { ListTemplate } from "../ListTemplate/ListTemplate";
import { TableTemplate } from "../TableTemplate/TableTemplate";
import { DostawcaPowloki, useWPowloce } from "../KontekstPowloki";
import { jedenMain } from "./jeden-main";

const naglowek = { okruszki: [{ etykieta: "Ekran" }], tytul: "Ekran", onPowrot: () => {} };
const tresc = <div>Treść ekranu</div>;

const SZABLONY: { nazwa: string; styleId: string; element: () => ReactElement }[] = [
  {
    nazwa: "DashboardTemplate",
    styleId: "szablon-pulpit",
    element: () => <DashboardTemplate naglowek={naglowek} glowna={tresc} wspierajaca={tresc} />,
  },
  {
    nazwa: "DetailTemplate",
    styleId: "szablon-szczegol",
    element: () => <DetailTemplate naglowek={naglowek} glowna={tresc} wspierajaca={tresc} />,
  },
  {
    nazwa: "FormTemplate",
    styleId: "szablon-formularz",
    element: () => <FormTemplate naglowek={tresc} tresc={tresc} />,
  },
  {
    nazwa: "LessonTemplate",
    styleId: "szablon-lekcja",
    element: () => <LessonTemplate naglowek={naglowek} glowna={tresc} wspierajaca={tresc} />,
  },
  {
    nazwa: "ListTemplate",
    styleId: "szablon-lista",
    element: () => <ListTemplate naglowek={tresc} lista={tresc} />,
  },
  {
    nazwa: "TableTemplate",
    styleId: "szablon-tabela",
    element: () => <TableTemplate naglowek={tresc} tabela={tresc} />,
  },
];

/**
 * Kontrola pod powłoką panelu: w drzewie nie ma ani jednego `main` ani
 * elementu z `id="tresc"` (oba niesie powłoka), a korzeń szablonu jest
 * zwykłym `div` z oczekiwanym `data-style-id`, bez `tabindex`. Rzuca, żeby
 * czerwień niosła treść błędu.
 */
function korzenBezMaina(container: HTMLElement, styleId: string): void {
  const maina = container.querySelectorAll("main").length;
  if (maina !== 0) throw new Error(`oczekiwano 0 main pod powłoką, znaleziono ${maina}`);

  const identyfikatory = container.querySelectorAll("#tresc").length;
  if (identyfikatory !== 0) throw new Error(`oczekiwano 0 elementów #tresc pod powłoką, znaleziono ${identyfikatory}`);

  const korzen = container.querySelector<HTMLElement>(`[data-style-id='${styleId}']`);
  if (!korzen) throw new Error(`brak korzenia z data-style-id=${styleId}`);
  if (korzen.tagName !== "DIV") throw new Error(`korzeń pod powłoką to <${korzen.tagName.toLowerCase()}>, oczekiwano <div>`);
  if (korzen.hasAttribute("tabindex")) throw new Error("korzeń pod powłoką niesie tabindex");
}

describe.each(SZABLONY)("$nazwa — kontekst powłoki", ({ styleId, element }) => {
  it("bez dostawcy: korzeń jest main#tresc z tabIndex=-1 i data-style-id", () => {
    const { container } = render(element());
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe(styleId);
  });

  it("w dostawcy: 0 main, 0 #tresc, korzeń div z tym samym data-style-id i tą samą klasą", () => {
    const poza = render(element());
    const klasaPoza = poza.container.querySelector<HTMLElement>(`[data-style-id='${styleId}']`)?.className;
    poza.unmount();

    const { container } = render(<DostawcaPowloki>{element()}</DostawcaPowloki>);
    expect(() => korzenBezMaina(container, styleId)).not.toThrow();
    expect(container.querySelector<HTMLElement>(`[data-style-id='${styleId}']`)?.className).toBe(klasaPoza);
    expect(klasaPoza).toBeTruthy();
  });

  it("w dostawcy treść obszarów pozostaje w drzewie", () => {
    const { container } = render(<DostawcaPowloki>{element()}</DostawcaPowloki>);
    expect(container.querySelector<HTMLElement>(`[data-style-id='${styleId}']`)?.textContent).toContain("Treść ekranu");
  });
});

describe("kontrola dodatnia kontekstu powłoki", () => {
  /** Szablon, który ignoruje dostawcę i zawsze renderuje main#tresc. */
  function SzablonIgnorujacyDostawce() {
    return (
      <main id="tresc" tabIndex={-1} data-style-id="szablon-lista">
        treść
      </main>
    );
  }

  it("szablon ignorujący dostawcę daje czerwień sprawdzenia pod powłoką", () => {
    const { container } = render(
      <DostawcaPowloki>
        <SzablonIgnorujacyDostawce />
      </DostawcaPowloki>,
    );
    expect(() => korzenBezMaina(container, "szablon-lista")).toThrow(/oczekiwano 0 main/);
  });

  it("szablon bez dostawcy daje czerwień sprawdzenia pod powłoką (main zostaje)", () => {
    const { container } = render(<ListTemplate naglowek={tresc} lista={tresc} />);
    expect(() => korzenBezMaina(container, "szablon-lista")).toThrow(/oczekiwano 0 main/);
  });
});

describe("useWPowloce", () => {
  function Sonda() {
    return <span data-testid="sonda">{String(useWPowloce())}</span>;
  }

  it("poza dostawcą jest fałszem, wewnątrz prawdą", () => {
    const poza = render(<Sonda />);
    expect(poza.getByTestId("sonda").textContent).toBe("false");
    poza.unmount();

    const wewnatrz = render(
      <DostawcaPowloki>
        <Sonda />
      </DostawcaPowloki>,
    );
    expect(wewnatrz.getByTestId("sonda").textContent).toBe("true");
  });
});
