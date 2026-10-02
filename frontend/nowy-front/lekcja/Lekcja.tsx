"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { ErrorText } from "@/design-system/atomy/ErrorText/ErrorText";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Icon } from "@/design-system/atomy/Icon/Icon";
import { Link } from "@/design-system/atomy/Link/Link";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { TrescLekcji } from "@/design-system/molekuly/TrescLekcji/TrescLekcji";
import { KorzenSzablonu } from "@/design-system/szablony/KontekstPowloki";
import {
  adresPowrotuZPodgladu,
  PARAMETR_PODGLADU,
  PasTrybuPodgladu,
  useTrybPodgladu,
  zParametremPodgladu,
} from "@/nowy-front/wspolne/tryb-podgladu";
import { adresLekcji, kursZAdresu } from "./adres";
import {
  maTekst,
  pobierzDaneLekcji,
  pozycjaStartowa,
  odswiezLinkNagrania,
  ukonczLekcje,
  wyslijPostep,
  type DaneLekcji,
  type OdmowaKolejnosci,
  type PowodBrakuOdtwarzacza,
  type ZrodloNagrania,
} from "./dane";
import { kontekstKursu, numerLekcjiWKursie, plikiLekcji, pobierzOdczytKursu, type OdczytKursu } from "./kurs";
import { MaterialyLekcji } from "./MaterialyLekcji";
import type { PostepNagrania } from "@/design-system/organizmy/RecordingPlayer/RecordingPlayer";
import { EkranOdmowy } from "../wspolne/ekran-odmowy";
import { OdtwarzaczNagrania } from "./odtwarzacz/OdtwarzaczNagrania";
import { ID_KARTY_PYTAN, ID_POLA_PYTANIA, PytaniaLekcji, ZDANIE_PODGLADU } from "./PytaniaLekcji";
import {
  minutyObejrzane,
  podtytul,
  stanPrzycisku,
  wymaganeSekundy,
  zdanieObejrzane,
  zdaniePostepuTematu,
  type CelPrzycisku,
  type RodzajNagrania,
} from "./stan";
import style from "./Lekcja.module.css";

/** Heartbeat cadence — the upper bound the contract allows ("co <= 30 s"). */
const HEARTBEAT_INTERWAL_SEKUND = 30;

/** Lista kursów właściwa dla roli: dokąd wraca podgląd, gdy odczyt lekcji nie niesie identyfikatora kursu. */
function listaKursowDlaRoli(rola: string | null): string {
  return rola === "instructor" ? "/prowadzacy/kursy" : "/admin/kursy";
}

/** Seconds counted locally since the last send: played, played with the tab
 * visible, and played since the last cadence tick. */
interface ZebranePrzyrosty {
  obejrzane: number;
  aktywne: number;
  odTyku: number;
}

type StanEkranu =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "blad" }
  | { rodzaj: "zablokowany"; komunikat: string }
  | { rodzaj: "wygasl"; komunikat: string }
  | { rodzaj: "lekcja-zamknieta"; komunikat: string; wymaganaLekcjaId: number | null }
  | { rodzaj: "nie-znaleziono" }
  | {
      rodzaj: "ok";
      dane: DaneLekcji;
      bezNagrania: boolean;
      nagranie?: PowodBrakuOdtwarzacza;
      zrodlo?: ZrodloNagrania;
    };

interface WlasciwosciLekcja {
  id: string;
}

const ZDANIE_BLEDU_UKONCZENIA = "Nie udało się ukończyć lekcji. Sprawdź internet i naciśnij jeszcze raz.";
const ZDANIE_ODMOWY_UKONCZENIA = "Serwer nie pozwala jeszcze ukończyć tej lekcji.";

/** Układ strony bez danych lekcji: nagłówek stanu i treść stanu, w tym samym korzeniu co ekran. */
function StanStrony({ children }: { children: ReactNode }) {
  return (
    <KorzenSzablonu className={style.korzen} styleId="ekran-lekcji-uczestnika">
      <div className={style.strona}>{children}</div>
    </KorzenSzablonu>
  );
}

