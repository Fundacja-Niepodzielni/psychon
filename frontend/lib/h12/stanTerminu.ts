import type { AdminSupervisionSlot } from "@/lib/api/h12";

/**
 * Czy termin superwizji jest odwołany — jedno miejsce odczytu stanu dla obu
 * ekranów administracji (nowego i starego pod zwykłym adresem).
 *
 * Leży poza klientem API (`lib/api/h12.ts`) celowo: próby ekranów zaślepiają
 * cały moduł klienta, a ta funkcja jest czystą regułą odczytu, nie siecią.
 */
export function czyTerminOdwolany(slot: Pick<AdminSupervisionSlot, "status" | "cancelled_at">): boolean {
  return slot.status === "cancelled" || Boolean(slot.cancelled_at);
}
