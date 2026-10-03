import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { straznikHostow } from "../../wspolne/strona-publiczna/__tests__/hosty";
import { DeklaracjaDostepnosci } from "../DeklaracjaDostepnosci";

let straznik: ReturnType<typeof straznikHostow>;
beforeEach(() => {
  straznik = straznikHostow();
});
afterEach(() => {
  expect(straznik.adresy).toEqual([]);
  straznik.przywroc();
  cleanup();
});

describe("deklaracja dostępności", () => {
  it("jeden h1, trzy sekcje h2 i logo", () => {
    const { container } = render(<DeklaracjaDostepnosci logo={<span role="img" aria-label="Fundacja Niepodzielni" />} />);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Deklaracja dostępności" })).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Stan zgodności",
      "Data sporządzenia deklaracji",
      "Zgłaszanie problemów z dostępnością",
    ]);
    expect(screen.getByRole("img", { name: "Fundacja Niepodzielni" })).toBeTruthy();
  });

  it("nazywa standard WCAG 2.1 AA i stan częściowej zgodności", () => {
    render(<DeklaracjaDostepnosci />);
    expect(screen.getByText(/zgodnie ze standardem WCAG 2.1 na poziomie AA/)).toBeTruthy();
    expect(screen.getByText("częściowo zgodna")).toBeTruthy();
    expect(screen.getAllByRole("listitem").filter((li) => li.closest("main"))).toHaveLength(4);
  });

  it("w treści dokładnie jeden odnośnik — kontakt mailowy", () => {
    render(<DeklaracjaDostepnosci />);
    const linki = within(screen.getByRole("main")).getAllByRole("link");
    expect(linki).toHaveLength(1);
    expect(linki[0].getAttribute("href")).toBe("mailto:kontakt@niepodzielni.com");
  });

  it("nie podaje daty przeglądu — pole oznaczone do uzupełnienia", () => {
    render(<DeklaracjaDostepnosci />);
    expect(screen.getByText("[do uzupełnienia przez Fundację]")).toBeTruthy();
    expect(screen.getByText("Deklarację sporządzono: 2026-09-16.")).toBeTruthy();
  });

  it("stopka nie linkuje do samej deklaracji", () => {
    render(<DeklaracjaDostepnosci />);
    const stopka = within(screen.getByRole("navigation")).getAllByRole("link");
    expect(stopka.map((l) => l.getAttribute("href"))).not.toContain("/deklaracja-dostepnosci");
    expect(stopka).toHaveLength(3);
  });
});
