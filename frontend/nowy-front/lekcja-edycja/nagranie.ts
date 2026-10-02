import type { KodStanuNagrania, LekcjaAdmin, StanNagrania } from "./dane";
import type { StanFormularza } from "./formularz";

/**
 * Stany karty „Nagranie” i zdania o nich — bez Reacta, bez sieci. Karta jest
 * jednym komponentem o jawnych stanach; ten plik mówi, jakie są i jak powstają
 * z odpowiedzi trasy stanu nagrania oraz z trwającego wysyłania.
 */

/** Spacja nierozdzielająca: liczba nie odrywa się od jednostki przy łamaniu wiersza. */
export const NBSP = String.fromCharCode(160);

export type StanKartyNagrania =
  | { rodzaj: "brak" }
  /** Trasa stanu nie odpowiedziała — karta nie wie, czy nagranie jest. */
  | { rodzaj: "nieznany" }
  | { rodzaj: "wysylanie"; nazwa: string; rozmiar: number; wyslano: number; zostaloSekund: number | null }
  | { rodzaj: "przerwane"; nazwa: string; rozmiar: number; wyslano: number; innyPlik: boolean }
  /** Serwer mówi, że plik jest w drodze do dostawcy, a ta karta przeglądarki go nie wysyła. */
  | { rodzaj: "wysylane" }
  | { rodzaj: "przetwarzanie" }
  /**
   * Uczestnicy mają nagranie. `nowe` — obok niego jest nowe nagranie (wymiana);
   * `podglad` — adres podglądu z odpowiedzi trasy stanu, gdy serwer go podał.
   */
  | { rodzaj: "gotowe"; czasSekundy: number; nowe?: NoweNagranie; podglad?: string | null }
  | { rodzaj: "blad"; zdanie: string };

/**
 * Nowe nagranie obok dotychczasowego, które uczestnicy nadal oglądają:
 * w drodze do dostawcy, w przetwarzaniu albo zakończone błędem.
 */
export type NoweNagranie = "wysylanie" | "przetwarzanie" | "blad";

/** Zdanie błędu przetwarzania zgłoszonego przez trasę stanu nagrania. */
export const ZDANIE_BLEDU_PRZETWARZANIA = "Przetwarzanie nagrania zakończyło się błędem.";

/** Najmniejszy odstęp między pytaniami o stan nagrania w drodze. */
export const ODSTEP_PYTAN_O_STAN_MS = 30_000;

/**
 * Stan karty z pól stanu nagrania. `kod` to stan najnowszego nagrania lekcji
 * (`null` = nieustalony, traktowany jak grające); `grajace` — uczestnik
 * dostaje link do nagrania. Nagranie w drodze albo z błędem obok grającego to
 * wymiana: karta zostaje „gotowa”, a nowe nagranie jest jej dopiskiem.
 */
function stanKartyZPol(
  kod: KodStanuNagrania | null,
  grajace: boolean,
  czasSekundy: number,
  podglad: string | null,
): StanKartyNagrania {
  if (kod === "none") return { rodzaj: "brak" };
  if (kod === null || kod === "ready") return { rodzaj: "gotowe", czasSekundy, podglad };
  if (grajace) {
    const nowe: NoweNagranie = kod === "uploading" ? "wysylanie" : kod === "processing" ? "przetwarzanie" : "blad";
    return { rodzaj: "gotowe", czasSekundy, podglad, nowe };
  }
  if (kod === "uploading") return { rodzaj: "wysylane" };
  if (kod === "processing") return { rodzaj: "przetwarzanie" };
  return { rodzaj: "blad", zdanie: ZDANIE_BLEDU_PRZETWARZANIA };
}

/**
 * Stan karty z odpowiedzi trasy stanu nagrania; `null` = odczyt się nie udał.
 * Odpowiedź bez pola `video_status` (zaplecze sprzed stanu nagrania) czytana
 * jest po staremu, z samego `status`.
 */
