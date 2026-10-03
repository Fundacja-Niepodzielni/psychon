import type { Metadata } from "next";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import DeklaracjaNowyEkran from "./NowyEkran";
import DeklaracjaStaraTresc from "./StaraTresc";

export const metadata: Metadata = {
  title: "Deklaracja dostępności — Niepodzielni",
};

/**
 * Trasa `/deklaracja-dostepnosci` — deklaracja dostępności. Adres się nie zmienia: strona czyta rejestr przełączenia
 * (`lib/przelaczenie/grupy.ts`, grupa `dokumentyPubliczne`). Grupa wyłączona → dotychczasowa treść
 * (`StaraTresc.tsx`, przeniesiona bez zmiany); grupa włączona → ekran nowego frontu
 * na szablonie strony publicznej (`NowyEkran.tsx`).
 */
export default function StronaDeklaracja() {
  return GRUPY.dokumentyPubliczne.wlaczona ? <DeklaracjaNowyEkran /> : <DeklaracjaStaraTresc />;
}