/**
 * Route `/nowy-front/lekcja/[id]`. Układ ze zatwierdzonego szkicu: okruszki (na
 * telefonie jeden odnośnik powrotu do tematu), nagłówek z tytułem, podtytułem
 * i JEDNYM zielonym przyciskiem (na szerokim ekranie przyklejony pod górnym
 * paskiem, na telefonie w stałym pasku u dołu), postęp w temacie, nagranie,
 * treść, materiały do pobrania i pytania do prowadzącego.
 *
 * Zielony przycisk jest zawsze widoczny. Dopóki warunek ukończenia nie jest
 * spełniony, wygląda na nieczynny (jasny, z kłódką, `aria-disabled`), ale zostaje
 * w kolejności fokusu, a powód stoi stale w zdaniu obok. Po ukończeniu ten sam
 * przycisk prowadzi dalej (następna lekcja, następny temat, test albo kurs), a
 * fokus przechodzi na ogłaszany znacznik „Ukończona”.
 *
 * Dane: `GET /lessons/{id}` (lekcja, kurs, adresat pytań, wymagany czas),
 * `GET /lessons/{id}/video-link` (źródło nagrania), `GET /courses/{slug}`
 * (postęp w temacie, następna lekcja, pliki, test), `GET`/`POST
 * /lessons/{id}/questions`. Odczyt kursu zawodzi albo nie niesie lekcji: ekran
 * działa dalej bez elementów, które z niego wynikają. Po ukończeniu ekran nie
 * czyta lekcji ponownie (każdy odczyt zwiększa licznik otwarć).
 *
 * Postęp (`POST /lessons/{id}/progress`): ramka odtwarzacza zgłasza pozycję
 * i pełne sekundy oglądania oraz czasu aktywnego (karta ukryta liczy się jako
 * oglądana, nie jako aktywna); ekran zbiera te przyrosty i co 30 s oglądania
 * wysyła je razem z `position_seconds`. Czas rośnie tylko z komunikatów ramki;
 * koniec nagrania nie kończy lekcji. Nieudany zapis zostawia przyrosty do
 * następnego razu i pod nagraniem pojawia się zdanie o braku internetu.
 */
