"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { CaseCard } from "@/design-system/organizmy/CaseCard/CaseCard";
import { RecordList } from "@/design-system/organizmy/RecordList/RecordList";
import { DashboardTemplate } from "@/design-system/szablony/DashboardTemplate/DashboardTemplate";
import { pobierzPulpitAdministracji, type PulpitAdministracji as DanePulpitu } from "./dane";
import { odczytajPulpit, rodzajBledu, TEKST_BRAK_SPRAW, zbudujWidok, type WidokPulpitu } from "./widok";
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
 * w `StatRow`, sprawy do decyzji w `RecordList`, „od czego zacząć” w
 * `CaseCard`. Akcja główna „Otwórz sprawy” prowadzi do adresu `link` tych
 * spraw, których czeka najwięcej. Każdy stan renderuje się wewnątrz szablonu,
 * więc jego korzeń jest jedynym `main`.
 */
export function PulpitAdministracji() {
  const router = useRouter();
  const idPowodu = useId();
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
            naglowek="Brak dostępu do pulpitu"
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
        dzieci: (
          <div className={style.akcjaGlowna}>
            <Button
              poziom="primary"
              onClick={otworz}
              aria-disabled={widok.cel ? undefined : true}
              aria-describedby={widok.cel ? undefined : idPowodu}
            >
              Otwórz sprawy
            </Button>
            {!widok.cel && widok.powodBrakuCelu && <Hint id={idPowodu}>{widok.powodBrakuCelu}</Hint>}
          </div>
        ),
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
      wspierajaca={widok.cel ? <OdCzegoZaczac cel={widok.cel} /> : null}
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
      tytul="Sprawy do decyzji"
      jednostkaSumy="spraw"
      wiersze={
        widok.brakSpraw
          ? []
          : widok.wiersze.map((wiersz) => ({
              id: wiersz.id,
              tytul: wiersz.nazwa,
              wartosc: wiersz.liczba,
              plakietka:
                wiersz.liczba > 0
                  ? { wariant: "warn" as const, tekst: "Czeka na decyzję" }
                  : { wariant: "neutral" as const, tekst: "Brak spraw" },
              akcja: {
                etykieta: `Otwórz: ${wiersz.nazwa}`,
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

function OdCzegoZaczac({ cel }: { cel: NonNullable<WidokPulpitu["cel"]> }) {
  return (
    <CaseCard
      rodzaj="ze-statystyka"
      tytul="Od czego zacząć"
      pary={[
        { etykieta: "Sprawy", wartosc: cel.nazwa },
        { etykieta: "Stan", wartosc: "czeka na decyzję" },
      ]}
      statystyka={{ id: "pulpit-najwiecej-spraw", etykieta: "Czeka na decyzję", wartosc: cel.liczba, mianownik: "spraw" }}
    />
  );
}
