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
  /** `ApiError.status` z haka danych. Jedyne miejsce, które zamienia 403 na
   * `forbidden` — ekrany nie robią już tego same (dawniej 3 osobne kopie). */
  httpStatus?: number;
  /** Podpis pod `role="status"`. Bez wartości: własny domyślny tekst molekuły. */
  komunikatLadowania?: string;
  komunikatBledu?: string;
  /** Tytuł nad komunikatem błędu. Puste `""` = brak tytułu (jak w ekranach
   * sprzed przepięcia); bez wartości: własny domyślny tytuł molekuły. */
  komunikatBleduTytul?: string;
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
  httpStatus,
  komunikatLadowania,
  komunikatBledu = "Nie udało się połączyć z serwerem. Spróbuj ponownie.",
  komunikatBleduTytul,
  onPonow,
  komunikatBrakUprawnien,
  pustyTytul = "Brak danych do wyświetlenia.",
  pustyOpis,
  pustaAkcja,
  dodatkowyPanel,
  paginacja,
  children,
}: ListTemplateProps) {
  // Jedyne miejsce mapowania 403 → `forbidden` (Z-6/C2 §5: jeden mechanizm,
  // nie kopia w każdym ekranie).
  const stanEfektywny: StanListy =
    stan === "error" && httpStatus === 403 ? "forbidden" : stan;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader {...naglowek} />
      {dodatkowyPanel}

      {stanEfektywny === "loading" && <LoadingState label={komunikatLadowania} />}
      {stanEfektywny === "error" && (
        <ErrorState
          message={komunikatBledu}
          title={komunikatBleduTytul}
          onRetry={onPonow}
        />
      )}
      {stanEfektywny === "forbidden" && (
        <ForbiddenState message={komunikatBrakUprawnien} />
      )}
      {stanEfektywny === "empty" && (
        <EmptyState
          title={pustyTytul}
          description={pustyOpis}
          action={pustaAkcja}
        />
      )}
      {stanEfektywny === "success" && (
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
