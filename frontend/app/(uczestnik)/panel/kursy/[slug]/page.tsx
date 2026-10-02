import { GRUPY } from "@/lib/przelaczenie/grupy";
import KursNowyEkran from "./NowyEkran";
import KursStaraTresc from "./StaraTresc";

/**
 * Strona jednego kursu uczestnika (`/panel/kursy/[slug]`). Adres się nie
 * zmienia, zmienia się treść: grupa przełączenia `kursUczestnika`
 * (`lib/przelaczenie/grupy.ts`) włączona → ekran nowego frontu
 * (`NowyEkran.tsx`), wyłączona → dotychczasowa treść (`StaraTresc.tsx`, bez
 * zmian). Warunek jest stały na całą gałąź/build. `params` (obietnica) idzie
 * do wybranej treści bez odczytu — obie rozpakowują go Reactowym `use()`.
 */
export default function KursPage({ params }: { params: Promise<{ slug: string }> }) {
  return GRUPY.kursUczestnika.wlaczona ? <KursNowyEkran params={params} /> : <KursStaraTresc params={params} />;
}
