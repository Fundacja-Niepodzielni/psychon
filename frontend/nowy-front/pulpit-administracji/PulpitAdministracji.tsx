"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { RecordList } from "@/design-system/organizmy/RecordList/RecordList";
import { DashboardTemplate } from "@/design-system/szablony/DashboardTemplate/DashboardTemplate";
import { pobierzPulpitAdministracji, type PulpitAdministracji as DanePulpitu } from "./dane";
import {
  FORMY_SPRAW,
  jednostka,
  odczytajPulpit,
  rodzajBledu,
  TEKST_BRAK_SPRAW,
  TYTUL_LISTY,
  zbudujWidok,
  type WidokPulpitu,
} from "./widok";
import style from "./PulpitAdministracji.module.css";

const OKRUSZKI = [{ etykieta: "Administracja" }, { etykieta: "Pulpit" }];
const OPIS = "Ile spraw czeka na decyzję i jak idzie program.";

type StanEkranu =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "blad" }
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "gotowy"; dane: DanePulpitu };

/**
 * Ekran „Pulpit administracji” na szablonie `DashboardTemplate`
 * (`GET /admin/dashboard`, `backend/routes/api/h19.php:25`). Liczniki edycji
 * w `StatRow`, sprawy do decyzji w `RecordList` („Co czeka na decyzję”).
 * Akcja główna „Otwórz sprawy” stoi w nagłówku (`przyciskGlowny`, makieta
 * 2.0.4 `.head .acts`) i prowadzi do adresu `link` tych spraw, których czeka
 * najwięcej; bez celu jest niedostępna z powodem pod nagłówkiem. Każdy stan renderuje się wewnątrz szablonu,
 * więc jego korzeń jest jedynym `main`.
 */
export function PulpitAdministracji() {
  const router = useRouter();
  const [stan, setStan] = useState<StanEkranu>({ rodzaj: "ladowanie" });
  const [proba, setProba] = useState(0);
  const [ostrzezenie, setOstrzezenie] = useState<string | null>(null);

  useEffect(() => {
    let aktywny = true;
    pobierzPulpitAdministracji()
      .then((surowe) => {
        if (!aktywny) return;
        const dane = odczytajPulpit(surowe);
        setStan(dane ? { rodzaj: "gotowy", dane } : { rodzaj: "blad" });
      })
      .catch((wyjatek: unknown) => {
        if (!aktywny) return;
        setStan({ rodzaj: rodzajBledu(wyjatek) });
      });
    return () => {
      aktywny = false;
    };
  }, [proba]);

  function wczytajPonownie() {
    setOstrzezenie(null);
    setStan({ rodzaj: "ladowanie" });
    setProba((n) => n + 1);
  }

  const wroc = () => router.back();
  const naglowek = { okruszki: OKRUSZKI, tytul: "Pulpit administracji", opis: OPIS, onPowrot: wroc };

  if (stan.rodzaj === "ladowanie") {
    return (
      <DashboardTemplate
        naglowek={naglowek}
        glowna={<Skeleton wiersze={4} />}
        wspierajaca={<Skeleton wiersze={3} />}
      />
    );
  }

  if (stan.rodzaj === "brak-uprawnien") {
    return (
      <DashboardTemplate
        naglowek={naglowek}
        glowna={
          <EmptyState
            wariant="brak-uprawnien"
            naglowek="Pulpit dla administracji"
            rola="administracji"
            przycisk={{ etykieta: "Wróć", onClick: wroc }}
          />
        }
        wspierajaca={null}
      />
    );
  }

  if (stan.rodzaj === "blad") {
    return (
      <DashboardTemplate
        naglowek={naglowek}
        glowna={
          <Notice
            wariant="error"
            tytul="Nie udało się wczytać pulpitu"
            akcja={
              <Button poziom="outline" onClick={wczytajPonownie}>
                Spróbuj ponownie
              </Button>
            }
          >
            Serwer nie odpowiedział albo zwrócił błąd. Liczby nie są zmyślane bez danych.
          </Notice>
        }
        wspierajaca={null}
      />
    );
  }

  const widok = zbudujWidok(stan.dane);
  const otworz = () => {
    if (widok.cel) {
      router.push(widok.cel.link);
    } else {
      setOstrzezenie(widok.powodBrakuCelu);
    }
  };

  return (
    <DashboardTemplate
      naglowek={{
        ...naglowek,
        przyciskGlowny: {
          etykieta: "Otwórz sprawy",
          onKliknij: otworz,
          niedostepny: widok.cel ? undefined : { powod: widok.powodBrakuCelu ?? TEKST_BRAK_SPRAW },
        },
      }}
      kafle={widok.kafle}
      glowna={
        <div className={style.kolumna}>
          {ostrzezenie && (
            <Notice wariant="warn" tytul="Nie można otworzyć spraw">
              {ostrzezenie}
            </Notice>
          )}
          <ListaSpraw widok={widok} naNieprawidlowyAdres={setOstrzezenie} naOdswiez={wczytajPonownie} />
        </div>
      }
      wspierajaca={null}
    />
  );
}

function ListaSpraw({
  widok,
  naNieprawidlowyAdres,
  naOdswiez,
}: {
  widok: WidokPulpitu;
  naNieprawidlowyAdres: (tresc: string) => void;
  naOdswiez: () => void;
}) {
  return (
    <RecordList
      tytul={TYTUL_LISTY}
      stopienNaglowka={2}
      jednostkaSumy={(liczba) => jednostka(liczba, FORMY_SPRAW)}
      wiersze={
        widok.brakSpraw
          ? []
          : widok.wiersze.map((wiersz) => ({
              id: wiersz.id,
              tytul: wiersz.nazwa,
              wartosc: wiersz.liczba,
              plakietka:
                wiersz.liczba > 0
                  ? { wariant: "warn" as const, tekst: "czeka na decyzję" }
                  : { wariant: "neutral" as const, tekst: "brak spraw" },
              akcja: {
                etykieta: "Otwórz",
                etykietaDostepna: `Otwórz: ${wiersz.nazwa}`,
                ...(wiersz.link
                  ? { href: wiersz.link }
                  : { onKliknij: () => naNieprawidlowyAdres("Adres tych spraw z odpowiedzi serwera jest nieprawidłowy.") }),
              },
            }))
      }
      pusty={{
        naglowek: TEKST_BRAK_SPRAW,
        tresc: "Nic nie czeka na decyzję administracji. Nowe sprawy pojawią się tutaj.",
        przycisk: { etykieta: "Odśwież", onClick: naOdswiez },
      }}
    />
  );
}
