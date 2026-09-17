"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Powrót fokusu na pierwsze błędne pole po odmowie serwera (Z-15, C1).
 *
 * Po odpowiedzi 422 ekran pokazuje komunikaty przy polach, ale fokus zostaje
 * na przycisku wysyłki — osoba korzystająca z klawiatury albo czytnika ekranu
 * musi sama szukać, co jest nie tak. Ten hook oddaje referencję do obszaru
 * formularza i po każdej nowej porcji błędów ustawia fokus na pierwszej
 * kontrolce z `aria-invalid="true"`, czyli na pierwszym błędnym polu w
 * kolejności dokumentu.
 *
 * Mechanizm stoi na `aria-invalid`, a nie na nazwach pól, bo to samo
 * oznaczenie niosą już `Input`, `Select` i pola pisane ręcznie — dzięki temu
 * jedno miejsce w kodzie obsługuje każdy formularz i nie trzeba trzymać
 * mapy nazwa pola na identyfikator.
 *
 * Udana wysyłka nie przenosi fokusu: pusty zbiór błędów nic nie robi.
 */
export default function useFokusPoOdmowie<
  T extends HTMLElement = HTMLFormElement,
>(bledyPol: Record<string, string[]> | undefined): RefObject<T | null> {
  const obszar = useRef<T>(null);

  useEffect(() => {
    if (!bledyPol || Object.keys(bledyPol).length === 0) return;

    const element = obszar.current;
    if (!element) return;

    const pole = element.querySelector<HTMLElement>(
      '[aria-invalid="true"]:not([disabled])',
    );
    if (!pole || pole === document.activeElement) return;

    pole.focus();
  }, [bledyPol]);

  return obszar;
}
