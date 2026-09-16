"use client";

import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/molecules/EmptyState";
import ErrorState from "@/components/molecules/ErrorState";
import LoadingState from "@/components/molecules/LoadingState";
import type { NotificationItem } from "@/lib/notifications/types";

export interface NotificationListProps {
  items: NotificationItem[];
  loading?: boolean;
  /** Komunikat błędu — gdy podany, lista renderuje `ErrorState` zamiast
   * pozycji (niezależnie od `items`). */
  error?: string | null;
  onRetry?: () => void;
  onItemClick?: (item: NotificationItem) => void;
  /** Wyłącza interakcję z pozycjami (np. trwa zbiorcza operacja) — pozycje
   * zostają widoczne, ale nieklikalne. */
  disabled?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL");
}

/**
 * `NotificationList` — organizm C2 wariant C: lista powiadomień. Przeczytane
 * / nieprzeczytane oznaczone słowem i kolorem naraz (Z-1 — kolor nigdy sam),
 * stan pusty przez `EmptyState`, ładowanie przez `LoadingState`, błąd przez
 * `ErrorState` (Z-6: trzy stany niepomyślne, każdy z akcją tam, gdzie ma
 * sens).
 */
export default function NotificationList({
  items,
  loading = false,
  error = null,
  onRetry,
  onItemClick,
  disabled = false,
  emptyTitle = "Brak powiadomień",
  emptyDescription = "Nowe powiadomienia pojawią się tutaj.",
  className = "",
}: NotificationListProps) {
  if (loading) {
    return <LoadingState label="Wczytywanie powiadomień…" className={className} />;
  }
  if (error) {
    return <ErrorState message={error} onRetry={onRetry} className={className} />;
  }
  if (items.length === 0) {
    return (
      <EmptyState title={emptyTitle} description={emptyDescription} className={className} />
    );
  }

  return (
    <ul className={`flex flex-col gap-2 ${className}`}>
      {items.map((item) => {
        const isUnread = item.read_at === null;
        return (
          <li key={item.id} className="overflow-hidden rounded-sm border border-line bg-card">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onItemClick?.(item)}
              className="flex min-h-11 w-full flex-col items-start gap-1 px-4 py-3 text-left transition-colors duration-200 hover:bg-grey focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-small font-bold text-ink">{item.title}</span>
                <Badge variant={isUnread ? "info" : "neutral"}>
                  {isUnread ? "Nieprzeczytane" : "Przeczytane"}
                </Badge>
              </div>
              {item.body && (
                <span className="text-caption text-subtle">{item.body}</span>
              )}
              <span className="text-caption text-subtle">{formatDate(item.created_at)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
