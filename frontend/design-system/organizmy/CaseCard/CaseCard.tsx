import { KeyValueRow } from "../../molekuly/KeyValueRow/KeyValueRow";
import { StatTile } from "../../molekuly/StatTile/StatTile";
import { ProgressBar } from "../../atomy/ProgressBar/ProgressBar";
import { Heading } from "../../atomy/Heading/Heading";
import style from "./CaseCard.module.css";

/**
 * Sześć RODZAJÓW to sześć STRUKTURALNYCH wariantów tego, co karta faktycznie
 * składa z `KeyValueRow` + `StatTile` + `ProgressBar` — ta sama zasada co
 * warianty `ListRow` (numer katalogowy M3, prosty/ze-stanem/rozwijalny/material/z-licznikiem):
 * nazwa wariantu opisuje KSZTAŁT składu, nie dziedzinę sprawy (specyfikacja
 * organizmu nie nazywa sześciu dziedzinowych rodzajów spraw —
 * decyzja własna tego pliku, jawna, bo inaczej sześć rodzajów byłoby
 * zgadywane, nie zweryfikowane u źródła).
 *   - "podstawowa": same pary klucz–wartość, bez liczb.
 *   - "ze-statystyka": pary + jeden `StatTile` bez paska.
 *   - "z-postepem": pary + samodzielny `ProgressBar` (bez kafla liczby).
 *   - "pelna": pary + `StatTile` Z paskiem (procent zagnieżdżony w kaflu,
 *     `StatTile.tsx`) + DRUGI, samodzielny `ProgressBar` na inną wielkość —
 *     jedyny wariant z obiema drogami złożenia paska na raz.
 *   - "zamaskowana": pary, z co najmniej jedną `zamaskowana` (PESEL i
 *     podobne) + `StatTile` bez paska.
 *   - "bez-danych": `StatTile` bez `wartosc` (kafel pokazuje „—”, nigdy 0
 *     domyślnie — `StatTile.tsx`) + pary.
 */
export type RodzajCaseCard =
  | "podstawowa"
  | "ze-statystyka"
  | "z-postepem"
  | "pelna"
  | "zamaskowana"
  | "bez-danych";

export interface ParaCaseCard {
  etykieta: string;
  wartosc: string;
  zamaskowana?: boolean;
}

interface StatystykaCaseCard {
  id: string;
  etykieta: string;
  wartosc?: number;
  mianownik: string;
  procent?: number;
  podpowiedz?: string;
}

interface PostepCaseCard {
  procent: number;
  etykieta: string;
  wariant?: "kafel" | "odtwarzacz";
}

interface WlasciwosciCaseCard {
  rodzaj: RodzajCaseCard;
  tytul: string;
  pary: ParaCaseCard[];
  statystyka?: StatystykaCaseCard;
  postep?: PostepCaseCard;
}

/**
 * Karta sprawy `CaseCard` (O5). `KeyValueRow` (M4) na parę + `StatTile`
 * (M10) + `ProgressBar` (A16), złożone WEDŁUG `rodzaj` (patrz typ
 * `RodzajCaseCard` wyżej) — wariant decyduje, KTÓRE z opcjonalnych
 * właściwości (`statystyka`, `postep`) faktycznie wchodzą do renderu,
 * dokładnie jak `ListRow` ignoruje `licznik` poza wariantem
 * `z-licznikiem`.
 */
const RODZAJE_ZE_STATYSTYKA: RodzajCaseCard[] = ["ze-statystyka", "pelna", "zamaskowana", "bez-danych"];
const RODZAJE_Z_POSTEPEM: RodzajCaseCard[] = ["z-postepem", "pelna"];

export function CaseCard({ rodzaj, tytul, pary, statystyka, postep }: WlasciwosciCaseCard) {
  return (
    <article className={style.karta} data-rodzaj={rodzaj} aria-label={tytul}>
      <Heading stopien={3}>{tytul}</Heading>

      <div className={style.pary}>
        {pary.map((para) => (
          <KeyValueRow key={para.etykieta} etykieta={para.etykieta} wartosc={para.wartosc} zamaskowana={para.zamaskowana} />
        ))}
      </div>

      {statystyka && RODZAJE_ZE_STATYSTYKA.includes(rodzaj) && (
        <StatTile
          id={statystyka.id}
          etykieta={statystyka.etykieta}
          wartosc={rodzaj === "bez-danych" ? undefined : statystyka.wartosc}
          mianownik={statystyka.mianownik}
          procent={rodzaj === "pelna" ? statystyka.procent : undefined}
          podpowiedz={statystyka.podpowiedz}
        />
      )}

      {postep && RODZAJE_Z_POSTEPEM.includes(rodzaj) && (
        <ProgressBar procent={postep.procent} etykieta={postep.etykieta} wariant={postep.wariant} />
      )}
    </article>
  );
}
