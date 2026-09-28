import { PowiadomieniaEmail } from "@/nowy-front/powiadomienia-email/PowiadomieniaEmail";

/**
 * Trasa `/nowy-front/admin/powiadomienia` — zarządzanie powiadomieniami
 * (H16) wg tras obecnych w `h16.php` (dziś: wyłącznie `GET /admin/emails`,
 * `backend/routes/api/h16.php:34`). Odczyt biegnie z przeglądarki
 * (`PowiadomieniaEmail.tsx`) — powód opisany tam.
 */
export default function StronaPowiadomienEmail() {
  return <PowiadomieniaEmail />;
}
