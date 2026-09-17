import type { ComponentType } from "react";
import type { Role } from "@/lib/home-by-role";

/** Ikona wpisu menu — komponent SVG przyjmujący `className` i `aria-hidden`. */
export type MenuIcon = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;

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
  | "clipboard-check"
  | "lifebuoy"
  | "file-text"
  | "award"
  | "badge-check"
  | "user"
  | "clock"
  | "messages"
  | "folder"
  | "mail"
  | "chart"
  | "history"
  | "layout"
  | "settings"
  | "flag"
  | "home"
  | "question";

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
   * Wpis jest korzeniem sekcji roli (`href` całej sekcji, np. `/admin`).
   * Bez tego pola taki `href` byłby przedrostkiem KAŻDEJ podstrony sekcji
   * i zaznaczałby się razem z właściwym wpisem podstrony. Z `exact:
   * true` wpis jest aktywny wyłącznie wtedy, gdy adres pasuje dokładnie.
   */
  exact?: boolean;
  /**
   * Role dopuszczone do tego wpisu (opcjonalne). Brak pola = wpis widoczny
   * dla każdej roli panelu, tak jak dotąd. API i tak odmawia po swojej
   * stronie — to pole tylko chowa link tam, gdzie odpowiedź byłaby 403.
   */
  roles?: Role[];
  /**
   * Identyfikator sekcji menu (np. "nauka"). Sekcje panelu są opisane w jego
   * `index.ts` (`MenuSection[]`). Brak pola = wpis stoi nad sekcjami, bez
   * nagłówka (np. Pulpit, Start).
   */
  section?: string;
}

/** Nazwana sekcja menu panelu. Kolejność sekcji wg `order`. */
export interface MenuSection {
  id: string;
  label: string;
  order: number;
}

/** Grupa gotowa do wyświetlenia: bez `id` i `label` = lista bez nagłówka. */
export interface MenuGroup {
  id?: string;
  label?: string;
  entries: MenuEntry[];
}

/**
 * Powyżej tylu widocznych wpisów menu dzieli się na sekcje. Krótsze menu
 * zostaje jedną listą — nagłówki przy kilku pozycjach tylko przeszkadzają.
 */
export const SECTION_THRESHOLD = 7;

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

/**
 * Układa widoczne wpisy w grupy do wyświetlenia. Wpisy bez sekcji (oraz
 * z sekcją, której panel nie opisuje — żeby żaden link nie zniknął) idą
 * na górę bez nagłówka. Sekcja bez widocznych wpisów nie powstaje, więc
 * nie ma też jej nagłówka. Filtr po roli robi wcześniej `filterMenuByRole`.
 */
export function groupMenu(entries: MenuEntry[], sections: MenuSection[] = []): MenuGroup[] {
  const sorted = sortMenu(entries);
  if (sorted.length === 0) return [];
  if (sorted.length <= SECTION_THRESHOLD || sections.length === 0) {
    return [{ entries: sorted }];
  }
  const known = new Set(sections.map((s) => s.id));
  const top = sorted.filter((e) => !e.section || !known.has(e.section));
  const groups: MenuGroup[] = top.length > 0 ? [{ entries: top }] : [];
  for (const section of [...sections].sort((a, b) => a.order - b.order)) {
    const inSection = sorted.filter((e) => e.section === section.id);
    if (inSection.length > 0) {
      groups.push({ id: section.id, label: section.label, entries: inSection });
    }
  }
  return groups;
}
