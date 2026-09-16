import type { ComponentType } from "react";
import type { Role } from "@/lib/home-by-role";

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
  /**
   * Role dopuszczone do tego wpisu (opcjonalne). Brak pola = wpis widoczny
   * dla każdej roli panelu, tak jak dotąd. API i tak odmawia po swojej
   * stronie — to pole tylko chowa link tam, gdzie odpowiedź byłaby 403.
   */
  roles?: Role[];
}

export function sortMenu(entries: MenuEntry[]): MenuEntry[] {
  return [...entries].sort((a, b) => a.order - b.order);
}

/**
 * Zostawia tylko wpisy dopuszczone dla `role`. Wpis bez `roles` przechodzi
 * zawsze. Wpis z `roles` wymaga JUŻ ZNANEJ, pasującej roli — dopóki `role`
 * jest `undefined` (np. trwa odczyt `/me`), taki wpis zostaje schowany,
 * zamiast pokazać się na chwilę wszystkim.
 */
export function filterMenuByRole(
  entries: MenuEntry[],
  role: Role | undefined,
): MenuEntry[] {
  return entries.filter(
    (entry) => !entry.roles || (role !== undefined && entry.roles.includes(role)),
  );
}
