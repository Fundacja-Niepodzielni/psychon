import { api } from "@/lib/api/klient";

/**
 * Dane karty „Powiadomienia e-mail” osoby — trasy `GET` i `PUT`
 * `/notifications/preferences` (`backend/routes/api/h16.php`,
 * `NotificationController::preferences` / `updatePreferences`).
 *
 * Każdy wpis to rodzaj powiadomienia, flaga e-maila i `switchable`: czy
 * osoba może sama wyłączyć ten e-mail („Osoba może wyłączyć w Profilu”).
 * E-maili „Wychodzi zawsze” i „Wyłącza tylko administracja” serwer nie
 * pozwala wyłączyć (422), więc karta ich nie pokazuje. Wyłączony e-mail
 * nie zabiera powiadomienia w panelu.
 */

export interface PreferencjaEmail {
  type: string;
  email: boolean;
  switchable: boolean;
}

export interface ZmianaPreferencji {
  type: string;
  email: boolean;
}

/** Nazwy e-maili z treści e-maili platformy — tylko te, które osoba może wyłączyć. */
export const ETYKIETY_EMAILI: Record<string, string> = {
  "assignment.created": "Nowy kurs do prowadzenia",
  "assignment.removed": "Koniec prowadzenia kursu",
  "course.invited": "Zaproszenie na kurs",
  "course.unlocked": "Nowy etap dostępny",
  "question.asked": "Nowe pytanie do lekcji",
  "question.answered": "Odpowiedź na pytanie",
  "internship.accepted": "Wpis stażu zatwierdzony",
  "internship.returned": "Prośba o poprawkę wpisu stażu",
  "internship.rejected": "Wpis stażu odrzucony",
  "attempt.failed_final": "Wyczerpane podejścia do testu",
  "certificate.ready": "Certyfikat gotowy",
  "document.ready": "Dokument gotowy",
  "profile.accepted": "Wniosek o profil psychologa zatwierdzony",
  "profile.returned": "Prośba o poprawkę wniosku o profil psychologa",
  "profile.withdrawn": "Wycofana zgoda na publikację profilu",
  "export.ready": "Eksport danych gotowy",
  "cooperation_request.answered": "Odpowiedź na zgłoszenie dalszej współpracy",
  "cooperation_request.created": "Nowe zgłoszenie dalszej współpracy",
  "supervision.reminder": "Przypomnienie: jutro superwizja",
  "supervision.slot_cancelled": "Termin superwizji odwołany",
  "access.expiring_7d": "Dostęp kończy się za 7 dni",
};

/** Rodzaj spoza mapy (np. nowy na zapleczu) nie pokazuje kodu technicznego. */
export function etykietaEmaila(rodzaj: string): string {
  return ETYKIETY_EMAILI[rodzaj] ?? "Inne powiadomienie";
}

/** Wpisy do `PUT`: wyłącznie zmienione e-maile, które osoba może wyłączyć. */
export function zmienionePreferencje(
  bazowe: PreferencjaEmail[],
  robocze: PreferencjaEmail[],
): ZmianaPreferencji[] {
  const poprzednie = new Map(bazowe.map((wpis) => [wpis.type, wpis.email]));
  return robocze
    .filter((wpis) => wpis.switchable && poprzednie.get(wpis.type) !== wpis.email)
    .map((wpis) => ({ type: wpis.type, email: wpis.email }));
}

export function pobierzPreferencje(): Promise<PreferencjaEmail[]> {
  return api<PreferencjaEmail[]>("/notifications/preferences");
}

export function zapiszPreferencje(zmiany: ZmianaPreferencji[]): Promise<PreferencjaEmail[]> {
  return api<PreferencjaEmail[]>("/notifications/preferences", {
    method: "PUT",
    body: { preferences: zmiany },
  });
}
