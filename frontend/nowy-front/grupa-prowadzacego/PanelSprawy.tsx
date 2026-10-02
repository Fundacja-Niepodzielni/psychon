"use client";

import { useId, type FormEvent } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Field } from "@/design-system/molekuly/Field/Field";
import { LIMIT_OPISU, LIMIT_TEMATU, type FormularzSprawy, type GroupMember } from "./dane";
import { useFokusNaNaglowku } from "./fokus";
import { Komunikat } from "./Komunikat";
import { bladPola, licznikZnakow, pelneImie, powodBrakuSprawy } from "./logika";
import style from "./GrupaProwadzacego.module.css";

interface WlasciwosciPanelSprawy {
  formularz: FormularzSprawy;
  osoby: GroupMember[];
  onZmiana: (zmiana: Partial<FormularzSprawy>) => void;
  bledy: Record<string, string[]> | undefined;
  blad: string | null;
  zglasza: boolean;
  onZglos: () => void;
  onWroc: () => void;
}

const POLA: Array<{ klucz: string; etykieta: string }> = [
  { klucz: "volunteer_id", etykieta: "Dotyczy osoby" },
  { klucz: "subject", etykieta: "Temat" },
  { klucz: "body", etykieta: "Opis sprawy" },
];

/**
 * Panel „Zgłoszenie sprawy do administracji”: otwiera się w miejscu listy po „Zgłoś sprawę” z nagłówka,
 * fokus idzie na jego nagłówek. Jedyny przycisk główny panelu to „Zgłoś sprawę” — niedostępny z powodem,
 * dopóki brakuje tematu albo opisu. Limity znaków (temat 255, opis 5000) pokazuje licznik pod polem.
 */
export function PanelSprawy({ formularz, osoby, onZmiana, bledy, blad, zglasza, onZglos, onWroc }: WlasciwosciPanelSprawy) {
  const idNaglowka = useId();
  const idPowodu = useId();
  useFokusNaNaglowku(idNaglowka);
  const powod = powodBrakuSprawy(formularz);
  const bledneEtykiety = POLA.filter(({ klucz }) => bladPola(bledy, klucz) !== undefined).map(({ etykieta }) => etykieta);

  function wyslij(zdarzenie: FormEvent<HTMLFormElement>) {
    zdarzenie.preventDefault();
    if (powod === null && !zglasza) onZglos();
  }

  return (
    <form className={style.karta} aria-labelledby={idNaglowka} noValidate onSubmit={wyslij}>
      <Heading stopien={2} id={idNaglowka}>
        Zgłoszenie sprawy do administracji
      </Heading>
      {blad !== null && (
        <Komunikat wariant="error" tytul="Nie udało się zgłosić sprawy" stopien={3}>
          {bledneEtykiety.length > 0 && blad === "Popraw zaznaczone pola." ? `${blad.slice(0, -1)}: ${bledneEtykiety.join(", ")}.` : blad}
        </Komunikat>
      )}
      <div className={style.pola}>
        <Field
          id="grupa-sprawa-osoba"
          etykieta="Dotyczy osoby (opcjonalnie)"
          rodzaj="wybor"
          wartosc={formularz.osoba}
          opcje={[
            { wartosc: "", etykieta: "Sprawa ogólna — bez wskazania osoby" },
            ...osoby.map((osoba) => ({ wartosc: String(osoba.id), etykieta: pelneImie(osoba) })),
          ]}
          onZmiana={(osoba) => onZmiana({ osoba })}
          blad={bladPola(bledy, "volunteer_id")}
        />
        <Field
          id="grupa-sprawa-temat"
          etykieta="Temat"
          rodzaj="tekst"
          wymagane
          wartosc={formularz.temat}
          onZmiana={(temat) => onZmiana({ temat: temat.slice(0, LIMIT_TEMATU) })}
          podpowiedz={licznikZnakow(formularz.temat, LIMIT_TEMATU)}
          blad={bladPola(bledy, "subject")}
        />
        <Field
          id="grupa-sprawa-opis"
          etykieta="Opis sprawy"
          rodzaj="wieloliniowy"
          wymagane
          wartosc={formularz.opis}
          onZmiana={(opis) => onZmiana({ opis: opis.slice(0, LIMIT_OPISU) })}
          podpowiedz={licznikZnakow(formularz.opis, LIMIT_OPISU)}
          blad={bladPola(bledy, "body")}
        />
      </div>
      <div className={style.akcje}>
        <Button
          poziom="primary"
          type="submit"
          aria-disabled={powod !== null ? true : undefined}
          aria-describedby={powod !== null ? idPowodu : undefined}
        >
          {zglasza ? "Zgłaszanie…" : "Zgłoś sprawę"}
        </Button>
        <Button poziom="outline" type="button" onClick={onWroc}>
          Wróć do grupy
        </Button>
      </div>
      {powod !== null && <Hint id={idPowodu}>{powod}</Hint>}
    </form>
  );
}
