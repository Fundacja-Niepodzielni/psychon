"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { AdminCourse } from "@/lib/h08/types";
import { Button } from "@/design-system/atomy/Button/Button";
import { Checkbox } from "@/design-system/atomy/Checkbox/Checkbox";
import { ErrorText } from "@/design-system/atomy/ErrorText/ErrorText";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { EmptyState, zdanieOdmowyRoli } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { SearchBox } from "@/design-system/molekuly/SearchBox/SearchBox";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { FormSection } from "@/design-system/organizmy/FormSection/FormSection";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { FormTemplate } from "@/design-system/szablony/FormTemplate/FormTemplate";
import {
  etykietaTypuKursu,
  identyfikatorKursu,
  klasyfikujBlad,
  komunikatyWyboru,
  kursPozaKolejnoscia,
  nazwaOsoby,
  pobierzKurs,
  szukajOsob,
  wyslijZaproszenia,
  zdanieOZaproszonych,
  type BladZaproszen,
  type WynikWyszukiwaniaOsob,
  type ZaproszonaOsoba,
} from "./dane";
import style from "./ZaproszeniaKursu.module.css";

/** Opóźnienie wyszukiwania po ostatnim znaku — jedno zapytanie na krótką serię wpisów. */
const OPOZNIENIE_SZUKANIA_MS = 300;

type StanKursu =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "blad" }
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "nie-znaleziono" }
  | { rodzaj: "gotowy"; kurs: AdminCourse };

type StanOsob =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "blad" }
  | { rodzaj: "gotowy"; wynik: WynikWyszukiwaniaOsob };

interface WlasciwosciZaproszeniaKursu {
  idKursu: string;
}

/**
 * Ekran „Zaproszenia na kurs” na szablonie `FormTemplate`: nagłówek z nazwą
 * kursu, wybór osób (wyszukiwarka + pola wyboru), jedna sekcja formularza z
 * jednym rzędem przycisków („Wróć do listy” + główna akcja „Wyślij
 * zaproszenia”) i lista osób zaproszonych w tej wizycie. Każdy stan — ładowanie,
 * odmowa z powodu roli, brak kursu, błąd sieci, kurs z miejscem w kolejności
 * programu (bez formularza), formularz — renderuje się WEWNĄTRZ szablonu, więc
 * jego korzeń jest jedynym `main`.
 */
