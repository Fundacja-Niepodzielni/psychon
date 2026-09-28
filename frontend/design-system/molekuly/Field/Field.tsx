import type { ChangeEvent } from "react";
import { Label } from "../../atomy/Label/Label";
import { Hint } from "../../atomy/Hint/Hint";
import { ErrorText } from "../../atomy/ErrorText/ErrorText";
import { Input } from "../../atomy/Input/Input";
import { Textarea } from "../../atomy/Textarea/Textarea";
import { Select } from "../../atomy/Select/Select";
import style from "./Field.module.css";

type RodzajPola = "tekst" | "liczba" | "data" | "wieloliniowy" | "wybor";

interface OpcjaWyboru {
  wartosc: string;
  etykieta: string;
}

interface WlasciwosciField {
  id: string;
  etykieta: string;
  rodzaj: RodzajPola;
  wymagane?: boolean;
  zablokowany?: boolean;
  podpowiedz?: string;
  blad?: string;
  wartosc?: string;
  domyslnaWartosc?: string;
  onZmiana?: (wartosc: string) => void;
  opcje?: OpcjaWyboru[];
  placeholder?: string;
  name?: string;
}

/**
 * Pole `Field` (M1, 06-ATOMY-MOLEKULY-ORGANIZMY.md §3). Jedna implementacja
 * na pięć rodzajów kontrolki — `Label` + kontrolka + `Hint` + `ErrorText`,
 * złożone WYŁĄCZNIE z atomów warstwy 2 (`design-system/atomy`). Jedno `id`
 * łączy etykietę, podpowiedź i błąd: `Label` przez `htmlFor`, kontrolka
 * przez `aria-describedby` wskazujące podpowiedź i błąd — nic zdublowanego.
 *
 * Ograniczenie zmierzone przy budowie: atom `Select` (A5) nie przyjmuje
 * `aria-describedby` w swoim interfejsie (tylko `aria-label`/
 * `aria-labelledby`) — dla `rodzaj="wybor"` podpowiedź i błąd renderują się
 * pod kontrolką, ale nie są dziś powiązane przez `aria-describedby` z jej
 * elementem `role="combobox"`. To ograniczenie atomu, nie tej molekuły;
 * zgłoszone w piśmie zdawczym, atom NIE zmieniony.
 */
export function Field({
  id,
  etykieta,
  rodzaj,
  wymagane = false,
  zablokowany = false,
  podpowiedz,
  blad,
  wartosc,
  domyslnaWartosc,
  onZmiana,
  opcje,
  placeholder,
  name,
}: WlasciwosciField) {
  const idPodpowiedzi = podpowiedz ? `${id}-podpowiedz` : undefined;
  const idBledu = blad ? `${id}-blad` : undefined;
  const describedBy = [idPodpowiedzi, idBledu].filter(Boolean).join(" ") || undefined;
  const niepoprawny = Boolean(blad);

  function naZmiane(zdarzenie: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    onZmiana?.(zdarzenie.target.value);
  }

  return (
    <div className={style.pole}>
      <Label htmlFor={id} dzieci={etykieta} wymagane={wymagane} />
      {rodzaj === "wieloliniowy" && (
        <Textarea
          id={id}
          name={name}
          value={wartosc}
          defaultValue={wartosc === undefined ? domyslnaWartosc : undefined}
          onChange={naZmiane}
          disabled={zablokowany}
          required={wymagane}
          niepoprawny={niepoprawny}
          placeholder={placeholder}
          aria-describedby={describedBy}
        />
      )}
      {rodzaj === "wybor" && (
        <Select
          id={id}
          name={name}
          opcje={opcje ?? []}
          wartosc={wartosc}
          domyslnaWartosc={domyslnaWartosc}
          onZmiana={onZmiana}
          disabled={zablokowany}
          required={wymagane}
          niepoprawny={niepoprawny}
        />
      )}
      {(rodzaj === "tekst" || rodzaj === "liczba" || rodzaj === "data") && (
        <Input
          id={id}
          name={name}
          rodzaj={rodzaj}
          value={wartosc}
          defaultValue={wartosc === undefined ? domyslnaWartosc : undefined}
          onChange={naZmiane}
          disabled={zablokowany}
          required={wymagane}
          niepoprawny={niepoprawny}
          placeholder={placeholder}
          aria-describedby={describedBy}
        />
      )}
      {podpowiedz && <Hint id={idPodpowiedzi}>{podpowiedz}</Hint>}
      {blad && <ErrorText id={idBledu ?? `${id}-blad`}>{blad}</ErrorText>}
    </div>
  );
}
