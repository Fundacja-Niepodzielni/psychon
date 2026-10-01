"use client";

import { useId } from "react";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { ListaPlikow } from "./ListaPlikow";
import type { PlikKursu } from "./dane";
import style from "./PlikiKursu.module.css";

interface WlasciwosciPlikiLekcji {
  /** Wyłącznie pliki tej lekcji. */
  pliki: PlikKursu[];
  odswiez?: () => Promise<PlikKursu[] | null>;
}

/**
 * Karta „Pliki do pobrania” na ekranie lekcji. Lekcja bez plików: nic nie
 * renderuje — karta nie zajmuje miejsca.
 */
export function PlikiLekcji({ pliki, odswiez }: WlasciwosciPlikiLekcji) {
  const idNaglowka = useId();
  if (pliki.length === 0) return null;

  return (
    <section className={style.sekcja} aria-labelledby={idNaglowka}>
      <Heading stopien={2} id={idNaglowka}>
        Pliki do pobrania
      </Heading>
      <ListaPlikow pliki={pliki} odswiez={odswiez} />
    </section>
  );
}
