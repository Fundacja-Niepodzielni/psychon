"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { EkranOdmowy } from "@/nowy-front/wspolne/ekran-odmowy";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { DashboardTemplate } from "@/design-system/szablony/DashboardTemplate/DashboardTemplate";
import type { RodzajBledu } from "./rodzaj-bledu";
import { KOMUNIKAT_INTERNET, KOMUNIKAT_SERWER } from "@/nowy-front/wspolne/komunikaty";

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
          {KOMUNIKAT_INTERNET}
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
          {KOMUNIKAT_SERWER}
        </Notice>
      );
    case "zakazane":
      return (
        <EkranOdmowy rodzaj="brak-dostepu" stopien={2} rolaDocelowa="uczestników" przycisk={{ etykieta: "Wróć", onClick: onWstecz }} />
      );
    case "nie-znaleziono":
      return (
        <EkranOdmowy
          rodzaj="nie-znaleziono"
          czego="danych pulpitu"
          stopien={2}
          coDalej="Nie mamy dla Ciebie danych do wyświetlenia. Odśwież stronę albo wróć za chwilę."
          przycisk={{ etykieta: "Odśwież", onClick: onPonow }}
        />
      );
  }
}
