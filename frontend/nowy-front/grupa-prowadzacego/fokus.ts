"use client";

import { useEffect } from "react";

/**
 * Po otwarciu panelu fokus idzie na jego nagłówek, nigdy na przycisk akcji: czytnik ekranu
 * ogłasza, co się otworzyło, a przypadkowy Enter niczego nie wysyła. Nagłówek dostaje
 * `tabindex="-1"` (można go sfokusować programowo, ale nie jest przystankiem Tab).
 * Wywołanie przy montowaniu panelu; `idNaglowka` to `id` elementu `Heading`. Panel, który pojawia się
 * sam (np. po wczytaniu danych), a nie po działaniu osoby, wywołuje hak z `aktywny = false` i fokusu nie zabiera.
 */
export function useFokusNaNaglowku(idNaglowka: string, aktywny = true): void {
  useEffect(() => {
    if (!aktywny) return;
    const naglowek = document.getElementById(idNaglowka);
    if (naglowek === null) return;
    naglowek.setAttribute("tabindex", "-1");
    naglowek.focus();
  }, [idNaglowka, aktywny]);
}