export function ZaproszeniaKursu({ idKursu }: WlasciwosciZaproszeniaKursu) {
  const router = useRouter();
  const wroc = useCallback(() => router.back(), [router]);
  const idLiczbowe = identyfikatorKursu(idKursu);

  const [kurs, setKurs] = useState<StanKursu>(
    idLiczbowe === null ? { rodzaj: "nie-znaleziono" } : { rodzaj: "ladowanie" },
  );

  const wczytajKurs = useCallback(
    (straz?: { anulowane: boolean }) => {
      if (idLiczbowe === null) return Promise.resolve();
      return pobierzKurs(idLiczbowe)
        .then((pobrany) => {
          if (!straz?.anulowane) setKurs({ rodzaj: "gotowy", kurs: pobrany });
        })
        .catch((wyjatek: unknown) => {
          if (straz?.anulowane) return;
          const klasa = klasyfikujBlad(wyjatek);
          setKurs({
            rodzaj:
              klasa.rodzaj === "brak-uprawnien"
                ? "brak-uprawnien"
                : klasa.rodzaj === "nie-znaleziono"
                  ? "nie-znaleziono"
                  : "blad",
          });
        });
    },
    [idLiczbowe],
  );

  useEffect(() => {
    const straz = { anulowane: false };
    void wczytajKurs(straz);
    return () => {
      straz.anulowane = true;
    };
  }, [wczytajKurs]);

  const naglowek = (
    <PageHeader
      okruszki={[
        { etykieta: "Kursy" },
        { etykieta: kurs.rodzaj === "gotowy" ? kurs.kurs.title : "Kurs" },
        { etykieta: "Zaproszenia" },
      ]}
      tytul="Zaproszenia na kurs"
      opis={
        kurs.rodzaj === "gotowy"
          ? `${kurs.kurs.title} · ${etykietaTypuKursu(kurs.kurs.type)}`
          : "Zaproś osoby spoza kolejności kursów programu."
      }
      onPowrot={wroc}
    />
  );

  if (kurs.rodzaj === "ladowanie") {
    return <FormTemplate naglowek={naglowek} tresc={<Skeleton wiersze={5} />} />;
  }

  if (kurs.rodzaj === "brak-uprawnien") {
    return (
      <FormTemplate
        naglowek={naglowek}
        tresc={
          <EmptyState
            wariant="brak-uprawnien"
            naglowek="Zaproszenia na kurs"
            rola="administracji"
            przycisk={{ etykieta: "Wróć", onClick: wroc }}
          />
        }
      />
    );
  }

  if (kurs.rodzaj === "nie-znaleziono") {
    return (
      <FormTemplate
        naglowek={naglowek}
        tresc={
          <EmptyState
            naglowek="Nie znaleziono kursu"
            tresc="Kurs o tym adresie nie istnieje albo został usunięty. Wróć do listy kursów i wybierz inny."
            przycisk={{ etykieta: "Wróć do listy", onClick: wroc }}
          />
        }
      />
    );
  }

  if (kurs.rodzaj === "blad") {
    return (
      <FormTemplate
        naglowek={naglowek}
        powiadomienie={
          <Notice
            wariant="error"
            tytul="Nie udało się wczytać kursu"
            akcja={
              <Button
                poziom="outline"
                onClick={() => {
                  setKurs({ rodzaj: "ladowanie" });
                  void wczytajKurs();
                }}
              >
                Spróbuj ponownie
              </Button>
            }
          >
            Serwer nie odpowiedział albo zwrócił błąd. Bez danych kursu nie można wysłać zaproszeń.
          </Notice>
        }
        tresc={null}
      />
    );
  }

  if (!kursPozaKolejnoscia(kurs.kurs)) {
    return (
      <FormTemplate
        naglowek={naglowek}
        powiadomienie={
          <Notice wariant="info" tytul="Ten kurs ma miejsce w kolejności programu">
            {`Kurs odblokowuje się kolejnymi krokami programu (numer w kolejności: ${kurs.kurs.sequence_order}), więc zaproszenie niczego by nie odblokowało. Zaproszenia dotyczą kursów poza kolejnością programu, na przykład spotkań na żywo w internecie.`}
          </Notice>
        }
        tresc={null}
      />
    );
  }

  return <FormularzZaproszen kurs={kurs.kurs} naglowek={naglowek} wroc={wroc} />;
}

interface WlasciwosciFormularza {
  kurs: AdminCourse;
  naglowek: ReactNode;
  wroc: () => void;
}

function FormularzZaproszen({ kurs, naglowek, wroc }: WlasciwosciFormularza) {
  return (
    <RdzenZaproszen
      kurs={kurs}
      etykietaAnuluj="Wróć do listy"
      onAnuluj={wroc}
      uloz={({ odmowa, powiadomienie, tresc }) =>
        odmowa ? (
          <FormTemplate
            naglowek={naglowek}
            tresc={
              <EmptyState
                wariant="brak-uprawnien"
                naglowek="Zaproszenia na kurs"
                rola="administracji"
                przycisk={{ etykieta: "Wróć", onClick: wroc }}
              />
            }
          />
        ) : (
          <FormTemplate naglowek={naglowek} powiadomienie={powiadomienie} tresc={tresc} />
        )
      }
    />
  );
}

interface WlasciwosciSekcjiZaproszen {
  kurs: AdminCourse;
  /** Zamknięcie sekcji — przycisk drugorzędny w rzędzie z „Wyślij zaproszenia”. */
  onZamknij: () => void;
}

/**
 * Zaproszenia jako sekcja większego ekranu (ekran kursu administracji): ten
 * sam rdzeń co ekran „Zaproszenia na kurs” — wyszukiwarka, wybór osób, jedno
 * wysłanie `POST /admin/courses/{course}/invite` — bez własnego szablonu
 * i nagłówka strony. Kurs z miejscem w kolejności programu nie przyjmuje
 * zaproszeń, więc sekcja mówi to jednym zdaniem zamiast formularza.
 */
