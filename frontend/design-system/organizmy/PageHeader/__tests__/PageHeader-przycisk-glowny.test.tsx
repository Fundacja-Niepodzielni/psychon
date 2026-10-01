import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PageHeader } from "../PageHeader";
import { DostawcaRamki } from "../../../szablony/KontekstRamki";

const OKRUSZKI = [{ etykieta: "Administracja" }, { etykieta: "Słownik" }];

describe("PageHeader — przycisk główny nagłówka", () => {
  it("jest jedynym przyciskiem w kolorze, stoi w wierszu tytułu i woła przekazaną akcję", async () => {
    const naKlik = vi.fn();
    const { container } = render(
      <DostawcaRamki>
        <PageHeader
          okruszki={OKRUSZKI}
          tytul="Słownik form stażu"
          opis="Opis ekranu."
          onPowrot={() => undefined}
          przyciskGlowny={{ etykieta: "Dodaj formę", onKliknij: naKlik }}
        />
      </DostawcaRamki>,
    );

    const glowa = container.querySelector("[data-testid='pageheader-glowa']")!;
    const akcje = container.querySelector("[data-testid='pageheader-przycisk-glowny']")!;
    expect(glowa).toContainElement(screen.getByRole("heading", { level: 1 }));
    expect(glowa).toContainElement(akcje as HTMLElement);
    const kolorowe = Array.from(container.querySelectorAll("button")).filter((b) =>
      b.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)),
    );
    expect(kolorowe).toHaveLength(1);
    expect(akcje).toContainElement(kolorowe[0]);

    await userEvent.setup().click(screen.getByRole("button", { name: "Dodaj formę" }));
    expect(naKlik).toHaveBeenCalledTimes(1);
  });

  it("bez przycisku głównego nagłówek nie dokłada obszaru akcji", () => {
    const { container } = render(
      <DostawcaRamki>
        <PageHeader okruszki={OKRUSZKI} tytul="Słownik form stażu" onPowrot={() => undefined} />
      </DostawcaRamki>,
    );
    expect(container.querySelector("[data-testid='pageheader-glowa']")).toBeNull();
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("w starej powłoce „Wstecz” zostaje obok przycisku głównego", () => {
    render(
      <PageHeader
        okruszki={OKRUSZKI}
        tytul="Słownik form stażu"
        onPowrot={() => undefined}
        przyciskGlowny={{ etykieta: "Dodaj formę", onKliknij: () => undefined }}
      />,
    );
    expect(screen.getByTestId("pageheader-powrot")).toHaveTextContent("Wstecz");
    expect(screen.getByRole("button", { name: "Dodaj formę" })).toBeInTheDocument();
  });
});
