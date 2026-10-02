"use client";

import { useTrybPodgladu } from "@/nowy-front/wspolne/tryb-podgladu";
import { KursUczestnika } from "./KursUczestnika";

/**
 * Strona kursu z trybem podglądu rozstrzyganym z adresu: parametr podglądu
 * ORAZ rola personelu albo prowadzącego (rola z odczytu konta, który ramka ma
 * już na stronie). Uczestnik z tym parametrem dostaje zwykły ekran.
 */
export function KursUczestnikaZAdresu({ slug }: { slug: string }) {
  const { podglad, rola } = useTrybPodgladu();
  return <KursUczestnika slug={slug} podglad={podglad} rola={rola} />;
}
