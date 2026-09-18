"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import ActionRow from "@/components/molecules/ActionRow";
import Breadcrumbs from "@/components/molecules/Breadcrumbs";
import DetailTemplate from "@/components/templates/DetailTemplate";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Stack from "@/components/ui/Stack";
import Text from "@/components/ui/Text";
import EdytorTresciKursu from "@/components/kursy/EdytorTresciKursu";
import { api, ApiError } from "@/lib/api";
import {
  COURSE_TYPE_LABELS,
  PRODUCT_GROUP_LABELS,
  type AdminCourse,
  type AdminLesson,
} from "@/lib/h08/types";
import { slotsForRegion } from "@/lib/slots/admin-courses";

function messageFrom(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export default function AdminCoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [reloadKey, setReloadKey] = useState(0);
  const [course, setCourse] = useState<AdminCourse | null>(null);
  const [lessons, setLessons] = useState<AdminLesson[]>([]);
  /** Błąd niesie klucz żądania — udany przeładunek pod nowym kluczem go ukrywa. */
  const [failed, setFailed] = useState<
    { key: string; message: string; status?: number } | null
  >(null);

  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [deletingCourse, setDeletingCourse] = useState(false);

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

  async function setPublished(next: boolean) {
    setPublishing(true);
    setPublishError(null);

    try {
      const updated = await api<AdminCourse>(`/admin/courses/${id}`, {
        method: "PATCH",
        body: { is_published: next },
      });
      setCourse(updated);
    } catch (err) {
      // Reguła domenowa z fazy 2: pusty kurs zablokowałby całą ścieżkę.
      const missing =
        err instanceof ApiError && err.code === "conditions_not_met"
          ? err.reason?.missing
          : undefined;

      setPublishError(
        Array.isArray(missing) && missing.includes("lessons")
          ? "Dodaj co najmniej jedną lekcję, zanim opublikujesz kurs."
          : messageFrom(err, "Nie udało się zmienić stanu publikacji."),
      );
    } finally {
      setPublishing(false);
    }
  }

  async function deleteCourse() {
    if (!course) return;
    if (
      !window.confirm(
        `Usunąć kurs „${course.title}"? Postęp uczestników zostaje zachowany.`,
      )
    ) {
      return;
    }

    setDeletingCourse(true);
    setPublishError(null);

    try {
      await api<{ id: number; deleted: boolean }>(`/admin/courses/${id}`, {
        method: "DELETE",
      });
      router.push("/admin/kursy");
    } catch (err) {
      setPublishError(messageFrom(err, "Nie udało się usunąć kursu."));
      setDeletingCourse(false);
    }
  }

  const assignmentSlots = slotsForRegion("course-assignments");
  const actionSlots = slotsForRegion("course-actions");

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
            items={[{ label: "Kursy", href: "/admin/kursy" }, { label: tytul }]}
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
          <Card title="Publikacja">
            <Stack>
              {publishError && <Alert variant="error">{publishError}</Alert>}
              <Text>
                Stan kursu:{" "}
                <Badge variant={course.is_published ? "success" : "neutral"}>
                  {course.is_published ? "Opublikowany" : "Szkic"}
                </Badge>
              </Text>
              <Text size="small" tone="muted">
                Kurs publikujesz dopiero z lekcjami, bo opublikowany pusty etap
                zablokowałby ścieżkę wszystkim uczestniczkom i uczestnikom za
                nim.
              </Text>
              <ActionRow>
                <Button
                  variant="ghost"
                  onClick={deleteCourse}
                  loading={deletingCourse}
                >
                  Usuń kurs
                </Button>
                {course.is_published ? (
                  <Button
                    variant="secondary"
                    onClick={() => setPublished(false)}
                    loading={publishing}
                  >
                    Cofnij publikację
                  </Button>
                ) : (
                  <Button
                    onClick={() => setPublished(true)}
                    loading={publishing}
                  >
                    Opublikuj kurs
                  </Button>
                )}
              </ActionRow>
            </Stack>
          </Card>

          <EdytorTresciKursu
            course={course}
            lessons={lessons}
            onCourseUpdated={setCourse}
            onLessonsReload={() => setReloadKey((value) => value + 1)}
          />

          {assignmentSlots.map(({ id: slotId, Component }) => (
            <Component key={slotId} course={course} lessons={lessons} />
          ))}
          {actionSlots.map(({ id: slotId, Component }) => (
            <Component key={slotId} course={course} />
          ))}
        </>
      )}
    </DetailTemplate>
  );
}
