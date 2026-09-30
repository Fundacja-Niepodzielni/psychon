"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Field } from "@/design-system/molekuly/Field/Field";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Pagination } from "@/design-system/molekuly/Pagination/Pagination";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { RecordList } from "@/design-system/organizmy/RecordList/RecordList";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";
import type { PaginationMeta } from "@/lib/api/klient";
import type { ApplicationItem, ApplicationStatus } from "@/lib/h03/types";
import {
  OPCJE_STATUSU,
  PUSTY_FILTR,
  SCIEZKA_WCZYTANIA_Z_PLIKU,
  filtrAktywny,
  pobierzZgloszenia,
  rodzajBledu,
  wierszeZgloszen,
  type FiltrZgloszen,
} from "./dane";
import style from "./ZgloszeniaLista.module.css";

type StanEkranu =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "dane"; zgloszenia: ApplicationItem[]; meta: PaginationMeta | undefined }
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "siec" };

interface Zapytanie {
  filtr: FiltrZgloszen;
  strona: number;
  /** Rośnie przy każdym ponowieniu, żeby to samo zapytanie wczytało się jeszcze raz. */
  proba: number;
}

const OKRUSZKI = [{ etykieta: "Administracja" }, { etykieta: "Zgłoszenia rekrutacyjne" }];

/**
 * Ekran A-03 „Zgłoszenia rekrutacyjne” — lista na szablonie `ListTemplate`
 * (administracja). Jedyna trasa: `GET /admin/applications`. Główna akcja to
 * „Otwórz zgłoszenie” w każdym wierszu (odnośnik do ekranu szczegółu).
 * Stany: ładowanie, dane, pusty (z filtrem i bez), brak uprawnień, błąd sieci
 * — każdy w tym samym szablonie, więc jeden `main` i znacznik szablonu są
 * zawsze w drzewie.
 */
