"use client";

import { ErrorText } from "@/design-system/atomy/ErrorText/ErrorText";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Label } from "@/design-system/atomy/Label/Label";
import style from "./GrupaProwadzacego.module.css";

interface WlasciwosciPolaDatyICzasu {
  id: string;
  etykieta: string;
  wartosc: string;
  onZmiana: (wartosc: string) => void;
  podpowiedz: string;
  blad?: string;
}

/**
 * Pole daty i godziny w jednym natywnym elemencie (`datetime-local`, czas lokalny przeglądarki).
 * Żaden rodzaj pola `Field` nie łączy daty z godziną, więc pole składa się z atomów `Label`,
 * `Hint` i `ErrorText` — tak samo jak na ekranie terminów administracji. To jedyny plik tego
 * ekranu z surowym elementem `input`.
 */
export function PoleDatyICzasu({ id, etykieta, wartosc, onZmiana, podpowiedz, blad }: WlasciwosciPolaDatyICzasu) {
  const idPodpowiedzi = `${id}-podpowiedz`;
  const idBledu = `${id}-blad`;
  return (
    <div className={style.poleNatywne}>
      <Label htmlFor={id} dzieci={etykieta} wymagane />
      <input
        id={id}
        type="datetime-local"
        className={style.inputNatywny}
        value={wartosc}
        onChange={(zdarzenie) => onZmiana(zdarzenie.target.value)}
        aria-invalid={Boolean(blad) || undefined}
        aria-describedby={blad ? `${idPodpowiedzi} ${idBledu}` : idPodpowiedzi}
        required
      />
      <Hint id={idPodpowiedzi}>{podpowiedz}</Hint>
      <ErrorText id={idBledu}>{blad}</ErrorText>
    </div>
  );
}
