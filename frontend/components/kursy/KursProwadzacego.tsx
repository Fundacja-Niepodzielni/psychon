"use client";

import { useEffect, useState } from "react";
import Breadcrumbs from "@/components/molecules/Breadcrumbs";
import DetailTemplate from "@/components/templates/DetailTemplate";
import EdytorTresciKursuProwadzacego from "@/components/kursy/EdytorTresciKursuProwadzacego";
import TestWiedzyKursuProwadzacego from "@/components/kursy/TestWiedzyKursuProwadzacego";
import { ApiError } from "@/lib/api/klient";
import { fetchInstructorCourse, fetchInstructorLessons } from "@/lib/api/prowadzacy-kursy";
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
 * Karta kursu w panelu prowadzącego — tryb edycji treści: opis i tytuł
 * kursu, lekcje i materiały (`EdytorTresciKursuProwadzacego`), test wiedzy
 * (`TestWiedzyKursuProwadzacego`). Osobne komponenty od karty administracji:
 * tamta montuje panele admin-only (publikacja, przypisania H09, zaproszenia
 * H08b, bank pytań), do których prowadzący nie ma dostępu.
 *
 * Bramka roli stoi w `app/(prowadzacy)/prowadzacy/layout.tsx`
 * (`RequireRole allowedRoles={["instructor"]}`) — ten komponent się w ogóle
 * nie montuje dla innej roli. Kto może edytować KTÓRY kurs, rozstrzyga
 * backend (`CoursePolicy`) — ekran nie duplikuje tej reguły,
 * tylko pokazuje 403/404 z API jak każdy inny błąd wczytania.
 *
 * Wczytuje kurs i lekcje przez `/instructor/courses/...` (własny moduł
 * `lib/api/prowadzacy-kursy.ts`), nie przez `/admin/...` — te trasy wymagają
 * roli administracji i dla prowadzącego zawsze zwrócą 403.
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
      fetchInstructorCourse(Number(id)),
      fetchInstructorLessons(Number(id)),
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
          <EdytorTresciKursuProwadzacego
            course={course}
            lessons={lessons}
            onCourseUpdated={setCourse}
            onLessonsReload={() => setReloadKey((value) => value + 1)}
          />
          <TestWiedzyKursuProwadzacego course={course} />
        </>
      )}
    </DetailTemplate>
  );
}
