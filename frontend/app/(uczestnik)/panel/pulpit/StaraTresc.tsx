import PulpitDashboard from "@/components/pulpit/PulpitDashboard";

/**
 * Dotychczasowa treść strony `/panel/pulpit` — pulpit uczestnika ze
 * starego frontu, przeniesiony bez zmiany z pliku strony. Strona
 * (`page.tsx`) zwraca ją, gdy grupa przełączenia `pulpitUczestnika`
 * (`lib/przelaczenie/grupy.ts`) jest wyłączona. Cała logika po stronie
 * klienta (token Bearer z lib/api.ts).
 */
export default function PulpitStaraTresc() {
  return <PulpitDashboard />;
}
