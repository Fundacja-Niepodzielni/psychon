import { MIN_ANSWERS, type QuestionDraft } from "@/lib/h10/types";
import { odmien } from "@/nowy-front/wspolne/odmiana";
import type { PytanieTestu } from "./dane";

/**
 * Czysta logika ekranu „Pytania testu”: opis wiersza listy, reguły formularza
 * (te same co w dotychczasowym `QuestionForm` i `draftError`) z błędami
 * przypiętymi do pól, odczyt błędów pól z odpowiedzi serwera, plan zamiany
 * kolejności i zdania ekranu.
 */

/** Jedyny rodzaj pytania, jaki zna test końcowy: wybór jednej odpowiedzi poprawnej. */
export const RODZAJ_PYTANIA = "Wybór jednej odpowiedzi";

export const DLUGOSC_PYTANIA = 2000;
export const DLUGOSC_ODPOWIEDZI = 1000;
const DLUGOSC_SKROTU = 120;

/** Liczba z rzeczownikiem w poprawnej formie: „1 pytanie”, „2 pytania”, „5 pytań”. */
export function zLiczba(liczba: number, jeden: string, kilka: string, wiele: string): string {
  return `${liczba} ${odmien(liczba, jeden, kilka, wiele)}`;
}

export function liczbaPytan(liczba: number): string {
  return zLiczba(liczba, "pytanie", "pytania", "pytań");
}

export function liczbaOdpowiedzi(liczba: number): string {
  return zLiczba(liczba, "odpowiedź", "odpowiedzi", "odpowiedzi");
}

/** Krótka treść w jednej linii: domyślnie pierwsze 120 znaków, z wielokropkiem, gdy treść jest dłuższa. */
export function skrot(tekst: string, dlugosc: number = DLUGOSC_SKROTU): string {
  const jednaLinia = tekst.replace(/\s+/g, " ").trim();
  return jednaLinia.length <= dlugosc ? jednaLinia : `${jednaLinia.slice(0, dlugosc - 1).trimEnd()}…`;
}

/** Opis pytania w wierszu: rodzaj i liczba odpowiedzi. */
export function opisPytania(pytanie: PytanieTestu): string {
  return `${RODZAJ_PYTANIA} · ${liczbaOdpowiedzi(pytanie.answers.length)}`;
}

/** Nowe pytanie: dwie puste odpowiedzi, pierwsza poprawna (jak dotąd). */
export function pustySzkic(): QuestionDraft {
  return { body: "", answers: [{ body: "", is_correct: true }, { body: "", is_correct: false }] };
}

export function szkicZPytania(pytanie: PytanieTestu): QuestionDraft {
  return { body: pytanie.body, answers: pytanie.answers.map(({ id, body, is_correct }) => ({ id, body, is_correct })) };
}

export function zmienTresc(szkic: QuestionDraft, tresc: string): QuestionDraft {
  return { ...szkic, body: tresc };
}

export function zmienOdpowiedz(szkic: QuestionDraft, indeks: number, tresc: string): QuestionDraft {
  return { ...szkic, answers: szkic.answers.map((odpowiedz, i) => (i === indeks ? { ...odpowiedz, body: tresc } : odpowiedz)) };
}

export function zaznaczPoprawna(szkic: QuestionDraft, indeks: number): QuestionDraft {
  return { ...szkic, answers: szkic.answers.map((odpowiedz, i) => ({ ...odpowiedz, is_correct: i === indeks })) };
}

export function dodajOdpowiedz(szkic: QuestionDraft): QuestionDraft {
  return { ...szkic, answers: [...szkic.answers, { body: "", is_correct: false }] };
}

/** Czy można usunąć kolejną odpowiedź: pytanie musi zachować co najmniej dwie. */
export function moznaUsunacOdpowiedz(szkic: QuestionDraft): boolean {
  return szkic.answers.length > MIN_ANSWERS;
}

export const ZDANIE_MINIMUM_ODPOWIEDZI = `Pytanie musi mieć co najmniej ${MIN_ANSWERS} odpowiedzi, więc tej nie usuniesz.`;

/** Usunięcie odpowiedzi; gdy znika odpowiedź poprawna, oznaczenie przechodzi na pierwszą pozostałą (jak dotąd). */
export function usunOdpowiedz(szkic: QuestionDraft, indeks: number): QuestionDraft {
  if (!moznaUsunacOdpowiedz(szkic)) return szkic;
  const odpowiedzi = szkic.answers.filter((_, i) => i !== indeks);
  return {
    ...szkic,
    answers: odpowiedzi.some((odpowiedz) => odpowiedz.is_correct)
      ? odpowiedzi
      : odpowiedzi.map((odpowiedz, i) => ({ ...odpowiedz, is_correct: i === 0 })),
  };
}

/** Błędy formularza przypięte do pól: treść, zestaw odpowiedzi i każda odpowiedź z osobna (po indeksie). */
export interface BledyFormularza {
  body?: string;
  answers?: string;
  odpowiedzi: Record<number, string>;
}

export const BEZ_BLEDOW: BledyFormularza = { odpowiedzi: {} };

