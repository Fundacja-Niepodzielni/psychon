"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/design-system/atomy/Badge/Badge";
import { Button } from "@/design-system/atomy/Button/Button";
import { ErrorText } from "@/design-system/atomy/ErrorText/ErrorText";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Icon } from "@/design-system/atomy/Icon/Icon";
import { Link } from "@/design-system/atomy/Link/Link";
import { ProgressBar } from "@/design-system/atomy/ProgressBar/ProgressBar";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { Dialog } from "@/design-system/organizmy/Dialog/Dialog";
import { KorzenSzablonu } from "@/design-system/szablony/KontekstPowloki";
import { formatujDateICzas } from "@/nowy-front/wspolne/daty";
import { ADRES_PULPITU, EkranOdmowy } from "@/nowy-front/wspolne/ekran-odmowy";
import { adresPowrotuZPodgladu, PasTrybuPodgladu, zParametremPodgladu } from "@/nowy-front/wspolne/tryb-podgladu";
import {
  ADRES_LISTY_KURSOW,
  adresKursu,
  pobierzHistorie,
  pobierzKursTestu,
  pobierzTest,
  sklasyfikujBladTestu,
  sklasyfikujBladWyslania,
  wyslijPodejscie,
  type BladTestu,
  type DaneTestu,
  type KursTestu,
  type PodejscieZHistorii,
  type WynikPodejscia,
} from "./dane";
import {
  liczbaOdpowiedzi,
  pozostalePodejscia,
  przyciskPytania,
  przyciskStartu,
  przyciskWyniku,
  pytaniaZBledem,
  zaliczonePodejscie,
  ZDANIE_POTWIERDZENIA,
  zdanieLekcji,
  zdanieWyniku,
  ZDANIE_PRZEBIEGU,
  type PrzyciskGlowny,
} from "./logika";
import style from "./TestUczestnika.module.css";

interface WlasciwosciTestUczestnika {
  slug: string;
  /**
   * Tryb podglądu (rozstrzyga go wyżej parametr adresu i rola konta —
   * `TestUczestnikaZAdresu`): pas „Tryb podglądu…” nad ekranem, pytania można
   * przejrzeć, ale odpowiedzi nie są wysyłane.
   */
  podglad?: boolean;
  /** Rola konta; razem z `podglad` wyznacza adres powrotu „Wróć do edycji kursu”. */
  rola?: string | null;
}

type Etap =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "blad"; blad: BladTestu }
  | { rodzaj: "start"; test: DaneTestu; komunikat: string | null }
  | {
      rodzaj: "pytania";
      test: DaneTestu;
      indeks: number;
      odpowiedzi: Record<number, number>;
      wysylanie: boolean;
      potwierdzenie: boolean;
      bladWyslania: string | null;
    }
  | { rodzaj: "wynik"; test: DaneTestu; wynik: WynikPodejscia };

/** Odczyt kursu: `undefined`, dopóki trwa. */
type StanKursu = KursTestu | "nie-znaleziono" | null | undefined;

const ZDANIE_PODEJSCIA_CALE = "Twoje podejścia nie zostały zużyte.";

/**
 * Test końcowy kursu w nowym wyglądzie (`/panel/kursy/[slug]/test`). Ten sam
 * przebieg co dotychczasowy ekran: próg zaliczenia i podejścia (limit z
 * odczytu testu), pytania po kolei bez cofania, przejście dalej dopiero po
 * zaznaczeniu odpowiedzi, wysłanie, wynik z listą pytań z błędną odpowiedzią
 * i historia podejść. Przed wysłaniem okno potwierdzenia (wariant
 * niebezpieczny — wysłania nie da się cofnąć) mówi, że odpowiedzi nie da się
 * już zmienić. Test już zaliczony (pole `passed` z odczytu) pokazuje wynik
 * i „Test zaliczony” zamiast „Rozpocznij”.
 *
 * Układ jak ekran lekcji: powrót do kursu, nagłówek z nazwą kursu i JEDNYM
 * zielonym przyciskiem (na szerokim ekranie przyklejony pod górnym paskiem, na
 * telefonie w stałym pasku u dołu). Nieczynny przycisk wygląda na nieczynny
 * (jasny, z kłódką, `aria-disabled`), zostaje w kolejności fokusu, a powód stoi
 * stale w zdaniu obok. Odmowy i „nie znaleziono” — wspólny `EkranOdmowy`
 * w opakowaniu, które na telefonie rozciąga jego przycisk na całą szerokość.
 */
