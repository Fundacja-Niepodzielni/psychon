"use client";

import { useId, useState, type ReactNode } from "react";
import { Heading } from "../../atomy/Heading/Heading";
import { Hint } from "../../atomy/Hint/Hint";
import style from "./KartaBoczna.module.css";

interface WlasciwosciKartaBoczna {
  /** Nagłówek karty (stopień 2). */
  tytul: string;
  /** Jedno zdanie pod nagłówkiem. Tylko w karcie niezwijanej. */
  opis?: string;
  /**
   * `id` karty — cel odnośników prowadzących do niej z innego miejsca ekranu.
   * Nagłówek karty dostaje wtedy `id` równe `<kotwica>-tytul` i przyjmuje
   * fokus programowy (`document.getElementById(...).focus()`).
   */
  kotwica?: string;
  /** Odmiana zwijana: nagłówek jest przyciskiem ze stanem rozwinięcia. */
  zwijana?: boolean;
  /** Stan początkowy odmiany zwijanej. Domyślnie zwinięta. */
  domyslnieRozwinieta?: boolean;
  /** Nagłówek w barwie ostrzeżenia — karta działań nieodwracalnych. */
  niebezpieczna?: boolean;
  /** Treść bez wewnętrznego odstępu — dla list wierszy sięgających krawędzi karty. */
  bezOdstepu?: boolean;
  children: ReactNode;
}

/**
 * Karta układu edycji `KartaBoczna`: ramka, nagłówek i treść. Nazwa od prawej
 * kolumny `UkladEdycji`, ale ta sama karta służy kolumnie głównej.
 *
 * Odmiana zwijana: cały nagłówek jest przyciskiem (`aria-expanded`,
 * `aria-controls`), domyślnie zwinięta; treść zwiniętej karty nie istnieje w
 * DOM, więc fokus jej nie odwiedza. Strzałka jest rysowana obramowaniem, jak
 * w `CollapsibleSection` (zamknięta mapa glifów `Icon` nie ma strzałki).
 */
export function KartaBoczna({
  tytul,
  opis,
  kotwica,
  zwijana = false,
  domyslnieRozwinieta = false,
  niebezpieczna = false,
  bezOdstepu = false,
  children,
}: WlasciwosciKartaBoczna) {
  const [rozwinieta, setRozwinieta] = useState(domyslnieRozwinieta);
  const idWlasne = useId();
  const idTytulu = kotwica ? `${kotwica}-tytul` : `${idWlasne}-tytul`;
  const idTresci = `${idWlasne}-tresc`;
  const widacTresc = !zwijana || rozwinieta;
  const klasyKarty = [style.karta, niebezpieczna ? style.niebezpieczna : ""].filter(Boolean).join(" ");
  const klasyNaglowka = [style.naglowek, zwijana ? style.naglowekZwijany : "", widacTresc ? style.zLinia : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <section id={kotwica} className={klasyKarty} aria-labelledby={idTytulu} data-karta={zwijana ? "zwijana" : "stala"}>
      <div className={klasyNaglowka}>
        <Heading stopien={2} id={idTytulu}>
          {zwijana ? (
            <button
              type="button"
              className={style.przelacznik}
              aria-expanded={rozwinieta}
              aria-controls={idTresci}
              onClick={() => setRozwinieta((poprzednio) => !poprzednio)}
            >
              <span>{tytul}</span>
              <span
                aria-hidden="true"
                className={rozwinieta ? `${style.strzalka} ${style.strzalkaRozwinieta}` : style.strzalka}
              />
            </button>
          ) : (
            tytul
          )}
        </Heading>
        {opis && !zwijana && <Hint>{opis}</Hint>}
      </div>
      {widacTresc && (
        <div id={idTresci} className={bezOdstepu ? style.tresc : `${style.tresc} ${style.zOdstepem}`}>
          {children}
        </div>
      )}
    </section>
  );
}
