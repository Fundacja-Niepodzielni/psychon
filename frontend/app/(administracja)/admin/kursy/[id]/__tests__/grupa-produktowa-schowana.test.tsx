import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

/**
 * Stary ekran kursu administracji (`/admin/kursy/[id]` przy wyłączonej grupie
 * przełączenia): grupa produktowa nie jest pokazana pod tytułem ani w formularzu
 * edycji, a zapis kursu nie niesie `product_group`.
 */

const api = vi.fn();

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => api(...args),
  apiPaged: vi.fn(async () => ({ data: [], meta: undefined })),
  ApiError,
}));

const { default: StaraTresc } = await import("../StaraTresc");

const KURS = {
  id: 4,
  title: "Wywiad psychologiczny",
  slug: "wywiad-psychologiczny",
  description: null,
  type: "course" as const,
  product_group: "dobrostan" as const,
  sequence_order: 1,
  edition_id: null,
  is_published: true,
  lessons_count: 0,
  materials_count: 0,
  created_at: null,
  updated_at: null,
};

beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (sciezka: string) => (sciezka === "/admin/courses/4" ? KURS : []));
});

describe("stary ekran kursu administracji — grupa produktowa schowana", () => {
  it("opis pod tytułem i formularz edycji nie niosą grupy produktowej", async () => {
    // Obietnica parametrów powstaje raz: nowa przy każdym renderze zawiesiłaby ekran bez końca.
    const params = Promise.resolve({ id: "4" });
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <StaraTresc params={params} />
        </Suspense>,
      );
    });

    await screen.findByRole("heading", { level: 1, name: "Wywiad psychologiczny" });
    expect(KURS.sequence_order).toBe(1);
    expect(
      screen.getByText(new RegExp(`Kurs · pozycja ${KURS.sequence_order} w ścieżce`)),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Dobrostan/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Grupa produktowa")).not.toBeInTheDocument();
    expect(screen.queryByText(/grup[aąy] produktow/i)).not.toBeInTheDocument();
  });
});
