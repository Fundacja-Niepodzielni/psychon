import type { AdminCourse, PublicationGap, PublicationGaps } from "@/lib/h08/types";
import type { KodStanuNagrania, LekcjaAdmin, StanNagrania } from "@/nowy-front/lekcja-edycja/dane";
import { checklistaPublikacji } from "@/nowy-front/kurs-publikacja/dane";
import { odmien } from "@/nowy-front/wspolne/odmiana";

/**
 * Stan publikacji kursu w jednym miejscu. Ekran nie liczy braków sam: karta
 * „Publikacja”, wąski pas, wiersze lekcji i plakietka zwiniętego tematu
 * czytają wynik funkcji z tego pliku.
 *
 * Źródłem jest serwer: braki kursu (`publication_gaps`), stan nagrania lekcji
 * (`video_status`, `video_ready`, `video_pending`) i powody odmowy publikacji
 * (`reason.items`). Gdy odpowiedź tych pól nie niesie (starszy serwer), plik
 * liczy jak dotąd — z identyfikatora nagrania, treści lekcji i odpowiedzi
 * o stanie nagrania.
 */

export type StanLekcji = "gotowa" | "wysylanie" | "przetwarzanie" | "blad-nagrania" | "pusta";

export const ETYKIETY_STANU_LEKCJI: Record<StanLekcji, string> = {
  gotowa: "Gotowa",
  wysylanie: "Nagranie: wysyłanie",
  przetwarzanie: "Nagranie: przetwarzanie",
  "blad-nagrania": "Nagranie: błąd",
  pusta: "Brak nagrania i treści",
};

/** Nowe nagranie lekcji, która ma już nagranie gotowe: w drodze albo z błędem. */
export type NoweNagranie = "w-drodze" | "blad";

export const DOPISKI_NOWEGO_NAGRANIA: Record<NoweNagranie, string> = {
  "w-drodze": "nowe nagranie w drodze",
  blad: "nowe nagranie: błąd",
};

/** Stan nagrania lekcji z odpowiedzi serwera; brak wpisu = serwer nie odpowiedział. */
export type StanyNagran = Record<number, StanNagrania["status"] | undefined>;

type PolaStanu = Pick<LekcjaAdmin, "video_provider_id" | "content" | "video_status" | "video_ready" | "video_pending">;

const NBSP = " ";

function maTresc(lekcja: Pick<LekcjaAdmin, "content">): boolean {
  return typeof lekcja.content === "string" && lekcja.content.trim() !== "";
}

/** Czy lekcja niesie stan nagrania z serwera (pole `video_status`, także `null`). */
export function maStanZSerwera(lekcja: Pick<LekcjaAdmin, "video_status">): boolean {
  return lekcja.video_status !== undefined;
}

/** Nagranie lekcji jest wysyłane albo przetwarzane — tylko o takie ekran pyta serwer ponownie. */
export function nagranieWDrodze(lekcja: Pick<LekcjaAdmin, "video_status">): boolean {
  return lekcja.video_status === "uploading" || lekcja.video_status === "processing";
}

/**
 * Stan jednej lekcji. Z polami serwera: lekcja z nagraniem, do którego
 * uczestnik dostaje link (`video_ready`), jest gotowa także wtedy, gdy jej nowe
 * nagranie jest w drodze albo skończyło się błędem; stan nieustalony (`null`)
 * liczy się jak gotowe nagranie. Bez pól serwera — jak dotąd: nagranie
 * w przetwarzaniu albo z błędem rozpoznaje odpowiedź o stanie nagrania.
 */
export function stanLekcji(lekcja: PolaStanu, nagranie: StanNagrania["status"] | undefined): StanLekcji {
  if (!maStanZSerwera(lekcja)) {
    if (lekcja.video_provider_id) {
      if (nagranie === "processing") return "przetwarzanie";
      if (nagranie === "error") return "blad-nagrania";
      return "gotowa";
    }
    return maTresc(lekcja) ? "gotowa" : "pusta";
  }
  if (lekcja.video_ready === true) return "gotowa";
  if (lekcja.video_status === "uploading") return "wysylanie";
  if (lekcja.video_status === "processing") return "przetwarzanie";
  if (lekcja.video_status === "error") return "blad-nagrania";
  if (lekcja.video_status === "none" || (lekcja.video_status === null && !lekcja.video_provider_id)) {
    return maTresc(lekcja) ? "gotowa" : "pusta";
  }
  return "gotowa";
}

