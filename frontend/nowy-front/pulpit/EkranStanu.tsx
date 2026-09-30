"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { DashboardTemplate } from "@/design-system/szablony/DashboardTemplate/DashboardTemplate";
import type { RodzajBledu } from "./rodzaj-bledu";

export type StanBezDanych = "ladowanie" | RodzajBledu;

interface WlasciwosciEkranStanu {
  stan: StanBezDanych;
  /** Ponowienie odczytu — przycisk w stanach `siec`, `blad` i `nie-znaleziono`. */
  onPonow: () => void;
}

/**
 * Stany pulpitu bez danych — ładowanie, 403, 404, błąd sieci, inny błąd —
 * osadzone w TYM SAMYM szablonie `DashboardTemplate` co stan z danymi, żeby
 * ekran w żadnym stanie nie tracił korzenia (`main#tresc`, znacznik
 * szablonu) ani nagłówka. Wspólne dla pulpitu uczestnika (U-01) i studenta
 * (U-02).
 */
export function EkranStanu({ stan, onPonow }: WlasciwosciEkranStanu) {
  const router = useRouter();

  return (
    <DashboardTemplate
      naglowek={{
        okruszki: [{ etykieta: "Pulpit" }],
        tytul: "Pulpit",
        onPowrot: () => router.back(),
      }}
      glowna={<TrescStanu stan={stan} onPonow={onPonow} onWstecz={() => router.back()} />}
      wspierajaca={null}
    />
  );
}

function TrescStanu({
  stan,
  onPonow,
  onWstecz,
}: WlasciwosciEkranStanu & { onWstecz: () => void }) {
  switch (stan) {
    case "ladowanie":
      return <Skeleton wiersze={6} />;
    case "siec":
      return (
        <Notice
          wariant="error"
          tytul="Brak połączenia"
          akcja={
            <Button poziom="outline" onClick={onPonow}>
              Spróbuj ponownie
            </Button>
          }
        >
          Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.
        </Notice>
      );
    case "blad":
      return (
        <Notice
          wariant="error"
          tytul="Nie udało się wczytać pulpitu"
          akcja={
            <Button poziom="outline" onClick={onPonow}>
              Spróbuj ponownie
            </Button>
          }
        >
          Coś poszło nie tak po naszej stronie. Spróbuj ponownie za chwilę.
        </Notice>
      );
    case "zakazane":
      return (
        <EmptyState
          wariant="brak-uprawnien"
          naglowek="Brak dostępu do pulpitu"
          rola="uczestników programu"
          przycisk={{ etykieta: "Wróć", onClick: onWstecz }}
        />
      );
    case "nie-znaleziono":
      return (
        <EmptyState
          naglowek="Nie znaleziono danych pulpitu"
          tresc="Nie mamy dla Ciebie danych do wyświetlenia. Odśwież stronę albo wróć za chwilę."
          przycisk={{ etykieta: "Odśwież", onClick: onPonow }}
        />
      );
  }
}
