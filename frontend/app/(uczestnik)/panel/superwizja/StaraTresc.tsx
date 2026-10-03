import SupervisionSlots from "@/components/h12/SupervisionSlots";

/**
 * Dotychczasowa treść `/panel/superwizja` (zapisy na terminy superwizji),
 * przeniesiona bez zmiany z `page.tsx`. Strona zwraca ją, gdy grupa
 * przełączenia `superwizjaUczestnika` jest wyłączona.
 */
export default function SuperwizjaStaraTresc() {
  return <SupervisionSlots />;
}
