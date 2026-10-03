"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Text } from "@/design-system/atomy/Text/Text";
import { formatujDate } from "../wspolne/daty";
import { nazwaFormy, nazwaWpisu, tekstGodzin, type WpisStazu } from "./dane";
import style from "./DziennikStazu.module.css";

/** Zdanie pod danymi wpisu, którego nie można już zmienić — mówi, dlaczego i co dalej. */
export function zdanieBlokady(wpis: WpisStazu): string {
  return wpis.status === "rejected"
    ? "Odrzuconego wpisu nie można poprawić ani wysłać ponownie. Jeśli dyżur nadal trzeba udokumentować, dodaj nowy wpis."
    : "Zatwierdzonego wpisu nie można już zmienić.";
}

/** Nazwa uwagi przy wpisie — ta sama, pod którą wpisuje ją ekran decyzji o dyżurach. */
export function nazwaUwagi(wpis: WpisStazu): string {
  if (wpis.status === "returned") return "Co trzeba poprawić";
  if (wpis.status === "rejected") return "Powód odrzucenia";
  return "Wcześniejsza prośba o poprawkę";
}

interface WlasciwosciPaneluWpisu {
  wpis: WpisStazu;
  onWroc: () => void;
}

/**
 * Panel wpisu, którego nie można już zmienić (zatwierdzonego albo
 * odrzuconego), otwarty pod wierszem listy: dane wpisu, uwaga z decyzji,
 * zdanie, dlaczego wpis jest zamknięty, i „Wróć do listy”. Fokus ląduje na
 * samym panelu (obszar z nazwą, `tabIndex={-1}`), tak jak w panelu dyżuru
 * po stronie administracji.
 */
export function PanelWpisu({ wpis, onWroc }: WlasciwosciPaneluWpisu) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panel.current?.focus();
  }, []);

  return (
    <div ref={panel} className={style.panel} role="region" aria-label={`Szczegóły: ${nazwaWpisu(wpis)}`} tabIndex={-1}>
      <dl className={style.dane}>
        <Para nazwa="Data">{formatujDate(wpis.date)}</Para>
        <Para nazwa="Forma">{nazwaFormy(wpis.form)}</Para>
        <Para nazwa="Godziny">{tekstGodzin(wpis.hours)}</Para>
        <Para nazwa="Konsultacje">{String(wpis.consultations_count)}</Para>
        <Para nazwa="Opis">{wpis.description ? wpis.description : null}</Para>
        {wpis.review_comment && <Para nazwa={nazwaUwagi(wpis)}>{wpis.review_comment}</Para>}
        {wpis.decided_at && <Para nazwa="Data decyzji">{formatujDate(wpis.decided_at)}</Para>}
      </dl>
      <Text>{zdanieBlokady(wpis)}</Text>
      <div className={style.akcje}>
        <Button poziom="quiet" onClick={onWroc}>
          Wróć do listy
        </Button>
      </div>
    </div>
  );
}

function Para({ nazwa, children }: { nazwa: string; children: string | null }) {
  return (
    <div className={style.para}>
      <dt>
        <Hint>{nazwa}</Hint>
      </dt>
      <dd className={style.opis}>{children === null ? <Hint>Bez opisu.</Hint> : <Text>{children}</Text>}</dd>
    </div>
  );
}
