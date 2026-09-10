import type { Metadata } from "next";
import { Suspense } from "react";
import ApplicationsTab from "@/components/h03/ApplicationsTab";
import AdminUsersList from "@/components/h18/AdminUsersList";
import Tabs from "@/components/ui/Tabs";

export const metadata: Metadata = {
  title: "Uczestniczki i uczestnicy — Niepodzielni",
};

/**
 * Ekran osób w administracji — dwie zakładki na jednej trasie (wpięcie ekranu zgłoszeń, H03).
 *
 * `ApplicationsTab` (H03) był kompletny od hackathonu i **nieosiągalny z interfejsu**:
 * nikt go nie importował, więc kryteria ★ H03.1–2, które są kryteriami Z EKRANU,
 * nie miały jak zostać spełnione. Lista osób (H18) zostaje tam, gdzie była — wpięcie
 * zgłoszeń dokłada zakładkę, nie podmienia ekranu.
 *
 * Wybór zakładki siedzi w adresie (`?zakladka=zgloszenia`), bo licznik zgłoszeń
 * na pulpicie (H19) linkuje do kolejki, a nie do „ekranu z zakładkami".
 * Adres bez parametru pokazuje listę osób — dokładnie jak przed tą zmianą.
 */
export default function AdminUsersPage() {
  return (
    // `Tabs` czyta parametr zapytania; bez `Suspense` Next każe renderować
    // całą trasę dynamicznie (wymóg `useSearchParams` w App Routerze).
    <Suspense fallback={<p className="text-body text-muted">Wczytywanie…</p>}>
      <Tabs
        ariaLabel="Sekcje ekranu uczestniczek"
        tabs={[
          { id: "osoby", label: "Osoby", panel: <AdminUsersList /> },
          { id: "zgloszenia", label: "Zgłoszenia", panel: <ApplicationsTab /> },
        ]}
      />
    </Suspense>
  );
}
