"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useId, useLayoutEffect, useSyncExternalStore, type ComponentType } from "react";

export interface PanelNavItem {
  label: string;
  href: string;
  /** Ikona liniowa (ozdoba, `aria-hidden`); nazwą dostępną jest etykieta. */
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  /** Zaznaczaj tylko przy dokładnym adresie (korzeń sekcji, np. `/admin`). */
  exact?: boolean;
}

export interface PanelNavGroup {
  /** Stały identyfikator sekcji — klucz pamięci zwinięcia. */
  id?: string;
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
  /** Pozycja jest bieżąca także na swoich podstronach (poza `exact`). */
  matchNested?: boolean;
  /** Klucz w pamięci przeglądarki dla zwiniętych sekcji. Bez klucza sekcje
   * też się zwijają, ale stan nie przetrwa odświeżenia. */
  storageKey?: string;
  /** Wołane po wyborze pozycji (np. zamknięcie menu wysuwanego). */
  onNavigate?: () => void;
  navLabel?: string;
  className?: string;
}

const EVENT = "psychon-menu-zmiana";
/** Stan zwinięcia, gdy pamięć przeglądarki jest niedostępna albo nie podano klucza. */
const pamiecLokalna = new Map<string, string>();
const ULOTNY = "ulotny:";

function czytaj(key: string): string {
  if (key.startsWith(ULOTNY)) return pamiecLokalna.get(key) ?? "[]";
  try {
    return window.localStorage.getItem(key) ?? "[]";
  } catch {
    return pamiecLokalna.get(key) ?? "[]";
  }
}

function zapisz(key: string, ids: string[]) {
  const wartosc = JSON.stringify(ids);
  if (key.startsWith(ULOTNY)) {
    pamiecLokalna.set(key, wartosc);
    window.dispatchEvent(new Event(EVENT));
    return;
  }
  try {
    window.localStorage.setItem(key, wartosc);
  } catch {
    pamiecLokalna.set(key, wartosc);
  }
  window.dispatchEvent(new Event(EVENT));
}

function subskrybuj(zmiana: () => void) {
  window.addEventListener(EVENT, zmiana);
  window.addEventListener("storage", zmiana);
  return () => {
    window.removeEventListener(EVENT, zmiana);
    window.removeEventListener("storage", zmiana);
  };
}

function parsuj(surowe: string): string[] {
  try {
    const dane: unknown = JSON.parse(surowe);
    return Array.isArray(dane) ? dane.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function jestBiezaca(path: string, item: PanelNavItem, matchNested: boolean): boolean {
  if (path === item.href) return true;
  if (!matchNested || item.exact) return false;
  return path.startsWith(`${item.href}/`);
}

/**
 * `PanelNav` — organizm nawigacji panelu. Grupy z nazwą mają nagłówek-
 * przycisk (`aria-expanded`, `aria-controls`), który zwija listę; stan
 * zwinięcia zostaje w pamięci przeglądarki (bez niej menu działa rozwinięte).
 * Sekcja z bieżącą stroną otwiera się po każdym wejściu na nową stronę.
 * Filtr po roli zostaje po stronie wołającego (Z-7).
 */
export default function PanelNav({
  groups,
  currentPath,
  matchNested = false,
  storageKey,
  onNavigate,
  navLabel = "Nawigacja panelu",
  className = "",
}: PanelNavProps) {
  const baseId = useId();
  const klucz = storageKey ?? `${ULOTNY}${baseId}`;
  const surowe = useSyncExternalStore(
    subskrybuj,
    () => czytaj(klucz),
    () => "[]",
  );
  const zwiniete = parsuj(surowe);

  const aktywnaSekcja = groups.find(
    (g) => g.id && g.items.some((i) => jestBiezaca(currentPath, i, matchNested)),
  )?.id;

  // Wejście z linku bezpośredniego albo przejście na inną stronę: sekcja
  // z bieżącą pozycją musi być widoczna, nawet jeśli wcześniej ją zwinięto.
  useLayoutEffect(() => {
    if (!aktywnaSekcja) return;
    const obecne = parsuj(czytaj(klucz));
    if (obecne.includes(aktywnaSekcja)) {
      zapisz(klucz, obecne.filter((id) => id !== aktywnaSekcja));
    }
  }, [aktywnaSekcja, currentPath, klucz]);

  function przelacz(id: string) {
    const obecne = parsuj(czytaj(klucz));
    zapisz(
      klucz,
      obecne.includes(id) ? obecne.filter((x) => x !== id) : [...obecne, id],
    );
  }

  return (
    <nav aria-label={navLabel} className={`flex flex-col gap-3 ${className}`}>
      {groups.map((group, index) => {
        const sekcjaId = group.id ?? group.label;
        const listaId = `${baseId}-lista-${index}`;
        const zwinieta = Boolean(group.label && sekcjaId && zwiniete.includes(sekcjaId));
        return (
          <div key={sekcjaId ?? `grupa-${index}`} className="flex flex-col gap-0.5">
            {group.label && sekcjaId && (
              <button
                type="button"
                aria-expanded={!zwinieta}
                aria-controls={listaId}
                onClick={() => przelacz(sekcjaId)}
                className="group/sekcja flex min-h-control w-full items-center justify-between gap-2 rounded-control px-3 text-left text-caption font-semibold tracking-label text-muted transition-colors duration-150 ease-out-quint hover:bg-nav-hover hover:text-nav-hover-ink focus-visible:focus-ring"
              >
                <span>{group.label}</span>
                <ChevronDown
                  aria-hidden="true"
                  className={`size-4 shrink-0 text-icon transition-transform duration-200 ease-out-quint group-hover/sekcja:text-nav-hover-ink ${
                    zwinieta ? "-rotate-90" : ""
                  }`}
                />
              </button>
            )}
            <ul id={listaId} hidden={zwinieta} className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const biezaca = jestBiezaca(currentPath, item, matchNested);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={biezaca ? "page" : undefined}
                      className={`group/pozycja flex min-h-control items-center gap-3 rounded-control px-3 text-small transition-colors duration-150 ease-out-quint focus-visible:focus-ring ${
                        biezaca
                          ? "bg-nav-active font-semibold text-nav-active-ink"
                          : "font-medium text-body hover:bg-nav-hover hover:text-nav-hover-ink"
                      }`}
                    >
                      {Icon ? (
                        <Icon
                          aria-hidden="true"
                          className={`size-5 shrink-0 ${
                            biezaca ? "text-nav-active-ink" : "text-icon group-hover/pozycja:text-nav-hover-ink"
                          }`}
                        />
                      ) : null}
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
