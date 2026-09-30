import InstructorStart from "@/components/instructor/InstructorStart";

/**
 * Treść dotychczasowej strony startowej prowadzącego (`/prowadzacy`, stary front),
 * przeniesiona z `page.tsx` bez zmiany: `page.tsx` czyta rejestr przełączenia
 * (`lib/przelaczenie/grupy.ts`, grupa `pulpitProwadzacego`) i przy grupie
 * wyłączonej renderuje dokładnie ten komponent.
 */
export default function StaraTresc() {
  return <InstructorStart />;
}
