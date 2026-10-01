import { ApiError } from "@/lib/api/klient";
import type { CialoLekcji, LekcjaAdmin, StanNagrania } from "./dane";

/**
 * Logika formularza lekcji — bez Reacta, bez sieci. Limit treści to 20 000
 * ZNAKÓW, nie bajtów (aneks kontraktu „treść lekcji”, pkt 1; reguła
 * `max:20000` w `UpdateLessonRequest.php:34` liczy znaki). Znak to punkt
 * kodowy, więc `ż` i emoji liczą się po jednym, tak jak w walidatorze serwera.
 */

export const LIMIT_ZNAKOW_TRESCI = 20000;

export interface StanFormularza {
  title: string;
  description: string;
  content: string;
  duration: string;
}

export type PolaFormularza = keyof StanFormularza;
export type BledyFormularza = Partial<Record<PolaFormularza, string>>;

/** Liczba znaków (punktów kodowych), nie jednostek UTF-16 ani bajtów. */
export function liczZnaki(tekst: string): number {
  return Array.from(tekst).length;
}

function grupujTysiace(liczba: number): string {
  return String(liczba).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function odmianaZnakow(liczba: number): string {
  const reszta10 = liczba % 10;
  const reszta100 = liczba % 100;
  if (liczba === 1) return "znak";
  if (reszta10 >= 2 && reszta10 <= 4 && !(reszta100 >= 12 && reszta100 <= 14)) return "znaki";
  return "znaków";
}

/** Zdanie pod polem treści: stan licznika albo przekroczenie limitu. */
export function opisLicznika(liczba: number): string {
  const limit = grupujTysiace(LIMIT_ZNAKOW_TRESCI);
  if (liczba > LIMIT_ZNAKOW_TRESCI) {
    const nadmiar = liczba - LIMIT_ZNAKOW_TRESCI;
    return `Przekroczono limit o ${grupujTysiace(nadmiar)} ${odmianaZnakow(nadmiar)} (limit: ${limit}).`;
  }
  return `${grupujTysiace(liczba)} z ${limit} znaków.`;
}

export function formularzZLekcji(lekcja: LekcjaAdmin): StanFormularza {
  return {
    title: lekcja.title,
    description: lekcja.description ?? "",
    content: lekcja.content ?? "",
    duration: String(lekcja.duration_seconds),
  };
}

export function formularzeRowne(a: StanFormularza, b: StanFormularza): boolean {
  return a.title === b.title && a.description === b.description && a.content === b.content && a.duration === b.duration;
}

/** Czas trwania w pełnych sekundach (puste pole = 0, jak w starym formularzu). */
function sekundy(tekst: string): number | null {
  const przyciety = tekst.trim();
  if (przyciety === "") return 0;
  return /^\d+$/.test(przyciety) ? Number(przyciety) : null;
}

/** Błędy wykrywalne bez serwera; serwer zostaje ostatecznym walidatorem. */
export function walidujLokalnie(formularz: StanFormularza): BledyFormularza {
  const bledy: BledyFormularza = {};
  if (formularz.title.trim() === "") bledy.title = "Podaj tytuł lekcji.";
  if (sekundy(formularz.duration) === null) bledy.duration = "Podaj czas trwania w pełnych sekundach.";
  return bledy;
}

/**
 * Ciało zapisu. `content` idzie dokładnie tak, jak wpisano — bez przycinania
 * białych znaków (dwie spacje na końcu wiersza to twarde łamanie wiersza).
 * Brak `topic_id`, `topic_position` i `sequence_order`: te pola są po stronie
 * serwera zakazane albo należą do innej trasy.
 */
export function cialoZapisu(formularz: StanFormularza): CialoLekcji {
  return {
    title: formularz.title,
    description: formularz.description.trim() === "" ? null : formularz.description,
    content: formularz.content,
    duration_seconds: sekundy(formularz.duration) ?? 0,
  };
}

const POLA_SERWERA: Record<string, PolaFormularza> = {
  title: "title",
  description: "description",
  content: "content",
  duration_seconds: "duration",
};

/** 422 `validation_failed` → błędy pól; `null`, gdy to nie jest błąd pól. */
export function bledyZSerwera(blad: unknown): BledyFormularza | null {
  if (!(blad instanceof ApiError) || blad.status !== 422 || !blad.errors) return null;
  const bledy: BledyFormularza = {};
  for (const [pole, komunikaty] of Object.entries(blad.errors)) {
    const wlasciwe = POLA_SERWERA[pole];
    if (wlasciwe && komunikaty.length > 0) bledy[wlasciwe] = komunikaty[0];
  }
  return Object.keys(bledy).length > 0 ? bledy : null;
}

export function zdanieBleduZapisu(blad: unknown): string {
  if (blad instanceof ApiError) {
    if (blad.status === 401 || blad.status === 403) {
      return "Zapis lekcji nie jest dostępny dla Twojej roli. Wpisane zmiany zostają w formularzu.";
    }
    if (blad.status === 404) {
      return "Ta lekcja została usunięta, więc nie da się jej zapisać. Wpisane zmiany zostają w formularzu.";
    }
    if (blad.status < 500 && blad.message.trim() !== "") return blad.message;
  }
  return "Nie udało się zapisać lekcji. Sprawdź połączenie i spróbuj ponownie.";
}

export function zdanieBleduUsuniecia(blad: unknown): string {
  if (blad instanceof ApiError) {
    if (blad.status === 401 || blad.status === 403) return "Usunięcie lekcji nie jest dostępne dla Twojej roli.";
    if (blad.status === 404) return "Tej lekcji już nie ma. Odśwież stronę, żeby zobaczyć aktualny kurs.";
    if (blad.status < 500 && blad.message.trim() !== "") return blad.message;
  }
  return "Nie udało się usunąć lekcji. Sprawdź połączenie i spróbuj ponownie.";
}

export function zdanieBleduPliku(blad: unknown): string {
  if (blad instanceof ApiError) {
    const komunikatPola = blad.errors?.file?.[0];
    if (komunikatPola) return komunikatPola;
    if (blad.status < 500 && blad.message.trim() !== "") return blad.message;
  }
  if (blad instanceof Error && !(blad instanceof ApiError) && blad.message.trim() !== "") return blad.message;
  return "Nie udało się wgrać pliku. Spróbuj ponownie.";
}

export function czasNagrania(sekundyNagrania: number): string {
  const minuty = Math.floor(sekundyNagrania / 60);
  const reszta = sekundyNagrania % 60;
  return minuty > 0 ? `${minuty} min ${reszta} s` : `${reszta} s`;
}

/** Zdanie o stanie nagrania w sekcji „Nagranie”. `null` = stan nieznany. */
export function opisNagrania(stan: StanNagrania | null): string {
  if (stan === null) return "Nie udało się sprawdzić stanu nagrania.";
  if (stan.status === "no_video") return "Ta lekcja nie ma jeszcze nagrania.";
  if (stan.status === "processing") return "Nagranie jest przetwarzane. Wróć na ten ekran za kilka minut.";
  if (stan.status === "error") return "Przetwarzanie nagrania zakończyło się błędem. Wgraj nagranie ponownie.";
  return `Nagranie jest gotowe. Czas trwania: ${czasNagrania(stan.duration_seconds)}.`;
}

/** Role, które mogą zlecić wgranie nagrania (`video.php:22`, `role:super_admin`). */
export function mozeWgrywacNagranie(rola: string | null): boolean {
  return rola === "super_admin";
}

/** Powód, dla którego sekcja nagrania jest nieaktywna — `null`, gdy aktywna. */
export function powodNieaktywnegoNagrania(rola: string | null): string | null {
  if (mozeWgrywacNagranie(rola)) return null;
  if (rola === "project_manager") return "Nagranie może wgrać tylko Super Admin. Stan nagrania widzisz, ale go nie zmienisz.";
  return "Nie udało się ustalić, czy możesz wgrywać nagrania.";
}
