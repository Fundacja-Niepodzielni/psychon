import { useRef, type ReactNode } from "react";
import { Icon, type NazwaIkony } from "../../atomy/Icon/Icon";
import { Heading } from "../../atomy/Heading/Heading";
import { Text } from "../../atomy/Text/Text";
import style from "./Notice.module.css";

export type WariantNotice = "ok" | "warn" | "error" | "info";

interface WlasciwosciNotice {
  wariant: WariantNotice;
  tytul: string;
  children: ReactNode;
  /** Miejsce na `Button` — akcja „co można zrobić" (Odbiór M11). */
  akcja?: ReactNode;
}

// BRAK ATOMU ZGŁOSZONY (nie dorobiony po cichu): Icon (A12) ma 13 glifów
// (home, book, clock, users, file, award, chat, inbox, chart, cog, help,
// user, out) — żaden nie jest dedykowanym checkmarkiem/trójkątem
// ostrzeżenia/krzyżykiem błędu/„i" informacji. Do czasu dodania takich
// glifów do Icon.tsx (warstwa 2, poza zakresem tej zmiany) `ok` i
// `warn`/`error`/`info` dzielą dwa najbliższe znaczeniowo istniejące glify;
// brak atomu jest tu nazwany wprost, nie zmierzony.
const IKONA_WARIANTU: Record<WariantNotice, NazwaIkony> = {
  ok: "award",
  warn: "help",
  error: "help",
  info: "help",
};

/**
 * Komunikat `Notice` (M11). Cztery warianty: `ok` · `warn` · `error` · `info`.
 * Tekst jest ZAWSZE `--ink`, barwa nigdy nie niesie sama stanu — stan nazywa
 * `Heading`/`Text` po polsku. Wyłącznie `error` dostaje `role="alert"`
 * (przerywa czytnik natychmiast); wszystkie warianty przyjmują fokus
 * programowy, żeby podsumowanie błędu mogło przenieść fokus na ten komunikat.
 *
 * Wariant `info`: zdefiniowany w tym pliku i w POZYCJE_MOLEKULY_B (patrz
 * design-system/poligon/pozycje-molekuly-b.mjs), ale NIEUŻYWANY — żaden
 * ekran dziś go nie potrzebuje (specyfikacja, sekcja
 * „Mianownik, który może wynosić zero"). Nie usuwam go (spec §3 M11 go
 * nazywa) i nie udaję, że jest sprawdzony — pomiar w
 * pomiar-wystapien-molekul-b.mjs kończy się dla niego kodem 2 (NIE
 * ZMIERZONO), nigdy zielenią.
 */
export function Notice({ wariant, tytul, children, akcja }: WlasciwosciNotice) {
  const wezel = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={wezel}
      className={`${style.komunikat} ${style[wariant]}`}
      role={wariant === "error" ? "alert" : undefined}
      tabIndex={-1}
    >
      <Icon nazwa={IKONA_WARIANTU[wariant]} />
      <div className={style.tresc}>
        <Heading stopien={3}>{tytul}</Heading>
        <Text>{children}</Text>
        {akcja && <div className={style.akcja}>{akcja}</div>}
      </div>
    </div>
  );
}
