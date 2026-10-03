import "@/design-system/tokeny/tokeny.css";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import { PowiadomieniaEmail } from "@/nowy-front/powiadomienia-email/PowiadomieniaEmail";
import StaraTresc from "./StaraTresc";

/**
 * Trasa `/admin/emails` — ekran „Powiadomienia” (H16). Adres się nie zmienia:
 * strona czyta rejestr przełączenia (`lib/przelaczenie/grupy.ts`, grupa
 * `powiadomienia`). Grupa wyłączona → dotychczasowa skrzynka e-maili
 * (`StaraTresc.tsx`, przeniesiona bez zmiany); grupa włączona → ekran nowego
 * frontu w powłoce panelu administracji. Dostęp ma wyłącznie administracja
 * (`project_manager`, `super_admin`): strażnik ról stoi w układzie
 * `(administracja)/admin/layout.tsx` nad każdą stroną tej grupy tras.
 */
export default function StronaPowiadomien() {
  if (!GRUPY.powiadomienia.wlaczona) return <StaraTresc />;

  return (
    <div data-theme="light">
      <DostawcaPowloki>
        <PowiadomieniaEmail />
      </DostawcaPowloki>
    </div>
  );
}
