import type { ReactNode } from "react";
import ErrorState from "@/components/molecules/ErrorState";
import ForbiddenState from "@/components/molecules/ForbiddenState";
import LoadingState from "@/components/molecules/LoadingState";
import type { PageHeaderProps } from "@/components/molecules/PageHeader";
import PageTemplate from "@/components/templates/PageTemplate";

export type StanSzczegolu = "loading" | "error" | "success";

export interface DetailTemplateProps {
  /** Nagłówek widoczny w każdym stanie; przy wczytywaniu zwykle nazwa ogólna. */
  naglowek: PageHeaderProps;
  stan: StanSzczegolu;
  /** `ApiError.status` z haka danych. Jedyne miejsce, które zamienia 403 na
   * `forbidden` — wzorzec z `ListTemplate` (Z-6/C2 §5: jeden mechanizm, nie
   * kopia mylącego „Ponów" w każdym ekranie). */
  httpStatus?: number;
  komunikatLadowania?: string;
  komunikatBledu?: string;
  komunikatBleduTytul?: string;
  /** Ponowienie wczytania rekordu (Z-6: stan błędu ma akcję). Bez sensu przy
   * odmowie roli — `forbidden` go nie pokazuje niezależnie od tej wartości. */
  onPonow?: () => void;
  komunikatBrakUprawnien?: string;
  /** Karty rekordu — renderowane tylko w stanie `success`. */
  children?: ReactNode;
}

/**
 * `DetailTemplate` — szablon ekranu jednego rekordu: nagłówek z okruszkami,
 * a pod nim stan wczytywania, błąd z ponowieniem, odmowa uprawnień (403) albo
 * karty rekordu.
 */
export default function DetailTemplate({
  naglowek,
  stan,
  httpStatus,
  komunikatLadowania,
  komunikatBledu = "Nie udało się połączyć z serwerem. Spróbuj ponownie.",
  komunikatBleduTytul,
  onPonow,
  komunikatBrakUprawnien,
  children,
}: DetailTemplateProps) {
  const forbidden = stan === "error" && httpStatus === 403;

  return (
    <PageTemplate naglowek={naglowek}>
      {stan === "loading" && <LoadingState label={komunikatLadowania} />}
      {stan === "error" && forbidden && (
        <ForbiddenState message={komunikatBrakUprawnien} />
      )}
      {stan === "error" && !forbidden && (
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
