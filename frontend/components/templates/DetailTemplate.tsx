import type { ReactNode } from "react";
import ErrorState from "@/components/molecules/ErrorState";
import LoadingState from "@/components/molecules/LoadingState";
import type { PageHeaderProps } from "@/components/molecules/PageHeader";
import PageTemplate from "@/components/templates/PageTemplate";

export type StanSzczegolu = "loading" | "error" | "success";

export interface DetailTemplateProps {
  /** Nagłówek widoczny w każdym stanie; przy wczytywaniu zwykle nazwa ogólna. */
  naglowek: PageHeaderProps;
  stan: StanSzczegolu;
  komunikatLadowania?: string;
  komunikatBledu?: string;
  komunikatBleduTytul?: string;
  /** Ponowienie wczytania rekordu (Z-6: stan błędu ma akcję). */
  onPonow?: () => void;
  /** Karty rekordu — renderowane tylko w stanie `success`. */
  children?: ReactNode;
}

/**
 * `DetailTemplate` — szablon ekranu jednego rekordu: nagłówek z okruszkami,
 * a pod nim stan wczytywania, błąd z ponowieniem albo karty rekordu.
 */
export default function DetailTemplate({
  naglowek,
  stan,
  komunikatLadowania,
  komunikatBledu = "Nie udało się połączyć z serwerem. Spróbuj ponownie.",
  komunikatBleduTytul,
  onPonow,
  children,
}: DetailTemplateProps) {
  return (
    <PageTemplate naglowek={naglowek}>
      {stan === "loading" && <LoadingState label={komunikatLadowania} />}
      {stan === "error" && (
        <ErrorState
          message={komunikatBledu}
          title={komunikatBleduTytul}
          onRetry={onPonow}
        />
      )}
      {stan === "success" && children}
    </PageTemplate>
  );
}