export function stanKartyZSerwera(stan: StanNagrania | null): StanKartyNagrania {
  if (stan === null) return { rodzaj: "nieznany" };
  const kod = stan.video_status;
  if (kod !== undefined) {
    if (stan.status === "no_video") return stanKartyZPol(kod, false, 0, null);
    return stanKartyZPol(
      kod,
      stan.video_ready === true,
      stan.duration_seconds ?? 0,
      stan.preview_embed_url ?? null,
    );
  }
  if (stan.status === "no_video") return { rodzaj: "brak" };
  if (stan.status === "processing") return { rodzaj: "przetwarzanie" };
  if (stan.status === "error") return { rodzaj: "blad", zdanie: ZDANIE_BLEDU_PRZETWARZANIA };
  return { rodzaj: "gotowe", czasSekundy: stan.duration_seconds };
}

/** To, co strona lekcji wie o nagraniu z serwera. */
export interface NagranieZSerwera {
  karta: StanKartyNagrania;
  /**
   * Serwer podaje stan nagrania w polach: nowe nagranie zastępuje dotychczasowe
   * dopiero po gotowości, a stan nagrania w drodze da się odświeżać.
   */
  serwerZnaStan: boolean;
  /** Nagranie jest wysyłane albo przetwarzane — tylko wtedy strona pyta o stan ponownie. */
  wDrodze: boolean;
}

function czyWDrodze(kod: KodStanuNagrania | null | undefined): boolean {
  return kod === "uploading" || kod === "processing";
}

/**
 * Stan nagrania z odpowiedzi trasy stanu; gdy trasa nie odpowiedziała — z pól
 * zasobu lekcji, o ile je niesie. Bez pól stanu w obu miejscach strona działa
 * po staremu: nie pyta ponownie i nie obiecuje zachowania dotychczasowego nagrania.
 */
export function nagranieZSerwera(
  stan: StanNagrania | null,
  lekcja?: Pick<LekcjaAdmin, "video_status" | "video_ready" | "duration_seconds">,
): NagranieZSerwera {
  if (stan !== null) {
    return {
      karta: stanKartyZSerwera(stan),
      serwerZnaStan: stan.video_status !== undefined,
      wDrodze: czyWDrodze(stan.video_status),
    };
  }
  if (lekcja !== undefined && lekcja.video_status !== undefined) {
    return {
      karta: stanKartyZPol(lekcja.video_status, lekcja.video_ready === true, lekcja.duration_seconds, null),
      serwerZnaStan: true,
      wDrodze: czyWDrodze(lekcja.video_status),
    };
  }
  return { karta: { rodzaj: "nieznany" }, serwerZnaStan: false, wDrodze: false };
}

/**
 * Cały plik jest u dostawcy, a trasa stanu nie odpowiedziała albo jeszcze nie
 * widzi nagrania: wiadomo tyle, że nagranie czeka na przetworzenie. Nagranie,
 * które uczestnicy już mają, zostaje.
 */
export function poWyslaniuCalegoPliku(poprzednio: NagranieZSerwera): NagranieZSerwera {
  const { karta, serwerZnaStan } = poprzednio;
  if (serwerZnaStan && karta.rodzaj === "gotowe") {
    return { karta: { ...karta, nowe: "przetwarzanie" }, serwerZnaStan, wDrodze: true };
  }
  return { karta: { rodzaj: "przetwarzanie" }, serwerZnaStan, wDrodze: serwerZnaStan };
}

/**
 * Ile milisekund trzeba jeszcze odczekać przed kolejnym pytaniem o stan
 * nagrania: pytania dzieli co najmniej `ODSTEP_PYTAN_O_STAN_MS`.
 */
export function czasDoPytaniaOStan(ostatniePytanie: number, teraz: number): number {
  return Math.max(0, ostatniePytanie + ODSTEP_PYTAN_O_STAN_MS - teraz);
}

function zPrzecinkiem(liczba: number): string {
  return liczba.toFixed(1).replace(".", ",");
}

