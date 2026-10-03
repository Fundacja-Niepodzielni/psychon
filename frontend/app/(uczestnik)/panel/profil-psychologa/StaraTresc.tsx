import PsychologistProfileForm from "@/components/h15/PsychologistProfileForm";

/**
 * Dotychczasowa treść strony `/panel/profil-psychologa` — formularz wniosku ze
 * starego frontu, przeniesiony bez zmiany z pliku strony. Strona (`page.tsx`)
 * zwraca ją, gdy grupa przełączenia `profilPsychologa`
 * (`lib/przelaczenie/grupy.ts`) jest wyłączona.
 */
export default function ProfilPsychologaStaraTresc() {
  return <PsychologistProfileForm />;
}
