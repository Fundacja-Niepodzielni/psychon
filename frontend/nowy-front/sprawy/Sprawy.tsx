"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { RecordList, type WierszRecordList } from "@/design-system/organizmy/RecordList/RecordList";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Field } from "@/design-system/molekuly/Field/Field";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";
import {
  ETYKIETA_RODZAJU,
  pobierzKolejkeSpraw,
  znajdzNajstarszaSprawe,
  type PozycjaKolejki,
  type RodzajSprawy,
  type WynikZrodla,
} from "./dane";
import { pobierzSprawyProwadzacych, type SprawaProwadzacego } from "./dane-prowadzacych";
import { SprawyProwadzacych, type StanSprawProwadzacych } from "./SprawyProwadzacych";
import style from "./Sprawy.module.css";

type StanEkranu = "ladowanie" | "brak-uprawnien" | "blad" | "ok";
type FiltrRodzaju = RodzajSprawy | "";
type WariantPlakietki = "neutral" | "ok" | "warn" | "error" | "pending";

const PLAKIETKA_RODZAJU: Record<RodzajSprawy, { wariant: WariantPlakietki; tekst: string }> = {
  applications: { wariant: "pending", tekst: ETYKIETA_RODZAJU.applications },
  internship_entries: { wariant: "pending", tekst: ETYKIETA_RODZAJU.internship_entries },
  profiles: { wariant: "pending", tekst: ETYKIETA_RODZAJU.profiles },
};

const OPCJE_FILTRA: { wartosc: FiltrRodzaju; etykieta: string }[] = [
  { wartosc: "", etykieta: "Wszystkie rodzaje" },
  { wartosc: "applications", etykieta: ETYKIETA_RODZAJU.applications },
  { wartosc: "internship_entries", etykieta: ETYKIETA_RODZAJU.internship_entries },
  { wartosc: "profiles", etykieta: ETYKIETA_RODZAJU.profiles },
];

/**
 * Trasa `/nowy-front/admin/sprawy` (A-02) — jedna kolejka decyzji administracji,
 * złożona z trzech źródeł opisanych w `./dane.ts`. Każdy stan ekranu
 * (ładowanie, dane, pusto, brak uprawnień, błąd) renderuje szablon
 * `ListTemplate`: jego korzeń jest jedynym `main` (cel linku skoku `#tresc`),
 * a stan wybiera wyłącznie zawartość slotów. Slot `naglowek` — `PageHeader`;
 * slot `filtry` — `Field` wyboru rodzaju (tylko w stanie z danymi); slot
 * `lista` — szkielet, komunikat błędu, stan braku dostępu albo komunikaty
 * źródeł, główna akcja „Otwórz najstarszą sprawę" i `RecordList` (stan
 * pusty „Brak spraw do decyzji" niesie sam `RecordList`); slot
 * `stronicowanie` pominięty — ekran pobiera do 100 pozycji na źródło bez
 * podziału na strony, patrz `PER_PAGE_MAX` w `./dane.ts`. Wiersz `RecordList`
 * niesie dokładnie to, co ekran wymaga: rodzaj jako plakietka, kto i od kiedy
 * czeka w tekście wiersza, przejście do sprawy jako akcja wiersza z `href`.
 *
 * Pod kolejką stoi sekcja „Sprawy zgłoszone przez prowadzących”
 * (`./SprawyProwadzacych.tsx`, dane z `./dane-prowadzacych.ts`): ma własne
 * stany i własne ponowienie, nie zasłania kolejki. Jedyny wspólny stan to
 * odmowa 401/403 — z którejkolwiek części — która zamienia cały ekran na
 * „brak uprawnień” bez żadnego rekordu. Układ nagłówków: `h1` ekranu, `h2`
 * kolejki (`RecordList` ze `stopienNaglowka={2}`) i `h2` sekcji spraw
 * prowadzących, a pod nimi `h3` (tytuły komunikatów i spraw) — bez przeskoku.
 *
 * Kolejka pytań nie ma trasy dla administracji — ekran jej nie woła i nie
 * pokazuje (patrz `./dane.ts`).
 *
 * `CaseCard` (pary klucz–wartość + statystyka/pasek) nie ma pola akcji/odnośnika
 * i nie pasuje do „przejścia do sprawy" — brakuje pola akcji/odnośnika, więc
 * `RecordList` sam realizuje wzorzec „zbiór z akcjami wiersza".
 *
 * Odczyt startowy biegnie z przeglądarki — ten sam powód co
 * `nowy-front/formy-stazu/dane.ts` i `nowy-front/zgloszenia-wspolpracy`.
 */
