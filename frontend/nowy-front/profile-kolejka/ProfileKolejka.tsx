"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Field } from "@/design-system/molekuly/Field/Field";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Pagination } from "@/design-system/molekuly/Pagination/Pagination";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { RecordList } from "@/design-system/organizmy/RecordList/RecordList";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";
import type { PaginationMeta } from "@/lib/api/klient";
import { EkranOdmowy } from "@/nowy-front/wspolne/ekran-odmowy";
import {
  STAN_DO_DECYZJI,
  OPCJE_STANU,
  adresWniosku,
  czyBrakUprawnien,
  nazwaOsoby,
  plakietkaStanu,
  pobierzWnioski,
  podpisWniosku,
  type StanWniosku,
  type WniosekOProfil,
} from "./dane";

type StanListy =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "blad" }
  | { rodzaj: "gotowy"; wnioski: WniosekOProfil[]; meta: PaginationMeta | undefined };

const OKRUSZKI = [{ etykieta: "Administracja" }, { etykieta: "Wnioski o profil psychologa" }];

/**
 * Ekran wniosków o profil psychologa na szablonie `ListTemplate`: nagłówek,
 * filtr stanu (jedyny parametr, który przyjmuje `GET /admin/profiles`),
 * `RecordList` z jednym wierszem na wniosek i stronicowanie. Domyślnie lista
 * pokazuje wnioski czekające na decyzję. Wiersz ma jedną akcję, „Otwórz
 * wniosek” — przejście na ekran decyzji; ten ekran niczego nie zapisuje.
 * Każdy stan (ładowanie, dane, pusty, brak uprawnień, błąd sieci) stoi
 * w obszarach szablonu, więc jedyny `main` jest korzeniem szablonu.
 */
export function ProfileKolejka() {
  const router = useRouter();
  const [stan, setStan] = useState<StanListy>({ rodzaj: "ladowanie" });
  const [filtr, setFiltr] = useState<StanWniosku>(STAN_DO_DECYZJI);
  const [strona, setStrona] = useState(1);
  const [proba, setProba] = useState(0);

  useEffect(() => {
    let aktualne = true;
    pobierzWnioski(filtr, strona)
      .then(({ wnioski, meta }) => {
        if (!aktualne) return;
        setStan({ rodzaj: "gotowy", wnioski, meta });
      })
      .catch((blad: unknown) => {
        if (!aktualne) return;
        setStan(czyBrakUprawnien(blad) ? { rodzaj: "brak-uprawnien" } : { rodzaj: "blad" });
      });
    return () => {
      aktualne = false;
    };
  }, [filtr, strona, proba]);

  function ponow() {
    setStan({ rodzaj: "ladowanie" });
    setProba((p) => p + 1);
  }

  function zmienFiltr(wartosc: string) {
    setStan({ rodzaj: "ladowanie" });
    setStrona(1);
    setFiltr(wartosc as StanWniosku);
  }

  function zmienStrone(nowa: number) {
    setStan({ rodzaj: "ladowanie" });
    setStrona(nowa);
  }

  const naglowek = (
    <PageHeader
      okruszki={OKRUSZKI}
      tytul="Wnioski o profil psychologa"
      opis="Otwórz wniosek, żeby ocenić go i załączniki."
      onPowrot={() => router.back()}
    />
  );

  if (stan.rodzaj === "brak-uprawnien") {
    return (
      <ListTemplate
        naglowek={naglowek}
        lista={
          <EkranOdmowy
            rodzaj="brak-dostepu"
            stopien={2}
            rolaDocelowa="administracji"
            przycisk={{ etykieta: "Wróć", onClick: () => router.back() }}
          />
        }
      />
    );
  }

  const filtry = (
    <Field
      id="wnioski-stan"
      etykieta="Stan wniosku"
      rodzaj="wybor"
      opcje={OPCJE_STANU}
      wartosc={filtr}
      onZmiana={zmienFiltr}
    />
  );

  if (stan.rodzaj === "ladowanie") {
    return <ListTemplate naglowek={naglowek} filtry={filtry} lista={<Skeleton wiersze={5} />} />;
  }

  if (stan.rodzaj === "blad") {
    return (
      <ListTemplate
        naglowek={naglowek}
        filtry={filtry}
        lista={
          <Notice
            wariant="error"
            tytul="Nie udało się wczytać wniosków"
            akcja={
              <Button poziom="outline" onClick={ponow}>
                Spróbuj ponownie
              </Button>
            }
          >
            Serwer nie odpowiedział albo zwrócił błąd. Żadne dane nie zostały zmienione.
          </Notice>
        }
      />
    );
  }

  const { wnioski, meta } = stan;
  const doDecyzji = filtr === STAN_DO_DECYZJI;

  return (
    <ListTemplate
      naglowek={naglowek}
      filtry={filtry}
      lista={
        <RecordList
          tytul="Wnioski o profil psychologa"
          wiersze={wnioski.map((wniosek) => {
            const plakietka = plakietkaStanu(wniosek.status);
            return {
              id: String(wniosek.id),
              tytul: nazwaOsoby(wniosek),
              podpowiedz: podpisWniosku(wniosek),
              plakietka: { wariant: plakietka.wariant, tekst: plakietka.etykieta },
              akcja: { etykieta: "Otwórz wniosek", href: adresWniosku(wniosek.id) },
            };
          })}
          pusty={{
            naglowek: doDecyzji ? "Brak wniosków do decyzji" : "Brak wniosków w wybranym stanie",
            tresc: doDecyzji
              ? "Nowe wnioski pojawią się tutaj, gdy psychologowie je złożą."
              : "Zmień stan wniosku w filtrze, żeby zobaczyć inne wnioski.",
            przycisk: { etykieta: "Odśwież", onClick: ponow },
          }}
        />
      }
      stronicowanie={
        meta && meta.last_page > 1 ? (
          <Pagination
            strona={meta.current_page}
            stron={meta.last_page}
            naPoprzednia={() => zmienStrone(meta.current_page - 1)}
            naNastepna={() => zmienStrone(meta.current_page + 1)}
          />
        ) : undefined
      }
    />
  );
}
