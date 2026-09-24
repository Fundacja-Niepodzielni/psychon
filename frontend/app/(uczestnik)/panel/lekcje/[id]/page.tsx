import Link from "next/link";
import { notFound } from "next/navigation";

import LessonPlayer from "@/components/lesson/LessonPlayer";
import PageTemplate from "@/components/templates/PageTemplate";

interface LessonPageProps {
  params: Promise<{ id: string }>;
}

/** H06 lesson screen, opened from the lesson slot on the H05 course page. */
export default async function LessonPage({ params }: LessonPageProps) {
  const { id } = await params;
  const lessonId = Number(id);

  if (!Number.isSafeInteger(lessonId) || lessonId <= 0) {
    notFound();
  }

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
