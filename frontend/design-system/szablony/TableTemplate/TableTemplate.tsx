import type { ReactNode } from "react";
import style from "./TableTemplate.module.css";

interface WlasciwosciTableTemplate {
  /** PageHeader (O1) — niesie okruszki jako swoj pierwszy wewnetrzny wiersz. */
  naglowek: ReactNode;
  /** StatRow (O10) — pomijany, gdy ekran nie ma liczb zbiorczych. */
  statystyki?: ReactNode;
  /** Zdanie: jak liczby sie skladaja (np. zrodlo i metoda liczenia). */
  zdanie?: ReactNode;
  /** Zakres dat „od kiedy do kiedy” — kontrolka wyboru zakresu. */
  zakres?: ReactNode;
  /** TimeChart (O13) — pomijany, gdy ekran nie ma wykresu. */
  wykres?: ReactNode;
  /** DataTable (O3) — obszar glowny, zawsze obecny. */
  tabela: ReactNode;
  /** Blok uzupelniajacy POD tabela — pomijany, gdy ekran go nie ma. */
  wsparcie?: ReactNode;
}

/**
 * Szablon tabeli `TableTemplate` (warstwa 5, §5, wiersz 185). Zawsze jedna
 * kolumna, obszary w kolejnosci: naglowek -> statystyki -> zdanie -> zakres
 * dat -> wykres -> tabela -> blok wspierajacy pod tabela. Zachowanie ponizej
 * 639px (tabela zamienia sie w pary) nalezy do samego `DataTable` — szablon
 * go nie przepisuje ani nie zna.
 *
 * Zero logiki poza wyborem obszaru — kazdy opcjonalny slot renderuje sie
 * albo nie, bez zadnego innego rozgalezienia.
 */
export function TableTemplate({
  naglowek,
  statystyki,
  zdanie,
  zakres,
  wykres,
  tabela,
  wsparcie,
}: WlasciwosciTableTemplate) {
  return (
    <main id="tresc" tabIndex={-1} className={style.uklad} data-style-id="szablon-tabela">
      <div className={style.naglowek} data-testid="obszar-naglowek">
        {naglowek}
      </div>
      {statystyki && (
        <div className={style.statystyki} data-testid="obszar-statystyki">
          {statystyki}
        </div>
      )}
      {zdanie && (
        <div className={style.zdanie} data-testid="obszar-zdanie">
          {zdanie}
        </div>
      )}
      {zakres && (
        <div className={style.zakres} data-testid="obszar-zakres">
          {zakres}
        </div>
      )}
      {wykres && (
        <div className={style.wykres} data-testid="obszar-wykres">
          {wykres}
        </div>
      )}
      <div className={style.tabela} data-testid="obszar-tabela">
        {tabela}
      </div>
      {wsparcie && (
        <div className={style.wsparcie} data-testid="obszar-wsparcie">
          {wsparcie}
        </div>
      )}
    </main>
  );
}
