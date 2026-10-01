import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "../PageHeader";
import { DostawcaRamki } from "../../../szablony/KontekstRamki";

const OKRUSZKI = [{ etykieta: "Administracja" }, { etykieta: "Wniosek" }];

function naglowek(wlasciwosci: { opis?: string }) {
  return render(
    <DostawcaRamki>
      <PageHeader
        okruszki={OKRUSZKI}
        tytul="Wniosek o profil"
        status={{ wariant: "warn", etykieta: "czeka na decyzję" }}
        onPowrot={() => undefined}
        {...wlasciwosci}
      />
    </DostawcaRamki>,
  );
}

describe("PageHeader — plakietka stanu w linii pod tytułem", () => {
  it("z opisem: plakietka stoi w tym samym akapicie co opis, po kropce środkowej, poza wierszem tytułu", () => {
    naglowek({ opis: "Opis ekranu" });

    const h1 = screen.getByRole("heading", { level: 1 });
    const plakietka = screen.getByText("czeka na decyzję");
    const akapit = screen.getByText("Opis ekranu").closest("p") as HTMLElement;

    expect(akapit).toContainElement(plakietka);
    expect(akapit.textContent).toBe("Opis ekranu · czeka na decyzję");
    expect(h1.parentElement).not.toContainElement(plakietka);
    expect(plakietka.className).toMatch(/warn/);
  });

  it("bez opisu: plakietka stoi sama w linii pod tytułem, bez kropki", () => {
    naglowek({});

    const h1 = screen.getByRole("heading", { level: 1 });
    const plakietka = screen.getByText("czeka na decyzję");
    const akapit = plakietka.closest("p") as HTMLElement;

    expect(akapit.textContent).toBe("czeka na decyzję");
    expect(h1.parentElement).not.toContainElement(plakietka);
  });
});
