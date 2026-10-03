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
  /** Od 1180 px liczby wszystkich kafli rzędu stoją na jednej linii, a paski i
   * podpowiedzi zaczynają się na jednej wysokości (subgrid). Pasek i podpowiedź
   * jednego kafla idą wtedy w jednym bloku pod liczbą. Poniżej 1180 px układ
   * jest taki jak bez tej właściwości. Domyślnie wyłączone — kafle karty osoby
   * (do czworga dzieci) nie są objęte. */
  wyrownane?: boolean;
  /** Cztery równe pola o jednym układzie (podpis, liczba, jedna linia opisu): dwie
   * kolumny, od 1180 px cztery; liczba w stopniu `--fs-2`, jednostka mała, bez
   * zawijania liczby. Domyślnie wyłączone. */
  duzeLiczby?: boolean;
}

/**
 * Rząd liczb `StatRow` (O10). Skład wprost ze specyfikacji: rząd `StatTile`
 * (molekuła, M10) — bez ramki/tła własnego, `StatTile` już jest "bez ramki,
 * tła i cienia" (patrz komentarz w StatTile.tsx). Wariant "odnośnikowy"
 * (każdy kafel linkuje) owija dany kafel w `Link` (A2) zamiast dodawać
 * własną logikę klikalności — `Link` niesie już pole dotykowe ≥44px z
 * wcięcia pionowego (Link.module.css).
 */
export function StatRow({ kafle, wyrownane = false, duzeLiczby = false }: WlasciwosciStatRow) {
  return (
    <div
      className={style.rzad}
      role="list"
      data-wyrownane={wyrownane || undefined}
      data-duze-liczby={duzeLiczby || undefined}
    >
      {kafle.map(({ href, ukladPulpitu, ...kafel }) => {
        const tile = <StatTile {...kafel} wyrownany={wyrownane} />;
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
