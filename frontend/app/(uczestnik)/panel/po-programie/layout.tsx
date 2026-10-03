import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { StraznikUczestnika } from "@/nowy-front/wspolne/straznik-uczestnika";
import { adresPrzekierowaniaPoProgramie } from "./przekierowanie";

/**
 * Układ starej trasy `/panel/po-programie`. Przekierowanie na nową trasę (grupa przełączenia
 * `wspolpraca` włączona) zapada tutaj, po stronie serwera, zanim zadziała `StraznikUczestnika`:
 * strażnik czeka na odczyt konta w przeglądarce, więc decyzja schowana pod nim zapadałaby dopiero
 * tam. Treść widzi osoba z rolą uczestnika; pozostali widzą ekran „Nie masz dostępu do tego ekranu”.
 */
export default function UkladPoProgramie({ children }: { children: ReactNode }) {
  const adres = adresPrzekierowaniaPoProgramie();
  if (adres !== null) redirect(adres);

  return <StraznikUczestnika>{children}</StraznikUczestnika>;
}
