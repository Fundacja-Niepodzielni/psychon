import { describe, expect, it } from "vitest";
import { sortMenu, type MenuEntry } from "@/lib/menu/types";

/**
 * Pierwszy test runnera frontu — CELOWO liczy WARTOŚCI, nie obecność
 * elementu na ekranie. Test, który sprawdza „czy coś się wyrenderowało”, jest
 * zielony także wtedy, gdy wyrenderowało się złe coś.
 *
 * Rejestr menu decyduje o KOLEJNOŚCI pozycji w panelu, więc mierzalną wartością
 * jest ciąg `order` po posortowaniu i tożsamość wpisów pod tymi wartościami.
 */

const wpis = (label: string, order: number): MenuEntry => ({
  label,
  href: `/panel/${label.toLowerCase()}`,
  order,
});

describe("sortMenu", () => {
  it("układa wpisy rosnąco wg wartości order", () => {
    const wynik = sortMenu([wpis("Certyfikat", 30), wpis("Kursy", 10), wpis("Profil", 20)]);

    // Wartości, nie obecność: sprawdzamy ciąg liczb ORAZ to, co pod nimi stoi.
    expect(wynik.map((e) => e.order)).toEqual([10, 20, 30]);
    expect(wynik.map((e) => e.label)).toEqual(["Kursy", "Profil", "Certyfikat"]);
  });

  it("KONTROLA NEGATYWNA: nie modyfikuje tablicy przekazanej przez wywołującego", () => {
    // Rejestr menu jest współdzielony przez pakiety. Gdyby sortowanie mutowało
    // wejście, kolejność w jednym panelu zmieniałaby kolejność w innym —
    // i żaden test „czy menu się pokazało” by tego nie zobaczył.
    const wejscie = [wpis("Certyfikat", 30), wpis("Kursy", 10)];
    const kopiaPrzed = wejscie.map((e) => e.order);

    sortMenu(wejscie);

    expect(wejscie.map((e) => e.order)).toEqual(kopiaPrzed);
    expect(wejscie.map((e) => e.order)).toEqual([30, 10]);
  });

  it("zachowuje kolejność zgłoszenia przy równych wartościach order", () => {
    // Odstępy co 10 są konwencją, nie gwarancją — kolizja wartości zdarzy się
    // przy dopisaniu pakietu. Wynik ma być wtedy przewidywalny, nie losowy.
    const wynik = sortMenu([wpis("Pierwszy", 10), wpis("Drugi", 10), wpis("Trzeci", 5)]);

    expect(wynik.map((e) => e.label)).toEqual(["Trzeci", "Pierwszy", "Drugi"]);
  });

  it("pusty rejestr daje pustą listę, nie wyjątek", () => {
    expect(sortMenu([])).toEqual([]);
  });
});
