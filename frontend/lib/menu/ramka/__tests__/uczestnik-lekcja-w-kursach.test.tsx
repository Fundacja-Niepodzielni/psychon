import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PanelNav } from "@/design-system/organizmy/PanelNav/PanelNav";
import { menuRamkiUczestnika } from "@/lib/menu/ramka/uczestnik";
import { ukladMenuRamki } from "@/lib/menu/ramka/uklad";
import { GRUPY, type DefinicjaGrupy } from "@/lib/przelaczenie/grupy";

/**
 * Menu uczestnika: ekran lekcji (zwykły, „lekcja zamknięta”, „dostęp wygasł” — wszystkie pod adresem
 * lekcji) należy do pozycji „Kursy”, tak jak strona kursu. Pozycję bieżącą wskazuje atrybut
 * `aria-current`; żadna inna pozycja go nie ma. Menu rysuje ten sam organizm co powłoka panelu.
 */

afterEach(cleanup);

const WLACZONE: Record<string, DefinicjaGrupy> = Object.fromEntries(
  Object.entries(GRUPY).map(([klucz, grupa]) => [klucz, { ...grupa, wlaczona: true }]),
);

function narysujMenu(sciezka: string) {
  const { grupy, grupaZwinieta } = ukladMenuRamki(menuRamkiUczestnika("volunteer", WLACZONE), sciezka);
  render(
    <PanelNav
      uzytkownik={{ imie: "Ola", nazwisko: "Demo", rola: "Wolontariusz" }}
      grupy={[...grupy, ...(grupaZwinieta ? [{ ...grupaZwinieta, zwijana: false }] : [])]}
    />,
  );
}

function biezace(): string[] {
  return screen
    .getAllByRole("link")
    .filter((el) => el.hasAttribute("aria-current"))
    .map((el) => el.textContent ?? "");
}

describe("menu uczestnika: adres lekcji należy do pozycji „Kursy”", () => {
  it.each([
    ["zwykły ekran lekcji", "/panel/lekcje/21"],
    ["lekcja zamknięta kolejnością (ten sam adres lekcji)", "/panel/lekcje/22"],
    ["dostęp wygasł (ten sam adres lekcji)", "/panel/lekcje/23/"],
  ])("%s: tylko „Kursy” ma aria-current", (_nazwa, sciezka) => {
    narysujMenu(sciezka);

    expect(biezace()).toEqual(["Kursy"]);
  });

  it("strona kursu: bez zmian, „Kursy” ma aria-current=\"page\"", () => {
    narysujMenu("/panel/kursy/wywiad-psychologiczny");

    expect(biezace()).toEqual(["Kursy"]);
    expect(screen.getByRole("link", { name: "Kursy" })).toHaveAttribute("aria-current", "page");
  });

  it("pulpit: bez zmian, tylko „Pulpit” ma aria-current", () => {
    narysujMenu("/panel/pulpit");

    expect(biezace()).toEqual(["Pulpit"]);
  });

  it("adres tylko podobny do lekcji nie zapala „Kursów”", () => {
    narysujMenu("/panel/lekcjeinne");

    expect(biezace()).toEqual([]);
  });
});
