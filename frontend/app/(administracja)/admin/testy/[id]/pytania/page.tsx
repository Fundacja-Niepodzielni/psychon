import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import QuestionBank from "@/components/h10/QuestionBank";

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
 * dziś go nie wystawia (zgłoszone nadzorcy), więc ekran jest osiągalny
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
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/kursy"
        className="inline-flex min-h-11 items-center gap-2 self-start text-small font-medium text-muted transition-colors duration-200 hover:text-ink focus-visible:focus-ring"
      >
        <span aria-hidden="true">←</span> Wróć do listy kursów
      </Link>

      {/* `key` gwarantuje świeży stan przy przejściu między testami — panel
          czyta pytania raz, przy montażu. */}
      <QuestionBank key={testId} testId={testId} />
    </div>
  );
}
