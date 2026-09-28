import { useId, useState } from "react";
import { Label } from "../../atomy/Label/Label";
import { Text } from "../../atomy/Text/Text";
import { Button } from "../../atomy/Button/Button";
import style from "./KeyValueRow.module.css";

interface WlasciwosciKeyValueRow {
  etykieta: string;
  wartosc: string;
  zamaskowana?: boolean;
}

/**
 * Para etykieta–wartość `KeyValueRow` (M4). `Label` + `Text` (+ mały
 * `Button` przy wartości zamaskowanej), złożone z atomów warstwy 2.
 *
 * Ograniczenie zmierzone przy budowie: atom `Label` (A9) wymaga `htmlFor`
 * wskazującego kontrolkę formularza — tu wartość jest tekstem statycznym,
 * nie kontrolką. `htmlFor` wskazuje `id` kontenera wartości (`<span>`), co
 * jest poprawne HTML-owo (nie wyrzuca błędu), ale nie daje takiego samego
 * skojarzenia asystenta jak przy prawdziwej kontrolce — warstwa 2 nie ma
 * dziś odrębnego atomu „termin/wartość" bez zakładanej interaktywności.
 * Zgłoszone, atom NIE zmieniony.
 */
export function KeyValueRow({ etykieta, wartosc, zamaskowana = false }: WlasciwosciKeyValueRow) {
  const idBazowy = useId();
  const idWartosci = `${idBazowy}-wartosc`;
  const [odsloniete, setOdsloniete] = useState(false);
  const pokaz = !zamaskowana || odsloniete;
  const dlugoscMaski = Math.min(Math.max(wartosc.length, 1), 12);
  const wyswietlana = pokaz ? wartosc : "•".repeat(dlugoscMaski);

  return (
    <div className={style.para}>
      <Label htmlFor={idWartosci} dzieci={etykieta} />
      <span id={idWartosci} className={style.wartosc}>
        <Text>{wyswietlana === "" ? "—" : wyswietlana}</Text>
        {zamaskowana && (
          <Button poziom="quiet" rozmiar="sm" onClick={() => setOdsloniete((poprzednio) => !poprzednio)}>
            {odsloniete ? "Ukryj" : "Pokaż"}
          </Button>
        )}
      </span>
    </div>
  );
}
