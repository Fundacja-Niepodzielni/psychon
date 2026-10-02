"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { Field } from "@/design-system/molekuly/Field/Field";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Pagination } from "@/design-system/molekuly/Pagination/Pagination";
import { EmptyStateCard } from "@/design-system/organizmy/EmptyStateCard/EmptyStateCard";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";
import { ApiError, type PaginationMeta } from "@/lib/api/klient";
import type { GrupaZdarzen, WpisDziennika } from "@/lib/api/h20-dziennik";
import { EkranOdmowy } from "../wspolne/ekran-odmowy";
import {
  bladZakresu,
  filtrAktywny,
  komunikatWyniku,
  licznik,
  NAZWY_ZAKRESOW,
  nazwaOsobyZWpisow,
  opiszWpis,
  pobierzPlik,
  pobierzRokProgramu,
  pobierzStrone,
  PUSTY_FILTR,
  rodzajBledu,
  zakres,
  zakresOdDzis,
  type BladOdczytu,
  type FiltrDziennika,
  type GotowyZakres,
} from "./dane";
import { GRUPY } from "./slownik";
import { TabelaWpisow } from "./TabelaWpisow";
import style from "./DziennikDzialan.module.css";

export const TYTUL = "Dziennik działań";
export const OPIS = "Dziennik pokazuje, kto i kiedy wykonał w systemie ważne czynności. Nie zapisujemy w nim treści danych.";
export const ETYKIETA_POBRANIA = "Pobierz to, co widać (Excel)";
export const UWAGA_POBRANIA = "Plik zawiera nazwiska. Nie wysyłaj go poza Fundację.";

const OKRUSZKI = [{ etykieta: "Administracja" }, { etykieta: TYTUL }];

/** Czas od ostatniego znaku w polu wyszukiwania do odczytu listy. */
export const ZWLOKA_SZUKANIA_MS = 400;

type StanEkranu =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "dane"; wpisy: WpisDziennika[]; meta: PaginationMeta | undefined }
  | { rodzaj: "blad"; blad: BladOdczytu };

type StanPobrania = { rodzaj: "spoczynek" } | { rodzaj: "trwa" } | { rodzaj: "gotowe" } | { rodzaj: "blad"; komunikat: string };

interface Zapytanie {
  filtr: FiltrDziennika;
  strona: number;
  /** Rośnie przy każdym odczycie, żeby to samo zapytanie wczytało się jeszcze raz. */
  proba: number;
  /** Odczyt po zmianie filtra albo strony — jego wynik ogłasza czytnik ekranu. */
  oglos: boolean;
}

interface WlasciwosciDziennika {
  /** Osoba ze znacznika „Dotyczy” (z adresu `?dotyczy=`, np. z karty osoby) albo `null`. */
  dotyczy: number | null;
  /** Usunięcie znacznika „Dotyczy” — wołający zdejmuje parametr z adresu. */
  onUsunDotyczy: () => void;
}

/**
 * Ekran „Dziennik działań” (administracja) na szablonie `ListTemplate`, tak
 * jak ekrany „Osoby” i „Sprawy”: nagłówek z opisem i akcją „Pobierz to, co
 * widać (Excel)”, pasek filtrów (Od, Do z gotowymi zakresami, Rodzaj, Kogo
 * dotyczy, Kto), licznik „25 z 482”, wpisy i stronicowanie. Każdy stan —
 * ładowanie, błąd, brak połączenia, brak dostępu, nie znaleziono, pusty
 * dziennik, brak wyników filtra, lista — stoi w obszarach szablonu, więc
 * jedyny `main` jest zawsze korzeniem szablonu.
 *
 * Zmiana filtra odczytuje listę od razu (pola wyszukiwania po chwili przerwy
 * w pisaniu albo po Enter) i nie przebudowuje paska filtrów — fokus zostaje
 * w polu, a czytnik ekranu słyszy „Pokazano 25 z 482 wpisów”. Odczyty biegną
 * z przeglądarki, tak jak na pozostałych ekranach nowego frontu.
 */
