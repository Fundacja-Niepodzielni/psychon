import type { ReactNode } from "react";
import { Badge } from "@/design-system/atomy/Badge/Badge";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Text } from "@/design-system/atomy/Text/Text";
import type { CooperationRequest } from "@/lib/api/h01-wspolpraca";
import { formatujDateICzas } from "../wspolne/daty";
import { PLAKIETKA_STATUSU } from "./dane";
import style from "./PoProgramieWspolpraca.module.css";

interface WlasciwosciHistorii {
  zgloszenia: CooperationRequest[];
  /** Zdanie w stanie pustym — podawane tylko tam, gdzie zgłoszenie można wysłać. */
  pusty?: string;
  stronicowanie?: ReactNode;
}

/**
 * Historia własnych zgłoszeń ze statusem po polsku, datą złożenia oraz —
 * gdy administracja odpowiedziała — treścią i datą odpowiedzi. Treść
 * zgłoszenia i odpowiedzi jest tekstem: HTML w niej wyświetla się dosłownie.
 * Plakietka statusu ma szerokość własnej treści (`.plakietka`), nie całego
 * wiersza. Bez `pusty` pusta historia w ogóle się nie renderuje.
 */
export function HistoriaZgloszen({ zgloszenia, pusty, stronicowanie }: WlasciwosciHistorii) {
  if (zgloszenia.length === 0 && pusty === undefined) return null;

  return (
    <section className={style.historia} aria-label="Moje prośby">
      <Heading stopien={2}>Moje prośby</Heading>
      {zgloszenia.length === 0 ? (
        <Hint>{pusty}</Hint>
      ) : (
        <ul className={style.lista}>
          {zgloszenia.map((zgloszenie) => (
            <li key={zgloszenie.id} className={style.pozycja}>
              <div className={style.plakietka}>
                <Badge wariant={PLAKIETKA_STATUSU[zgloszenie.status].wariant}>
                  {PLAKIETKA_STATUSU[zgloszenie.status].tekst}
                </Badge>
              </div>
              <Hint>{`Złożono ${formatujDateICzas(zgloszenie.created_at)}`}</Hint>
              <div className={style.tresc}>
                <Text>{zgloszenie.body}</Text>
              </div>
              {zgloszenie.response !== null && zgloszenie.response.trim() !== "" && (
                <div className={style.odpowiedz} data-testid={`odpowiedz-${zgloszenie.id}`}>
                  <Hint>{`Odpowiedź z ${formatujDateICzas(zgloszenie.responded_at)}`}</Hint>
                  <div className={style.tresc}>
                    <Text>{zgloszenie.response}</Text>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {stronicowanie}
    </section>
  );
}
