import type { Metadata } from "next";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import ProfilPsychologaNowyEkran from "./NowyEkran";
import ProfilPsychologaStaraTresc from "./StaraTresc";

export const metadata: Metadata = { title: "Profil psychologa — Niepodzielni" };

/**
 * Profil psychologa wolontariusza (`/panel/profil-psychologa`). Adres się nie
 * zmienia, zmienia się treść: grupa przełączenia `profilPsychologa`
 * (`lib/przelaczenie/grupy.ts`) włączona → ekran nowego frontu
 * (`NowyEkran.tsx`), wyłączona → dotychczasowa treść (`StaraTresc.tsx`, bez
 * zmian). Warunek jest stały na całą gałąź/build. Strażnik roli `volunteer`
 * stoi w `layout.tsx` tej trasy i obejmuje obie treści.
 */
export default function PsychologistProfilePage() {
  return GRUPY.profilPsychologa.wlaczona ? <ProfilPsychologaNowyEkran /> : <ProfilPsychologaStaraTresc />;
}
