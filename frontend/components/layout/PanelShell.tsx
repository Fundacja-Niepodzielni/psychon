"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { api, clearToken } from "@/lib/api";
import type { MenuEntry } from "@/lib/menu/types";

export interface PanelShellProps {
  /** Nazwa panelu, np. "Panel uczestnika". */
  panelName: string;
  menu: MenuEntry[];
  children: React.ReactNode;
}

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

/**
 * Wspólny szkielet paneli: sidebar z menu (rejestr per panel),
 * nagłówek z miejscem na dzwonek powiadomień (pakiet H16) i wylogowaniem.
 */
export default function PanelShell({
  panelName,
  menu,
  children,
}: PanelShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // token i tak czyścimy lokalnie
    }
    clearToken();
    router.push("/logowanie");
  }

  return (
    <div className="flex min-h-screen flex-col bg-page lg:flex-row">
      <a
        href="#tresc"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-card focus:px-4 focus:py-2 focus:shadow-card focus-visible:focus-ring"
      >
        Przejdź do treści
      </a>

      {/* Sidebar */}
      <aside className="border-b border-line bg-card lg:w-[260px] lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2 px-6 py-5">
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-sm bg-brand text-h4 font-black text-light"
          >
            N
          </span>
          <div className="leading-tight">
            <p className="text-body font-black text-ink">Niepodzielni</p>
            <p className="text-caption text-subtle">{panelName}</p>
          </div>
        </div>
        <nav aria-label={`Menu — ${panelName}`} className="px-3 pb-4">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {menu.map((entry) => {
              const active = isActive(pathname, entry.href);
              return (
                <li key={entry.href}>
                  <Link
                    href={entry.href}
                    aria-current={active ? "page" : undefined}
                    className={`block whitespace-nowrap rounded-sm px-4 py-2.5 text-small font-medium transition-colors duration-200 focus-visible:focus-ring ${
                      active
                        ? "bg-brand-10 text-primary"
                        : "text-muted hover:bg-grey hover:text-ink"
                    }`}
                  >
                    {entry.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* Prawa kolumna: nagłówek + treść */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-end gap-3 border-b border-line bg-card px-6 shadow-header lg:h-20">
          {/* Miejsce na dzwonek powiadomień — dostarczy pakiet H16 */}
          <button
            type="button"
            disabled
            title="Powiadomienia (wkrótce — pakiet H16)"
            aria-label="Powiadomienia (wkrótce — pakiet H16)"
            className="flex size-10 items-center justify-center rounded-pill text-subtle opacity-50 focus-visible:focus-ring"
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
          </button>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="rounded-pill border border-line px-4 py-2 text-small font-medium text-muted transition-colors duration-200 hover:bg-grey hover:text-ink focus-visible:focus-ring disabled:opacity-50"
          >
            {loggingOut ? "Wylogowywanie…" : "Wyloguj się"}
          </button>
        </header>

        <main id="tresc" className="mx-auto w-full max-w-[1200px] flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
