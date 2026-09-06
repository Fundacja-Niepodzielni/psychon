import type { AuditAction } from "@/lib/api";

/** Etykiety zdarzeń dziennika działań po polsku (kontrakt §3.2). */
export const ACTION_LABELS: Record<AuditAction, string> = {
  "application.accepted": "Zgłoszenie zaakceptowane",
  "application.rejected": "Zgłoszenie odrzucone",
  "access.extended": "Przedłużono dostęp",
  "course.created": "Kurs utworzony",
  "course.updated": "Kurs zaktualizowany",
  "course.deleted": "Kurs usunięty",
  "assignment.created": "Przypisanie prowadzącego utworzone",
  "assignment.removed": "Przypisanie prowadzącego usunięte",
  "attempt.finished": "Podejście do testu zakończone",
  "attempts.reset": "Zresetowano limit podejść",
  "workshop.completed": "Warsztat zaliczony",
  "internship.accepted": "Wpis stażu zaakceptowany",
  "internship.returned": "Wpis stażu zwrócony",
  "supervisor.assigned": "Przypisano superwizora",
  "certificate.issued": "Certyfikat wydany",
  "document.generated": "Dokument wygenerowany",
  "profile.accepted": "Profil psychologa zaakceptowany",
  "profile.returned": "Profil psychologa zwrócony",
  "profile.withdrawn": "Profil psychologa wycofany",
  "user.created": "Konto utworzone",
  "user.updated": "Konto zaktualizowane",
  "user.blocked": "Konto zablokowane",
  "edition.updated": "Ustawienia edycji zmienione",
  "sensitive.viewed": "Wgląd w dokument wrażliwy",
};
