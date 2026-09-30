import type { ComponentProps, ReactNode } from "react";
import { PageHeader } from "../../organizmy/PageHeader/PageHeader";
import { PublishChecklist } from "../../organizmy/PublishChecklist/PublishChecklist";
import style from "./LessonTemplate.module.css";
import { KorzenSzablonu } from "../KontekstPowloki";

interface WlasciwosciLessonTemplate {
  naglowek: ComponentProps<typeof PageHeader>;
  checklist?: ComponentProps<typeof PublishChecklist>;
  /** Pasek kroków z podpisem, NAD kolumnami. `LessonPlayer` (O6) niesie już
   * własny `StepBar` wewnątrz jednego bloku, bez podziału na kolumny — ten
   * obszar jest osobnym miejscem dla stron, które chcą pasek POZA
   * odtwarzaczem; treść i podpis to decyzja strony, nie szablonu. */
  pasekKrokow?: ReactNode;
  glowna: ReactNode;
  wspierajaca: ReactNode;
}

/**
 * Szablon lekcji `LessonTemplate` (06-ATOMY-MOLEKULY-ORGANIZMY.md §5, w. 186;
 * 1 ekran, U-07). Układ jak `DetailTemplate`: `PageHeader` · `PublishChecklist`
 * (ukryty) · pasek kroków (opcjonalny) · kolumna główna `7fr` (odtwarzacz ·
 * ukończenie · treść) + wspierająca `5fr` (materiały · `QaBlock`), poniżej
 * 1380px jedna kolumna. Zero logiki poza wyborem obecności obszaru.
 */
export function LessonTemplate({ naglowek, checklist, pasekKrokow, glowna, wspierajaca }: WlasciwosciLessonTemplate) {
  return (
    <KorzenSzablonu className={style.uklad} styleId="szablon-lekcja">
      <div data-obszar="naglowek">
        <PageHeader {...naglowek} />
      </div>
      {checklist && (
        <div data-obszar="checklist">
          <PublishChecklist {...checklist} />
        </div>
      )}
      {pasekKrokow && <div data-obszar="pasek-krokow">{pasekKrokow}</div>}
      <div className={style.kolumny} data-obszar="kolumny">
        <div className={style.glowna} data-obszar="glowna">
          {glowna}
        </div>
        <div className={style.wspierajaca} data-obszar="wspierajaca">
          {wspierajaca}
        </div>
      </div>
    </KorzenSzablonu>
  );
}
