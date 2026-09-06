"use client";

import { useEffect, useState } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Select from "@/components/ui/Select";
import Table, { type Column } from "@/components/ui/Table";
import { api, apiPaged, ApiError } from "@/lib/api";
import type {
  AssignmentInstructor,
  CourseAssignment,
  InstructorDirectoryEntry,
} from "@/lib/h09/types";
import type {
  AdminCoursesSlot,
  AdminCoursesSlotProps,
} from "@/lib/slots/admin-courses";

/** Wartość pola „Zakres" dla przypisania całego kursu; lekcja niesie swoje id jako tekst. */
const COURSE_SCOPE = "course";

function fullName(person: AssignmentInstructor): string {
  return `${person.first_name} ${person.last_name}`;
}

function messageFrom(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

interface CoverageRow {
  key: string;
  scopeLabel: string;
  /** Puste tylko, gdy naprawdę nie ma kim wypełnić wiersza. */
  assignment: CourseAssignment | null;
  status: "own" | "inherited" | "none";
}

/**
 * Przypisania prowadzących do kursu i jego lekcji (pakiet H09) — region
 * „course-assignments" ekranu `#/admin/kursy`, którego właścicielem jest H08a.
 *
 * Przypisanie całego kursu (`lesson_id = null`) obejmuje każdą lekcję, która
 * nie ma własnego przypisania — kolumna „Status" mówi to wprost, żeby nikt nie
 * musiał się domyślać, skąd bierze się prowadzący danego wiersza. Nazwiska
 * biorę z katalogu wizytówek (`GET /instructors`): wybrać da się wyłącznie
 * prowadzącego, który ma wizytówkę — konto bez niej API by przyjęło, ale ekran
 * nie miałby dla niego nazwiska do pokazania w liście wyboru.
 */
export function CourseAssignmentPanel({ course, lessons }: AdminCoursesSlotProps) {
  const lessonList = lessons ?? [];

  const [assignments, setAssignments] = useState<CourseAssignment[]>([]);
  const [instructors, setInstructors] = useState<InstructorDirectoryEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [scope, setScope] = useState<string>(COURSE_SCOPE);
  const [instructorId, setInstructorId] = useState<string>("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const [removingId, setRemovingId] = useState<number | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([
      api<CourseAssignment[]>(`/admin/courses/${course.id}/assignments`),
      apiPaged<InstructorDirectoryEntry>("/instructors?per_page=100"),
    ])
      .then(([assignmentData, instructorPage]) => {
        if (!active) return;
        setAssignments(assignmentData);
        setInstructors(instructorPage.data);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setLoadError(
          messageFrom(err, "Nie udało się wczytać przypisań. Odśwież stronę."),
        );
      });

    return () => {
      active = false;
    };
  }, [course.id]);

  const courseAssignment =
    assignments.find((item) => item.lesson_id === null) ?? null;

  const rows: CoverageRow[] = [
    {
      key: "course",
      scopeLabel: "Cały kurs",
      assignment: courseAssignment,
      status: courseAssignment ? "own" : "none",
    },
    ...lessonList.map((lesson): CoverageRow => {
      const own = assignments.find((item) => item.lesson_id === lesson.id) ?? null;
      return {
        key: `lesson-${lesson.id}`,
        scopeLabel: lesson.title,
        assignment: own ?? courseAssignment,
        status: own ? "own" : courseAssignment ? "inherited" : "none",
      };
    }),
  ];

  async function submitAssignment() {
    if (!instructorId) {
      setAssignError("Wybierz prowadzącego do przypisania.");
      return;
    }

    setAssigning(true);
    setAssignError(null);

    try {
      const created = await api<CourseAssignment>(
        `/admin/courses/${course.id}/assignments`,
        {
          method: "POST",
          body: {
            instructor_id: Number(instructorId),
            lesson_id: scope === COURSE_SCOPE ? null : Number(scope),
          },
        },
      );
      setAssignments((prev) => [...prev, created]);
      setInstructorId("");
    } catch (err) {
      setAssignError(
        messageFrom(err, "Nie udało się przypisać prowadzącego. Spróbuj ponownie."),
      );
    } finally {
      setAssigning(false);
    }
  }

  async function removeAssignment(
    assignment: CourseAssignment,
    scopeLabel: string,
  ) {
    if (
      !window.confirm(
        `Odłączyć ${fullName(assignment.instructor)} od zakresu „${scopeLabel}"?`,
      )
    ) {
      return;
    }

    setRemovingId(assignment.id);
    setRemoveError(null);

    try {
      await api<CourseAssignment>(`/admin/courses/${course.id}/assignments`, {
        method: "DELETE",
        body: { assignment_id: assignment.id },
      });
      setAssignments((prev) => prev.filter((item) => item.id !== assignment.id));
    } catch (err) {
      setRemoveError(
        messageFrom(err, "Nie udało się odłączyć prowadzącego. Spróbuj ponownie."),
      );
    } finally {
      setRemovingId(null);
    }
  }

  const columns: Column<CoverageRow>[] = [
    { key: "scope", header: "Zakres", render: (row) => row.scopeLabel },
    {
      key: "instructor",
      header: "Prowadzący",
      render: (row) => (row.assignment ? fullName(row.assignment.instructor) : "—"),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        if (row.status === "own") {
          return <Badge variant="success">Własne przypisanie</Badge>;
        }
        if (row.status === "inherited") {
          return <Badge variant="info">Odziedziczone po kursie</Badge>;
        }
        return <span className="text-muted">Brak prowadzącego</span>;
      },
    },
    {
      key: "actions",
      header: "Akcje",
      render: (row) => {
        if (row.status !== "own" || row.assignment === null) return null;
        const assignment = row.assignment;

        return (
          <Button
            variant="ghost"
            loading={removingId === assignment.id}
            onClick={() => removeAssignment(assignment, row.scopeLabel)}
            aria-label={`Odłącz prowadzącego: ${row.scopeLabel}`}
          >
            Odłącz
          </Button>
        );
      },
    },
  ];

  return (
    <Card title="Prowadzący">
      <div className="flex flex-col gap-4">
        <p className="text-small text-muted">
          Prowadzący przypisany do całego kursu prowadzi też każdą lekcję,
          która nie ma własnego przypisania — kolumna „Status” pokazuje, skąd
          pochodzi prowadzący każdego wiersza.
        </p>

        {loadError && <Alert variant="error">{loadError}</Alert>}
        {assignError && <Alert variant="error">{assignError}</Alert>}
        {removeError && <Alert variant="error">{removeError}</Alert>}

        <Table
          columns={columns}
          rows={rows}
          rowKey={(row) => row.key}
          caption={`Przypisania prowadzących kursu ${course.title}`}
          emptyMessage="Ten kurs nie ma jeszcze lekcji."
        />

        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="Zakres"
            value={scope}
            onChange={(event) => setScope(event.target.value)}
            className="min-w-48"
          >
            <option value={COURSE_SCOPE}>Cały kurs</option>
            {lessonList.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.title}
              </option>
            ))}
          </Select>

          <Select
            label="Prowadzący"
            value={instructorId}
            onChange={(event) => setInstructorId(event.target.value)}
            className="min-w-48"
          >
            <option value="">Wybierz…</option>
            {instructors.map((instructor) => (
              <option key={instructor.id} value={instructor.id}>
                {fullName(instructor)}
              </option>
            ))}
          </Select>

          <Button onClick={submitAssignment} loading={assigning}>
            Przypisz
          </Button>
        </div>
      </div>
    </Card>
  );
}

const slot: AdminCoursesSlot = {
  id: "h09-assignment-panel",
  region: "course-assignments",
  order: 100,
  Component: CourseAssignmentPanel,
};

export default slot;
