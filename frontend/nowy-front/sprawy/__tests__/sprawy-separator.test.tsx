import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { naruszeniaSeparatora } from "@/design-system/molekuly/ListRow/__tests__/separator-linii";
import { SprawyProwadzacych } from "../SprawyProwadzacych";

/**
 * Struktura linii metadanych sprawy prowadzącego („data · zgłaszający · osoba”):
 * każdy separator „·” jest pierwszym dzieckiem elementu, który po nim stoi,
 * więc przy zawinięciu linii (390 px) zawija się razem z nim i nigdy nie
 * zostaje na jej końcu. Test sprawdza strukturę DOM, bo układ linii w jsdom
 * nie istnieje; kontrola dodatnia miernika jest w testach molekuły wiersza.
 * Linia metadanych stoi w rozwiniętej sprawie, więc test najpierw otwiera
 * każdą sprawę jej przyciskiem „Otwórz”.
 */

const SPRAWY = [
  {
    id: 7,
    temat: "Nieobecność na dyżurze",
    data: "1 września 2026",
    czekaOd: "2026-09-01T08:00:00Z",
    zglaszajacy: "Zgłosił/a: Joanna Prowadząca",
    osoba: "Marta Demo",
    tresc: "Treść.",
  },
  {
    id: 8,
    temat: "Sprawa ogólna",
    data: "2 września 2026",
    czekaOd: "2026-09-02T08:00:00Z",
    zglaszajacy: "Zgłaszający/a nieznany/a",
    osoba: "Sprawa ogólna — bez wskazania osoby",
    tresc: "Treść ogólna.",
  },
];

const TERAZ = Date.parse("2026-09-03T08:00:00Z");

function wyrenderujOtwarte() {
  const wynik = render(<SprawyProwadzacych stan="ok" sprawy={SPRAWY} teraz={TERAZ} blad={null} onPonow={vi.fn()} />);
  for (const przycisk of screen.getAllByRole("button", { name: /^Otwórz sprawę od prowadzącego/ })) {
    fireEvent.click(przycisk);
  }
  return wynik;
}

describe("sprawy prowadzących — separator „·” w linii metadanych", () => {
  it("separator należy do następnego elementu; żaden nie stoi osobno ani na końcu linii", () => {
    const { container } = wyrenderujOtwarte();

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
    const { container } = wyrenderujOtwarte();

    const linia = container.querySelector("li p") as HTMLElement;
    for (const separator of Array.from(linia.querySelectorAll('[aria-hidden="true"]'))) {
      expect(separator.textContent).toBe("·");
    }
    expect(linia.textContent).toBe("1 września 2026·Zgłosił/a: Joanna Prowadząca·Marta Demo");
  });
});
