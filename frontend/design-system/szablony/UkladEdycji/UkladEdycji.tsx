import type { ComponentProps, ReactNode } from "react";
import { PageHeader } from "../../organizmy/PageHeader/PageHeader";
import { KorzenSzablonu } from "../KontekstPowloki";
import style from "./UkladEdycji.module.css";

/** Szerokość okna, od której układ ma dwie kolumny (ta sama liczba stoi w
 * `UkladEdycji.module.css` — reguła `@media` nie umie odwołać się do stałej). */
export const PROG_DWOCH_KOLUMN = 1100;

interface WlasciwosciUkladEdycji {
  /** Nagłówek strony. Okruszek składa rama panelu, nie ten szablon. */
  naglowek: ComponentProps<typeof PageHeader>;
  /**
   * Wąski pas ze stanem i głównym przyciskiem. Widoczny wyłącznie poniżej
   * 1100 px, pod nagłówkiem, przyklejony do GÓRY okna. Od 1100 px pasa nie ma
   * na ekranie — stan i główny przycisk niesie wtedy pierwsza karta kolumny
   * bocznej (jej przycisk owiń w `TylkoOdDwochKolumn`, żeby nigdy nie było
   * widać dwóch naraz).
   */
  pasekWaski?: ReactNode;
  /** Komunikaty całej strony (np. błąd odczytu) — między nagłówkiem a kolumnami. */
  komunikaty?: ReactNode;
  /** Kolumna lewa, szersza: przedmiot edycji. */
  glowna: ReactNode;
  /** Kolumna prawa: karty stanu i ustawień (`KartaBoczna`). */
  boczna: ReactNode;
}

/**
 * Szablon ekranu edycji `UkladEdycji`: nagłówek strony, pod nim (tylko poniżej
 * 1100 px) wąski pas przyklejony do góry okna, dalej dwie kolumny — `glowna`
 * (lewa, szersza) i `boczna` (prawa, 360 px). Od 1100 px kolumna boczna stoi
 * w miejscu przy przewijaniu; gdy jest wyższa niż okno, przewija się w sobie.
 * Poniżej 1100 px jedna kolumna: najpierw `glowna`, potem `boczna`.
 *
 * Kolejność w DOM = kolejność na ekranie na każdej szerokości (nagłówek, pas,
 * komunikaty, główna, boczna), więc fokus idzie tak, jak czyta oko. Szablon
 * nie zna danych i nie ma własnych elementów interaktywnych.
 */
export function UkladEdycji({ naglowek, pasekWaski, komunikaty, glowna, boczna }: WlasciwosciUkladEdycji) {
  return (
    <KorzenSzablonu className={style.uklad} styleId="szablon-edycja">
      <div data-obszar="naglowek">
        <PageHeader {...naglowek} />
      </div>
      {pasekWaski && (
        <div className={style.pasekWaski} data-obszar="pasek-waski">
          {pasekWaski}
        </div>
      )}
      {komunikaty && <div data-obszar="komunikaty">{komunikaty}</div>}
      <div className={style.kolumny} data-obszar="kolumny">
        <div className={style.glowna} data-obszar="glowna">
          {glowna}
        </div>
        <div className={style.boczna} data-obszar="boczna">
          {boczna}
        </div>
      </div>
    </KorzenSzablonu>
  );
}

/**
 * Treść widoczna wyłącznie od 1100 px (w układzie dwóch kolumn). Poniżej tej
 * szerokości jest wyłączona z układu i z drzewa dostępności (`display: none`)
 * — jej miejsce zajmuje `pasekWaski`. Służy głównemu przyciskowi pierwszej
 * karty bocznej: ten sam przycisk stoi w karcie albo w pasie, nigdy w obu.
 */
export function TylkoOdDwochKolumn({ children }: { children: ReactNode }) {
  return (
    <div className={style.tylkoOdDwochKolumn} data-obszar="tylko-od-dwoch-kolumn">
      {children}
    </div>
  );
}
