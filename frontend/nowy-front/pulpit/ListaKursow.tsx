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

/**
 * Zdanie w wierszu kursu zamkniętego: który kurs trzeba ukończyć, żeby ten się
 * otworzył. Poprzedni kurs to ten z listy, którego numer w ścieżce jest
 * najbliższym niższym; lista nie pyta o nic ponad to, co pulpit już wczytał.
 * Gdy kurs nie ma numeru w ścieżce albo poprzedniego nie ma na liście —
 * zdanie bez tytułu.
 */
export function zdanieZamknietegoKursu(kurs: KursSciezki, kursy: KursSciezki[]): string {
  const numer = kurs.sequence_order;
  const poprzedni =
    typeof numer === "number"
      ? kursy
          .filter((inny) => typeof inny.sequence_order === "number" && inny.sequence_order < numer)
          .sort((a, b) => (b.sequence_order ?? 0) - (a.sequence_order ?? 0))[0]
      : undefined;
  const tytul = poprzedni?.title.trim() ?? "";
  return tytul === "" ? "Otworzy się po ukończeniu poprzedniego kursu." : `Otworzy się po ukończeniu kursu „${tytul}”.`;
}

interface WlasciwosciListaKursow {
  tytul: string;
  kursy: KursSciezki[];
  /** Podlinia wiersza kursu otwartego (np. „Kurs 2 · 40% ukończone”); kurs zamknięty ma w jej miejscu zdanie, co go otworzy. */
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
              podpowiedz={kurs.status === "locked" ? zdanieZamknietegoKursu(kurs, kursy) : podpowiedz(kurs)}
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
