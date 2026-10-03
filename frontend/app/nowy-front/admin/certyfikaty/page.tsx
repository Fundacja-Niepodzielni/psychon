import { CertyfikatyLista } from "@/nowy-front/certyfikaty-lista/CertyfikatyLista";

/**
 * Trasa `/nowy-front/admin/certyfikaty` — ekran „Certyfikaty” (administracja):
 * lista wydanych certyfikatów i ich unieważnianie. Strona tylko wybiera ekran;
 * odczyt `GET /admin/certificates` i unieważnienie
 * `POST /admin/certificates/{id}/revoke` biegną z przeglądarki
 * (`nowy-front/certyfikaty-lista/dane.ts`).
 */
export default function StronaCertyfikatow() {
  return <CertyfikatyLista />;
}
