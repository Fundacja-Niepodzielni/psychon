"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Pagination } from "@/design-system/molekuly/Pagination/Pagination";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { FormSection } from "@/design-system/organizmy/FormSection/FormSection";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { RecordList } from "@/design-system/organizmy/RecordList/RecordList";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";
import {
  LIMIT_ODPOWIEDZI,
  pobierzPytaniaBezOdpowiedzi,
  wyslijOdpowiedz,
  type PytanieSkrzynki,
  type StronaPytan,
} from "./dane";
import {
  bladPolaOdpowiedzi,
  liczbaBezOdpowiedzi,
  opisLicznika,
  opisPytania,
  rodzajBledu,
  stronaDoWczytania,
  wierszePytan,
  zdejmijPytanie,
} from "./logika";
import style from "./SkrzynkaPytan.module.css";

type StanListy =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "blad" }
  | { rodzaj: "dane"; strona: StronaPytan; numer: number };

interface OstrzezenieListy {
  tytul: string;
  tresc: string;
}

interface WlasciwosciSzablonu {
  lista: ReactNode;
  stronicowanie?: ReactNode;
  /** Liczba pytań bez odpowiedzi; pomijana, gdy nie ma danych. */
  liczba?: number;
  komunikat: string | null;
  onZamknijKomunikat: () => void;
  onPowrot: () => void;
}

