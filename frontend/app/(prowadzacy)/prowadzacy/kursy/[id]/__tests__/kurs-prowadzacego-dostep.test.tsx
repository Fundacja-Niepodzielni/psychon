import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Karta kursu w panelu prowadzącego pod strażnikiem roli
 * (`RequireRole allowedRoles={["instructor"]}` w `prowadzacy/layout.tsx`,
 * wzorzec z `watek-grupowy-dostep.test.tsx`) i bez paneli admin-only: mierzone
 * jest to, że karta prowadzącego NIE montuje przypisań (H09, nagłówek
 * „Prowadzący") ani zaproszeń (H08b, nagłówek „Zaproszenia") — te trasy w
 * ogóle nie istnieją dla `role:instructor` w `routes/api/h08.php`.
 *
 * `RequireRole` woła `/me` przez `@/lib/api` (barrel); karta kursu ładuje
 * treść przez `@/lib/api/prowadzacy-kursy` (`/instructor/courses/{id}...`) —
 * oba mockowane osobno, bo to różne moduły.
 */

const me = vi.fn();
const apiPaged = vi.fn();
const fetchInstructorCourse = vi.fn();
const fetchInstructorLessons = vi.fn();

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => me(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  ApiError,
}));

vi.mock("@/lib/api/klient", () => ({ ApiError }));

vi.mock("@/lib/api/prowadzacy-kursy", () => ({
  fetchInstructorCourse: (...args: unknown[]) => fetchInstructorCourse(...args),
  fetchInstructorLessons: (...args: unknown[]) => fetchInstructorLessons(...args),
  // `TestWiedzyKursuProwadzacego` montuje się razem z edytorem — jego
  // wywołanie nie jest przedmiotem tego świadka (dostęp do EKRANU), stąd
  // nierozwiązująca się obietnica zamiast realnej implementacji.
  fetchInstructorTest: () => new Promise(() => {}),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/prowadzacy/kursy/4",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const { default: InstructorLayout } = await import("@/app/(prowadzacy)/prowadzacy/layout");
const { default: InstructorCoursePage } = await import(
  "@/app/(prowadzacy)/prowadzacy/kursy/[id]/page"
);

const kurs = {
  id: 4,
  title: "Praca z emocjami",
  slug: "praca-z-emocjami",
  description: null,
  type: "course" as const,
  product_group: "psychon" as const,
  sequence_order: 1,
  edition_id: null,
  is_published: true,
  lessons_count: 0,
  materials_count: 0,
  created_at: null,
  updated_at: null,
};

function paramsFor(id: string) {
  return Promise.resolve({ id });
}

beforeEach(() => {
  me.mockReset();
  apiPaged.mockReset();
  apiPaged.mockResolvedValue({ data: [], meta: undefined });
  fetchInstructorCourse.mockReset();
  fetchInstructorLessons.mockReset();
});

describe("karta /prowadzacy/kursy/[id] pod strażnikiem roli", () => {
  it('rola "volunteer" dostaje "Brak dostępu" i ekran nie woła /instructor/courses', async () => {
    me.mockResolvedValue({ role: "volunteer" });

    render(
      <InstructorLayout>
        <InstructorCoursePage params={paramsFor("4")} />
      </InstructorLayout>,
    );

    await waitFor(() => expect(screen.getByText("Brak dostępu")).toBeInTheDocument());
    expect(fetchInstructorCourse).not.toHaveBeenCalled();
    expect(fetchInstructorLessons).not.toHaveBeenCalled();
  });

  it('rola "instructor" montuje tryb edycji BEZ paneli przypisań i zaproszeń', async () => {
    me.mockResolvedValue({ role: "instructor" });
    fetchInstructorCourse.mockResolvedValue(kurs);
    fetchInstructorLessons.mockResolvedValue([]);

    render(
      <InstructorLayout>
        <InstructorCoursePage params={paramsFor("4")} />
      </InstructorLayout>,
    );

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Treść kursu" })).toBeInTheDocument(),
    );
    expect(fetchInstructorCourse).toHaveBeenCalledWith(4);
    expect(screen.getByRole("heading", { name: "Lekcje" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Prowadzący" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Zaproszenia" })).not.toBeInTheDocument();
    expect(screen.queryByText("Brak dostępu")).not.toBeInTheDocument();
  });

  it('kurs cudzy: backend odmawia (403) — ekran pokazuje stan odmowy zdaniem, BEZ przycisku „Ponów"', async () => {
    me.mockResolvedValue({ role: "instructor" });
    fetchInstructorCourse.mockRejectedValue(
      new ApiError(403, "Nie jesteś przypisany do tego kursu."),
    );

    render(
      <InstructorLayout>
        <InstructorCoursePage params={paramsFor("4")} />
      </InstructorLayout>,
    );

    await waitFor(() => expect(screen.getByText("Brak dostępu")).toBeInTheDocument());
    expect(
      screen.queryByRole("button", { name: "Ponów" }),
    ).not.toBeInTheDocument();
  });
});
