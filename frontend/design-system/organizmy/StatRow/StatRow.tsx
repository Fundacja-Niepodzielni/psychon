import { Link } from "../../atomy/Link/Link";
import { StatTile } from "../../molekuly/StatTile/StatTile";
import style from "./StatRow.module.css";

interface KafelStatRow {
  id: string;
  etykieta: string;
  wartosc?: number;
  mianownik: string;
  procent?: number;
  podpowiedz?: string;
  dominujacy?: boolean;
  /** Gdy podane, cały kafel staje się odnośnikiem (`Link`, A2) do sekcji
   * źródeł tej liczby — wariant "każdy kafel jest odnośnikiem"
   * (KARTA-EKRANU-T3-ZRODLA-LICZB-OSOBY, D-106: "karta linkuje z każdej
   * liczby"). Bez `href` kafel renderuje się jak zwykły `StatTile`. */
  href?: string;
  /** Układ pulpitu (makieta „Pulpit”): pasek niesie etykietę wyłącznie jako
   * nazwę dostępną (`aria-label`), bez drugiego widocznego napisu obok —
   * etykieta stoi raz, przy liczbie. Domyślnie wyłączone. */
  ukladPulpitu?: boolean;
}

interface WlasciwosciStatRow {
  kafle: KafelStatRow[];
}

/**
 * Rząd liczb `StatRow` (O10). Skład wprost ze specyfikacji: rząd `StatTile`
 * (molekuła, M10) — bez ramki/tła własnego, `StatTile` już jest "bez ramki,
 * tła i cienia" (patrz komentarz w StatTile.tsx). Wariant "odnośnikowy"
 * (każdy kafel linkuje) owija dany kafel w `Link` (A2) zamiast dodawać
 * własną logikę klikalności — `Link` niesie już pole dotykowe ≥44px z
 * wcięcia pionowego (Link.module.css).
 */
export function StatRow({ kafle }: WlasciwosciStatRow) {
  return (
    <div className={style.rzad} role="list">
      {kafle.map(({ href, ukladPulpitu, ...kafel }) => {
        const tile = <StatTile {...kafel} />;
        return (
          <div
            key={kafel.id}
            className={style.komorka}
            role="listitem"
            data-uklad={ukladPulpitu ? "pulpit" : undefined}
          >
            {href ? (
              <Link href={href} aria-label={`${kafel.etykieta} — zobacz źródła`}>
                {tile}
              </Link>
            ) : (
              tile
            )}
          </div>
        );
      })}
    </div>
  );
}
