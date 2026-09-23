"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import NotificationBell from "@/components/notifications/NotificationBell";
import PanelNav, { type PanelNavGroup } from "@/components/organisms/PanelNav";
import Logo from "@/components/ui/Logo";
import { menuIcons } from "@/components/layout/menu-icons";
import { endSession } from "@/lib/api";
import { LEGAL_DOCUMENT_LABELS, LEGAL_DOCUMENT_TYPES } from "@/lib/h22/legal-documents";
import { groupMenu, type MenuEntry, type MenuSection } from "@/lib/menu/types";

export interface PanelShellProps {
  /** Nazwa panelu, np. "Panel uczestnika". */
  panelName: string;
  menu: MenuEntry[];
  /** Sekcje menu panelu; używane, gdy widocznych wpisów jest więcej niż 7. */
  sections?: MenuSection[];
  /** Krótka nazwa panelu w kluczu pamięci zwinięcia: `psychon.menu.<menuKey>`. */
  menuKey?: string;
  children: React.ReactNode;
}

function toGroups(menu: MenuEntry[], sections: MenuSection[]): PanelNavGroup[] {
  return groupMenu(menu, sections).map((group) => ({
    id: group.id,
    label: group.label,
    items: group.entries.map((entry) => ({
      label: entry.label,
      href: entry.href,
      exact: entry.exact,
      icon: entry.icon ? menuIcons[entry.icon] : undefined,
    })),
  }));
}

function Brand({ panelName }: { panelName: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Logo className="h-8 w-auto self-start" />
      <p className="text-caption text-muted">{panelName}</p>
    </div>
  );
}

/**
 * Wspólny szkielet paneli: menu boczne (rejestr per panel, sekcje, ikony),
 * na wąskim ekranie menu wysuwane z tymi samymi sekcjami, nagłówek
 * z dzwonkiem powiadomień i wylogowaniem.
 */
export default function PanelShell({
  panelName,
  menu,
  sections = [],
  menuKey,
  children,
}: PanelShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  const groups = toGroups(menu, sections);
  const storageKey = menuKey ? `psychon.menu.${menuKey}` : undefined;
  const navLabel = `Menu — ${panelName}`;

  /**
   * Ten sam wzorzec co ekran „Twoje konto" (`app/konto/page.tsx`): adres
   * wylogowania Kont Niepodzielni (z `id_token_hint`) czytamy PRZED
   * zakończeniem sesji aplikacji — po `endSession()` ciasteczko z tym
   * tokenem już nie istnieje. Bez tej kolejności sesja SSO w Kontach
   * przeżywa, a kolejne logowanie wpuszcza bez pytania o nic.
   */
  async function handleLogout() {
    setLoggingOut(true);
    try {
      const res = await fetch("/api/auth/end-session-url");
      const { url } = (await res.json()) as { url: string };
      await endSession();
      window.location.assign(url);
    } catch {
      await endSession();
      setLoggingOut(false);
      router.push("/logowanie");
    }
  }

  /** Okno menu istnieje tylko, gdy jest otwarte — otwiera się jako modalne. */
  function attachDialog(el: HTMLDialogElement | null) {
    dialogRef.current = el;
    if (!el || el.open) return;
    if (typeof el.showModal === "function") el.showModal();
    else el.setAttribute("open", "");
  }

  function closeMenu() {
    const el = dialogRef.current;
    if (el && typeof el.close === "function" && el.open) el.close();
    else setMenuOpen(false);
  }

  return (
    <div className="min-h-screen bg-page lg:flex">
      <a
        href="#tresc"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-toast focus:rounded-control focus:bg-card focus:px-4 focus:py-2 focus:shadow-card focus-visible:focus-ring"
      >
        Przejdź do treści
      </a>

      {/* Menu boczne — szeroki ekran */}
      <aside className="sticky top-0 hidden h-screen w-sidebar shrink-0 flex-col gap-6 overflow-y-auto border-r border-line bg-card px-3 pb-6 pt-6 lg:flex">
        <div className="px-3">
          <Brand panelName={panelName} />
        </div>
        <PanelNav
          groups={groups}
          currentPath={pathname}
          matchNested
          storageKey={storageKey}
          navLabel={navLabel}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-sticky flex h-16 items-center gap-2 border-b border-line bg-card px-4 shadow-header sm:px-6 lg:h-20">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen}
            aria-controls="menu-panelu"
            className="inline-flex min-h-control items-center gap-2 rounded-control px-3 text-small font-semibold text-body transition-colors duration-150 hover:bg-nav-hover hover:text-nav-hover-ink focus-visible:focus-ring lg:hidden"
          >
            <Menu aria-hidden="true" className="size-5 text-icon" />
            Menu
          </button>
          <Logo className="h-6 w-auto lg:hidden" />

          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="inline-flex min-h-control min-w-control items-center justify-center gap-2 rounded-pill border border-control px-4 text-small font-medium text-body transition-colors duration-150 hover:border-control-hover hover:bg-nav-hover hover:text-nav-hover-ink focus-visible:focus-ring disabled:disabled-state max-sm:px-3"
            >
              <LogOut aria-hidden="true" className="size-5 text-icon" />
              <span className="max-sm:sr-only">
                {loggingOut ? "Wylogowywanie…" : "Wyloguj się"}
              </span>
            </button>
          </div>
        </header>

        {menuOpen && (
          <dialog
            id="menu-panelu"
            ref={attachDialog}
            aria-label={navLabel}
            onClose={() => setMenuOpen(false)}
            onClick={(e) => {
              if (e.target === e.currentTarget) closeMenu();
            }}
            className="m-0 h-full max-h-full w-sidebar max-w-full bg-card p-0 shadow-raised backdrop:bg-ink/40 lg:hidden"
          >
            <div className="flex min-h-full flex-col gap-6 px-3 pb-6 pt-4">
              <div className="flex items-start justify-between gap-2 pl-3">
                <Brand panelName={panelName} />
                <button
                  type="button"
                  onClick={closeMenu}
                  aria-label="Zamknij menu"
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-icon transition-colors duration-150 hover:bg-nav-hover hover:text-nav-hover-ink focus-visible:focus-ring"
                >
                  <X aria-hidden="true" className="size-5" />
                </button>
              </div>
              <PanelNav
                groups={groups}
                currentPath={pathname}
                matchNested
                storageKey={storageKey}
                navLabel={navLabel}
                onNavigate={closeMenu}
              />
            </div>
          </dialog>
        )}

        <main id="tresc" className="mx-auto w-full max-w-panel flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>

        <footer className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line bg-card px-4 py-2 sm:px-6">
          <Link
            href="/deklaracja-dostepnosci"
            className="inline-flex min-h-control items-center text-small font-medium text-muted underline underline-offset-2 hover:text-ink focus-visible:focus-ring"
          >
            Deklaracja dostępności
          </Link>
          {LEGAL_DOCUMENT_TYPES.map((typ) => (
            <Link
              key={typ}
              href={`/dokumenty-prawne/${typ}`}
              className="inline-flex min-h-control items-center text-small font-medium text-muted underline underline-offset-2 hover:text-ink focus-visible:focus-ring"
            >
              {LEGAL_DOCUMENT_LABELS[typ]}
            </Link>
          ))}
        </footer>
      </div>
    </div>
  );
}
