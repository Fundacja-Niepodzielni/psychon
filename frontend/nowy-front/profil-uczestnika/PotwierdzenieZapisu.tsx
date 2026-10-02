"use client";

import { useEffect, useRef } from "react";
import { Toast } from "@/design-system/molekuly/Toast/Toast";

interface WlasciwosciPotwierdzeniaZapisu {
  komunikat: string;
  onZamknij: () => void;
  /** Identyfikator elementu, na który wraca fokus, gdy potwierdzenie znika z fokusem w środku. */
  idPowrotuFokusu: string;
}

/**
 * Wspólny pasek potwierdzenia (`Toast`) po zapisie, z fokusem: po zapisie fokus trafia
 * na samo potwierdzenie (czytnik ekranu odczytuje je od razu), a gdy potwierdzenie znika
 * — po czasie albo po zamknięciu — z fokusem w środku, fokus wraca na wskazany element
 * (przycisk zapisu), zamiast spaść na początek strony. `Toast` nie przyjmuje fokusu, więc
 * ten element dostaje `tabindex="-1"` tutaj, nie w molekule.
 */
export function PotwierdzenieZapisu({ komunikat, onZamknij, idPowrotuFokusu }: WlasciwosciPotwierdzeniaZapisu) {
  const korzen = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pasek = korzen.current?.querySelector<HTMLElement>('[role="status"]');
    if (!pasek) return;
    pasek.setAttribute("tabindex", "-1");
    pasek.focus();
  }, []);

  function zamknij() {
    const mialFokus = korzen.current?.contains(document.activeElement) ?? false;
    onZamknij();
    if (mialFokus) document.getElementById(idPowrotuFokusu)?.focus();
  }

  return (
    <div ref={korzen}>
      <Toast komunikat={komunikat} onZamknij={zamknij} />
    </div>
  );
}
