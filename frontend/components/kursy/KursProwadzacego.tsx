"use client";

import { useEffect, useState } from "react";
import Breadcrumbs from "@/components/molecules/Breadcrumbs";
import DetailTemplate from "@/components/templates/DetailTemplate";
import EdytorTresciKursu from "@/components/kursy/EdytorTresciKursu";
import TestWiedzyKursu from "@/components/testy/TestWiedzyKursu";
import { api, ApiError } from "@/lib/api";
import {
  COURSE_TYPE_LABELS,
  PRODUCT_GROUP_LABELS,
  type AdminCourse,
  type AdminLesson,
} from "@/lib/h08/types";

function messageFrom(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export interface KursProwadzacegoProps {
  /** Identyfikator kursu z adresu `/prowadzacy/kursy/[id]`. */
  id: string;
}

/**
 * Karta kursu w panelu prowadzącego — montuje ten sam
 * `EdytorTresciKursu`, co karta administracji (`admin/kursy/[id]/page.tsx`),
 * te same punkty API (`/admin/courses/{id}...` — kontrakt H08/H10 adresuje
 * je tak niezależnie od roli wołającej), ale BEZ paneli admin-only: „Publikacja”
 * (publikacja/usunięcie kursu), przypisań (H09) i zaproszeń (H08b).
 *
 * `TestWiedzyKursu` dokłada wejście do banku pytań testu (H10) — tej samej
 * karty, którą montuje `admin/testy/[id]/pytania/page.tsx` pod adresem
 * `/prowadzacy/testy/{id}/pytania` — o ile zasób kursu poda `test_id`
 * (dziś nie podaje, patrz komentarz w `TestWiedzyKursu`).
 *
 * Bramka roli stoi w `app/(prowadzacy)/prowadzacy/layout.tsx`
 * (`RequireRole allowedRoles={["instructor"]}`) — ten komponent się w ogóle
 * nie montuje dla innej roli. Kto może edytować KTÓRY kurs, rozstrzyga
 * backend (`CoursePolicy`, poz. 11 §1) — ekran nie duplikuje tej reguły,
 * tylko pokazuje 403/404 z API jak każdy inny błąd wczytania.
 */
export default function KursProwadzacego({ id }: KursProwadzacegoProps) {
  const [reloadKey, setReloadKey] = useState(0);
  const [course, setCourse] = useState<AdminCourse | null>(null);
  const [lessons, setLessons] = useState<AdminLesson[]>([]);
  const [failed, setFailed] = useState<
    { key: string; message: string; status?: number } | null
  >(null);

  const loadKey = `${id}:${reloadKey}`;

  useEffect(() => {
    let active = true;

    Promise.all([
      api<AdminCourse>(`/admin/courses/${id}`),
      api<AdminLesson[]>(`/admin/courses/${id}/lessons`),
    ])
      .then(([courseData, lessonData]) => {
        if (!active) return;
        setCourse(courseData);
        setLessons(lessonData);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setFailed({
          key: loadKey,
          message: messageFrom(
            err,
            "Nie udało się wczytać kursu. Odśwież stronę.",
          ),
          status: err instanceof ApiError ? err.status : undefined,
        });
      });

    return () => {
      active = false;
    };
  }, [id, reloadKey, loadKey]);

  const stan = failed?.key === loadKey ? "error" : course ? "success" : "loading";
  const tytul = course?.title ?? "Kurs";

  return (
    <DetailTemplate
      naglowek={{
        title: tytul,
        description: course
          ? `${COURSE_TYPE_LABELS[course.type]} · ${
              PRODUCT_GROUP_LABELS[course.product_group]
            } · ${
              course.sequence_order === null
                ? "poza główną ścieżką"
                : `pozycja ${course.sequence_order} w ścieżce`
            }`
          : undefined,
        breadcrumbs: (
          <Breadcrumbs
            items={[
              { label: "Kursy", href: "/prowadzacy/kursy" },
              { label: tytul },
            ]}
          />
        ),
      }}
      stan={stan}
      httpStatus={failed?.status}
      komunikatLadowania="Wczytywanie kursu…"
      komunikatBledu={failed?.message}
      komunikatBleduTytul="Nie udało się wczytać kursu"
      onPonow={() => setReloadKey((value) => value + 1)}
    >
      {course && (
        <>
          <EdytorTresciKursu
            course={course}
            lessons={lessons}
            onCourseUpdated={setCourse}
            onLessonsReload={() => setReloadKey((value) => value + 1)}
          />
          <TestWiedzyKursu course={course} />
        </>
      )}
    </DetailTemplate>
  );
}