export function DziennikDzialan({ dotyczy, onUsunDotyczy }: WlasciwosciDziennika) {
  const router = useRouter();
  const [pola, setPola] = useState<FiltrDziennika>(PUSTY_FILTR);
  const [zapytanie, setZapytanie] = useState<Zapytanie>({ filtr: PUSTY_FILTR, strona: 1, proba: 0, oglos: false });
  const [stan, setStan] = useState<StanEkranu>({ rodzaj: "ladowanie" });
  const [komunikat, setKomunikat] = useState("");
  const [pobranie, setPobranie] = useState<StanPobrania>({ rodzaj: "spoczynek" });
  const [bladRoku, setBladRoku] = useState<string | null>(null);
  const [nazwaDotyczy, setNazwaDotyczy] = useState<string | null>(null);
  // Chwila ostatniego odczytu: od niej liczą się gotowe zakresy dat (w renderze nie czytamy zegara).
  const [teraz, setTeraz] = useState<number | null>(null);
  const zwloka = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let anulowane = false;
    pobierzStrone(zapytanie.filtr, dotyczy, zapytanie.strona)
      .then(({ data, meta }) => {
        if (anulowane) return;
        setTeraz(Date.now());
        setStan({ rodzaj: "dane", wpisy: data, meta });
        if (dotyczy !== null) setNazwaDotyczy((poprzednia) => nazwaOsobyZWpisow(data, dotyczy) ?? poprzednia);
        if (zapytanie.oglos) setKomunikat(komunikatWyniku(data.length, meta?.total ?? data.length));
      })
      .catch((wyjatek: unknown) => {
        if (!anulowane) setStan({ rodzaj: "blad", blad: rodzajBledu(wyjatek) });
      });
    return () => {
      anulowane = true;
    };
  }, [zapytanie, dotyczy]);

  useEffect(
    () => () => {
      if (zwloka.current !== null) clearTimeout(zwloka.current);
    },
    [],
  );

  /** Odczyt dla filtra i strony; błędny zakres dat nie idzie do serwera. */
  function przejdz(filtr: FiltrDziennika, strona: number) {
    if (zwloka.current !== null) clearTimeout(zwloka.current);
    if (bladZakresu(filtr) !== null) return;
    setStan({ rodzaj: "ladowanie" });
    setPobranie({ rodzaj: "spoczynek" });
    setZapytanie((poprzednie) => ({ filtr, strona, proba: poprzednie.proba + 1, oglos: true }));
  }

  function zmienPole(zmiana: Partial<FiltrDziennika>) {
    const nowe = { ...pola, ...zmiana };
    setPola(nowe);
    przejdz(nowe, 1);
  }

  /** Pola wyszukiwania: odczyt po chwili przerwy w pisaniu. */
  function zmienSzukane(zmiana: Partial<Pick<FiltrDziennika, "dotyczy" | "kto">>) {
    const nowe = { ...pola, ...zmiana };
    setPola(nowe);
    if (zwloka.current !== null) clearTimeout(zwloka.current);
    zwloka.current = setTimeout(() => przejdz(nowe, 1), ZWLOKA_SZUKANIA_MS);
  }

  function zatwierdz(zdarzenie: FormEvent<HTMLFormElement>) {
    zdarzenie.preventDefault();
    przejdz(pola, 1);
  }

  function ustawZakres(rodzaj: GotowyZakres) {
    setBladRoku(null);
    zmienPole(zakresOdDzis(rodzaj));
  }

  async function ustawRokProgramu() {
    setBladRoku(null);
    try {
      zmienPole(await pobierzRokProgramu());
    } catch {
      setBladRoku("Nie udało się odczytać dat edycji. Wpisz daty „Od” i „Do” ręcznie.");
    }
  }

  function wyczysc() {
    setPola(PUSTY_FILTR);
    setBladRoku(null);
    if (dotyczy !== null) onUsunDotyczy();
    przejdz(PUSTY_FILTR, 1);
  }

  function usunDotyczy() {
    onUsunDotyczy();
    przejdz(zapytanie.filtr, 1);
  }

  function ponow() {
    przejdz(zapytanie.filtr, zapytanie.strona);
  }

  async function pobierz() {
    setPobranie({ rodzaj: "trwa" });
    try {
      await pobierzPlik(zapytanie.filtr, dotyczy);
      setPobranie({ rodzaj: "gotowe" });
    } catch (wyjatek) {
      setPobranie({
        rodzaj: "blad",
        komunikat:
          wyjatek instanceof ApiError ? wyjatek.message : "Sprawdź połączenie z internetem i spróbuj jeszcze raz.",
      });
    }
  }

  const meta = stan.rodzaj === "dane" ? stan.meta : undefined;
  const maWpisy = stan.rodzaj === "dane" && stan.wpisy.length > 0;
  const blad = stan.rodzaj === "blad" ? stan.blad : null;
  const bezFiltrow = blad === "zakazane" || blad === "nie-znaleziono";

  const naglowek = (
    <PageHeader
      okruszki={OKRUSZKI}
      tytul={TYTUL}
      opis={OPIS}
      onPowrot={() => router.back()}
      akcjaDrugorzedna={
        maWpisy
          ? {
              etykieta: pobranie.rodzaj === "trwa" ? "Pobieranie…" : ETYKIETA_POBRANIA,
              onKliknij: () => void pobierz(),
              wylaczona: pobranie.rodzaj === "trwa",
            }
          : undefined
      }
      dzieci={maWpisy ? <Hint>{UWAGA_POBRANIA}</Hint> : undefined}
    />
  );

  const zakresBledny = bladZakresu(pola);
  const aktywny = filtrAktywny(pola) || dotyczy !== null;

  const filtry = bezFiltrow ? undefined : (
    <div className={style.filtry}>
      {pobranie.rodzaj === "blad" && (
        <Notice wariant="error" tytul="Nie udało się pobrać pliku">
          {pobranie.komunikat}
        </Notice>
      )}
      {pobranie.rodzaj === "gotowe" && (
        <Notice wariant="ok" tytul="Plik pobrany">
          Plik zawiera wpisy spełniające bieżące filtry, ze wszystkich stron.
        </Notice>
      )}
      <form className={style.filtry} onSubmit={zatwierdz} aria-label="Filtry dziennika" noValidate>
        <div className={style.pola}>
          <div className={style.pole}>
            <Field
              id="dziennik-od"
              etykieta="Od"
              rodzaj="data"
              wartosc={pola.od}
              blad={zakresBledny ?? undefined}
              onZmiana={(wartosc) => zmienPole({ od: wartosc })}
            />
          </div>
          <div className={style.pole}>
            <Field id="dziennik-do" etykieta="Do" rodzaj="data" wartosc={pola.do} onZmiana={(wartosc) => zmienPole({ do: wartosc })} />
          </div>
          <div className={style.pole}>
            <Field
              id="dziennik-rodzaj"
              etykieta="Rodzaj"
              rodzaj="wybor"
              opcje={[{ wartosc: "", etykieta: "Wszystkie rodzaje" }, ...GRUPY.map((g) => ({ wartosc: g.klucz, etykieta: g.nazwa }))]}
              wartosc={pola.grupa}
              onZmiana={(wartosc) => zmienPole({ grupa: wartosc as GrupaZdarzen | "" })}
            />
          </div>
          <div className={style.pole}>
            <Field
              id="dziennik-dotyczy"
              etykieta="Kogo dotyczy"
              rodzaj="tekst"
              placeholder="Imię lub nazwisko"
              wartosc={pola.dotyczy}
              onZmiana={(wartosc) => zmienSzukane({ dotyczy: wartosc })}
            />
          </div>
          <div className={style.pole}>
            <Field
              id="dziennik-kto"
              etykieta="Kto"
              rodzaj="tekst"
              placeholder="Imię lub nazwisko"
              wartosc={pola.kto}
              onZmiana={(wartosc) => zmienSzukane({ kto: wartosc })}
            />
          </div>
        </div>
        <fieldset className={style.zakresy}>
          <legend>Gotowy zakres dat</legend>
          {(["dzis", "tydzien", "miesiac"] as const).map((rodzaj) => {
            const wybrany = teraz === null ? null : zakres(rodzaj, teraz);
            return (
              <Button
                key={rodzaj}
                type="button"
                poziom="outline"
                rozmiar="sm"
                aria-pressed={wybrany !== null && pola.od === wybrany.od && pola.do === wybrany.do}
                onClick={() => ustawZakres(rodzaj)}
              >
                {NAZWY_ZAKRESOW[rodzaj]}
              </Button>
            );
          })}
          <Button type="button" poziom="outline" rozmiar="sm" onClick={() => void ustawRokProgramu()}>
            {NAZWY_ZAKRESOW.rok}
          </Button>
        </fieldset>
        {bladRoku && <Hint>{bladRoku}</Hint>}
        {(dotyczy !== null || aktywny) && (
          <div className={style.znaczniki}>
            {dotyczy !== null && <ZnacznikDotyczy nazwa={nazwaDotyczy} onUsun={usunDotyczy} />}
            {aktywny && (
              <Button type="button" poziom="quiet" rozmiar="sm" onClick={wyczysc}>
                Wyczyść filtry
              </Button>
            )}
          </div>
        )}
      </form>
      <div className={style.ukryte} role="status" aria-live="polite">
        {komunikat}
      </div>
    </div>
  );

  let lista: ReactNode;
  if (stan.rodzaj === "ladowanie") {
    lista = <Skeleton wiersze={6} />;
  } else if (stan.rodzaj === "blad") {
    lista = <StanBledu blad={stan.blad} onPonow={ponow} onWroc={() => router.back()} />;
  } else if (stan.wpisy.length === 0 && aktywny) {
    lista = (
      <EmptyStateCard
        wariant="brak-wynikow-filtra"
        naglowek="Nic nie pasuje do filtrów."
        tresc="Zmień zakres dat, rodzaj albo szukaną osobę — albo wyczyść filtry."
        przycisk={{ etykieta: "Wyczyść filtry", onClick: wyczysc }}
      />
    );
  } else if (stan.wpisy.length === 0) {
    lista = (
      <EmptyStateCard
        naglowek="Dziennik jest pusty"
        tresc="Wpisy pojawią się tutaj, gdy ktoś wykona w systemie ważną czynność, na przykład zatwierdzi dyżur albo wyda certyfikat."
        przycisk={{ etykieta: "Odśwież", onClick: ponow }}
      />
    );
  } else {
    lista = (
      <div className={style.lista}>
        <div className={style.ukryte}>
          <Heading stopien={2}>Wpisy</Heading>
        </div>
        <p className={style.licznik}>
          {`Na tej stronie: ${licznik(stan.wpisy.length, meta?.total ?? stan.wpisy.length)}`}
        </p>
        <TabelaWpisow wpisy={stan.wpisy.map(opiszWpis)} />
      </div>
    );
  }

  const stronicowanie =
    meta !== undefined && meta.last_page > 1 && stan.rodzaj === "dane" ? (
      <Pagination
        strona={meta.current_page}
        stron={meta.last_page}
        naPoprzednia={() => przejdz(zapytanie.filtr, meta.current_page - 1)}
        naNastepna={() => przejdz(zapytanie.filtr, meta.current_page + 1)}
      />
    ) : undefined;

  return <ListTemplate naglowek={naglowek} filtry={filtry} lista={lista} stronicowanie={stronicowanie} />;
}

