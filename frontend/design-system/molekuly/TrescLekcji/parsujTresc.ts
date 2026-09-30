/**
 * Parser podzbioru Markdown treści lekcji (`lessons.content`) do prostego
 * drzewa danych. Drzewo nie niesie ŻADNEGO HTML-a: każdy liść to zwykły
 * string, który `TrescLekcji` wkłada do DOM jako dziecko tekstowe Reacta —
 * `<script>` czy `<img onerror>` w treści zostają więc tekstem.
 *
 * Podzbiór (aneks kontraktu „Treść lekcji (H06, H08)”): akapity, nagłówki
 * `##` i `###`, **pogrubienie**, *kursywa*, listy `-` i `1.`, `kod w linii`,
 * twarde łamanie wiersza (dwie spacje albo `\` na końcu wiersza) oraz linki
 * `[tekst](adres)`. Obrazów, tabel, bloków HTML i surowego HTML nie ma —
 * taki zapis zostaje dosłownym tekstem.
 */

export type Wtracenie =
  | { rodzaj: "tekst"; tekst: string }
  | { rodzaj: "pogrubienie"; dzieci: Wtracenie[] }
  | { rodzaj: "kursywa"; dzieci: Wtracenie[] }
  | { rodzaj: "kod"; tekst: string }
  | { rodzaj: "lamanie" }
  | { rodzaj: "link"; adres: string; zewnetrzny: boolean; dzieci: Wtracenie[] };

export type Blok =
  | { rodzaj: "akapit"; dzieci: Wtracenie[] }
  | { rodzaj: "naglowek"; stopien: 2 | 3; dzieci: Wtracenie[] }
  | { rodzaj: "lista"; uporzadkowana: boolean; start: number; elementy: Wtracenie[][] };

/** Znaki, które poprzedzone `\` znaczą same siebie. */
const ESCAPOWALNE = new Set(["\\", "`", "*", "_", "[", "]", "(", ")", "#", "-", ".", "!", "+"]);

/**
 * Adres linku po sprawdzeniu albo `null`, gdy link ma zostać samym tekstem.
 *
 * Lista dozwolonych, nie lista zakazanych: `https:`, `http:`, `mailto:` oraz
 * ścieżka zaczynająca się od jednego `/`. Schemat porównywany jest po
 * usunięciu białych i sterujących znaków i bez względu na wielkość liter —
 * przeglądarka sama wycina tabulatory i znaki nowego wiersza z adresu, więc
 * `java\tscript:` i ` JaVaScRiPt:` są dla niej tym samym `javascript:`.
 * `//host` i `/\host` przeglądarka czyta jako adres innego hosta, nie
 * ścieżkę — oba zostają tekstem.
 */
export function bezpiecznyAdres(surowy: string): { adres: string; zewnetrzny: boolean } | null {
  const adres = surowy.trim();
  // Znaki sterujące i białe usuwane celowo: przeglądarka też je wycina z adresu.
  const znormalizowany = adres.replace(/[\u0000- \u007f-\u009f]/g, "").toLowerCase();

  if (znormalizowany.startsWith("https:") || znormalizowany.startsWith("http:")) {
    return { adres, zewnetrzny: true };
  }
  if (znormalizowany.startsWith("mailto:")) {
    return { adres, zewnetrzny: false };
  }
  if (znormalizowany.startsWith("/") && !znormalizowany.startsWith("//") && !znormalizowany.startsWith("/\\")) {
    return { adres, zewnetrzny: false };
  }
  return null;
}

/** Indeks nawiasu zamykającego adres linku (z równowagą nawiasów) albo -1. */
function koniecAdresu(tekst: string, od: number): number {
  let glebokosc = 1;
  for (let i = od; i < tekst.length; i += 1) {
    const znak = tekst[i];
    if (znak === "\\") {
      i += 1;
    } else if (znak === "(") {
      glebokosc += 1;
    } else if (znak === ")") {
      glebokosc -= 1;
      if (glebokosc === 0) {
        return i;
      }
    }
  }
  return -1;
}

