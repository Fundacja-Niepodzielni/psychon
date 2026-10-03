"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";
import { ADRES_PULPITU, EkranOdmowy } from "@/nowy-front/wspolne/ekran-odmowy";
import type { RodzajBledu } from "../pulpit/rodzaj-bledu";
import { Komunikat } from "./Komunikat";
import style from "./CertyfikatDokumenty.module.css";

export type StanBezDanych = "ladowanie" | RodzajBledu;

interface WlasciwosciEkranStanu {
  stan: StanBezDanych;
  /** Tytuł ekranu — ten sam nagłówek `h1` co na ekranie z danymi. */
  tytul: string;
  /** Napis do zdania ładowania i błędu, np. „certyfikatu”, „dokumentów”. */
  czego: string;
  /** Dopełniacz nazwy danych do „Nie znaleziono …”, np. „danych certyfikatu”. */
  czegoNieZnaleziono: string;
  /** Dla kogo jest ekran — zdanie na ekranie odmowy. */
  rolaDocelowa: string;
  onPonow: () => void;
}

/**
 * Stany obu ekranów bez danych — ładowanie, brak dostępu (403 i 401), nie znaleziono,
 * brak połączenia, inny błąd — osadzone w TYM SAMYM szablonie co ekran z danymi, żeby w
 * żadnym stanie nie tracił korzenia (`main#tresc`) ani nagłówka. Odmowę i „nie znaleziono”
 * pokazuje wspólny ekran z `wspolne/ekran-odmowy`.
 */
export function EkranStanu({ stan, tytul, czego, czegoNieZnaleziono, rolaDocelowa, onPonow }: WlasciwosciEkranStanu) {
  const router = useRouter();

  return (
    <ListTemplate
      naglowek={<PageHeader okruszki={[{ etykieta: tytul }]} tytul={tytul} onPowrot={() => router.back()} />}
      lista={
        <TrescStanu
          stan={stan}
          czego={czego}
          czegoNieZnaleziono={czegoNieZnaleziono}
          rolaDocelowa={rolaDocelowa}
          onPonow={onPonow}
          onWroc={() => router.push(ADRES_PULPITU)}
        />
      }
    />
  );
}

function TrescStanu({
  stan,
  czego,
  czegoNieZnaleziono,
  rolaDocelowa,
  onPonow,
  onWroc,
}: Omit<WlasciwosciEkranStanu, "tytul"> & { onWroc: () => void }) {
  const ponow = (
    <Button poziom="outline" onClick={onPonow}>
      Spróbuj ponownie
    </Button>
  );

  switch (stan) {
    case "ladowanie":
      return (
        <div className={style.stos}>
          <p role="status" className={style.stanPusty}>
            Wczytywanie {czego}…
          </p>
          <Skeleton wiersze={6} />
        </div>
      );
    case "siec":
      return (
        <Komunikat wariant="error" tytul="Brak połączenia" akcja={ponow}>
          Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.
        </Komunikat>
      );
    case "blad":
      return (
        <Komunikat wariant="error" tytul={`Nie udało się wczytać ${czego}`} akcja={ponow}>
          Coś poszło nie tak po naszej stronie. Spróbuj ponownie za chwilę.
        </Komunikat>
      );
    case "zakazane":
      return <EkranOdmowy rodzaj="brak-dostepu" stopien={2} rolaDocelowa={rolaDocelowa} przycisk={{ onClick: onWroc }} />;
    case "nie-znaleziono":
      return (
        <EkranOdmowy
          rodzaj="nie-znaleziono"
          czego={czegoNieZnaleziono}
          stopien={2}
          coDalej="Nie mamy dla Ciebie danych do wyświetlenia. Odśwież stronę albo wróć za chwilę."
          przycisk={{ etykieta: "Odśwież", onClick: onPonow }}
        />
      );
  }
}
