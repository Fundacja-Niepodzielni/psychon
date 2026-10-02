"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";
import { EkranOdmowy } from "@/nowy-front/wspolne/ekran-odmowy";
import type { RodzajBledu } from "../pulpit/rodzaj-bledu";
import { Komunikat } from "./Komunikat";
import { ADRES_PULPITU_PROWADZACEGO } from "./logika";
import style from "./GrupaProwadzacego.module.css";

export type StanBezDanych = "ladowanie" | RodzajBledu;

interface WlasciwosciEkranStanu {
  stan: StanBezDanych;
  /** Tytuł ekranu — ten sam `h1` co na ekranie z danymi. */
  tytul: string;
  opis: string;
  /** Do zdania ładowania: „Wczytywanie {czego}…”, np. „grupy”. */
  czego: string;
  /** Tytuł komunikatu błędu, np. „Nie udało się wczytać grupy”. */
  tytulBledu: string;
  /** Dopełniacz do „Nie znaleziono …”. */
  czegoNieZnaleziono: string;
  onPonow: () => void;
}

/**
 * Stany ekranu bez danych — ładowanie, brak dostępu (401 i 403), nie znaleziono, brak połączenia,
 * inny błąd — osadzone w TYM SAMYM szablonie co ekran z danymi, żeby w żadnym stanie nie tracił
 * korzenia (`main#tresc`) ani nagłówka. Odmowę i „nie znaleziono” pokazuje wspólny ekran z
 * `wspolne/ekran-odmowy`. Wspólne dla „Mojej grupy” i „Wątku grupowego”.
 */
export function EkranStanu({ stan, tytul, opis, czego, tytulBledu, czegoNieZnaleziono, onPonow }: WlasciwosciEkranStanu) {
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
            Wczytywanie {czego}…
          </p>
          <Skeleton wiersze={5} />
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
        <Komunikat wariant="error" tytul={tytulBledu} akcja={ponow}>
          Coś poszło nie tak po naszej stronie. Spróbuj ponownie za chwilę.
        </Komunikat>
      );
      break;
    case "zakazane":
      tresc = (
        <EkranOdmowy
          rodzaj="brak-dostepu"
          stopien={2}
          rolaDocelowa="osób prowadzących"
          przycisk={{ onClick: () => router.push(ADRES_PULPITU_PROWADZACEGO) }}
        />
      );
      break;
    case "nie-znaleziono":
      tresc = (
        <EkranOdmowy
          rodzaj="nie-znaleziono"
          czego={czegoNieZnaleziono}
          stopien={2}
          coDalej="Nie mamy dla Ciebie danych do wyświetlenia. Odśwież stronę albo wróć za chwilę."
          przycisk={{ etykieta: "Odśwież", onClick: onPonow }}
        />
      );
      break;
  }

  return (
    <ListTemplate
      naglowek={
        <PageHeader
          okruszki={[{ etykieta: "Prowadzący" }, { etykieta: tytul }]}
          tytul={tytul}
          opis={opis}
          onPowrot={() => router.back()}
        />
      }
      lista={tresc}
    />
  );
}
