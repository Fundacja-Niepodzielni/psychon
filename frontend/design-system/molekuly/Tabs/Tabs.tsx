import { Button } from "../../atomy/Button/Button";
import { Num } from "../../atomy/Num/Num";
import style from "./Tabs.module.css";

interface ZakladkaTabs {
  id: string;
  etykieta: string;
  liczba?: number;
}

interface WlasciwosciTabs {
  zakladki: ZakladkaTabs[];
  wybranaId: string;
  onWybierz: (id: string) => void;
  etykietaLicznika?: string;
  /**
   * 06-ATOMY-MOLEKULY-ORGANIZMY.md §3, w. 148. Cytat stoi w JEDNYM wierszu
   * i znak w znak jak w źródle, żeby dawał się sprawdzić dosłownie:
   * ≤639 cały zestaw w rozwinięciu „Filtr: …
   * Domyślnie false — dotychczasowe wywołania (w
   * tym mount "wybrana"/"fokus" w poligonie) NIE dostają dodatkowej
   * struktury, żeby nie zmienić DOM-u, na którym stoją już zmierzone
   * pozycje (świadomie, jak przy oddzielnych mountach O7 "z brakami"/"bez
   * braków" — nowy stan dostaje własny mount, nie modyfikuje istniejący).
   */
  zwinPonizej639?: boolean;
}

/**
 * Zakładki `Tabs` (M8). `Button` × n + licznik (`Num`), złożone z atomów
 * warstwy 2. Wybrana zakładka różni się poziomem `Button` (kształt i tło),
 * nie samą barwą, i niesie `aria-pressed`. Licznik liczy z TEJ SAMEJ listy
 * `zakladki`, którą dostał komponent — nie z osobnego źródła.
 *
 * Przy `zwinPonizej639`: renderowany jest DODATKOWO natywny `<details>` z
 * `<summary>Filtr: {wybrana}</summary>`, który CSS pokazuje TYLKO ≤639px
 * (szeroki rząd chowa się w tym samym momencie) — kliknięcie summary
 * (natywne zachowanie `<details>`) rozwija ten sam zestaw przycisków co w
 * szerokim układzie.
 */
export function Tabs({
  zakladki,
  wybranaId,
  onWybierz,
  etykietaLicznika = "wyników",
  zwinPonizej639 = false,
}: WlasciwosciTabs) {
  if (zakladki.length === 0) {
    throw new Error("Tabs: zestaw zakładek nie może być pusty");
  }
  const wybranaEtykieta = zakladki.find((zakladka) => zakladka.id === wybranaId)?.etykieta ?? "";

  const renderujZakladki = () =>
    zakladki.map((zakladka) => {
      const wybrana = zakladka.id === wybranaId;
      return (
        <Button
          key={zakladka.id}
          poziom={wybrana ? "primary" : "outline"}
          aria-pressed={wybrana}
          onClick={() => onWybierz(zakladka.id)}
        >
          <span>{zakladka.etykieta}</span>
          {typeof zakladka.liczba === "number" && (
            <span className={style.licznik}>
              <Num wartosc={zakladka.liczba} etykieta={etykietaLicznika} />
            </span>
          )}
        </Button>
      );
    });

  if (!zwinPonizej639) {
    return (
      <div className={style.zestaw} role="group" aria-label="Zakładki">
        {renderujZakladki()}
      </div>
    );
  }

  return (
    <div>
      <div className={`${style.zestaw} ${style.zestawSzeroki}`} role="group" aria-label="Zakładki">
        {renderujZakladki()}
      </div>
      <details className={style.filtrZwiniety}>
        <summary className={style.filtrPodpis}>Filtr: {wybranaEtykieta}</summary>
        <div className={style.zestaw} role="group" aria-label="Zakładki">
          {renderujZakladki()}
        </div>
      </details>
    </div>
  );
}
