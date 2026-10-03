"use client";

import { useSyncExternalStore } from "react";

/** Zapytanie o szerokość, poniżej której filtry listy są zwinięte do jednego wiersza. */
export const ZAPYTANIE_TELEFONU = "(max-width: 599px)";

function subskrybuj(naZmiane: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const lista = window.matchMedia(ZAPYTANIE_TELEFONU);
  lista.addEventListener("change", naZmiane);
  return () => lista.removeEventListener("change", naZmiane);
}

function odczytaj(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(ZAPYTANIE_TELEFONU).matches
    : false;
}

/**
 * Czy okno jest węższe niż 600 px. Dla ekranów, których filtr na telefonie ma
 * inną budowę niż na komputerze (a nie tylko inny układ tej samej treści) —
 * tam, gdzie wystarcza układ, wzorzec robi to samym CSS. Bez `matchMedia`
 * (jsdom, render po stronie serwera) ekran uznaje układ szeroki.
 */
export function useUkladTelefonu(): boolean {
  return useSyncExternalStore(subskrybuj, odczytaj, () => false);
}
