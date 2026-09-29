import type { ReactNode } from "react";
import style from "./ListTemplate.module.css";

interface WlasciwosciListTemplate {
  /** Naglowek ekranu — element PageHeader (O1), ktory sam niesie okruszki
   * jako swoj pierwszy wewnetrzny wiersz. Szablon nie sklada okruszkow
   * osobno — sa czescia obszaru naglowka. */
  naglowek: ReactNode;
  /** Filtry listy — pomijane, gdy ekran ich nie ma. */
  filtry?: ReactNode;
  /** RecordList albo DataTable — dokladnie jeden obszar glowny. */
  lista: ReactNode;
  /** Stronicowanie (Pagination) — pomijane dla list bez podzialu na strony. */
  stronicowanie?: ReactNode;
}

/**
 * Szablon listy `ListTemplate` (warstwa 5, §5 06-ATOMY-MOLEKULY-ORGANIZMY.md,
 * wiersz 183). Czysty uklad obszarow w kolejnosci: naglowek -> filtry ->
 * lista -> stronicowanie. Jedna kolumna na kazdej szerokosci — sam uklad
 * tego nie musi wymuszac zapytaniem o szerokosc, bo kazdy obszar jest juz
 * pelnej szerokosci pojemnika z natury flex-column.
 *
 * Zero logiki poza wyborem obszaru: kazdy opcjonalny slot albo sie renderuje,
 * albo nie — bez odczytywania czegokolwiek z jego zawartosci.
 */
export function ListTemplate({ naglowek, filtry, lista, stronicowanie }: WlasciwosciListTemplate) {
  return (
    <main id="tresc" tabIndex={-1} className={style.uklad} data-style-id="szablon-lista">
      <div className={style.naglowek} data-testid="obszar-naglowek">
        {naglowek}
      </div>
      {filtry && (
        <div className={style.filtry} data-testid="obszar-filtry">
          {filtry}
        </div>
      )}
      <div className={style.lista} data-testid="obszar-lista">
        {lista}
      </div>
      {stronicowanie && (
        <div className={style.stronicowanie} data-testid="obszar-stronicowanie">
          {stronicowanie}
        </div>
      )}
    </main>
  );
}
