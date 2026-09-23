"use client";

import { useState, type FormEvent } from "react";
import ActionRow from "@/components/molecules/ActionRow";
import MoveButtons from "@/components/molecules/MoveButtons";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Columns from "@/components/ui/Columns";
import Form from "@/components/ui/Form";
import Input from "@/components/ui/Input";
import Inset from "@/components/ui/Inset";
import Select from "@/components/ui/Select";
import Stack from "@/components/ui/Stack";
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

export interface EdytorTresciKursuProps {
  course: AdminCourse;
  lessons: AdminLesson[];
  /** Kurs zapisany przez formularz — rodzic aktualizuje własny stan (nagłówek, okruszki). */
  onCourseUpdated: (course: AdminCourse) => void;
  /** Lekcja dodana/zmieniona/usunięta/przełożona — rodzic przeładowuje listę lekcji. */
  onLessonsReload: () => void;
}

/**
 * Edytor treści kursu (dane kursu, lekcje, materiały) — wydzielony z
 * `admin/kursy/[id]/page.tsx`, żeby ten sam ekran mogła
 * zamontować karta administracji I panel prowadzącego, bez paneli
 * administracyjnych (przypisania H09, zaproszenia H08b), które zostają w
 * karcie admina.
 *
 * Region slotów „course-materials" (materiały H08b) renderuje się tutaj —
 * materiały są treścią kursu, nie funkcją administracyjną.
 */
