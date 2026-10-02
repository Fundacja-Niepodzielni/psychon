import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Zdania na karcie osoby mówią językiem osoby, nie zaplecza: w tekstach
 * interfejsu trzech plików karty nie ma słowa „serwer” (w żadnej odmianie).
 * Komentarze w kodzie się nie liczą — sprawdzany jest kod po ich usunięciu.
 */

const PLIKI = ["KartaOsoby.tsx", "PrzypisanieSuperwizora.tsx", "ResetLimituPodejsc.tsx"];

/** Usuwa komentarze `//` i `/* *\/`, zostawiając napisy w cudzysłowach i tekst JSX. */
function bezKomentarzy(tekst: string): string {
  let wynik = "";
  let napis: string | null = null;
  for (let i = 0; i < tekst.length; i += 1) {
    const znak = tekst[i];
    if (napis === null) {
      if (tekst.startsWith("//", i)) {
        const koniec = tekst.indexOf("\n", i);
        i = (koniec === -1 ? tekst.length : koniec) - 1;
        continue;
      }
      if (tekst.startsWith("/*", i)) {
        const koniec = tekst.indexOf("*/", i + 2);
        i = koniec === -1 ? tekst.length : koniec + 1;
        continue;
      }
      if (znak === '"' || znak === "'" || znak === "`") napis = znak;
      wynik += znak;
      continue;
    }
    wynik += znak;
    if (znak === "\\") {
      wynik += tekst[i + 1] ?? "";
      i += 1;
    } else if (znak === napis || (znak === "\n" && napis !== "`")) {
      napis = null;
    }
  }
  return wynik;
}

/** Słowo „serwer” jako osobny wyraz (nie część identyfikatora w rodzaju `zSerwera`). */
const SLOWO_SERWER = /(?<![\p{L}\p{N}_])serwer\p{L}*/giu;

describe("karta osoby: teksty bez słowa „serwer”", () => {
  it.each(PLIKI)("%s", (plik) => {
    const kod = bezKomentarzy(readFileSync(resolve(__dirname, "..", plik), "utf8"));
    expect(kod.match(SLOWO_SERWER) ?? []).toEqual([]);
  });

  it("kontrola dodatnia: wzorzec łapie słowo w tekście, a pomija komentarze i identyfikatory", () => {
    expect(bezKomentarzy('<Text>Odpowiedź serwera nie dotarła.</Text>').match(SLOWO_SERWER)).toEqual(["serwera"]);
    expect(bezKomentarzy('const a = "Serwer nie odpowiedział.";').match(SLOWO_SERWER)).toEqual(["Serwer"]);
    expect(bezKomentarzy("// błąd serwera\n/* serwer */ const zSerwera = 1;").match(SLOWO_SERWER)).toBeNull();
  });
});
