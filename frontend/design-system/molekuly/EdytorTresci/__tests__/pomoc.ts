import { getSchema } from "@tiptap/core";
import { Node as WezelPM } from "@tiptap/pm/model";
import { TRESC_PRZYKLADOWA, TRESC_SPOZA_PODZBIORU } from "../../../poligon/edytor-przyklady";
import type { Blok, Wtracenie } from "../../TrescLekcji/parsujTresc";
import { rozszerzeniaEdytora } from "../rozszerzenia";
import { dokumentZTresci, przypnijWezly, type PamiecZrodla } from "../zapis";

export const schemat = getSchema(rozszerzeniaEdytora());

/** Dokument edytora dla tekstu — tak samo, jak buduje go silnik przy otwarciu. */
export function otworz(tresc: string): { dokument: WezelPM; pamiec: PamiecZrodla } {
  const { json, pamiec } = dokumentZTresci(tresc);
  const dokument = WezelPM.fromJSON(schemat, json);
  dokument.check();
  przypnijWezly(pamiec, dokument);
  return { dokument, pamiec };
}

function tekstWtracen(wtracenia: Wtracenie[]): string {
  return wtracenia
    .map((w) => {
      switch (w.rodzaj) {
        case "tekst":
        case "kod":
          return w.tekst;
        case "lamanie":
          return "\n";
        default:
          return tekstWtracen(w.dzieci);
      }
    })
    .join("");
}

