import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { PROG_DWOCH_KOLUMN, TylkoOdDwochKolumn, UkladEdycji } from "../UkladEdycji";
import { DostawcaPowloki } from "../../KontekstPowloki";
import { jedenMain } from "../../__tests__/jeden-main";

function naglowek() {
  return {
    okruszki: [{ etykieta: "Kursy", href: "/admin/kursy" }, { etykieta: "Wywiad" }],
    tytul: "Wywiad psychologiczny",
    onPowrot: () => {},
  };
}

function obszary(container: HTMLElement) {
  return Array.from(container.querySelectorAll("[data-obszar]")).map((w) => w.getAttribute("data-obszar"));
}

const css = readFileSync(resolve(process.cwd(), "design-system/szablony/UkladEdycji/UkladEdycji.module.css"), "utf-8");

describe("UkladEdycji", () => {
  it("kolejność obszarów w DOM = kolejność na ekranie: nagłówek, pas, komunikaty, główna, boczna", () => {
    const { container } = render(
      <UkladEdycji
        naglowek={naglowek()}
        pasekWaski={<p>Szkic</p>}
        komunikaty={<p>Komunikat</p>}
        glowna={<button type="button">Pierwszy</button>}
        boczna={<button type="button">Drugi</button>}
      />,
    );
    expect(obszary(container)).toEqual(["naglowek", "pasek-waski", "komunikaty", "kolumny", "glowna", "boczna"]);
    const przyciski = screen.getAllByRole("button").map((p) => p.textContent);
    expect(przyciski.indexOf("Pierwszy")).toBeGreaterThan(-1);
    expect(przyciski.indexOf("Pierwszy")).toBeLessThan(przyciski.indexOf("Drugi"));
  });

  it("bez pasa i bez komunikatów zostają nagłówek i kolumny", () => {
    const { container } = render(<UkladEdycji naglowek={naglowek()} glowna={<p>Główna</p>} boczna={<p>Boczna</p>} />);
    expect(obszary(container)).toEqual(["naglowek", "kolumny", "glowna", "boczna"]);
  });

  it("poza powłoką korzeń jest jedynym main z id=tresc i niesie data-style-id=szablon-edycja", () => {
    const { container } = render(<UkladEdycji naglowek={naglowek()} glowna={<p>Główna</p>} boczna={<p>Boczna</p>} />);
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-edycja");
  });

  it("w powłoce panelu nie dokłada drugiego main", () => {
    const { container } = render(
      <DostawcaPowloki>
        <UkladEdycji naglowek={naglowek()} glowna={<p>Główna</p>} boczna={<p>Boczna</p>} />
      </DostawcaPowloki>,
    );
    expect(container.querySelectorAll("main")).toHaveLength(0);
    expect(container.querySelector("[data-style-id='szablon-edycja']")).not.toBeNull();
  });

  it("szablon nie ma własnych elementów interaktywnych w kolumnach", () => {
    const { container } = render(<UkladEdycji naglowek={naglowek()} glowna={<p>Główna</p>} boczna={<p>Boczna</p>} />);
    const wKolumnach = container.querySelector("[data-obszar='kolumny']") as HTMLElement;
    expect(wKolumnach.querySelectorAll("button, a, input, [tabindex]")).toHaveLength(0);
  });

  it("TylkoOdDwochKolumn opakowuje treść jednym elementem ze znacznikiem obszaru", () => {
    const { container } = render(
      <TylkoOdDwochKolumn>
        <button type="button">Opublikuj kurs</button>
      </TylkoOdDwochKolumn>,
    );
    const opakowanie = container.querySelector("[data-obszar='tylko-od-dwoch-kolumn']") as HTMLElement;
    expect(opakowanie).not.toBeNull();
    expect(opakowanie.querySelectorAll("button")).toHaveLength(1);
  });
});

describe("UkladEdycji — arkusz", () => {
  it("próg dwóch kolumn w arkuszu jest tą samą liczbą co stała w kodzie", () => {
    expect(PROG_DWOCH_KOLUMN).toBe(1100);
    expect(css).toContain(`@media (min-width: ${PROG_DWOCH_KOLUMN}px)`);
    expect(css).toContain(`@media (max-width: ${PROG_DWOCH_KOLUMN - 1}px)`);
    const progi = [...css.matchAll(/@media \((?:min|max)-width: (\d+)px\)/g)].map((m) => Number(m[1]));
    expect(progi.sort((a, b) => a - b)).toEqual([PROG_DWOCH_KOLUMN - 1, PROG_DWOCH_KOLUMN]);
  });

  it("wąski pas jest przyklejony do góry (top), nigdy do dołu okna", () => {
    const blok = css.split(".pasekWaski {")[1].split("}")[0];
    expect(blok).toContain("position: sticky");
    expect(blok).toMatch(/\btop: var\(--topbar-h\)/);
    expect(blok).not.toMatch(/\bbottom:/);
  });

  it("od progu dwóch kolumn kolumna boczna jest przyklejona i przewija się w sobie, a pasa nie ma", () => {
    const szeroko = css.split(`@media (min-width: ${PROG_DWOCH_KOLUMN}px) {`)[1];
    const blok = szeroko.split(".boczna {")[1].split("}")[0];
    expect(blok).toContain("position: sticky");
    expect(blok).toContain("overflow-y: auto");
    expect(blok).toContain("max-height: calc(100vh");
    expect(szeroko.split(".pasekWaski {")[1].split("}")[0]).toContain("display: none");
  });

  it("poniżej progu treść „tylko od dwóch kolumn” jest wyłączona z układu", () => {
    const wasko = css.split(`@media (max-width: ${PROG_DWOCH_KOLUMN - 1}px) {`)[1];
    expect(wasko.split(".tylkoOdDwochKolumn {")[1].split("}")[0]).toContain("display: none");
  });

  it("zero barw zapisanych wprost — wyłącznie tokeny", () => {
    const bezKomentarzy = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(bezKomentarzy).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
});
