"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState, type FormEvent } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Table, { type Column } from "@/components/ui/Table";
import { api, ApiError } from "@/lib/api";
import {
  COURSE_TYPE_LABELS,
  PRODUCT_GROUP_LABELS,
  type AdminCourse,
  type AdminLesson,
  type CourseType,
  type ProductGroup,
} from "@/lib/h08/types";
import { slotsForRegion } from "@/lib/slots/admin-courses";

interface CourseForm {
  title: string;
  slug: string;
  type: CourseType;
  product_group: ProductGroup;
  sequence_order: string;
  description: string;
}

interface LessonForm {
  title: string;
  description: string;
  sequence_order: string;
  video_provider_id: string;
  duration_seconds: string;
}

const EMPTY_LESSON: LessonForm = {
  title: "",
  description: "",
  sequence_order: "",
  video_provider_id: "",
  duration_seconds: "0",
};

function toCourseForm(course: AdminCourse): CourseForm {
  return {
    title: course.title,
    slug: course.slug,
    type: course.type,
    product_group: course.product_group,
    sequence_order: course.sequence_order?.toString() ?? "",
    description: course.description ?? "",
  };
}

function toLessonForm(lesson: AdminLesson): LessonForm {
  return {
    title: lesson.title,
    description: lesson.description ?? "",
    sequence_order: lesson.sequence_order?.toString() ?? "",
    video_provider_id: lesson.video_provider_id ?? "",
    duration_seconds: lesson.duration_seconds.toString(),
  };
}

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
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(
    null,
  );

  const [courseForm, setCourseForm] = useState<CourseForm | null>(null);
  const [savingCourse, setSavingCourse] = useState(false);
  const [courseSaved, setCourseSaved] = useState(false);
  const [courseFormError, setCourseFormError] = useState<string | null>(null);
  const [courseFieldErrors, setCourseFieldErrors] = useState<
    Record<string, string[]>
  >({});

  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [deletingCourse, setDeletingCourse] = useState(false);

  const [lessonFormOpen, setLessonFormOpen] = useState<number | "new" | null>(
    null,
  );
  const [lessonForm, setLessonForm] = useState<LessonForm>(EMPTY_LESSON);
  const [savingLesson, setSavingLesson] = useState(false);
  const [lessonFormError, setLessonFormError] = useState<string | null>(null);
  const [lessonFieldErrors, setLessonFieldErrors] = useState<
    Record<string, string[]>
  >({});
  const [lessonActionError, setLessonActionError] = useState<string | null>(
    null,
  );

  const [orderDirty, setOrderDirty] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

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
        setCourseForm(toCourseForm(courseData));
        setLessons(lessonData);
        setOrderDirty(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setFailed({
          key: loadKey,
          message: messageFrom(
            err,
            "Nie udało się wczytać kursu. Odśwież stronę.",
          ),
        });
      });

    return () => {
      active = false;
    };
  }, [id, reloadKey, loadKey]);

  function updateCourse<K extends keyof CourseForm>(
    key: K,
    value: CourseForm[K],
  ) {
    setCourseForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setCourseSaved(false);
  }

  async function submitCourse(event: FormEvent) {
    event.preventDefault();
    if (!courseForm) return;

    setSavingCourse(true);
    setCourseSaved(false);
    setCourseFormError(null);
    setCourseFieldErrors({});

    try {
      const updated = await api<AdminCourse>(`/admin/courses/${id}`, {
        method: "PATCH",
        body: {
          title: courseForm.title,
          slug: courseForm.slug,
          type: courseForm.type,
          product_group: courseForm.product_group,
          sequence_order: courseForm.sequence_order
            ? Number(courseForm.sequence_order)
            : null,
          description: courseForm.description || null,
        },
      });
      setCourse(updated);
      setCourseForm(toCourseForm(updated));
      setCourseSaved(true);
    } catch (err) {
      if (err instanceof ApiError && err.errors) {
        setCourseFieldErrors(err.errors);
        setCourseFormError("Popraw zaznaczone pola.");
      } else {
        setCourseFormError(
          messageFrom(err, "Nie udało się zapisać zmian. Spróbuj ponownie."),
        );
      }
    } finally {
      setSavingCourse(false);
    }
  }

  async function setPublished(next: boolean) {
    setPublishing(true);
    setPublishError(null);

    try {
      const updated = await api<AdminCourse>(`/admin/courses/${id}`, {
        method: "PATCH",
        body: { is_published: next },
      });
      setCourse(updated);
      setCourseForm(toCourseForm(updated));
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

  function openLessonForm(target: number | "new") {
    setLessonFormOpen(target);
    setLessonFormError(null);
    setLessonFieldErrors({});
    if (target === "new") {
      setLessonForm(EMPTY_LESSON);
      return;
    }
    const lesson = lessons.find((item) => item.id === target);
    setLessonForm(lesson ? toLessonForm(lesson) : EMPTY_LESSON);
  }

  function updateLesson<K extends keyof LessonForm>(
    key: K,
    value: LessonForm[K],
  ) {
    setLessonForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submitLesson(event: FormEvent) {
    event.preventDefault();
    if (lessonFormOpen === null) return;

    setSavingLesson(true);
    setLessonFormError(null);
    setLessonFieldErrors({});

    const body = {
      title: lessonForm.title,
      description: lessonForm.description || null,
      sequence_order: lessonForm.sequence_order
        ? Number(lessonForm.sequence_order)
        : null,
      video_provider_id: lessonForm.video_provider_id || null,
      duration_seconds: Number(lessonForm.duration_seconds || "0"),
    };

    try {
      if (lessonFormOpen === "new") {
        await api<AdminLesson>(`/admin/courses/${id}/lessons`, {
          method: "POST",
          body,
        });
      } else {
        await api<AdminLesson>(`/admin/lessons/${lessonFormOpen}`, {
          method: "PATCH",
          body,
        });
      }
      setLessonFormOpen(null);
      setReloadKey((value) => value + 1);
    } catch (err) {
      if (err instanceof ApiError && err.errors) {
        setLessonFieldErrors(err.errors);
        setLessonFormError("Popraw zaznaczone pola.");
      } else {
        setLessonFormError(
          messageFrom(err, "Nie udało się zapisać lekcji. Spróbuj ponownie."),
        );
      }
    } finally {
      setSavingLesson(false);
    }
  }

  async function deleteLesson(lesson: AdminLesson) {
    if (
      !window.confirm(
        `Usunąć lekcję „${lesson.title}"? Postęp historyczny uczestników zostaje zachowany.`,
      )
    ) {
      return;
    }

    setLessonActionError(null);

    try {
      await api<{ id: number; deleted: boolean }>(
        `/admin/lessons/${lesson.id}`,
        { method: "DELETE" },
      );
      if (lessonFormOpen === lesson.id) setLessonFormOpen(null);
      setReloadKey((value) => value + 1);
    } catch (err) {
      setLessonActionError(messageFrom(err, "Nie udało się usunąć lekcji."));
    }
  }

  function moveLesson(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= lessons.length) return;
    const next = [...lessons];
    [next[index], next[target]] = [next[target], next[index]];
    setLessons(next);
    setOrderDirty(true);
    setLessonActionError(null);
  }

  async function saveLessonOrder() {
    setSavingOrder(true);
    setLessonActionError(null);

    try {
      const updated = await api<AdminLesson[]>(
        `/admin/courses/${id}/lessons/reorder`,
        {
          method: "PATCH",
          body: { lesson_ids: lessons.map((lesson) => lesson.id) },
        },
      );
      setLessons(updated);
      setOrderDirty(false);
    } catch (err) {
      setLessonActionError(
        messageFrom(err, "Nie udało się zapisać kolejności lekcji."),
      );
    } finally {
      setSavingOrder(false);
    }
  }

  if (failed?.key === loadKey) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="error">{failed.message}</Alert>
        <Link
          href="/admin/kursy"
          className="text-small font-medium text-primary underline underline-offset-4 focus-visible:focus-ring"
        >
          Wróć do listy kursów
        </Link>
      </div>
    );
  }

  if (!course || !courseForm) {
    return (
      <p role="status" className="text-body text-muted">
        Wczytywanie kursu…
      </p>
    );
  }

  const courseErr = (key: string) => courseFieldErrors[key]?.[0];
  const lessonErr = (key: string) => lessonFieldErrors[key]?.[0];

  const editedLesson =
    typeof lessonFormOpen === "number"
      ? (lessons.find((lesson) => lesson.id === lessonFormOpen) ?? null)
      : null;

  const materialSlots = slotsForRegion("course-materials");
  const assignmentSlots = slotsForRegion("course-assignments");
  const actionSlots = slotsForRegion("course-actions");

  const lessonColumns: Column<AdminLesson>[] = [
    {
      key: "sequence_order",
      header: "Pozycja",
      render: (row) => row.sequence_order ?? "—",
    },
    { key: "title", header: "Tytuł", render: (row) => row.title },
    {
      key: "duration_seconds",
      header: "Czas trwania",
      render: (row) =>
        row.duration_seconds > 0
          ? `${Math.round(row.duration_seconds / 60)} min`
          : "Brak nagrania",
    },
    {
      key: "video_provider_id",
      header: "Identyfikator nagrania",
      render: (row) => row.video_provider_id ?? "—",
    },
    {
      key: "order",
      header: "Kolejność",
      render: (row) => {
        const index = lessons.findIndex((lesson) => lesson.id === row.id);
        return (
          <span className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => moveLesson(index, -1)}
              disabled={index === 0}
              aria-label={`Przesuń w górę: ${row.title}`}
            >
              W górę
            </Button>
            <Button
              variant="ghost"
              onClick={() => moveLesson(index, 1)}
              disabled={index === lessons.length - 1}
              aria-label={`Przesuń w dół: ${row.title}`}
            >
              W dół
            </Button>
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "Akcje",
      render: (row) => (
        <span className="flex gap-2">
          <Button variant="ghost" onClick={() => openLessonForm(row.id)}>
            Edytuj
          </Button>
          <Button
            variant="ghost"
            onClick={() => deleteLesson(row)}
            aria-label={`Usuń lekcję: ${row.title}`}
          >
            Usuń
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/admin/kursy"
          className="text-small font-medium text-primary underline underline-offset-4 focus-visible:focus-ring"
        >
          ← Wszystkie kursy
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-h2 font-black text-ink">{course.title}</h1>
          <Badge variant={course.is_published ? "success" : "neutral"}>
            {course.is_published ? "Opublikowany" : "Szkic"}
          </Badge>
        </div>
        <p className="text-body text-muted">
          {COURSE_TYPE_LABELS[course.type]} ·{" "}
          {PRODUCT_GROUP_LABELS[course.product_group]} ·{" "}
          {course.sequence_order === null
            ? "poza główną ścieżką"
            : `pozycja ${course.sequence_order} w ścieżce`}
        </p>
      </div>

      <Card title="Publikacja">
        <div className="flex flex-col gap-4">
          {publishError && <Alert variant="error">{publishError}</Alert>}
          <p className="text-small text-muted">
            Kurs publikujesz dopiero z lekcjami — opublikowany pusty etap
            zablokowałby ścieżkę wszystkim uczestniczkom i uczestnikom za nim.
          </p>
          <div className="flex flex-wrap justify-end gap-3">
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
              <Button onClick={() => setPublished(true)} loading={publishing}>
                Opublikuj kurs
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card title="Dane kursu">
        <form onSubmit={submitCourse} noValidate className="flex flex-col gap-4">
          {courseFormError && <Alert variant="error">{courseFormError}</Alert>}
          {courseSaved && <Alert variant="success">Zapisano zmiany.</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Tytuł"
              value={courseForm.title}
              onChange={(e) => updateCourse("title", e.target.value)}
              error={courseErr("title")}
            />
            <Input
              label="Identyfikator (slug)"
              value={courseForm.slug}
              onChange={(e) => updateCourse("slug", e.target.value)}
              error={courseErr("slug")}
            />
            <Select
              label="Typ"
              value={courseForm.type}
              onChange={(e) =>
                updateCourse("type", e.target.value as CourseType)
              }
              error={courseErr("type")}
            >
              {Object.entries(COURSE_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Select
              label="Grupa produktowa"
              value={courseForm.product_group}
              onChange={(e) =>
                updateCourse("product_group", e.target.value as ProductGroup)
              }
              error={courseErr("product_group")}
            >
              {Object.entries(PRODUCT_GROUP_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Input
              label="Pozycja w ścieżce"
              type="number"
              min={1}
              value={courseForm.sequence_order}
              onChange={(e) => updateCourse("sequence_order", e.target.value)}
              error={courseErr("sequence_order")}
              hint="Puste pole = kurs poza główną ścieżką."
            />
          </div>

          <Input
            label="Opis"
            value={courseForm.description}
            onChange={(e) => updateCourse("description", e.target.value)}
            error={courseErr("description")}
          />

          <div className="flex justify-end">
            <Button type="submit" loading={savingCourse}>
              Zapisz zmiany
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Lekcje">
        <div className="flex flex-col gap-4">
          {lessonActionError && (
            <Alert variant="error">{lessonActionError}</Alert>
          )}

          <div className="flex flex-wrap justify-end gap-3">
            {orderDirty && (
              <Button
                variant="secondary"
                onClick={saveLessonOrder}
                loading={savingOrder}
              >
                Zapisz kolejność lekcji
              </Button>
            )}
            <Button
              onClick={() =>
                lessonFormOpen === "new"
                  ? setLessonFormOpen(null)
                  : openLessonForm("new")
              }
              aria-expanded={lessonFormOpen === "new"}
            >
              {lessonFormOpen === "new" ? "Zamknij formularz" : "Nowa lekcja"}
            </Button>
          </div>

          <Table
            columns={lessonColumns}
            rows={lessons}
            rowKey={(row) => row.id}
            caption={`Lekcje kursu ${course.title}`}
            emptyMessage="Ten kurs nie ma jeszcze lekcji. Dodaj pierwszą, żeby móc go opublikować."
          />

          {lessonFormOpen !== null && (
            <form
              onSubmit={submitLesson}
              noValidate
              className="flex flex-col gap-4 rounded-sm border border-line bg-page p-4"
            >
              <h3 className="text-h4 font-bold text-ink">
                {lessonFormOpen === "new" ? "Nowa lekcja" : "Edycja lekcji"}
              </h3>

              {lessonFormError && <Alert variant="error">{lessonFormError}</Alert>}

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Tytuł lekcji"
                  value={lessonForm.title}
                  onChange={(e) => updateLesson("title", e.target.value)}
                  error={lessonErr("title")}
                />
                <Input
                  label="Pozycja w kursie"
                  type="number"
                  min={1}
                  value={lessonForm.sequence_order}
                  onChange={(e) =>
                    updateLesson("sequence_order", e.target.value)
                  }
                  error={lessonErr("sequence_order")}
                  hint="Puste pole = kolejny wolny numer."
                />
                <Input
                  label="Identyfikator nagrania (mock)"
                  value={lessonForm.video_provider_id}
                  onChange={(e) =>
                    updateLesson("video_provider_id", e.target.value)
                  }
                  error={lessonErr("video_provider_id")}
                />
                <Input
                  label="Czas trwania (sekundy)"
                  type="number"
                  min={0}
                  value={lessonForm.duration_seconds}
                  onChange={(e) =>
                    updateLesson("duration_seconds", e.target.value)
                  }
                  error={lessonErr("duration_seconds")}
                  hint="Zero oznacza, że lekcji nie da się ukończyć."
                />
              </div>

              <Input
                label="Opis"
                value={lessonForm.description}
                onChange={(e) => updateLesson("description", e.target.value)}
                error={lessonErr("description")}
              />

              <div className="flex flex-wrap justify-end gap-3">
                <Button variant="ghost" onClick={() => setLessonFormOpen(null)}>
                  Anuluj
                </Button>
                <Button type="submit" loading={savingLesson}>
                  {lessonFormOpen === "new" ? "Dodaj lekcję" : "Zapisz lekcję"}
                </Button>
              </div>

              {editedLesson &&
                materialSlots.map(({ id: slotId, Component }) => (
                  <Component
                    key={slotId}
                    course={course}
                    lesson={editedLesson}
                  />
                ))}
            </form>
          )}
        </div>
      </Card>

      {materialSlots.map(({ id: slotId, Component }) => (
        <Component key={slotId} course={course} />
      ))}
      {assignmentSlots.map(({ id: slotId, Component }) => (
        <Component key={slotId} course={course} />
      ))}
      {actionSlots.map(({ id: slotId, Component }) => (
        <Component key={slotId} course={course} />
      ))}
    </div>
  );
}
