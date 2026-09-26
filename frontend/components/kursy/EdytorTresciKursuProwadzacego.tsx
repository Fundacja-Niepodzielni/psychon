"use client";

import { useState, type FormEvent } from "react";
import ActionRow from "@/components/molecules/ActionRow";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Form from "@/components/ui/Form";
import Input from "@/components/ui/Input";
import Inset from "@/components/ui/Inset";
import Stack from "@/components/ui/Stack";
import Table, { type Column } from "@/components/ui/Table";
import { ApiError } from "@/lib/api/klient";
import type { AdminCourse, AdminLesson, AdminMaterial } from "@/lib/h08/types";
import {
  createInstructorLesson,
  deleteInstructorLesson,
  deleteInstructorMaterial,
  updateInstructorCourse,
  updateInstructorLesson,
  uploadInstructorMaterialForCourse,
  type InstructorCourseContentPayload,
} from "@/lib/api/prowadzacy-kursy";

function messageFrom(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
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

function toLessonForm(lesson: AdminLesson): LessonForm {
  return {
    title: lesson.title,
    description: lesson.description ?? "",
    sequence_order: lesson.sequence_order?.toString() ?? "",
    video_provider_id: lesson.video_provider_id ?? "",
    duration_seconds: lesson.duration_seconds.toString(),
  };
}

export interface EdytorTresciKursuProwadzacegoProps {
  course: AdminCourse;
  lessons: AdminLesson[];
  onCourseUpdated: (course: AdminCourse) => void;
  onLessonsReload: () => void;
}

/**
 * Tryb edycji karty kursu w panelu prowadzącego: opis i tytuł kursu, lekcje
 * (dodawanie/edycja/usuwanie) i materiały kursu. Bez publikacji, kolejności
 * w ścieżce i przestawiania lekcji — tego prowadzący nie zmienia (order
 * pola nie ma nawet w żądaniu, `InstructorCourseController` odrzuca je po
 * cichu, gdyby ktoś je i tak wysłał).
 *
 * Osobny komponent od `EdytorTresciKursu` administracji: tamten wisi na
 * trasach `/admin/...` i na slotach, z których większość (zaproszenia,
 * przypisania, bank pytań) jest administracyjna — nie da się ich bezpiecznie
 * współdzielić z ekranem prowadzącego bez ryzyka wywołania trasy, do której
 * prowadzący nie ma dostępu.
 */
export default function EdytorTresciKursuProwadzacego({
  course,
  lessons,
  onCourseUpdated,
  onLessonsReload,
}: EdytorTresciKursuProwadzacegoProps) {
  const [courseForm, setCourseForm] = useState<InstructorCourseContentPayload>({
    title: course.title,
    description: course.description ?? "",
  });
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

  const [materials, setMaterials] = useState<AdminMaterial[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileFieldKey, setFileFieldKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [materialActionError, setMaterialActionError] = useState<
    string | null
  >(null);

  async function submitCourse(event: FormEvent) {
    event.preventDefault();

    setSavingCourse(true);
    setCourseSaved(false);
    setCourseFormError(null);
    setCourseFieldErrors({});

    try {
      const updated = await updateInstructorCourse(course.id, {
        title: courseForm.title,
        description: courseForm.description || null,
      });
      onCourseUpdated(updated);
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
    const lesson = lessons.find((item) => item.id === target);
    setLessonForm(lesson ? toLessonForm(lesson) : EMPTY_LESSON);
  }

  function updateLessonField<K extends keyof LessonForm>(
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
        await createInstructorLesson(course.id, body);
      } else {
        await updateInstructorLesson(lessonFormOpen, body);
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

  async function removeLesson(lesson: AdminLesson) {
    if (
      !window.confirm(
        `Usunąć lekcję „${lesson.title}"? Postęp historyczny uczestników zostaje zachowany.`,
      )
    ) {
      return;
    }

    setLessonActionError(null);

    try {
      await deleteInstructorLesson(lesson.id);
      if (lessonFormOpen === lesson.id) setLessonFormOpen(null);
      onLessonsReload();
    } catch (err) {
      setLessonActionError(messageFrom(err, "Nie udało się usunąć lekcji."));
    }
  }

  async function uploadMaterial() {
    if (!selectedFile) {
      setFileError("Wskaż plik do wgrania.");
      return;
    }

    setUploading(true);
    setFileError(null);
    setMaterialActionError(null);

    try {
      const created = await uploadInstructorMaterialForCourse(
        course.id,
        selectedFile,
      );
      setMaterials((prev) => [...prev, created]);
      setSelectedFile(null);
      setFileFieldKey((value) => value + 1);
    } catch (err) {
      setFileError(
        err instanceof ApiError
          ? (err.errors?.file?.[0] ?? err.message)
          : "Nie udało się wgrać pliku. Spróbuj ponownie.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function removeMaterial(material: AdminMaterial) {
    if (
      !window.confirm(
        `Usunąć materiał „${material.name}"? Pliku nie da się przywrócić.`,
      )
    ) {
      return;
    }

    setMaterialActionError(null);

    try {
      await deleteInstructorMaterial(material.id);
      setMaterials((prev) => prev.filter((item) => item.id !== material.id));
    } catch (err) {
      setMaterialActionError(
        messageFrom(err, "Nie udało się usunąć materiału."),
      );
    }
  }

  const courseErr = (key: string) => courseFieldErrors[key]?.[0];
  const lessonErr = (key: string) => lessonFieldErrors[key]?.[0];

  const lessonColumns: Column<AdminLesson>[] = [
    {
      key: "sequence_order",
      header: "Pozycja",
      render: (row) => row.sequence_order ?? "–",
    },
    { key: "title", header: "Tytuł", render: (row) => row.title },
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
            onClick={() => removeLesson(row)}
            aria-label={`Usuń lekcję: ${row.title}`}
          >
            Usuń
          </Button>
        </ActionRow>
      ),
    },
  ];

  const materialColumns: Column<AdminMaterial>[] = [
    { key: "name", header: "Nazwa", render: (row) => row.name },
    {
      key: "actions",
      header: "Akcje",
      render: (row) => (
        <Button
          variant="ghost"
          onClick={() => removeMaterial(row)}
          aria-label={`Usuń materiał: ${row.name}`}
        >
          Usuń
        </Button>
      ),
    },
  ];

  return (
    <>
      <Card title="Treść kursu">
        <Form onSubmit={submitCourse} bledyPol={courseFieldErrors}>
          <Stack>
            {courseFormError && <Alert variant="error">{courseFormError}</Alert>}
            {courseSaved && <Alert variant="success">Zapisano zmiany.</Alert>}

            <Input
              label="Tytuł"
              value={courseForm.title ?? ""}
              onChange={(e) =>
                setCourseForm((prev) => ({ ...prev, title: e.target.value }))
              }
              error={courseErr("title")}
            />
            <Input
              label="Opis"
              value={courseForm.description ?? ""}
              onChange={(e) =>
                setCourseForm((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
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
            rows={lessons}
            rowKey={(row) => row.id}
            caption={`Lekcje kursu ${course.title}`}
            emptyMessage="Ten kurs nie ma jeszcze lekcji."
          />

          {lessonFormOpen !== null && (
            <Form onSubmit={submitLesson} bledyPol={lessonFieldErrors}>
              <Inset
                title={lessonFormOpen === "new" ? "Nowa lekcja" : "Edycja lekcji"}
              >
                {lessonFormError && (
                  <Alert variant="error">{lessonFormError}</Alert>
                )}

                <Input
                  label="Tytuł lekcji"
                  value={lessonForm.title}
                  onChange={(e) => updateLessonField("title", e.target.value)}
                  error={lessonErr("title")}
                />
                <Input
                  label="Opis"
                  value={lessonForm.description}
                  onChange={(e) =>
                    updateLessonField("description", e.target.value)
                  }
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
              </Inset>
            </Form>
          )}
        </Stack>
      </Card>

      <Card title="Materiały kursu">
        <Stack>
          {materialActionError && (
            <Alert variant="error">{materialActionError}</Alert>
          )}

          <Table
            columns={materialColumns}
            rows={materials}
            rowKey={(row) => row.id}
            caption={`Materiały wgrane w tej sesji do kursu ${course.title}`}
            emptyMessage="Nie wgrano jeszcze żadnego materiału w tej sesji."
          />

          <div className="flex flex-wrap items-end gap-3">
            <Input
              key={fileFieldKey}
              label="Plik materiału"
              type="file"
              accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg"
              hint="Dozwolone formaty: PDF, DOC, DOCX, PPT, PPTX, PNG, JPG. Maksymalnie 10 MB."
              error={fileError ?? undefined}
              className="grow"
              onChange={(event) => {
                setSelectedFile(event.target.files?.[0] ?? null);
                setFileError(null);
              }}
            />
            <Button
              onClick={uploadMaterial}
              loading={uploading}
              disabled={!selectedFile}
            >
              Wgraj materiał
            </Button>
          </div>
        </Stack>
      </Card>
    </>
  );
}