export function TestUczestnika({ slug, podglad = false, rola = null }: WlasciwosciTestUczestnika) {
  const router = useRouter();
  const [etap, setEtap] = useState<Etap>({ rodzaj: "ladowanie" });
  const [kurs, setKurs] = useState<StanKursu>(undefined);
  const [historia, setHistoria] = useState<PodejscieZHistorii[]>([]);
  const zamontowany = useRef(true);
  const zadanie = useRef(0);
  const dokRef = useRef<HTMLDivElement>(null);
  const korzenRef = useRef<HTMLDivElement>(null);
  const idPowodu = useId();
  const idBledu = useId();
  const idSekcji = useId();
  const fokusNaSekcje = useRef(false);

  const odswiezHistorie = useCallback((idTestu: number) => {
    void pobierzHistorie(idTestu).then((lista) => {
      // Historia jest pomocnicza: nieudany odczyt zostawia to, co już widać.
      if (zamontowany.current && lista !== null) setHistoria(lista);
    });
  }, []);

  /** Odczyt testu; z `zKursem` także odczyt kursu (pierwsze wejście i „Spróbuj ponownie”). */
  const wczytaj = useCallback(
    (zKursem: boolean) => {
      const numer = ++zadanie.current;
      const odczytTestu = pobierzTest(slug).then(
        (test) => ({ test }),
        (wyjatek: unknown) => ({ blad: sklasyfikujBladTestu(wyjatek) }),
      );
      const odczytKursu = zKursem ? pobierzKursTestu(slug) : Promise.resolve(undefined);
      void Promise.all([odczytTestu, odczytKursu]).then(([wynik, odczytany]) => {
        if (!zamontowany.current || numer !== zadanie.current) return;
        if (odczytany !== undefined) setKurs(odczytany);
        if ("test" in wynik) {
          setEtap({ rodzaj: "start", test: wynik.test, komunikat: null });
          odswiezHistorie(wynik.test.test_id);
        } else {
          setEtap({ rodzaj: "blad", blad: wynik.blad });
        }
      });
    },
    [slug, odswiezHistorie],
  );

  useEffect(() => {
    zamontowany.current = true;
    wczytaj(true);
    return () => {
      zamontowany.current = false;
    };
  }, [wczytaj]);

  // Po zmianie pytania albo po wyniku fokus idzie na nagłówek nowej treści.
  useEffect(() => {
    if (!fokusNaSekcje.current) return;
    fokusNaSekcje.current = false;
    document.getElementById(idSekcji)?.focus();
  });

  // Wysokość dolnego paska na telefonie: strona zostawia pod treścią tyle miejsca, ile on zajmuje.
  const maPrzycisk = etap.rodzaj !== "ladowanie";
  useEffect(() => {
    const dok = dokRef.current;
    const korzen = korzenRef.current;
    if (dok === null || korzen === null || typeof ResizeObserver === "undefined") return undefined;
    const zmierz = () => korzen.style.setProperty("--dock-h", `${Math.ceil(dok.getBoundingClientRect().height)}px`);
    zmierz();
    const obserwator = new ResizeObserver(zmierz);
    obserwator.observe(dok);
    return () => obserwator.disconnect();
  }, [maPrzycisk]);

  const daneKursu = typeof kurs === "object" && kurs !== null ? kurs : null;
  const powrotPodgladu = podglad && daneKursu !== null ? adresPowrotuZPodgladu(rola, daneKursu.id) : null;
  const trybPodgladu = powrotPodgladu !== null;
  const adres = (cel: string) => zParametremPodgladu(cel, trybPodgladu);
  const kursuNieMa = kurs === "nie-znaleziono";
  const celPowrotu = adres(kursuNieMa ? ADRES_LISTY_KURSOW : adresKursu(slug));
  const nazwaKursu = daneKursu?.title ?? null;
  const wrocDoKursu = () => router.push(celPowrotu);

  function ponow() {
    setEtap({ rodzaj: "ladowanie" });
    wczytaj(true);
  }

  function rozpocznij(test: DaneTestu) {
    fokusNaSekcje.current = true;
    setEtap({ rodzaj: "pytania", test, indeks: 0, odpowiedzi: {}, wysylanie: false, potwierdzenie: false, bladWyslania: null });
  }

  function podejdzPonownie() {
    setEtap({ rodzaj: "ladowanie" });
    wczytaj(false);
  }

  function zaznacz(idPytania: number, idOdpowiedzi: number) {
    setEtap((poprzedni) =>
      poprzedni.rodzaj === "pytania" && !poprzedni.wysylanie
        ? { ...poprzedni, odpowiedzi: { ...poprzedni.odpowiedzi, [idPytania]: idOdpowiedzi }, bladWyslania: null }
        : poprzedni,
    );
  }

  async function wyslij() {
    if (etap.rodzaj !== "pytania" || etap.wysylanie || trybPodgladu) return;
    const { test, odpowiedzi } = etap;
    setEtap({ ...etap, potwierdzenie: false, wysylanie: true, bladWyslania: null });
    try {
      const wynik = await wyslijPodejscie(test.test_id, odpowiedzi);
      if (!zamontowany.current) return;
      fokusNaSekcje.current = true;
      setEtap({ rodzaj: "wynik", test, wynik });
      odswiezHistorie(test.test_id);
    } catch (wyjatek) {
      if (!zamontowany.current) return;
      const blad = sklasyfikujBladWyslania(wyjatek);
      if (blad.rodzaj === "zaliczony") {
        // Test zaliczony w międzyczasie (np. w drugiej karcie): świeży odczyt pokaże zaliczenie.
        setEtap({ rodzaj: "ladowanie" });
        wczytaj(false);
      } else if (blad.rodzaj === "brak-podejsc") {
        setEtap({ rodzaj: "start", test: { ...test, attempts_used: Math.max(test.attempts_used, test.attempts_limit) }, komunikat: blad.komunikat });
      } else if (blad.rodzaj === "lekcje-nieukonczone") {
        setEtap({ rodzaj: "blad", blad: { rodzaj: "lekcje-nieukonczone" } });
      } else {
        setEtap((poprzedni) => (poprzedni.rodzaj === "pytania" ? { ...poprzedni, wysylanie: false, bladWyslania: blad.komunikat } : poprzedni));
      }
    }
  }

  const { przycisk: akcja, tresc } = widokEtapu();

  function widokEtapu(): { przycisk: PrzyciskGlowny | null; tresc: ReactNode } {
    switch (etap.rodzaj) {
      case "ladowanie":
        return {
          przycisk: null,
          tresc: (
            <>
              <p role="status" className={style.stanLadowania}>
                Ładowanie testu…
              </p>
              <Skeleton wiersze={6} />
            </>
          ),
        };
      case "blad":
        return widokBledu(etap.blad);
      case "start": {
        const { test } = etap;
        if (test.passed) return { przycisk: przyciskStartu(test), tresc: widokZaliczonego(test) };
        const bezPodejsc = pozostalePodejscia(test) === 0;
        return {
          przycisk: przyciskStartu(test),
          tresc: (
            <>
              <section className={style.karta} aria-labelledby={idSekcji}>
                <Heading stopien={2} id={idSekcji}>
                  {bezPodejsc ? "Nie masz już podejść" : "Zanim zaczniesz"}
                </Heading>
                <dl className={style.liczby}>
                  <div>
                    <dt>Pytania</dt>
                    <dd>{test.questions.length}</dd>
                  </div>
                  <div>
                    <dt>Próg zaliczenia</dt>
                    <dd>{test.pass_threshold}%</dd>
                  </div>
                  <div>
                    <dt>Wykorzystane podejścia</dt>
                    <dd>
                      {test.attempts_used} z {test.attempts_limit}
                    </dd>
                  </div>
                  <div>
                    <dt>Pozostało podejść</dt>
                    <dd>{pozostalePodejscia(test)}</dd>
                  </div>
                </dl>
                <p className={style.tekst}>{ZDANIE_PRZEBIEGU}</p>
                {etap.komunikat !== null && (
                  <p className={`${style.blad} ${style.komunikatBledu}`} role="alert">
                    {etap.komunikat}
                  </p>
                )}
              </section>
              <HistoriaPodejsc historia={historia} />
            </>
          ),
        };
      }
      case "pytania":
        return widokPytania(etap);
      case "wynik": {
        const { test, wynik } = etap;
        const bledne = pytaniaZBledem(test.questions, wynik);
        return {
          przycisk: przyciskWyniku(test, wynik),
          tresc: (
            <>
              <section className={style.karta} aria-labelledby={idSekcji}>
                <Heading stopien={2} id={idSekcji}>
                  {wynik.passed ? "Test zaliczony" : "Test niezaliczony"}
                </Heading>
                <p className={style.wynik}>{wynik.score_percent}%</p>
                <p className={style.tekst}>
                  Próg zaliczenia: {test.pass_threshold}% · Podejście {wynik.attempt_number} z {test.attempts_limit}
                </p>
                <Badge wariant={wynik.passed ? "ok" : "error"}>{wynik.passed ? "Zaliczony" : "Niezaliczony"}</Badge>
                <p className={style.tekst} role="status">
                  {zdanieWyniku(test, wynik)}
                </p>
              </section>
              {bledne.length > 0 && (
                <section className={style.karta} aria-labelledby={`${idSekcji}-bledne`}>
                  <Heading stopien={2} id={`${idSekcji}-bledne`}>
                    Pytania z błędną odpowiedzią
                  </Heading>
                  <ol className={style.lista}>
                    {bledne.map((pytanie) => (
                      <li key={pytanie.id}>{pytanie.body}</li>
                    ))}
                  </ol>
                </section>
              )}
              <HistoriaPodejsc historia={historia} />
            </>
          ),
        };
      }
    }
  }

  /** Test zaliczony już przy wejściu: wynik zaliczonego podejścia z historii, próg i plakietka — bez „Rozpocznij”. */
  function widokZaliczonego(test: DaneTestu): ReactNode {
    const zaliczone = zaliczonePodejscie(historia);
    const opis =
      zaliczone === null
        ? `Próg zaliczenia: ${test.pass_threshold}%`
        : `Próg zaliczenia: ${test.pass_threshold}% · Podejście ${zaliczone.attempt_number} z ${test.attempts_limit}`;
    return (
      <>
        <section className={style.karta} aria-labelledby={idSekcji}>
          <Heading stopien={2} id={idSekcji}>
            Test zaliczony
          </Heading>
          {zaliczone !== null && <p className={style.wynik}>{zaliczone.score_percent}%</p>}
          <p className={style.tekst}>{opis}</p>
          <Badge wariant="ok">Zaliczony</Badge>
        </section>
        <HistoriaPodejsc historia={historia} />
      </>
    );
  }

  function widokBledu(blad: BladTestu): { przycisk: PrzyciskGlowny | null; tresc: ReactNode } {
    const wrocAkcja: PrzyciskGlowny = { etykieta: "Wróć do kursu", czynny: true, zdanie: "Lekcje znajdziesz na stronie kursu." };
    const ponowAkcja: PrzyciskGlowny = { etykieta: "Spróbuj ponownie", czynny: true, zdanie: ZDANIE_PODEJSCIA_CALE };
    switch (blad.rodzaj) {
      case "lekcje-nieukonczone":
        return {
          przycisk: wrocAkcja,
          tresc: (
            <KartaStanu id={idSekcji} tytul="Test otworzy się po ukończeniu lekcji">
              {zdanieLekcji(daneKursu?.nieukonczone ?? null)}
            </KartaStanu>
          ),
        };
      case "nie-znaleziono":
        if (!kursuNieMa && daneKursu?.has_test === false) {
          return {
            przycisk: wrocAkcja,
            tresc: (
              <KartaStanu id={idSekcji} tytul="Ten kurs nie ma testu końcowego">
                Kurs kończysz, gdy ukończysz wszystkie jego lekcje.
              </KartaStanu>
            ),
          };
        }
        return {
          przycisk: null,
          tresc: (
            <div className={style.odmowa}>
              <EkranOdmowy
                rodzaj="nie-znaleziono"
                czego={kursuNieMa ? "kursu" : "testu"}
                stopien={2}
                przycisk={{ etykieta: kursuNieMa ? "Wróć do listy kursów" : "Wróć do kursu", onClick: wrocDoKursu }}
              />
            </div>
          ),
        };
      case "kurs-zamkniety":
      case "brak-dostepu":
        return {
          przycisk: null,
          tresc: (
            <div className={style.odmowa}>
              <EkranOdmowy rodzaj="brak-dostepu" stopien={2} coDalej={blad.komunikat} przycisk={{ onClick: () => router.push(ADRES_PULPITU) }} />
            </div>
          ),
        };
      case "dostep-wygasl":
        return {
          przycisk: null,
          tresc: (
            <div className={style.odmowa}>
              <EkranOdmowy
                rodzaj="dostep-wygasl"
                stopien={2}
                coDalej="Za chwilę przeniesiemy Cię na stronę z informacją o wygaśnięciu dostępu."
                przycisk={{ etykieta: "Wróć do kursów", onClick: () => router.push(ADRES_LISTY_KURSOW) }}
              />
            </div>
          ),
        };
      case "siec":
        return {
          przycisk: ponowAkcja,
          tresc: (
            <KartaStanu id={idSekcji} tytul="Brak połączenia" blad>
              Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.
            </KartaStanu>
          ),
        };
      case "blad":
        return {
          przycisk: ponowAkcja,
          tresc: (
            <KartaStanu id={idSekcji} tytul="Nie udało się wczytać testu" blad>
              Coś poszło nie tak po naszej stronie. Spróbuj ponownie za chwilę.
            </KartaStanu>
          ),
        };
    }
  }

  function widokPytania(stan: Extract<Etap, { rodzaj: "pytania" }>): { przycisk: PrzyciskGlowny; tresc: ReactNode } {
    const { test, indeks, odpowiedzi, wysylanie } = stan;
    const pytanie = test.questions[indeks];
    const razem = test.questions.length;
    const ostatnie = indeks === razem - 1;
    const odpowiedziane = pytanie !== undefined && odpowiedzi[pytanie.id] !== undefined;
    const przycisk = przyciskPytania({ odpowiedziane, ostatnie, wysylanie, podglad: trybPodgladu });
    const zebrane = liczbaOdpowiedzi(test.questions, odpowiedzi);
    return {
      przycisk,
      tresc: (
        <>
          <section className={style.karta} aria-labelledby={idSekcji}>
            <Heading stopien={2} id={idSekcji}>
              {`Pytanie ${indeks + 1} z ${razem}`}
            </Heading>
            <div className={style.postep}>
              <ProgressBar procent={razem === 0 ? 0 : (zebrane / razem) * 100} etykieta={`Odpowiedzi: ${zebrane} z ${razem}`} />
            </div>
            {pytanie !== undefined && (
              <fieldset className={style.pytanie} disabled={wysylanie}>
                <legend>{pytanie.body}</legend>
                {pytanie.answers.map((odpowiedz) => {
                  const wybrana = odpowiedzi[pytanie.id] === odpowiedz.id;
                  return (
                    <label key={odpowiedz.id} className={`${style.odpowiedz} ${wybrana ? style.wybrana : ""}`.trim()}>
                      <input
                        type="radio"
                        name={`pytanie-${pytanie.id}`}
                        value={odpowiedz.id}
                        checked={wybrana}
                        onChange={() => zaznacz(pytanie.id, odpowiedz.id)}
                      />
                      <span>{odpowiedz.body}</span>
                    </label>
                  );
                })}
              </fieldset>
            )}
          </section>
          {stan.potwierdzenie && (
            <Dialog
              tytul="Wysłać odpowiedzi?"
              etykietaWycofania="Wróć do pytania"
              etykietaPotwierdzenia="Wyślij odpowiedzi"
              niebezpieczne
              onWycofaj={() => setEtap({ ...stan, potwierdzenie: false })}
              onPotwierdz={() => void wyslij()}
            >
              <Text>{ZDANIE_POTWIERDZENIA}</Text>
            </Dialog>
          )}
        </>
      ),
    };
  }

  const bladWyslania = etap.rodzaj === "pytania" ? etap.bladWyslania : null;

  /** Działanie jedynego zielonego przycisku; nieczynny niczego nie robi (powód stoi w zdaniu obok). */
  function nacisnieto() {
    if (akcja === null || !akcja.czynny) return;
    switch (etap.rodzaj) {
      case "blad":
        if (etap.blad.rodzaj === "siec" || etap.blad.rodzaj === "blad") ponow();
        else wrocDoKursu();
        return;
      case "start":
        if (etap.test.passed) wrocDoKursu();
        else rozpocznij(etap.test);
        return;
      case "pytania":
        if (etap.indeks >= etap.test.questions.length - 1) {
          setEtap({ ...etap, potwierdzenie: true });
          return;
        }
        fokusNaSekcje.current = true;
        setEtap({ ...etap, indeks: etap.indeks + 1, bladWyslania: null });
        return;
      case "wynik":
        if (etap.wynik.passed) wrocDoKursu();
        else podejdzPonownie();
        return;
      case "ladowanie":
        return;
    }
  }

  return (
    <KorzenSzablonu className={style.korzen} styleId="test-uczestnika">
      <div ref={korzenRef} className={style.strona} data-z-paskiem={akcja !== null ? "" : undefined}>
        {trybPodgladu && <PasTrybuPodgladu powrot={powrotPodgladu} />}
        <div className={style.pasek}>
          <Link href={celPowrotu} aria-label={kursuNieMa ? "Wróć do listy kursów" : nazwaKursu !== null ? `Wróć do kursu: ${nazwaKursu}` : "Wróć do kursu"}>
            <span aria-hidden="true">‹ </span>
            {kursuNieMa ? "Wróć do listy kursów" : "Wróć do kursu"}
          </Link>
        </div>

        <header className={style.glowa}>
          <div className={style.tytul}>
            <Heading stopien={1}>Test końcowy</Heading>
            {nazwaKursu !== null && <p className={style.podtytul}>{nazwaKursu}</p>}
          </div>
          {akcja !== null && (
            <div ref={dokRef} className={style.dok}>
              <div className={style.akcje}>
                <span className={style.przycisk} data-nieczynny={akcja.czynny ? undefined : "true"}>
                  <Button
                    poziom="primary"
                    aria-disabled={akcja.czynny ? undefined : true}
                    aria-describedby={bladWyslania === null ? idPowodu : `${idPowodu} ${idBledu}`}
                    onClick={nacisnieto}
                  >
                    {!akcja.czynny && <Icon nazwa="lock" rozmiar={16} />}
                    {akcja.etykieta}
                  </Button>
                </span>
                <p id={idPowodu} className={style.powod} aria-live="polite">
                  {akcja.zdanie}
                </p>
                <ErrorText id={idBledu}>{bladWyslania ?? undefined}</ErrorText>
              </div>
            </div>
          )}
        </header>

        {tresc}
      </div>
    </KorzenSzablonu>
  );
}

