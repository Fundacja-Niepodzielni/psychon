import "@/design-system/tokeny/tokeny.css";
import type { Metadata } from "next";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import { Sprawy } from "@/nowy-front/sprawy/Sprawy";
import StaraTresc from "./StaraTresc";

/** Tytuł karty jest ten sam przy włączonej i wyłączonej grupie. */
export const metadata: Metadata = {
  title: "Sprawy — Niepodzielni",
};

/**
 * Trasa `/admin/sprawy`. Adres się nie zmienia: strona czyta rejestr
 * przełączenia (`lib/przelaczenie/grupy.ts`, grupa `sprawy`). Grupa
 * wyłączona → dotychczasowa treść (`StaraTresc.tsx`, lista spraw zgłoszonych
 * przez prowadzących); grupa włączona → ekran „Sprawy do decyzji” nowego
 * frontu (`frontend/nowy-front/sprawy/`), który niesie też sekcję spraw
 * zgłoszonych przez prowadzących. Jedyny `main#tresc` daje powłoka układu
 * administracji; `DostawcaPowloki` mówi szablonowi ekranu, żeby nie dokładał
 * drugiego.
 */
export default function AdminSupervisionCasesPage() {
  if (!GRUPY.sprawy.wlaczona) return <StaraTresc />;

  return (
    <div data-theme="light">
      <DostawcaPowloki>
        <Sprawy />
      </DostawcaPowloki>
    </div>
  );
}
