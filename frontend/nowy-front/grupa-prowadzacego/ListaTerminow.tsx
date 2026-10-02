"use client";

import { useId } from "react";
import { Badge } from "@/design-system/atomy/Badge/Badge";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Text } from "@/design-system/atomy/Text/Text";
import { Field } from "@/design-system/molekuly/Field/Field";
import type { Attendance, InstructorSlot } from "./dane";
import {
  ETYKIETY_OBECNOSCI,
  obecnoscOsoby,
  opisTerminu,
  pelneImie,
  tytulTerminu,
  zdanieOObecnosci,
  zdanieOWolnychMiejscach,
} from "./logika";
import style from "./GrupaProwadzacego.module.css";

interface WlasciwosciListyTerminow {
  terminy: InstructorSlot[];
  /** Obecności wybrane teraz i jeszcze niezapisane: termin → osoba → obecność. */
  wybrane: Record<number, Record<number, Attendance>>;
  zapisywanyTermin: number | null;
  onWybierz: (idTerminu: number, idOsoby: number, wartosc: Attendance) => void;
  onZapisz: (termin: InstructorSlot) => void;
}

const OPCJE_OBECNOSCI = [
  { wartosc: "", etykieta: "Wybierz" },
  { wartosc: "present", etykieta: ETYKIETY_OBECNOSCI.present },
  { wartosc: "absent", etykieta: ETYKIETY_OBECNOSCI.absent },
];

/**
 * Lista terminów superwizji z zapisanymi osobami. Obecność oznacza się osobno przy każdej osobie, a
 * zapisuje jednym przyciskiem przy terminie. Przed końcem terminu listy wyboru i przycisk są
 * nieaktywne, a zdanie „Obecność oznaczysz po zakończeniu terminu.” mówi, dlaczego.
 */
export function ListaTerminow({ terminy, wybrane, zapisywanyTermin, onWybierz, onZapisz }: WlasciwosciListyTerminow) {
  return (
    <ul className={style.wiersze}>
      {terminy.map((termin) => (
        <li key={termin.id}>
          <Termin termin={termin} wybrane={wybrane} zapisuje={zapisywanyTermin === termin.id} onWybierz={onWybierz} onZapisz={onZapisz} />
        </li>
      ))}
    </ul>
  );
}

function Termin({
  termin,
  wybrane,
  zapisuje,
  onWybierz,
  onZapisz,
}: {
  termin: InstructorSlot;
  wybrane: Record<number, Record<number, Attendance>>;
  zapisuje: boolean;
  onWybierz: (idTerminu: number, idOsoby: number, wartosc: Attendance) => void;
  onZapisz: (termin: InstructorSlot) => void;
}) {
  const idPowodu = useId();
  const tytul = tytulTerminu(termin);
  return (
    <article className={style.karta}>
      <div className={style.pasekTerminu}>
        <div className={style.sekcja}>
          <Heading stopien={3}>{tytul}</Heading>
          <Hint>{opisTerminu(termin)}</Hint>
        </div>
        <Badge wariant={termin.available_seats === 0 ? "error" : "neutral"}>{zdanieOWolnychMiejscach(termin.available_seats)}</Badge>
      </div>

      {termin.signups.length === 0 ? (
        <Text>Nikt nie zapisał się na ten termin.</Text>
      ) : (
        <>
          {!termin.can_mark_attendance && <Hint id={idPowodu}>Obecność oznaczysz po zakończeniu terminu.</Hint>}
          <ul className={style.wiersze}>
            {termin.signups.map((zapis) => {
              const wartosc = obecnoscOsoby(termin, zapis.user.id, wybrane);
              return (
                <li key={zapis.user.id} className={style.zapis}>
                  <Text>{pelneImie(zapis.user)}</Text>
                  <Hint>{zdanieOObecnosci(wartosc)}</Hint>
                  <Field
                    id={`grupa-obecnosc-${termin.id}-${zapis.user.id}`}
                    etykieta={`Obecność: ${pelneImie(zapis.user)}`}
                    rodzaj="wybor"
                    wartosc={wartosc ?? ""}
                    opcje={OPCJE_OBECNOSCI}
                    zablokowany={!termin.can_mark_attendance}
                    onZmiana={(nowa) => {
                      if (nowa === "present" || nowa === "absent") onWybierz(termin.id, zapis.user.id, nowa);
                    }}
                  />
                </li>
              );
            })}
          </ul>
          <div className={style.akcje}>
            <Button
              poziom="outline"
              disabled={!termin.can_mark_attendance}
              aria-describedby={!termin.can_mark_attendance ? idPowodu : undefined}
              aria-label={`${zapisuje ? "Zapisywanie obecności" : "Zapisz obecności"}: ${tytul}`}
              onClick={() => onZapisz(termin)}
            >
              {zapisuje ? "Zapisywanie…" : "Zapisz obecności"}
            </Button>
          </div>
        </>
      )}
    </article>
  );
}