export function saBledy(bledy: BledyFormularza): boolean {
  return bledy.body !== undefined || bledy.answers !== undefined || Object.keys(bledy.odpowiedzi).length > 0;
}

/**
 * Walidacja przed wysłaniem — te same reguły i te same zdania co dotychczasowy
 * `draftError`, ale wszystkie naraz i przy polach, których dotyczą. Serwer
 * zostaje rozstrzygający: jego 422 zastępuje ten wynik.
 */
export function walidujSzkic(szkic: QuestionDraft): BledyFormularza {
  const bledy: BledyFormularza = { odpowiedzi: {} };
  if (szkic.body.trim() === "") bledy.body = "Treść pytania nie może być pusta.";
  if (szkic.answers.length < MIN_ANSWERS) {
    bledy.answers = `Pytanie musi mieć co najmniej ${MIN_ANSWERS} odpowiedzi.`;
  } else if (szkic.answers.filter((odpowiedz) => odpowiedz.is_correct).length !== 1) {
    bledy.answers = "Zaznacz dokładnie jedną poprawną odpowiedź.";
  }
  szkic.answers.forEach((odpowiedz, indeks) => {
    if (odpowiedz.body.trim() === "") bledy.odpowiedzi[indeks] = "Każda odpowiedź musi mieć treść.";
  });
  return bledy;
}

/** Błędy pól z odpowiedzi 422 serwera: `body`, `answers`, `answers.N.body` i `answers.N.is_correct`. */
export function bledyZSerwera(pola: Record<string, string[]>): BledyFormularza {
  const bledy: BledyFormularza = { odpowiedzi: {} };
  if (pola.body?.[0]) bledy.body = pola.body[0];
  if (pola.answers?.[0]) bledy.answers = pola.answers[0];
  for (const [klucz, lista] of Object.entries(pola)) {
    const trafienie = /^answers\.(\d+)\.(body|is_correct)$/.exec(klucz);
    if (trafienie === null || !lista?.[0]) continue;
    const indeks = Number(trafienie[1]);
    bledy.odpowiedzi[indeks] = bledy.odpowiedzi[indeks] ?? lista[0];
  }
  return bledy;
}

/** Czy szkic różni się od stanu wyjściowego (otwarty formularz bez zmian nie jest niezapisaną pracą). */
export function zmieniony(szkic: QuestionDraft, wyjsciowy: QuestionDraft): boolean {
  return JSON.stringify(szkic) !== JSON.stringify(wyjsciowy);
}

/** Co znika razem z pytaniem — zdanie okna potwierdzenia usunięcia. */
export function zdanieUsuniecia(pytanie: PytanieTestu): string {
  return `Usuniesz treść pytania i ${liczbaOdpowiedzi(pytanie.answers.length)}, w tym odpowiedź poprawną. Tego nie da się cofnąć. Wyniki wcześniejszych podejść zostaną bez zmian.`;
}

/** Zdanie przy przyciskach nieczynnych na czas zapisu kolejności. */
export const ZDANIE_ZAPISU_KOLEJNOSCI = "Zapisujemy kolejność. Poczekaj chwilę.";

/** Długość treści pytania w nazwach strzałek kolejności i w ogłoszeniu ruchu. */
export const DLUGOSC_NAZWY_WIERSZA = 60;

/** Jeden krok zapisu kolejności: pytanie dostaje na serwerze tę pozycję. */
export interface KrokKolejnosci {
  idPytania: number;
  pozycja: number;
}

/**
 * Zamiana pytania z sąsiadem (`kierunek` −1 — wyżej, 1 — niżej). Serwer nie
 * dopuszcza dwóch pytań testu na tej samej pozycji i nie ma zapisu całej
 * kolejności naraz, więc zamiana idzie w trzech krokach przez wolne miejsce
 * za ostatnim pytaniem: pytanie na wolne miejsce, sąsiad na zwolnione miejsce
 * pytania, pytanie na dawne miejsce sąsiada. `po` — lista po zamianie, z
 * pozycjami serwera. Na brzegu listy (albo poza nią) planu nie ma.
 */
export function planZamiany(
  pytania: readonly PytanieTestu[],
  indeks: number,
  kierunek: -1 | 1,
): { kroki: KrokKolejnosci[]; po: PytanieTestu[] } | null {
  const sasiad = indeks + kierunek;
  if (indeks < 0 || indeks >= pytania.length || sasiad < 0 || sasiad >= pytania.length) return null;
  const pytanie = pytania[indeks];
  const drugie = pytania[sasiad];
  const wolne = Math.max(...pytania.map((element) => element.sequence_order)) + 1;
  const kroki: KrokKolejnosci[] = [
    { idPytania: pytanie.id, pozycja: wolne },
    { idPytania: drugie.id, pozycja: pytanie.sequence_order },
    { idPytania: pytanie.id, pozycja: drugie.sequence_order },
  ];
  const po = [...pytania];
  po[sasiad] = { ...pytanie, sequence_order: drugie.sequence_order };
  po[indeks] = { ...drugie, sequence_order: pytanie.sequence_order };
  return { kroki, po };
}
