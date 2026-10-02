import { GrupaProwadzacego } from "@/nowy-front/grupa-prowadzacego/GrupaProwadzacego";

/**
 * Trasa `/nowy-front/prowadzacy/grupa` — ekran „Moja grupa” (prowadzący) na `ListTemplate`.
 * Stara trasa produktu: `app/(prowadzacy)/prowadzacy/grupa/page.tsx`; przełączenia ten ekran nie
 * robi. Odczyty i zapisy biegną z przeglądarki (`GrupaProwadzacego.tsx`, dane w `dane.ts`) —
 * powód opisany tam.
 */
export default function StronaGrupyProwadzacego() {
  return <GrupaProwadzacego />;
}
