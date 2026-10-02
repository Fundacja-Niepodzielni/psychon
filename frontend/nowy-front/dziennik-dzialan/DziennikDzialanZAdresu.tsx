"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { idZAdresu } from "./dane";
import { DziennikDzialan } from "./DziennikDzialan";

/**
 * Dziennik działań z osobą ze znacznika „Dotyczy” wziętą z adresu
 * (`?dotyczy=<id>` — wejście z karty osoby). Usunięcie znacznika zdejmuje
 * parametr z adresu, bez przeładowania strony; reszta adresu zostaje.
 */
export function DziennikDzialanZAdresu() {
  const parametry = useSearchParams();
  const sciezka = usePathname();
  const router = useRouter();
  const dotyczy = idZAdresu(parametry.get("dotyczy"));

  function usunDotyczy() {
    const pozostale = new URLSearchParams(parametry.toString());
    pozostale.delete("dotyczy");
    const zapytanie = pozostale.toString();
    router.replace(zapytanie === "" ? sciezka : `${sciezka}?${zapytanie}`);
  }

  return <DziennikDzialan dotyczy={dotyczy} onUsunDotyczy={usunDotyczy} />;
}
