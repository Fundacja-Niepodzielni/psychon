import type { Metadata } from "next";
import { notFound } from "next/navigation";

import QuestionBank from "@/components/h10/QuestionBank";
import Breadcrumbs from "@/components/molecules/Breadcrumbs";
import PageTemplate from "@/components/templates/PageTemplate";

export const metadata: Metadata = {
  title: "Bank pytań — Panel prowadzącego — Niepodzielni",
};

interface InstructorQuestionBankPageProps {
  /** `id` to identyfikator TESTU (`tests.id`) — tak adresuje go API H10,
   * tak samo jak karta administracji (`admin/testy/[id]/pytania/page.tsx`). */
  params: Promise<{ id: string }>;
}

/**
 * Bank pytań testu w panelu prowadzącego — montuje ten sam
 * `QuestionBank` (H10, kryterium 6), co karta administracji, te same cztery
 * punkty API (`/admin/tests/{test}/questions`, `/admin/questions/{question}`
 * — kontrakt H10 adresuje je niezależnie od roli wołającej).
 *
 * Trasa jest osiągalna pod adresem, ale odpowie 403, dopóki backend nie doda
 * roli `instructor` do bramki `routes/api/h10.php` (dziś dopuszcza tylko
 * `project_manager,super_admin`) — ten sam brak backendu, co przy edytorze
 * treści kursu (`KursProwadzacego.tsx`); ekran go nie ukrywa,
 * `QuestionBank` pokazuje wtedy stan „forbidden" jak każdej innej osobie bez
 * uprawnień.
 */
export default async function InstructorQuestionBankPage({
  params,
}: InstructorQuestionBankPageProps) {
  const { id } = await params;
  const testId = Number(id);

  if (!Number.isSafeInteger(testId) || testId <= 0) {
    notFound();
  }

  return (
    <PageTemplate
      naglowek={{
        title: "Bank pytań",
        breadcrumbs: (
          <Breadcrumbs
            items={[
              { label: "Kursy", href: "/prowadzacy/kursy" },
              { label: "Bank pytań" },
            ]}
          />
        ),
      }}
    >
      {/* `key` gwarantuje świeży stan przy przejściu między testami — panel
          czyta pytania raz, przy montażu. */}
      <QuestionBank key={testId} testId={testId} />
    </PageTemplate>
  );
}