/** Każdy stan ekranu renderuje się w tym samym szablonie — jedyny `main`. */
function Szablon({ lista, stronicowanie, liczba, komunikat, onZamknijKomunikat, onPowrot }: WlasciwosciSzablonu) {
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

/**
 * Ekran „Skrzynka pytań” (prowadzący) na szablonie `ListTemplate`. Lista pytań
 * bez odpowiedzi z własnych kursów — `GET /instructor/questions?answered=false`
 * (`backend/routes/api/h17.php:37`); odpowiedź — `POST
 * /instructor/questions/{id}/answer` (`h17.php:38`).
 *
 * „Odpowiedz” w wierszu otwiera w treści `FormSection` przy samym pytaniu
 * (treść pytania jako zwykły tekst nad polem), z jednym rzędem przycisków —
 * bez okna. Po wysłaniu pytanie znika z listy, licznik maleje od razu, a
 * `Toast` potwierdza wysyłkę. Stany: ładowanie, dane, pusty, 422 z polem,
 * odmowa z powodu roli (401/403), 404 i 403 `entry_locked` przy odpowiedzi,
 * błąd połączenia — każdy w tym samym szablonie, z jednym `main`.
 */
export function SkrzynkaPytan() {
  const router = useRouter();
  const wroc = () => router.back();
  const [stan, setStan] = useState<StanListy>({ rodzaj: "ladowanie" });
  const [zadanie, setZadanie] = useState({ strona: 1, proba: 0 });

  const [otwarte, setOtwarte] = useState<PytanieSkrzynki | null>(null);
  const [tekst, setTekst] = useState("");
  const [bladPola, setBladPola] = useState<string | undefined>(undefined);
  const [bladWysylki, setBladWysylki] = useState<string | null>(null);
  const [ostrzezenie, setOstrzezenie] = useState<OstrzezenieListy | null>(null);
  const [komunikat, setKomunikat] = useState<string | null>(null);
  const wysylanie = useRef(false);

  useEffect(() => {
    let aktualne = true;
    pobierzPytaniaBezOdpowiedzi(zadanie.strona)
      .then((strona) => {
        if (aktualne) setStan({ rodzaj: "dane", strona, numer: zadanie.strona });
      })
      .catch((blad: unknown) => {
        if (!aktualne) return;
        setStan({ rodzaj: rodzajBledu(blad) === "brak-uprawnien" ? "brak-uprawnien" : "blad" });
      });
    return () => {
      aktualne = false;
    };
  }, [zadanie]);

  function wczytaj(strona: number) {
    setStan({ rodzaj: "ladowanie" });
    setZadanie((poprzednie) => ({ strona, proba: poprzednie.proba + 1 }));
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

  async function wyslij() {
    if (otwarte === null || wysylanie.current) return;
    wysylanie.current = true;
    setBladPola(undefined);
    setBladWysylki(null);
    const pytanie = otwarte;
    try {
      await wyslijOdpowiedz(pytanie.id, tekst);
      zamknij();
      setKomunikat("Odpowiedź wysłana.");
      if (stan.rodzaj === "dane") {
        const pozostale = zdejmijPytanie(stan.strona, pytanie.id);
        const doWczytania = stronaDoWczytania(pozostale, stan.numer);
        if (doWczytania === null) setStan({ rodzaj: "dane", strona: pozostale, numer: stan.numer });
        else wczytaj(doWczytania);
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
        wczytaj(stan.rodzaj === "dane" ? stan.numer : 1);
      } else if (rodzaj === "pola") {
        const bladOdpowiedzi = bladPolaOdpowiedzi(blad);
        if (bladOdpowiedzi !== undefined) setBladPola(bladOdpowiedzi);
        else setBladWysylki(tresc);
      } else {
        setBladWysylki("Nie udało się wysłać odpowiedzi. Spróbuj ponownie.");
      }
    } finally {
      wysylanie.current = false;
    }
  }

  const zamknijKomunikat = useCallback(() => setKomunikat(null), []);

  if (stan.rodzaj === "ladowanie") {
    return (
      <Szablon
        komunikat={komunikat}
        onZamknijKomunikat={zamknijKomunikat}
        onPowrot={wroc}
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
        komunikat={komunikat}
        onZamknijKomunikat={zamknijKomunikat}
        onPowrot={wroc}
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
        komunikat={komunikat}
        onZamknijKomunikat={zamknijKomunikat}
        onPowrot={wroc}
        lista={
          <Notice
            wariant="error"
            tytul="Nie udało się wczytać pytań"
            akcja={
              <Button poziom="outline" onClick={() => wczytaj(zadanie.strona)}>
                Spróbuj ponownie
              </Button>
            }
          >
            Serwer nie odpowiedział albo zwrócił błąd. Pytania nie są pokazywane bez danych.
          </Notice>
        }
      />
    );
  }

  const liczba = liczbaBezOdpowiedzi(stan.strona);

  if (otwarte !== null) {
    return (
      <Szablon
        komunikat={komunikat}
        onZamknijKomunikat={zamknijKomunikat}
        onPowrot={wroc}
        liczba={liczba}
        lista={
          <div className={style.odpowiedz}>
            <div className={style.pytanie}>
              <Hint>{opisPytania(otwarte)}</Hint>
              <div className={style.trescPytania}>
                <Text>{otwarte.question}</Text>
              </div>
            </div>
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

  return (
    <Szablon
      komunikat={komunikat}
      onZamknijKomunikat={zamknijKomunikat}
      onPowrot={wroc}
      liczba={liczba}
      lista={
        <>
          {ostrzezenie !== null && (
            <Notice wariant="error" tytul={ostrzezenie.tytul}>
              {ostrzezenie.tresc}
            </Notice>
          )}
          <RecordList
            tytul="Pytania bez odpowiedzi"
            wiersze={wierszePytan(stan.strona.data, otworz)}
            pusty={{
              naglowek: "Brak pytań bez odpowiedzi",
              tresc: "Nowe pytania uczestników z Twoich kursów pojawią się tutaj.",
              przycisk: { etykieta: "Wróć do pulpitu", onClick: () => router.push("/prowadzacy") },
            }}
          />
        </>
      }
      stronicowanie={
        stan.strona.meta !== undefined && stan.strona.meta.last_page > 1 ? (
          <Pagination
            strona={stan.numer}
            stron={stan.strona.meta.last_page}
            naPoprzednia={() => wczytaj(stan.numer - 1)}
            naNastepna={() => wczytaj(stan.numer + 1)}
          />
        ) : undefined
      }
    />
  );
}
