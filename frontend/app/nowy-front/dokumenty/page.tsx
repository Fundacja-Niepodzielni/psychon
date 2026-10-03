import { Dokumenty } from "@/nowy-front/certyfikat-dokumenty/Dokumenty";

/**
 * Trasa `/nowy-front/dokumenty` — ekran „Dokumenty” uczestnika na `ListTemplate`.
 * Stara trasa produktu: `app/(uczestnik)/panel/dokumenty/page.tsx`; przełączenia ten ekran nie
 * robi. Odczyty i pobranie biegną z przeglądarki — powód opisany w `dane.ts`.
 */
export default function StronaDokumentow() {
  return <Dokumenty />;
}
