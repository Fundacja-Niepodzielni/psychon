import { api, apiPaged, ApiError } from "@/lib/api/klient";

/**
 * Dane sekcji ekranu kursu administracji, których nie niosą inne ekrany:
 * przypisania prowadzących (`backend/routes/api/h09.php:42-46`), lista osób
 * z rolą prowadzącego (`GET /admin/users`, `backend/routes/api/h18.php:26`)
 * i test wiedzy kursu (`h10.php:35`).
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

/**
 * Wszyscy prowadzący do wyboru: aktywne osoby z rolą prowadzącego, jedna
 * strona listy osób (najwyżej 100), po nazwisku. Lista osób, nie katalog
 * wizytówek — osoba z rolą prowadzącego bez zapisanej wizytówki też jest do
 * wyboru. Ze strony zostaje tylko to, co ekran pokazuje: identyfikator, imię
 * i nazwisko (adresu e-mail ani innych pól osoby ekran nie przechowuje).
 */
export async function pobierzProwadzacych(): Promise<Prowadzacy[]> {
  const strona = await apiPaged<Prowadzacy>("/admin/users?role=instructor&status=active&per_page=100&sort=last_name");
  return strona.data.map(({ id, first_name, last_name }) => ({ id, first_name, last_name }));
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
