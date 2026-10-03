"use client";

import { useZgloszenieNiezapisanychZmian } from "@/design-system/szablony/NiezapisaneZmiany";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Field } from "@/design-system/molekuly/Field/Field";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Pagination } from "@/design-system/molekuly/Pagination/Pagination";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { FormSection } from "@/design-system/organizmy/FormSection/FormSection";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { RecordList } from "@/design-system/organizmy/RecordList/RecordList";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";
import { ZwinieteFiltry } from "@/nowy-front/wspolne/zwiniete-filtry";
import {
  LIMIT_ODPOWIEDZI,
  pobierzPytania,
  wyslijOdpowiedz,
  type PytanieSkrzynki,
  type StronaPytan,
  type WidokPytan,
} from "./dane";
import {
  OPCJE_WIDOKU,
  bladPolaOdpowiedzi,
  formatujDate,
  komunikatKoperty,
  liczbaBezOdpowiedzi,
  opisLicznika,
  opisPytania,
  rodzajBledu,
  stronaDoWczytania,
  tekstPustegoStanu,
  wierszePytan,
  zastapPytanie,
  zdejmijPytanie,
} from "./logika";
import style from "./SkrzynkaPytan.module.css";

type StanListy =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "blad"; komunikat?: string }
  | { rodzaj: "dane"; strona: StronaPytan; numer: number; widok: WidokPytan };

interface OstrzezenieListy {
  tytul: string;
  tresc: string;
}

interface WlasciwosciSzablonu {
  lista: ReactNode;
  filtry?: ReactNode;
  stronicowanie?: ReactNode;
  /** Liczba pytań bez odpowiedzi; pomijana, gdy nie ma danych. */
  liczba?: number;
  komunikat: string | null;
  onZamknijKomunikat: () => void;
  onPowrot: () => void;
}

/** Każdy stan ekranu renderuje się w tym samym szablonie — jedyny `main`. */
function Szablon({ lista, filtry, stronicowanie, liczba, komunikat, onZamknijKomunikat, onPowrot }: WlasciwosciSzablonu) {
  return (
    <ListTemplate
      naglowek={
        <PageHeader
          okruszki={[{ etykieta: "Prowadzący" }, { etykieta: "Skrzynka pytań" }]}
          tytul="Skrzynka pytań"
          opis="Pytania uczestników zadane przy lekcjach Twoich kursów."
          status={
            liczba === undefined ? undefined : { wariant: liczba > 0 ? "pending" : "ok", etykieta: opisLicznika(liczba) }
          }
          onPowrot={onPowrot}
        />
      }
      filtry={filtry}
      lista={
        <>
          {komunikat !== null && <Toast komunikat={komunikat} onZamknij={onZamknijKomunikat} />}
          {lista}
        </>
      }
      stronicowanie={stronicowanie}
    />
  );
}

interface WlasciwosciKontekstuPytania {
  pytanie: PytanieSkrzynki;
}

/** Kto, z jakiego kursu i lekcji, kiedy — i treść pytania jako zwykły tekst. */
function KontekstPytania({ pytanie }: WlasciwosciKontekstuPytania) {
  return (
    <div className={style.pytanie}>
      <Hint>{opisPytania(pytanie)}</Hint>
      <div className={style.trescPytania}>
        <Text>{pytanie.question}</Text>
      </div>
    </div>
  );
}

/**
 * Ekran „Skrzynka pytań” (prowadzący) na szablonie `ListTemplate`. Lista pytań
 * z własnych kursów — `GET /instructor/questions` (`backend/routes/api/h17.php:37`);
 * widok „Tylko nieodpowiedziane” (domyślny, jak na poprzedniej stronie) prosi o
 * `answered=false`, widok „Pokaż wszystkie” nie wysyła filtra
 * (`InstructorQuestionController.php:29-33`). Odpowiedź — `POST
 * /instructor/questions/{id}/answer` (`h17.php:38`).
 *
 * „Odpowiedz” w wierszu otwiera w treści `FormSection` przy samym pytaniu
 * (treść pytania jako zwykły tekst nad polem), z jednym rzędem przycisków —
 * bez okna. Pytanie z odpowiedzią ma w wierszu akcję „Zobacz odpowiedź”:
 * podgląd „Twoja odpowiedź” jako tekst, bez formularza. Po wysłaniu pytanie
 * znika z widoku „Tylko nieodpowiedziane”, a w widoku „Pokaż wszystkie”
 * zostaje z odpowiedzią; licznik maleje od razu, a `Toast` potwierdza
 * wysyłkę. Stany: ładowanie, dane, pusty (osobny dla każdego widoku), 422 z
 * polem, odmowa z powodu roli (401/403), 404 i 403 `entry_locked` przy
 * odpowiedzi, błąd połączenia — każdy w tym samym szablonie, z jednym `main`.
 */
