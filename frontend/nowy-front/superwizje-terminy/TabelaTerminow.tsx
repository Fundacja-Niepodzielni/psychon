import { Badge } from "@/design-system/atomy/Badge/Badge";
import { Button } from "@/design-system/atomy/Button/Button";
import type { AdminSupervisionSlot } from "@/lib/api/h12";
import { czyTerminOdwolany } from "@/lib/h12/stanTerminu";
import { formatujDateICzas } from "../wspolne/daty";
import style from "./TabelaTerminow.module.css";

interface WlasciwosciTabeliTerminow {
  terminy: AdminSupervisionSlot[];
  onEdytuj: (termin: AdminSupervisionSlot) => void;
  onOdwolaj: (termin: AdminSupervisionSlot) => void;
  /** Akcje wierszy nieaktywne (trwa odwołanie albo okno potwierdzenia). */
  akcjeZablokowane?: boolean;
}

const KOLUMNY = ["Termin", "Prowadzący", "Miejsce", "Zapisane osoby", "Stan", "Akcje"] as const;

function nazwaProwadzacego(termin: AdminSupervisionSlot): string {
  return termin.supervisor
    ? `${termin.supervisor.first_name} ${termin.supervisor.last_name}`
    : "Bez przypisanego prowadzącego";
}

function plakietkaStanu(termin: AdminSupervisionSlot) {
  if (czyTerminOdwolany(termin)) return <Badge wariant="neutral">Odwołany</Badge>;
  if (termin.available_seats === 0) return <Badge wariant="warn">Brak wolnych miejsc</Badge>;
  return <Badge wariant="neutral">Wolne miejsca</Badge>;
}

/**
 * Tabela terminów superwizji z kolumną akcji — jedyny powód, dla którego ten
 * ekran nie stoi już na `RecordList` (jedna akcja na wiersz) ani na
 * `DataTable` (komórki wyłącznie tekstowe). Oba wspólne organizmy zostają bez
 * zmian; ta tabela jest lokalna dla ekranu i powtarza ich zachowanie: własny
 * układ `role="table"` i poniżej 639 px pary etykieta–wartość zamiast
 * poziomego przewijania (`TabelaTerminow.module.css`).
 *
 * Termin odwołany zostaje w tabeli z plakietką „Odwołany” i bez akcji. Pozostałe
 * mają „Edytuj” i „Odwołaj termin”; nazwa dostępna przycisku zostaje krótka,
 * a datę terminu dopowiada `aria-describedby` (komórka „Termin” wiersza).
 */
export function TabelaTerminow({ terminy, onEdytuj, onOdwolaj, akcjeZablokowane = false }: WlasciwosciTabeliTerminow) {
  return (
    <div className={style.siatka} role="table" aria-label="Terminy superwizji">
      <div className={style.wierszNaglowka} role="row">
        {KOLUMNY.map((kolumna) => (
          <div key={kolumna} role="columnheader" className={style.komorka}>
            {kolumna}
          </div>
        ))}
      </div>
      {terminy.map((termin) => {
        const odwolany = czyTerminOdwolany(termin);
        const idTerminu = `termin-${termin.id}-data`;
        return (
          <div
            key={termin.id}
            className={odwolany ? `${style.wiersz} ${style.odwolany}` : style.wiersz}
            role="row"
            data-testid={`termin-${termin.id}`}
          >
            <div role="cell" data-etykieta="Termin" className={style.komorka} id={idTerminu}>
              {formatujDateICzas(termin.starts_at)}
            </div>
            <div role="cell" data-etykieta="Prowadzący" className={style.komorka}>
              {nazwaProwadzacego(termin)}
            </div>
            <div role="cell" data-etykieta="Miejsce" className={style.komorka}>
              {termin.location_or_link ?? "Bez podanej lokalizacji."}
            </div>
            <div role="cell" data-etykieta="Zapisane osoby" className={style.komorka}>
              {odwolany ? "—" : `${termin.active_signups_count} z ${termin.seats_limit}`}
            </div>
            <div role="cell" data-etykieta="Stan" className={style.komorka}>
              {plakietkaStanu(termin)}
            </div>
            <div role="cell" data-etykieta="Akcje" className={`${style.komorka} ${style.akcje}`}>
              {!odwolany && (
                <>
                  <Button
                    poziom="outline"
                    rozmiar="sm"
                    disabled={akcjeZablokowane}
                    aria-describedby={idTerminu}
                    onClick={() => onEdytuj(termin)}
                  >
                    Edytuj
                  </Button>
                  <Button
                    poziom="outline"
                    rozmiar="sm"
                    niebezpieczny
                    disabled={akcjeZablokowane}
                    aria-describedby={idTerminu}
                    onClick={() => onOdwolaj(termin)}
                  >
                    Odwołaj termin
                  </Button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
