"use client";

import { useState } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { ErrorText } from "@/design-system/atomy/ErrorText/ErrorText";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Link } from "@/design-system/atomy/Link/Link";
import { Text } from "@/design-system/atomy/Text/Text";
import { FileDropZone } from "@/design-system/molekuly/FileDropZone/FileDropZone";
import { KartaBoczna } from "@/design-system/szablony/UkladEdycji/KartaBoczna";
import { PasekPostepu } from "@/nowy-front/wysylanie-nagrania/PasekPostepu";
import { czasNagrania } from "./formularz";
import {
  formatRozmiaru,
  procentWyslania,
  zdaniePostepu,
  zdaniePrzerwania,
  type StanKartyNagrania,
} from "./nagranie";
import style from "./StronaLekcji.module.css";

/**
 * Co dzieje się z poprzednim nagraniem lekcji, gdy osoba wysyła nowe:
 * - `brak` — lekcja nie miała nagrania, karta o wymianie milczy;
 * - `podmienia-od-razu` — zaplecze odpina poprzednie nagranie w chwili
 *   rozpoczęcia wysyłania (tak działa dziś);
 * - `zachowuje-poprzednie` — uczestnicy oglądają dotychczasowe nagranie, dopóki
 *   nowe nie jest gotowe (serwer podaje stan nagrania w polach).
 */
export type WymianaNagrania = "brak" | "podmienia-od-razu" | "zachowuje-poprzednie";

export interface WlasciwosciKartyNagrania {
  /** Podstawa identyfikatorów pól wyboru pliku. */
  id: string;
  stan: StanKartyNagrania;
  /** Zdanie, kto może wysłać nagranie — gdy rola osoby nie może; `null`, gdy może. */
  powodBrakuWysylania: string | null;
  /** Czy na stronie jest niezapisany tekst lekcji. */
  niezapisanyTekst: boolean;
  wymiana?: WymianaNagrania;
  /**
   * Serwer podaje stan nagrania w polach: stan nagrania w drodze odświeża się
   * sam, a nowe nagranie zastępuje dotychczasowe dopiero po gotowości.
   */
  serwerZnaStan?: boolean;
  /** Odmowa wyboru pliku (np. plik nie jest nagraniem) — pod polem wyboru. */
  bladWyboru?: string | null;
  onWybierzPlik: (pliki: FileList) => void;
  onPrzerwij?: () => void;
  /** Plik wybrany po „Wyślij inny plik od nowa” w stanie przerwanym — wysyłanie od zera. */
  onOdNowa?: (pliki: FileList) => void;
}

const ETAPY = ["Wysyłanie", "Przetwarzanie", "Gotowe"] as const;

function Etapy({ biezacy }: { biezacy: 1 | 2 }) {
  return (
    <ol className={style.etapy} aria-label="Etapy">
      {ETAPY.map((nazwa, indeks) => {
        const numer = indeks + 1;
        const teraz = numer === biezacy;
        return (
          <li key={nazwa} className={teraz ? style.etapBiezacy : style.etap} aria-current={teraz ? "step" : undefined}>
            {numer}. {nazwa}
            {teraz ? " (teraz)" : ""}
          </li>
        );
      })}
    </ol>
  );
}

const ZDANIA_WYMIANY: Record<Exclude<WymianaNagrania, "brak">, string> = {
  "podmienia-od-razu": "Uczestnicy nie widzą już poprzedniego nagrania. Nowe zobaczą, gdy będzie gotowe.",
  "zachowuje-poprzednie":
    "Uczestnicy oglądają dotychczasowe nagranie. Nowe zastąpi je samo, gdy będzie gotowe. Jeśli się nie uda, zostanie dotychczasowe.",
};

const ZDANIE_ODSWIEZANIA = "Stan nagrania odświeża się tutaj sam, dopóki ta karta przeglądarki jest otwarta.";
const ETYKIETA_WYSLANIA_STAD = "Wyślij nagranie stąd";
const PODPOWIEDZ_WYSLANIA_STAD =
  "Jeśli tamto wysyłanie zostało przerwane, wybierz plik tutaj – wysyłanie zacznie się od początku.";

/**
 * Karta „Nagranie” strony lekcji — jeden komponent o jawnych stanach: brak,
 * wysyłanie (stąd albo skądinąd), przerwane, przetwarzanie, gotowe, błąd; do
 * tego wymiana: uczestnicy oglądają dotychczasowe nagranie, a nowe jest w
 * drodze albo skończyło się błędem. Karta nie zna sieci: stan i zdarzenia
 * dostaje z ekranu.
 */
