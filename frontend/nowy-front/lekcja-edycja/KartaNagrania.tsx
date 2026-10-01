"use client";

import { Button } from "@/design-system/atomy/Button/Button";
import { ErrorText } from "@/design-system/atomy/ErrorText/ErrorText";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { ProgressBar } from "@/design-system/atomy/ProgressBar/ProgressBar";
import { Text } from "@/design-system/atomy/Text/Text";
import { FileDropZone } from "@/design-system/molekuly/FileDropZone/FileDropZone";
import { KartaBoczna } from "@/design-system/szablony/UkladEdycji/KartaBoczna";
import { czasNagrania } from "./formularz";
import {
  formatRozmiaru,
  NBSP,
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
 * - `zachowuje-poprzednie` — uczestnicy oglądają poprzednie nagranie, dopóki
 *   nowe nie jest gotowe (stan pokazowy: ekran go nie ustawia).
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
  /** Czy przerwane wysyłanie da się dokończyć tym samym plikiem. */
  wznawia?: boolean;
  wymiana?: WymianaNagrania;
  /** Odmowa wyboru pliku (np. plik nie jest nagraniem) — pod polem wyboru. */
  bladWyboru?: string | null;
  onWybierzPlik: (pliki: FileList) => void;
  onPrzerwij?: () => void;
  /** „Wyślij inny plik od nowa” w stanie przerwanym. */
  onOdNowa?: () => void;
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
    "Uczestnicy oglądają poprzednie nagranie. Nowe zastąpi je samo, gdy będzie gotowe. Jeśli się nie uda, zostanie poprzednie.",
};

/**
 * Karta „Nagranie” strony lekcji — jeden komponent o jawnych stanach: brak,
 * wysyłanie, przerwane, przetwarzanie, gotowe, błąd; do tego zdanie o wymianie
 * poprzedniego nagrania. Karta nie zna sieci: stan i zdarzenia dostaje z ekranu.
 */
export function KartaNagrania({
  id,
  stan,
  powodBrakuWysylania,
  niezapisanyTekst,
  wznawia = false,
  wymiana = "brak",
  bladWyboru = null,
  onWybierzPlik,
  onPrzerwij,
  onOdNowa,
}: WlasciwosciKartyNagrania) {
  const mozeWysylac = powodBrakuWysylania === null;

  function wybor(etykieta: string, podpowiedz: string) {
    if (!mozeWysylac) return <Hint>{powodBrakuWysylania}</Hint>;
    return (
      <>
        <FileDropZone id={`${id}-plik`} etykieta={etykieta} podpowiedz={podpowiedz} pliki={[]} onWybierzPliki={onWybierzPlik} />
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
        <ProgressBar procent={procent} etykieta={zdaniePostepu(procent, stan.zostaloSekund)} />
        <Text>
          Zostań w tej lekcji do końca wysyłania. Po przejściu do kursu albo innej lekcji nie zobaczysz postępu, a wysyłanie
          może się przerwać.
        </Text>
        <Text>
          {wznawia
            ? "Nie zamykaj karty przeglądarki do końca wysyłania. Jeśli się przerwie, wybierz ten sam plik – wysyłanie ruszy od miejsca, w którym stanęło."
            : "Nie zamykaj karty przeglądarki do końca wysyłania. Jeśli się przerwie, trzeba będzie wysłać plik od nowa."}
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
        <ProgressBar procent={procent} etykieta={`${procent}${NBSP}% · wysyłanie przerwane`} />
        <Text>
          Wybierz ten sam plik: <strong>{stan.nazwa}</strong>, {formatRozmiaru(stan.rozmiar)}, a wyślemy resztę.
        </Text>
        {stan.innyPlik && <ErrorText id={`${id}-inny-plik`}>To nie jest ten sam plik</ErrorText>}
        {wybor("Wybierz plik, żeby dokończyć", "Ten sam plik, który był wysyłany.")}
        {mozeWysylac && onOdNowa && (
          <div>
            <Button poziom="quiet" type="button" onClick={onOdNowa}>
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
        <Hint>Gotowe nagranie zobaczysz tutaj po ponownym otwarciu lekcji.</Hint>
        {zdanieWymiany}
      </>
    );
  } else if (stan.rodzaj === "gotowe") {
    tresc = (
      <>
        <Text>Nagranie jest gotowe. Czas trwania: {czasNagrania(stan.czasSekundy)}.</Text>
        {wybor(
          "Wyślij inne nagranie",
          "Po wybraniu pliku uczestnicy od razu przestaną widzieć obecne nagranie. Nowe zobaczą, gdy będzie gotowe.",
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
      <div className={style.trescKarty} data-stan-nagrania={stan.rodzaj}>
        {tresc}
      </div>
    </KartaBoczna>
  );
}
