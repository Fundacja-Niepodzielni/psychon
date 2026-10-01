import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { naruszeniaSeparatora } from "@/design-system/molekuly/ListRow/__tests__/separator-linii";
import { SprawyProwadzacych } from "../SprawyProwadzacych";

/**
 * Struktura linii metadanych sprawy prowadzącego („data · zgłaszający · osoba”):
 * każdy separator „·” jest pierwszym dzieckiem elementu, który po nim stoi,
 * więc przy zawinięciu linii (390 px) zawija się razem z nim i nigdy nie
 * zostaje na jej końcu. Test sprawdza strukturę DOM, bo układ linii w jsdom
 * nie istnieje; kontrola dodatnia miernika jest w testach molekuły wiersza.
 */

const SPRAWY = [
  {
    id: 7,
    temat: "Nieobecność na dyżurze",
    data: "1 września 2026",
    zglaszajacy: "Zgłosił/a: Joanna Prowadząca",
    osoba: "Marta Demo",
    tresc: "Treść.",
  },
  {
    id: 8,
    temat: "Sprawa ogólna",
    data: "2 września 2026",
    zglaszajacy: "Zgłaszający/a nieznany/a",
    osoba: "Sprawa ogólna — bez wskazania osoby",
    tresc: "Treść ogólna.",
  },
];

describe("sprawy prowadzących — separator „·” w linii metadanych", () => {
  it("separator należy do następnego elementu; żaden nie stoi osobno ani na końcu linii", () => {
    const { container } = render(<SprawyProwadzacych stan="ok" sprawy={SPRAWY} blad={null} onPonow={vi.fn()} />);

    const linie = container.querySelectorAll("li p:nth-of-type(1)");
    expect(linie).toHaveLength(2);
    for (const linia of Array.from(linie)) {
      expect(naruszeniaSeparatora(linia)).toEqual([]);
      // Dwa separatory (data · zgłaszający · osoba), a pierwszy element linii (data) nie ma separatora.
      expect(linia.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
      expect(linia.firstElementChild?.querySelector('[aria-hidden="true"]')).toBeNull();
      expect(linia.lastElementChild?.lastElementChild?.textContent).not.toBe("·");
    }
  });

  it("czytnik ekranu nie czyta separatorów, a treść linii zostaje kompletna", () => {
    const { container } = render(<SprawyProwadzacych stan="ok" sprawy={SPRAWY} blad={null} onPonow={vi.fn()} />);

    const linia = container.querySelector("li p") as HTMLElement;
    for (const separator of Array.from(linia.querySelectorAll('[aria-hidden="true"]'))) {
      expect(separator.textContent).toBe("·");
    }
    expect(linia.textContent).toBe("1 września 2026·Zgłosił/a: Joanna Prowadząca·Marta Demo");
  });
});
