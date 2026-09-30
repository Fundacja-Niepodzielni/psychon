import { notFound } from "next/navigation";

import { GRUPY } from "@/lib/przelaczenie/grupy";
import LekcjaNowyEkran from "./NowyEkran";
import LekcjaStaraTresc from "./StaraTresc";

interface LessonPageProps {
  params: Promise<{ id: string }>;
}

/**
 * H06 lesson screen, opened from the lesson slot on the H05 course page.
 * The id is validated here for both variants. The address stays the same,
 * the content changes: switch group `lekcja` (`lib/przelaczenie/grupy.ts`)
 * enabled → the new-front screen (`NowyEkran.tsx`), disabled → the previous
 * content (`StaraTresc.tsx`, unchanged).
 */
export default async function LessonPage({ params }: LessonPageProps) {
  const { id } = await params;
  const lessonId = Number(id);

  if (!Number.isSafeInteger(lessonId) || lessonId <= 0) {
    notFound();
  }

  return GRUPY.lekcja.wlaczona ? <LekcjaNowyEkran id={String(lessonId)} /> : <LekcjaStaraTresc lessonId={lessonId} />;
}
