"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/design-system/atomy/Badge/Badge";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Link } from "@/design-system/atomy/Link/Link";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Pagination } from "@/design-system/molekuly/Pagination/Pagination";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";
import { useWRamce } from "@/design-system/szablony/KontekstRamki";
import type { PaginationMeta } from "@/lib/api/klient";
import { TabelaWierszy, type KolumnaTabeli, type WierszTabeli } from "@/nowy-front/certyfikaty-lista/TabelaWierszy";
import { SCIEZKA_KARTY } from "@/nowy-front/osoby-lista/dane";
import { formatujDateICzas } from "@/nowy-front/wspolne/daty";
import { EkranOdmowy } from "@/nowy-front/wspolne/ekran-odmowy";
import { odmien } from "@/nowy-front/wspolne/odmiana";
import {
  formatujCzas,
  formatujRzetelnosc,
  pobierzOsoby,
  pobierzSzczegoly,
  rodzajBledu,
  sklasyfikujBladSzczegolow,
  stanLekcji,
  stanRzetelnosci,
  type AdminReliabilityDetail,
  type AdminReliabilityPerson,
  type BladSzczegolow,
} from "./dane";
import style from "./CzasNauki.module.css";

type StanListy =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "dane"; osoby: AdminReliabilityPerson[]; meta: PaginationMeta | undefined }
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "blad" }
  | { rodzaj: "siec" };

type StanSzczegolow = { rodzaj: "ladowanie" } | { rodzaj: "dane"; szczegoly: AdminReliabilityDetail } | BladSzczegolow;

type Widok = { rodzaj: "lista" } | { rodzaj: "osoba"; osoba: AdminReliabilityPerson };

interface Zapytanie {
  strona: number;
  /** Rośnie przy każdym ponowieniu, żeby ta sama strona wczytała się jeszcze raz. */
  proba: number;
}

const OKRUSZKI = [{ etykieta: "Administracja" }, { etykieta: "Czas nauki" }];

const KOLUMNY_OSOB: KolumnaTabeli[] = [
  { nazwa: "Osoba", rodzaj: "nazwa" },
  { nazwa: "Rzetelność", rodzaj: "tekst" },
  { nazwa: "Stan", rodzaj: "stan" },
  { nazwa: "Akcje", rodzaj: "akcje" },
];

const SIATKA_OSOB = "minmax(0, 2fr) minmax(0, 1fr) max-content max-content";

const KOLUMNY_LEKCJI: KolumnaTabeli[] = [
  { nazwa: "Lekcja", rodzaj: "nazwa" },
  { nazwa: "Czas aktywny", rodzaj: "tekst" },
  { nazwa: "Czas lekcji", rodzaj: "tekst" },
  { nazwa: "Liczba otwarć", rodzaj: "tekst" },
  { nazwa: "Ostatnia aktywność", rodzaj: "tekst" },
  { nazwa: "Stan", rodzaj: "stan" },
];

const SIATKA_LEKCJI = "minmax(0, 2fr) repeat(3, minmax(0, 1fr)) minmax(0, 1.4fr) max-content";

const NAGLOWEK_WIDOKU = "naglowek";
const idPrzyciskuSzczegolow = (id: number) => `czas-nauki-szczegoly-${id}`;

function liczbaOsob(liczba: number): string {
  return `${liczba} ${odmien(liczba, "osoba", "osoby", "osób")}`;
}

function nazwaOsoby(osoba: AdminReliabilityPerson): string {
  return `${osoba.first_name} ${osoba.last_name}`;
}

function WierszeLekcji({ szczegoly }: { szczegoly: AdminReliabilityDetail }) {
  const wiersze: WierszTabeli[] = szczegoly.lessons.map((lekcja) => {
    const stan = stanLekcji(lekcja.below_threshold);
    return {
      id: String(lekcja.id),
      komorki: [
        lekcja.title,
        formatujCzas(lekcja.active_seconds),
        formatujCzas(lekcja.duration_seconds),
        String(lekcja.open_count),
        lekcja.last_activity_at === null ? "brak danych" : formatujDateICzas(lekcja.last_activity_at),
        <Badge key="stan" wariant={stan.wariant}>
          {stan.tekst}
        </Badge>,
      ],
    };
  });
  return (
    <div className={style.lista}>
      <div className={style.ukryte}>
        <Heading stopien={2}>Ukończone lekcje</Heading>
      </div>
      <TabelaWierszy tytul="Ukończone lekcje" kolumny={KOLUMNY_LEKCJI} wiersze={wiersze} siatka={SIATKA_LEKCJI} />
    </div>
  );
}

