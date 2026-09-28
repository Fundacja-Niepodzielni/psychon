import { Field } from "../Field/Field";
import { Button } from "../../atomy/Button/Button";
import { Text } from "../../atomy/Text/Text";
import style from "./SearchBox.module.css";

interface WlasciwosciSearchBox {
  id: string;
  etykieta: string;
  wartosc: string;
  onZmiana: (wartosc: string) => void;
  placeholder?: string;
  brakWynikow?: boolean;
  tekstBrakuWynikow?: string;
}

/**
 * Szukajka `SearchBox` (M2, **0 wystąpień w drzewie dziś** — patrz pismo
 * zdawcze; zero wystąpień to zero miejsc użycia, nie zero błędów). Powstaje
 * z `Field` (rodzaj "tekst"), NIE jako nowy atom.
 *
 * Dwa braki atomu zgłoszone, nie dorobione po cichu:
 * 1. Ikona: atom `Icon` (A12) ma dziś 13 glifów w mapie (`home, book, clock,
 *    users, file, award, chat, inbox, chart, cog, help, user, out`) — żaden
 *    nie oznacza „szukaj" ani „wyczyść"/„x". Ta molekuła renderuje się bez
 *    ikony (świadomy brak, nie pomyłka); czyszczenie idzie przez `Button`
 *    `quiet` z tekstem "Wyczyść", widoczny tylko przy niepustej wartości.
 * 2. Stan „bez wyników": specyfikacja (§3 M2) każe użyć `EmptyState` (M17).
 *    M17 należy do INNEJ grupy i nie istnieje w tej gałęzi —
 *    ta molekuła go NIE importuje. Zamiast tego przyjmuje `brakWynikow` i
 *    wypisuje komunikat atomem `Text`, żeby nie blokować dostawy na
 *    zależności spoza własnego zakresu.
 */
export function SearchBox({
  id,
  etykieta,
  wartosc,
  onZmiana,
  placeholder,
  brakWynikow = false,
  tekstBrakuWynikow = "Brak wyników. Zmień szukaną frazę.",
}: WlasciwosciSearchBox) {
  const maWpis = wartosc !== "";

  return (
    <div className={style.szukajka}>
      <div className={style.wiersz}>
        <div className={style.pole}>
          <Field id={id} etykieta={etykieta} rodzaj="tekst" wartosc={wartosc} onZmiana={onZmiana} placeholder={placeholder} />
        </div>
        {maWpis && (
          <Button poziom="quiet" rozmiar="sm" onClick={() => onZmiana("")}>
            Wyczyść
          </Button>
        )}
      </div>
      {maWpis && brakWynikow && <Text wariant="pusty">{tekstBrakuWynikow}</Text>}
    </div>
  );
}
