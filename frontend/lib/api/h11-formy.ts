/**
 * H11 — słownik form stażu, administracja
 * (`AdminInternshipFormController`, `backend/routes/api/h11.php:42-44`).
 * Odczyt startowy strony biegnie po stronie serwera (patrz
 * `nowy-front/formy-stazu/dane.ts`); te dwie funkcje obsługują zapisy
 * z przeglądarki przez wspólny klient (`./klient`).
 */

import { api } from "./klient";
import type { FormaStazu } from "@/nowy-front/formy-stazu/dane";

export interface PayloadNowaFormaStazu {
  name: string;
  description: string | null;
  is_active: boolean;
  /** `number | string` naumyślnie: puste albo nieliczbowe wpisanie w polu
   * kolejności ma trafić do serwera bez zamiany na `0` po stronie frontu —
   * serwer waliduje (`sort_order.integer`, `422 validation_failed`), front
   * nie zgaduje za niego. Patrz `FormyStazu.tsx:zapisz`. */
  sort_order: number | string;
}

export type PayloadEdycjaFormyStazu = Partial<PayloadNowaFormaStazu>;

/** `POST /admin/internship/forms` → 201, pełny zasób formy. */
export function utworzFormeStazu(payload: PayloadNowaFormaStazu): Promise<FormaStazu> {
  return api<FormaStazu>("/admin/internship/forms", {
    method: "POST",
    body: payload,
  });
}

/** `PATCH /admin/internship/forms/{id}` → 200, pełny zasób formy. */
export function zaktualizujFormeStazu(
  id: number,
  payload: PayloadEdycjaFormyStazu,
): Promise<FormaStazu> {
  return api<FormaStazu>(`/admin/internship/forms/${id}`, {
    method: "PATCH",
    body: payload,
  });
}
