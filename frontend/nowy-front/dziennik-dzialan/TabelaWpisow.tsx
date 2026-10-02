import { Badge } from "@/design-system/atomy/Badge/Badge";
import { Link } from "@/design-system/atomy/Link/Link";
import type { OpisWpisu } from "./dane";
import style from "./DziennikDzialan.module.css";

/** Nazwy kolumn — te same, w tej samej kolejności, co nagłówek pliku do pobrania. */
export const KOLUMNY = ["Kiedy", "Co", "Kogo dotyczy", "Kto"] as const;

/**
 * Wpisy dziennika. Semantyka tabeli rolami ARIA na elementach `div`
 * (`table` → `row` → `columnheader`/`cell`) — ten sam powód co w
 * `RecordList`: układ przechodzi z czterech kolumn (od 640 px) w blok
 * „Co” / „Kogo dotyczy: …” / „Kto · kiedy” (poniżej), a role jawne nie
 * znikają przy zmianie `display`. Wiersz nagłówków poniżej 640 px jest ukryty
 * tylko wzrokowo, więc każda komórka zachowuje nazwę swojej kolumny; widoczny
 * podpis „Kogo dotyczy:” jest wtedy poza drzewem dostępności.
 *
 * „Kogo dotyczy” to odnośnik do karty osoby, gdy osoba ma konto, w innym
 * wypadku sam tekst (osoba ze zgłoszenia bez konta albo nazwa rzeczy).
 */
export function TabelaWpisow({ wpisy }: { wpisy: OpisWpisu[] }) {
  return (
    <div className={style.tabela} role="table" aria-label="Wpisy dziennika">
      <div className={style.naglowki} role="row">
        {KOLUMNY.map((kolumna) => (
          <span key={kolumna} role="columnheader">
            {kolumna}
          </span>
        ))}
      </div>
      {wpisy.map((wpis) => (
        <div key={wpis.id} className={style.wiersz} role="row" data-wpis={wpis.id}>
          <div className={`${style.komorka} ${style.kiedy}`} role="cell">
            {wpis.kiedy}
          </div>
          <div className={`${style.komorka} ${style.co}`} role="cell">
            <Badge wariant="neutral">{wpis.grupa}</Badge>
            <p className={style.zdanie}>{wpis.zdanie}</p>
            {wpis.rzecz && <p className={style.rzecz}>{wpis.rzecz}</p>}
          </div>
          <div className={`${style.komorka} ${style.kogo}`} role="cell">
            <span className={style.podpis} aria-hidden="true">
              Kogo dotyczy:{" "}
            </span>
            {wpis.kogo.href ? (
              <Link href={wpis.kogo.href} aria-label={`Karta osoby: ${wpis.kogo.tekst}`}>
                {wpis.kogo.tekst}
              </Link>
            ) : (
              <span>{wpis.kogo.tekst}</span>
            )}
          </div>
          <div className={`${style.komorka} ${style.kto}`} role="cell">
            {wpis.kto}
          </div>
        </div>
      ))}
    </div>
  );
}
