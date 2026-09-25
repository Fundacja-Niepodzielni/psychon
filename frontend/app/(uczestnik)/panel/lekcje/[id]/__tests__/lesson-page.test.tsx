import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { expectLabelledControlsAndImages } from "@/app/(uczestnik)/panel/__tests__/a11y-smoke";

/**
 * `/panel/lekcje/[id]` — async server page that validates the id and hands
 * it to `LessonPlayer`, which loads `GET /lessons/{id}` on the client.
 */

const apiMock = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return { ...actual, api: (...args: unknown[]) => apiMock(...args) };
});

vi.mock("next/navigation", () => ({ notFound: () => notFound() }));

const { ApiError } = await import("@/lib/api");
const { default: LessonPage } = await import("@/app/(uczestnik)/panel/lekcje/[id]/page");

const LESSON = {
  id: 21,
  title: "Wprowadzenie do wywiadu",
  description: "Opis lekcji",
  duration_seconds: 1800,
  position_seconds: 0,
  watched_seconds: 812,
  active_seconds: 700,
  is_completed: false,
  completable: false,
  completable_at_percent: 60,
};

async function renderLesson(id = "21") {
  const element = await LessonPage({ params: Promise.resolve({ id }) });
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(element);
  });
  return result!;
}

beforeEach(() => {
  apiMock.mockReset();
  notFound.mockClear();
});

describe("LessonPage", () => {
  it("renders the page heading and a loading status while the lesson is pending", async () => {
    apiMock.mockReturnValue(new Promise(() => {}));
    await renderLesson();

    expect(screen.getByRole("heading", { level: 1, name: "Lekcja" })).toBeInTheDocument();
    expect(screen.getByText("Ładowanie lekcji…")).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith("/lessons/21");
  });

  it("shows the load error from the API", async () => {
    apiMock.mockRejectedValue(new ApiError({ status: 500, code: "server_error", message: "Serwer nie odpowiada." }));
    await renderLesson();

    expect(await screen.findByRole("alert")).toHaveTextContent("Nie udało się otworzyć lekcji");
  });

  it("renders the lesson with its progress once loaded", async () => {
    apiMock.mockResolvedValue(LESSON);
    await renderLesson();

    expect(await screen.findByText("Opis lekcji")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: LESSON.title })).toBeInTheDocument();
    expect(screen.getByText(/Aktywny czas: 700 s/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Wróć do listy kursów/ })).toHaveAttribute("href", "/panel/kursy");
  });

  it.each(["abc", "0", "-3"])("calls notFound for an invalid id %s without fetching", async (id) => {
    await expect(renderLesson(id)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("passes the accessibility smoke check after loading", async () => {
    apiMock.mockResolvedValue(LESSON);
    const { container } = await renderLesson();

    await screen.findByText("Opis lekcji");
    expect(expectLabelledControlsAndImages(container)).toBeGreaterThan(0);
  });
});
