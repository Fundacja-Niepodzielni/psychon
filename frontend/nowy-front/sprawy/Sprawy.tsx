"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Link } from "@/design-system/atomy/Link/Link";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import {
  RecordList,
  type KolumnaRecordList,
  type WierszRecordList,
} from "@/design-system/organizmy/RecordList/RecordList";
import { EkranOdmowy } from "@/nowy-front/wspolne/ekran-odmowy";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { CollapsibleSection } from "@/design-system/molekuly/CollapsibleSection/CollapsibleSection";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";
import {
  ETYKIETA_FILTRA,
  ETYKIETA_RODZAJU,
  KOLEJNOSC_RODZAJOW,
  pobierzKolejkeSpraw,
  sortujSprawy,
  znajdzNajstarszaSprawe,
  type PozycjaKolejki,
  type RodzajSprawy,
  type WynikZrodla,
} from "./dane";
import { pobierzSprawyProwadzacych, type SprawaProwadzacego } from "./dane-prowadzacych";
import { SprawyProwadzacych, type StanSprawProwadzacych } from "./SprawyProwadzacych";
import {
  dniOczekiwania,
  tekstPlakietkiCzekania,
  tekstWieku,
  wariantPlakietkiCzekania,
} from "./wiek";
import style from "./Sprawy.module.css";

type StanEkranu = "ladowanie" | "brak-uprawnien" | "blad" | "ok";
type FiltrRodzaju = RodzajSprawy | "";
// Opis ekranu nazywa rodzaje tak samo jak filtr (jeden słownik w `./dane.ts`).
/** Kolumny kolejki spraw: sprawa (rodzaj, pod nim osoba), stan oczekiwania, akcja na końcu. */
export const KOLUMNY_SPRAW: KolumnaRecordList[] = [
  { nazwa: "Sprawa", rodzaj: "tekst" },
  { nazwa: "Stan", rodzaj: "stan" },
  { nazwa: "Akcja", rodzaj: "akcja" },
];

const OPIS_EKRANU = `${ETYKIETA_FILTRA.applications}, ${ETYKIETA_FILTRA.internship_entries.toLocaleLowerCase("pl")} i ${ETYKIETA_FILTRA.profiles.toLocaleLowerCase("pl")} czekające na Twoją decyzję — w jednym miejscu.`;

/**
 * Rodzaje, które w filtrze są odnośnikami do własnych ekranów (lista dyżurów
 * i lista zgłoszeń rekrutacyjnych), a nie przyciskami zawężającymi listę.
 */
const EKRAN_RODZAJU: Partial<Record<RodzajSprawy, string>> = {
  applications: "/admin/nabor",
  internship_entries: "/admin/staz",
};

interface OpcjaFiltra {
  wartosc: FiltrRodzaju;
  etykieta: string;
  liczba: number;
  /** Adres ekranu rodzaju; opcja z adresem jest odnośnikiem, bez niego — przyciskiem filtra. */
  href?: string;
}

