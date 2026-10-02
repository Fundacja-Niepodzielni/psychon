import Badge from "@/components/ui/Badge";
import type { Column } from "@/components/ui/Table";
import type { UserRole } from "@/lib/api/h18";
import type { ReportStageKey } from "@/lib/api/raport";
import { ROLE_LABELS } from "@/lib/h18/labels";

/**
 * Pola wspólne dla wiersza osoby w obu raportach (`ReportView`,
 * `ReportClosingView`) — tylko te, których dotyczą trzy wspólne kolumny
 * poniżej. Oba ekrany mają różne, szersze typy wiersza (`ReportsPersonRow`,
 * `ClosingReportPersonRow`), więc funkcja jest ogólna po typie z tym
 * ograniczeniem, nie po `any` ani przez rzutowanie.
 */
export interface OsobaRaportu {
  first_name: string;
  last_name: string;
  role: UserRole;
  stage: ReportStageKey;
  stage_label: string;
}

/**
 * Trzy pierwsze kolumny tabeli osób, identyczne w obu widokach raportu
 * (imię i nazwisko, rola, etap). Każdy widok dokłada własne kolumny za
 * tymi trzema — kolejność i nagłówki bez zmian względem stanu sprzed
 * wydzielenia.
 */
export function kolumnyOsoby<T extends OsobaRaportu>(): Column<T>[] {
  return [
    {
      key: "name",
      header: "Osoba",
      render: (row) => `${row.first_name} ${row.last_name}`,
    },
    {
      key: "role",
      header: "Rola",
      render: (row) => ROLE_LABELS[row.role] ?? row.role,
    },
    {
      key: "stage",
      header: "Etap",
      render: (row) => (
        <Badge variant={row.stage === "certyfikat" ? "success" : "neutral"}>
          {row.stage_label}
        </Badge>
      ),
    },
  ];
}
