import { WatekGrupowy } from "@/nowy-front/watek-grupowy/WatekGrupowy";

/**
 * Trasa `/nowy-front/prowadzacy/watek-grupowy` — ekran „Wątek grupowy” (prowadzący) na `ListTemplate`.
 * Stara trasa produktu: `app/(prowadzacy)/prowadzacy/watek-grupowy/page.tsx`; przełączenia ten ekran
 * nie robi. Odczyty i zapisy biegną z przeglądarki (`WatekGrupowy.tsx`, dane w `dane.ts`) — powód
 * opisany tam.
 */
export default function StronaWatkuGrupowego() {
  return <WatekGrupowy />;
}
