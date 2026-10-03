"use client";

import { useTrybPodgladu } from "@/nowy-front/wspolne/tryb-podgladu";
import { TestUczestnika } from "./TestUczestnika";

/**
 * Ekran testu z trybem podglądu rozstrzyganym z adresu: parametr podglądu
 * ORAZ rola personelu albo prowadzącego — tak samo jak strona kursu
 * (`KursUczestnikaZAdresu`). Uczestnik z tym parametrem dostaje zwykły ekran.
 */
export function TestUczestnikaZAdresu({ slug }: { slug: string }) {
  const { podglad, rola } = useTrybPodgladu();
  return <TestUczestnika slug={slug} podglad={podglad} rola={rola} />;
}
