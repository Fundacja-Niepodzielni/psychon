"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { Field } from "@/design-system/molekuly/Field/Field";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Pagination } from "@/design-system/molekuly/Pagination/Pagination";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";
import { EkranOdmowy } from "@/nowy-front/wspolne/ekran-odmowy";
import {
  pobierzLiczbyDlaGrantodawcy,
  pobierzRaport,
  pobierzZestawienie,
  rodzajBledu,
  zdanieBleduPobrania,
  zdanieZlegoOkresu,
  type OkresRaportu,
  type RaportRokuProgramu as DaneRaportu,
} from "./dane";
import {
  brakZdarzenWOkresie,
  liczbaStron,
  liczbyGlowne,
  opisOkresu,
  opisZestawienia,
  pozostaleLiczby,
  stronaZestawienia,
  walidujOkres,
  wierszZestawienia,
  ZDANIE_BRAKU_ZDARZEN,
  ZDANIE_GRANTODAWCY,
  ZDANIE_O_DATACH,
  ZDANIE_PUSTEGO_ZESTAWIENIA,
  ZDANIE_ZESTAWIENIA,
  type Para,
} from "./logika";
import { Zestawienie } from "./Zestawienie";
import style from "./RaportRokuProgramu.module.css";

const OKRUSZKI = [{ etykieta: "Administracja" }, { etykieta: "Raport roku programu" }];
const TYTUL = "Raport roku programu";

type StanEkranu =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "dane"; raport: DaneRaportu }
  | { rodzaj: "brak-dostepu" }
  | { rodzaj: "siec" }
  | { rodzaj: "blad" };

type StanPobrania = { rodzaj: "spoczynek" } | { rodzaj: "trwa" } | { rodzaj: "gotowe" } | { rodzaj: "blad"; komunikat: string };

interface Zapytanie {
  okres: OkresRaportu;
  /** Rośnie przy każdym odczycie, żeby ten sam okres wczytał się jeszcze raz. */
  proba: number;
}

/** Lista opisów (nazwa i wartość) — liczby raportu, bez kafli i bez odnośników. */
function ListaLiczb({ pary }: { pary: Para[] }) {
  return (
    <dl className={style.liczby}>
      {pary.map((para) => (
        <div key={para.nazwa} className={style.para}>
          <dt>{para.nazwa}</dt>
          <dd>{para.wartosc}</dd>
        </div>
      ))}
    </dl>
  );
}

function Sekcja({ id, tytul, children }: { id: string; tytul: string; children: ReactNode }) {
  return (
    <section className={style.karta} aria-labelledby={id}>
      <Heading stopien={2} id={id}>
        {tytul}
      </Heading>
      {children}
    </section>
  );
}

/**
 * Ekran „Raport roku programu” (administracja) na szablonie `ListTemplate`,
 * jak lista osób. Kolejność w kodzie = kolejność na ekranie: nagłówek z rokiem
 * programu, „Od kiedy do kiedy” (dwie daty i przycisk, zdanie o tym, co daty
 * zawężają), najważniejsze liczby programu, „Dla grantodawcy” (jedyny zielony
 * przycisk: plik z samymi liczbami), „Pozostałe liczby” (z wierszem studentów)
 * i „Zestawienie” z tabelą osób w samym raporcie i stronicowaniem.
 *
 * Dane: `GET /admin/report` (bloki `edition`, `period`, `program`, `students`,
 * `people`), pliki `export.csv?uklad=zestawienie` i `report/grantor/export.csv`
 * z tym samym okresem co liczby na ekranie. Stany: ładowanie, błąd, brak
 * połączenia, brak dostępu (wspólny ekran odmowy), rok bez osób, raport,
 * okres bez zdarzeń i zły zakres dat.
 */
