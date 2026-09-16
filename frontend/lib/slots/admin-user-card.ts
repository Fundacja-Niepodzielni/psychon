/**
 * Rejestr slotów karty osoby w administracji (#/admin/uczestniczki/:id — pakiet H18).
 *
 * Jak dodać swój slot (pakiet HXX):
 * 1. Utwórz komponent w `components/hXX/` i wyeksportuj obok niego obiekt slotu.
 * 2. Dodaj swój slot jedną linią do importów i jedną do listy poniżej.
 *
 * Dzięki temu H12 (prowadzący) i kolejne pakiety rozszerzają kartę osoby, nie
 * edytując pliku należącego do H18 — dokładnie tak, jak `lib/slots/admin-courses.ts`
 * dla karty kursu H08a.
 */
import type { ComponentType } from "react";
import h12AssignSupervisor from "@/components/h12/AssignSupervisor";
// import hXXNazwa from "@/components/hXX/hXXNazwa"; // ← dodaj swój slot jedną linią

export type AdminUserCardRegion = "user-actions";

export interface AdminUserCardSlotProps {
  userId: number;
}

export interface AdminUserCardSlot {
  /** Identyfikator z prefiksem pakietu, np. "h12-assign-supervisor". */
  id: string;
  region: AdminUserCardRegion;
  /** Niższy renderuje się pierwszy. */
  order: number;
  Component: ComponentType<AdminUserCardSlotProps>;
}

export const adminUserCardSlots: AdminUserCardSlot[] = [
  h12AssignSupervisor,
  // hXXNazwa, // ← i drugą tutaj
];

/** Wszystkie sloty regionu, rosnąco wg `order`. Regiony są addytywne. */
export function slotsForRegion(region: AdminUserCardRegion): AdminUserCardSlot[] {
  return adminUserCardSlots
    .filter((slot) => slot.region === region)
    .sort((a, b) => a.order - b.order);
}
