import Link from "next/link";

export interface BreadcrumbItem {
  label: string;
  /** Brak `href` = pozycja nieklikalna (używane też dla ostatniego elementu). */
  href?: string;
}

export interface BreadcrumbsProps {
  /** Kolejność od korzenia do bieżącego ekranu; ostatni element = strona. */
  items: BreadcrumbItem[];
  className?: string;
}

/**
 * `Breadcrumbs` — molekuła C2 wariant C: okruszki nawigacji. `nav` z
 * `aria-label`, ostatni element `aria-current="page"` i bez odnośnika (nie
 * prowadzi nigdzie — to bieżący ekran). Wpina się jako opcjonalny slot
 * `PageHeader.breadcrumbs`, bez zmiany dotychczasowego API tej molekuły.
 */
export default function Breadcrumbs({ items, className = "" }: BreadcrumbsProps) {
  return (
    <nav aria-label="Okruszki nawigacji" className={className}>
      <ol className="flex flex-wrap items-center gap-2 text-small text-muted">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-2">
              {index > 0 && (
                <span aria-hidden="true" className="text-subtle">
                  /
                </span>
              )}
              {!isLast && item.href ? (
                <Link
                  href={item.href}
                  className="inline-flex min-h-11 items-center rounded-xs text-muted hover:text-ink focus-visible:focus-ring"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={isLast ? "font-medium text-ink" : ""}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
