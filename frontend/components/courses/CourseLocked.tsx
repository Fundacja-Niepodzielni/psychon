import Link from "next/link";
import Card from "@/components/ui/Card";
import type { CourseListItem } from "@/lib/courses";

/** Klucze `reason.missing` z odpowiedzi 403 `course_locked` (kontrakt §1.1). */
const MISSING_LABEL: Record<string, string> = {
  lessons: "Ukończ wszystkie lekcje",
  test: "Zalicz test wiedzy",
};

export interface CourseLockedProps {
  /** `ApiError.message` — serwer składa już czytelne zdanie. */
  message: string;
  missing: string[];
  /** Blokujący etap, rozwiązany z `reason.required_course_id` po katalogu. */
  requiredCourse: CourseListItem | null;
}

export default function CourseLocked({
  message,
  missing,
  requiredCourse,
}: CourseLockedProps) {
  return (
    <Card className="flex max-w-2xl flex-col gap-5">
      <div className="flex items-start gap-3">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-1 size-6 shrink-0 text-muted"
          aria-hidden="true"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <div>
          <h1 className="text-h3 font-black text-ink">{message}</h1>
          <p className="mt-1 text-body text-muted">
            Ten etap jest zablokowany — otworzy się, gdy domkniesz poprzedni.
          </p>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-caption font-bold tracking-wide text-subtle">
            Do zrobienia
          </h2>
          <ul className="flex flex-col gap-2">
            {missing.map((key) => (
              <li key={key} className="flex items-start gap-2 text-body text-ink">
                <span aria-hidden="true" className="text-accent">
                  •
                </span>
                {MISSING_LABEL[key] ?? key}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {requiredCourse && (
          <Link
            href={`/panel/kursy/${requiredCourse.slug}`}
            className="inline-flex min-h-11 items-center justify-center rounded-pill bg-primary px-6 py-2.5 text-body font-medium text-light transition-colors duration-200 hover:bg-ink focus-visible:focus-ring"
          >
            Przejdź do etapu: {requiredCourse.title}
          </Link>
        )}
        <Link
          href="/panel/kursy"
          className="inline-flex min-h-11 items-center justify-center rounded-pill border border-primary bg-card px-6 py-2.5 text-body font-medium text-primary transition-colors duration-200 hover:bg-brand-10 focus-visible:focus-ring"
        >
          Wróć do listy kursów
        </Link>
      </div>
    </Card>
  );
}