/**
 * Trasa `/nowy-front/admin/sprawy` (A-02) — jedna kolejka decyzji administracji,
 * złożona z trzech źródeł opisanych w `./dane.ts`. Każdy stan ekranu
 * (ładowanie, dane, pusto, brak uprawnień, błąd) renderuje szablon
 * `ListTemplate`: jego korzeń jest jedynym `main` (cel linku skoku `#tresc`),
 * a stan wybiera wyłącznie zawartość slotów. Slot `naglowek` — `PageHeader`
 * (podtytuł niesie wiek najstarszej sprawy); slot `filtry` — zwijany „Filtr:
 * rodzaj (N)” z pozycjami rodzajów obecnych w danych, każda z liczbą (tylko
 * w stanie z danymi): „Dyżury” i „Zgłoszenia rekrutacyjne” są odnośnikami do
 * swoich ekranów, „Wszystkie” i „Wnioski o profil psychologa” przyciskami
 * zawężającymi listę; slot `lista` — szkielet, komunikat błędu, stan braku
 * dostępu albo komunikaty źródeł i `RecordList` (stan pusty „Brak spraw do
 * decyzji" niesie sam `RecordList`); slot `stronicowanie` pominięty — ekran
 * pobiera do 100 pozycji na źródło bez podziału na strony, patrz
 * `PER_PAGE_MAX` w `./dane.ts`. Wiersze stoją od najstarszej sprawy
 * (`sortujSprawy`, to samo porównanie co „Otwórz najstarszą sprawę”). Wiersz
 * `RecordList` w kolumnach: „Sprawa” — rodzaj (nazwa ze słownika
 * `NAZWY_RODZAJOW`), pod nim osoba; „Stan” — plakietka „czeka od dziś” /
 * „czeka N dni” (ostrzegawcza od `PROG_OSTRZEZENIA_DNI`, niżej szara); akcja
 * „Otwórz” z `href` na końcu; pełna nazwa akcji i data „Czeka od …” tylko dla czytnika. Nagłówek `h2` kolejki
 * jest tylko dla czytnika — wzrokowo lista stoi bezpośrednio pod nagłówkiem
 * ekranu.
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
  // Chwila odczytu kolejki: od niej liczy się wiek spraw (w renderze nie czytamy zegara).
  const [teraz, setTeraz] = useState<number | null>(null);
  const [filtr, setFiltr] = useState<FiltrRodzaju>("");
  const [proba, setProba] = useState(0);
  const [stanProwadzacych, setStanProwadzacych] = useState<StanSprawProwadzacych>("ladowanie");
  const [odmowaProwadzacych, setOdmowaProwadzacych] = useState(false);
  const [sprawyProwadzacych, setSprawyProwadzacych] = useState<SprawaProwadzacego[]>([]);
  const [bladProwadzacych, setBladProwadzacych] = useState<string | null>(null);
  const [probaProwadzacych, setProbaProwadzacych] = useState(0);
  // Chwila odczytu spraw prowadzących: od niej liczy się wiek tych spraw.
  const [terazProwadzacych, setTerazProwadzacych] = useState<number | null>(null);

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
      setTerazProwadzacych(Date.now());
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
        setTeraz(Date.now());
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

  const pozycje = useMemo(() => sortujSprawy(wyniki.flatMap((wynik) => wynik.pozycje)), [wyniki]);
  // Rodzaje obecne w danych, każdy z liczbą spraw. Wybrany rodzaj zostaje w
  // filtrze także wtedy, gdy po ponownym odczycie nie ma już jego spraw —
  // wtedy lista mówi o tym wprost, a „Wszystkie” przywraca pełny widok.
  const opcjeFiltra = useMemo(() => {
    const opcje: OpcjaFiltra[] = [
      { wartosc: "", etykieta: "Wszystkie", liczba: pozycje.length },
    ];
    for (const rodzaj of KOLEJNOSC_RODZAJOW) {
      const liczba = pozycje.filter((pozycja) => pozycja.rodzaj === rodzaj).length;
      if (liczba > 0 || rodzaj === filtr) {
        opcje.push({ wartosc: rodzaj, etykieta: ETYKIETA_FILTRA[rodzaj], liczba, href: EKRAN_RODZAJU[rodzaj] });
      }
    }
    return opcje;
  }, [pozycje, filtr]);
  const opcjaWybrana = opcjeFiltra.find((opcja) => opcja.wartosc === filtr) ?? opcjeFiltra[0];
  const pozycjeWidoczne = useMemo(
    () => (filtr === "" ? pozycje : pozycje.filter((pozycja) => pozycja.rodzaj === filtr)),
    [pozycje, filtr],
  );
  // „Najstarsza sprawa" liczy się zawsze z PEŁNEJ kolejki (bez filtra rodzaju)
  // — filtr rodzaju zawęża tylko widoczną listę, nie główną akcję. Lista jest
  // posortowana tym samym porównaniem (`porownajSprawy`), więc to jest jej
  // pierwszy wiersz.
  const najstarsza = useMemo(() => znajdzNajstarszaSprawe(pozycje), [pozycje]);
  const zrodlaZBledem = useMemo(() => wyniki.filter((wynik) => wynik.blad !== null), [wyniki]);
  const zrodlaPonad100 = useMemo(
    () => wyniki.filter((wynik) => wynik.liczbaCalkowita > wynik.pozycje.length),
    [wyniki],
  );

  // Wiek najstarszej sprawy: z tych samych danych, z których ekran wskazuje
  // „Otwórz najstarszą sprawę” (każde źródło odpowiada rosnąco po `created_at`,
  // więc najstarsza pozycja zawsze mieści się na pobranej stronie).
  const dniNajstarszej = najstarsza && teraz !== null ? dniOczekiwania(najstarsza.czekaOd, teraz) : null;

  const wierszeListy: WierszRecordList[] = useMemo(
    () =>
      pozycjeWidoczne.map((pozycja: PozycjaKolejki) => {
        const dni = teraz === null ? null : dniOczekiwania(pozycja.czekaOd, teraz);
        return {
          id: pozycja.id,
          tytul: ETYKIETA_RODZAJU[pozycja.rodzaj],
          tytulDodatek: pozycja.osoba,
          podpowiedz: pozycja.podpowiedz,
          podpowiedzTylkoDlaCzytnika: true,
          plakietka:
            dni === null ? undefined : { wariant: wariantPlakietkiCzekania(dni), tekst: tekstPlakietkiCzekania(dni) },
          akcja: { etykieta: "Otwórz", etykietaDostepna: `Otwórz sprawę: ${pozycja.tytul}`, href: pozycja.href },
        };
      }),
    [pozycjeWidoczne, teraz],
  );

  const naglowek = (
    <PageHeader
      okruszki={[{ etykieta: "Administracja" }, { etykieta: "Sprawy" }]}
      tytul="Sprawy do decyzji"
      opis={
        stanEkranu === "ok" && dniNajstarszej !== null
          ? (
              <>
                {OPIS_EKRANU} Najstarsza sprawa czeka <strong>{tekstWieku(dniNajstarszej)}</strong>.
              </>
            )
          : OPIS_EKRANU
      }
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
      teraz={terazProwadzacych}
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
        <div className={style.dlaCzytnika}>
          <Heading stopien={2}>Sprawy</Heading>
        </div>
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
      <EkranOdmowy rodzaj="brak-dostepu" stopien={2} rolaDocelowa="administracji" przycisk={{ etykieta: "Wstecz", onClick: () => router.back() }} />
    );
  } else {
    filtry = (
      <div className={style.filtr}>
        <CollapsibleSection
          tytul={`Filtr: ${opcjaWybrana.etykieta}`}
          liczba={opcjaWybrana.liczba}
          dzieci={
            <div role="group" aria-label="Rodzaj sprawy" className={style.opcjeFiltra}>
              {opcjeFiltra.map((opcja) =>
                opcja.href ? (
                  <Link key={opcja.wartosc} href={opcja.href}>
                    {opcja.etykieta} ({opcja.liczba})
                  </Link>
                ) : (
                  <Button
                    key={opcja.wartosc || "wszystkie"}
                    poziom="outline"
                    aria-pressed={opcja.wartosc === filtr}
                    onClick={() => setFiltr(opcja.wartosc)}
                  >
                    {opcja.etykieta} ({opcja.liczba})
                  </Button>
                ),
              )}
            </div>
          }
        />
      </div>
    );
    // Nagłówek `h2` kolejki (tylko dla czytnika) idzie PRZED komunikatami
    // źródeł (`Notice` ma tytuł `h3`), żeby pod `h1` nie wypadł `h3` bez `h2`.
    lista = (
      <>
        {pokazListe ? (
          <RecordList
            tytul="Sprawy"
            stopienNaglowka={2}
            naglowekTylkoDlaCzytnika
            naKarcie
            kolumny={KOLUMNY_SPRAW}
            wiersze={wierszeListy}
            pusty={pustyStanListy}
          />
        ) : (
          <div className={style.dlaCzytnika}>
            <Heading stopien={2}>Sprawy</Heading>
          </div>
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
