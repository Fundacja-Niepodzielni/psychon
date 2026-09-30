import type { Metadata } from "next";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { PulpitProwadzacego } from "@/nowy-front/pulpit-prowadzacego/PulpitProwadzacego";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import StaraTresc from "./StaraTresc";

export const metadata: Metadata = {
  title: "Panel prowadzącego — Niepodzielni",
};

/**
 * Strona startowa prowadzącego. Adres się nie zmienia: rejestr przełączenia
 * (`lib/przelaczenie/grupy.ts`, grupa `pulpitProwadzacego`) rozstrzyga, co
 * pod nim stoi. Grupa włączona → ekran „Pulpit prowadzącego” nowego frontu,
 * owinięty w `DostawcaPowloki`: jedyny `main#tresc` daje `PanelShell` układu
 * `prowadzacy/layout.tsx`, korzeń ekranu jest zwykłym `div`. Grupa wyłączona →
 * dotychczasowa treść (`StaraTresc`), bez żadnej zmiany.
 */
export default function InstructorHomePage() {
  if (GRUPY.pulpitProwadzacego.wlaczona) {
    return (
      <DostawcaPowloki>
        <PulpitProwadzacego />
      </DostawcaPowloki>
    );
  }

  return <StaraTresc />;
}
