"use client";

import { useId } from "react";
import type { QuestionDraft } from "@/lib/h10/types";
import { Button } from "@/design-system/atomy/Button/Button";
import { ErrorText } from "@/design-system/atomy/ErrorText/ErrorText";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Input } from "@/design-system/atomy/Input/Input";
import { Label } from "@/design-system/atomy/Label/Label";
import { Textarea } from "@/design-system/atomy/Textarea/Textarea";
import type { BladDialogu } from "@/design-system/organizmy/Dialog/Dialog";
import {
  DLUGOSC_ODPOWIEDZI,
  DLUGOSC_PYTANIA,
  dodajOdpowiedz,
  moznaUsunacOdpowiedz,
  usunOdpowiedz,
  zaznaczPoprawna,
  ZDANIE_MINIMUM_ODPOWIEDZI,
  zmienOdpowiedz,
  zmienTresc,
  type BledyFormularza,
} from "./logika";
import style from "./PytaniaTestu.module.css";

interface WlasciwosciFormularzaPytania {
  /** Prefiks identyfikatorów pól — formularz dodawania i edycji mają różne. */
  prefiks: string;
  szkic: QuestionDraft;
  onZmiana: (szkic: QuestionDraft) => void;
  bledy: BledyFormularza;
  zapisywanie: boolean;
}

/** Identyfikator pola treści i pola odpowiedzi — powiązanie z etykietą i odnośniki z podsumowania błędów. */
export function idPolaTresci(prefiks: string): string {
  return `${prefiks}-tresc`;
}

export function idPolaOdpowiedzi(prefiks: string, indeks: number): string {
  return `${prefiks}-odpowiedz-${indeks}`;
}

/**
 * Błędy formularza jako podsumowanie wspólnego okna: treść, zestaw odpowiedzi
 * i każda odpowiedź z osobna — w kolejności pól; każdy błąd prowadzi do pola.
 */
export function listaBledow(bledy: BledyFormularza, prefiks: string): BladDialogu[] {
  const lista: BladDialogu[] = [];
  if (bledy.body !== undefined) lista.push({ tresc: bledy.body, idPola: idPolaTresci(prefiks) });
  if (bledy.answers !== undefined) lista.push({ tresc: bledy.answers, idPola: idPolaOdpowiedzi(prefiks, 0) });
  for (const indeks of Object.keys(bledy.odpowiedzi).map(Number).sort((a, b) => a - b)) {
    lista.push({ tresc: `Odpowiedź ${indeks + 1}: ${bledy.odpowiedzi[indeks]}`, idPola: idPolaOdpowiedzi(prefiks, indeks) });
  }
  return lista;
}

/**
 * Pola jednego pytania — dodawanie i edycja, w środku wspólnego okna
 * formularza (`Dialog` w wariancie `formularz`): treść pytania, odpowiedzi
 * z wyborem jednej odpowiedzi poprawnej, dodawanie i usuwanie odpowiedzi
 * (nie mniej niż dwie), błąd przy każdym polu, którego dotyczy. Przyciski
 * „Zapisz pytanie” i „Anuluj” daje okno; przyciski tutaj są drugorzędne
 * i mają `type="button"`, żeby nie wysyłały formularza okna.
 */
export function FormularzPytania({ prefiks, szkic, onZmiana, bledy, zapisywanie }: WlasciwosciFormularzaPytania) {
  const idMinimum = useId();
  const idLegendy = useId();
  const idBleduZestawu = useId();
  const idTresci = idPolaTresci(prefiks);
  const moznaUsunac = moznaUsunacOdpowiedz(szkic);

  return (
    <div className={style.formularz}>
      <div className={style.pole}>
        <Label htmlFor={idTresci} dzieci="Treść pytania" wymagane />
        <Textarea
          id={idTresci}
          value={szkic.body}
          onChange={(zdarzenie) => onZmiana(zmienTresc(szkic, zdarzenie.target.value))}
          disabled={zapisywanie}
          maxLength={DLUGOSC_PYTANIA}
          rows={3}
          niepoprawny={bledy.body !== undefined}
          aria-describedby={[`${idTresci}-podpowiedz`, bledy.body !== undefined ? `${idTresci}-blad` : null].filter(Boolean).join(" ")}
        />
        <Hint id={`${idTresci}-podpowiedz`}>{`Najwyżej ${DLUGOSC_PYTANIA} znaków.`}</Hint>
        <ErrorText id={`${idTresci}-blad`}>{bledy.body}</ErrorText>
      </div>

      <fieldset className={style.odpowiedzi} aria-describedby={bledy.answers !== undefined ? idBleduZestawu : undefined}>
        <legend id={idLegendy}>Odpowiedzi — zaznacz jedną odpowiedź poprawną</legend>
        <ol className={style.listaOdpowiedzi}>
          {szkic.answers.map((odpowiedz, indeks) => {
            const idPola = idPolaOdpowiedzi(prefiks, indeks);
            const blad = bledy.odpowiedzi[indeks];
            const numer = indeks + 1;
            return (
              <li key={odpowiedz.id ?? `nowa-${indeks}`} className={style.odpowiedz}>
                <label className={style.poprawna}>
                  <input
                    type="radio"
                    name={`${prefiks}-poprawna`}
                    checked={odpowiedz.is_correct}
                    onChange={() => onZmiana(zaznaczPoprawna(szkic, indeks))}
                    disabled={zapisywanie}
                    aria-label={`Odpowiedź poprawna: odpowiedź ${numer}`}
                  />
                  <span aria-hidden="true">Poprawna</span>
                </label>
                <div className={style.poleOdpowiedzi}>
                  <Label htmlFor={idPola} dzieci={`Odpowiedź ${numer}`} wymagane />
                  <Input
                    id={idPola}
                    rodzaj="tekst"
                    value={odpowiedz.body}
                    onChange={(zdarzenie) => onZmiana(zmienOdpowiedz(szkic, indeks, zdarzenie.target.value))}
                    disabled={zapisywanie}
                    maxLength={DLUGOSC_ODPOWIEDZI}
                    niepoprawny={blad !== undefined}
                    aria-describedby={blad !== undefined ? `${idPola}-blad` : undefined}
                  />
                  <ErrorText id={`${idPola}-blad`}>{blad}</ErrorText>
                </div>
                <div className={`${style.usunOdpowiedz} ${style.przyciskiOdpowiedzi}`}>
                  <Button
                    type="button"
                    poziom="outline"
                    rozmiar="sm"
                    onClick={() => onZmiana(usunOdpowiedz(szkic, indeks))}
                    disabled={zapisywanie || !moznaUsunac}
                    aria-label={`Usuń odpowiedź ${numer}`}
                    aria-describedby={!moznaUsunac ? idMinimum : undefined}
                  >
                    Usuń
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
        {!moznaUsunac && <Hint id={idMinimum}>{ZDANIE_MINIMUM_ODPOWIEDZI}</Hint>}
        <ErrorText id={idBleduZestawu}>{bledy.answers}</ErrorText>
        <div className={style.przyciskiOdpowiedzi}>
          <Button type="button" poziom="outline" onClick={() => onZmiana(dodajOdpowiedz(szkic))} disabled={zapisywanie}>
            Dodaj odpowiedź
          </Button>
        </div>
      </fieldset>
    </div>
  );
}