export function ZgloszeniaLista() {
  const router = useRouter();
  const [formularz, setFormularz] = useState<FiltrZgloszen>(PUSTY_FILTR);
  const [zapytanie, setZapytanie] = useState<Zapytanie>({ filtr: PUSTY_FILTR, strona: 1, proba: 0 });
  const [stan, setStan] = useState<StanEkranu>({ rodzaj: "ladowanie" });

  useEffect(() => {
    let anulowane = false;
    pobierzZgloszenia(zapytanie.filtr, zapytanie.strona)
      .then(({ data, meta }) => {
        if (!anulowane) setStan({ rodzaj: "dane", zgloszenia: data, meta });
      })
      .catch((wyjatek: unknown) => {
        if (!anulowane) setStan({ rodzaj: rodzajBledu(wyjatek) });
      });
    return () => {
      anulowane = true;
    };
  }, [zapytanie]);

  function przejdz(filtr: FiltrZgloszen, strona: number) {
    setStan({ rodzaj: "ladowanie" });
    setZapytanie((poprzednie) => ({ filtr, strona, proba: poprzednie.proba + 1 }));
  }

  function zastosujFiltr(zdarzenie: FormEvent<HTMLFormElement>) {
    zdarzenie.preventDefault();
    const filtr = { ...formularz, search: formularz.search.trim() };
    setFormularz(filtr);
    przejdz(filtr, 1);
  }

  function wyczyscFiltr() {
    setFormularz(PUSTY_FILTR);
    przejdz(PUSTY_FILTR, 1);
  }

  const meta = stan.rodzaj === "dane" ? stan.meta : undefined;
  const opis =
    meta !== undefined
      ? `Kandydaci zgłoszeni do programu. Razem zgłoszeń: ${meta.total}.`
      : "Kandydaci zgłoszeni do programu.";

  const naglowek = (
    <PageHeader okruszki={OKRUSZKI} tytul="Zgłoszenia rekrutacyjne" opis={opis} onPowrot={() => router.back()} />
  );

  if (stan.rodzaj === "brak-uprawnien") {
    return (
      <ListTemplate
        naglowek={naglowek}
        lista={
          <EmptyState
            wariant="brak-uprawnien"
            naglowek="Lista zgłoszeń jest niedostępna"
            rola="administracji"
            przycisk={{ etykieta: "Wróć", onClick: () => router.back() }}
          />
        }
      />
    );
  }

  const aktywny = filtrAktywny(zapytanie.filtr);

  const filtry = (
    <form className={style.filtry} onSubmit={zastosujFiltr} aria-label="Filtr zgłoszeń">
      <div className={style.stan}>
        <Field
          id="zgloszenia-stan"
          etykieta="Stan"
          rodzaj="wybor"
          opcje={OPCJE_STATUSU}
          wartosc={formularz.status}
          onZmiana={(wartosc) => setFormularz((f) => ({ ...f, status: wartosc as ApplicationStatus | "" }))}
        />
      </div>
      <div className={style.szukaj}>
        <Field
          id="zgloszenia-szukaj"
          etykieta="Szukaj"
          rodzaj="tekst"
          placeholder="Imię, nazwisko lub e-mail"
          wartosc={formularz.search}
          onZmiana={(wartosc) => setFormularz((f) => ({ ...f, search: wartosc }))}
        />
      </div>
      <Button poziom="outline" type="submit">
        Filtruj
      </Button>
      {aktywny && (
        <Button poziom="outline" type="button" onClick={wyczyscFiltr}>
          Wyczyść filtr
        </Button>
      )}
    </form>
  );

  let lista: ReactNode;
  if (stan.rodzaj === "ladowanie") {
    lista = <Skeleton wiersze={5} />;
  } else if (stan.rodzaj === "siec") {
    lista = (
      <Notice
        wariant="error"
        tytul="Nie udało się wczytać zgłoszeń"
        akcja={
          <Button poziom="outline" onClick={() => przejdz(zapytanie.filtr, zapytanie.strona)}>
            Spróbuj ponownie
          </Button>
        }
      >
        Sprawdź połączenie z internetem i spróbuj jeszcze raz.
      </Notice>
    );
  } else if (stan.zgloszenia.length === 0 && aktywny) {
    lista = (
      <EmptyState
        wariant="brak-wynikow-filtra"
        naglowek="Brak zgłoszeń spełniających filtr"
        tresc="Zmień stan albo szukaną frazę, albo wyczyść filtr."
        przycisk={{ etykieta: "Wyczyść filtr", onClick: wyczyscFiltr }}
      />
    );
  } else if (stan.zgloszenia.length === 0) {
    lista = (
      <EmptyState
        naglowek="Brak zgłoszeń w tym roku programu"
        tresc="Zgłoszenia pojawią się tu po zgłoszeniu się kandydatów. Możesz też wczytać je z pliku."
        przycisk={{ etykieta: "Wczytaj zgłoszenia z pliku", onClick: () => router.push(SCIEZKA_WCZYTANIA_Z_PLIKU) }}
      />
    );
  } else {
    lista = (
      <RecordList
        tytul="Lista zgłoszeń"
        wiersze={wierszeZgloszen(stan.zgloszenia)}
        pusty={{
          naglowek: "Brak zgłoszeń",
          tresc: "Nie ma zgłoszeń do pokazania.",
          przycisk: { etykieta: "Wyczyść filtr", onClick: wyczyscFiltr },
        }}
      />
    );
  }

  const stronicowanie =
    meta !== undefined && meta.last_page > 1 ? (
      <Pagination
        strona={meta.current_page}
        stron={meta.last_page}
        naPoprzednia={() => przejdz(zapytanie.filtr, meta.current_page - 1)}
        naNastepna={() => przejdz(zapytanie.filtr, meta.current_page + 1)}
      />
    ) : undefined;

  return <ListTemplate naglowek={naglowek} filtry={filtry} lista={lista} stronicowanie={stronicowanie} />;
}
