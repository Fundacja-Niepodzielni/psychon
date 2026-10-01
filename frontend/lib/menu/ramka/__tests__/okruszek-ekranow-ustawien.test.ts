import { describe, expect, it } from "vitest";
import { okruszekRamki } from "@/design-system/szablony/OkruszekRamki";
import { menuRamkiAdministracji } from "../administracja";
import { ukladMenuRamki } from "../uklad";

/**
 * Okruszek czterech ekranów „Ustawienia edycji”, „Słownik form stażu”, „Wzory dokumentów” i
 * „Treść ekranu „Zacznij tutaj”” oraz ich podstron — liczony z menu tak, jak
 * robi to `DostawcaRamki` (grupy układu i grupa „Dotychczasowy panel”).
 * Nazwa grupy, w której ekran stoi w menu, nie wchodzi do okruszka.
 */

const EKRANY = [
  ["/admin/ustawienia", "Ustawienia edycji"],
  ["/admin/formy-stazu", "Słownik form stażu"],
  ["/admin/wzory-dokumentow", "Wzory dokumentów"],
  ["/admin/ekran-startowy", "Treść ekranu „Zacznij tutaj”"],
] as const;

/** Menu administracji dla ścieżki — dokładnie to, co dostaje `DostawcaRamki`. */
function menuDlaSciezki(sciezka: string) {
  const { grupy, grupaZwinieta } = ukladMenuRamki(menuRamkiAdministracji(), sciezka);
  return [...grupy, ...(grupaZwinieta ? [grupaZwinieta] : [])];
}

describe("okruszek ekranów grupy ustawień", () => {
  it.each(EKRANY)("%s: korzeń „Administracja” i nazwa pozycji menu, bez nazwy grupy", (adres, nazwa) => {
    const okruszek = okruszekRamki({ menu: menuDlaSciezki(adres), sciezka: adres, okruszki: [], tytul: "Tytuł" });
    console.log(`OKRUSZEK ${adres} => ${okruszek.map((p) => p.etykieta).join(" › ")}`);
    expect(okruszek.map((p) => p.etykieta)).toEqual(["Administracja", nazwa]);
    expect(okruszek[0].href).toBe("/admin");
  });

  it.each(EKRANY)("%s/17 (podstrona): łańcuch od pozycji menu, bez nazwy grupy", (adres, nazwa) => {
    const sciezka = `${adres}/17`;
    const okruszek = okruszekRamki({
      menu: menuDlaSciezki(sciezka),
      sciezka,
      okruszki: [{ etykieta: "Bieżąca z ekranu" }],
      tytul: "Tytuł",
    });
    console.log(`OKRUSZEK ${sciezka} => ${okruszek.map((p) => p.etykieta).join(" › ")}`);
    expect(okruszek.map((p) => p.etykieta)).toEqual(["Administracja", nazwa, "Bieżąca z ekranu"]);
    expect(okruszek.map((p) => p.href).slice(0, 2)).toEqual(["/admin", adres]);
  });
});