/** Cichy dopisek wiersza: lekcja gotowa, a jej nowe nagranie jest w drodze albo z błędem. */
export function noweNagranie(lekcja: Pick<LekcjaAdmin, "video_status" | "video_ready" | "video_pending">): NoweNagranie | null {
  if (lekcja.video_ready !== true) return null;
  if (lekcja.video_status === "error") return "blad";
  if (lekcja.video_pending === true || nagranieWDrodze(lekcja)) return "w-drodze";
  return null;
}

/** Stan nagrania z odpowiedzi `…/video-status`: pole `video_status`, a bez niego — z `status`. */
export function kodStanuZOdpowiedzi(stan: StanNagrania): KodStanuNagrania | null {
  if (stan.video_status !== undefined) return stan.video_status;
  if (stan.status === "finished") return "ready";
  if (stan.status === "error") return "error";
  if (stan.status === "no_video") return "none";
  return "processing";
}

/** Czy lekcja w tym stanie wymaga czynności osoby (czekanie nią nie jest). */
export function wymagaUwagi(stan: StanLekcji): boolean {
  return stan === "blad-nagrania" || stan === "pusta";
}

function poprawnyBrak(wpis: unknown): wpis is PublicationGap {
  if (typeof wpis !== "object" || wpis === null) return false;
  const { code, lesson_id: idLekcji } = wpis as { code?: unknown; lesson_id?: unknown };
  return typeof code === "string" && code !== "" && (idLekcji === null || typeof idLekcji === "number");
}

function listaBrakow(lista: unknown): PublicationGap[] | null {
  return Array.isArray(lista) ? lista.filter(poprawnyBrak) : null;
}

/** Braki kursu z serwera albo `null`, gdy odpowiedź ich nie niesie. */
export function brakiZSerwera(kurs: Pick<AdminCourse, "publication_gaps">): PublicationGaps | null {
  const surowe: unknown = kurs.publication_gaps;
  if (typeof surowe !== "object" || surowe === null) return null;
  const blocking = listaBrakow((surowe as { blocking?: unknown }).blocking);
  const waiting = listaBrakow((surowe as { waiting?: unknown }).waiting);
  if (blocking === null || waiting === null) return null;
  return { blocking, waiting };
}

/**
 * Stan wiersza lekcji. Pola stanu nagrania lekcji mają pierwszeństwo; gdy
 * lekcja ich nie niesie, a kurs niesie braki — stan z braków kursu; bez obu —
 * jak dotąd.
 */
export function stanWiersza(
  lekcja: PolaStanu & Pick<LekcjaAdmin, "id">,
  nagranie: StanNagrania["status"] | undefined,
  braki: PublicationGaps | null,
): StanLekcji {
  if (!maStanZSerwera(lekcja) && braki !== null) {
    const blokujacy = braki.blocking.find((brak) => brak.lesson_id === lekcja.id)?.code;
    if (blokujacy === "lesson_empty") return "pusta";
    if (blokujacy === "recording_error") return "blad-nagrania";
    if (braki.waiting.some((brak) => brak.lesson_id === lekcja.id && brak.code === "recording_in_progress")) {
      return "przetwarzanie";
    }
  }
  return stanLekcji(lekcja, nagranie);
}

export interface PozycjaPublikacji {
  id: string;
  tekst: string;
  /** Miejsce, w którym brak się naprawia. */
  href?: string;
}

export interface StanPublikacji {
  doZrobienia: PozycjaPublikacji[];
  czekamy: PozycjaPublikacji[];
  gotowe: string[];
}

export const KOTWICA_DRZEWA = "tematy-i-lekcje";
export const KOTWICA_DANYCH_KURSU = "ustawienia-dane";

/** Wysyłanie nagrania z tej przeglądarki (uchwyt wysyłania) — najwyżej jedno naraz. */
export type WysylanieNaEkranie =
  | { idLekcji: number; rodzaj: "wysylanie"; procent: number }
  | { idLekcji: number; rodzaj: "przerwane" };

interface MiejscaLekcji {
  /** Lekcje w kolejności ekranu — numer lekcji to jej miejsce na tej liście. */
  lekcje: LekcjaAdmin[];
  /** Adres strony lekcji albo `null`, gdy strona lekcji jest niedostępna. */
  adresLekcji: (idLekcji: number) => string | null;
  wysylanie?: WysylanieNaEkranie | null;
}

interface DaneStanuPublikacji extends MiejscaLekcji {
  kurs: AdminCourse;
  nagrania: StanyNagran;
}

/** „Lekcja 3” z miejsca na ekranie; lekcja, której ekran nie zna — bez numeru. */
function nazwaLekcji(miejsca: MiejscaLekcji, idLekcji: number): string {
  const indeks = miejsca.lekcje.findIndex((lekcja) => lekcja.id === idLekcji);
  return indeks === -1 ? "Jedna z lekcji" : `Lekcja ${indeks + 1}`;
}

