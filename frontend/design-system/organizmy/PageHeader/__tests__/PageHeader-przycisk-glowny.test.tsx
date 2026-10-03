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

  it("przycisk drugorzędny: to samo miejsce i ta sama akcja, ale bez koloru", async () => {
    const naKlik = vi.fn();
    const naglowek = (drugorzedny: boolean) => (
      <DostawcaRamki>
        <PageHeader
          okruszki={OKRUSZKI}
          tytul="Słownik form stażu"
          onPowrot={() => undefined}
          przyciskGlowny={{ etykieta: "Dodaj formę", onKliknij: naKlik, drugorzedny }}
        />
      </DostawcaRamki>
    );
    const { container, rerender } = render(naglowek(false));
    const przycisk = screen.getByRole("button", { name: "Dodaj formę" });
    expect(przycisk.className).toMatch(/primary/);

    rerender(naglowek(true));
    // Ten sam element w tym samym obszarze akcji — nic nie znika i nie przeskakuje.
    expect(screen.getByRole("button", { name: "Dodaj formę" })).toBe(przycisk);
    expect(container.querySelector("[data-testid='pageheader-przycisk-glowny']")).toContainElement(przycisk);
    expect(przycisk.className).toMatch(/outline/);
    expect(przycisk.className).not.toMatch(/primary/);
    expect(przycisk).toBeEnabled();

    await userEvent.setup().click(przycisk);
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

describe("PageHeader — przycisk główny w stanie niedostępnym", () => {
  it("niedostępny: kolorowy, aria-disabled, powód pod nagłówkiem wskazany przez aria-describedby, klik woła akcję", async () => {
    const naKlik = vi.fn();
    const { container } = render(
      <DostawcaRamki>
        <PageHeader
          okruszki={OKRUSZKI}
          tytul="Pulpit administracji"
          onPowrot={() => undefined}
          przyciskGlowny={{ etykieta: "Otwórz sprawy", onKliknij: naKlik, niedostepny: { powod: "Brak spraw do decyzji." } }}
        />
      </DostawcaRamki>,
    );

    const przycisk = screen.getByRole("button", { name: "Otwórz sprawy" });
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    expect(przycisk).not.toBeDisabled();
    expect(przycisk).toHaveAccessibleDescription("Brak spraw do decyzji.");
    const powod = screen.getByText("Brak spraw do decyzji.");
    expect(container.querySelector("header")).toContainElement(powod);
    expect(container.querySelector("[data-testid='pageheader-glowa']")).not.toContainElement(powod);

    await userEvent.setup().click(przycisk);
    expect(naKlik).toHaveBeenCalledTimes(1);
  });

  it("dostępny: bez aria-disabled, aria-describedby i podpowiedzi", () => {
    const { container } = render(
      <DostawcaRamki>
        <PageHeader
          okruszki={OKRUSZKI}
          tytul="Pulpit administracji"
          onPowrot={() => undefined}
          przyciskGlowny={{ etykieta: "Otwórz sprawy", onKliknij: () => undefined }}
        />
      </DostawcaRamki>,
    );
    const przycisk = screen.getByRole("button", { name: "Otwórz sprawy" });
    expect(przycisk).not.toHaveAttribute("aria-disabled");
    expect(przycisk).not.toHaveAttribute("aria-describedby");
    expect(container.querySelector("p")).toBeNull();
  });
});
