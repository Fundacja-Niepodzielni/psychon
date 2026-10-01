import { api, apiPaged, ApiError } from "@/lib/api/klient";

/**
 * Dane sekcji ekranu kursu administracji, których nie niosą inne ekrany:
 * przypisania prowadzących (`backend/routes/api/h09.php:42-46`), katalog
 * prowadzących (`h09.php:28`) i test wiedzy kursu (`h10.php:35`).
 */

export interface Prowadzacy {
  id: number;
  first_name: string;
  last_name: string;
}

/** Przypisanie prowadzącego: do całego kursu (`lesson_id: null`) albo do jednej lekcji. */
export interface PrzypisanieKursu {
  id: number;
  course_id: number;
  lesson_id: number | null;
  instructor: Prowadzacy;
}

export function pobierzPrzypisania(idKursu: number): Promise<PrzypisanieKursu[]> {
  return api<PrzypisanieKursu[]>(`/admin/courses/${idKursu}/assignments`);
}

/** Wszyscy prowadzący do wyboru — jedna strona katalogu, najwyżej 100 osób. */
export async function pobierzProwadzacych(): Promise<Prowadzacy[]> {
  const strona = await apiPaged<Prowadzacy>("/instructors?per_page=100");
  return strona.data;
}

export function przypiszProwadzacego(
  idKursu: number,
  idProwadzacego: number,
  idLekcji: number | null,
): Promise<PrzypisanieKursu> {
  return api<PrzypisanieKursu>(`/admin/courses/${idKursu}/assignments`, {
    method: "POST",
    body: { instructor_id: idProwadzacego, lesson_id: idLekcji },
  });
}

export function odlaczProwadzacego(idKursu: number, idPrzypisania: number): Promise<unknown> {
  return api<unknown>(`/admin/courses/${idKursu}/assignments`, {
    method: "DELETE",
    body: { assignment_id: idPrzypisania },
  });
}

/** Test wiedzy kursu albo `null`, gdy kurs go nie ma (`TestGrader::present`). */
export function pobierzTestKursu(idKursu: number): Promise<{ id: number } | null> {
  return api<{ id: number } | null>(`/admin/courses/${idKursu}/tests`);
}

export function imieNazwisko(osoba: Prowadzacy): string {
  return `${osoba.first_name} ${osoba.last_name}`.trim();
}

/** Jedno zdanie błędu sekcji — komunikat serwera, gdy jest czytelny dla osoby. */
export function zdanieBledu(blad: unknown, zapasowe: string): string {
  if (blad instanceof ApiError) {
    if (blad.status === 401) return "Sesja wygasła. Zaloguj się ponownie.";
    if (blad.status === 403) return "Ta operacja nie jest dostępna dla Twojej roli.";
    if (blad.status < 500 && blad.message.trim() !== "") return blad.message;
  }
  return zapasowe;
}
