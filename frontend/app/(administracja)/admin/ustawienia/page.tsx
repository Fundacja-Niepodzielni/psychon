import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import { UstawieniaEdycji } from "@/nowy-front/ustawienia-edycji/UstawieniaEdycji";
import StaraTresc from "./StaraTresc";

/**
 * Trasa `/admin/ustawienia` — ustawienia edycji (H19). Adres się nie zmienia:
 * strona czyta rejestr przełączenia (`lib/przelaczenie/grupy.ts`, grupa
 * `ustawieniaProgramu`). Grupa wyłączona → dotychczasowa treść
 * (`StaraTresc.tsx`, przeniesiona bez zmiany); grupa włączona → ekran nowego
 * frontu w powłoce panelu administracji. Strona starej wersji nie miała
 * własnego tytułu karty, więc nowa też nie ma.
 */
export default function StronaUstawienEdycji() {
  if (!GRUPY.ustawieniaProgramu.wlaczona) return <StaraTresc />;

  return (
    <DostawcaPowloki>
      <UstawieniaEdycji />
    </DostawcaPowloki>
  );
}
