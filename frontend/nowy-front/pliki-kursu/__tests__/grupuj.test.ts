import { describe, expect, it } from "vitest";
import { grupujPliki } from "../grupuj";
import type { LekcjaKursuPlikow, PlikKursu } from "../dane";

function lekcja(id: number, sequence_order: number, title = `Lekcja ${id}`): LekcjaKursuPlikow {
  return { id, title, sequence_order };
}

function plik(id: number, lesson_id: number | null, name = `plik-${id}.pdf`): PlikKursu {
  return { id, name, size: 1000, lesson_id, download_url: `https://api.test/pobierz/${id}` };
}

describe("grupujPliki — układ listy plików kursu", () => {
  it("grupuje pliki według lekcji w kolejności sequence_order, nie w kolejności odpowiedzi", () => {
    // Identyfikatory celowo idą w drugą stronę niż sequence_order: kolejność po id dałaby inny wynik.
    const lekcje = [lekcja(30, 1), lekcja(10, 3), lekcja(20, 2)];
    const pliki = [plik(1, 30), plik(2, 10), plik(3, 20)];

    const grupy = grupujPliki(lekcje, pliki);

    expect(grupy.map((grupa) => grupa.lekcja?.id)).toEqual([30, 20, 10]);
    expect(grupy.map((grupa) => grupa.pliki.map((p) => p.id))).toEqual([[1], [3], [2]]);
  });

  it("pliki w grupie zostają w kolejności z odpowiedzi", () => {
    const grupy = grupujPliki([lekcja(10, 1)], [plik(7, 10), plik(3, 10), plik(5, 10)]);

    expect(grupy).toHaveLength(1);
    expect(grupy[0].pliki.map((p) => p.id)).toEqual([7, 3, 5]);
  });

  it("pliki bez lekcji (lesson_id: null) nie tworzą żadnej grupy: pliki są tylko w lekcjach", () => {
    const grupy = grupujPliki([lekcja(10, 1), lekcja(20, 2)], [plik(1, null), plik(2, 20), plik(3, 10), plik(4, null)]);

    expect(grupy.map((grupa) => grupa.klucz)).toEqual(["lekcja-10", "lekcja-20"]);
    expect(grupy.every((grupa) => grupa.lekcja !== null)).toBe(true);
    expect(grupy.flatMap((grupa) => grupa.pliki.map((p) => p.id))).toEqual([3, 2]);
  });

  it("same pliki bez lekcji dają zero grup", () => {
    expect(grupujPliki([lekcja(10, 1)], [plik(1, null), plik(2, null)])).toEqual([]);
  });

  it("numer lekcji to jej miejsce w kursie, także gdy lekcje bez plików stoją przed nią", () => {
    const lekcje = [lekcja(10, 1), lekcja(20, 2), lekcja(30, 3)];

    const grupy = grupujPliki(lekcje, [plik(1, 30)]);

    expect(grupy).toHaveLength(1);
    expect(grupy[0].lekcja).toEqual({ id: 30, numer: 3, tytul: "Lekcja 30" });
  });

  it("równe sequence_order rozstrzyga id lekcji", () => {
    const grupy = grupujPliki([lekcja(20, 1), lekcja(10, 1)], [plik(1, 20), plik(2, 10)]);

    expect(grupy.map((grupa) => grupa.lekcja?.id)).toEqual([10, 20]);
  });

  it("plik wskazujący lekcję spoza kursu nie jest plikiem żadnej lekcji kursu: nie tworzy grupy", () => {
    expect(grupujPliki([lekcja(10, 1)], [plik(1, 999)])).toEqual([]);
    const grupy = grupujPliki([lekcja(10, 1)], [plik(1, 999), plik(2, 10)]);
    expect(grupy.map((grupa) => grupa.klucz)).toEqual(["lekcja-10"]);
  });

  it("zero plików daje zero grup, także przy lekcjach", () => {
    expect(grupujPliki([lekcja(10, 1)], [])).toEqual([]);
    expect(grupujPliki([], [])).toEqual([]);
  });
});
