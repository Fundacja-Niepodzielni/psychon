import { Suspense, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { expectLabelledControlsAndImages } from "@/app/(uczestnik)/panel/__tests__/a11y-smoke";

/**
 * `/panel/kursy/[slug]` — single course. Details and the catalogue are
 * fetched in parallel through `@/lib/courses`; the catalogue only feeds the
 * locked screen.
 */

const fetchCourse = vi.fn();
const fetchCourses = vi.fn();

vi.mock("@/lib/courses", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/courses")>();
  return {
    ...actual,
    fetchCourse: (...args: unknown[]) => fetchCourse(...args),
    fetchCourses: (...args: unknown[]) => fetchCourses(...args),
  };
});

const { ApiError } = await import("@/lib/api");
const { default: CoursePage } = await import("@/app/(uczestnik)/panel/kursy/[slug]/page");

const COURSE = {
  id: 2,
  slug: "wywiad-psychologiczny",
  title: "Wywiad psychologiczny",
  sequence_order: 2,
  product_group: "psychon" as const,
  status: "in_progress" as const,
  progress_percent: 40,
  instructor: { id: 5, name: "Joanna Demo" },
  lessons: [
    { id: 21, title: "Wprowadzenie do wywiadu", sequence_order: 1, duration_seconds: 1800, is_completed: true },
  ],
  materials: [{ id: 7, name: "Karta pracy.pdf", size: 2048, download_url: "/pliki/7" }],
};

async function renderPage(element: ReactElement = <CoursePage params={Promise.resolve({ slug: COURSE.slug })} />) {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<Suspense fallback={null}>{element}</Suspense>);
  });
  return result!;
}

beforeEach(() => {
  fetchCourse.mockReset();
  fetchCourses.mockReset().mockResolvedValue([]);
});

describe("CoursePage", () => {
  it("shows the generic heading and a loading status while the course is pending", async () => {
    fetchCourse.mockReturnValue(new Promise(() => {}));
    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Kurs" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Ładowanie kursu…");
    expect(fetchCourse).toHaveBeenCalledWith(COURSE.slug);
  });

  it("shows the error state with a retry action on a server error", async () => {
    fetchCourse.mockRejectedValue(new ApiError({ status: 500, code: "server_error", message: "Serwer nie odpowiada." }));
    await renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Serwer nie odpowiada.");
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();
  });

  it("shows the locked screen for 403 course_locked", async () => {
    fetchCourse.mockRejectedValue(
      new ApiError({
        status: 403,
        code: "course_locked",
        message: "Ukończ najpierw etap 1.",
        reason: { required_course_id: 1, missing: ["test"] },
      }),
    );
    await renderPage();

    expect(await screen.findByRole("heading", { level: 1, name: "Kurs zablokowany" })).toBeInTheDocument();
    expect(screen.getByText("Ukończ najpierw etap 1.")).toBeInTheDocument();
  });

  it("renders the course title, instructor, lessons and materials", async () => {
    fetchCourse.mockResolvedValue(COURSE);
    await renderPage();

    expect(await screen.findByRole("heading", { level: 1, name: COURSE.title })).toBeInTheDocument();
    expect(screen.getByText("Joanna Demo")).toBeInTheDocument();
    expect(screen.getByText("Wprowadzenie do wywiadu")).toBeInTheDocument();
    expect(screen.getByText("Karta pracy.pdf")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Wróć do listy kursów/ })).toHaveAttribute("href", "/panel/kursy");
  });

  it("passes the accessibility smoke check after loading", async () => {
    fetchCourse.mockResolvedValue(COURSE);
    const { container } = await renderPage();

    await screen.findByRole("heading", { level: 1, name: COURSE.title });
    expectLabelledControlsAndImages(container);
  });
});
