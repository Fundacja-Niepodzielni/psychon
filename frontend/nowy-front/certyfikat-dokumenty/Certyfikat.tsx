"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Text } from "@/design-system/atomy/Text/Text";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { RecordList, type WierszBezAkcjiRecordList, type WierszRecordList } from "@/design-system/organizmy/RecordList/RecordList";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";
import { ApiError } from "@/lib/api/klient";
import { rodzajBledu } from "../pulpit/rodzaj-bledu";
import {
  pobierzCertyfikat,
  pobierzWarunki,
  zapiszPlik,
  zlecCertyfikat,
  type WarunkiCertyfikatu,
} from "./dane";
import { EkranStanu, type StanBezDanych } from "./EkranStanu";
import { Komunikat } from "./Komunikat";
import { pozycjeListyBrakow, zdanieOPostepie, zdanieOZaliczonychTestach } from "./logika";
import style from "./CertyfikatDokumenty.module.css";

const TYTUL = "Certyfikat";

type StanEkranu = StanBezDanych | "ok";

/** Gdzie jest wydanie: nic nie zlecono · trwa zlecanie · zlecono, można pobierać · trwa pobieranie. */
type Wydanie = "brak" | "zlecanie" | "zlecono" | "pobieranie";

/** Błąd akcji nad listą: tytuł, zdanie i wariant komunikatu. */
interface BladAkcji {
  wariant: "warn" | "error";
  tytul: string;
  tresc: string;
}

const POWOD_NIEDOSTEPNOSCI = "Najpierw spełnij wszystkie warunki z listy poniżej.";

/**
 * Ekran „Certyfikat” uczestnika na szablonie listy: nagłówek z jedynym zielonym przyciskiem,
 * a pod nim lista czterech warunków ukończenia programu i liczba zaliczonych testów.
 *
 * Te same żądania i ten sam przebieg co stara strona `/panel/certyfikat`
 * (`POMIAR-STAREGO-EKRANU.md`): odczyt warunków → „Wygeneruj certyfikat” (zlecenie) →
 * „Pobierz certyfikat” (pobranie z tokenem). Serwer nie mówi, czy certyfikat już wydano ani kiedy,
 * więc ekran niczego takiego nie pokazuje: przycisk pobrania pojawia się po zleceniu w tej sesji.
 */
