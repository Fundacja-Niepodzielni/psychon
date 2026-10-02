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
import { ApiError, type PaginationMeta } from "@/lib/api/klient";
import type { AdminUserListItem, UserRole } from "@/lib/api/h18";
import {
  OPCJE_ROLI,
  PUSTY_FILTR,
  SCIEZKA_ZGLOSZEN,
  filtrAktywny,
  pobierzOsoby,
  pobierzTabele,
  rodzajBledu,
  wierszeOsob,
  KOLUMNY_OSOB,
  type FiltrOsob,
} from "./dane";
import style from "./OsobyLista.module.css";

type StanEkranu =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "dane"; osoby: AdminUserListItem[]; meta: PaginationMeta | undefined }
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "siec" };

type StanPobrania = { rodzaj: "spoczynek" } | { rodzaj: "trwa" } | { rodzaj: "gotowe" } | { rodzaj: "blad"; komunikat: string };

interface Zapytanie {
  filtr: FiltrOsob;
  strona: number;
  /** Rośnie przy każdym ponowieniu, żeby to samo zapytanie wczytało się jeszcze raz. */
  proba: number;
}

const OKRUSZKI = [{ etykieta: "Administracja" }, { etykieta: "Osoby" }];

/**
 * Ekran A-06 „Osoby” — lista osób na szablonie `ListTemplate`
 * (administracja). Trasy: `GET /admin/users` (lista) i
 * `GET /admin/users/export.csv` (akcja drugorzędna nagłówka „Pobierz tabelę
 * (Excel)”, z bieżącym filtrem; `PageHeader.akcjaDrugorzedna`). Wiersz osoby to
 * wzór wiersza kolejki spraw (`wierszeOsob`): pogrubione imię i nazwisko, meta,
 * plakietka małą literą i akcja „Otwórz” (pełna nazwa „Otwórz kartę: …” tylko
 * dla czytnika), tekst równo z nagłówkiem ekranu; nagłówek `h2` listy jest
 * tylko dla czytnika.
 * Dawna zakładka „Zgłoszenia” tej trasy to dziś osobny ekran (`/admin/nabor`):
 * dojście do niego to zwykły odnośnik pod `h1` (po potwierdzeniu roli odczytem
 * listy) i przycisk pustego stanu; „Otwórz” prowadzi na kartę osoby pod
 * trasą produktu.
 * Stany: ładowanie, dane, dwa różne stany puste (z filtrem i bez), brak
 * uprawnień, błąd sieci — każdy w tym samym szablonie.
 */
interface WlasciwosciOsobyLista {
  /**
   * Adres ekranu zakładania konta. Podaje go strona, pod którą ten ekran
   * naprawdę stoi; bez adresu lista nie pokazuje przycisku „Dodaj osobę”,
   * żeby przycisk główny nigdy nie prowadził donikąd.
   */
  adresNowejOsoby?: string;
}

