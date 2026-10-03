import { ProfilPsychologa } from "@/nowy-front/profil-psychologa-formularz/ProfilPsychologa";

/**
 * Trasa `/nowy-front/profil-psychologa` — ekran „Profil psychologa” uczestnika na `FormTemplate`.
 * Stara trasa produktu: `app/(uczestnik)/panel/profil-psychologa/page.tsx`; przełączenia ten ekran
 * nie robi. Odczyty i zapisy biegną z przeglądarki — powód opisany w `dane.ts`.
 */
export default function StronaProfiluPsychologa() {
  return <ProfilPsychologa />;
}
