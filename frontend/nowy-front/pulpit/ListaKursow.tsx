import { Badge } from "@/design-system/atomy/Badge/Badge";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Icon } from "@/design-system/atomy/Icon/Icon";
import { Link } from "@/design-system/atomy/Link/Link";
import { Text } from "@/design-system/atomy/Text/Text";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
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
 * z szablonu pulpitu), wiersz jak `ListRow` (plakietka, tytuł, podlinia,
 * akcja), z jednym dodatkiem, którego `ListRow` nie ma — akcją nieaktywną.
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
        {kursy.map((kurs) => {
          const plakietka = ETYKIETA_STANU_KURSU[kurs.status];
          return (
            <div key={kurs.id} className={style.wiersz} data-kurs-stan={kurs.status}>
              <div className={style.tresc}>
                <div className={style.naglowek}>
                  <span className={style.plakietka}>
                    <Badge wariant={plakietka.wariant}>{plakietka.tekst}</Badge>
                  </span>
                  <Text>{kurs.title}</Text>
                </div>
                <Hint>{podpowiedz(kurs)}</Hint>
              </div>
              <div className={style.akcje}>
                {kurs.status === "locked" ? (
                  <Button poziom="outline" rozmiar="sm" aria-disabled="true" data-akcja="zamkniety">
                    <span className={style.zamkniety}>
                      <Icon nazwa="lock" rozmiar={16} />
                      Zamknięty
                    </span>
                  </Button>
                ) : (
                  <span className={style.akcjaOdnosnik}>
                    <Link href={`/panel/kursy/${kurs.slug}`} aria-label={`Otwórz kurs: ${kurs.title}`}>
                      Otwórz{" "}
                      <span className={style.strzalka} aria-hidden="true">
                        ›
                      </span>
                    </Link>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
