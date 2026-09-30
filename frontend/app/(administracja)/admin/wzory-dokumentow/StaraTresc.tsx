import { Suspense } from "react";
import DocumentTemplateTab from "@/components/document-templates/DocumentTemplateTab";
import LoadingState from "@/components/molecules/LoadingState";
import PageTemplate from "@/components/templates/PageTemplate";
import Tabs from "@/components/ui/Tabs";

/**
 * Dotychczasowa treść strony `/admin/wzory-dokumentow`, przeniesiona bez zmian
 * z `page.tsx` (tytuł karty niesie teraz `page.tsx`). Ekran administracji
 * „Wzory dokumentów" — trzy zakładki (porozumienie, zaświadczenie,
 * certyfikat), jedna na typ wzoru z kontraktu backendu.
 * Każda zakładka to ten sam komponent (`DocumentTemplateTab`) z innym
 * `type` — treść, zapis i historia wersji różnią się tylko danymi.
 *
 * Wybór zakładki siedzi w adresie (`?zakladka=...`, wzorzec `admin/uczestniczki`),
 * `Tabs` montuje jej treść dopiero po otwarciu, więc wejście na ekran nie
 * odpytuje API wszystkich trzech typów naraz.
 */
export default function DocumentTemplatesPage() {
  return (
    <PageTemplate
      naglowek={{
        title: "Wzory dokumentów",
        description:
          "Treść porozumienia, zaświadczenia i certyfikatu generowanych dla uczestniczek i uczestników.",
      }}
    >
      <Suspense fallback={<LoadingState />}>
        <Tabs
          ariaLabel="Wzory dokumentów"
          tabs={[
            {
              id: "porozumienie",
              label: "Porozumienie",
              panel: <DocumentTemplateTab type="agreement" label="wzoru porozumienia" />,
            },
            {
              id: "zaswiadczenie",
              label: "Zaświadczenie",
              panel: (
                <DocumentTemplateTab
                  type="attendance_certificate"
                  label="wzoru zaświadczenia"
                />
              ),
            },
            {
              id: "certyfikat",
              label: "Certyfikat",
              panel: <DocumentTemplateTab type="certificate" label="wzoru certyfikatu" />,
            },
          ]}
        />
      </Suspense>
    </PageTemplate>
  );
}
