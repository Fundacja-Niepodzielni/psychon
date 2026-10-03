import type { ReactNode } from "react";
import { Link } from "../../atomy/Link/Link";
import { KorzenSzablonu } from "../KontekstPowloki";
import style from "./StronaPubliczna.module.css";

export interface OdnosnikStopki {
  etykieta: string;
  href: string;
}

interface WlasciwosciStronaPubliczna {
  /** Znak Fundacji nad kolumną (dostarcza wywołujący, tak jak w powłoce panelu). */
  logo?: ReactNode;
  /**
   * `waska` (domyślna) — ekrany wejścia i krótkie komunikaty;
   * `czytelna` — dokumenty do czytania (szerokość wygodnego wiersza tekstu).
   */
  szerokosc?: "waska" | "czytelna";
  /** Odnośniki stopki; pusta lista albo brak — strona bez stopki. */
  odnosnikiStopki?: readonly OdnosnikStopki[];
  /** Nazwa dostępna nawigacji w stopce. */
  etykietaStopki?: string;
  children: ReactNode;
}

/**
 * Szablon strony publicznej `StronaPubliczna` — ekrany bez logowania i bez
 * powłoki panelu: znak Fundacji u góry, jedna wyśrodkowana kolumna treści
 * (`main#tresc`, cel linku skoku) i stopka z odnośnikami. Zero logiki poza
 * wyborem obecności obszaru; nagłówek `h1` i treść daje ekran.
 */
export function StronaPubliczna({
  logo,
  szerokosc = "waska",
  odnosnikiStopki = [],
  etykietaStopki = "Informacje o serwisie",
  children,
}: WlasciwosciStronaPubliczna) {
  return (
    <div className={style.strona}>
      {logo && (
        <header className={style.gora}>
          <div className={style.logo}>{logo}</div>
        </header>
      )}
      <KorzenSzablonu
        className={`${style.kolumna} ${szerokosc === "czytelna" ? style.czytelna : style.waska}`}
        styleId="szablon-strona-publiczna"
      >
        <div className={style.tresc} data-szerokosc={szerokosc}>
          {children}
        </div>
      </KorzenSzablonu>
      {odnosnikiStopki.length > 0 && (
        <footer className={style.stopka}>
          <nav aria-label={etykietaStopki}>
            <ul className={style.lista}>
              {odnosnikiStopki.map((odnosnik) => (
                <li key={odnosnik.href} className={style.pozycja}>
                  <Link href={odnosnik.href}>{odnosnik.etykieta}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </footer>
      )}
    </div>
  );
}
