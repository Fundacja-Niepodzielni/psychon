import { Link } from "../../atomy/Link/Link";
import { Text } from "../../atomy/Text/Text";
import style from "./Breadcrumbs.module.css";

interface PozycjaBreadcrumbs {
  etykieta: string;
  href?: string;
}

interface WlasciwosciBreadcrumbs {
  pozycje: PozycjaBreadcrumbs[];
  /**
   * 06-ATOMY-MOLEKULY-ORGANIZMY.md §3, w. 147: "`Link` × n + `Text`; pełne ·
   * skrócone". Domyślnie "pelne" — dotychczasowe wywołania niezmienione.
   */
  wariant?: "pelne" | "skrocone";
  /**
   * Ostatnia pozycja (bieżąca) dostaje `aria-current="page"`. Domyślnie
   * wyłączone — poza nową ramką panelu znacznik się nie pojawia.
   */
  oznaczBiezaca?: boolean;
}

interface WezelBreadcrumbs {
  etykieta: string;
  href?: string;
  elipsa: boolean;
}

/**
 * Okruszki `Breadcrumbs` (M7). `Link` × n + `Text`, złożone z atomów warstwy
 * 2. Ostatnia pozycja NIGDY nie jest odnośnikiem — zawsze `Text`, nawet gdy
 * dostała `href`.
 *
 * Wariant "skrócone": pierwsza i ostatnia pozycja zostają, środek zwija się
 * w jedną pozycję "…" (nieklikalna, `aria-hidden`, styl jak reszta okruszków
 * — 13px `--muted`). Przy ≤2 pozycjach nie ma czego zwinąć — renderuje się
 * jak "pełne" (zwinięcie dwóch pozycji w jedną nie skróciłoby niczego).
 */
export function Breadcrumbs({ pozycje, wariant = "pelne", oznaczBiezaca = false }: WlasciwosciBreadcrumbs) {
  if (pozycje.length === 0) {
    throw new Error("Breadcrumbs: lista pozycji nie może być pusta");
  }
  const wezly: WezelBreadcrumbs[] =
    wariant === "skrocone" && pozycje.length > 2
      ? [
          { ...pozycje[0], elipsa: false },
          { etykieta: "…", elipsa: true },
          { ...pozycje[pozycje.length - 1], elipsa: false },
        ]
      : pozycje.map((pozycja) => ({ ...pozycja, elipsa: false }));

  return (
    <nav aria-label="Okruszki" className={style.okruszki}>
      <ol className={style.lista}>
        {wezly.map((wezel, indeks) => {
          const ostatnia = indeks === wezly.length - 1;
          return (
            <li
              key={`${wezel.etykieta}-${indeks}`}
              className={style.pozycja}
              aria-current={ostatnia && oznaczBiezaca ? "page" : undefined}
              data-testid={`slad-pozycja-${indeks}`}
            >
              {wezel.elipsa ? (
                <span aria-hidden="true" data-testid="breadcrumbs-elipsa">
                  {wezel.etykieta}
                </span>
              ) : !ostatnia && wezel.href ? (
                <Link wariant="okruszek" href={wezel.href} data-testid={`slad-cel-${indeks}`}>
                  {wezel.etykieta}
                </Link>
              ) : (
                <Text>{wezel.etykieta}</Text>
              )}
              {!ostatnia && (
                <span aria-hidden="true" className={style.separator}>
                  ›
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
