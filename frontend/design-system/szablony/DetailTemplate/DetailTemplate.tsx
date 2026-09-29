import type { ComponentProps, ReactNode } from "react";
import { PageHeader } from "../../organizmy/PageHeader/PageHeader";
import { PublishChecklist } from "../../organizmy/PublishChecklist/PublishChecklist";
import { StatRow } from "../../organizmy/StatRow/StatRow";
import style from "./DetailTemplate.module.css";

interface WlasciwosciDetailTemplate {
  naglowek: ComponentProps<typeof PageHeader>;
  /** Panel braków (O7) — organizm sam znika, gdy `braki` jest puste; obszar
   * jest w DOM tylko, gdy strona w ogóle poda tę właściwość. */
  checklist?: ComponentProps<typeof PublishChecklist>;
  /** `StatRow` (O10) jest opcjonalny — nie każdy ekran `DetailTemplate`
   * niesie pasek liczb (06-ATOMY §6, kolumna „Organizmy poza wspólnymi”). */
  kafle?: ComponentProps<typeof StatRow>["kafle"];
  glowna: ReactNode;
  wspierajaca: ReactNode;
}

/**
 * Szablon widoku szczegółu `DetailTemplate` (06-ATOMY-MOLEKULY-ORGANIZMY.md
 * §5, w. 184; 20 ekranów). Sam układ obszarów, w kolejności specyfikacji:
 * `PageHeader` (niesie ślad okruszków) · `PublishChecklist` (ukryty) ·
 * `StatRow` · kolumna główna `7fr` + wspierająca `5fr` (poniżej 1380px jedna
 * kolumna — `DetailTemplate.module.css`). Zero logiki poza wyborem obecności
 * obszaru: co trafia do `glowna`/`wspierajaca` (który organizm, w jakim
 * stanie) decyduje strona, nie ten plik.
 */
export function DetailTemplate({ naglowek, checklist, kafle, glowna, wspierajaca }: WlasciwosciDetailTemplate) {
  return (
    <div className={style.uklad} data-style-id="szablon-szczegol">
      <div data-obszar="naglowek">
        <PageHeader {...naglowek} />
      </div>
      {checklist && (
        <div data-obszar="checklist">
          <PublishChecklist {...checklist} />
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
    </div>
  );
}
