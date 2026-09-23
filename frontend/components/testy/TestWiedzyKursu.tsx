"use client";

import Link from "next/link";
import Card from "@/components/ui/Card";
import type { AdminCourse } from "@/lib/h08/types";

export interface TestWiedzyKursuProps {
  course: AdminCourse;
}

/**
 * Wejście do banku pytań testu z karty kursu w panelu prowadzącego —
 * odpowiednik `CourseQuestionBankLink` (H10, panel administracji),
 * ale pod trasą prowadzącego (`/prowadzacy/testy/{id}/pytania`).
 *
 * Renderuje się WYŁĄCZNIE, gdy zasób kursu poda `test_id`. Dziś go nie
 * podaje: `AdminCourseResource` (H08, `GET /admin/courses/{course}` — ten sam
 * zasób, z którego karta prowadzącego czyta kurs) tego pola nie wystawia —
 * to ten sam brak, co przy wersji administracji (zgłoszony w
 * `CourseQuestionBankLink`). Zasób osiągalny wyłącznie dla roli `instructor`
 * (`GET /instructor/courses`, H09 → `InstructorCourseSummary`) niesie jeszcze
 * mniej pól, więc nie ma dziś danych, z których dałoby się zbudować ten link
 * inaczej — karta milczy zamiast zgadywać albo kłamać.
 */
export default function TestWiedzyKursu({ course }: TestWiedzyKursuProps) {
  const testId = course.test_id;

  if (typeof testId !== "number") return null;

  return (
    <Card title="Test wiedzy">
      <p className="text-small text-muted">
        Pytania i odpowiedzi testu kończącego ten kurs. Edycja nie zmienia
        wyników wcześniejszych podejść.
      </p>

      <Link
        href={`/prowadzacy/testy/${testId}/pytania`}
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-pill border border-primary bg-card px-6 py-2.5 text-body font-medium text-primary transition-colors duration-200 hover:bg-brand-10 focus-visible:focus-ring"
      >
        Otwórz bank pytań
      </Link>
    </Card>
  );
}
