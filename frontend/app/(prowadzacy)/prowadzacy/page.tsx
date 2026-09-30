import "@/design-system/tokeny/tokeny.css";
import type { Metadata } from "next";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { PulpitProwadzacego } from "@/nowy-front/pulpit-prowadzacego/PulpitProwadzacego";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import StaraTresc from "./StaraTresc";

/**
 * Tytuł dokumentu: przy włączonej grupie — nagłówek ekranu nowej ramki
 * („Pulpit prowadzącego”, para menu/nagłówek ze słownika: „Pulpit”); przy
 * wyłączonej — dotychczasowy tytuł bez zmian.
 */
export const metadata: Metadata = {
  title: GRUPY.pulpitProwadzacego.wlaczona ? "Pulpit prowadzącego — Niepodzielni" : "Panel prowadzącego — Niepodzielni",
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
      <div data-theme="light">
        <DostawcaPowloki>
          <PulpitProwadzacego />
        </DostawcaPowloki>
      </div>
    );
  }

  return <StaraTresc />;
}
