"use client";

import { useEffect, useId, useRef } from "react";
import type { QuestionDraft } from "@/lib/h10/types";
import { Button } from "@/design-system/atomy/Button/Button";
import { ErrorText } from "@/design-system/atomy/ErrorText/ErrorText";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Input } from "@/design-system/atomy/Input/Input";
import { Label } from "@/design-system/atomy/Label/Label";
import { Textarea } from "@/design-system/atomy/Textarea/Textarea";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
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
  tytul: string;
  szkic: QuestionDraft;
  onZmiana: (szkic: QuestionDraft) => void;
  bledy: BledyFormularza;
  /** Zdanie ogólne serwera, gdy żadne pole nie ma własnego błędu. */
  komunikat: string | null;
  zapisywanie: boolean;
  onZapisz: () => void;
  onAnuluj: () => void;
  /** Rośnie przy każdej odmowie zapisu: fokus idzie wtedy na pierwsze pole z błędem. */
  numerOdmowy: number;
}

/** Identyfikator pola treści i pola odpowiedzi — fokus po odmowie i powiązanie z etykietą. */
export function idPolaTresci(prefiks: string): string {
  return `${prefiks}-tresc`;
}

export function idPolaOdpowiedzi(prefiks: string, indeks: number): string {
  return `${prefiks}-odpowiedz-${indeks}`;
}

/**
 * Formularz jednego pytania — dodawanie i edycja. Treść pytania, odpowiedzi
 * z wyborem jednej odpowiedzi poprawnej, dodawanie i usuwanie odpowiedzi
 * (nie mniej niż dwie), błąd przy każdym polu, którego dotyczy. Jedyny zielony
 * przycisk to „Zapisz pytanie”; w czasie zapisu jest nieczynny, a zdanie pod
 * nim mówi dlaczego. Bez elementu `form`: stoi w wierszu listy obok innych.
 */
export function FormularzPytania({
  prefiks,
  tytul,
  szkic,
  onZmiana,
  bledy,
  komunikat,
  zapisywanie,
  onZapisz,
  onAnuluj,
  numerOdmowy,
}: WlasciwosciFormularzaPytania) {
  const idNaglowka = useId();
  const idZapisu = useId();
  const idMinimum = useId();
  const idLegendy = useId();
  const idBleduZestawu = useId();
  const pierwszyRender = useRef(true);
  const idTresci = idPolaTresci(prefiks);
  const moznaUsunac = moznaUsunacOdpowiedz(szkic);

  // Po otwarciu formularza fokus idzie na treść pytania.
  useEffect(() => {
    document.getElementById(idTresci)?.focus();
  }, [idTresci]);

  // Po odmowie zapisu fokus idzie na pierwsze pole z błędem.
  useEffect(() => {
    if (pierwszyRender.current) {
      pierwszyRender.current = false;
      return;
    }
    if (numerOdmowy === 0) return;
    const pierwszaOdpowiedz = Object.keys(bledy.odpowiedzi).map(Number).sort((a, b) => a - b)[0];
    const cel =
      bledy.body !== undefined
        ? idTresci
        : bledy.answers !== undefined
          ? idPolaOdpowiedzi(prefiks, 0)
          : pierwszaOdpowiedz !== undefined
            ? idPolaOdpowiedzi(prefiks, pierwszaOdpowiedz)
            : null;
    if (cel !== null) document.getElementById(cel)?.focus();
    // Fokus tylko przy nowej odmowie, nie przy każdej zmianie błędów.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numerOdmowy]);

  return (
    <section className={style.formularz} aria-labelledby={idNaglowka}>
      <Heading stopien={3} id={idNaglowka}>
        {tytul}
      </Heading>

      {komunikat !== null && (
        <Notice wariant="error" tytul="Nie udało się zapisać pytania">
          {komunikat}
        </Notice>
      )}

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
                  <span aria-hidden="true">{odpowiedz.is_correct ? "Poprawna" : "Oznacz"}</span>
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
                <div className={style.usunOdpowiedz}>
                  <Button
                    poziom="outline"
                    rozmiar="sm"
                    onClick={() => onZmiana(usunOdpowiedz(szkic, indeks))}
                    disabled={zapisywanie || !moznaUsunac}
                    aria-label={`Usuń odpowiedź ${numer}`}
                    aria-describedby={!moznaUsunac ? idMinimum : zapisywanie ? idZapisu : undefined}
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
        <div>
          <Button
            poziom="outline"
            onClick={() => onZmiana(dodajOdpowiedz(szkic))}
            disabled={zapisywanie}
            aria-describedby={zapisywanie ? idZapisu : undefined}
          >
            Dodaj odpowiedź
          </Button>
        </div>
      </fieldset>

      <div className={style.akcjeFormularza}>
        <Button
          poziom="primary"
          onClick={() => {
            if (!zapisywanie) onZapisz();
          }}
          aria-disabled={zapisywanie ? true : undefined}
          aria-describedby={zapisywanie ? idZapisu : undefined}
        >
          {zapisywanie ? "Zapisywanie…" : "Zapisz pytanie"}
        </Button>
        <Button poziom="quiet" onClick={onAnuluj} disabled={zapisywanie} aria-describedby={zapisywanie ? idZapisu : undefined}>
          Anuluj
        </Button>
      </div>
      {zapisywanie && (
        <p id={idZapisu} role="status" className={style.zdanie}>
          Zapisujemy pytanie. Poczekaj chwilę.
        </p>
      )}
    </section>
  );
}