export function OsobyLista({ adresNowejOsoby }: WlasciwosciOsobyLista = {}) {
  const router = useRouter();
  const [formularz, setFormularz] = useState<FiltrOsob>(PUSTY_FILTR);
  const [zapytanie, setZapytanie] = useState<Zapytanie>({ filtr: PUSTY_FILTR, strona: 1, proba: 0 });
  const [stan, setStan] = useState<StanEkranu>({ rodzaj: "ladowanie" });
  const [pobranie, setPobranie] = useState<StanPobrania>({ rodzaj: "spoczynek" });

  useEffect(() => {
    let anulowane = false;
    pobierzOsoby(zapytanie.filtr, zapytanie.strona)
      .then(({ data, meta }) => {
        if (!anulowane) setStan({ rodzaj: "dane", osoby: data, meta });
      })
      .catch((wyjatek: unknown) => {
        if (!anulowane) setStan({ rodzaj: rodzajBledu(wyjatek) });
      });
    return () => {
      anulowane = true;
    };
  }, [zapytanie]);

  function przejdz(filtr: FiltrOsob, strona: number) {
    setStan({ rodzaj: "ladowanie" });
    setPobranie({ rodzaj: "spoczynek" });
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

  async function pobierzTabeleOsob() {
    setPobranie({ rodzaj: "trwa" });
    try {
      await pobierzTabele(zapytanie.filtr);
      setPobranie({ rodzaj: "gotowe" });
    } catch (wyjatek) {
      setPobranie({
        rodzaj: "blad",
        komunikat: wyjatek instanceof ApiError ? wyjatek.message : "Sprawdź połączenie z internetem i spróbuj jeszcze raz.",
      });
    }
  }

  const meta = stan.rodzaj === "dane" ? stan.meta : undefined;
  const opis =
    meta !== undefined
      ? `Wolontariusze, studenci, prowadzący i administracja. Razem osób: ${meta.total}.`
      : "Wolontariusze, studenci, prowadzący i administracja.";
  const mozeEksportowac = stan.rodzaj === "dane" && stan.osoby.length > 0;

  const naglowek = (
    <PageHeader
      okruszki={OKRUSZKI}
      tytul="Osoby"
      opis={opis}
      onPowrot={() => router.back()}
      akcja={stan.rodzaj === "dane" ? { etykieta: "Zgłoszenia rekrutacyjne", href: SCIEZKA_ZGLOSZEN } : undefined}
      przyciskGlowny={
        adresNowejOsoby !== undefined && stan.rodzaj !== "brak-uprawnien"
          ? { etykieta: "Dodaj osobę", onKliknij: () => router.push(adresNowejOsoby) }
          : undefined
      }
      akcjaDrugorzedna={
        mozeEksportowac
          ? {
              etykieta: pobranie.rodzaj === "trwa" ? "Pobieranie…" : "Pobierz tabelę (Excel)",
              onKliknij: () => void pobierzTabeleOsob(),
              wylaczona: pobranie.rodzaj === "trwa",
            }
          : undefined
      }
    />
  );

  if (stan.rodzaj === "brak-uprawnien") {
    return (
      <ListTemplate
        naglowek={naglowek}
        lista={
          <EmptyState
            wariant="brak-uprawnien"
            naglowek="Lista osób jest niedostępna"
            rola="administracji"
            przycisk={{ etykieta: "Wróć", onClick: () => router.back() }}
          />
        }
      />
    );
  }

  const aktywny = filtrAktywny(zapytanie.filtr);

  const filtry = (
    <>
      {pobranie.rodzaj === "blad" && (
        <Notice wariant="error" tytul="Nie udało się pobrać tabeli">
          {pobranie.komunikat}
        </Notice>
      )}
      {pobranie.rodzaj === "gotowe" && (
        <Notice wariant="ok" tytul="Tabela pobrana">
          Plik zawiera osoby spełniające bieżący filtr.
        </Notice>
      )}
      <form className={style.filtry} onSubmit={zastosujFiltr} aria-label="Filtr osób">
        <div className={style.rola}>
          <Field
            id="osoby-rola"
            etykieta="Rola"
            rodzaj="wybor"
            opcje={OPCJE_ROLI}
            wartosc={formularz.role}
            onZmiana={(wartosc) => setFormularz((f) => ({ ...f, role: wartosc as UserRole | "" }))}
          />
        </div>
        <div className={style.szukaj}>
          <Field
            id="osoby-szukaj"
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
    </>
  );

  let lista: ReactNode;
  if (stan.rodzaj === "ladowanie") {
    lista = <Skeleton wiersze={5} />;
  } else if (stan.rodzaj === "siec") {
    lista = (
      <Notice
        wariant="error"
        tytul="Nie udało się wczytać listy osób"
        akcja={
          <Button poziom="outline" onClick={() => przejdz(zapytanie.filtr, zapytanie.strona)}>
            Spróbuj ponownie
          </Button>
        }
      >
        Sprawdź połączenie z internetem i spróbuj jeszcze raz.
      </Notice>
    );
  } else if (stan.osoby.length === 0 && aktywny) {
    lista = (
      <EmptyState
        wariant="brak-wynikow-filtra"
        naglowek="Brak osób spełniających filtr"
        tresc="Zmień rolę albo szukaną frazę, albo wyczyść filtr."
        przycisk={{ etykieta: "Wyczyść filtr", onClick: wyczyscFiltr }}
      />
    );
  } else if (stan.osoby.length === 0) {
    lista = (
      <EmptyState
        naglowek="Brak osób w programie"
        tresc="Osoby pojawią się tu po zatwierdzeniu zgłoszenia rekrutacyjnego."
        przycisk={{ etykieta: "Przejdź do zgłoszeń", onClick: () => router.push(SCIEZKA_ZGLOSZEN) }}
      />
    );
  } else {
    lista = (
      <RecordList
        tytul="Lista osób"
        stopienNaglowka={2}
        naglowekTylkoDlaCzytnika
        naKarcie
        kolumny={KOLUMNY_OSOB}
        wiersze={wierszeOsob(stan.osoby)}
        pusty={{
          naglowek: "Brak osób",
          tresc: "Nie ma osób do pokazania.",
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
