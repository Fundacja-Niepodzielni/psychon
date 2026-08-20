/** Pojedynczy wpis menu panelu. Jeden plik = jeden wpis = jeden pakiet. */
export interface MenuEntry {
  /** Etykieta po polsku, np. "Kursy". */
  label: string;
  /** Ścieżka, np. "/panel/kursy". */
  href: string;
  /** Kolejność w menu (mniejsze = wyżej). Trzymaj odstępy co 10. */
  order: number;
}

export function sortMenu(entries: MenuEntry[]): MenuEntry[] {
  return [...entries].sort((a, b) => a.order - b.order);
}