/** Rozmiar pliku dla osoby: „410 KB”, „2,1 MB”, „580 MB”, „1,2 GB”. */
export function formatRozmiaru(bajty: number): string {
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  if (bajty >= GB) return `${zPrzecinkiem(bajty / GB)}${NBSP}GB`;
  if (bajty >= 10 * MB) return `${Math.round(bajty / MB)}${NBSP}MB`;
  if (bajty >= MB) return `${zPrzecinkiem(bajty / MB)}${NBSP}MB`;
  if (bajty >= KB) return `${Math.round(bajty / KB)}${NBSP}KB`;
  return `${bajty}${NBSP}B`;
}

/** Pełne procenty wysłanej części; plik pusty to 0. */
export function procentWyslania(wyslano: number, rozmiar: number): number {
  if (rozmiar <= 0) return 0;
  return Math.min(100, Math.max(0, Math.floor((wyslano * 100) / rozmiar)));
}

/**
 * Szacowany czas do końca wysyłania, w sekundach, z dotychczasowego tempa.
 * `null`, dopóki nie ma z czego liczyć (nic nie wysłano albo nie upłynął czas).
 */
export function szacujPozostalyCzas(wyslano: number, rozmiar: number, uplyneloMs: number): number | null {
  if (wyslano <= 0 || uplyneloMs <= 0 || rozmiar <= wyslano) return null;
  const bajtowNaMs = wyslano / uplyneloMs;
  return Math.ceil((rozmiar - wyslano) / bajtowNaMs / 1000);
}

/** „62 % · zostało ok. 4 min”; bez szacunku sam procent. */
export function zdaniePostepu(procent: number, zostaloSekund: number | null): string {
  const czesc = `${procent}${NBSP}%`;
  if (zostaloSekund === null) return czesc;
  return `${czesc} · zostało ok. ${Math.max(1, Math.round(zostaloSekund / 60))}${NBSP}min`;
}

/** „Wysyłanie stanęło przy 48 % (580 MB z 1,2 GB).” */
export function zdaniePrzerwania(wyslano: number, rozmiar: number): string {
  return `Wysyłanie stanęło przy ${procentWyslania(wyslano, rozmiar)}${NBSP}% (${formatRozmiaru(wyslano)} z${NBSP}${formatRozmiaru(rozmiar)}).`;
}

/** Rodzaj pliku z rozszerzenia nazwy, wielkimi literami („PDF”); bez rozszerzenia — `null`. */
export function rodzajPliku(nazwa: string): string | null {
  const kropka = nazwa.lastIndexOf(".");
  if (kropka <= 0 || kropka === nazwa.length - 1) return null;
  const rozszerzenie = nazwa.slice(kropka + 1);
  return /^[0-9A-Za-z]{1,8}$/.test(rozszerzenie) ? rozszerzenie.toUpperCase() : null;
}

/** „PDF · 410 KB” — to, co ekran wie o pliku; puste, gdy nie wie nic. */
export function opisPliku(nazwa: string, rozmiar: number | null): string {
  return [rodzajPliku(nazwa), rozmiar === null ? null : formatRozmiaru(rozmiar)].filter(Boolean).join(" · ");
}

function formaPlikow(liczba: number): string {
  if (liczba === 1) return "plik";
  const jednosci = liczba % 10;
  const dziesiatki = liczba % 100;
  if (jednosci >= 2 && jednosci <= 4 && (dziesiatki < 12 || dziesiatki > 14)) return "pliki";
  return "plików";
}

export interface StanLekcji {
  gotowe: string[];
  czekamy: string[];
  uwaga: string[];
}

/**
 * Karta „Stan lekcji”: co w lekcji jest gotowe, na co czekamy i co wymaga
 * uwagi. Liczy z tego, co jest zapisane na serwerze (nie z pól w trakcie
 * edycji), z liczby plików i ze stanu nagrania.
 */
