import type { Metadata } from "next";
import { notFound } from "next/navigation";

import QuestionBank from "@/components/h10/QuestionBank";
import Breadcrumbs from "@/components/molecules/Breadcrumbs";
import PageTemplate from "@/components/templates/PageTemplate";

export const metadata: Metadata = {
  title: "Bank pytań — Niepodzielni",
};

interface QuestionBankPageProps {
  /** `id` to identyfikator TESTU (`tests.id`) — tak adresuje go API H10. */
  params: Promise<{ id: string }>;
}

/**
 * Bank pytań testu (H10, kryterium 6) — ekran opiekuna i super admina.
 *
 * Trasa stoi na identyfikatorze testu, bo tak adresują go wszystkie cztery
 * punkty API (`/admin/tests/{test}/questions`, `/admin/questions/{question}`).
 * Wejście z karty kursu wymaga, żeby zasób kursu wystawiał ten identyfikator —
 * dziś go nie wystawia (zgłoszone jako brak do uzupełnienia), więc ekran jest osiągalny
 * z adresu, a link z karty kursu włączy się bez zmian tutaj.
 */
export default async function QuestionBankPage({
  params,
}: QuestionBankPageProps) {
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
              { label: "Kursy", href: "/admin/kursy" },
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
