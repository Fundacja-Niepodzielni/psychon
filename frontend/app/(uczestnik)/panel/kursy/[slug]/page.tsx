"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import CourseDetail from "@/components/courses/CourseDetail";
import CourseLocked from "@/components/courses/CourseLocked";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import PageTemplate from "@/components/templates/PageTemplate";
import { ApiError } from "@/lib/api";
import {
  fetchCourse,
  fetchCourses,
  type CourseDetail as CourseDetailData,
  type CourseListItem,
} from "@/lib/courses";

interface LockedState {
  message: string;
  missing: string[];
  requiredCourseId: number | null;
}

type Screen =
  | { kind: "loading" }
  | { kind: "ready"; course: CourseDetailData }
  | { kind: "locked"; locked: LockedState }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

function screenFor(result: PromiseSettledResult<CourseDetailData>): Screen {
  if (result.status === "fulfilled") {
    return { kind: "ready", course: result.value };
  }

  const err: unknown = result.reason;

  if (!(err instanceof ApiError)) {
    return {
      kind: "error",
      message: "Nie udało się połączyć z serwerem. Spróbuj ponownie.",
    };
  }

  if (err.status === 403 && err.code === "course_locked") {
    const required = err.reason?.required_course_id;

    return {
      kind: "locked",
      locked: {
        message: err.message,
        missing: err.reason?.missing ?? [],
        requiredCourseId: typeof required === "number" ? required : null,
      },
    };
  }

  if (err.status === 404) {
    return { kind: "not_found" };
  }

  return { kind: "error", message: err.message };
}

/**
 * Strona jednego kursu (H05).
 *
 * Komponent kliencki (token Bearer z lib/api.ts), więc `params` przychodzi jako
 * `Promise` i rozpakowujemy je Reactowym `use()` — konwencja Next 16
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md).
 *
 * Katalog pobieramy równolegle ze szczegółami: przy ręcznie wpisanym adresie
 * nie ma go w pamięci, a ekran blokady musi zamienić `reason.required_course_id`
 * na slug blokującego etapu.
 */
export default function CoursePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; screen: Screen } | null>(
    null,
  );
  const [catalogue, setCatalogue] = useState<CourseListItem[]>([]);

  // Wynik jest związany z parametrami żądania: po zmianie sluga (albo po
  // ponowieniu) stary ekran nigdy nie zostaje na widoku.
  const key = `${slug}#${attempt}`;

  useEffect(() => {
    let active = true;

    Promise.allSettled([fetchCourse(slug), fetchCourses()]).then(
      ([detail, list]) => {
        if (!active) return;

        if (list.status === "fulfilled") setCatalogue(list.value);
        setLoaded({ key, screen: screenFor(detail) });
      },
    );

    return () => {
      active = false;
    };
  }, [slug, key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const screen: Screen =
    loaded !== null && loaded.key === key ? loaded.screen : { kind: "loading" };

  if (screen.kind === "loading") {
    return (
      <PageTemplate naglowek={{ title: "Kurs" }}>
        <p role="status" className="text-body text-muted">
          Ładowanie kursu…
        </p>
      </PageTemplate>
    );
  }

  if (screen.kind === "ready") {
    return (
      <PageTemplate
        naglowek={{
          title: screen.course.title,
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
        <CourseDetail course={screen.course} />
      </PageTemplate>
    );
  }

  if (screen.kind === "locked") {
    const required = screen.locked.requiredCourseId;

    return (
      <PageTemplate naglowek={{ title: "Kurs zablokowany" }}>
        <CourseLocked
          message={screen.locked.message}
          missing={screen.locked.missing}
          requiredCourse={catalogue.find((item) => item.id === required) ?? null}
        />
      </PageTemplate>
    );
  }

  if (screen.kind === "not_found") {
    return (
      <PageTemplate naglowek={{ title: "Nie znaleziono kursu" }}>
        <Card className="flex max-w-2xl flex-col gap-4">
          <p className="text-body text-muted">
            Ten kurs nie istnieje albo nie należy do Twojej ścieżki.
          </p>
          <Link
            href="/panel/kursy"
            className="inline-flex min-h-11 items-center justify-center self-start rounded-pill bg-primary px-6 py-2.5 text-body font-medium text-light transition-colors duration-200 hover:bg-ink focus-visible:focus-ring"
          >
            Wróć do listy kursów
          </Link>
        </Card>
      </PageTemplate>
    );
  }

  return (
    <PageTemplate naglowek={{ title: "Kurs" }}>
      <div className="flex flex-col items-start gap-3">
        <Alert variant="error" title="Nie udało się wczytać kursu">
          {screen.message}
        </Alert>
        <Button variant="secondary" onClick={retry}>
          Spróbuj ponownie
        </Button>
      </div>
    </PageTemplate>
  );
}
