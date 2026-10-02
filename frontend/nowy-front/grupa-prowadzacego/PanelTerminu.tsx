"use client";

import { useId, type FormEvent } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Field } from "@/design-system/molekuly/Field/Field";
import type { FormularzTerminu } from "./dane";
import { useFokusNaNaglowku } from "./fokus";
import { Komunikat } from "./Komunikat";
import { bladPola, powodBrakuTerminu } from "./logika";
import { PoleDatyICzasu } from "./PoleDatyICzasu";
import style from "./GrupaProwadzacego.module.css";

interface WlasciwosciPanelTerminu {
  formularz: FormularzTerminu;
  onZmiana: (zmiana: Partial<FormularzTerminu>) => void;
  /** Błędy pól z odpowiedzi serwera (422). */
  bledy: Record<string, string[]> | undefined;
  /** Zdanie błędu nad formularzem. */
  blad: string | null;
  zapisuje: boolean;
  onZapisz: () => void;
  onWroc: () => void;
}

/** Etykiety pól do zdania „Popraw zaznaczone pola: …”. */
const POLA: Array<{ klucz: string; etykieta: string }> = [
  { klucz: "starts_at", etykieta: "Data i godzina" },
  { klucz: "duration_minutes", etykieta: "Czas trwania" },
  { klucz: "seats_limit", etykieta: "Limit miejsc" },
  { klucz: "location_or_link", etykieta: "Miejsce lub link" },
];

/**
 * Panel „Nowy termin”: otwiera się w miejscu listy po „Utwórz termin” z nagłówka, a fokus idzie na jego
 * nagłówek. Jedyny przycisk główny panelu to „Utwórz termin” — niedostępny z powodem (`aria-disabled` i
 * zdanie pod przyciskiem), dopóki nie podano prawidłowej daty i godziny.
 */
export function PanelTerminu({ formularz, onZmiana, bledy, blad, zapisuje, onZapisz, onWroc }: WlasciwosciPanelTerminu) {
  const idNaglowka = useId();
  const idPowodu = useId();
  useFokusNaNaglowku(idNaglowka);
  const powod = powodBrakuTerminu(formularz);
  const bledneEtykiety = POLA.filter(({ klucz }) => bladPola(bledy, klucz) !== undefined).map(({ etykieta }) => etykieta);

  function wyslij(zdarzenie: FormEvent<HTMLFormElement>) {
    zdarzenie.preventDefault();
    if (powod === null && !zapisuje) onZapisz();
  }

  return (
    <form className={style.karta} aria-labelledby={idNaglowka} noValidate onSubmit={wyslij}>
      <Heading stopien={2} id={idNaglowka}>
        Nowy termin superwizji
      </Heading>
      {blad !== null && (
        <Komunikat wariant="error" tytul="Nie udało się utworzyć terminu" stopien={3}>
          {bledneEtykiety.length > 0 && blad === "Popraw zaznaczone pola." ? `${blad.slice(0, -1)}: ${bledneEtykiety.join(", ")}.` : blad}
        </Komunikat>
      )}
      <div className={style.pola}>
        <PoleDatyICzasu
          id="grupa-termin-start"
          etykieta="Data i godzina"
          wartosc={formularz.start}
          onZmiana={(start) => onZmiana({ start })}
          podpowiedz="Czas lokalny Twojej przeglądarki."
          blad={bladPola(bledy, "starts_at")}
        />
        <div className={style.polaWiersz}>
          <Field
            id="grupa-termin-czas"
            etykieta="Czas trwania (minuty)"
            rodzaj="liczba"
            wymagane
            wartosc={formularz.czas}
            onZmiana={(czas) => onZmiana({ czas })}
            podpowiedz="Od 1 do 65535 minut."
            blad={bladPola(bledy, "duration_minutes")}
          />
          <Field
            id="grupa-termin-miejsca"
            etykieta="Limit miejsc"
            rodzaj="liczba"
            wymagane
            wartosc={formularz.miejsca}
            onZmiana={(miejsca) => onZmiana({ miejsca })}
            podpowiedz="Od 1 do 255 miejsc."
            blad={bladPola(bledy, "seats_limit")}
          />
        </div>
        <Field
          id="grupa-termin-miejsce"
          etykieta="Miejsce lub link"
          rodzaj="tekst"
          wartosc={formularz.miejsce}
          onZmiana={(miejsce) => onZmiana({ miejsce })}
          podpowiedz="Możesz zostawić puste."
          blad={bladPola(bledy, "location_or_link")}
        />
      </div>
      <div className={style.akcje}>
        <Button
          poziom="primary"
          type="submit"
          aria-disabled={powod !== null ? true : undefined}
          aria-describedby={powod !== null ? idPowodu : undefined}
        >
          {zapisuje ? "Tworzenie…" : "Utwórz termin"}
        </Button>
        <Button poziom="outline" type="button" onClick={onWroc}>
          Wróć do grupy
        </Button>
      </div>
      {powod !== null && <Hint id={idPowodu}>{powod}</Hint>}
    </form>
  );
}