function hrefLekcji(miejsca: MiejscaLekcji, idLekcji: number): string {
  const znana = miejsca.lekcje.some((lekcja) => lekcja.id === idLekcji);
  return (znana ? miejsca.adresLekcji(idLekcji) : null) ?? `#${KOTWICA_DRZEWA}`;
}

/** Zdanie o nagraniu w drodze: wysyłanie z tej przeglądarki mówi więcej niż stan z serwera. */
function pozycjaWDrodze(miejsca: MiejscaLekcji, idLekcji: number, id: string): PozycjaPublikacji {
  const nazwa = nazwaLekcji(miejsca, idLekcji);
  const wysylanie = miejsca.wysylanie?.idLekcji === idLekcji ? miejsca.wysylanie : null;
  if (wysylanie?.rodzaj === "przerwane") {
    return { id, tekst: `${nazwa}: wysyłanie nagrania przerwane.`, href: hrefLekcji(miejsca, idLekcji) };
  }
  if (wysylanie?.rodzaj === "wysylanie") {
    return { id, tekst: `${nazwa}: nagranie się wysyła (${wysylanie.procent}${NBSP}%).` };
  }
  const lekcja = miejsca.lekcje.find((kandydat) => kandydat.id === idLekcji);
  if (lekcja?.video_status === "uploading") return { id, tekst: `${nazwa}: nagranie się wysyła.` };
  return { id, tekst: `${nazwa}: nagranie się przetwarza, zwykle 10–30 minut.` };
}

/**
 * Jeden brak z serwera jako zdanie z odnośnikiem do miejsca naprawy.
 * `null` — kod spoza słownika; o zdaniu decyduje wtedy wołający.
 */
function pozycjaBraku(brak: PublicationGap, miejsca: MiejscaLekcji): PozycjaPublikacji | null {
  const id = `${brak.code}-${brak.lesson_id ?? "kurs"}`;
  if (brak.code === "course_without_lessons") {
    return { id, tekst: "Kurs nie ma jeszcze lekcji.", href: `#${KOTWICA_DRZEWA}` };
  }
  if (brak.code === "final_test_without_questions") return { id, tekst: "Test końcowy nie ma pytań." };
  if (brak.code === "course_outside_program") return { id, tekst: "Kurs nie ma miejsca w Programie PsychON." };
  if (brak.lesson_id === null) return null;
  if (brak.code === "lesson_empty") {
    return {
      id,
      tekst: `${nazwaLekcji(miejsca, brak.lesson_id)}: brak nagrania i treści.`,
      href: hrefLekcji(miejsca, brak.lesson_id),
    };
  }
  if (brak.code === "recording_error") {
    return {
      id,
      tekst: `${nazwaLekcji(miejsca, brak.lesson_id)}: błąd nagrania.`,
      href: hrefLekcji(miejsca, brak.lesson_id),
    };
  }
  if (brak.code === "recording_in_progress") return pozycjaWDrodze(miejsca, brak.lesson_id, id);
  return null;
}

/** Brak z zasobu kursu o kodzie spoza słownika: zdanie ogólne z odnośnikiem, nigdy puste miejsce. */
function pozycjaNieznana(brak: PublicationGap, miejsca: MiejscaLekcji): PozycjaPublikacji {
  const id = `${brak.code}-${brak.lesson_id ?? "kurs"}`;
  if (brak.lesson_id === null) return { id, tekst: "Kurs wymaga uzupełnienia.", href: `#${KOTWICA_DRZEWA}` };
  return {
    id,
    tekst: `${nazwaLekcji(miejsca, brak.lesson_id)}: wymaga uzupełnienia.`,
    href: hrefLekcji(miejsca, brak.lesson_id),
  };
}

function zdanieGotowychLekcji(liczba: number): string {
  return `${liczba} ${odmien(liczba, "lekcja", "lekcje", "lekcji")}`;
}

function maOpis(kurs: Pick<AdminCourse, "description">): boolean {
  return typeof kurs.description === "string" && kurs.description.trim() !== "";
}

