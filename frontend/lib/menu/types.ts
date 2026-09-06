import type { ComponentType } from "react";

/** Ikona wpisu menu — komponent SVG przyjmujący `className`. */
export type MenuIcon = ComponentType<{ className?: string }>;

/**
 * Nazwa ikony wpisu menu. Rejestr jest zwykłymi danymi (bez referencji do
 * komponentów), więc `participantMenu` bezpiecznie przechodzi z warstwy serwera
 * do klienckiego `PanelShell`. Mapowanie nazwa → SVG: components/layout/menu-icons.tsx.
 */
export type MenuIconName =
  | "rocket"
  | "dashboard"
  | "book"
  | "users"
  | "clipboard-list"
  | "lifebuoy"
  | "file-text"
  | "award"
  | "badge-check"
  | "user";

/** Pojedynczy wpis menu panelu. Jeden plik = jeden wpis = jeden pakiet. */
export interface MenuEntry {
  /** Etykieta po polsku, np. "Kursy". */
  label: string;
  /** Ścieżka, np. "/panel/kursy". */
  href: string;
  /** Kolejność w menu (mniejsze = wyżej). Trzymaj odstępy co 10. */
  order: number;
  /** Nazwa ikony przy etykiecie (opcjonalna). Lista: MenuIconName. */
  icon?: MenuIconName;
}

export function sortMenu(entries: MenuEntry[]): MenuEntry[] {
  return [...entries].sort((a, b) => a.order - b.order);
}
