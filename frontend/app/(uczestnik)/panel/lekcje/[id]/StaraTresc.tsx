import Link from "next/link";

import LessonPlayer from "@/components/lesson/LessonPlayer";
import PageTemplate from "@/components/templates/PageTemplate";

/**
 * Dotychczasowa treść strony `/panel/lekcje/[id]` — ekran lekcji (H06) ze
 * starego frontu, przeniesiony bez zmiany z pliku strony. Identyfikator jest
 * już sprawdzony przez stronę (`page.tsx`). Strona zwraca tę treść, gdy grupa
 * przełączenia `lekcja` (`lib/przelaczenie/grupy.ts`) jest wyłączona.
 */
export default function LekcjaStaraTresc({ lessonId }: { lessonId: number }) {
  return (
    <PageTemplate
      naglowek={{
        title: "Lekcja",
        breadcrumbs: (
          <Link
            href="/panel/kursy"
            className="inline-flex min-h-11 items-center gap-2 self-start text-small font-medium text-muted transition-colors duration-200 hover:text-ink focus-visible:focus-ring"
          >
            <span aria-hidden="true">←</span> Wróć do listy kursów
          </Link>
        ),
      }}
    >
      <LessonPlayer lessonId={lessonId} />
    </PageTemplate>
  );
}