export function RaportRokuProgramu() {
  const router = useRouter();
  const [formularz, setFormularz] = useState({ od: "", do: "" });
  const [bladOkresu, setBladOkresu] = useState<string | null>(null);
  const [zapytanie, setZapytanie] = useState<Zapytanie>({ okres: {}, proba: 0 });
  const [stan, setStan] = useState<StanEkranu>({ rodzaj: "ladowanie" });
  const [strona, setStrona] = useState(1);
  const [plikGrantodawcy, setPlikGrantodawcy] = useState<StanPobrania>({ rodzaj: "spoczynek" });
  const [plikZestawienia, setPlikZestawienia] = useState<StanPobrania>({ rodzaj: "spoczynek" });
  // Ostatni pokazany raport: po odrzuconym przez serwer okresie ekran wraca do niego.
  const ostatniRaport = useRef<{ raport: DaneRaportu; okres: OkresRaportu } | null>(null);
  const fokusNaZestawienie = useRef(false);
  const id = useId();
  const idZestawienia = `${id}-zestawienie`;
  const idPowoduZestawienia = `${id}-powod-zestawienia`;
  const idPowoduGrantodawcy = `${id}-powod-grantodawcy`;
  const idPowoduOkresu = `${id}-powod-okresu`;

  useEffect(() => {
    let anulowane = false;
    pobierzRaport(zapytanie.okres)
      .then((raport) => {
        if (anulowane) return;
        if (raport === null) {
          setStan({ rodzaj: "blad" });
          return;
        }
        ostatniRaport.current = { raport, okres: zapytanie.okres };
        setStan({ rodzaj: "dane", raport });
      })
      .catch((wyjatek: unknown) => {
        if (anulowane) return;
        const rodzaj = rodzajBledu(wyjatek);
        const poprzedni = ostatniRaport.current;
        if (rodzaj === "zly-okres" && poprzedni !== null) {
          setBladOkresu(zdanieZlegoOkresu(wyjatek));
          setZapytanie({ okres: poprzedni.okres, proba: zapytanie.proba });
          setStan({ rodzaj: "dane", raport: poprzedni.raport });
          return;
        }
        setStan({ rodzaj: rodzaj === "zly-okres" ? "blad" : rodzaj });
      });
    return () => {
      anulowane = true;
    };
    // Odczyt tylko przy nowym zapytaniu (okres albo ponowienie).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zapytanie.proba]);

  // Po zmianie strony zestawienia fokus idzie na jego nagłówek.
  useEffect(() => {
    if (!fokusNaZestawienie.current) return;
    fokusNaZestawienie.current = false;
    document.getElementById(idZestawienia)?.focus();
  });

  function wczytaj(okres: OkresRaportu) {
    setStan({ rodzaj: "ladowanie" });
    setStrona(1);
    setPlikGrantodawcy({ rodzaj: "spoczynek" });
    setPlikZestawienia({ rodzaj: "spoczynek" });
    setZapytanie((poprzednie) => ({ okres, proba: poprzednie.proba + 1 }));
  }

  function pokazOkres(zdarzenie: FormEvent<HTMLFormElement>) {
    zdarzenie.preventDefault();
    const blad = walidujOkres(formularz.od, formularz.do);
    setBladOkresu(blad);
    if (blad !== null) return;
    wczytaj({ from: formularz.od || undefined, to: formularz.do || undefined });
  }

  async function pobierz(rodzaj: "grantodawca" | "zestawienie") {
    const ustaw = rodzaj === "grantodawca" ? setPlikGrantodawcy : setPlikZestawienia;
    ustaw({ rodzaj: "trwa" });
    try {
      await (rodzaj === "grantodawca" ? pobierzLiczbyDlaGrantodawcy : pobierzZestawienie)(zapytanie.okres);
      ustaw({ rodzaj: "gotowe" });
    } catch (wyjatek) {
      ustaw({ rodzaj: "blad", komunikat: zdanieBleduPobrania(wyjatek) });
    }
  }

  const raport = stan.rodzaj === "dane" ? stan.raport : null;
  const naglowek = (
    <PageHeader
      okruszki={OKRUSZKI}
      tytul={TYTUL}
      opis={raport !== null ? `Rok programu: ${raport.edition.name}` : undefined}
      onPowrot={() => router.back()}
    />
  );

  if (stan.rodzaj === "brak-dostepu") {
    return (
      <ListTemplate
        naglowek={naglowek}
        lista={<EkranOdmowy rodzaj="brak-dostepu" stopien={2} rolaDocelowa="administracji" przycisk={{ etykieta: "Wróć", onClick: () => router.back() }} />}
      />
    );
  }

  if (stan.rodzaj === "siec" || stan.rodzaj === "blad") {
    const siec = stan.rodzaj === "siec";
    return (
      <ListTemplate
        naglowek={naglowek}
        lista={
          <Notice
            wariant="error"
            tytul={siec ? "Brak połączenia" : "Nie udało się wczytać raportu"}
            akcja={
              <Button poziom="primary" onClick={() => wczytaj(zapytanie.okres)}>
                Spróbuj ponownie
              </Button>
            }
          >
            {siec
              ? "Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie."
              : "Serwer nie odpowiedział albo zwrócił błąd. Liczby nie są pokazywane bez danych."}
          </Notice>
        }
      />
    );
  }

  const wczytywanie = stan.rodzaj === "ladowanie";
  const filtry = (
    <section className={style.karta} aria-labelledby={`${id}-okres`}>
      <Heading stopien={2} id={`${id}-okres`}>
        Od kiedy do kiedy
      </Heading>
      <form className={style.okres} onSubmit={pokazOkres} aria-labelledby={`${id}-okres`} noValidate>
        <div className={style.data}>
          <Field
            id={`${id}-od`}
            etykieta="Początek okresu"
            rodzaj="data"
            wartosc={formularz.od}
            onZmiana={(wartosc) => setFormularz((f) => ({ ...f, od: wartosc }))}
            zablokowany={wczytywanie}
          />
        </div>
        <div className={style.data}>
          <Field
            id={`${id}-do`}
            etykieta="Koniec okresu"
            rodzaj="data"
            wartosc={formularz.do}
            onZmiana={(wartosc) => setFormularz((f) => ({ ...f, do: wartosc }))}
            zablokowany={wczytywanie}
            blad={bladOkresu ?? undefined}
          />
        </div>
        <div className={style.przyciskOkresu}>
          <Button poziom="outline" type="submit" disabled={wczytywanie} aria-describedby={wczytywanie ? idPowoduOkresu : undefined}>
            Pokaż raport za ten okres
          </Button>
        </div>
      </form>
      {wczytywanie && <Hint id={idPowoduOkresu}>Trwa wczytywanie raportu — poczekaj chwilę.</Hint>}
      <Text>{ZDANIE_O_DATACH}</Text>
      {raport !== null && (
        <p role="status" className={style.zdanie}>
          {opisOkresu(raport.period)}
        </p>
      )}
    </section>
  );

  if (raport === null) {
    return (
      <ListTemplate
        naglowek={naglowek}
        filtry={filtry}
        lista={
          <div className={style.stos}>
            <p role="status" className={style.zdanie}>
              Wczytywanie raportu…
            </p>
            <Skeleton wiersze={6} />
          </div>
        }
      />
    );
  }

  const wiersze = raport.people.map(wierszZestawienia);
  const stron = liczbaStron(wiersze.length);
  const pusto = wiersze.length === 0;
  const trwaGrantodawca = plikGrantodawcy.rodzaj === "trwa";
  const trwaZestawienie = plikZestawienia.rodzaj === "trwa";
  const powodZestawienia = pusto ? ZDANIE_PUSTEGO_ZESTAWIENIA : trwaZestawienie ? "Trwa pobieranie pliku — poczekaj chwilę." : null;

  const lista = (
    <div className={style.stos}>
      <Sekcja id={`${id}-glowne`} tytul="Najważniejsze liczby">
        <Text>Liczby programu obejmują wolontariuszy. Studenci są osobno w „Pozostałych liczbach”.</Text>
        <ListaLiczb pary={liczbyGlowne(raport)} />
        {brakZdarzenWOkresie(raport) && <p className={style.zdanie}>{ZDANIE_BRAKU_ZDARZEN}</p>}
      </Sekcja>

      <Sekcja id={`${id}-grantodawca`} tytul="Dla grantodawcy">
        <Text>{ZDANIE_GRANTODAWCY}</Text>
        <div className={style.akcja}>
          <Button
            poziom="primary"
            onClick={() => {
              if (!trwaGrantodawca) void pobierz("grantodawca");
            }}
            aria-disabled={trwaGrantodawca ? true : undefined}
            aria-describedby={trwaGrantodawca ? idPowoduGrantodawcy : undefined}
          >
            {trwaGrantodawca ? "Pobieranie…" : "Pobierz liczby dla grantodawcy (bez nazwisk)"}
          </Button>
        </div>
        {trwaGrantodawca && <Hint id={idPowoduGrantodawcy}>Trwa pobieranie pliku — poczekaj chwilę.</Hint>}
        <StanPliku stan={plikGrantodawcy} tytulBledu="Nie udało się pobrać liczb dla grantodawcy" />
      </Sekcja>

      <Sekcja id={`${id}-pozostale`} tytul="Pozostałe liczby">
        <ListaLiczb pary={pozostaleLiczby(raport)} />
      </Sekcja>

      <section className={style.karta} aria-labelledby={idZestawienia}>
        <Heading stopien={2} id={idZestawienia}>
          Zestawienie
        </Heading>
        <div className={style.akcja}>
          <Button
            poziom="outline"
            onClick={() => void pobierz("zestawienie")}
            disabled={powodZestawienia !== null}
            aria-describedby={powodZestawienia !== null ? idPowoduZestawienia : `${id}-uwaga-zestawienia`}
          >
            {trwaZestawienie ? "Pobieranie…" : "Pobierz zestawienie (Excel)"}
          </Button>
        </div>
        <Hint id={`${id}-uwaga-zestawienia`}>{ZDANIE_ZESTAWIENIA}</Hint>
        {powodZestawienia !== null && <Hint id={idPowoduZestawienia}>{powodZestawienia}</Hint>}
        <StanPliku stan={plikZestawienia} tytulBledu="Nie udało się pobrać zestawienia" />
        {pusto ? (
          <Text>{ZDANIE_PUSTEGO_ZESTAWIENIA}</Text>
        ) : (
          <>
            <Text>{opisZestawienia(wiersze.length)}</Text>
            <Zestawienie tytul="Zestawienie osób roku programu" wiersze={stronaZestawienia(wiersze, strona)} />
          </>
        )}
      </section>
    </div>
  );

  const zmienStrone = (nowa: number) => {
    fokusNaZestawienie.current = true;
    setStrona(nowa);
  };

  return (
    <ListTemplate
      naglowek={naglowek}
      filtry={filtry}
      lista={lista}
      stronicowanie={
        stron > 1 ? (
          <Pagination strona={strona} stron={stron} naPoprzednia={() => zmienStrone(strona - 1)} naNastepna={() => zmienStrone(strona + 1)} />
        ) : undefined
      }
    />
  );
}

function StanPliku({ stan, tytulBledu }: { stan: StanPobrania; tytulBledu: string }) {
  if (stan.rodzaj === "blad") {
    return (
      <Notice wariant="error" tytul={tytulBledu}>
        {stan.komunikat}
      </Notice>
    );
  }
  if (stan.rodzaj === "gotowe") {
    return (
      <p role="status" className={style.zdanie}>
        Plik pobrany.
      </p>
    );
  }
  return null;
}
