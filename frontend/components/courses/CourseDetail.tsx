import Link from "next/link";
import LessonRow from "@/components/courses/LessonRow";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import ProgressBar from "@/components/ui/ProgressBar";
import {
  COURSE_STATUS_BADGE,
  formatFileSize,
  stageLabel,
  type CourseDetail as CourseDetailData,
} from "@/lib/courses";
import { slotsForRegion } from "@/lib/slots/course-page";

export interface CourseDetailProps {
  course: CourseDetailData;
}

/** Strona jednego etapu: nagłówek, prowadzący, lekcje, materiały, sloty. */
export default function CourseDetail({ course }: CourseDetailProps) {
  const badge = COURSE_STATUS_BADGE[course.status];
  const instructorSlots = slotsForRegion("instructor");
  const showInstructorCard =
    course.instructor !== null || instructorSlots.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/panel/kursy"
          className="inline-flex min-h-11 items-center gap-2 self-start text-small font-medium text-muted transition-colors duration-200 hover:text-ink focus-visible:focus-ring"
        >
          <span aria-hidden="true">←</span> Wróć do listy kursów
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <p className="text-caption font-bold tracking-wide text-subtle">
            {stageLabel(course.sequence_order)}
          </p>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>

        <h1 className="text-h2 font-black text-ink">{course.title}</h1>

        <ProgressBar
          value={course.progress_percent}
          label={`Postęp kursu ${course.title}`}
          showValue
          className="max-w-md"
        />
      </div>

      {showInstructorCard && (
        <Card warm className="flex flex-col gap-3">
          <h2 className="text-caption font-bold tracking-wide text-subtle">
            Osoba prowadząca
          </h2>
          <p className="text-body font-medium text-ink">
            {course.instructor?.name ?? "Nie przypisano jeszcze osoby prowadzącej."}
          </p>
          {instructorSlots.map(({ id, Component }) => (
            <Component key={id} course={course} />
          ))}
        </Card>
      )}

      <Card title="Lekcje">
        {course.lessons.length === 0 ? (
          <p className="text-body text-muted">
            Ten etap nie ma jeszcze opublikowanych lekcji.
          </p>
        ) : (
          <ol className="flex flex-col">
            {course.lessons.map((lesson) => (
              <LessonRow key={lesson.id} course={course} lesson={lesson} />
            ))}
          </ol>
        )}
      </Card>

      {course.materials.length > 0 && (
        <Card className="flex flex-col gap-3 border-accent-15">
          <h2 className="text-h4 font-bold text-accent">Materiały do pobrania</h2>
          <ul className="flex flex-col gap-1">
            {course.materials.map((material) => (
              <li key={material.id}>
                <a
                  href={material.download_url}
                  download
                  className="inline-flex min-h-11 items-center gap-2 text-body font-medium text-accent transition-colors duration-200 hover:text-accent-dark focus-visible:focus-ring"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-4 shrink-0"
                    aria-hidden="true"
                  >
                    <path d="M12 3v12" />
                    <path d="m7 12 5 5 5-5" />
                    <path d="M5 21h14" />
                  </svg>
                  {material.name}
                  {formatFileSize(material.size) !== null && (
                    <span className="text-caption font-medium text-muted">
                      {formatFileSize(material.size)}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
