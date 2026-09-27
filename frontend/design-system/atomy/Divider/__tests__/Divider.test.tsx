import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { Divider } from "../Divider";

describe("Divider", () => {
  it("renderuje separator jako linię, nie ramkę pojemnika", () => {
    render(<Divider />);
    const linia = screen.getByRole("separator");
    expect(linia.tagName).toBe("HR");
  });

  // Poprzednia wersja tego testu twierdziła `Divider.length === 0`
  // pod tytułem "jedna implementacja — nie przyjmuje wariantów". Arność
  // funkcji (`Function.length`) jest zerem z definicji języka dla KAŻDEJ
  // funkcji bez parametrów formalnych — żadna zmiana kodu (dodanie drugiej
  // implementacji, dopisanie wariantu przez inny mechanizm) nie mogła tego
  // zaczerwienić. Kryterium odbioru mówi o czymś
  // mierzalnym: DOKŁADNIE JEDEN plik w katalogu atomu deklaruje komponent —
  // liczone tu wprost z systemu plików, więc druga implementacja w tym
  // katalogu naprawdę zaczerwienia próbę (zmierzone niżej w komunikacie
  // commita: zepsuto, pokazano czerwień, cofnięto).
  it("dokładnie jeden plik w katalogu atomu deklaruje komponent Divider", () => {
    const katalogAtomu = resolve(process.cwd(), "design-system/atomy/Divider");
    const plikiTsx = readdirSync(katalogAtomu).filter((nazwa) => nazwa.endsWith(".tsx"));
    const deklarujaceKomponent = plikiTsx.filter((nazwa) =>
      readFileSync(join(katalogAtomu, nazwa), "utf-8").includes("export function Divider"),
    );
    expect(deklarujaceKomponent).toHaveLength(1);
  });
});
