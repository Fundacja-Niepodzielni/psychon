import { api, ApiError } from "@/lib/api/klient";
import { fetchAdminUsers, type AdminUserListItem } from "@/lib/api/h18";
import type { AdminCourse } from "@/lib/h08/types";

/**
 * Logika ekranu „Zaproszenia na kurs” — bez JSX, z własnym testem.
 *
 * Zapis: `POST /admin/courses/{course}/invite` z `user_ids`
 * (`backend/routes/api/h08.php:73`, `InviteToCourseRequest`,
 * `CourseInviteController::invite` → `{ "data": { "invited": n } }`).
 * Reguła domenowa: `CourseInviter::assertOutsideMainPath`
 * (`backend/app/Services/H08/CourseInviter.php:65-67`) — zapraszać można
 * wyłącznie na kurs, który nie ma miejsca w kolejności programu
 * (`sequence_order === null`); typ kursu (`course` albo `webinar`) o tym nie
 * rozstrzyga, więc kurs typu `course` bez miejsca w kolejności też przyjmuje
 * zaproszenia, a spotkanie na żywo z miejscem w kolejności — nie.
 *
 * Odczyty pomocnicze (trasy administracji, te same co w starej karcie kursu):
 * `GET /admin/courses/{course}` (`h08.php:37`) — nazwa, typ i miejsce kursu
 * w kolejności; `GET /admin/users` (`h18.php:26`) — lista osób do wyboru.
 * Trasy odczytu listy zaproszonych nie ma (zaproszenie to wyłącznie
 * powiadomienie, bez tabeli — komentarz w `CourseInviter.php`), więc ekran
 * pokazuje tylko osoby zaproszone w bieżącej wizycie.
 */

export type ZaproszonaOsoba = AdminUserListItem;

/** Role osób, które uczestniczą w programie — tylko one są na liście wyboru. */
const ROLE_UCZESTNIKOW = ["volunteer", "student"] as const;

/** Identyfikator z adresu musi być liczbą (trasa ma `whereNumber('course')`). */
export function identyfikatorKursu(surowy: string): number | null {
  return /^\d+$/.test(surowy) ? Number(surowy) : null;
}

export function pobierzKurs(id: number): Promise<AdminCourse> {
  return api<AdminCourse>(`/admin/courses/${id}`);
}

export function kursPozaKolejnoscia(kurs: Pick<AdminCourse, "sequence_order">): boolean {
  return kurs.sequence_order === null;
}

export function etykietaTypuKursu(typ: string): string {
  return typ === "webinar" ? "Spotkanie na żywo w internecie" : "Kurs";
}

export interface WynikWyszukiwaniaOsob {
  osoby: ZaproszonaOsoba[];
  /** Ile osób spełnia filtr łącznie — może być więcej niż pokazanych (limit strony). */
  lacznie: number;
}

/** Aktywni wolontariusze i studenci, posortowani po nazwisku; `search` filtruje po stronie serwera. */
export async function szukajOsob(fraza: string): Promise<WynikWyszukiwaniaOsob> {
  const strony = await Promise.all(
    ROLE_UCZESTNIKOW.map((role) =>
      fetchAdminUsers({ role, status: "active", per_page: 100, sort: "last_name", search: fraza.trim() || undefined }),
    ),
  );
  const osoby = strony
    .flatMap((strona) => strona.data)
    .sort((a, b) => a.last_name.localeCompare(b.last_name, "pl") || a.first_name.localeCompare(b.first_name, "pl"));
  const lacznie = strony.reduce((suma, strona) => suma + (strona.meta?.total ?? strona.data.length), 0);
  return { osoby, lacznie };
}

export async function wyslijZaproszenia(idKursu: number, idOsob: number[]): Promise<number> {
  const wynik = await api<{ invited: number }>(`/admin/courses/${idKursu}/invite`, {
    method: "POST",
    body: { user_ids: idOsob },
  });
  return wynik.invited;
}

/** „Zaproszono 1 osobę.” / „2 osoby” / „5 osób” — odmiana po liczbie. */
export function zdanieOZaproszonych(liczba: number): string {
  if (liczba === 1) return "Zaproszono 1 osobę.";
  const jednosci = liczba % 10;
  const dwie = liczba % 100;
  const mnoga = jednosci >= 2 && jednosci <= 4 && (dwie < 12 || dwie > 14);
  return `Zaproszono ${liczba} ${mnoga ? "osoby" : "osób"}.`;
}

export type BladZaproszen =
  | { rodzaj: "walidacja"; pola: Record<string, string[]> }
  | { rodzaj: "warunki"; komunikat: string }
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "nie-znaleziono"; komunikat: string }
  | { rodzaj: "blad" };

/**
 * 422 z polami → walidacja, 422 `conditions_not_met` → kurs z miejscem
 * w kolejności, 401 i 403 → odmowa, 404 → brak kursu, reszta (także sieć) → błąd.
 */
export function klasyfikujBlad(wyjatek: unknown): BladZaproszen {
  if (!(wyjatek instanceof ApiError)) return { rodzaj: "blad" };
  if (wyjatek.status === 401 || wyjatek.status === 403) return { rodzaj: "brak-uprawnien" };
  if (wyjatek.status === 404) return { rodzaj: "nie-znaleziono", komunikat: wyjatek.message };
  if (wyjatek.status === 422 && wyjatek.code === "conditions_not_met") {
    return { rodzaj: "warunki", komunikat: wyjatek.message };
  }
  if (wyjatek.status === 422 && wyjatek.errors) return { rodzaj: "walidacja", pola: wyjatek.errors };
  return { rodzaj: "blad" };
}

/** Komunikaty dotyczące wyboru osób: `user_ids` i `user_ids.N` z `InviteToCourseRequest`. */
export function komunikatyWyboru(blad: BladZaproszen | null): string[] {
  if (blad?.rodzaj !== "walidacja") return [];
  const komunikaty = Object.entries(blad.pola)
    .filter(([klucz]) => klucz === "user_ids" || klucz.startsWith("user_ids."))
    .flatMap(([, wiadomosci]) => wiadomosci);
  return [...new Set(komunikaty)];
}

export function nazwaOsoby(osoba: Pick<ZaproszonaOsoba, "first_name" | "last_name">): string {
  return `${osoba.first_name} ${osoba.last_name}`;
}