/** Znacznik „Dotyczy: Imię Nazwisko ×” — przycisk zdejmuje filtr osoby. */
function ZnacznikDotyczy({ nazwa, onUsun }: { nazwa: string | null; onUsun: () => void }) {
  const tekst = `Dotyczy: ${nazwa ?? "wybrana osoba"}`;
  return (
    <span className={style.znacznik}>
      <span>{tekst}</span>
      <Button type="button" poziom="quiet" rozmiar="sm" aria-label={`Usuń filtr — ${tekst}`} onClick={onUsun}>
        <span aria-hidden="true">×</span>
      </Button>
    </span>
  );
}

/** Stany bez wpisów: brak połączenia, błąd serwera, brak dostępu, nie znaleziono. */
function StanBledu({ blad, onPonow, onWroc }: { blad: BladOdczytu; onPonow: () => void; onWroc: () => void }) {
  const ponow = (
    <Button poziom="outline" onClick={onPonow}>
      Spróbuj ponownie
    </Button>
  );
  switch (blad) {
    case "siec":
      return (
        <KomunikatStanu tytul="Brak połączenia" akcja={ponow}>
          Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.
        </KomunikatStanu>
      );
    case "blad":
      return (
        <KomunikatStanu tytul="Nie udało się wczytać dziennika" akcja={ponow}>
          Coś poszło nie tak po naszej stronie. Spróbuj ponownie za chwilę.
        </KomunikatStanu>
      );
    case "zakazane":
      return (
        <EkranOdmowy rodzaj="brak-dostepu" stopien={2} rolaDocelowa="administracji" przycisk={{ etykieta: "Wróć", onClick: onWroc }} />
      );
    case "nie-znaleziono":
      return (
        <EkranOdmowy
          rodzaj="nie-znaleziono"
          czego="dziennika działań"
          stopien={2}
          coDalej="Dziennik może być chwilowo niedostępny. Odśwież stronę za chwilę."
          przycisk={{ etykieta: "Odśwież", onClick: onPonow }}
        />
      );
  }
}

/**
 * Komunikat stanu bez wpisów z tytułem `h2` — pod `h1` ekranu `Notice`
 * (zawsze `h3`) przeskoczyłby stopień nagłówka. Wygląd i rola `alert` jak
 * w `Notice` wariantu „error” przez wspólną klasę komunikatu ekranu.
 */
function KomunikatStanu({ tytul, akcja, children }: { tytul: string; akcja: ReactNode; children: string }) {
  return (
    <div className={style.komunikat} role="alert">
      <Heading stopien={2}>{tytul}</Heading>
      <Text>{children}</Text>
      <div>{akcja}</div>
    </div>
  );
}
