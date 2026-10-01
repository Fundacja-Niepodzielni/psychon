import type { PolaFormularza, StanFormularza } from "./formularz";

/**
 * Stan zapisu tekstu lekcji — bez Reacta, bez sieci. Karta „Zapis” mówi, które
 * pola różnią się od ostatnio zapisanych, i podaje godzinę ostatniego udanego
 * zapisu w tej sesji. Nagranie i pliki zapisują się same, więc tu ich nie ma.
 */

/** Kolejność i nazwy pól w zdaniu „Niezapisane: …”. */
const NAZWY_POL: ReadonlyArray<[PolaFormularza, string]> = [
  ["title", "tytuł"],
  ["description", "opis"],
  ["duration", "czas"],
  ["content", "treść"],
];

/** Nazwy pól, których wartość różni się od zapisanej — w stałej kolejności. */
export function zmienionePola(formularz: StanFormularza, zapisany: StanFormularza): string[] {
  return NAZWY_POL.filter(([pole]) => formularz[pole] !== zapisany[pole]).map(([, nazwa]) => nazwa);
}

/** Godzina w zapisie „10:42” (czas lokalny przeglądarki). */
export function godzinaZapisu(chwila: Date): string {
  const dwieCyfry = (liczba: number) => String(liczba).padStart(2, "0");
  return `${dwieCyfry(chwila.getHours())}:${dwieCyfry(chwila.getMinutes())}`;
}

export interface OpisStanuZapisu {
  /** Część wyróżniona: „Niezapisane: tytuł, treść” albo „Wszystko zapisane”. */
  glowne: string;
  /** Część po kropce środkowej: „ostatni zapis 10:42” albo sama godzina; `null`, gdy zapisu w tej sesji nie było. */
  dodatek: string | null;
}

/** `ostatniZapis` — godzina ostatniego udanego zapisu w tej sesji albo `null` przed pierwszym. */
export function opisStanuZapisu(zmienione: string[], ostatniZapis: string | null): OpisStanuZapisu {
  if (zmienione.length > 0) {
    return {
      glowne: `Niezapisane: ${zmienione.join(", ")}`,
      dodatek: ostatniZapis === null ? null : `ostatni zapis ${ostatniZapis}`,
    };
  }
  return { glowne: "Wszystko zapisane", dodatek: ostatniZapis };
}

/** Jedno zdanie dla czytnika i dla prób: obie części połączone kropką środkową. */
export function zdanieStanuZapisu(opis: OpisStanuZapisu): string {
  return opis.dodatek === null ? opis.glowne : `${opis.glowne} · ${opis.dodatek}`;
}
