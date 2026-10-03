import type { ReactNode } from "react";
import { Icon } from "../../atomy/Icon/Icon";
import style from "./StrzalkiKolejnosci.module.css";

interface WlasciwosciStrzalkiKolejnosci {
  /** Tytuł wiersza — wchodzi do nazw przycisków, żeby czytnik wiedział, który wiersz się rusza. */
  tytul: string;
  /** Czy wiersz ma dokąd pójść „wyżej”. Bez ruchu strzałka zostaje, ale jest wyłączona. */
  mozeWyzej: boolean;
  /** Czy wiersz ma dokąd pójść „niżej”. */
  mozeNizej: boolean;
  onWyzej: () => void;
  onNizej: () => void;
  /**
   * Numer kolejności wiersza. Stoi w tej samej wąskiej kolumnie między strzałkami:
   * strzałka w górę, pod nią numer, pod nim strzałka w dół. To zwykły tekst — nie
   * przyjmuje fokusu i nie ma własnej roli. Bez numeru kolumna ma tylko dwie strzałki.
   */
  numer?: ReactNode;
}

/**
 * Strzałki zmiany kolejności wiersza: jedna pod drugą, bez obramowań i tła w
 * spoczynku, a między nimi (gdy podany) numer wiersza. Stoją po lewej stronie wiersza.
 *
 * Strzałka bez ruchu do wykonania ma `aria-disabled="true"` i wygląd
 * wyłączony, ale nie ma atrybutu `disabled` — zostaje w kolejności fokusu,
 * więc fokus nie przepada, gdy wiersz dojdzie do końca listy. Kliknięcie
 * wyłączonej strzałki niczego nie woła.
 *
 * Molekuła nie zna tras ani danych. Ruch wiersza (płynna zamiana, fokus na tej
 * samej strzałce) daje pomocnik `useRuchWierszy` z `ruch.ts`, a zdania dla
 * czytnika — `zdania.ts`.
 */
export function StrzalkiKolejnosci({ tytul, mozeWyzej, mozeNizej, onWyzej, onNizej, numer }: WlasciwosciStrzalkiKolejnosci) {
  return (
    <span className={style.strzalki}>
      <button
        type="button"
        className={style.strzalka}
        data-strzalka="wyzej"
        aria-label={`Przenieś „${tytul}” wyżej`}
        aria-disabled={mozeWyzej ? undefined : true}
        onClick={() => {
          if (mozeWyzej) onWyzej();
        }}
      >
        <Icon nazwa="strzalka-gora" rozmiar={16} />
      </button>
      {numer !== undefined && numer !== null && (
        <span className={style.numer} data-numer-kolejnosci>
          {numer}
        </span>
      )}
      <button
        type="button"
        className={style.strzalka}
        data-strzalka="nizej"
        aria-label={`Przenieś „${tytul}” niżej`}
        aria-disabled={mozeNizej ? undefined : true}
        onClick={() => {
          if (mozeNizej) onNizej();
        }}
      >
        <Icon nazwa="strzalka-dol" rozmiar={16} />
      </button>
    </span>
  );
}
