import { describe, expect, it } from "vitest";
import {
  groupMenu,
  SECTION_THRESHOLD,
  sortMenu,
  type MenuEntry,
  type MenuSection,
} from "@/lib/menu/types";

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

describe("groupMenu — sekcje menu", () => {
  const sekcje: MenuSection[] = [
    { id: "b", label: "Druga", order: 20 },
    { id: "a", label: "Pierwsza", order: 10 },
  ];
  const zSekcja = (label: string, order: number, section?: string): MenuEntry => ({
    ...wpis(label, order),
    section,
  });
  const osiem = [
    zSekcja("Pulpit", 10),
    zSekcja("B1", 60, "b"),
    zSekcja("A2", 30, "a"),
    zSekcja("A1", 20, "a"),
    zSekcja("B2", 70, "b"),
    zSekcja("A3", 40, "a"),
    zSekcja("B3", 80, "b"),
    zSekcja("A4", 50, "a"),
  ];

  it("powyżej 7 wpisów: grupa bez nagłówka na górze, potem sekcje wg order sekcji", () => {
    const wynik = groupMenu(osiem, sekcje);

    expect(wynik.map((g) => g.label)).toEqual([undefined, "Pierwsza", "Druga"]);
    expect(wynik.map((g) => g.entries.map((e) => e.label))).toEqual([
      ["Pulpit"],
      ["A1", "A2", "A3", "A4"],
      ["B1", "B2", "B3"],
    ]);
  });

  it("7 wpisów i mniej: jedna lista bez nagłówków, posortowana", () => {
    const wynik = groupMenu(osiem.slice(0, SECTION_THRESHOLD), sekcje);

    expect(SECTION_THRESHOLD).toBe(7);
    expect(wynik).toHaveLength(1);
    expect(wynik[0].label).toBeUndefined();
    expect(wynik[0].entries.map((e) => e.order)).toEqual([10, 20, 30, 40, 60, 70, 80]);
  });

  it("sekcja bez widocznych wpisów nie tworzy grupy ani nagłówka", () => {
    const bezB = [...osiem.filter((e) => e.section !== "b"), zSekcja("X", 90), zSekcja("Y", 95), zSekcja("Z", 96)];
    const wynik = groupMenu(bezB, sekcje);

    expect(wynik.map((g) => g.label)).toEqual([undefined, "Pierwsza"]);
  });

  it("KONTROLA NEGATYWNA: wpis z nieznaną sekcją nie znika — trafia na górę", () => {
    const wynik = groupMenu([...osiem, zSekcja("Zgubiony", 5, "nie-ma")], sekcje);
    const wszystkie = wynik.flatMap((g) => g.entries.map((e) => e.label));

    expect(wszystkie).toHaveLength(9);
    expect(wynik[0].entries.map((e) => e.label)).toEqual(["Zgubiony", "Pulpit"]);
  });

  it("pusty rejestr daje zero grup", () => {
    expect(groupMenu([], sekcje)).toEqual([]);
  });
});
