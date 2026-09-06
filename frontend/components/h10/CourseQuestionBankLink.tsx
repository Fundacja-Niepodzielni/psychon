"use client";

import Link from "next/link";
import Card from "@/components/ui/Card";
import type {
  AdminCoursesSlot,
  AdminCoursesSlotProps,
} from "@/lib/slots/admin-courses";

/**
 * Wejście do banku pytań z karty kursu (H10) — slot regionu „course-actions".
 *
 * Renderuje się WYŁĄCZNIE wtedy, gdy zasób kursu poda `test_id`. Powód: cztery
 * punkty API H10 adresują test jego własnym identyfikatorem, a `AdminCourseResource`
 * dziś go nie wystawia (zgłoszone jako brak do uzupełnienia — to jedna linia po stronie zasobu).
 * Zgadywanie „id kursu = id testu" dałoby link prowadzący do cudzego banku pytań,
 * więc dopóki pola nie ma, karta kursu milczy zamiast kłamać.
 */
export function CourseQuestionBankLink({ course }: AdminCoursesSlotProps) {
  const testId = course.test_id;

  if (typeof testId !== "number") return null;

  return (
    <Card title="Test wiedzy">
      <p className="text-small text-muted">
        Pytania i odpowiedzi testu kończącego ten kurs. Edycja nie zmienia
        wyników wcześniejszych podejść.
      </p>

      <Link
        href={`/admin/testy/${testId}/pytania`}
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-pill border border-primary bg-card px-6 py-2.5 text-body font-medium text-primary transition-colors duration-200 hover:bg-brand-10 focus-visible:focus-ring"
      >
        Otwórz bank pytań
      </Link>
    </Card>
  );
}

export const h10QuestionBankSlot: AdminCoursesSlot = {
  id: "h10-question-bank",
  region: "course-actions",
  order: 100,
  Component: CourseQuestionBankLink,
};

export default h10QuestionBankSlot;
