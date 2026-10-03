import "@/design-system/tokeny/tokeny.css";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import { Certyfikat } from "@/nowy-front/certyfikat-dokumenty/Certyfikat";
import StaraTresc from "./StaraTresc";

/**
 * Trasa `/panel/certyfikat` — certyfikat ukończenia programu (H13). Adres się nie zmienia:
 * strona czyta rejestr przełączenia (`lib/przelaczenie/grupy.ts`, grupa `certyfikat`).
 * Grupa wyłączona → dotychczasowa treść (`StaraTresc.tsx`, przeniesiona bez zmiany);
 * grupa włączona → ekran nowego frontu w ramce panelu uczestnika. Dostęp roli rozstrzyga
 * układ tej trasy (`layout.tsx`), więc obie wersje dostają tę samą bramkę.
 */
export default function StronaCertyfikatu() {
  if (!GRUPY.certyfikat.wlaczona) return <StaraTresc />;

  return (
    <div data-theme="light">
      <DostawcaPowloki>
        <Certyfikat />
      </DostawcaPowloki>
    </div>
  );
}
