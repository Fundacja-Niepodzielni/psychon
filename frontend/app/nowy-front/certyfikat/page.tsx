import { Certyfikat } from "@/nowy-front/certyfikat-dokumenty/Certyfikat";

/**
 * Trasa `/nowy-front/certyfikat` — ekran „Certyfikat” uczestnika na `ListTemplate`.
 * Stara trasa produktu: `app/(uczestnik)/panel/certyfikat/page.tsx`; przełączenia ten ekran nie
 * robi. Odczyty i pobranie biegną z przeglądarki — powód opisany w `dane.ts`.
 */
export default function StronaCertyfikatu() {
  return <Certyfikat />;
}
