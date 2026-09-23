import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Karta kursu w panelu prowadzącego (poz. 11, D-27) pod strażnikiem roli
 * (`RequireRole allowedRoles={["instructor"]}` w `prowadzacy/layout.tsx`,
 * wzorzec z `watek-grupowy-dostep.test.tsx`) i bez paneli admin-only:
 * mierzone jest to, że po wydzieleniu `EdytorTresciKursu` karta prowadzącego
 * NIE montuje przypisań (H09, nagłówek „Prowadzący") ani zaproszeń (H08b,
 * nagłówek „Zaproszenia") — obie są renderowane wprost w
 * `admin/kursy/[id]/page.tsx`, nie w edytorze, który tu się montuje.
 *
 * UWAGA (WERDYKT-POZ11-front-e9cf1c9.md §2, kontrola pozorna): test „rola
 * instructor montuje edytor" niżej mockuje `/admin/courses/4` jako sukces —
 * to KONTRAKT OCZEKIWANY po decyzji D-27 (backend ma dodać rolę `instructor`
 * do bramek `h08.php`/`h10.php`), NIE dzisiejszy stan. DZIŚ backend zwraca
 * 403 na każdą z 11 tras (`h08.php:32` wymaga `project_manager,super_admin`)
 * — patrz test „DZIŚ: backend odmawia (403)" niżej, który mierzy realny stan.
 */

const api = vi.fn();
const apiPaged = vi.fn();

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  ApiError,
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
  api.mockReset();
  apiPaged.mockReset();
  apiPaged.mockResolvedValue({ data: [], meta: undefined });
});

describe("karta /prowadzacy/kursy/[id] pod strażnikiem roli", () => {
  it('rola "volunteer" dostaje "Brak dostępu" i ekran nie woła /admin/courses', async () => {
    api.mockResolvedValue({ role: "volunteer" });

    render(
      <InstructorLayout>
        <InstructorCoursePage params={paramsFor("4")} />
      </InstructorLayout>,
    );

    await waitFor(() => expect(screen.getByText("Brak dostępu")).toBeInTheDocument());
    expect(api).not.toHaveBeenCalledWith(`/admin/courses/4`);
    expect(api).not.toHaveBeenCalledWith(`/admin/courses/4/lessons`);
  });

  it('KONTRAKT OCZEKIWANY (D-27, po dodaniu roli instructor do bramek h08/h10): rola "instructor" montuje edytor BEZ paneli przypisań i zaproszeń', async () => {
    api.mockImplementation((url: string) => {
      if (url === "/me") return Promise.resolve({ role: "instructor" });
      if (url === "/admin/courses/4") return Promise.resolve(kurs);
      if (url === "/admin/courses/4/lessons") return Promise.resolve([]);
      return Promise.reject(new Error(`nieoczekiwane wywołanie: ${url}`));
    });

    render(
      <InstructorLayout>
        <InstructorCoursePage params={paramsFor("4")} />
      </InstructorLayout>,
    );

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Dane kursu" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("heading", { name: "Lekcje" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Prowadzący" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Zaproszenia" })).not.toBeInTheDocument();
    expect(screen.queryByText("Brak dostępu")).not.toBeInTheDocument();
  });

  it('DZIŚ: backend odmawia (403) rolę "instructor" na /admin/courses/{id} — ekran pokazuje stan odmowy, BEZ przycisku „Ponów" (WERDYKT-POZ11-front-e9cf1c9.md §2)', async () => {
    api.mockImplementation((url: string) => {
      if (url === "/me") return Promise.resolve({ role: "instructor" });
      if (url === "/admin/courses/4") {
        return Promise.reject(
          new ApiError(403, "Nie masz dostępu do tej sekcji."),
        );
      }
      return Promise.reject(new Error(`nieoczekiwane wywołanie: ${url}`));
    });

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