/** Wtrącenia jednego wiersza (albo wnętrza pogrubienia, kursywy, linku). */
export function parsujWtracenia(tekst: string, wLinku = false): Wtracenie[] {
  const wynik: Wtracenie[] = [];
  let bufor = "";

  const doBufora = () => {
    if (bufor !== "") {
      wynik.push({ rodzaj: "tekst", tekst: bufor });
      bufor = "";
    }
  };

  let i = 0;
  while (i < tekst.length) {
    const znak = tekst[i];

    if (znak === "\\" && i + 1 < tekst.length && ESCAPOWALNE.has(tekst[i + 1])) {
      bufor += tekst[i + 1];
      i += 2;
      continue;
    }

    if (znak === "`") {
      const koniec = tekst.indexOf("`", i + 1);
      if (koniec > i + 1) {
        doBufora();
        wynik.push({ rodzaj: "kod", tekst: tekst.slice(i + 1, koniec) });
        i = koniec + 1;
        continue;
      }
    }

    if (znak === "*" && tekst[i + 1] === "*") {
      const koniec = tekst.indexOf("**", i + 2);
      if (koniec > i + 2) {
        doBufora();
        wynik.push({ rodzaj: "pogrubienie", dzieci: parsujWtracenia(tekst.slice(i + 2, koniec), wLinku) });
        i = koniec + 2;
        continue;
      }
      bufor += "**";
      i += 2;
      continue;
    }

    if (znak === "*") {
      const koniec = tekst.indexOf("*", i + 1);
      if (koniec > i + 1) {
        doBufora();
        wynik.push({ rodzaj: "kursywa", dzieci: parsujWtracenia(tekst.slice(i + 1, koniec), wLinku) });
        i = koniec + 1;
        continue;
      }
    }

    if (znak === "[" && !wLinku) {
      const zamkniecie = tekst.indexOf("]", i + 1);
      if (zamkniecie > i + 1 && tekst[zamkniecie + 1] === "(") {
        const koniec = koniecAdresu(tekst, zamkniecie + 2);
        if (koniec !== -1) {
          const dzieci = parsujWtracenia(tekst.slice(i + 1, zamkniecie), true);
          const sprawdzony = bezpiecznyAdres(tekst.slice(zamkniecie + 2, koniec));
          doBufora();
          if (sprawdzony === null) {
            // Niedozwolony schemat: zostaje sam tekst linku, bez adresu.
            wynik.push(...dzieci);
          } else {
            wynik.push({ rodzaj: "link", adres: sprawdzony.adres, zewnetrzny: sprawdzony.zewnetrzny, dzieci });
          }
          i = koniec + 1;
          continue;
        }
      }
    }

    bufor += znak;
    i += 1;
  }

  doBufora();
  return wynik;
}

const NAGLOWEK = /^(#{2,3})[ \t]+(.*\S)[ \t]*$/;
const PUNKT = /^[ \t]{0,3}-[ \t]+(.*\S)[ \t]*$/;
const NUMER = /^[ \t]{0,3}(\d{1,9})\.[ \t]+(.*\S)[ \t]*$/;
const TWARDE_LAMANIE = /( {2,}|\\)$/;

/** Cała treść lekcji jako lista bloków. Pusta albo `null` treść daje pustą listę. */
export function parsujTresc(tresc: string | null | undefined): Blok[] {
  if (tresc === null || tresc === undefined) {
    return [];
  }

  const bloki: Blok[] = [];
  let akapit: string[] = [];
  let lista: Extract<Blok, { rodzaj: "lista" }> | null = null;

  const zamknijAkapit = () => {
    if (akapit.length === 0) {
      return;
    }
    const dzieci: Wtracenie[] = [];
    akapit.forEach((wiersz, indeks) => {
      const ostatni = indeks === akapit.length - 1;
      const twarde = !ostatni && TWARDE_LAMANIE.test(wiersz);
      const tresc = twarde ? wiersz.replace(TWARDE_LAMANIE, "") : wiersz;
      dzieci.push(...parsujWtracenia(tresc.trim()));
      if (!ostatni) {
        dzieci.push(twarde ? { rodzaj: "lamanie" } : { rodzaj: "tekst", tekst: "\n" });
      }
    });
    bloki.push({ rodzaj: "akapit", dzieci });
    akapit = [];
  };

  const zamknijListe = () => {
    if (lista !== null) {
      bloki.push(lista);
      lista = null;
    }
  };

  for (const wiersz of tresc.replace(/\r\n?/g, "\n").split("\n")) {
    if (wiersz.trim() === "") {
      zamknijAkapit();
      zamknijListe();
      continue;
    }

    const naglowek = NAGLOWEK.exec(wiersz);
    if (naglowek !== null) {
      zamknijAkapit();
      zamknijListe();
      bloki.push({
        rodzaj: "naglowek",
        stopien: naglowek[1].length === 2 ? 2 : 3,
        dzieci: parsujWtracenia(naglowek[2]),
      });
      continue;
    }

    const punkt = PUNKT.exec(wiersz);
    const numer = punkt === null ? NUMER.exec(wiersz) : null;
    if (punkt !== null || numer !== null) {
      zamknijAkapit();
      const uporzadkowana = numer !== null;
      const tekst = numer !== null ? numer[2] : (punkt as RegExpExecArray)[1];
      if (lista === null || lista.uporzadkowana !== uporzadkowana) {
        zamknijListe();
        lista = { rodzaj: "lista", uporzadkowana, start: numer !== null ? Number(numer[1]) : 1, elementy: [] };
      }
      lista.elementy.push(parsujWtracenia(tekst));
      continue;
    }

    zamknijListe();
    akapit.push(wiersz);
  }

  zamknijAkapit();
  zamknijListe();
  return bloki;
}