export default function EdytorTresciKursu({
  course,
  lessons,
  onCourseUpdated,
  onLessonsReload,
}: EdytorTresciKursuProps) {
  const [courseForm, setCourseForm] = useState<CourseForm>(() => toCourseForm(course));
  // Zachowanie sprzed podziału (`admin/kursy/[id]/page.tsx` przed 9e20d8f):
  // formularz kursu resetował się do danych serwera przy KAŻDYM pełnym
  // przeładunku (tam: efekt zależny od `[id, reloadKey]`). Tu rodzic
  // przeładowuje kurs I lekcje razem (`onLessonsReload` → nowa referencja
  // `lessons`), więc to WŁAŚNIE zmiana referencji `lessons` niesie ten sam
  // sygnał — w odróżnieniu od zmiany `course` samej w sobie (publikacja,
  // zapis tego formularza), która przeładunku nie oznacza i formularza nie
  // resetowała także przed podziałem.
  //
  // Dopasowanie stanu PODCZAS renderowania (wzorzec z dokumentacji Reacta
  // „Adjusting state when a prop changes"), nie w efekcie — bezpośrednie
  // `setState` w ciele efektu kaskaduje renderowania
  // (react-hooks/set-state-in-effect, patrz `useZasobStronicowany.ts`).
  const [prevLessons, setPrevLessons] = useState(lessons);
  if (lessons !== prevLessons) {
    setPrevLessons(lessons);
    setCourseForm(toCourseForm(course));
  }
  const [savingCourse, setSavingCourse] = useState(false);
  const [courseSaved, setCourseSaved] = useState(false);
  const [courseFormError, setCourseFormError] = useState<string | null>(null);
  const [courseFieldErrors, setCourseFieldErrors] = useState<
    Record<string, string[]>
  >({});

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

  const [savingOrder, setSavingOrder] = useState(false);
  // Szkic kolejności istnieje TYLKO w trakcie przeciągania — `null` znaczy
  // „lista rodzica (`lessons`) jest źródłem prawdy". Dzięki temu komponent
  // nie duplikuje propsa w stanie (nie trzeba go synchronizować efektem —
  // po udanym zapisie/przeładunku `lessons` samo dochodzi przez props).
  const [orderDraft, setOrderDraft] = useState<AdminLesson[] | null>(null);
  const orderedLessons = orderDraft ?? lessons;
  const orderDirty = orderDraft !== null;

  function updateCourse<K extends keyof CourseForm>(
    key: K,
    value: CourseForm[K],
  ) {
    setCourseForm((prev) => ({ ...prev, [key]: value }));
    setCourseSaved(false);
  }

  async function submitCourse(event: FormEvent) {
    event.preventDefault();

    setSavingCourse(true);
    setCourseSaved(false);
    setCourseFormError(null);
    setCourseFieldErrors({});

    try {
      const updated = await api<AdminCourse>(`/admin/courses/${course.id}`, {
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
      onCourseUpdated(updated);
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

  function openLessonForm(target: number | "new") {
    setLessonFormOpen(target);
    setLessonFormError(null);
    setLessonFieldErrors({});
    if (target === "new") {
      setLessonForm(EMPTY_LESSON);
      return;
    }
    const lesson = orderedLessons.find((item) => item.id === target);
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
        await api<AdminLesson>(`/admin/courses/${course.id}/lessons`, {
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
      onLessonsReload();
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
      onLessonsReload();
    } catch (err) {
      setLessonActionError(messageFrom(err, "Nie udało się usunąć lekcji."));
    }
  }

  function moveLesson(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= orderedLessons.length) return;
    const next = [...orderedLessons];
    [next[index], next[target]] = [next[target], next[index]];
    setOrderDraft(next);
    setLessonActionError(null);
  }

  async function saveLessonOrder() {
    setSavingOrder(true);
    setLessonActionError(null);

    try {
      await api<AdminLesson[]>(`/admin/courses/${course.id}/lessons/reorder`, {
        method: "PATCH",
        body: { lesson_ids: orderedLessons.map((lesson) => lesson.id) },
      });
      // Odpowiedź niesie autorytatywną listę, ale `onLessonsReload` i tak
      // odświeża `lessons` u rodzica — jedno źródło prawdy zamiast dwóch.
      setOrderDraft(null);
      onLessonsReload();
    } catch (err) {
      setLessonActionError(
        messageFrom(err, "Nie udało się zapisać kolejności lekcji."),
      );
    } finally {
      setSavingOrder(false);
    }
  }

  const courseErr = (key: string) => courseFieldErrors[key]?.[0];
  const lessonErr = (key: string) => lessonFieldErrors[key]?.[0];

  const editedLesson =
    typeof lessonFormOpen === "number"
      ? (orderedLessons.find((lesson) => lesson.id === lessonFormOpen) ?? null)
      : null;

  const materialSlots = slotsForRegion("course-materials");

  const lessonColumns: Column<AdminLesson>[] = [
    {
      key: "sequence_order",
      header: "Pozycja",
      render: (row) => row.sequence_order ?? "–",
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
      render: (row) => row.video_provider_id ?? "–",
    },
    {
      key: "order",
      header: "Kolejność",
      render: (row) => (
        <MoveButtons
          label={row.title}
          index={orderedLessons.findIndex((lesson) => lesson.id === row.id)}
          count={orderedLessons.length}
          onMove={moveLesson}
        />
      ),
    },
    {
      key: "actions",
      header: "Akcje",
      render: (row) => (
        <ActionRow align="start">
          <Button
            variant="ghost"
            onClick={() => openLessonForm(row.id)}
            aria-label={`Edytuj lekcję: ${row.title}`}
          >
            Edytuj
          </Button>
          <Button
            variant="ghost"
            onClick={() => deleteLesson(row)}
            aria-label={`Usuń lekcję: ${row.title}`}
          >
            Usuń
          </Button>
        </ActionRow>
      ),
    },
  ];

  return (
    <>
      <Card title="Dane kursu">
        <Form onSubmit={submitCourse} bledyPol={courseFieldErrors}>
          <Stack>
            {courseFormError && <Alert variant="error">{courseFormError}</Alert>}
            {courseSaved && <Alert variant="success">Zapisano zmiany.</Alert>}

            <Columns>
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
            </Columns>

            <Input
              label="Opis"
              value={courseForm.description}
              onChange={(e) => updateCourse("description", e.target.value)}
              error={courseErr("description")}
            />

            <ActionRow>
              <Button type="submit" loading={savingCourse}>
                Zapisz zmiany
              </Button>
            </ActionRow>
          </Stack>
        </Form>
      </Card>

      <Card title="Lekcje">
        <Stack>
          {lessonActionError && <Alert variant="error">{lessonActionError}</Alert>}

          <ActionRow>
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
              variant={lessonFormOpen === "new" ? "secondary" : "primary"}
              onClick={() =>
                lessonFormOpen === "new"
                  ? setLessonFormOpen(null)
                  : openLessonForm("new")
              }
              aria-expanded={lessonFormOpen === "new"}
            >
              {lessonFormOpen === "new" ? "Zamknij formularz" : "Nowa lekcja"}
            </Button>
          </ActionRow>

          <Table
            columns={lessonColumns}
            rows={orderedLessons}
            rowKey={(row) => row.id}
            caption={`Lekcje kursu ${course.title}`}
            emptyMessage="Ten kurs nie ma jeszcze lekcji. Dodaj pierwszą, żeby móc go opublikować."
          />

          {lessonFormOpen !== null && (
            <Form onSubmit={submitLesson} bledyPol={lessonFieldErrors}>
              <Inset
                title={lessonFormOpen === "new" ? "Nowa lekcja" : "Edycja lekcji"}
              >
                {lessonFormError && (
                  <Alert variant="error">{lessonFormError}</Alert>
                )}

                <Columns>
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
                </Columns>

                <Input
                  label="Opis"
                  value={lessonForm.description}
                  onChange={(e) => updateLesson("description", e.target.value)}
                  error={lessonErr("description")}
                />

                <ActionRow>
                  <Button variant="ghost" onClick={() => setLessonFormOpen(null)}>
                    Anuluj
                  </Button>
                  <Button type="submit" loading={savingLesson}>
                    {lessonFormOpen === "new" ? "Dodaj lekcję" : "Zapisz lekcję"}
                  </Button>
                </ActionRow>

                {editedLesson &&
                  materialSlots.map(({ id: slotId, Component }) => (
                    <Component
                      key={slotId}
                      course={course}
                      lesson={editedLesson}
                    />
                  ))}
              </Inset>
            </Form>
          )}
        </Stack>
      </Card>

      {materialSlots.map(({ id: slotId, Component }) => (
        <Component key={slotId} course={course} />
      ))}
    </>
  );
}