export function SekcjaZaproszenKursu({ kurs, onZamknij }: WlasciwosciSekcjiZaproszen) {
  if (!kursPozaKolejnoscia(kurs)) {
    return (
      <Notice wariant="info" tytul="Ten kurs ma miejsce w kolejności programu">
        {`Kurs odblokowuje się kolejnymi krokami programu (numer w kolejności: ${kurs.sequence_order}), więc zaproszenie niczego by nie odblokowało. Zaproszenia dotyczą kursów poza kolejnością programu, na przykład spotkań na żywo w internecie.`}
      </Notice>
    );
  }
  return (
    <RdzenZaproszen
      kurs={kurs}
      etykietaAnuluj="Zamknij"
      onAnuluj={onZamknij}
      uloz={({ odmowa, powiadomienie, tresc }) =>
        odmowa ? (
          <Notice wariant="warn" tytul="Zaproszenia na kurs">
            {zdanieOdmowyRoli("administracji")}
          </Notice>
        ) : (
          <>
            {powiadomienie}
            {tresc}
          </>
        )
      }
    />
  );
}

interface CzesciZaproszen {
  /** Serwer odmówił z powodu roli — zamiast formularza ekran pokazuje odmowę. */
  odmowa: boolean;
  powiadomienie: ReactNode;
  tresc: ReactNode;
}

interface WlasciwosciRdzenia {
  kurs: AdminCourse;
  etykietaAnuluj: string;
  onAnuluj: () => void;
  /** Układ części: ekran wkłada je w szablon strony, sekcja — wprost w treść. */
  uloz: (czesci: CzesciZaproszen) => ReactNode;
}

