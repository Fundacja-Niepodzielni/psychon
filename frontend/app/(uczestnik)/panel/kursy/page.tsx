"use client";

import { useCallback, useEffect, useState } from "react";
import CourseCard from "@/components/courses/CourseCard";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { ApiError } from "@/lib/api";
import { fetchCourses, type CourseListItem } from "@/lib/courses";

/**
 * Katalog kursów uczestnika (H05).
 *
 * Komponent kliencki, bo token Bearer żyje w `localStorage`.
 * Bez kontrolki grupy produktowej — serwer zawęża katalog niejawnie do grupy
 * użytkownika, więc filtr na tym ekranie byłby martwym kodem.
 */
export default function CoursesCataloguePage() {
  const [courses, setCourses] = useState<CourseListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    fetchCourses()
      .then((data) => {
        if (active) setCourses(data);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Nie udało się połączyć z serwerem. Spróbuj ponownie.",
        );
      });

    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setCourses(null);
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h2 font-black text-ink">Kursy</h1>
        <p className="mt-1 text-body text-muted">
          Twoja ścieżka szkoleniowa. Kolejny etap otwiera się po ukończeniu
          poprzedniego.
        </p>
      </div>

      {error !== null && (
        <div className="flex flex-col items-start gap-3">
          <Alert variant="error" title="Nie udało się wczytać kursów">
            {error}
          </Alert>
          <Button variant="secondary" onClick={retry}>
            Spróbuj ponownie
          </Button>
        </div>
      )}

      {error === null && courses === null && (
        <p role="status" className="text-body text-muted">
          Ładowanie kursów…
        </p>
      )}

      {error === null && courses !== null && courses.length === 0 && (
        <Card>
          <h2 className="text-h4 font-bold text-ink">Nie masz jeszcze kursów</h2>
          <p className="mt-2 text-body text-muted">
            Gdy opiekun projektu udostępni Ci pierwszy etap, pojawi się on w tym
            miejscu.
          </p>
        </Card>
      )}

      {error === null && courses !== null && courses.length > 0 && (
        <ul className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <li key={course.id} className="flex">
              <CourseCard course={course} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
