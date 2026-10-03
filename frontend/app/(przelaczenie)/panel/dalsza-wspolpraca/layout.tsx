import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { GRUPY, czyNowaTrasaDostepna } from "@/lib/przelaczenie/grupy";
import { StraznikUczestnika } from "@/nowy-front/wspolne/straznik-uczestnika";

/**
 * Układ trasy `/panel/dalsza-wspolpraca`. Dopóki grupa przełączenia `wspolpraca` jest wyłączona,
 * serwer odpowiada 404 tutaj, zanim zadziała `StraznikUczestnika` (strażnik czeka na odczyt konta
 * w przeglądarce). Treść widzi osoba z rolą uczestnika; pozostali widzą ekran „Nie masz dostępu do
 * tego ekranu”.
 */
export default function UkladDalszejWspolpracy({ children }: { children: ReactNode }) {
  if (!czyNowaTrasaDostepna(GRUPY.wspolpraca)) notFound();

  return <StraznikUczestnika>{children}</StraznikUczestnika>;
}
