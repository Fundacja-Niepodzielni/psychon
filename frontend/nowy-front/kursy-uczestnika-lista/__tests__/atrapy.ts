/**
 * Atrapy odpowiedzi `GET /courses` i `GET /courses/{slug}` dla testów listy kursów.
 * Dane wyłącznie demonstracyjne, te same kursy co w atrapach pulpitu uczestnika.
 */
import type { KursSciezki, LekcjaKursu } from "../dane";

export const KURS_UKONCZONY: KursSciezki = {
  id: 1,
  slug: "podstawy-pomocy",
  title: "Podstawy pomocy psychologicznej",
  sequence_order: 1,
  status: "completed",
  progress_percent: 100,
};

export const KURS_W_TOKU: KursSciezki = {
  id: 2,
  slug: "wywiad-psychologiczny",
  title: "Wywiad psychologiczny",
  sequence_order: 2,
  status: "in_progress",
  progress_percent: 40,
};

export const KURS_ZAMKNIETY: KursSciezki = {
  id: 3,
  slug: "interwencja-kryzysowa",
  title: "Interwencja kryzysowa",
  sequence_order: 3,
  status: "locked",
  progress_percent: 0,
};

/** Kurs poza ścieżką (webinar): bez numeru etapu. */
export const KURS_POZA_SCIEZKA: KursSciezki = {
  id: 7,
  slug: "webinar-superwizja",
  title: "Webinar o superwizji",
  sequence_order: null,
  status: "in_progress",
  progress_percent: 50,
};

export const LEKCJA_UKONCZONA: LekcjaKursu = {
  id: 21,
  title: "Wprowadzenie do wywiadu",
  sequence_order: 1,
  is_completed: true,
};

export const LEKCJA_DO_ZROBIENIA: LekcjaKursu = {
  id: 22,
  title: "Struktura wywiadu",
  sequence_order: 2,
  is_completed: false,
};

export const SZCZEGOL_W_TOKU = {
  ...KURS_W_TOKU,
  has_test: true,
  lessons: [LEKCJA_UKONCZONA, LEKCJA_DO_ZROBIENIA],
};
