import { ProfilUczestnika } from "@/nowy-front/profil-uczestnika/ProfilUczestnika";

/**
 * Trasa `/nowy-front/profil` — „Mój profil” uczestnika: dane osobowe, zgody i eksport
 * danych. Odczyt i zapis biegną z przeglądarki — powód opisany w `profil-uczestnika/dane.ts`.
 */
export default function StronaProfilu() {
  return <ProfilUczestnika />;
}