/** Karta stanu bez danych testu: nagłówek drugiego stopnia i jedno zdanie (błąd — z rolą `alert`). */
function KartaStanu({ id, tytul, blad = false, children }: { id: string; tytul: string; blad?: boolean; children: ReactNode }) {
  return (
    <section className={`${style.karta} ${blad ? style.komunikatBledu : ""}`.trim()} aria-labelledby={id} role={blad ? "alert" : undefined}>
      <Heading stopien={2} id={id}>
        {tytul}
      </Heading>
      <p className={style.tekst}>{children}</p>
    </section>
  );
}

/** Historia własnych podejść: numer, data, wynik i stan słowem. Pusta historia nie rysuje karty. */
function HistoriaPodejsc({ historia }: { historia: PodejscieZHistorii[] }) {
  const id = useId();
  if (historia.length === 0) return null;
  return (
    <section className={style.karta} aria-labelledby={id}>
      <Heading stopien={2} id={id}>
        Historia podejść
      </Heading>
      <ul className={style.historia}>
        {historia.map((podejscie) => (
          <li key={podejscie.attempt_number} className={style.podejscie}>
            <span className={style.podejscieOpis}>
              Podejście {podejscie.attempt_number} · {formatujDateICzas(podejscie.created_at)}
            </span>
            <span className={style.podejscieWynik}>
              {podejscie.score_percent}%
              <Badge wariant={podejscie.passed ? "ok" : "error"}>{podejscie.passed ? "zaliczone" : "niezaliczone"}</Badge>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