export function Lekcja({ id }: WlasciwosciLekcja) {
  const router = useRouter();
  const parametry = useSearchParams();
  const kursZParametru = kursZAdresu(parametry.get("kurs"));
  // Podgląd: parametr adresu i rola personelu albo prowadzącego. Dopóki rola się nie rozstrzygnie, a w adresie
  // jest parametr podglądu, nic nie jest zapisywane (osoba z taką rolą nie może zapisać niczego przez pomyłkę).
  const { podglad, rola } = useTrybPodgladu();
  const zapisZablokowany = podglad || (parametry.get(PARAMETR_PODGLADU) !== null && rola === null);
  const adres = (cel: string) => zParametremPodgladu(cel, podglad);
  const idPowodu = useId();
  const idBleduUkonczenia = useId();
  const [stan, setStan] = useState<StanEkranu>({ rodzaj: "ladowanie" });
  const [wysylanie, setWysylanie] = useState(false);
  const [bladUkonczenia, setBladUkonczenia] = useState<string | null>(null);
  const [bladZapisu, setBladZapisu] = useState(false);
  /** Lekcja, której ramka zgłosiła błąd (adres niedozwolony, brak gotowości, błąd odtwarzania, nieudane odświeżenie). */
  const [bladOdtwarzacza, setBladOdtwarzacza] = useState<string | null>(null);
  const [odczytKursu, setOdczytKursu] = useState<{ klucz: string; kurs: OdczytKursu | null } | null>(null);
  const pozycjaRef = useRef(0);
  const przyrostyRef = useRef<ZebranePrzyrosty>({ obejrzane: 0, aktywne: 0, odTyku: 0 });
  const wysylanieRef = useRef(false);
  const zamontowanaRef = useRef(true);
  const statusRef = useRef<HTMLSpanElement>(null);
  const dokRef = useRef<HTMLDivElement>(null);
  const korzenRef = useRef<HTMLDivElement>(null);
  const fokusNaStatusRef = useRef(false);
  const zapisZablokowanyRef = useRef(zapisZablokowany);

  /** Odmowa kolejności z dowolnego żądania ekranu: ten sam stan, nic już nie jest wysyłane. */
  const naOdmoweKolejnosci = useCallback((odmowa: OdmowaKolejnosci) => {
    if (!zamontowanaRef.current) return;
    setStan({ rodzaj: "lekcja-zamknieta", komunikat: odmowa.komunikat, wymaganaLekcjaId: odmowa.wymaganaLekcjaId });
  }, []);

  const wyslijZebrane = useCallback(async () => {
    if (zapisZablokowanyRef.current) return;
    const zebrane = przyrostyRef.current;
    if (wysylanieRef.current || (zebrane.obejrzane === 0 && zebrane.aktywne === 0)) return;
    wysylanieRef.current = true;
    const przyrosty = {
      watched_delta: zebrane.obejrzane,
      active_delta: zebrane.aktywne,
      position_seconds: pozycjaRef.current,
    };
    zebrane.obejrzane = 0;
    zebrane.aktywne = 0;
    const postep = await wyslijPostep(id, przyrosty);
    wysylanieRef.current = false;
    if (!zamontowanaRef.current) return;
    if (postep !== null && "odmowaKolejnosci" in postep) {
      // Lekcja zamknięta kolejnością: osobny stan, bez ponawiania wysyłki.
      naOdmoweKolejnosci(postep);
      return;
    }
    if (!postep) {
      // Not saved: keep the increments, the next tick sends them together.
      // (Pozycja jest bezwzględna, nie przyrostem: następna wysyłka niesie nową.)
      zebrane.obejrzane += przyrosty.watched_delta;
      zebrane.aktywne += przyrosty.active_delta;
      setBladZapisu(true);
      return;
    }
    setBladZapisu(false);
    setStan((poprzedni) =>
      poprzedni.rodzaj === "ok"
        ? {
            ...poprzedni,
            dane: {
              ...poprzedni.dane,
              watched_seconds: postep.watched_seconds,
              active_seconds: postep.active_seconds,
              completable: postep.completable,
              completable_at_percent: postep.completable_at_percent,
              required_active_seconds: postep.required_active_seconds ?? poprzedni.dane.required_active_seconds,
            },
          }
        : poprzedni,
    );
  }, [id, naOdmoweKolejnosci]);

  function wczytaj(straz?: { anulowane: boolean }) {
    return pobierzDaneLekcji(id).then((wynik) => {
      if (straz?.anulowane) return;
      if (wynik.status === "ok") {
        setStan({
          rodzaj: "ok",
          dane: wynik.dane,
          bezNagrania: wynik.bezNagrania,
          nagranie: wynik.nagranie,
          zrodlo: wynik.zrodloNagrania,
        });
      } else if (wynik.status === "lekcja-zamknieta") {
        setStan({ rodzaj: "lekcja-zamknieta", komunikat: wynik.komunikat, wymaganaLekcjaId: wynik.wymaganaLekcjaId });
      } else if (wynik.status === "zablokowany" || wynik.status === "wygasl") {
        setStan({ rodzaj: wynik.status, komunikat: wynik.komunikat });
      } else if (wynik.status === "nie-znaleziono") {
        setStan({ rodzaj: "nie-znaleziono" });
      } else {
        setStan({ rodzaj: "blad" });
      }
    });
  }

  useEffect(() => {
    const straz = { anulowane: false };
    void wczytaj(straz);
    return () => {
      straz.anulowane = true;
    };
    // Fetch only on mount/id change — nothing else in this effect changes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    zapisZablokowanyRef.current = zapisZablokowany;
  }, [zapisZablokowany]);

  useEffect(() => {
    zamontowanaRef.current = true;
    return () => {
      zamontowanaRef.current = false;
    };
  }, []);

  const lekcjaGotowa = stan.rodzaj === "ok";
  const lekcjaZamknieta = stan.rodzaj === "lekcja-zamknieta";
  const idLekcji = Number(id);
  // Kurs z odczytu lekcji; parametr adresu tylko dla odpowiedzi sprzed zmiany zaplecza.
  const slugKursu = (stan.rodzaj === "ok" ? stan.dane.course?.slug : null) ?? kursZParametru;
  const kluczKursu = `${slugKursu ?? ""}/${idLekcji}`;
  const odswiezKurs = useCallback(async () => {
    if (slugKursu === null) return null;
    const kurs = await pobierzOdczytKursu(slugKursu);
    // Nieudany ponowny odczyt nie zabiera ekranowi tego, co już wie o kursie.
    if (zamontowanaRef.current && kurs !== null) setOdczytKursu({ klucz: kluczKursu, kurs });
    return kurs;
  }, [slugKursu, kluczKursu]);
  const odswiezPliki = useCallback(async () => {
    const kurs = await odswiezKurs();
    return kurs === null ? null : plikiLekcji(kurs, idLekcji);
  }, [odswiezKurs, idLekcji]);

  // Kurs czytamy dla lekcji gotowej (kontekst, pliki) i dla lekcji zamkniętej kolejnością (numer wymaganej lekcji).
  const potrzebujeKursu = lekcjaGotowa || lekcjaZamknieta;
  useEffect(() => {
    if (!potrzebujeKursu || slugKursu === null) return undefined;
    let anulowane = false;
    void pobierzOdczytKursu(slugKursu).then((kurs) => {
      if (!anulowane) setOdczytKursu({ klucz: kluczKursu, kurs });
    });
    return () => {
      anulowane = true;
    };
  }, [potrzebujeKursu, slugKursu, kluczKursu]);
  const kurs = potrzebujeKursu && odczytKursu?.klucz === kluczKursu ? odczytKursu.kurs : null;


  // Pozycja startowa z odczytu lekcji; liczba, więc efekt niżej nie odpala się od samej zmiany obiektu stanu.
  const pozycjaStartowaLekcji = stan.rodzaj === "ok" ? pozycjaStartowa(stan.dane) : 0;
  useEffect(() => {
    if (!lekcjaGotowa) return;
    przyrostyRef.current = { obejrzane: 0, aktywne: 0, odTyku: 0 };
    pozycjaRef.current = pozycjaStartowaLekcji;
  }, [lekcjaGotowa, id, pozycjaStartowaLekcji]);

  /**
   * Postęp zgłoszony przez ramkę: pozycja bezwzględna i pełne sekundy oglądania
   * oraz czasu aktywnego od poprzedniego zgłoszenia. Czas rośnie wyłącznie z
   * komunikatów ramki (organizm liczy go przy odtwarzaniu i widocznej karcie,
   * ekran nie ma własnego zegara); koniec nagrania niczego tu nie zmienia.
   */
  const naPostep = useCallback(
    (postep: PostepNagrania) => {
      pozycjaRef.current = postep.pozycjaSekund;
      const ukryta = typeof document !== "undefined" && document.hidden;
      const zebrane = przyrostyRef.current;
      zebrane.obejrzane += postep.przyrostObejrzane;
      zebrane.aktywne += postep.przyrostAktywne;
      zebrane.odTyku += postep.przyrostObejrzane;
      if (zebrane.odTyku < HEARTBEAT_INTERWAL_SEKUND) return;
      zebrane.odTyku = 0;
      if (ukryta) return;
      void wyslijZebrane();
    },
    [wyslijZebrane],
  );
  const naZmianePozycji = useCallback((pozycja: number) => {
    pozycjaRef.current = pozycja;
  }, []);
  const naZmianeOdtwarzania = useCallback(() => {}, []);
  /** Nowy link do nagrania, gdy adres ramki wygasł: jedyna droga odtwarzacza do zaplecza. */
  const odswiezLink = useCallback(() => odswiezLinkNagrania(id), [id]);
  const naBladOdtwarzacza = useCallback(() => {
    if (zamontowanaRef.current) setBladOdtwarzacza(id);
  }, [id]);

  // Wysokość dolnego paska na telefonie: strona zostawia pod treścią tyle miejsca, ile on zajmuje.
  useEffect(() => {
    const dok = dokRef.current;
    const korzen = korzenRef.current;
    if (dok === null || korzen === null || typeof ResizeObserver === "undefined") return undefined;
    const zmierz = () => korzen.style.setProperty("--dock-h", `${Math.ceil(dok.getBoundingClientRect().height)}px`);
    zmierz();
    const obserwator = new ResizeObserver(zmierz);
    obserwator.observe(dok);
    return () => obserwator.disconnect();
  }, [lekcjaGotowa]);

  // Po ukończeniu fokus idzie na ogłaszany znacznik, nie zostaje na przycisku, który zmienił nazwę.
  useEffect(() => {
    if (!fokusNaStatusRef.current) return;
    fokusNaStatusRef.current = false;
    statusRef.current?.focus();
  });

  function ponow() {
    setStan({ rodzaj: "ladowanie" });
    void wczytaj();
  }

  const wracaj = () => router.back();

  function przejdz(cel: CelPrzycisku) {
    if (cel.rodzaj === "lekcja") router.push(adres(adresLekcji(cel.id, slugKursu)));
    else if (cel.rodzaj === "test" && slugKursu !== null) router.push(adres(`/panel/kursy/${slugKursu}/test`));
    else router.push(adres(slugKursu !== null ? `/panel/kursy/${slugKursu}` : "/panel/kursy"));
  }

  async function oznaczUkonczona() {
    if (wysylanie || zapisZablokowanyRef.current) return;
    setWysylanie(true);
    setBladUkonczenia(null);
    const wynik = await ukonczLekcje(id);
    setWysylanie(false);
    if (!zamontowanaRef.current) return;
    if (wynik.status === "ok") {
      fokusNaStatusRef.current = true;
      setStan((poprzedni) =>
        poprzedni.rodzaj === "ok" ? { ...poprzedni, dane: { ...poprzedni.dane, is_completed: true } } : poprzedni,
      );
    } else if (wynik.status === "zamknieta") {
      naOdmoweKolejnosci(wynik.odmowa);
    } else if (wynik.status === "za-malo-czasu") {
      setBladUkonczenia(ZDANIE_ODMOWY_UKONCZENIA);
    } else {
      setBladUkonczenia(ZDANIE_BLEDU_UKONCZENIA);
    }
  }

  if (stan.rodzaj === "ladowanie") {
    return (
      <StanStrony>
        <Skeleton wiersze={6} />
      </StanStrony>
    );
  }

  if (stan.rodzaj === "nie-znaleziono") {
    return (
      <StanStrony>
        <EkranOdmowy
          rodzaj="nie-znaleziono"
          coDalej="Sprawdź adres albo wróć do listy kursów."
          przycisk={{ etykieta: "Wróć do kursów", onClick: () => router.push(adres("/panel/kursy")) }}
        />
      </StanStrony>
    );
  }

  if (stan.rodzaj === "zablokowany") {
    return (
      <StanStrony>
        <EkranOdmowy
          rodzaj="brak-dostepu"
          coDalej={stan.komunikat}
          przycisk={{ etykieta: "Wróć do kursów", onClick: () => router.push(adres("/panel/kursy")) }}
        />
      </StanStrony>
    );
  }

  if (stan.rodzaj === "lekcja-zamknieta") {
    const wymagana = stan.wymaganaLekcjaId;
    const numer = wymagana !== null && kurs !== null ? numerLekcjiWKursie(kurs, wymagana) : null;
    const adresKursuZamknietej = slugKursu === null ? "/panel/kursy" : `/panel/kursy/${slugKursu}`;
    const cel = adres(wymagana !== null ? adresLekcji(wymagana, slugKursu) : adresKursuZamknietej);
    const etykieta = wymagana === null ? "Wróć do kursu" : numer !== null ? `Przejdź do lekcji ${numer}` : "Przejdź do wymaganej lekcji";
    return (
      <StanStrony>
        {podglad && <PasTrybuPodgladu powrot={listaKursowDlaRoli(rola)} />}
        <section className={`${style.karta} ${style.biala}`} aria-labelledby="naglowek-zamknietej">
          <Heading stopien={1} id="naglowek-zamknietej">
            {numer !== null ? `Najpierw ukończ lekcję ${numer}` : "Ta lekcja jest jeszcze zamknięta"}
          </Heading>
          <Text>{numer !== null ? "Lekcje w tym kursie przechodzisz po kolei." : stan.komunikat}</Text>
          <Button poziom="primary" onClick={() => router.push(cel)}>
            {etykieta}
          </Button>
        </section>
      </StanStrony>
    );
  }

  if (stan.rodzaj === "wygasl") {
    return (
      <StanStrony>
        <EkranOdmowy
          rodzaj="dostep-wygasl"
          coDalej="Skontaktuj się z zespołem programu, żeby przedłużyć dostęp."
          przycisk={{ etykieta: "Wróć do kursów", onClick: () => router.push(adres("/panel/kursy")) }}
        />
      </StanStrony>
    );
  }

  if (stan.rodzaj === "blad") {
    return (
      <StanStrony>
        <Heading stopien={1}>Lekcja</Heading>
        <Notice
          wariant="error"
          tytul="Nie udało się wczytać lekcji"
          akcja={
            <Button poziom="outline" onClick={ponow}>
              Spróbuj ponownie
            </Button>
          }
        >
          Backend nie odpowiedział poprawnie — spróbuj ponownie później.
        </Notice>
      </StanStrony>
    );
  }

  const { dane, bezNagrania } = stan;
  // Nagranie bez adresu osadzenia albo z błędem ramki to „nie działa”; ukończenie lekcji zostaje wtedy bez nagrania.
  const nagranie: RodzajNagrania = bezNagrania
    ? (stan.nagranie ?? "brak")
    : bladOdtwarzacza === id || stan.zrodlo?.adresOsadzenia === undefined
      ? "nie-dziala"
      : "jest";
  const ukonczona = dane.is_completed;
  const wymagane = wymaganeSekundy(dane);
  const kontekst = kurs === null ? null : kontekstKursu(kurs, idLekcji, ukonczona);
  const przyciskBazowy = stanPrzycisku({
    ukonczona,
    nagranie,
    mozna: dane.completable,
    aktywneSekundy: dane.active_seconds,
    wymagane,
    kontekst,
    maTest: kurs?.has_test === true && slugKursu !== null,
  });
  // W podglądzie ukończenia nie ma: przycisk wygląda na nieczynny, powód stoi obok.
  const przycisk =
    podglad && przyciskBazowy.cel.rodzaj === "ukoncz"
      ? { ...przyciskBazowy, czynny: false, zdanie: ZDANIE_PODGLADU }
      : przyciskBazowy;
  const pliki = kurs === null ? null : plikiLekcji(kurs, idLekcji);
  const temat = kontekst?.temat ?? dane.topic ?? null;
  const nazwaTematu = temat === null ? null : "tytul" in temat ? temat.tytul : temat.title;
  const nazwaKursu = dane.course?.title ?? null;
  const adresKursu = adres(slugKursu === null ? "/panel/kursy" : `/panel/kursy/${slugKursu}`);
  const adresPowrotu =
    (dane.course?.id !== undefined ? adresPowrotuZPodgladu(rola, dane.course.id) : null) ?? listaKursowDlaRoli(rola);
  const adresat = dane.question_addressee?.name ?? null;
  const czyPodtytul = podtytul(dane.duration_seconds, nagranie, dane.content);
  const maTresc = maTekst(dane.content) || maTekst(dane.description);
  const pusta = nagranie === "brak" && !maTresc && (pliki === null || pliki.length === 0);
  const { obejrzane: obejrzaneMinuty, potrzebne } = minutyObejrzane(dane.active_seconds, wymagane);

  function nacisnietoPrzycisk() {
    if (!przycisk.czynny || wysylanie) return;
    if (przycisk.cel.rodzaj === "ukoncz") void oznaczUkonczona();
    else przejdz(przycisk.cel);
  }

  function napiszDoProwadzacego() {
    document.getElementById(ID_KARTY_PYTAN)?.scrollIntoView({ block: "start" });
    document.getElementById(ID_POLA_PYTANIA)?.focus({ preventScroll: true });
  }

  return (
    <KorzenSzablonu className={style.korzen} styleId="ekran-lekcji-uczestnika">
      <div ref={korzenRef} className={style.strona}>
        {podglad && <PasTrybuPodgladu powrot={adresPowrotu} />}
        <div className={style.pasek}>
          <nav className={style.okruszki} aria-label="Gdzie jesteś">
            <ol>
              <li>
                <Link wariant="okruszek" href={adres("/panel/kursy")}>
                  Kursy
                </Link>
              </li>
              {nazwaKursu !== null && (
                <li>
                  <Link wariant="okruszek" href={adresKursu}>
                    {nazwaKursu}
                  </Link>
                </li>
              )}
              {nazwaTematu !== null && nazwaTematu !== "" && (
                <li>
                  {slugKursu === null ? (
                    <span>{nazwaTematu}</span>
                  ) : (
                    <Link wariant="okruszek" href={adresKursu}>
                      {nazwaTematu}
                    </Link>
                  )}
                </li>
              )}
            </ol>
          </nav>
          <span className={style.powrot}>
            <Link
              href={adresKursu}
              aria-label={
                nazwaTematu ? `Wróć do tematu: ${nazwaTematu}` : nazwaKursu ? `Wróć do kursu: ${nazwaKursu}` : "Wróć do kursów"
              }
            >
              <span aria-hidden="true">‹ </span>
              {nazwaTematu || nazwaKursu || "Kursy"}
            </Link>
          </span>
        </div>

        <header className={style.glowa}>
          <div className={style.tytul}>
            <Heading stopien={1}>{dane.title}</Heading>
            <div className={style.podtytul}>
              {czyPodtytul !== "" && <p>{czyPodtytul}</p>}
              <span ref={statusRef} className={style.status} role="status" tabIndex={-1}>
                {ukonczona && (
                  <span className={style.znacznik}>
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    Ukończona
                  </span>
                )}
              </span>
            </div>
          </div>
          <div ref={dokRef} className={style.dok}>
            <div className={style.akcje}>
              <span className={style.przycisk} data-nieczynny={przycisk.czynny ? undefined : "true"}>
                <Button
                  poziom="primary"
                  aria-disabled={przycisk.czynny ? undefined : true}
                  aria-describedby={bladUkonczenia === null ? idPowodu : `${idPowodu} ${idBleduUkonczenia}`}
                  onClick={nacisnietoPrzycisk}
                >
                  {!przycisk.czynny && <Icon nazwa="lock" rozmiar={16} />}
                  {wysylanie ? "Zapisywanie…" : przycisk.etykieta}
                </Button>
              </span>
              <p id={idPowodu} className={style.powod} aria-live="polite">
                {przycisk.zdanie}
              </p>
              <ErrorText id={idBleduUkonczenia}>{bladUkonczenia ?? undefined}</ErrorText>
            </div>
          </div>
        </header>

        {kontekst?.temat && (
          <div className={style.postep}>
            <div className={style.odcinki} aria-hidden="true">
              {kontekst.temat.segmenty.map((segment) => (
                <i key={segment.id} data-stan={segment.ukonczona ? "gotowy" : segment.biezaca ? "biezacy" : "pusty"} />
              ))}
            </div>
            <p>{zdaniePostepuTematu(kontekst.temat, ukonczona)}</p>
          </div>
        )}

        {nagranie !== "brak" && (
          <section className={style.nagranie} aria-labelledby="naglowek-nagrania">
            <h2 id="naglowek-nagrania" className={style.dlaCzytnika}>
              Nagranie
            </h2>
            {nagranie === "jest" && (
              <>
                {stan.zrodlo !== undefined && (
                  <OdtwarzaczNagrania
                    key={`${id}-${pozycjaStartowaLekcji}`}
                    tytul={dane.title}
                    zrodlo={stan.zrodlo}
                    czasTrwaniaSekund={dane.duration_seconds}
                    pozycjaStartowaSekundy={pozycjaStartowaLekcji}
                    odswiezLink={odswiezLink}
                    onPostep={naPostep}
                    onZmianaOdtwarzania={naZmianeOdtwarzania}
                    onZmianaPozycji={naZmianePozycji}
                    onBlad={naBladOdtwarzacza}
                  />
                )}
                <p className={style.obejrzane}>
                  {zdanieObejrzane({ ukonczona, mozna: dane.completable, aktywneSekundy: dane.active_seconds, wymagane })}
                </p>
                {bladZapisu && (
                  <p className={style.obejrzane} role="status">
                    {`Brak internetu. Ostatnio zapisane: ${obejrzaneMinuty} z ${potrzebne} minut.`}
                  </p>
                )}
              </>
            )}
            {nagranie === "w-przygotowaniu" && (
              <div className={style.oczekiwanie}>
                <p>
                  <b>Nagranie jest w przygotowaniu.</b>
                  Zwykle trwa to do 30 minut. Tekst i materiały możesz czytać już teraz.
                </p>
              </div>
            )}
            {nagranie === "nie-dziala" && (
              <div className={style.oczekiwanie} data-blad="true">
                <div>
                  <p>
                    <b>Tego nagrania nie da się teraz obejrzeć.</b>
                    Tekst i materiały możesz czytać już teraz. Jeśli to potrwa, napisz do prowadzącego.
                  </p>
                  <Button poziom="outline" onClick={napiszDoProwadzacego}>
                    Napisz do prowadzącego
                  </Button>
                </div>
              </div>
            )}
          </section>
        )}

        {maTresc && (
          <section className={style.karta} aria-labelledby="naglowek-tresci">
            <Heading stopien={2} id="naglowek-tresci">
              Treść lekcji
            </Heading>
            {maTekst(dane.description) && (
              <div className={style.opis}>
                <Text>{dane.description ?? ""}</Text>
              </div>
            )}
            {maTekst(dane.content) && (
              <div className={style.tresc}>
                <TrescLekcji tresc={dane.content} />
              </div>
            )}
          </section>
        )}

        {pusta && (
          <EmptyState
            naglowek="Lekcja bez treści"
            tresc="Ta lekcja nie ma jeszcze nagrania ani treści."
            przycisk={{ etykieta: "Wróć do kursu", onClick: wracaj }}
          />
        )}

        {pliki !== null && pliki.length > 0 && <MaterialyLekcji pliki={pliki} odswiez={odswiezPliki} />}

        <PytaniaLekcji
          idLekcji={id}
          adresat={adresat}
          naOdmoweKolejnosci={naOdmoweKolejnosci}
          podglad={podglad}
          zapisWstrzymany={zapisZablokowany}
        />
      </div>
    </KorzenSzablonu>
  );
}
