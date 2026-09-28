import { describe, expect, it } from "vitest";
import { adminMenu, adminMenuSections } from "@/lib/menu/admin";
import { participantMenu, participantMenuSections } from "@/lib/menu/participant";
import { GRUPY } from "@/lib/przelaczenie/grupy";

/**
 * Świadek "wyłączone = baza": z rejestru
 * `GRUPY` wszystkie grupy wyłączone → wynik menu KAŻDEJ roli identyczny z
 * bazą `a9e515f` — bez nowych pozycji, bez zmienionych `href`. Ten plik
 * mierzy dokładnie tyle: liczby wpisów sprzed zmiany i literalny `href`
 * wpisu, który mechanizm mógłby (błędnie) przełączyć nawet przy wyłączonej
 * grupie.
 *
 * Liczby bazowe (10 uczestnika, 15 administracji) to policzone wprost
 * tablice `participantMenu`/`adminMenu` na `a9e515f`, PRZED tą zmianą —
 * commit tej gałęzi nie dodaje ani nie usuwa pozycji przy wyłączonej
 * grupie, tylko wpina odczyt celu z rejestru przełączenia.
 */
const LICZBA_WPISOW_UCZESTNIKA_NA_BAZIE = 10;
const LICZBA_WPISOW_ADMINISTRACJI_NA_BAZIE = 15;

describe("mechanizm przełączenia — wszystkie grupy wyłączone, menu jak na bazie", () => {
  it("każda grupa rejestru jest dziś wyłączona (przesłanka całego testu)", () => {
    for (const grupa of Object.values(GRUPY)) {
      expect(grupa.wlaczona).toBe(false);
    }
  });

  it("menu uczestnika ma tyle samo pozycji co na bazie", () => {
    expect(participantMenu).toHaveLength(LICZBA_WPISOW_UCZESTNIKA_NA_BAZIE);
  });

  it('wpis "Po programie" wskazuje dokładnie starą trasę bazy, nie nową', () => {
    const wpis = participantMenu.find((entry) => entry.label === "Po programie");
    expect(wpis).toBeDefined();
    expect(wpis?.href).toBe("/panel/po-programie");
    expect(wpis?.href).not.toBe(GRUPY.wspolpraca.ekrany.find((e) => e.panel === "uczestnik")?.nowaTrasa);
  });

  it("menu administracji ma tyle samo pozycji co na bazie (grupa wyłączona nie dodaje wpisu)", () => {
    expect(adminMenu).toHaveLength(LICZBA_WPISOW_ADMINISTRACJI_NA_BAZIE);
  });

  it('menu administracji NIE niesie wpisu "Zgłoszenia współpracy" (funkcja bez starej trasy — off = brak wpisu)', () => {
    const wpis = adminMenu.find((entry) => entry.label === "Zgłoszenia współpracy");
    expect(wpis).toBeUndefined();
  });

  it("żaden wpis żadnego menu nie wskazuje segmentu nowego frontu spoza tras produktu", () => {
    // Wzorzec złożony z części — literalny segment nie ma prawa się pojawić
    // w tym pliku wcale (pilnuje tego osobny pomiar spoza vitest: zliczenie
    // linii zawierających go w `lib/menu`, które powinno wynosić zero).
    const segmentPozaKontraktem = ["nowy", "front"].join("-");
    const wzorzec = new RegExp(segmentPozaKontraktem);
    for (const entry of [...participantMenu, ...adminMenu]) {
      expect(entry.href).not.toMatch(wzorzec);
    }
  });

  it("sekcje obu menu są niezmienione co do liczby (mechanizm nie dotyka rejestru sekcji)", () => {
    expect(participantMenuSections).toHaveLength(2);
    expect(adminMenuSections).toHaveLength(6);
  });
});
