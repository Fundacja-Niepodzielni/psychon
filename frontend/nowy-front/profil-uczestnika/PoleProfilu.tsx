import type { HTMLAttributes } from "react";
import { ErrorText } from "@/design-system/atomy/ErrorText/ErrorText";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Input } from "@/design-system/atomy/Input/Input";
import { Label } from "@/design-system/atomy/Label/Label";
import style from "./ProfilUczestnika.module.css";

interface WlasciwosciPolaProfilu {
  id: string;
  etykieta: string;
  wartosc: string;
  onZmiana?: (wartosc: string) => void;
  podpowiedz?: string;
  blad?: string;
  /** Pole tylko do odczytu (np. adres e-mail): zawsze z podpowiedzią, dlaczego nie da się go zmienić. */
  zablokowane?: boolean;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
}

/**
 * Pole tekstowe formularza profilu: `Label` + `Input` + `Hint` + `ErrorText` z atomów, z
 * tym samym powiązaniem `aria-describedby` co molekuła `Field`. Osobny komponent, bo
 * `Field` nie przekazuje do pola `inputMode` ani `autoComplete`, a stary formularz ma
 * klawiaturę numeryczną w polach PESEL i kod pocztowy.
 */
export function PoleProfilu({
  id,
  etykieta,
  wartosc,
  onZmiana,
  podpowiedz,
  blad,
  zablokowane = false,
  inputMode,
  autoComplete,
}: WlasciwosciPolaProfilu) {
  const idPodpowiedzi = podpowiedz ? `${id}-podpowiedz` : undefined;
  const idBledu = blad ? `${id}-blad` : undefined;
  const opisane = [idPodpowiedzi, idBledu].filter(Boolean).join(" ") || undefined;

  return (
    <div className={style.pole}>
      <Label htmlFor={id} dzieci={etykieta} />
      <Input
        id={id}
        rodzaj="tekst"
        value={wartosc}
        onChange={(zdarzenie) => onZmiana?.(zdarzenie.target.value)}
        readOnly={zablokowane}
        disabled={zablokowane}
        inputMode={inputMode}
        autoComplete={autoComplete}
        niepoprawny={Boolean(blad)}
        aria-describedby={opisane}
      />
      {podpowiedz && <Hint id={idPodpowiedzi}>{podpowiedz}</Hint>}
      {blad && <ErrorText id={idBledu ?? `${id}-blad`}>{blad}</ErrorText>}
    </div>
  );
}
