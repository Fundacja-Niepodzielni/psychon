import type { GrupaZdarzen } from "@/lib/api/h20-dziennik";

/**
 * Słownik ekranu „Dziennik działań”: jedno zdanie po polsku na każdy kod
 * zdarzenia i nazwy grup. Jedyne miejsce, w którym ekran zamienia kod na
 * słowa. Zdanie to czynność z zamkniętej listy (`CZYNNOSCI`) i nazwa rzeczy —
 * nigdy wartość i nigdy treść wpisana ręcznie (powód, odpowiedź).
 *
 * Te same zdania i grupy ma zaplecze w `backend/app/Services/H20/AuditLogMap.php`
 * (eksport mówi tymi samymi słowami co ekran). Próba
 * `__tests__/slownik.test.ts` czerwienieje, gdy kod z rejestru nie ma tu
 * zdania albo gdy oba słowniki się rozjadą.
 */

/** Grupy zdarzeń w kolejności filtra „Rodzaj”. */
export const GRUPY: { klucz: GrupaZdarzen; nazwa: string }[] = [
  { klucz: "konta", nazwa: "Konta i role" },
  { klucz: "nabor", nazwa: "Nabór" },
  { klucz: "kursy", nazwa: "Kursy i testy" },
  { klucz: "staz", nazwa: "Staż i dyżury" },
  { klucz: "superwizja", nazwa: "Superwizja" },
  { klucz: "dokumenty", nazwa: "Dokumenty i certyfikaty" },
  { klucz: "inne", nazwa: "Inne" },
];

/** Zamknięta lista czynności — pierwsze słowo każdego zdania. */
export const CZYNNOSCI = [
  "Utworzono",
  "Zmieniono",
  "Usunięto",
  "Zablokowano",
  "Zanonimizowano",
  "Przedłużono",
  "Przyjęto",
  "Odrzucono",
  "Przypisano",
  "Odpięto",
  "Zakończono",
  "Wyzerowano",
  "Zaliczono",
  "Zatwierdzono",
  "Odesłano",
  "Wydano",
  "Unieważniono",
  "Wygenerowano",
  "Wyświetlono",
  "Opublikowano",
  "Zaakceptowano",
  "Wycofano",
  "Odnotowano",
  "Odwołano",
  "Złożono",
  "Odpowiedziano",
] as const;

/** Kod zdarzenia → zdanie. */
export const ZDANIA: Record<string, string> = {
  "user.created": "Utworzono konto",
  "user.updated": "Zmieniono dane konta",
  "user.blocked": "Zablokowano konto",
  "user.anonymized": "Zanonimizowano konto",
  "access.extended": "Przedłużono dostęp",
  "application.accepted": "Przyjęto zgłoszenie rekrutacyjne",
  "application.rejected": "Odrzucono zgłoszenie rekrutacyjne",
  "course.created": "Utworzono kurs",
  "course.updated": "Zmieniono kurs",
  "course.deleted": "Usunięto kurs",
  "assignment.created": "Przypisano prowadzącego do kursu",
  "assignment.removed": "Odpięto prowadzącego od kursu",
  "attempt.finished": "Zakończono podejście do testu",
  "attempts.reset": "Wyzerowano limit podejść do testu",
  "workshop.completed": "Zaliczono warsztat",
  "internship.accepted": "Zatwierdzono dyżur",
  "internship.returned": "Odesłano dyżur do poprawy",
  "internship.rejected": "Odrzucono dyżur",
  "supervisor.assigned": "Przypisano superwizora",
  "supervision.attendance_marked": "Odnotowano obecność na superwizji",
  "supervision.slot_cancelled": "Odwołano termin superwizji",
  "certificate.issued": "Wydano certyfikat",
  "certificate.revoked": "Unieważniono certyfikat",
  "document.generated": "Wygenerowano dokument",
  "sensitive.viewed": "Wyświetlono dokument wrażliwy",
  "legal_document.published": "Opublikowano dokument prawny",
  "legal_document.accepted": "Zaakceptowano dokument prawny",
  "edition.updated": "Zmieniono ustawienia edycji",
  "notification_settings.updated": "Zmieniono ustawienia powiadomień",
  "profile.accepted": "Zaakceptowano profil psychologa",
  "profile.returned": "Odesłano profil psychologa do poprawy",
  "profile.withdrawn": "Wycofano profil psychologa",
  "cooperation_request.created": "Złożono prośbę o dalszą współpracę",
  "cooperation_request.answered": "Odpowiedziano na prośbę o dalszą współpracę",
};

/** Zdanie kodu, którego słownik jeszcze nie zna — nigdy sam kod techniczny. */
export const ZDANIE_NIEZNANE = "Odnotowano zdarzenie";

export function zdanie(kod: string): string {
  return ZDANIA[kod] ?? ZDANIE_NIEZNANE;
}

export function nazwaGrupy(klucz: string): string {
  return GRUPY.find((grupa) => grupa.klucz === klucz)?.nazwa ?? "Inne";
}
