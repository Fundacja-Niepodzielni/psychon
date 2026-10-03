import Logo from "@/components/ui/Logo";
import { CertyfikatPubliczny } from "@/nowy-front/certyfikat-publiczny/CertyfikatPubliczny";

/**
 * Podgląd `/nowy-front/publiczne/certyfikat` — strona certyfikatu z kodu QR
 * albo numeru w adresie, w nowym wyglądzie. Stara strona: `app/certyfikat/page.tsx` (bez zmian).
 */
export default function Strona() {
  return <CertyfikatPubliczny logo={<Logo title="Fundacja Niepodzielni" />} />;
}
