import type { Metadata } from "next";
import { Suspense } from "react";
import ReportClosingView from "@/components/h20/ReportClosingView";
import ReportView from "@/components/h20/ReportView";
import LoadingState from "@/components/molecules/LoadingState";
import Tabs from "@/components/ui/Tabs";

export const metadata: Metadata = {
  title: "Raport edycji — Niepodzielni",
};

/**
 * Dwie zakładki na jednej trasie (ten sam wzorzec co `admin/uczestniczki`,
 * H18): raport bieżącej edycji i raport jej zamknięcia. Wybór w adresie
 * (`?zakladka=zamkniecie`) — bez tego drukowanie/udostępnienie linku do
 * zakładki zamknięcia wracałoby zawsze na pierwszą zakładkę.
 */
export default function AdminReportPage() {
  return (
    // `Tabs` czyta parametr zapytania; bez `Suspense` Next każe renderować
    // całą trasę dynamicznie (wymóg `useSearchParams` w App Routerze).
    <Suspense fallback={<LoadingState />}>
      <Tabs
        ariaLabel="Sekcje ekranu raportu"
        tabs={[
          { id: "edycja", label: "Raport edycji", panel: <ReportView /> },
          { id: "zamkniecie", label: "Raport zamknięcia edycji", panel: <ReportClosingView /> },
        ]}
      />
    </Suspense>
  );
}
