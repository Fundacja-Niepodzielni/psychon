import type { ReactNode } from "react";
import style from "./FormTemplate.module.css";
import { KorzenSzablonu } from "../KontekstPowloki";

interface WlasciwosciFormTemplate {
  /** "panel" (domyslny, ekrany panelu) albo "publiczny" (ekrany wejscia —
   * zastepuje osobny AuthTemplate, ktorego ta warstwa nie buduje). */
  wariant?: "panel" | "publiczny";
  /** Logo — wylacznie wariant "publiczny". */
  logo?: ReactNode;
  /** PageHeader (O1) — wylacznie wariant "panel"; niesie okruszki jako swoj
   * pierwszy wewnetrzny wiersz. */
  naglowek?: ReactNode;
  /** Notice (M11) z podsumowaniem bledow — pomijane, gdy ich nie ma. */
  powiadomienie?: ReactNode;
  /** FormSection (O11) — obszar glowny, niesie tez wlasny rzad przyciskow
   * jako swoj ostatni wewnetrzny wiersz. */
  tresc: ReactNode;
  /** Drobny druk — wylacznie wariant "publiczny". */
  drobnyDruk?: ReactNode;
}

/**
 * Szablon formularza `FormTemplate` (warstwa 5, §5, wiersz 187). Kolumna
 * <= 640px, obszary w kolejnosci: logo -> naglowek -> powiadomienie -> tresc
 * -> drobny druk. Wariant "publiczny" wezszy i wysrodkowany, z logo zamiast
 * naglowka panelu — jedyna roznica to dobor klasy pojemnika i to, ktore
 * sloty wywolujacy wypelnia, nie osobna galaz renderowania.
 *
 * Zero logiki poza wyborem obszaru.
 */
export function FormTemplate({
  wariant = "panel",
  logo,
  naglowek,
  powiadomienie,
  tresc,
  drobnyDruk,
}: WlasciwosciFormTemplate) {
  return (
    <KorzenSzablonu
      className={`${style.uklad} ${wariant === "publiczny" ? style.publiczny : ""}`.trim()}
      styleId="szablon-formularz"
    >
      {logo && (
        <div className={style.logo} data-testid="obszar-logo">
          <div className={style.logoTresc}>{logo}</div>
        </div>
      )}
      {naglowek && (
        <div className={style.naglowek} data-testid="obszar-naglowek">
          {naglowek}
        </div>
      )}
      {powiadomienie && (
        <div className={style.powiadomienie} data-testid="obszar-powiadomienie">
          {powiadomienie}
        </div>
      )}
      <div className={style.tresc} data-testid="obszar-tresc">
        {tresc}
      </div>
      {drobnyDruk && (
        <div className={style.drobnyDruk} data-testid="obszar-drobny-druk">
          {drobnyDruk}
        </div>
      )}
    </KorzenSzablonu>
  );
}