/**
 * Ekran „Czas nauki” — rzetelność nauki osób z bieżącego roku programu
 * (administracja), na szablonie `ListTemplate`. Trasy: `GET /admin/reliability`
 * (lista, 25 osób na stronę, od najniższej rzetelności) i
 * `GET /admin/reliability/{userId}` (szczegóły osoby: ukończone lekcje z czasem
 * aktywnym, czasem lekcji, liczbą otwarć i ostatnią aktywnością). Trasa listy
 * nie przyjmuje filtra ani własnego sortowania, więc ekran ich nie ma.
 *
 * Wiersz: nazwa osoby jako odnośnik do jej karty, pod nią e-mail, rzetelność,
 * stan słowami i przycisk „Szczegóły”. Szczegóły otwierają się jako osobny
 * widok tego samego ekranu (nagłówek z nazwą osoby, przycisk „Wróć do listy”);
 * powrót wraca na tę samą stronę listy bez ponownego pobierania, a fokus na
 * przycisk, który widok otworzył. Szczegóły są pamiętane w ekranie, więc
 * ponowne otwarcie tej samej osoby nie woła serwera (tak jak na starym ekranie).
 * Czas pokazany w „godz.” i „min”.
 * Stany listy: ładowanie, dane, pusta, brak uprawnień (wspólny ekran odmowy),
 * błąd odpowiedzi serwera i brak połączenia. Stany szczegółów: ładowanie,
 * dane, bez lekcji, błąd, brak połączenia, brak uprawnień i „nie znaleziono
 * osoby” (wspólny ekran odmowy).
 */
