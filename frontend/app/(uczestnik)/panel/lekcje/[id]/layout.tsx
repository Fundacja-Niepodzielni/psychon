import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { StraznikUczestnika } from "@/nowy-front/wspolne/straznik-uczestnika";
import { identyfikatorLekcji } from "./identyfikator-lekcji";

/**
 * Układ ekranu lekcji `/panel/lekcje/[id]`. Niepoprawny identyfikator kończy się odpowiedzią 404
 * serwera tutaj, zanim zadziała `StraznikUczestnika`: strażnik czeka na odczyt konta w przeglądarce,
 * więc decyzja schowana pod nim zapadałaby dopiero tam. Treść ekranu widzi osoba z rolą uczestnika
 * (personel i prowadzący w trybie podglądu); pozostali widzą ekran „Nie masz dostępu do tego ekranu”.
 */
export default async function UkladLekcji({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (identyfikatorLekcji(id) === null) notFound();

  return <StraznikUczestnika>{children}</StraznikUczestnika>;
}
