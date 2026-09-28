import { Text } from "../../atomy/Text/Text";
import { Hint } from "../../atomy/Hint/Hint";
import style from "./FileRow.module.css";

type StanFileRow = "przetwarzanie" | "gotowy" | "blad";

interface WlasciwosciFileRow {
  /** Nazwa pliku — widoczna w całości albo skrócona ze środka (Odbiór M6), nigdy z końca. */
  nazwa: string;
  stan: StanFileRow;
  /** Tekst `Hint` zależny od stanu — np. "Przetwarzanie…", "Gotowy", treść błędu. */
  komunikat: string;
}

/** Skraca nazwę ze ŚRODKA (zachowuje początek i rozszerzenie), nie z końca. */
function skrocNazwe(nazwa: string, limit = 40): string {
  if (nazwa.length <= limit) return nazwa;
  const polowa = Math.floor((limit - 1) / 2);
  return `${nazwa.slice(0, polowa)}…${nazwa.slice(nazwa.length - polowa)}`;
}

/**
 * Wiersz pliku `FileRow` (M6). Nie liczy się do poziomów pojemników (ZU-3) —
 * używany wyłącznie wewnątrz `FileDropZone`, nigdy jako samodzielna karta.
 */
export function FileRow({ nazwa, stan, komunikat }: WlasciwosciFileRow) {
  return (
    <li className={`${style.wiersz} ${style[stan]}`} data-stan={stan} title={nazwa}>
      <Text>{skrocNazwe(nazwa)}</Text>
      <Hint>{komunikat}</Hint>
    </li>
  );
}
