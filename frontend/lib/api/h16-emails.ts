/**
 * H16 — skrzynka e-maili symulowanych, administracja
 * (`EmailController::index`, `backend/routes/api/h16.php:34`). Jedyna
 * trasa administracyjna pakietu — odczyt startowy strony biegnie po
 * stronie serwera (patrz `nowy-front/powiadomienia-email/dane.ts`), zmiana
 * strony biegnie stąd, z przeglądarki, przez wspólny klient (`./klient`).
 */

import { apiPaged } from "./klient";
import type { MetaSkrzynki, WiadomoscEmail } from "@/nowy-front/powiadomienia-email/dane";

export function fetchAdminEmailsPage(
  page: number,
): Promise<{ data: WiadomoscEmail[]; meta?: MetaSkrzynki }> {
  return apiPaged<WiadomoscEmail>(`/admin/emails?page=${page}&per_page=25`) as Promise<{
    data: WiadomoscEmail[];
    meta?: MetaSkrzynki;
  }>;
}
