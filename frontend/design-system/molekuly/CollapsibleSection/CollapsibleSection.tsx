"use client";

import { useId, useState, type ReactNode } from "react";
import style from "./CollapsibleSection.module.css";

interface WlasciwosciCollapsibleSection {
  /** Nazwa mówi, co jest w środku. */
  tytul: string;
  /** Ile jest tego w środku. */
  liczba: number;
  dzieci: ReactNode;
  domyslnieRozwinieta?: boolean;
}

/**
 * Sekcja zwijana `CollapsibleSection` (M16). Nagłówek z liczbą + treść.
 * Najwyżej JEDEN poziom (ZU-11) — ta molekuła nie zagnieżdża się w sobie;
 * to reguła składu, egzekwowana przeglądem miejsc użycia, nie w czasie
 * działania.
 *
 * Strzałka to nie `Icon` (A12 ma zamkniętą mapę 13 glifów bez chevronu) i nie
 * odrębny atom — trójkąt narysowany obramowaniem, obracany 0,15 s, dokładnie
 * jak ostatnia pozycja okruszków `Breadcrumbs` rysuje "›" bez sięgania po
 * `Icon`.
 */
export function CollapsibleSection({
  tytul,
  liczba,
  dzieci,
  domyslnieRozwinieta = false,
}: WlasciwosciCollapsibleSection) {
  const [rozwinieta, setRozwinieta] = useState(domyslnieRozwinieta);
  const idTresci = useId();

  return (
    <div className={style.sekcja}>
      <button
        type="button"
        className={style.naglowek}
        aria-expanded={rozwinieta}
        aria-controls={idTresci}
        onClick={() => setRozwinieta((poprzednio) => !poprzednio)}
      >
        <span aria-hidden="true" className={rozwinieta ? `${style.strzalka} ${style.rozwinieta}` : style.strzalka} />
        {tytul} ({liczba})
      </button>
      {rozwinieta && (
        <div id={idTresci} className={style.tresc}>
          {dzieci}
        </div>
      )}
    </div>
  );
}