export function stanLekcji(
  zapisana: Pick<LekcjaAdmin, "duration_seconds"> & Pick<StanFormularza, "title" | "description" | "content">,
  liczbaPlikow: number,
  nagranie: StanKartyNagrania,
  /** Uczestnicy mają dotychczasowe nagranie, a `nagranie` mówi o wysyłaniu nowego. */
  dotychczasoweGra = false,
): StanLekcji {
  const gotowe: string[] = [];
  const czekamy: string[] = [];
  const uwaga: string[] = [];
  const jestTresc = zapisana.content.trim() !== "";

  if (zapisana.title.trim() !== "") gotowe.push("tytuł");
  if (zapisana.description.trim() !== "") gotowe.push("opis");
  if (jestTresc) gotowe.push("treść");
  if (liczbaPlikow > 0) gotowe.push(`${liczbaPlikow} ${formaPlikow(liczbaPlikow)}`);

  const wymiana = dotychczasoweGra && (nagranie.rodzaj === "wysylanie" || nagranie.rodzaj === "przerwane");
  // Przy wymianie mowa o nowym nagraniu: dotychczasowe jest gotowe i nadal gra.
  const ktore = wymiana ? "nowe nagranie" : "nagranie";
  if (nagranie.rodzaj === "gotowe" || wymiana) gotowe.push("nagranie");
  if (nagranie.rodzaj === "gotowe" && nagranie.nowe === "wysylanie") czekamy.push("nowe nagranie się wysyła");
  if (nagranie.rodzaj === "gotowe" && nagranie.nowe === "przetwarzanie") czekamy.push("nowe nagranie się przetwarza");
  if (nagranie.rodzaj === "gotowe" && nagranie.nowe === "blad") uwaga.push("nowe nagranie trzeba wysłać ponownie");
  if (nagranie.rodzaj === "wysylanie") {
    czekamy.push(`${ktore} się wysyła (${procentWyslania(nagranie.wyslano, nagranie.rozmiar)}${NBSP}%)`);
  }
  if (nagranie.rodzaj === "wysylane") czekamy.push("nagranie się wysyła");
  if (nagranie.rodzaj === "przetwarzanie") czekamy.push("nagranie się przetwarza");
  if (nagranie.rodzaj === "przerwane") {
    uwaga.push(wymiana ? "wysyłanie nowego nagrania przerwane" : "wysyłanie nagrania przerwane");
  }
  if (nagranie.rodzaj === "blad") uwaga.push("nagranie trzeba wysłać ponownie");
  if (nagranie.rodzaj === "brak" && !jestTresc) uwaga.push("lekcja nie ma treści ani nagrania");
  if (zapisana.duration_seconds === 0) uwaga.push("czas trwania 0 – uczestnik nie ukończy lekcji");

  return { gotowe, czekamy, uwaga };
}

/** Lekcje kursu w kolejności, w jakiej widzi je uczestnik. */
export function wKolejnosciKursu<T extends Pick<LekcjaAdmin, "id" | "sequence_order">>(lekcje: T[]): T[] {
  return [...lekcje].sort((a, b) => {
    const pozycjaA = a.sequence_order ?? Number.MAX_SAFE_INTEGER;
    const pozycjaB = b.sequence_order ?? Number.MAX_SAFE_INTEGER;
    return pozycjaA === pozycjaB ? a.id - b.id : pozycjaA - pozycjaB;
  });
}

export interface MiejsceWKursie<T> {
  /** Numer lekcji w kursie, od 1. */
  numer: number;
  razem: number;
  poprzednia: T | null;
  nastepna: T | null;
}

/** Miejsce lekcji w kursie i jej sąsiedzi; `null`, gdy lekcji nie ma na liście. */
export function miejsceWKursie<T extends Pick<LekcjaAdmin, "id" | "sequence_order">>(
  lekcje: T[],
  idLekcji: number,
): MiejsceWKursie<T> | null {
  const kolejno = wKolejnosciKursu(lekcje);
  const indeks = kolejno.findIndex((lekcja) => lekcja.id === idLekcji);
  if (indeks < 0) return null;
  return {
    numer: indeks + 1,
    razem: kolejno.length,
    poprzednia: kolejno[indeks - 1] ?? null,
    nastepna: kolejno[indeks + 1] ?? null,
  };
}
