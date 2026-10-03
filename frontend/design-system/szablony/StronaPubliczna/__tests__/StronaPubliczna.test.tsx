import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { StronaPubliczna } from "../StronaPubliczna";
import { jedenMain } from "../../__tests__/jeden-main";
import { DostawcaPowloki } from "../../KontekstPowloki";
import { Skeleton } from "../../../atomy/Skeleton/Skeleton";
import { Notice } from "../../../molekuly/Notice/Notice";
import { kontrast, tokenJasny } from "./kontrast";

/**
 * Szablon strony publicznej: znak Fundacji u góry, jedna wyśrodkowana kolumna
 * treści (`main#tresc`), stopka z odnośnikami. Każdy pomiar ma kontrolę
 * dodatnią — zmianę wejścia, która musi zmienić wynik.
 */

const ODNOSNIKI = [
  { etykieta: "Deklaracja dostępności", href: "/deklaracja-dostepnosci" },
  { etykieta: "Regulamin", href: "/dokumenty-prawne/regulamin" },
];

function sonda(nazwa: string) {
  return <div data-testid={`sonda-${nazwa}`}>{nazwa}</div>;
}

describe("StronaPubliczna — obszary", () => {
  it("logo, treść i stopka stoją w tej kolejności; treść jest jedynym main", () => {
    const { container } = render(
      <StronaPubliczna logo={sonda("logo")} odnosnikiStopki={ODNOSNIKI}>
        {sonda("tresc")}
      </StronaPubliczna>,
    );
    const kolejnosc = [...container.querySelectorAll("[data-testid^='sonda-'], footer")].map(
      (wezel) => (wezel as HTMLElement).dataset.testid ?? wezel.tagName.toLowerCase(),
    );
    expect(kolejnosc).toEqual(["sonda-logo", "sonda-tresc", "footer"]);
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-strona-publiczna");
    expect(within(container.querySelector("main") as HTMLElement).getByTestId("sonda-tresc")).toBeTruthy();
  });

  it("logo stoi w nagłówku strony, poza main", () => {
    const { container } = render(<StronaPubliczna logo={sonda("logo")}>{sonda("tresc")}</StronaPubliczna>);
    const logo = screen.getByTestId("sonda-logo");
    expect(logo.closest("header")).not.toBeNull();
    expect(logo.closest("main")).toBeNull();
    expect(container.querySelectorAll("header")).toHaveLength(1);
  });

  it("bez logo nie ma nagłówka strony (kontrola dodatnia poprzedniego pomiaru)", () => {
    const { container } = render(<StronaPubliczna>{sonda("tresc")}</StronaPubliczna>);
    expect(container.querySelector("header")).toBeNull();
  });

  it("stopka niesie nawigację z nazwą i odnośnikami w podanej kolejności", () => {
    render(
      <StronaPubliczna odnosnikiStopki={ODNOSNIKI} etykietaStopki="Informacje o serwisie">
        {sonda("tresc")}
      </StronaPubliczna>,
    );
    const nawigacja = screen.getByRole("navigation", { name: "Informacje o serwisie" });
    const linki = within(nawigacja).getAllByRole("link");
    expect(linki.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Deklaracja dostępności", "/deklaracja-dostepnosci"],
      ["Regulamin", "/dokumenty-prawne/regulamin"],
    ]);
    expect(nawigacja.closest("footer")).not.toBeNull();
  });

  it("bez odnośników nie ma stopki", () => {
    const { container } = render(<StronaPubliczna odnosnikiStopki={[]}>{sonda("tresc")}</StronaPubliczna>);
    expect(container.querySelector("footer")).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("szerokość kolumny: wąska domyślnie, czytelna na życzenie — różne klasy", () => {
    const { container: waska } = render(<StronaPubliczna>{sonda("a")}</StronaPubliczna>);
    const { container: czytelna } = render(<StronaPubliczna szerokosc="czytelna">{sonda("b")}</StronaPubliczna>);
    const klasaWaskiej = waska.querySelector("main")?.className;
    const klasaCzytelnej = czytelna.querySelector("main")?.className;
    expect(klasaWaskiej).toBeTruthy();
    expect(klasaCzytelnej).not.toBe(klasaWaskiej);
    expect(czytelna.querySelector("main > [data-szerokosc]")?.getAttribute("data-szerokosc")).toBe("czytelna");
    expect(waska.querySelector("main > [data-szerokosc]")?.getAttribute("data-szerokosc")).toBe("waska");
  });

  it.each([
    ["ładowanie", <Skeleton key="s" wiersze={3} />],
    ["błąd", <Notice key="n" wariant="error" tytul="Błąd">Nie udało się.</Notice>],
    ["pusty", <p key="p">Brak danych.</p>],
  ])("stan %s: jeden main z id=tresc", (_nazwa, tresc) => {
    const { container } = render(<StronaPubliczna>{tresc}</StronaPubliczna>);
    expect(() => jedenMain(container)).not.toThrow();
  });

  it("w powłoce panelu nie dokłada drugiego main", () => {
    const { container } = render(
      <DostawcaPowloki>
        <StronaPubliczna>{sonda("tresc")}</StronaPubliczna>
      </DostawcaPowloki>,
    );
    expect(container.querySelector("main")).toBeNull();
  });
});

describe("StronaPubliczna — wygląd z tokenów", () => {
  const css = readFileSync(resolve(__dirname, "../StronaPubliczna.module.css"), "utf8");

  it("arkusz nie ma barw wpisanych wprost", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
    // Kontrola dodatnia: wzorzec łapie barwę wpisaną wprost.
    expect("color: #fff;").toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("żadna szerokość stała nie przekracza 320 px — kolumna mieści się na 320 i 390 px", () => {
    const szerokosci = [...css.matchAll(/(?<!max-)(?<!min-)width:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(szerokosci.every((px) => px <= 320)).toBe(true);
    expect(css).toMatch(/box-sizing:\s*border-box/);
    expect(css).toMatch(/max-width:\s*\d+px/);
  });

  it("pola stopki mają co najmniej 44 px wysokości (token --hit-min)", () => {
    expect(css).toMatch(/min-height:\s*var\(--hit-min\)/);
  });

  it.each([
    ["tekst na tle strony", "text", "bg"],
    ["nagłówek na tle strony", "ink", "bg"],
    ["odnośnik stopki na tle karty", "link", "card"],
    ["odnośnik na tle strony", "link", "bg"],
    ["tekst wyciszony na tle karty", "muted", "card"],
  ])("kontrast %s ≥ 4,5:1", (_nazwa, pierwszy, drugi) => {
    expect(kontrast(tokenJasny(pierwszy), tokenJasny(drugi))).toBeGreaterThanOrEqual(4.5);
  });

  it("pomiar kontrastu odróżnia parę zbyt słabą (kontrola dodatnia)", () => {
    expect(kontrast(tokenJasny("border"), tokenJasny("card"))).toBeLessThan(4.5);
    expect(kontrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });
});