export function Certyfikat() {
  const router = useRouter();
  const [stan, setStan] = useState<StanEkranu>("ladowanie");
  const [warunki, setWarunki] = useState<WarunkiCertyfikatu | null>(null);
  const [wydanie, setWydanie] = useState<Wydanie>("brak");
  const [blad, setBlad] = useState<BladAkcji | null>(null);
  const idListy = useId();
  const wTrakcie = useRef(false);

  const wczytaj = useCallback((straz?: { anulowane: boolean }) => {
    return pobierzWarunki().then(
      (dane) => {
        if (straz?.anulowane) return;
        setWarunki(dane);
        setStan("ok");
      },
      (wyjatek: unknown) => {
        if (straz?.anulowane) return;
        setStan(rodzajBledu(wyjatek));
      },
    );
  }, []);

  const ponow = useCallback(() => {
    setStan("ladowanie");
    void wczytaj();
  }, [wczytaj]);

  useEffect(() => {
    const straz = { anulowane: false };
    void wczytaj(straz);
    return () => {
      straz.anulowane = true;
    };
  }, [wczytaj]);

  async function zlec() {
    if (wTrakcie.current) return;
    wTrakcie.current = true;
    setBlad(null);
    setWydanie("zlecanie");
    try {
      await zlecCertyfikat();
      setWydanie("zlecono");
    } catch (wyjatek) {
      setWydanie("brak");
      if (wyjatek instanceof ApiError && wyjatek.code === "conditions_not_met") {
        setBlad({
          wariant: "error",
          tytul: "Nie udało się zlecić certyfikatu",
          tresc: "Nie wszystkie warunki są spełnione — odśwież listę poniżej.",
        });
        void wczytaj();
      } else {
        setBlad({
          wariant: "error",
          tytul: "Nie udało się zlecić certyfikatu",
          tresc: wyjatek instanceof ApiError ? wyjatek.message : "Nie udało się rozpocząć generowania. Spróbuj ponownie.",
        });
      }
    } finally {
      wTrakcie.current = false;
    }
  }

  async function pobierz() {
    if (wTrakcie.current) return;
    wTrakcie.current = true;
    setBlad(null);
    setWydanie("pobieranie");
    try {
      const wynik = await pobierzCertyfikat();
      if (wynik.rodzaj === "jeszcze-nie") {
        setBlad({
          wariant: "warn",
          tytul: "Plik jeszcze się generuje",
          tresc: "Certyfikat jeszcze się generuje. Spróbuj ponownie za chwilę.",
        });
      } else {
        zapiszPlik(wynik.plik, wynik.nazwa);
      }
    } catch {
      setBlad({
        wariant: "error",
        tytul: "Nie udało się pobrać certyfikatu",
        tresc: "Nie udało się pobrać pliku. Spróbuj ponownie za chwilę.",
      });
    } finally {
      setWydanie("zlecono");
      wTrakcie.current = false;
    }
  }

  if (stan !== "ok" || warunki === null) {
    return (
      <EkranStanu
        stan={stan === "ok" ? "ladowanie" : stan}
        tytul={TYTUL}
        czego="certyfikatu"
        czegoNieZnaleziono="danych certyfikatu"
        rolaDocelowa="osób wolontariackich"
        onPonow={ponow}
      />
    );
  }

  const pozycje = pozycjeListyBrakow(warunki);
  const wiersze: Array<WierszRecordList | WierszBezAkcjiRecordList> = pozycje.map((pozycja) => ({
    id: pozycja.klucz,
    tytul: pozycja.tytul,
    podpowiedz: pozycja.opis,
    plakietka: pozycja.spelniony ? { wariant: "ok", tekst: "Spełniony" } : { wariant: "warn", tekst: "Brakuje" },
    akcja: pozycja.akcja && {
      etykieta: pozycja.akcja.etykieta,
      etykietaDostepna: pozycja.akcja.etykietaDostepna,
      href: pozycja.akcja.href,
    },
  }));
  wiersze.push({
    id: "zaliczone-testy",
    tytul: "Zaliczone testy",
    podpowiedz: zdanieOZaliczonychTestach(warunki.passed_tests_count),
  });

  const naglowek = naglowekEkranu(warunki.eligible, wydanie);
  const przycisk = opisPrzyciskuGlownego(warunki.eligible, wydanie);

  return (
    <ListTemplate
      naglowek={
        <PageHeader
          okruszki={[{ etykieta: TYTUL }]}
          tytul={TYTUL}
          opis={naglowek.opis}
          status={naglowek.status}
          onPowrot={() => router.back()}
          przyciskGlowny={{
            etykieta: przycisk.etykieta,
            niedostepny: przycisk.niedostepny,
            onKliknij: () => {
              if (przycisk.akcja === "zlec") void zlec();
              else if (przycisk.akcja === "pobierz") void pobierz();
              else if (przycisk.akcja === "pokaz-braki") document.getElementById(idListy)?.focus();
            },
          }}
        />
      }
      lista={
        <div className={style.stos}>
          {blad && (
            <Komunikat wariant={blad.wariant} tytul={blad.tytul}>
              {blad.tresc}
            </Komunikat>
          )}
          <div id={idListy} tabIndex={-1} className={`${style.stos} ${style.celFokusu}`}>
            <Text>{zdanieOPostepie(warunki)}</Text>
            <RecordList
              tytul="Warunki ukończenia programu"
              stopienNaglowka={2}
              wiersze={wiersze}
              pusty={{
                naglowek: "Brak warunków do pokazania",
                tresc: "Serwer nie zwrócił listy warunków. Odśwież stronę albo wróć za chwilę.",
                przycisk: { etykieta: "Odśwież", onClick: ponow },
              }}
            />
          </div>
        </div>
      }
    />
  );
}

function naglowekEkranu(
  spelnione: boolean,
  wydanie: Wydanie,
): { opis: string; status: { wariant: "ok" | "pending"; etykieta: string } } {
  if (!spelnione) {
    return {
      opis: "Certyfikat będzie dostępny po spełnieniu wszystkich czterech warunków.",
      status: { wariant: "pending", etykieta: "Jeszcze niedostępny" },
    };
  }
  if (wydanie === "brak") {
    return {
      opis: "Wszystkie warunki są spełnione. Możesz wygenerować certyfikat.",
      status: { wariant: "ok", etykieta: "Warunki spełnione" },
    };
  }
  return {
    opis: "Certyfikat został zlecony do wygenerowania. Plik będzie gotowy za chwilę.",
    status: { wariant: "pending", etykieta: "Zlecony" },
  };
}

type AkcjaPrzycisku = "zlec" | "pobierz" | "pokaz-braki" | "brak";

/**
 * Jedyny zielony przycisk ekranu. Przy niespełnionych warunkach zostaje na ekranie jako
 * niedostępny z powodem (`aria-disabled` i zdanie pod nagłówkiem); jego kliknięcie niczego nie wysyła,
 * tylko przenosi fokus na listę braków. W trakcie zlecania i pobierania zmienia napis i nie robi nic.
 */
function opisPrzyciskuGlownego(
  spelnione: boolean,
  wydanie: Wydanie,
): { etykieta: string; akcja: AkcjaPrzycisku; niedostepny?: { powod: string } } {
  if (!spelnione) {
    return { etykieta: "Wygeneruj certyfikat", akcja: "pokaz-braki", niedostepny: { powod: POWOD_NIEDOSTEPNOSCI } };
  }
  switch (wydanie) {
    case "brak":
      return { etykieta: "Wygeneruj certyfikat", akcja: "zlec" };
    case "zlecanie":
      return { etykieta: "Zlecanie…", akcja: "brak" };
    case "zlecono":
      return { etykieta: "Pobierz certyfikat (PDF)", akcja: "pobierz" };
    case "pobieranie":
      return { etykieta: "Pobieranie…", akcja: "brak" };
  }
}
