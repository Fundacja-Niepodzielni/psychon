import { redirect } from "next/navigation";
import PoProgramieStaraTresc from "./StaraTresc";
import { adresPrzekierowaniaPoProgramie } from "./przekierowanie";

/**
 * Stara trasa produktu `/panel/po-programie`. Bramka
 * czyta rejestr przełączenia (`lib/przelaczenie/grupy.ts`, grupa
 * `wspolpraca`): grupa wyłączona (dziś, na tej gałęzi) → renderuje dokładnie
 * starą treść (`StaraTresc.tsx`, przeniesioną bez zmiany); grupa włączona →
 * przekierowuje na nową trasę produktu, bez 404. Serwerowy `redirect()` z
 * `next/navigation` (Server Component, żadnych hooków w tym pliku) — ten sam
 * powód co przy każdej innej trasie tego mechanizmu: warunek jest stały na
 * całą gałąź/build, nie zmienia się między renderami jednego działającego
 * procesu.
 */
export default function PoProgramiePage() {
  const adres = adresPrzekierowaniaPoProgramie();
  if (adres !== null) redirect(adres);

  return <PoProgramieStaraTresc />;
}