export function SkrzynkaPytan() {
  const router = useRouter();
  const wroc = () => router.back();
  const [stan, setStan] = useState<StanListy>({ rodzaj: "ladowanie" });
  const [zadanie, setZadanie] = useState<{ widok: WidokPytan; strona: number; proba: number }>({
    widok: "bez-odpowiedzi",
    strona: 1,
    proba: 0,
  });

  const [otwarte, setOtwarte] = useState<PytanieSkrzynki | null>(null);
  const [podglad, setPodglad] = useState<PytanieSkrzynki | null>(null);
  const [tekst, setTekst] = useState("");
  const [bladPola, setBladPola] = useState<string | undefined>(undefined);
  const [bladWysylki, setBladWysylki] = useState<string | null>(null);
  const [ostrzezenie, setOstrzezenie] = useState<OstrzezenieListy | null>(null);
  const [komunikat, setKomunikat] = useState<string | null>(null);
  const wysylanie = useRef(false);
  const [wysyla, setWysyla] = useState(false);
  useZgloszenieNiezapisanychZmian(otwarte !== null && tekst.trim() !== "", "Skrzynka pytań");

  useEffect(() => {
    let aktualne = true;
    pobierzPytania(zadanie.widok, zadanie.strona)
      .then((strona) => {
        if (aktualne) setStan({ rodzaj: "dane", strona, numer: zadanie.strona, widok: zadanie.widok });
      })
      .catch((blad: unknown) => {
        if (!aktualne) return;
        setStan(rodzajBledu(blad) === "brak-uprawnien" ? { rodzaj: "brak-uprawnien" } : { rodzaj: "blad", komunikat: komunikatKoperty(blad) });
      });
    return () => {
      aktualne = false;
    };
  }, [zadanie]);

  function wczytaj(widok: WidokPytan, strona: number) {
    setStan({ rodzaj: "ladowanie" });
    setZadanie((poprzednie) => ({ widok, strona, proba: poprzednie.proba + 1 }));
  }

  function otworz(pytanie: PytanieSkrzynki) {
    setOtwarte(pytanie);
    setTekst("");
    setBladPola(undefined);
    setBladWysylki(null);
    setOstrzezenie(null);
  }

  function zamknij() {
    setOtwarte(null);
    setTekst("");
    setBladPola(undefined);
    setBladWysylki(null);
  }

  function pokazOdpowiedz(pytanie: PytanieSkrzynki) {
    setPodglad(pytanie);
    setOstrzezenie(null);
  }

  async function wyslij() {
    if (otwarte === null || wysylanie.current) return;
    wysylanie.current = true;
    setWysyla(true);
    setBladPola(undefined);
    setBladWysylki(null);
    const pytanie = otwarte;
    try {
      const odpowiedziane = await wyslijOdpowiedz(pytanie.id, tekst);
      zamknij();
      setKomunikat("Odpowiedź wysłana.");
      if (stan.rodzaj === "dane") {
        if (stan.widok === "wszystkie") {
          setStan({ ...stan, strona: zastapPytanie(stan.strona, odpowiedziane) });
        } else {
          const pozostale = zdejmijPytanie(stan.strona, pytanie.id);
          const doWczytania = stronaDoWczytania(pozostale, stan.numer);
          if (doWczytania === null) setStan({ ...stan, strona: pozostale });
          else wczytaj(stan.widok, doWczytania);
        }
      }
    } catch (blad) {
      const rodzaj = rodzajBledu(blad);
      const tresc = blad instanceof Error ? blad.message : "";
      if (rodzaj === "brak-uprawnien") {
        zamknij();
        setStan({ rodzaj: "brak-uprawnien" });
      } else if (rodzaj === "nie-znaleziono" || rodzaj === "juz-odpowiedziano") {
        zamknij();
        setOstrzezenie({ tytul: "Nie udało się wysłać odpowiedzi", tresc });
        wczytaj(zadanie.widok, stan.rodzaj === "dane" ? stan.numer : 1);
      } else if (rodzaj === "pola") {
        const bladOdpowiedzi = bladPolaOdpowiedzi(blad);
        if (bladOdpowiedzi !== undefined) setBladPola(bladOdpowiedzi);
        else setBladWysylki(tresc);
      } else {
        setBladWysylki(komunikatKoperty(blad) ?? "Nie udało się wysłać odpowiedzi. Spróbuj ponownie.");
      }
    } finally {
      wysylanie.current = false;
      setWysyla(false);
    }
  }

  const zamknijKomunikat = useCallback(() => setKomunikat(null), []);

  const filtry = (
    <ZwinieteFiltry
      etykieta="Pokaż"
      podsumowanie={OPCJE_WIDOKU.find((opcja) => opcja.wartosc === zadanie.widok)?.etykieta ?? ""}
      liczba={stan.rodzaj === "dane" ? stan.strona.meta?.total : undefined}
    >
      {({ zwin }) => (
        <Field
          id="widok-pytan"
          etykieta="Które pytania pokazać"
          rodzaj="wybor"
          opcje={OPCJE_WIDOKU}
          wartosc={zadanie.widok}
          onZmiana={(wartosc) => {
            zwin();
            wczytaj(wartosc === "wszystkie" ? "wszystkie" : "bez-odpowiedzi", 1);
          }}
        />
      )}
    </ZwinieteFiltry>
  );

  const wspolne = { komunikat, onZamknijKomunikat: zamknijKomunikat, onPowrot: wroc };

  if (stan.rodzaj === "ladowanie") {
    return (
      <Szablon
        {...wspolne}
        filtry={filtry}
        lista={
          <div className={style.szkielet}>
            <Skeleton wiersze={4} />
          </div>
        }
      />
    );
  }

  if (stan.rodzaj === "brak-uprawnien") {
    return (
      <Szablon
        {...wspolne}
        lista={
          <EmptyState
            wariant="brak-uprawnien"
            naglowek="Odpowiedzi na pytania"
            rola="prowadzących"
            przycisk={{ etykieta: "Wróć", onClick: wroc }}
          />
        }
      />
    );
  }

  if (stan.rodzaj === "blad") {
    return (
      <Szablon
        {...wspolne}
        filtry={filtry}
        lista={
          <Notice
            wariant="error"
            tytul="Nie udało się wczytać pytań"
            akcja={
              <Button poziom="outline" onClick={() => wczytaj(zadanie.widok, zadanie.strona)}>
                Spróbuj ponownie
              </Button>
            }
          >
            {stan.komunikat ?? "Serwer nie odpowiedział albo zwrócił błąd. Pytania nie są pokazywane bez danych."}
          </Notice>
        }
      />
    );
  }

  const liczba = liczbaBezOdpowiedzi(stan.strona);

  if (otwarte !== null) {
    return (
      <Szablon
        {...wspolne}
        liczba={liczba}
        lista={
          <div className={style.odpowiedz} aria-busy={wysyla}>
            <KontekstPytania pytanie={otwarte} />
            <div role="status">{wysyla && <Hint>Wysyłanie odpowiedzi…</Hint>}</div>
            {bladWysylki !== null && (
              <Notice
                wariant="error"
                tytul="Nie udało się wysłać odpowiedzi"
                akcja={
                  <Button poziom="outline" onClick={() => void wyslij()}>
                    Spróbuj ponownie
                  </Button>
                }
              >
                {bladWysylki}
              </Notice>
            )}
            <FormSection
              fokusPrzyOtwarciu
              tytul="Odpowiedź na pytanie"
              pola={[
                {
                  id: "odpowiedz-tresc",
                  etykieta: "Odpowiedź",
                  rodzaj: "wieloliniowy",
                  wartosc: tekst,
                  onZmiana: (wartosc) => setTekst(wartosc.slice(0, LIMIT_ODPOWIEDZI)),
                  blad: bladPola,
                  podpowiedz: `${tekst.length}/${LIMIT_ODPOWIEDZI} znaków`,
                  wymagane: true,
                },
              ]}
              etykietaAnuluj="Wróć do listy"
              etykietaZapisz="Wyślij odpowiedź"
              onAnuluj={zamknij}
              onZapisz={() => void wyslij()}
            />
          </div>
        }
      />
    );
  }

  if (podglad !== null) {
    return (
      <Szablon
        {...wspolne}
        liczba={liczba}
        lista={
          <div className={style.odpowiedz}>
            <KontekstPytania pytanie={podglad} />
            <section className={style.podgladOdpowiedzi} aria-label="Twoja odpowiedź">
              <Heading stopien={2}>Twoja odpowiedź</Heading>
              <Hint>{formatujDate(podglad.answered_at)}</Hint>
              <div className={style.trescPytania}>
                <Text>{podglad.answer ?? ""}</Text>
              </div>
            </section>
            <div>
              <Button poziom="outline" onClick={() => setPodglad(null)}>
                Wróć do listy
              </Button>
            </div>
          </div>
        }
      />
    );
  }

  const pusty = tekstPustegoStanu(stan.widok);

  return (
    <Szablon
      {...wspolne}
      liczba={liczba}
      filtry={filtry}
      lista={
        <>
          {ostrzezenie !== null && (
            <Notice wariant="error" tytul={ostrzezenie.tytul}>
              {ostrzezenie.tresc}
            </Notice>
          )}
          <div className={style.lista}>
            <RecordList
              tytul={pusty.tytulListy}
              wiersze={wierszePytan(stan.strona.data, otworz, pokazOdpowiedz)}
              pusty={{
                naglowek: pusty.naglowek,
                tresc: pusty.tresc,
                przycisk: { etykieta: "Wróć do pulpitu", onClick: () => router.push("/prowadzacy") },
              }}
            />
          </div>
        </>
      }
      stronicowanie={
        stan.strona.meta !== undefined && stan.strona.meta.last_page > 1 ? (
          <Pagination
            strona={stan.numer}
            stron={stan.strona.meta.last_page}
            naPoprzednia={() => wczytaj(stan.widok, stan.numer - 1)}
            naNastepna={() => wczytaj(stan.widok, stan.numer + 1)}
          />
        ) : undefined
      }
    />
  );
}
