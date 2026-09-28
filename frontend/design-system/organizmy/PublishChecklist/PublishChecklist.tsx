"use client";

import { useEffect, useId } from "react";
import { Badge } from "../../atomy/Badge/Badge";
import { Button } from "../../atomy/Button/Button";
import { Heading } from "../../atomy/Heading/Heading";
import { Link } from "../../atomy/Link/Link";
import style from "./PublishChecklist.module.css";

export interface PozycjaChecklisty {
  id: string;
  tekst: string;
  /** Wymagany dla braków (odnośnik do miejsca uzupełnienia); pozycje gotowe
   * renderują się jako sam tekst i nie muszą go nosić. */
  href?: string;
}

interface WlasciwosciPublishChecklist {
  tytul: string;
  braki: PozycjaChecklisty[];
  gotowe: PozycjaChecklisty[];
  /** Wołane przez przycisk zamknięcia w panelu ORAZ automatycznie, gdy
   * `braki` opróżnią się — spec (06-ATOMY §4, O7): „zamyka się sam, gdy
   * brak zniknie”. Właściciel stanu widoczności to wywołujący (trasa),
   * nie ten komponent — stąd komponent zwraca `null` zamiast rysować
   * własny stan pusty (Text spoza składu O7 nie jest tu rysowany). */
  onZamknij: () => void;
}

/**
 * Panel braków `PublishChecklist` (O7). Jedyny organizm złożony wprost
 * z atomów, bez molekuł (06-ATOMY-MOLEKULY-ORGANIZMY.md §4, O7, w. 171):
 * `Heading` (fokus) + `Badge` `warn` z liczbą + lista braków z odnośnikami
 * + zamknięcie. Wariant stały w kolumnie A-12: bez ukrywania z zewnątrz,
 * z sekcją „Gotowe (n)” zwiniętą z licznikiem.
 *
 * `Heading` przyjmuje fokus programowy przy każdym renderze listy braków —
 * to ten sam nagłówek, który zastępuje nieaktywny przycisk publikacji
 * (ustalenie specyfikacji): otwarcie panelu musi przenieść uwagę na niego.
 */
export function PublishChecklist({ tytul, braki, gotowe, onZamknij }: WlasciwosciPublishChecklist) {
  const idNaglowka = useId();

  useEffect(() => {
    document.getElementById(idNaglowka)?.focus();
  }, [idNaglowka, braki.length]);

  useEffect(() => {
    if (braki.length === 0) onZamknij();
  }, [braki.length, onZamknij]);

  if (braki.length === 0) return null;

  return (
    <section className={style.panel} aria-label={tytul}>
      <div className={style.wiersz}>
        <Heading stopien={2} id={idNaglowka}>
          {tytul}
        </Heading>
        <Badge wariant="warn">{braki.length}</Badge>
      </div>

      <ul className={style.listaBrakow}>
        {braki.map((brak) => (
          <li key={brak.id}>
            <Link href={brak.href}>{brak.tekst}</Link>
          </li>
        ))}
      </ul>

      <details className={style.gotowe}>
        <summary className={style.podsumowanie}>Gotowe ({gotowe.length})</summary>
        <ul className={style.listaGotowych}>
          {gotowe.map((pozycja) => (
            <li key={pozycja.id}>{pozycja.tekst}</li>
          ))}
        </ul>
      </details>

      <Button poziom="quiet" onClick={onZamknij}>
        Zamknij
      </Button>
    </section>
  );
}
