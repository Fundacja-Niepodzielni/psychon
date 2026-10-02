"use client";

import { useEffect, useState } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Field } from "@/design-system/molekuly/Field/Field";
import { pobierzPytania, wyslijPytanie, type OdmowaKolejnosci, type PytanieLekcji } from "./dane";
import { kiedyTemu } from "./kiedy";
import style from "./Lekcja.module.css";

/** Zdanie przy nieczynnym formularzu i przycisku ukończenia w trybie podglądu. */
export const ZDANIE_PODGLADU = "W podglądzie nic się nie zapisuje";

/** Identyfikator pola pytania: do niego prowadzi „Napisz do prowadzącego”. */
export const ID_POLA_PYTANIA = "pytanie-do-prowadzacego";
/** Identyfikator karty: cel przewinięcia z „Napisz do prowadzącego”. */
export const ID_KARTY_PYTAN = "karta-pytan";

interface WlasciwosciPytaniaLekcji {
  idLekcji: string;
  /** Nazwisko adresata pytania; `null` — karta bez nazwiska, formularz zostaje. */
  adresat: string | null;
  /** Odmowa `lesson_locked` przy odczycie albo wysłaniu pytania: ekran przechodzi w stan lekcji zamkniętej. */
  naOdmoweKolejnosci?: (odmowa: OdmowaKolejnosci) => void;
  /** Tryb podglądu: formularz nieczynny z wyglądu, ze zdaniem „W podglądzie nic się nie zapisuje”. */
  podglad?: boolean;
  /** Nic nie jest wysyłane (podgląd albo rola jeszcze nierozstrzygnięta przy parametrze podglądu). */
  zapisWstrzymany?: boolean;
}

/**
 * Karta „Zapytaj prowadzącego”: formularz pytania i pod nim własne pytania osoby z
 * odpowiedziami (`GET`/`POST /lessons/{id}/questions`). Nieudany odczyt listy nie
 * psuje karty — formularz działa, lista się po prostu nie pokazuje.
 */
export function PytaniaLekcji({ idLekcji, adresat, naOdmoweKolejnosci, podglad = false, zapisWstrzymany = false }: WlasciwosciPytaniaLekcji) {
  const [pytania, setPytania] = useState<PytanieLekcji[]>([]);
  const [tresc, setTresc] = useState("");
  const [blad, setBlad] = useState<string | null>(null);
  const [wysylanie, setWysylanie] = useState(false);
  const [potwierdzenie, setPotwierdzenie] = useState(false);

  useEffect(() => {
    let anulowane = false;
    void pobierzPytania(idLekcji).then((lista) => {
      if (anulowane || lista === null) return;
      if (Array.isArray(lista)) setPytania(lista);
      else naOdmoweKolejnosci?.(lista);
    });
    return () => {
      anulowane = true;
    };
  }, [idLekcji, naOdmoweKolejnosci]);

  async function wyslij() {
    if (wysylanie || zapisWstrzymany) return;
    setPotwierdzenie(false);
    if (tresc.trim() === "") {
      setBlad("Wpisz pytanie, zanim je wyślesz.");
      document.getElementById(ID_POLA_PYTANIA)?.focus();
      return;
    }
    setBlad(null);
    setWysylanie(true);
    const wynik = await wyslijPytanie(idLekcji, tresc.trim());
    setWysylanie(false);
    if (wynik.status === "zamknieta") {
      naOdmoweKolejnosci?.(wynik.odmowa);
      return;
    }
    if (wynik.status === "blad") {
      setBlad(wynik.komunikat);
      return;
    }
    setPytania((poprzednie) => [wynik.pytanie, ...poprzednie.filter((p) => p.id !== wynik.pytanie.id)]);
    setTresc("");
    setPotwierdzenie(true);
  }

  return (
    <section id={ID_KARTY_PYTAN} className={style.karta} aria-labelledby="naglowek-pytan">
      <Heading stopien={2} id="naglowek-pytan">
        Zapytaj prowadzącego
      </Heading>
      <p className={style.wstep}>
        {adresat ? `Odpowiada ${adresat}. ` : ""}Pytanie widzisz tylko Ty i prowadzący.
      </p>
      <div role={podglad ? "group" : undefined} aria-label={podglad ? "Formularz pytania" : undefined} aria-disabled={podglad || undefined} data-nieczynny={podglad ? "true" : undefined}>
        <Field
          id={ID_POLA_PYTANIA}
          etykieta="Twoje pytanie"
          rodzaj="wieloliniowy"
          wartosc={tresc}
          blad={blad ?? undefined}
          podpowiedz={podglad ? ZDANIE_PODGLADU : undefined}
          onZmiana={(wartosc) => {
            setTresc(wartosc);
            if (blad !== null && wartosc.trim() !== "") setBlad(null);
          }}
        />
      </div>
      <div className={style.wyslij}>
        <Button
          poziom="outline"
          onClick={() => void wyslij()}
          aria-disabled={wysylanie || podglad || undefined}
          aria-describedby={podglad ? `${ID_POLA_PYTANIA}-podpowiedz` : undefined}
        >
          Wyślij pytanie
        </Button>
        <div role="status" className={style.potwierdzenie}>
          {potwierdzenie ? "Pytanie wysłane." : ""}
        </div>
      </div>

      {pytania.length > 0 && (
        <div className={style.pytania}>
          <Heading stopien={3}>Twoje pytania i odpowiedzi</Heading>
          <ul className={style.listaPytan}>
            {pytania.map((pytanie) => {
              const odpowiedziano = pytanie.answer !== null;
              const kiedy = kiedyTemu(odpowiedziano ? pytanie.answered_at : pytanie.created_at);
              return (
                <li key={pytanie.id} className={style.pytanie}>
                  <b>{pytanie.question}</b>
                  <div className={style.odpowiedz}>
                    <small>
                      {odpowiedziano
                        ? [pytanie.answered_by_name, kiedy].filter(Boolean).join(", ")
                        : `wysłane ${kiedy ?? ""}`.trim()}
                    </small>
                    {odpowiedziano ? pytanie.answer : "Czeka na odpowiedź prowadzącego."}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
