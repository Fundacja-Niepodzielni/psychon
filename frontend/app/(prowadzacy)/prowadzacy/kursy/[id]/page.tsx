import "@/design-system/tokeny/tokeny.css";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import { EkranKursuZAdresu } from "./EkranKursuZAdresu";
import StaraTresc from "./StaraTresc";

/**
 * Trasa `/prowadzacy/kursy/[id]` — kurs w panelu prowadzącego. Adres się nie
 * zmienia: strona czyta rejestr przełączenia (`lib/przelaczenie/grupy.ts`,
 * grupa `kurs`). Grupa wyłączona → dotychczasowa treść (`StaraTresc.tsx`,
 * przeniesiona bez zmiany); grupa włączona → ten sam ekran kursu co
 * w administracji (`nowy-front/kurs-administracji/`) w roli prowadzącego,
 * w powłoce panelu. `params` to Promise (Next.js 16) — odpakowuje go
 * komponent kliencki, więc strona nie czeka na niego sama.
 */
export default function StronaKursuProwadzacego({ params }: { params: Promise<{ id: string }> }) {
  if (!GRUPY.kurs.wlaczona) return <StaraTresc params={params} />;

  return (
    <div data-theme="light">
      <DostawcaPowloki>
        <EkranKursuZAdresu params={params} />
      </DostawcaPowloki>
    </div>
  );
}