export function Sprawy() {
  const router = useRouter();
  const [stan, setStan] = useState<StanEkranu>("ladowanie");
  const [wyniki, setWyniki] = useState<WynikZrodla[]>([]);
  const [filtr, setFiltr] = useState<FiltrRodzaju>("");
  const [proba, setProba] = useState(0);
  const [stanProwadzacych, setStanProwadzacych] = useState<StanSprawProwadzacych>("ladowanie");
  const [odmowaProwadzacych, setOdmowaProwadzacych] = useState(false);
  const [sprawyProwadzacych, setSprawyProwadzacych] = useState<SprawaProwadzacego[]>([]);
  const [bladProwadzacych, setBladProwadzacych] = useState<string | null>(null);
  const [probaProwadzacych, setProbaProwadzacych] = useState(0);

  const ponow = () => {
    setStan("ladowanie");
    setProba((poprzednia) => poprzednia + 1);
  };

  const ponowProwadzacych = () => {
    setStanProwadzacych("ladowanie");
    setProbaProwadzacych((poprzednia) => poprzednia + 1);
  };

  useEffect(() => {
    let anulowane = false;
    pobierzSprawyProwadzacych().then((wynik) => {
      if (anulowane) return;
      if (wynik.odmowa) {
        setOdmowaProwadzacych(true);
        return;
      }
      setSprawyProwadzacych(wynik.sprawy);
      setBladProwadzacych(wynik.blad);
      setStanProwadzacych(wynik.blad === null ? "ok" : "blad");
    });
    return () => {
      anulowane = true;
    };
  }, [probaProwadzacych]);

  useEffect(() => {
    let anulowane = false;
    pobierzKolejkeSpraw()
      .then((wynikiZrodel) => {
        if (anulowane) return;
        const wszystkieZakazane =
          wynikiZrodel.length > 0 && wynikiZrodel.every((wynik) => wynik.kodBledu === "forbidden");
        if (wszystkieZakazane) {
          setStan("brak-uprawnien");
          return;
        }
        // Każdy odczyt zawiódł (poza odmową roli): to awaria, nie pusta lista.
        const wszystkieZawiodly =
          wynikiZrodel.length > 0 && wynikiZrodel.every((wynik) => wynik.blad !== null);
        if (wszystkieZawiodly) {
          setStan("blad");
          return;
        }
        setWyniki(wynikiZrodel);
        setStan("ok");
      })
      .catch(() => {
        if (anulowane) return;
        setStan("blad");
      });
    return () => {
      anulowane = true;
    };
  }, [proba]);

  // Odmowa z którejkolwiek części to odmowa całego ekranu: ani kolejka, ani
  // sprawy prowadzących nie zostają w drzewie.
  const stanEkranu: StanEkranu = odmowaProwadzacych ? "brak-uprawnien" : stan;

  const pozycje = useMemo(() => wyniki.flatMap((wynik) => wynik.pozycje), [wyniki]);
  const pozycjeWidoczne = useMemo(
    () => (filtr === "" ? pozycje : pozycje.filter((pozycja) => pozycja.rodzaj === filtr)),
    [pozycje, filtr],
  );
  // „Najstarsza sprawa" liczy się zawsze z PEŁNEJ kolejki (bez filtra rodzaju)
  // — filtr rodzaju zawęża tylko widoczną listę, nie główną akcję.
  const najstarsza = useMemo(() => znajdzNajstarszaSprawe(pozycje), [pozycje]);
  const zrodlaZBledem = useMemo(() => wyniki.filter((wynik) => wynik.blad !== null), [wyniki]);
  const zrodlaPonad100 = useMemo(
    () => wyniki.filter((wynik) => wynik.liczbaCalkowita > wynik.pozycje.length),
    [wyniki],
  );

  const wierszeListy: WierszRecordList[] = useMemo(
    () =>
      pozycjeWidoczne.map((pozycja: PozycjaKolejki) => ({
        id: pozycja.id,
        tytul: pozycja.tytul,
        podpowiedz: pozycja.podpowiedz,
        plakietka: PLAKIETKA_RODZAJU[pozycja.rodzaj],
        akcja: { etykieta: "Otwórz sprawę", href: pozycja.href },
      })),
    [pozycjeWidoczne],
  );

  const naglowek = (
    <PageHeader
      okruszki={[{ etykieta: "Administracja" }, { etykieta: "Sprawy" }]}
      tytul="Sprawy do decyzji"
      opis="Zgłoszenia, dyżury i profile psychologów czekające na Twoją decyzję — w jednym miejscu."
      onPowrot={() => router.back()}
      przyciskGlowny={
        stanEkranu === "ok" && najstarsza
          ? { etykieta: "Otwórz najstarszą sprawę", onKliknij: () => router.push(najstarsza.href) }
          : undefined
      }
    />
  );

  // „Brak spraw do decyzji” wolno pokazać wyłącznie po udanym odczycie
  // wszystkich źródeł; przy częściowym błędzie i zerze pozycji lista się nie
  // renderuje — zostają komunikaty źródeł. Pusty wynik samego filtra ma
  // własny tekst, bo w pełnej kolejce sprawy są.
  const pokazListe = pozycje.length > 0 || zrodlaZBledem.length === 0;
  const pustyStanListy =
    pozycje.length > 0
      ? {
          naglowek: "Brak spraw tego rodzaju",
          tresc: "Wybierz inny rodzaj albo pokaż wszystkie rodzaje spraw.",
          przycisk: { etykieta: "Pokaż wszystkie rodzaje", onClick: () => setFiltr("") },
        }
      : {
          naglowek: "Brak spraw do decyzji",
          tresc: "Nowe zgłoszenia, dyżury i profile pojawią się tutaj automatycznie.",
          przycisk: { etykieta: "Odśwież", onClick: ponow },
        };

  let filtry: ReactNode = null;
  let lista: ReactNode;

  const sekcjaProwadzacych = (
    <SprawyProwadzacych
      stan={stanProwadzacych}
      sprawy={sprawyProwadzacych}
      blad={bladProwadzacych}
      onPonow={ponowProwadzacych}
    />
  );

  if (stanEkranu === "ladowanie") {
    lista = (
      <>
        <Skeleton wiersze={4} />
        {sekcjaProwadzacych}
      </>
    );
  } else if (stanEkranu === "blad") {
    lista = (
      <>
        <Heading stopien={2}>Sprawy</Heading>
        <div className={style.bledyZrodel}>
          <Notice wariant="error" tytul="Nie udało się wczytać spraw">
            Sprawy są chwilowo nieosiągalne. Sprawdź połączenie i spróbuj ponownie.
          </Notice>
          <div className={style.glownaAkcja}>
            <Button poziom="outline" onClick={ponow}>
              Spróbuj ponownie
            </Button>
          </div>
        </div>
        {sekcjaProwadzacych}
      </>
    );
  } else if (stanEkranu === "brak-uprawnien") {
    lista = (
      <EmptyState
        wariant="brak-uprawnien"
        naglowek="Sekcja dla administracji"
        rola="administracji"
        przycisk={{ etykieta: "Wstecz", onClick: () => router.back() }}
      />
    );
  } else {
    filtry = (
      <div className={style.filtr}>
        <Field
          id="sprawy-filtr-rodzaj"
          etykieta="Rodzaj sprawy"
          rodzaj="wybor"
          opcje={OPCJE_FILTRA.map((opcja) => ({ wartosc: opcja.wartosc, etykieta: opcja.etykieta }))}
          wartosc={filtr}
          onZmiana={(wartosc) => setFiltr(wartosc as FiltrRodzaju)}
        />
      </div>
    );
    // Nagłówek `h2` kolejki idzie PRZED komunikatami źródeł (`Notice` ma tytuł
    // `h3`), żeby pod `h1` nie wypadł `h3` bez `h2`.
    lista = (
      <>
        {pokazListe ? (
          <RecordList
            tytul="Sprawy"
            stopienNaglowka={2}
            wiersze={wierszeListy}
            pusty={pustyStanListy}
          />
        ) : (
          <Heading stopien={2}>Sprawy</Heading>
        )}

        {zrodlaZBledem.length > 0 && (
          <div className={style.bledyZrodel}>
            {zrodlaZBledem.map((wynik) => (
              <Notice
                key={wynik.rodzaj}
                wariant="warn"
                tytul={`Źródło „${ETYKIETA_RODZAJU[wynik.rodzaj]}” nieosiągalne`}
              >
                {wynik.blad} Pozostałe rodzaje spraw działają dalej; „najstarsza sprawa” jest liczona z
                pozostałych.
              </Notice>
            ))}
          </div>
        )}

        {zrodlaPonad100.length > 0 && (
          <Notice wariant="info" tytul="Widok częściowy">
            {zrodlaPonad100.map((wynik) => ETYKIETA_RODZAJU[wynik.rodzaj]).join(", ")}: pobrana tylko
            pierwsza strona (do 100 pozycji) — przy większej liczbie „najstarsza sprawa” może nie być
            dokładna.
          </Notice>
        )}

        {sekcjaProwadzacych}
      </>
    );
  }

  return (
    <div className={style.strona}>
      <ListTemplate naglowek={naglowek} filtry={filtry} lista={lista} />
    </div>
  );
}