export function KartaNagrania({
  id,
  stan,
  powodBrakuWysylania,
  niezapisanyTekst,
  wymiana = "brak",
  serwerZnaStan = false,
  bladWyboru = null,
  onWybierzPlik,
  onPrzerwij,
  onOdNowa,
}: WlasciwosciKartyNagrania) {
  const mozeWysylac = powodBrakuWysylania === null;
  // Stan przerwany: osoba zamiast dokończenia wybrała wysłanie innego pliku od zera.
  const [odNowa, setOdNowa] = useState(false);
  const wybieraOdNowa = odNowa && stan.rodzaj === "przerwane" && onOdNowa !== undefined;

  function wybor(etykieta: string, podpowiedz: string, naWybor: (pliki: FileList) => void = onWybierzPlik) {
    if (!mozeWysylac) return <Hint>{powodBrakuWysylania}</Hint>;
    return (
      <>
        <FileDropZone id={`${id}-plik`} etykieta={etykieta} podpowiedz={podpowiedz} pliki={[]} onWybierzPliki={naWybor} />
        {bladWyboru && <ErrorText id={`${id}-blad-wyboru`}>{bladWyboru}</ErrorText>}
      </>
    );
  }

  const zdanieWymiany = wymiana === "brak" ? null : <Text>{ZDANIA_WYMIANY[wymiana]}</Text>;
  let tresc;

  if (stan.rodzaj === "wysylanie") {
    const procent = procentWyslania(stan.wyslano, stan.rozmiar);
    tresc = (
      <>
        <p className={style.plikNagrania}>
          <strong>{stan.nazwa}</strong> <span className={style.drobne}>· {formatRozmiaru(stan.rozmiar)}</span>
        </p>
        <Etapy biezacy={1} />
        <Hint>Gdy wysyłanie dojdzie do 100 %, możesz wszystko zamknąć. Przetwarzanie trwa zwykle 10–30 minut.</Hint>
        <div className={style.postep}>
          <PasekPostepu procent={procent} nazwa="Wysyłanie nagrania" rozmiar="duzy" />
          <p className={style.procent}>{zdaniePostepu(procent, stan.zostaloSekund)}</p>
        </div>
        <Text>Możesz przejść do kursu i innych lekcji – wysyłanie trwa dalej, a postęp widać na liście lekcji.</Text>
        <Text>
          Nie zamykaj karty przeglądarki do końca wysyłania. Jeśli się przerwie, wybierz ten sam plik – wysyłanie ruszy od
          miejsca, w którym stanęło.
        </Text>
        {zdanieWymiany}
        {onPrzerwij && (
          <div>
            <Button poziom="outline" type="button" onClick={onPrzerwij}>
              Przerwij wysyłanie
            </Button>
          </div>
        )}
      </>
    );
  } else if (stan.rodzaj === "przerwane") {
    const procent = procentWyslania(stan.wyslano, stan.rozmiar);
    tresc = (
      <>
        <p className={style.zatrzymane}>{zdaniePrzerwania(stan.wyslano, stan.rozmiar)}</p>
        <PasekPostepu procent={procent} nazwa="Wysyłanie nagrania, przerwane" rozmiar="duzy" zatrzymany />
        <Text>
          Wybierz ten sam plik: <strong>{stan.nazwa}</strong>, {formatRozmiaru(stan.rozmiar)}, a wyślemy resztę.
        </Text>
        {stan.innyPlik && !wybieraOdNowa && <ErrorText id={`${id}-inny-plik`}>To nie jest ten sam plik</ErrorText>}
        {wybieraOdNowa
          ? wybor("Wybierz inny plik", "Wysyłanie zacznie się od początku. To, co wysłano dotąd, przepadnie.", onOdNowa)
          : wybor("Wybierz plik, żeby dokończyć", "Ten sam plik, który był wysyłany.")}
        {mozeWysylac && onOdNowa && (
          <div>
            <Button poziom="quiet" type="button" aria-pressed={wybieraOdNowa} onClick={() => setOdNowa((poprzednio) => !poprzednio)}>
              Wyślij inny plik od nowa
            </Button>
          </div>
        )}
        {zdanieWymiany}
      </>
    );
  } else if (stan.rodzaj === "przetwarzanie") {
    tresc = (
      <>
        <Etapy biezacy={2} />
        <Text>Przetwarzanie trwa zwykle 10–30 minut.</Text>
        <Text>
          {niezapisanyTekst
            ? "Zapisz tekst lekcji, zanim zamkniesz kartę przeglądarki. Nagranie przetworzy się samo."
            : "Możesz wszystko zamknąć – nagranie przetworzy się samo."}
        </Text>
        <Hint>{serwerZnaStan ? ZDANIE_ODSWIEZANIA : "Gotowe nagranie zobaczysz tutaj po ponownym otwarciu lekcji."}</Hint>
        {zdanieWymiany}
      </>
    );
  } else if (stan.rodzaj === "wysylane") {
    tresc = (
      <>
        <Etapy biezacy={1} />
        <Text>Nagranie jest wysyłane z innej karty przeglądarki albo z innego urządzenia.</Text>
        <Hint>{ZDANIE_ODSWIEZANIA}</Hint>
        {wybor(ETYKIETA_WYSLANIA_STAD, PODPOWIEDZ_WYSLANIA_STAD)}
      </>
    );
  } else if (stan.rodzaj === "gotowe") {
    const podglad = stan.podglad ? (
      <div>
        <Link href={stan.podglad} target="_blank" rel="noopener noreferrer">
          Otwórz podgląd nagrania w nowej karcie przeglądarki
        </Link>
      </div>
    ) : null;
    tresc = (
      <>
        <Text>Nagranie jest gotowe. Czas trwania: {czasNagrania(stan.czasSekundy)}.</Text>
        {podglad}
        {stan.nowe === undefined &&
          wybor(
            "Wyślij inne nagranie",
            serwerZnaStan
              ? "Uczestnicy będą oglądać obecne nagranie, dopóki nowe nie będzie gotowe."
              : "Po wybraniu pliku uczestnicy od razu przestaną widzieć obecne nagranie. Nowe zobaczą, gdy będzie gotowe.",
          )}
        {stan.nowe === "wysylanie" && (
          <>
            <p className={style.mocne}>
              Uczestnicy oglądają dotychczasowe nagranie. Nowe nagranie jest wysyłane i zastąpi dotychczasowe samo, gdy
              będzie gotowe.
            </p>
            <Hint>{ZDANIE_ODSWIEZANIA}</Hint>
            {wybor(ETYKIETA_WYSLANIA_STAD, PODPOWIEDZ_WYSLANIA_STAD)}
          </>
        )}
        {stan.nowe === "przetwarzanie" && (
          <>
            <p className={style.mocne}>
              Uczestnicy oglądają dotychczasowe nagranie. Nowe nagranie się przetwarza – zwykle 10–30 minut – i zastąpi
              dotychczasowe samo, gdy będzie gotowe.
            </p>
            <Hint>{ZDANIE_ODSWIEZANIA}</Hint>
          </>
        )}
        {stan.nowe === "blad" && (
          <>
            <ErrorText id={`${id}-blad-nowego`}>
              Nowe nagranie nie zostało przetworzone. Uczestnicy nadal oglądają dotychczasowe nagranie.
            </ErrorText>
            {wybor("Wyślij nowe nagranie ponownie", "Dotychczasowe nagranie zostaje, dopóki nowe nie będzie gotowe.")}
          </>
        )}
      </>
    );
  } else if (stan.rodzaj === "blad") {
    tresc = (
      <>
        <ErrorText id={`${id}-blad`}>{stan.zdanie}</ErrorText>
        {wybor("Wyślij ponownie", "Jedno nagranie na lekcję.")}
        {zdanieWymiany}
      </>
    );
  } else {
    tresc = (
      <>
        <Text>
          {stan.rodzaj === "nieznany" ? "Nie udało się sprawdzić stanu nagrania." : "Ta lekcja nie ma jeszcze nagrania."}
        </Text>
        {wybor("Upuść tutaj nagranie albo wybierz je z dysku.", "Jedno nagranie na lekcję. Nowe nagranie zastępuje poprzednie.")}
      </>
    );
  }

  return (
    <KartaBoczna tytul="Nagranie" opis="Zapisuje się samo" kotwica="nagranie">
      <div
        className={style.trescKarty}
        data-stan-nagrania={stan.rodzaj}
        data-nowe-nagranie={stan.rodzaj === "gotowe" ? stan.nowe : undefined}
      >
        {tresc}
      </div>
    </KartaBoczna>
  );
}
