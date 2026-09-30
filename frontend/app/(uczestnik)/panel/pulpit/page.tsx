import type { Metadata } from "next";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import PulpitNowyEkran from "./NowyEkran";
import PulpitStaraTresc from "./StaraTresc";

export const metadata: Metadata = {
  title: "Pulpit — Niepodzielni",
};

/**
 * Pulpit uczestnika (`/panel/pulpit`) — pozycja menu tuż po „Start".
 * Adres się nie zmienia, zmienia się treść: grupa przełączenia
 * `pulpitUczestnika` (`lib/przelaczenie/grupy.ts`) włączona → ekran nowego
 * frontu (`NowyEkran.tsx`), wyłączona → dotychczasowa treść
 * (`StaraTresc.tsx`, bez zmian). Warunek jest stały na całą gałąź/build.
 */
export default function PulpitPage() {
  return GRUPY.pulpitUczestnika.wlaczona ? <PulpitNowyEkran /> : <PulpitStaraTresc />;
}
