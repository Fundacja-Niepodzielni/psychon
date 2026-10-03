import type { Metadata } from "next";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import StazNowyEkran from "./NowyEkran";
import StazStaraTresc from "./StaraTresc";

export const metadata: Metadata = {
  title: "Dziennik stażu — Niepodzielni",
};

/**
 * Dziennik stażu (`/panel/staz`). Adres się nie zmienia, zmienia się treść:
 * grupa przełączenia `dziennikStazu` (`lib/przelaczenie/grupy.ts`) włączona →
 * ekran nowego frontu (`NowyEkran.tsx`), wyłączona → dotychczasowa treść
 * (`StaraTresc.tsx`, bez zmian). Warunek jest stały na całą gałąź/build.
 */
export default function InternshipPage() {
  return GRUPY.dziennikStazu.wlaczona ? <StazNowyEkran /> : <StazStaraTresc />;
}