/** Sam tekst drzewa treści (bez wyróżnień), z białymi znakami sprowadzonymi do odstępu. */
export function samTekst(bloki: Blok[]): string {
  return bloki
    .map((blok) => (blok.rodzaj === "lista" ? blok.elementy.map(tekstWtracen).join(" ") : tekstWtracen(blok.dzieci)))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface PozycjaKorpusu {
  nazwa: string;
  tekst: string;
}

/**
 * Korpus podzbioru: każda konstrukcja osobno, zagnieżdżenia, polskie znaki,
 * puste wiersze, obie postaci twardego łamania i oba końce wiersza.
 */
export const KORPUS: PozycjaKorpusu[] = [
  { nazwa: "akapit z polskimi znakami", tekst: "Zwykły akapit: zażółć gęślą jaźń, ZAŻÓŁĆ GĘŚLĄ JAŹŃ." },
  { nazwa: "nagłówek", tekst: "## Nagłówek lekcji" },
  { nazwa: "mniejszy nagłówek", tekst: "### Mniejszy nagłówek" },
  { nazwa: "pogrubienie", tekst: "To jest **ważne** zdanie." },
  { nazwa: "kursywa", tekst: "To jest *istotne* zdanie." },
  { nazwa: "kod w linii", tekst: "Wpisz `npm test` w oknie." },
  { nazwa: "lista punktowana", tekst: "- pierwszy punkt\n- drugi punkt\n- trzeci punkt" },
  { nazwa: "lista numerowana", tekst: "1. pierwszy krok\n2. drugi krok" },
  { nazwa: "lista numerowana od trzech", tekst: "3. trzeci krok\n4. czwarty krok" },
  { nazwa: "link https", tekst: "Zobacz [stronę](https://example.org/sciezka?a=1&b=2)." },
  { nazwa: "link http", tekst: "Zobacz [stronę](http://example.org/)." },
  { nazwa: "link mailto", tekst: "Napisz na [adres](mailto:kontakt@example.org)." },
  { nazwa: "link ścieżka", tekst: "Przejdź do [kursów](/panel/kursy)." },
  { nazwa: "twarde łamanie: dwie spacje", tekst: "pierwszy wiersz  \ndrugi wiersz" },
  { nazwa: "twarde łamanie: lewy ukośnik", tekst: "pierwszy wiersz\\\ndrugi wiersz" },
  { nazwa: "zwykły koniec wiersza w akapicie", tekst: "pierwszy wiersz\ndrugi wiersz\ntrzeci wiersz" },
  { nazwa: "pogrubienie z kursywą w środku", tekst: "**pogrubienie z *kursywą* w środku**" },
  { nazwa: "pogrubienie z kodem", tekst: "**przed `kod` po**" },
  { nazwa: "kursywa z kodem", tekst: "*kursywa z `kodem` w środku*" },
  { nazwa: "link z pogrubieniem i kursywą", tekst: "[link z **pogrubieniem** i *kursywą*](https://example.org/a)" },
  { nazwa: "pogrubienie z linkiem", tekst: "**pogrubienie z [linkiem](/x) w środku**" },
  { nazwa: "lista z wyróżnieniami", tekst: "- pozycja z **pogrubieniem** i [linkiem](/a)\n- druga z `kodem` i *kursywą*" },
  { nazwa: "nagłówek z wyróżnieniami", tekst: "## Nagłówek z *kursywą* i `kodem`" },
  { nazwa: "wiele pustych wierszy", tekst: "pierwszy akapit\n\n\n\ndrugi akapit" },
  { nazwa: "puste wiersze na brzegach", tekst: "\n\n  \npierwszy akapit\n\ndrugi akapit\n\n\n" },
  { nazwa: "końcowe białe znaki", tekst: "akapit z odstępami na końcu   \n\ndrugi akapit \t" },
  { nazwa: "znaki dosłowne", tekst: "gwiazdka \\* i nawias \\[ oraz lewy ukośnik \\\\ i grawis \\`" },
  { nazwa: "nie nagłówek", tekst: "\\## to nie jest nagłówek" },
  { nazwa: "nie lista", tekst: "\\- to nie jest lista\n\n1\\. to też nie" },
  { nazwa: "znaki wielobajtowe", tekst: "Uśmiech 🙂, klucz 𝄞 i rodzina 👨‍👩‍👧 w **treści** żółwia." },
  { nazwa: "koniec wiersza CRLF", tekst: "pierwszy akapit\r\n\r\n- punkt a\r\n- punkt b\r\n\r\ndrugi wiersz  \r\npo łamaniu\r\n" },
  { nazwa: "bloki bez pustego wiersza między nimi", tekst: "## Nagłówek\nakapit zaraz po nagłówku\n- lista po akapicie\n1. numerowana po punktowanej\nakapit po liście" },
  { nazwa: "link z niedozwolonym adresem", tekst: "tekst [kliknij](javascript:alert(1)) dalej" },
  { nazwa: "strona pokazowa", tekst: TRESC_PRZYKLADOWA },
];

/** Zapis spoza podzbioru: dla parsera treści to dosłowny tekst. */
export const KORPUS_SPOZA: PozycjaKorpusu[] = [
  { nazwa: "surowy HTML", tekst: '<div class="x" style="color:red"><b>pogrubione</b> <u>podkreślone</u></div>' },
  { nazwa: "znacznik script", tekst: "<script>window.wykonano = true</script>" },
  { nazwa: "obraz z obsługą błędu", tekst: '<img src="x" onerror="window.wykonano = true">' },
  { nazwa: "tabela", tekst: "| Kolumna | Druga |\n|---------|-------|\n| a       | b     |" },
  { nazwa: "obraz", tekst: "![Opis obrazu](/obraz.png)" },
  { nazwa: "blok kodu", tekst: "```\nconst a = 1;\n```" },
  { nazwa: "cytat i linia", tekst: "> cytat\n\n---\n\n# nagłówek pierwszego stopnia" },
  { nazwa: "podkreślenia i tyldy", tekst: "__nie pogrubienie__ _nie kursywa_ ~~nie skreślenie~~" },
  { nazwa: "lista w liście", tekst: "- punkt\n    - wcięty punkt" },
  { nazwa: "strona pokazowa: treść spoza podzbioru", tekst: TRESC_SPOZA_PODZBIORU },
];
