import { KursyProwadzacego } from "@/nowy-front/kursy-prowadzacego/KursyProwadzacego";

/**
 * Trasa `/nowy-front/prowadzacy/kursy` — ekran „Moje kursy” (prowadzący) na
 * szablonie `ListTemplate`. Odczyt biegnie z przeglądarki
 * (`KursyProwadzacego.tsx`, dane w `dane.ts`) — powód opisany tam.
 */
export default function StronaKursowProwadzacego() {
  return <KursyProwadzacego />;
}
