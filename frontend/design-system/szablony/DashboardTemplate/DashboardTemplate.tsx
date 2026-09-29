import type { ComponentProps, ReactNode } from "react";
import { PageHeader } from "../../organizmy/PageHeader/PageHeader";
import { StatRow } from "../../organizmy/StatRow/StatRow";
import style from "./DashboardTemplate.module.css";

interface WlasciwosciDashboardTemplate {
  naglowek: ComponentProps<typeof PageHeader>;
  /** Blok „następny krok” — bez własnego przycisku (06-ATOMY §5, w. 188);
   * treść i organizm w środku (`QaBlock`/`CaseCard`, §6) to decyzja strony. */
  nastepnyKrok?: ReactNode;
  kafle?: ComponentProps<typeof StatRow>["kafle"];
  glowna: ReactNode;
  wspierajaca: ReactNode;
}

/**
 * Szablon pulpitu `DashboardTemplate` (06-ATOMY-MOLEKULY-ORGANIZMY.md §5,
 * w. 188; 4 ekrany). Układ: `PageHeader` · blok „następny krok” (2 kolumny od
 * 900px, `DashboardTemplate.module.css`) · `StatRow` · kolumna główna `7fr` +
 * wspierająca `5fr`, poniżej 1380px jedna kolumna. Zero logiki poza wyborem
 * obecności obszaru.
 */
export function DashboardTemplate({ naglowek, nastepnyKrok, kafle, glowna, wspierajaca }: WlasciwosciDashboardTemplate) {
  return (
    <main id="tresc" tabIndex={-1} className={style.uklad} data-style-id="szablon-pulpit">
      <div data-obszar="naglowek">
        <PageHeader {...naglowek} />
      </div>
      {nastepnyKrok && (
        <div className={style.nastepnyKrok} data-obszar="nastepny-krok">
          {nastepnyKrok}
        </div>
      )}
      {kafle && (
        <div data-obszar="staty">
          <StatRow kafle={kafle} />
        </div>
      )}
      <div className={style.kolumny} data-obszar="kolumny">
        <div className={style.glowna} data-obszar="glowna">
          {glowna}
        </div>
        <div className={style.wspierajaca} data-obszar="wspierajaca">
          {wspierajaca}
        </div>
      </div>
    </main>
  );
}
