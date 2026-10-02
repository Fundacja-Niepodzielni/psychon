import { Link } from "@/design-system/atomy/Link/Link";
import type { WierszZestawienia } from "./logika";
import style from "./RaportRokuProgramu.module.css";

const KOLUMNY = [
  { klucz: "rola", etykieta: "Rola" },
  { klucz: "kursy", etykieta: "Kursy" },
  { klucz: "staz", etykieta: "Staż" },
  { klucz: "superwizje", etykieta: "Superwizje" },
  { klucz: "warsztat", etykieta: "Warsztat" },
] as const;

interface WlasciwosciZestawienia {
  tytul: string;
  wiersze: WierszZestawienia[];
}

/**
 * Zestawienie imienne w samym raporcie: imię i nazwisko jest nagłówkiem
 * wiersza, dalej rola, kursy, staż, superwizje, warsztat i „Otwórz kartę”
 * (z nazwą osoby dla czytnika). Własna siatka z rolami tabeli — ten sam wzór
 * co `DataTable` — bo poniżej 640 px wiersz zmienia się w blok z nazwą jako
 * tytułem i parami „etykieta: wartość”, bez przewijania w poziomie.
 */
export function Zestawienie({ tytul, wiersze }: WlasciwosciZestawienia) {
  return (
    <div className={style.zestawienie} role="table" aria-label={tytul}>
      <div className={style.wierszNaglowka} role="row">
        <div role="columnheader" className={style.komorka}>
          Osoba
        </div>
        {KOLUMNY.map((kolumna) => (
          <div key={kolumna.klucz} role="columnheader" className={style.komorka}>
            {kolumna.etykieta}
          </div>
        ))}
        <div role="columnheader" className={style.komorka}>
          Karta osoby
        </div>
      </div>
      {wiersze.map((wiersz) => (
        <div key={wiersz.id} role="row" className={style.wierszZestawienia}>
          <div role="rowheader" className={`${style.komorka} ${style.nazwa}`}>
            {wiersz.nazwa}
          </div>
          {KOLUMNY.map((kolumna) => (
            <div key={kolumna.klucz} role="cell" className={style.komorka} data-etykieta={kolumna.etykieta}>
              {wiersz[kolumna.klucz]}
            </div>
          ))}
          <div role="cell" className={`${style.komorka} ${style.akcja}`}>
            <Link href={wiersz.href}>
              Otwórz kartę<span className={style.dlaCzytnika}> osoby: {wiersz.nazwa}</span>
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
