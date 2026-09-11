"use client";

import type { ReactNode } from "react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/molecules/EmptyState";
import ErrorState from "@/components/molecules/ErrorState";
import ForbiddenState from "@/components/molecules/ForbiddenState";
import LoadingState from "@/components/molecules/LoadingState";
import PageHeader, { type PageHeaderProps } from "@/components/molecules/PageHeader";

export type StanListy = "loading" | "error" | "forbidden" | "empty" | "success";

export interface ListTemplatePaginacja {
  strona: number;
  ostatniaStrona: number;
  onZmien: (strona: number) => void;
}

export interface ListTemplateProps {
  naglowek: PageHeaderProps;
  stan: StanListy;
  komunikatBledu?: string;
  onPonow?: () => void;
  komunikatBrakUprawnien?: string;
  pustyTytul?: string;
  pustyOpis?: string;
  pustaAkcja?: ReactNode;
  /** Panel nad treścią listy (filtry, formularz „nowy…"), widoczny w każdym
   * stanie — Z-14: nic na ścieżce krytycznej nie jest domyślnie schowane. */
  dodatkowyPanel?: ReactNode;
  /** Jedyna dozwolona implementacja stronicowania (KC-3, pozycja D). */
  paginacja?: ListTemplatePaginacja;
  /** Treść listy (tabela/karty) — renderowana tylko w stanie `success`. */
  children?: ReactNode;
}

/**
 * `ListTemplate` — szablon C2 wariant C (16 tras): nagłówek + filtry +
 * `DataTable` (tu: treść `children`) + 5 stanów. `DataTable`/`FilterBar`
 * (organizmy) są poza zakresem partii P1 — szablon dziś składa istniejące
 * `components/ui/Table` i nowe molekuły stanów wprost.
 */
export default function ListTemplate({
  naglowek,
  stan,
  komunikatBledu = "Nie udało się połączyć z serwerem. Spróbuj ponownie.",
  onPonow,
  komunikatBrakUprawnien,
  pustyTytul = "Brak danych do wyświetlenia.",
  pustyOpis,
  pustaAkcja,
  dodatkowyPanel,
  paginacja,
  children,
}: ListTemplateProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader {...naglowek} />
      {dodatkowyPanel}

      {stan === "loading" && <LoadingState label="Wczytywanie listy…" />}
      {stan === "error" && (
        <ErrorState message={komunikatBledu} onRetry={onPonow} />
      )}
      {stan === "forbidden" && (
        <ForbiddenState message={komunikatBrakUprawnien} />
      )}
      {stan === "empty" && (
        <EmptyState
          title={pustyTytul}
          description={pustyOpis}
          action={pustaAkcja}
        />
      )}
      {stan === "success" && (
        <>
          {children}
          {paginacja && paginacja.ostatniaStrona > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="secondary"
                disabled={paginacja.strona <= 1}
                onClick={() =>
                  paginacja.onZmien(Math.max(1, paginacja.strona - 1))
                }
              >
                Poprzednia
              </Button>
              <span className="text-small text-subtle">
                Strona {paginacja.strona} z {paginacja.ostatniaStrona}
              </span>
              <Button
                variant="secondary"
                disabled={paginacja.strona >= paginacja.ostatniaStrona}
                onClick={() =>
                  paginacja.onZmien(
                    Math.min(paginacja.ostatniaStrona, paginacja.strona + 1),
                  )
                }
              >
                Następna
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
