import { GRUPY } from "@/lib/przelaczenie/grupy";
import TestNowyEkran from "./NowyEkran";
import TestStaraTresc from "./StaraTresc";

/**
 * Test końcowy kursu uczestnika (`/panel/kursy/[slug]/test`). Adres się nie
 * zmienia, zmienia się treść: grupa przełączenia `testUczestnika`
 * (`lib/przelaczenie/grupy.ts`) włączona → ekran nowego frontu
 * (`NowyEkran.tsx`), wyłączona → dotychczasowa treść (`StaraTresc.tsx`, bez
 * zmian; slug czyta sama z adresu). Warunek jest stały na całą gałąź/build.
 * `params` (obietnica) idzie do nowego ekranu bez odczytu — rozpakowuje go
 * Reactowym `use()`.
 */
export default function TestKursuPage({ params }: { params: Promise<{ slug: string }> }) {
  return GRUPY.testUczestnika.wlaczona ? <TestNowyEkran params={params} /> : <TestStaraTresc />;
}
