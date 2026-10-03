"use client";

import { useRef } from "react";
import { Badge } from "@/design-system/atomy/Badge/Badge";
import { Button } from "@/design-system/atomy/Button/Button";
import { StrzalkiKolejnosci } from "@/design-system/molekuly/StrzalkiKolejnosci/StrzalkiKolejnosci";
import { useRuchWierszy } from "@/design-system/molekuly/StrzalkiKolejnosci/ruch";
import type { PytanieTestu } from "./dane";
import { DLUGOSC_NAZWY_WIERSZA, opisPytania, skrot } from "./logika";
import style from "./PytaniaTestu.module.css";

/** Identyfikator nagłówka wiersza pytania — cel fokusu po zapisie. */
export function idWiersza(idPytania: number): string {
  return `pytanie-testu-${idPytania}`;
}

interface WlasciwosciListyPytan {
  pytania: readonly PytanieTestu[];
  /** Trwa zapis kolejności albo usuwanie: strzałki i przyciski wierszy czekają. */
  zajete: boolean;
  /** `id` zdania, które mówi, dlaczego przyciski czekają. */
  powod?: string;
  /** Pytanie, które właśnie jest usuwane (napis „Usuwanie…” na jego przycisku). */
  usuwane: number | null;
  onEdytuj: (pytanie: PytanieTestu) => void;
  onUsun: (pytanie: PytanieTestu) => void;
  onPrzesun: (idPytania: number, kierunek: -1 | 1) => void;
}

/**
 * Lista pytań testu. Numer pytania na ekranie to jego miejsce na liście
 * (1, 2, 3 — bez luk); numer z serwera jest wewnętrzny. Wiersz: po lewej
 * strzałki kolejności z numerem między nimi (jak lekcje na ekranie kursu),
 * w środku pełna treść, rodzaj, liczba odpowiedzi i wszystkie odpowiedzi
 * z oznaczoną poprawną, po prawej „Edytuj” i „Usuń” (drugorzędne).
 * Płynny ruch wiersza i fokus na tej samej strzałce daje pomocnik molekuły.
 */
export function ListaPytan({ pytania, zajete, powod, usuwane, onEdytuj, onUsun, onPrzesun }: WlasciwosciListyPytan) {
  const korzen = useRef<HTMLOListElement>(null);
  useRuchWierszy(korzen);

  return (
    <ol ref={korzen} className={style.lista}>
      {pytania.map((pytanie, indeks) => {
        const numer = indeks + 1;
        const nazwa = skrot(pytanie.body, DLUGOSC_NAZWY_WIERSZA);
        return (
          <li key={pytanie.id} className={style.wiersz} data-ruch-klucz={`pytanie-${pytanie.id}`}>
            <span className={style.ruch}>
              <StrzalkiKolejnosci
                tytul={nazwa}
                mozeWyzej={!zajete && indeks > 0}
                mozeNizej={!zajete && indeks < pytania.length - 1}
                onWyzej={() => onPrzesun(pytanie.id, -1)}
                onNizej={() => onPrzesun(pytanie.id, 1)}
                numer={numer}
              />
            </span>
            <div className={style.opis}>
              <h3 id={idWiersza(pytanie.id)} tabIndex={-1} className={style.tytulWiersza}>
                {`Pytanie ${numer}`}
              </h3>
              <p className={style.tresc}>{pytanie.body}</p>
              <p className={style.meta}>{opisPytania(pytanie)}</p>
              <ul className={style.odpowiedziWiersza} aria-label={`Odpowiedzi do pytania ${numer}`}>
                {pytanie.answers.map((odpowiedz) => (
                  <li key={odpowiedz.id} className={odpowiedz.is_correct ? `${style.odpowiedzWiersza} ${style.odpowiedzPoprawna}` : style.odpowiedzWiersza}>
                    {odpowiedz.is_correct && <Badge wariant="ok">Poprawna</Badge>}
                    <span>{odpowiedz.body}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className={style.akcje}>
              <Button
                poziom="outline"
                rozmiar="sm"
                onClick={() => onEdytuj(pytanie)}
                disabled={zajete}
                aria-label={`Edytuj pytanie ${numer}`}
                aria-describedby={zajete ? powod : undefined}
              >
                Edytuj
              </Button>
              <Button
                poziom="outline"
                rozmiar="sm"
                niebezpieczny
                onClick={() => onUsun(pytanie)}
                disabled={zajete}
                aria-label={`Usuń pytanie ${numer}`}
                aria-describedby={zajete ? powod : undefined}
              >
                {usuwane === pytanie.id ? "Usuwanie…" : "Usuń"}
              </Button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
