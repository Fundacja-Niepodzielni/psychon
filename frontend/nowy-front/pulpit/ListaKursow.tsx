import { Heading } from "@/design-system/atomy/Heading/Heading";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { ListRow } from "@/design-system/molekuly/ListRow/ListRow";
import type { KursSciezki } from "./dane";
import style from "./ListaKursow.module.css";

/**
 * Stan kursu na ścieżce uczestnika (słownik interfejsu §2, dopisek 2.1):
 * plakietka małą literą — ukończony · w toku · zamknięty. Kurs zamknięty
 * (`locked`) nie ma odnośnika: ma nieaktywny przycisk „Zamknięty” z kłódką
 * (`aria-disabled`, nie link). Kurs ukończony i w toku ma „Otwórz”; nigdy
 * „Otwórz” przy kursie zamkniętym.
 */
export const ETYKIETA_STANU_KURSU: Record<KursSciezki["status"], { wariant: "neutral" | "ok" | "pending"; tekst: string }> = {
  locked: { wariant: "neutral", tekst: "zamknięty" },
  in_progress: { wariant: "pending", tekst: "w toku" },
  completed: { wariant: "ok", tekst: "ukończony" },
};

interface WlasciwosciListaKursow {
  tytul: string;
  kursy: KursSciezki[];
  /** Podlinia wiersza (np. „Kurs 2 · 40% ukończone”). */
  podpowiedz: (kurs: KursSciezki) => string;
  pusty: { naglowek: string; tresc: string; przycisk: { etykieta: string; onClick: () => void } };
}

/**
 * Lista kursów uczestnika i studenta: sekcja z nagłówkiem h2 (karta pochodzi
 * z szablonu pulpitu), każdy wiersz to `ListRow` (plakietka, tytuł, podlinia,
 * akcja; kurs zamknięty — akcja nieaktywna z kłódką). Układ wiersza, także
 * na wąskim ekranie (tytuł, pod nim plakietka), daje wyłącznie `ListRow`.
 */
export function ListaKursow({ tytul, kursy, podpowiedz, pusty }: WlasciwosciListaKursow) {
  if (kursy.length === 0) {
    return (
      <section aria-label={tytul}>
        <Heading stopien={2}>{tytul}</Heading>
        <EmptyState naglowek={pusty.naglowek} tresc={pusty.tresc} przycisk={pusty.przycisk} />
      </section>
    );
  }

  return (
    <section aria-label={tytul} className={style.sekcja}>
      <Heading stopien={2}>{tytul}</Heading>
      <div className={style.lista}>
        {kursy.map((kurs) => (
          <div key={kurs.id} data-kurs-stan={kurs.status}>
            <ListRow
              wariant="ze-stanem"
              tytul={kurs.title}
              plakietka={ETYKIETA_STANU_KURSU[kurs.status]}
              podpowiedz={podpowiedz(kurs)}
              akcja={
                kurs.status === "locked"
                  ? { etykieta: "Zamknięty", nieaktywna: true }
                  : { etykieta: "Otwórz", etykietaDostepna: `Otwórz kurs: ${kurs.title}`, href: `/panel/kursy/${kurs.slug}` }
              }
            />
          </div>
        ))}
      </div>
    </section>
  );
}