function RdzenZaproszen({ kurs, etykietaAnuluj, onAnuluj, uloz }: WlasciwosciRdzenia) {
  const [fraza, setFraza] = useState("");
  const [osoby, setOsoby] = useState<StanOsob>({ rodzaj: "ladowanie" });
  const [odmowa, setOdmowa] = useState(false);
  const [ponowienie, setPonowienie] = useState(0);
  const [zaznaczone, setZaznaczone] = useState<Record<number, ZaproszonaOsoba>>({});
  const [zaproszeni, setZaproszeni] = useState<ZaproszonaOsoba[]>([]);
  const [wysyla, setWysyla] = useState(false);
  const [blad, setBlad] = useState<BladZaproszen | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const straz = { anulowane: false };
    const opoznienie = fraza.trim() === "" ? 0 : OPOZNIENIE_SZUKANIA_MS;
    const czasomierz = setTimeout(() => {
      szukajOsob(fraza)
        .then((wynik) => {
          if (!straz.anulowane) setOsoby({ rodzaj: "gotowy", wynik });
        })
        .catch((wyjatek: unknown) => {
          if (straz.anulowane) return;
          if (klasyfikujBlad(wyjatek).rodzaj === "brak-uprawnien") setOdmowa(true);
          else setOsoby({ rodzaj: "blad" });
        });
    }, opoznienie);
    return () => {
      straz.anulowane = true;
      clearTimeout(czasomierz);
    };
  }, [fraza, ponowienie]);

  async function wyslij() {
    if (wysyla) return;
    const wybrane = Object.values(zaznaczone);
    setBlad(null);
    if (wybrane.length === 0) {
      setBlad({ rodzaj: "walidacja", pola: { user_ids: ["Wskaż co najmniej jedną osobę."] } });
      return;
    }
    setWysyla(true);
    setToast(null);
    try {
      const liczba = await wyslijZaproszenia(
        kurs.id,
        wybrane.map((osoba) => osoba.id),
      );
      setZaproszeni((dotychczasowi) => [
        ...dotychczasowi,
        ...wybrane.filter((osoba) => !dotychczasowi.some((zaproszona) => zaproszona.id === osoba.id)),
      ]);
      setZaznaczone({});
      setToast(zdanieOZaproszonych(liczba));
    } catch (wyjatek) {
      const klasa = klasyfikujBlad(wyjatek);
      if (klasa.rodzaj === "brak-uprawnien") setOdmowa(true);
      else setBlad(klasa);
    } finally {
      setWysyla(false);
    }
  }

  function przelacz(osoba: ZaproszonaOsoba, zaznaczona: boolean) {
    setBlad(null);
    setZaznaczone((dotychczasowe) => {
      const nastepne = { ...dotychczasowe };
      if (zaznaczona) nastepne[osoba.id] = osoba;
      else delete nastepne[osoba.id];
      return nastepne;
    });
  }

  if (odmowa) return uloz({ odmowa: true, powiadomienie: null, tresc: null });

  const komunikatyBledu = komunikatyWyboru(blad);
  const liczbaZaznaczonych = Object.keys(zaznaczone).length;

  let powiadomienie = null;
  if (blad?.rodzaj === "warunki") {
    powiadomienie = (
      <Notice wariant="error" tytul="Nie można zaprosić na ten kurs">
        {blad.komunikat}
      </Notice>
    );
  } else if (blad?.rodzaj === "nie-znaleziono") {
    powiadomienie = (
      <Notice wariant="error" tytul="Nie znaleziono kursu">
        {blad.komunikat}
      </Notice>
    );
  } else if (blad?.rodzaj === "blad") {
    powiadomienie = (
      <Notice
        wariant="error"
        tytul="Nie udało się wysłać zaproszeń"
        akcja={
          <Button poziom="outline" onClick={() => void wyslij()}>
            Spróbuj ponownie
          </Button>
        }
      >
        Serwer nie odpowiedział albo zwrócił błąd. Zaznaczone osoby zostają zaznaczone.
      </Notice>
    );
  }

  return uloz({
    odmowa: false,
    powiadomienie,
    tresc: (
        <>
          <section className={style.sekcja} aria-label="Wybór osób">
            <Heading stopien={2}>Kogo zapraszasz</Heading>
            <Text>
              Zaproszone osoby dostaną powiadomienie w panelu i e-mail. Zaproszenie nie nadaje dostępu do kursu.
            </Text>
            <SearchBox
              id="zaproszenia-szukaj"
              etykieta="Szukaj osoby"
              wartosc={fraza}
              onZmiana={setFraza}
              placeholder="Imię, nazwisko albo adres e-mail"
            />
            {osoby.rodzaj === "ladowanie" && <Skeleton wiersze={4} />}
            {osoby.rodzaj === "blad" && (
              <Notice
                wariant="error"
                tytul="Nie udało się wczytać listy osób"
                akcja={
                  <Button
                    poziom="outline"
                    onClick={() => {
                      setOsoby({ rodzaj: "ladowanie" });
                      setPonowienie((numer) => numer + 1);
                    }}
                  >
                    Spróbuj ponownie
                  </Button>
                }
              >
                Serwer nie odpowiedział albo zwrócił błąd.
              </Notice>
            )}
            {osoby.rodzaj === "gotowy" && osoby.wynik.osoby.length === 0 && (
              <Text wariant="pusty">Brak osób spełniających filtr</Text>
            )}
            {osoby.rodzaj === "gotowy" && osoby.wynik.osoby.length > 0 && (
              <fieldset className={style.wybor}>
                <legend className={style.legenda}>Osoby do zaproszenia</legend>
                {osoby.wynik.osoby.map((osoba) => (
                  <Checkbox
                    key={osoba.id}
                    id={`zaproszenia-osoba-${osoba.id}`}
                    zaznaczony={zaznaczone[osoba.id] !== undefined}
                    onZmiana={(zaznaczona) => przelacz(osoba, zaznaczona)}
                    etykieta={`${nazwaOsoby(osoba)} · ${osoba.email}`}
                  />
                ))}
              </fieldset>
            )}
            {osoby.rodzaj === "gotowy" && osoby.wynik.lacznie > osoby.wynik.osoby.length && (
              <Hint>
                {`Pokazano ${osoby.wynik.osoby.length} z ${osoby.wynik.lacznie} osób. Zawęź wyszukiwanie, żeby zobaczyć pozostałe.`}
              </Hint>
            )}
            <Hint>{`Zaznaczono: ${liczbaZaznaczonych}`}</Hint>
            {komunikatyBledu.length > 0 && <ErrorText id="zaproszenia-wybor-blad">{komunikatyBledu.join(" ")}</ErrorText>}
          </section>

          <FormSection
            tytul="Zaproszenie na kurs"
            pola={[]}
            etykietaAnuluj={etykietaAnuluj}
            etykietaZapisz={wysyla ? "Wysyłanie…" : "Wyślij zaproszenia"}
            onAnuluj={onAnuluj}
            onZapisz={() => void wyslij()}
          />

          <section className={style.sekcja} aria-label="Zaproszone osoby">
            <Heading stopien={2}>Zaproszone osoby</Heading>
            {zaproszeni.length === 0 ? (
              <Text wariant="pusty">Nikt nie jest jeszcze zaproszony</Text>
            ) : (
              <ul className={style.zaproszeni}>
                {zaproszeni.map((osoba) => (
                  <li key={osoba.id}>
                    <Text>{nazwaOsoby(osoba)}</Text>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {toast !== null && <Toast komunikat={toast} onZamknij={() => setToast(null)} />}
        </>
    ),
  });
}
