import "@/design-system/tokeny/tokeny.css";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import { Dokumenty } from "@/nowy-front/certyfikat-dokumenty/Dokumenty";
import StaraTresc from "./StaraTresc";

/**
 * Trasa `/panel/dokumenty` — dokumenty uczestnika (H14). Adres się nie zmienia: strona czyta
 * rejestr przełączenia (`lib/przelaczenie/grupy.ts`, grupa `dokumentyUczestnika`). Grupa
 * wyłączona → dotychczasowa treść (`StaraTresc.tsx`, przeniesiona bez zmiany); grupa włączona →
 * ekran nowego frontu w ramce panelu uczestnika.
 */
export default function StronaDokumentow() {
  if (!GRUPY.dokumentyUczestnika.wlaczona) return <StaraTresc />;

  return (
    <div data-theme="light">
      <DostawcaPowloki>
        <Dokumenty />
      </DostawcaPowloki>
    </div>
  );
}