export function CzasNauki() {
  const router = useRouter();
  const wRamce = useWRamce();
  const [zapytanie, setZapytanie] = useState<Zapytanie>({ strona: 1, proba: 0 });
  const [stan, setStan] = useState<StanListy>({ rodzaj: "ladowanie" });
  const [widok, setWidok] = useState<Widok>({ rodzaj: "lista" });
  const [szczegoly, setSzczegoly] = useState<Record<number, StanSzczegolow>>({});
  const celFokusu = useRef<string | null>(null);

  useEffect(() => {
    let anulowane = false;
    pobierzOsoby(zapytanie.strona)
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

  // Fokus ustawia ekran po zmianie widoku: nagłówek widoku osoby albo przycisk, który ten widok otworzył.
  useEffect(() => {
    const cel = celFokusu.current;
    if (cel === null) return;
    celFokusu.current = null;
    if (cel === NAGLOWEK_WIDOKU) {
      const naglowek = document.querySelector<HTMLElement>("main h1");
      naglowek?.setAttribute("tabindex", "-1");
      naglowek?.focus();
      return;
    }
    document.getElementById(cel)?.focus();
  });

  function przejdz(strona: number) {
    setStan({ rodzaj: "ladowanie" });
    setZapytanie((poprzednie) => ({ strona, proba: poprzednie.proba + 1 }));
  }

  function wczytajSzczegoly(osobaId: number) {
    setSzczegoly((poprzednie) => ({ ...poprzednie, [osobaId]: { rodzaj: "ladowanie" } }));
    pobierzSzczegoly(osobaId)
      .then((dane) => setSzczegoly((poprzednie) => ({ ...poprzednie, [osobaId]: { rodzaj: "dane", szczegoly: dane } })))
      .catch((wyjatek: unknown) =>
        setSzczegoly((poprzednie) => ({ ...poprzednie, [osobaId]: sklasyfikujBladSzczegolow(wyjatek) })),
      );
  }

  function otworzOsobe(osoba: AdminReliabilityPerson) {
    const zapamietane = szczegoly[osoba.id];
    if (zapamietane === undefined || (zapamietane.rodzaj !== "dane" && zapamietane.rodzaj !== "ladowanie")) {
      wczytajSzczegoly(osoba.id);
    }
    celFokusu.current = NAGLOWEK_WIDOKU;
    setWidok({ rodzaj: "osoba", osoba });
  }

  function wrocDoListy() {
    if (widok.rodzaj === "osoba") celFokusu.current = idPrzyciskuSzczegolow(widok.osoba.id);
    setWidok({ rodzaj: "lista" });
  }

  if (widok.rodzaj === "osoba") {
    return (
      <WidokOsoby
        osoba={widok.osoba}
        stan={szczegoly[widok.osoba.id] ?? { rodzaj: "ladowanie" }}
        wRamce={wRamce}
        onWroc={wrocDoListy}
        onPonow={() => wczytajSzczegoly(widok.osoba.id)}
      />
    );
  }

  const meta = stan.rodzaj === "dane" ? stan.meta : undefined;
  const opis = `Osoby od najniższej rzetelności. Otwórz szczegóły osoby, aby zobaczyć czas nauki w ukończonych lekcjach.${
    meta === undefined ? "" : ` Razem: ${liczbaOsob(meta.total)}.`
  }`;
  const naglowek = <PageHeader okruszki={OKRUSZKI} tytul="Czas nauki" opis={opis} onPowrot={() => router.back()} />;

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

  let lista: ReactNode;
  if (stan.rodzaj === "ladowanie") {
    lista = <Skeleton wiersze={5} />;
  } else if (stan.rodzaj === "siec" || stan.rodzaj === "blad") {
    lista = (
      <div className={style.lista}>
        <div className={style.ukryte}>
          <Heading stopien={2}>Lista osób</Heading>
        </div>
        <Notice
          wariant="error"
          tytul={stan.rodzaj === "siec" ? "Brak połączenia z serwerem" : "Nie udało się wczytać listy"}
          akcja={
            <Button poziom="outline" onClick={() => przejdz(zapytanie.strona)}>
              Spróbuj ponownie
            </Button>
          }
        >
          {stan.rodzaj === "siec"
            ? "Sprawdź połączenie z internetem i spróbuj jeszcze raz."
            : "Serwer nie odpowiedział poprawnie. Spróbuj ponownie za chwilę."}
        </Notice>
      </div>
    );
  } else if (stan.osoby.length === 0) {
    lista = (
      <EmptyState
        naglowek="Brak osób z danymi do wyświetlenia"
        tresc="Dane pojawią się, gdy osoby zaczną kończyć lekcje w bieżącym roku programu."
        przycisk={{ etykieta: "Wczytaj listę ponownie", onClick: () => przejdz(zapytanie.strona) }}
      />
    );
  } else {
    const wiersze: WierszTabeli[] = stan.osoby.map((osoba) => {
      const stanOsoby = stanRzetelnosci(osoba);
      const nazwa = nazwaOsoby(osoba);
      return {
        id: String(osoba.id),
        komorki: [
          <Fragment key="osoba">
            <Link href={`${SCIEZKA_KARTY}/${osoba.id}`}>{nazwa}</Link>
            <Hint>{osoba.email}</Hint>
          </Fragment>,
          formatujRzetelnosc(osoba.reliability_percent),
          <Badge key="stan" wariant={stanOsoby.wariant}>
            {stanOsoby.tekst}
          </Badge>,
          <Button
            key="akcje"
            poziom="outline"
            rozmiar="sm"
            id={idPrzyciskuSzczegolow(osoba.id)}
            aria-label={`Szczegóły czasu nauki: ${nazwa}`}
            onClick={() => otworzOsobe(osoba)}
          >
            Szczegóły
          </Button>,
        ],
      };
    });
    lista = (
      <div className={style.lista}>
        <div className={style.ukryte}>
          <Heading stopien={2}>Lista osób</Heading>
        </div>
        <TabelaWierszy tytul="Lista osób" kolumny={KOLUMNY_OSOB} wiersze={wiersze} siatka={SIATKA_OSOB} />
      </div>
    );
  }

  const stronicowanie =
    meta !== undefined && meta.last_page > 1 ? (
      <Pagination
        strona={meta.current_page}
        stron={meta.last_page}
        naPoprzednia={() => przejdz(meta.current_page - 1)}
        naNastepna={() => przejdz(meta.current_page + 1)}
      />
    ) : undefined;

  return <ListTemplate naglowek={naglowek} lista={lista} stronicowanie={stronicowanie} />;
}

interface WlasciwosciWidokuOsoby {
  osoba: AdminReliabilityPerson;
  stan: StanSzczegolow;
  /** Ekran stoi w nowej ramce panelu, której nagłówek nie ma przycisku powrotu. */
  wRamce: boolean;
  onWroc: () => void;
  onPonow: () => void;
}

/** Widok jednej osoby: nagłówek z nazwą, e-mailem i rzetelnością, pod nim ukończone lekcje z czasem. */
function WidokOsoby({ osoba, stan, wRamce, onWroc, onPonow }: WlasciwosciWidokuOsoby) {
  const stanOsoby = stanRzetelnosci(osoba);
  const naglowek = (
    <PageHeader
      okruszki={[...OKRUSZKI, { etykieta: nazwaOsoby(osoba) }]}
      tytul={nazwaOsoby(osoba)}
      opis={`${osoba.email}. Rzetelność: ${osoba.reliability_percent === null ? "brak danych" : formatujRzetelnosc(osoba.reliability_percent)}.`}
      status={{ wariant: stanOsoby.wariant, etykieta: stanOsoby.tekst }}
      onPowrot={onWroc}
      etykietaPowrotu="Wróć do listy"
    />
  );

  const odnosniki = (
    <div className={style.odnosniki}>
      {wRamce && (
        <Button poziom="outline" onClick={onWroc}>
          Wróć do listy
        </Button>
      )}
      <Link href={`${SCIEZKA_KARTY}/${osoba.id}`}>Otwórz kartę osoby</Link>
    </div>
  );

  if (stan.rodzaj === "brak-uprawnien" || stan.rodzaj === "nie-znaleziono") {
    return (
      <ListTemplate
        naglowek={naglowek}
        filtry={odnosniki}
        lista={
          stan.rodzaj === "brak-uprawnien" ? (
            <EkranOdmowy
              rodzaj="brak-dostepu"
              stopien={2}
              rolaDocelowa="administracji"
              przycisk={{ etykieta: "Wróć do listy", onClick: onWroc }}
            />
          ) : (
            <EkranOdmowy
              rodzaj="nie-znaleziono"
              czego="osoby"
              stopien={2}
              coDalej="Osoby nie ma na liście albo nie należy do bieżącego roku programu."
              przycisk={{ etykieta: "Wróć do listy", onClick: onWroc }}
            />
          )
        }
      />
    );
  }

  let lista: ReactNode;
  if (stan.rodzaj === "ladowanie") {
    lista = <Skeleton wiersze={3} />;
  } else if (stan.rodzaj === "siec" || stan.rodzaj === "blad") {
    lista = (
      <div className={style.lista}>
        <div className={style.ukryte}>
          <Heading stopien={2}>Ukończone lekcje</Heading>
        </div>
        <Notice
          wariant="error"
          tytul={stan.rodzaj === "siec" ? "Brak połączenia z serwerem" : "Nie udało się wczytać szczegółów osoby"}
          akcja={
            <Button poziom="outline" onClick={onPonow}>
              Spróbuj ponownie
            </Button>
          }
        >
          {stan.rodzaj === "siec" ? "Sprawdź połączenie z internetem i spróbuj jeszcze raz." : stan.komunikat}
        </Notice>
      </div>
    );
  } else if (stan.szczegoly.lessons.length === 0) {
    lista = (
      <EmptyState
        naglowek="Brak ukończonych lekcji z pomiarem czasu"
        tresc="Czas nauki pojawi się tu, gdy osoba ukończy lekcję z nagraniem."
        przycisk={{ etykieta: "Wróć do listy", onClick: onWroc }}
      />
    );
  } else {
    lista = <WierszeLekcji szczegoly={stan.szczegoly} />;
  }

  return <ListTemplate naglowek={naglowek} filtry={odnosniki} lista={lista} />;
}
