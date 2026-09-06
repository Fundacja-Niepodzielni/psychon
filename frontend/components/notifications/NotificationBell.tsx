"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, apiPaged } from "@/lib/api";
import type { NotificationItem } from "@/lib/notifications/types";

const POLL_INTERVAL_MS = 30_000;

function formatRelativeTime(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return "przed chwilą";
  if (diffMin < 60) return `${diffMin} min temu`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} godz. temu`;
  return `${Math.round(diffH / 24)} dni temu`;
}

/** Dzwonek powiadomień w nagłówku (pakiet H16) — obecny we wszystkich panelach. */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Łańcuch .then/.catch (bez async/await) celowo — setState musi żyć w
  // zagnieżdżonym callbacku, inaczej efekt niżej łapie regułę
  // react-hooks/set-state-in-effect ("Avoid calling setState() directly
  // within an effect").
  const loadNotifications = useCallback(() => {
    return apiPaged<NotificationItem>("/notifications?per_page=20")
      .then(({ data, meta }) => {
        setItems(data);
        const extraUnread = meta?.extra?.unread;
        setUnread(typeof extraUnread === "number" ? extraUnread : 0);
        setLoaded(true);
      })
      .catch(() => {
        // cichy błąd — dzwonek nie blokuje reszty panelu, spróbujemy przy kolejnym pollu
      });
  }, []);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  useEffect(() => {
    if (!open) return;

    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) {
      setLoading(true);
      await loadNotifications();
      setLoading(false);
    }
  }

  function markLocallyRead(id: number) {
    setItems((prev) =>
      prev.map((n) =>
        n.id === id && n.read_at === null
          ? { ...n, read_at: new Date().toISOString() }
          : n,
      ),
    );
    setUnread((u) => Math.max(0, u - 1));
  }

  async function handleItemClick(item: NotificationItem) {
    setOpen(false);
    if (item.read_at === null) {
      markLocallyRead(item.id);
      try {
        await api(`/notifications/${item.id}/read`, { method: "POST" });
      } catch {
        // licznik i tak odświeży się przy kolejnym pollu
      }
    }
  }

  async function handleMarkAll() {
    if (unread === 0) return;
    setItems((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })),
    );
    setUnread(0);
    try {
      await api("/notifications/read-all", { method: "POST" });
    } catch {
      loadNotifications();
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={
          unread > 0
            ? `Powiadomienia, ${unread} nieprzeczytanych`
            : "Powiadomienia"
        }
        className="relative flex size-10 items-center justify-center rounded-pill text-subtle transition-colors duration-200 hover:bg-grey hover:text-ink focus-visible:focus-ring"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5"
          aria-hidden="true"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 flex min-w-[1.1rem] items-center justify-center rounded-pill bg-danger px-1 text-[0.65rem] font-bold leading-[1.1rem] text-light"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Lista powiadomień"
          className="absolute right-0 top-12 z-50 w-[22rem] max-w-[90vw] rounded-md border border-line bg-card shadow-card"
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <p className="text-small font-bold text-ink">Powiadomienia</p>
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={unread === 0}
              className="text-caption font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-subtle disabled:no-underline"
            >
              Oznacz wszystkie jako przeczytane
            </button>
          </div>

          <div className="max-h-[24rem] overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-small text-subtle">
                Wczytywanie…
              </p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-small text-subtle">
                Brak powiadomień.
              </p>
            ) : (
              <ul>
                {items.map((item) => {
                  const isUnread = item.read_at === null;
                  const body = (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`text-small ${
                            isUnread
                              ? "font-bold text-ink"
                              : "font-medium text-muted"
                          }`}
                        >
                          {item.title}
                        </p>
                        {isUnread && (
                          <span
                            aria-hidden="true"
                            className="mt-1 size-2 shrink-0 rounded-pill bg-brand"
                          />
                        )}
                      </div>
                      {item.body && (
                        <p className="mt-1 line-clamp-2 text-caption text-subtle">
                          {item.body}
                        </p>
                      )}
                      <p className="mt-1 text-caption text-subtle">
                        {formatRelativeTime(item.created_at)}
                      </p>
                    </>
                  );

                  return (
                    <li
                      key={item.id}
                      className="border-b border-line last:border-b-0"
                    >
                      {item.link ? (
                        <Link
                          href={item.link}
                          onClick={() => handleItemClick(item)}
                          className={`block px-4 py-3 transition-colors duration-200 hover:bg-grey focus-visible:focus-ring ${
                            isUnread ? "bg-brand-10" : ""
                          }`}
                        >
                          {body}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleItemClick(item)}
                          className={`block w-full px-4 py-3 text-left transition-colors duration-200 hover:bg-grey focus-visible:focus-ring ${
                            isUnread ? "bg-brand-10" : ""
                          }`}
                        >
                          {body}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
