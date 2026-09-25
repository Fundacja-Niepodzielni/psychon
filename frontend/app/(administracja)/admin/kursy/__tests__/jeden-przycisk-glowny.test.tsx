import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek liczby przycisków głównych (variant="primary") na liście kursów
 * administracji (H08). Przed poprawką karta „Kolejność ścieżki" miała
 * `variant="secondary"` na przycisku „Sprawdź wpływ zmiany" ZMIENIONE na
 * `primary`, co dawało DWA przyciski główne naraz obok „Dodaj kurs". Test
 * liczy przyciski o klasie `bg-primary` (jedyny wariant, który ją niesie —
 * `secondary` ma tylko `border-primary`, nie `bg-primary`), nie sprawdza
 * samej obecności jednego przycisku.
 */

const api = vi.fn();
const apiPaged = vi.fn();

class ApiError extends Error {
  status: number;
  errors?: Record<string, string[]>;
  constructor(status: number, message: string, errors?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  ApiError,
}));

const { default: AdminCoursesPage } = await import(
  "@/app/(administracja)/admin/kursy/page"
);

const kursy = [
  {
    id: 5,
    title: "Wywiad psychologiczny",
    slug: "wywiad-psychologiczny",
    type: "course" as const,
    product_group: "psychon" as const,
    sequence_order: 1,
    is_published: true,
    lessons_count: 3,
  },
  {
    id: 6,
    title: "Diagnoza kliniczna",
    slug: "diagnoza-kliniczna",
    type: "course" as const,
    product_group: "psychon" as const,
    sequence_order: 2,
    is_published: true,
    lessons_count: 5,
  },
];

/**
 * Wariant `primary` (jedyny z klasą `bg-primary`) w komponencie `Button`,
 * ograniczony do powierzchni widocznej na liście: `<dialog>` bez atrybutu
 * `open` jest ukryty przez przeglądarkę (UA-style `display: none`), więc
 * przycisk potwierdzenia w zamkniętym modalu (`ReorderConfirmModal`) nie
 * liczy się jako przycisk główny widocznego ekranu.
 */
function przyciskiGlowne(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll("button")).filter((btn) => {
    if (!btn.className.includes("bg-primary")) return false;
    const dialog = btn.closest("dialog");
    if (dialog && !dialog.open) return false;
    return true;
  });
}

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
});

describe("AdminCoursesPage — liczba przycisków głównych", () => {
  it("po wczytaniu listy jest dokładnie jeden przycisk główny (Dodaj kurs)", async () => {
    apiPaged.mockResolvedValue({
      data: kursy,
      meta: { current_page: 1, per_page: 100, total: 2, last_page: 1 },
    });
    const { container } = render(<AdminCoursesPage />);

    await waitFor(() =>
      expect(screen.getByText("Wywiad psychologiczny")).toBeInTheDocument(),
    );

    const glowne = przyciskiGlowne(container);
    expect(glowne).toHaveLength(1);
    expect(glowne[0]).toHaveTextContent("Dodaj kurs");
  });

  it("po otwarciu karty „Kolejność ścieżki” nadal jest dokładnie jeden przycisk główny, a „Sprawdź wpływ zmiany” jest drugorzędny", async () => {
    apiPaged.mockResolvedValue({
      data: kursy,
      meta: { current_page: 1, per_page: 100, total: 2, last_page: 1 },
    });
    const { container } = render(<AdminCoursesPage />);

    await waitFor(() =>
      expect(screen.getByText("Wywiad psychologiczny")).toBeInTheDocument(),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Zmień kolejność ścieżki" }),
    );

    const sprawdzWplyw = await screen.findByRole("button", {
      name: "Sprawdź wpływ zmiany",
    });

    // Noga pozytywna: dokładnie jeden przycisk główny na całym ekranie —
    // to nadal „Dodaj kurs”, nie „Sprawdź wpływ zmiany”.
    const glowne = przyciskiGlowne(container);
    expect(glowne).toHaveLength(1);
    expect(glowne[0]).toHaveTextContent("Dodaj kurs");

    // Noga negatywna: „Sprawdź wpływ zmiany” NIE niesie klasy przycisku
    // głównego — ma klasę drugorzędną (obwódka, nie wypełnienie).
    expect(sprawdzWplyw.className).not.toContain("bg-primary");
    expect(sprawdzWplyw.className).toContain("border-primary");
  });
});
