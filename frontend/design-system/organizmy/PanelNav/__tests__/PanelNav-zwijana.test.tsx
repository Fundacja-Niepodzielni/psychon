import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PanelNav } from "../PanelNav";

/**
 * Grupa z flagą `zwijana` rysuje się tym samym komponentem zwijania co „Dotychczasowy
 * panel” w szablonie powłoki: przycisk „{nagłówek} ({liczba})”, lista z `hidden`, linia
 * „W przygotowaniu” wewnątrz części zwijanej. Grupy bez flagi — jak dotąd.
 */

afterEach(cleanup);

const GRUPY = [
  { naglowek: "Rozliczenie", pozycje: [{ ikona: "chart" as const, etykieta: "Raport roku programu", href: "/r" }] },
  {
    naglowek: "Ustawienia",
    zwijana: true,
    pozycje: [
      { ikona: "clock" as const, etykieta: "Słownik form stażu", href: "/f" },
      { ikona: "file" as const, etykieta: "Wzory dokumentów", href: "/w" },
    ],
    liniaWPrzygotowaniu: "ustawienia roku programu",
  },
];

function wyrenderuj(grupy: Parameters<typeof PanelNav>[0]["grupy"] = GRUPY) {
  return render(
    <PanelNav
      uzytkownik={{ imie: "Ola", nazwisko: "Demo", rola: "Opiekun" }}
      grupy={grupy}
      konto={<button type="button">Wyloguj</button>}
    />,
  );
}

describe("PanelNav — grupa zwijana", () => {
  it("zwijana: przycisk „Ustawienia (2)” z aria-expanded=false, lista z hidden, bez nagłówka grupy jako zwykłego tekstu", () => {
    wyrenderuj();
    const przycisk = screen.getByRole("button", { name: "Ustawienia (2)" });
    expect(przycisk.getAttribute("aria-expanded")).toBe("false");
    const lista = document.getElementById(przycisk.getAttribute("aria-controls") ?? "");
    expect(lista?.hidden).toBe(true);
    expect(lista?.textContent).toContain("W przygotowaniu: ustawienia roku programu.");
    expect(screen.queryByRole("link", { name: "Wzory dokumentów" })).toBeNull();
  });

  it("grupa bez flagi (Rozliczenie) rysuje się wprost: nagłówek, lista, pozycje widoczne", () => {
    wyrenderuj();
    expect(screen.getByText("Rozliczenie")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Raport roku programu" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Rozliczenie/ })).toBeNull();
  });

  it("kolejność Tab: pozycje Rozliczenia → przycisk Ustawienia → (zwinięta) Wyloguj; rozwinięta — jej pozycje przed Wyloguj", () => {
    wyrenderuj();
    // Elementy, do których dociera Tab: łącza i przyciski spoza ukrytych list, w kolejności dokumentu.
    const nazwy = () =>
      Array.from(document.querySelectorAll("a, button"))
        .filter((el) => el.closest("[hidden]") === null)
        .map((el) => (el.textContent ?? "").replace(/[+−]$/, "").trim());
    expect(nazwy()).toEqual(["Raport roku programu", "Ustawienia (2)", "Wyloguj"]);
    fireEvent.click(screen.getByRole("button", { name: "Ustawienia (2)" }));
    expect(nazwy()).toEqual(["Raport roku programu", "Ustawienia (2)", "Słownik form stażu", "Wzory dokumentów", "Wyloguj"]);
  });

  it("zwijana z pozycją bieżącą — rozwinięta na wejściu", () => {
    wyrenderuj([GRUPY[0], { ...GRUPY[1], pozycje: [GRUPY[1].pozycje[0], { ...GRUPY[1].pozycje[1], biezaca: true }] }]);
    expect(screen.getByRole("button", { name: "Ustawienia (2)" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: "Wzory dokumentów" }).getAttribute("aria-current")).toBe("page");
  });
});