/** Stan publikacji z braków podanych przez serwer, w kolejności serwera. */
function stanZSerwera(braki: PublicationGaps, dane: DaneStanuPublikacji): StanPublikacji {
  const doZrobienia = braki.blocking.map((brak) => pozycjaBraku(brak, dane) ?? pozycjaNieznana(brak, dane));
  const czekamy = braki.waiting.map((brak) => pozycjaBraku(brak, dane) ?? pozycjaNieznana(brak, dane));
  const zBrakiem = new Set([...braki.blocking, ...braki.waiting].map((brak) => brak.lesson_id));
  const gotoweLekcje = dane.lekcje.filter((lekcja) => !zBrakiem.has(lekcja.id)).length;
  const gotowe = ["tytuł"];
  if (maOpis(dane.kurs)) gotowe.push("opis");
  if (gotoweLekcje > 0) gotowe.push(zdanieGotowychLekcji(gotoweLekcje));
  return { doZrobienia, czekamy, gotowe };
}

/**
 * Stan publikacji kursu. Gdy kurs niesie braki z serwera, lista jest dokładnie
 * tą listą. Bez nich — dotychczasowa reguła: opis i obecność lekcji z
 * `checklistaPublikacji`, stan lekcji z `stanLekcji`.
 */
export function stanPublikacji(dane: DaneStanuPublikacji): StanPublikacji {
  const braki = brakiZSerwera(dane.kurs);
  if (braki !== null) return stanZSerwera(braki, dane);

  const { kurs, lekcje, nagrania, adresLekcji } = dane;
  const dotychczasowe = checklistaPublikacji({ kurs: { ...kurs, lessons_count: lekcje.length }, lekcje });
  const doZrobienia: PozycjaPublikacji[] = [];
  const czekamy: PozycjaPublikacji[] = [];
  const gotowe: string[] = ["tytuł"];

  if (dotychczasowe.braki.some((brak) => brak.id === "opis")) {
    doZrobienia.push({ id: "opis", tekst: "Kurs nie ma opisu.", href: `#${KOTWICA_DANYCH_KURSU}` });
  } else {
    gotowe.push("opis");
  }
  if (dotychczasowe.braki.some((brak) => brak.id === "lekcje")) {
    doZrobienia.push({ id: "lekcje", tekst: "Kurs nie ma jeszcze lekcji.", href: `#${KOTWICA_DRZEWA}` });
  }

  let gotoweLekcje = 0;
  lekcje.forEach((lekcja, indeks) => {
    const numer = indeks + 1;
    const stan = stanLekcji(lekcja, nagrania[lekcja.id]);
    const href = adresLekcji(lekcja.id) ?? `#${KOTWICA_DRZEWA}`;
    if (stan === "gotowa") gotoweLekcje += 1;
    if (stan === "pusta") {
      doZrobienia.push({ id: `lekcja-${lekcja.id}`, tekst: `Lekcja ${numer}: brak nagrania i treści.`, href });
    }
    if (stan === "blad-nagrania") {
      doZrobienia.push({ id: `lekcja-${lekcja.id}`, tekst: `Lekcja ${numer}: błąd nagrania.`, href });
    }
    if (stan === "przetwarzanie" || stan === "wysylanie") {
      czekamy.push(pozycjaWDrodze(dane, lekcja.id, `lekcja-${lekcja.id}`));
    }
  });
  if (gotoweLekcje > 0) gotowe.push(zdanieGotowychLekcji(gotoweLekcje));

  return { doZrobienia, czekamy, gotowe };
}

/** Odmowa publikacji w kształcie, który ten plik czyta: `reason.items` i `message` serwera. */
interface OdmowaSerwera {
  message: string;
  reason?: Record<string, unknown> | null;
}

/**
 * Powody odmowy publikacji z `reason.items` — te same zdania i odnośniki co
 * w liście braków, w kolejności serwera. Kod spoza słownika daje `message`
 * serwera (raz). `null`, gdy odmowa nie niesie `items` — wołający pokazuje
 * ją wtedy jak dotąd.
 */
export function powodyOdmowy(odmowa: OdmowaSerwera, miejsca: MiejscaLekcji): PozycjaPublikacji[] | null {
  const pozycje = listaBrakow(odmowa.reason?.items);
  if (pozycje === null || pozycje.length === 0) return null;
  const powody: PozycjaPublikacji[] = [];
  let zdanieSerwera = false;
  for (const brak of pozycje) {
    const pozycja = pozycjaBraku(brak, miejsca);
    if (pozycja !== null) {
      powody.push(pozycja);
    } else if (!zdanieSerwera) {
      zdanieSerwera = true;
      const tekst = odmowa.message.trim() !== "" ? odmowa.message : "Serwer odmówił publikacji kursu.";
      powody.push({ id: "serwer", tekst });
    }
  }
  return powody;
}

/** „do zrobienia 1 rzecz” — skrót stanu w wąskim pasie. */
export function zdanieDoZrobienia(liczba: number): string {
  return `do zrobienia ${liczba} ${odmien(liczba, "rzecz", "rzeczy", "rzeczy")}`;
}
