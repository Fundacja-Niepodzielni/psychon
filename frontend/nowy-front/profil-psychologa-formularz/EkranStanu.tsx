"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { FormTemplate } from "@/design-system/szablony/FormTemplate/FormTemplate";
import { ADRES_PULPITU, EkranOdmowy } from "@/nowy-front/wspolne/ekran-odmowy";
import type { RodzajBledu } from "../pulpit/rodzaj-bledu";
import { Komunikat } from "./Komunikat";
import style from "./ProfilPsychologa.module.css";

export type StanBezDanych = "ladowanie" | RodzajBledu;

export const TYTUL_EKRANU = "Profil psychologa";

interface WlasciwosciEkranStanu {
  stan: StanBezDanych;
  onPonow: () => void;
}

/**
 * Stany ekranu bez danych — ładowanie, brak dostępu (401 i 403), nie znaleziono, brak połączenia,
 * inny błąd — osadzone w TYM SAMYM szablonie co formularz, żeby w żadnym stanie ekran nie tracił
 * korzenia (`main#tresc`) ani nagłówka. Odmowę i „nie znaleziono” pokazuje wspólny ekran z
 * `wspolne/ekran-odmowy`.
 */
export function EkranStanu({ stan, onPonow }: WlasciwosciEkranStanu) {
  const router = useRouter();
  const ponow = (
    <Button poziom="outline" onClick={onPonow}>
      Spróbuj ponownie
    </Button>
  );

  let tresc;
  switch (stan) {
    case "ladowanie":
      tresc = (
        <div className={style.stos}>
          <p role="status" className={style.stanPusty}>
            Wczytywanie wniosku…
          </p>
          <Skeleton wiersze={6} />
        </div>
      );
      break;
    case "siec":
      tresc = (
        <Komunikat wariant="error" tytul="Brak połączenia" akcja={ponow}>
          Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.
        </Komunikat>
      );
      break;
    case "blad":
      tresc = (
        <Komunikat wariant="error" tytul="Nie udało się wczytać wniosku" akcja={ponow}>
          Coś poszło nie tak po naszej stronie. Spróbuj ponownie za chwilę.
        </Komunikat>
      );
      break;
    case "zakazane":
      tresc = (
        <EkranOdmowy
          rodzaj="brak-dostepu"
          stopien={2}
          rolaDocelowa="osób wolontariackich"
          przycisk={{ onClick: () => router.push(ADRES_PULPITU) }}
        />
      );
      break;
    case "nie-znaleziono":
      tresc = (
        <EkranOdmowy
          rodzaj="nie-znaleziono"
          czego="wniosku"
          stopien={2}
          coDalej="Nie mamy dla Ciebie wniosku do wyświetlenia. Odśwież stronę albo wróć za chwilę."
          przycisk={{ etykieta: "Odśwież", onClick: onPonow }}
        />
      );
      break;
  }

  return (
    <FormTemplate
      naglowek={<PageHeader okruszki={[{ etykieta: TYTUL_EKRANU }]} tytul={TYTUL_EKRANU} onPowrot={() => router.back()} />}
      tresc={tresc}
    />
  );
}
