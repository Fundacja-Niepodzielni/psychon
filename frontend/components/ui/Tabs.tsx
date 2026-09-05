"use client";

import { useRef, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface TabDescriptor {
  /** Człon adresu (`?zakladka=<id>`) — krótki, bez znaków spoza [a-z-]. */
  id: string;
  label: string;
  /** Treść zakładki. Montowana dopiero wtedy, gdy zakładka jest aktywna. */
  panel: ReactNode;
}

export interface TabsProps {
  tabs: TabDescriptor[];
  /**
   * Nazwa parametru zapytania trzymającego wybór. Wybór idzie do adresu, bo
   * pulpit (H19) linkuje do konkretnej kolejki, a nie do „ekranu z zakładkami" —
   * bez tego licznik zgłoszeń otwierałby listę osób.
   */
  paramName?: string;
  /** Opis listy zakładek dla czytnika ekranu. */
  ariaLabel: string;
  className?: string;
}

const tabBase =
  "rounded-pill px-5 py-2 text-body font-medium transition-colors duration-200 " +
  "focus-visible:focus-ring";

/**
 * Zakładki jednego ekranu, z wyborem zapisanym w adresie.
 *
 * Nieaktywna zakładka NIE jest renderowana — inaczej każde wejście na ekran
 * uruchamiałoby odczyty API wszystkich zakładek naraz (`ApplicationsTab` woła
 * `GET /admin/applications` w `useEffect`), także tych, których nikt nie otworzył.
 */
export default function Tabs({
  tabs,
  paramName = "zakladka",
  ariaLabel,
  className = "",
}: TabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const zParametru = params.get(paramName);
  // Nieznana wartość parametru NIE jest błędem ekranu — wraca pierwsza zakładka.
  // Adres bez parametru zachowuje się dokładnie tak, jak ekran przed zakładkami.
  const aktywnyIndeks = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === zParametru),
  );
  const aktywna = tabs[aktywnyIndeks];

  function przejdz(index: number) {
    const nastepne = new URLSearchParams(params.toString());
    nastepne.set(paramName, tabs[index].id);
    // `replace`, nie `push`: przełączanie zakładek nie ma zapychać historii,
    // ale adres ma dać się skopiować i wysłać.
    router.replace(`${pathname}?${nastepne.toString()}`, { scroll: false });
  }

  function naKlawisz(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const skok: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: tabs.length - 1,
    };
    const cel = skok[event.key];
    if (cel === undefined) return;

    event.preventDefault();
    const docelowy = (cel + tabs.length) % tabs.length;
    przejdz(docelowy);
    buttons.current[docelowy]?.focus();
  }

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="mb-6 flex flex-wrap gap-2 border-b border-line pb-4"
      >
        {tabs.map((tab, index) => {
          const wybrana = index === aktywnyIndeks;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                buttons.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`zakladka-${tab.id}`}
              aria-selected={wybrana}
              aria-controls={`panel-${tab.id}`}
              // Roving tabindex: Tab wchodzi w listę raz, dalej strzałki.
              tabIndex={wybrana ? 0 : -1}
              onClick={() => przejdz(index)}
              onKeyDown={(event) => naKlawisz(event, index)}
              className={`${tabBase} ${
                wybrana
                  ? "bg-primary text-light"
                  : "bg-transparent text-muted hover:bg-grey"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`panel-${aktywna.id}`}
        aria-labelledby={`zakladka-${aktywna.id}`}
        tabIndex={0}
      >
        {aktywna.panel}
      </div>
    </div>
  );
}
