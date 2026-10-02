"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";
import { ADRES_PULPITU, EkranOdmowy } from "@/nowy-front/wspolne/ekran-odmowy";
import { ListaKursow } from "../pulpit/ListaKursow";
import { rodzajBledu, type RodzajBledu } from "../pulpit/rodzaj-bledu";
import { pobierzKursy, pobierzSzczegolKursu, type KursSciezki } from "./dane";
import { KomunikatStanu } from "./KomunikatStanu";
import {
  adresKroku,
  etykietaKroku,
  kursWToku,
  OPIS_EKRANU,
  podliniaKursu,
  ulozKursy,
  wyliczKrokListy,
  type SzczegolyKursuWToku,
} from "./logika";
import style from "./KursyUczestnika.module.css";

type StanEkranu = "ladowanie" | RodzajBledu | "ok";

const OKRUSZKI = [{ etykieta: "Moje kursy" }];
const TYTUL_LISTY = "Twoje kursy";

/**
 * Ekran „Moje kursy” uczestnika (stara strona: `app/(uczestnik)/panel/kursy/page.tsx`)
 * na szablonie `ListTemplate`. Te same stany, słowa i kolejność wierszy co lista
 * ścieżki na pulpicie (`ListaKursow`): „ukończony · w toku · zamknięty”, zdanie
 * wyjaśniające, który kurs trzeba ukończyć przed zamkniętym. Każdy otwarty kurs
 * prowadzi na stronę kursu.
 *
 * Jedyny zielony przycisk stoi w nagłówku strony: „Wróć do lekcji” przy kursie
 * w toku (szczegóły kursu w toku czyta ta sama trasa co pulpit; jej błąd nie psuje
 * listy — przycisk zmienia się wtedy w „Otwórz kurs”).
 *
 * Krytyczny jest tylko `GET /courses`: jego błąd daje jeden ze stanów bez danych
 * (brak połączenia, błąd serwera, brak dostępu, nie znaleziono).
 */
export function KursyUczestnika() {
  const router = useRouter();
  const [stan, setStan] = useState<StanEkranu>("ladowanie");
  const [kursy, setKursy] = useState<KursSciezki[]>([]);
  const [szczegoly, setSzczegoly] = useState<SzczegolyKursuWToku>({ stan: "ladowanie" });

  const wczytaj = useCallback((straz?: { anulowane: boolean }) => {
    pobierzKursy().then(
      (lista) => {
        if (straz?.anulowane) return;
        const ulozone = ulozKursy(lista);
        setKursy(ulozone);
        setStan("ok");
        const wToku = kursWToku(ulozone);
        if (wToku === undefined) {
          setSzczegoly({ stan: "brak" });
          return;
        }
        setSzczegoly({ stan: "ladowanie" });
        pobierzSzczegolKursu(wToku.slug).then(
          (szczegol) => {
            if (!straz?.anulowane) setSzczegoly({ stan: "ok", lekcje: szczegol.lessons });
          },
          () => {
            if (!straz?.anulowane) setSzczegoly({ stan: "blad" });
          },
        );
      },
      (wyjatek: unknown) => {
        if (straz?.anulowane) return;
        setStan(rodzajBledu(wyjatek));
      },
    );
  }, []);

  const ponow = useCallback(() => {
    setStan("ladowanie");
    wczytaj();
  }, [wczytaj]);

  useEffect(() => {
    const straz = { anulowane: false };
    wczytaj(straz);
    return () => {
      straz.anulowane = true;
    };
  }, [wczytaj]);

  const krok = stan === "ok" ? wyliczKrokListy(kursy, szczegoly) : null;
  const naglowek = (
    <PageHeader
      okruszki={OKRUSZKI}
      tytul="Moje kursy"
      opis={OPIS_EKRANU}
      onPowrot={() => router.back()}
      przyciskGlowny={krok === null ? undefined : { etykieta: etykietaKroku(krok), onKliknij: () => router.push(adresKroku(krok)) }}
    />
  );

  return <ListTemplate naglowek={naglowek} lista={<TrescListy stan={stan} kursy={kursy} onPonow={ponow} />} />;
}

function TrescListy({ stan, kursy, onPonow }: { stan: StanEkranu; kursy: KursSciezki[]; onPonow: () => void }) {
  const router = useRouter();

  switch (stan) {
    case "ladowanie":
      return (
        <div className={style.ladowanie}>
          <div role="status">
            <Text>Ładowanie kursów…</Text>
          </div>
          <Skeleton wiersze={6} />
        </div>
      );
    case "siec":
      return (
        <KomunikatStanu
          tytul="Brak połączenia"
          akcja={
            <Button poziom="outline" onClick={onPonow}>
              Spróbuj ponownie
            </Button>
          }
        >
          Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.
        </KomunikatStanu>
      );
    case "blad":
      return (
        <KomunikatStanu
          tytul="Nie udało się wczytać kursów"
          akcja={
            <Button poziom="outline" onClick={onPonow}>
              Spróbuj ponownie
            </Button>
          }
        >
          Coś poszło nie tak po naszej stronie. Spróbuj ponownie za chwilę.
        </KomunikatStanu>
      );
    case "zakazane":
      return (
        <EkranOdmowy
          rodzaj="brak-dostepu"
          stopien={2}
          rolaDocelowa="uczestników"
          przycisk={{ onClick: () => router.push(ADRES_PULPITU) }}
        />
      );
    case "nie-znaleziono":
      return (
        <EkranOdmowy
          rodzaj="nie-znaleziono"
          czego="kursów"
          stopien={2}
          coDalej="Nie mamy dla Ciebie kursów do wyświetlenia. Odśwież stronę albo wróć za chwilę."
          przycisk={{ etykieta: "Odśwież", onClick: onPonow }}
        />
      );
    case "ok":
      return (
        <ListaKursow
          tytul={TYTUL_LISTY}
          kursy={kursy}
          podpowiedz={podliniaKursu}
          pusty={{
            naglowek: "Nie masz jeszcze kursów",
            tresc: "Gdy opiekun projektu udostępni Ci pierwszy etap, pojawi się on w tym miejscu.",
            przycisk: { etykieta: "Odśwież", onClick: onPonow },
          }}
        />
      );
  }
}
