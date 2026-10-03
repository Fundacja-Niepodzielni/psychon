import InternshipJournal from "@/components/h11/InternshipJournal";

/**
 * Dotychczasowa treść strony `/panel/staz` — dziennik stażu ze starego
 * frontu, przeniesiony bez zmiany z pliku strony. Strona (`page.tsx`) zwraca
 * ją, gdy grupa przełączenia `dziennikStazu` (`lib/przelaczenie/grupy.ts`)
 * jest wyłączona.
 */
export default function StazStaraTresc() {
  return <InternshipJournal />;
}
