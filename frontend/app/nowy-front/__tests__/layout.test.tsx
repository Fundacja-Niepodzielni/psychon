import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import UkladNowegoFrontu from "../layout";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";

/** Elementy w naturalnej kolejności fokusu klawiatury — DOM-owa, bez
 * `tabindex` dodatnich w tym układzie, więc kolejność w drzewie wystarcza. */
function fokusowalne(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]"),
  );
}

describe("UkladNowegoFrontu (app/nowy-front/layout.tsx) — link skoku i cel main", () => {
  it('pierwszym elementem fokusu jest link "Przejdź do treści" (href="#tresc")', () => {
    const { container } = render(
      <UkladNowegoFrontu>
        <ListTemplate naglowek={<div>Nagłówek</div>} lista={<div>Lista</div>} />
      </UkladNowegoFrontu>,
    );

    const elementy = fokusowalne(container);
    expect(elementy.length).toBeGreaterThan(0);
    expect(elementy[0].tagName).toBe("A");
    expect(elementy[0].getAttribute("href")).toBe("#tresc");
    expect(elementy[0].textContent).toBe("Przejdź do treści");
  });

  it('cel "#tresc" to main szablonu; main.focus() ustawia fokus programowy dzięki tabIndex=-1', () => {
    render(
      <UkladNowegoFrontu>
        <ListTemplate naglowek={<div>Nagłówek</div>} lista={<div>Lista</div>} />
      </UkladNowegoFrontu>,
    );

    const cel = document.getElementById("tresc");
    expect(cel).toBeTruthy();
    expect(cel?.tagName).toBe("MAIN");

    cel?.focus();
    expect(document.activeElement).toBe(cel);
  });

  it("układ sam nie renderuje żadnego main — punkt orientacyjny pochodzi wyłącznie z dziecka", () => {
    const { container } = render(
      <UkladNowegoFrontu>
        <div>Placeholder bez własnego main.</div>
      </UkladNowegoFrontu>,
    );
    expect(container.querySelectorAll("main")).toHaveLength(0);
  });
});
