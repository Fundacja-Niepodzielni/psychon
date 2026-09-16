import Link from "next/link";

export interface PanelNavItem {
  label: string;
  href: string;
}

export interface PanelNavGroup {
  /** Nazwa grupy (Z-16: dłuższa lista grupowana w nazwane sekcje). Grupa bez
   * nazwy renderuje się bez nagłówka — dla pojedynczej płaskiej listy. */
  label?: string;
  items: PanelNavItem[];
}

export interface PanelNavProps {
  /** Grupy pozycji już przefiltrowane po roli przez wołający ekran (Z-7) —
   * ten komponent nie czyta rejestru menu sam i niczego nie ukrywa na
   * podstawie własnej wiedzy o roli. */
  groups: PanelNavGroup[];
  /** Ścieżka bieżącego ekranu — decyduje o `aria-current`. */
  currentPath: string;
  navLabel?: string;
  className?: string;
}

/**
 * `PanelNav` (S0) — organizm C2 wariant C: pasek nawigacji panelu, wyłącznie
 * prezentacyjny. Grupowanie wspiera Z-16 (menu w pamięci roboczej: do 5
 * pozycji najwyższego poziomu, dłuższe listy w nazwanych sekcjach); filtr po
 * roli zostaje po stronie serwera i wołającego ekranu (Z-7).
 */
export default function PanelNav({
  groups,
  currentPath,
  navLabel = "Nawigacja panelu",
  className = "",
}: PanelNavProps) {
  return (
    <nav aria-label={navLabel} className={`flex flex-col gap-5 ${className}`}>
      {groups.map((group, index) => (
        <div key={group.label ?? `grupa-${index}`} className="flex flex-col gap-1">
          {group.label && (
            <p className="px-3 text-caption font-bold uppercase tracking-wide text-subtle">
              {group.label}
            </p>
          )}
          <ul className="flex flex-col gap-1">
            {group.items.map((item) => {
              const isCurrent = currentPath === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isCurrent ? "page" : undefined}
                    className={`flex min-h-11 items-center rounded-sm px-3 text-small font-medium transition-colors duration-200 focus-visible:focus-ring ${
                      isCurrent
                        ? "bg-brand-10 text-primary"
                        : "text-body hover:bg-grey"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
