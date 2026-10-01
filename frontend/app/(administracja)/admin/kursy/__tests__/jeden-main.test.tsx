import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * Trasa `/admin/kursy` z włączoną grupą złożona tak jak robi to router: układ
 * administracji (strażnik ról i ramka) i strona z nowym ekranem, w czterech
 * stanach (ładowanie, dane, błąd sieci, odmowa 403). W każdym stanie dokładnie
 * jeden `main`, jeden `#tresc` i jeden odnośnik do treści. Podmienione są
 * wyłącznie moduły transportu HTTP.
 */

const api = vi.fn();
const apiPaged = vi.fn();

vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
}));

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  endSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/kursy",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const KURS = {
  id: 5,
  title: "Wywiad psychologiczny",
  slug: "wywiad-psychologiczny",
  description: null,
  type: "course",
  product_group: "psychon",
  sequence_order: 1,
  edition_id: 1,
  is_published: true,
  lessons_count: 3,
  materials_count: 0,
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-01T10:00:00Z",
};

function zmierz(container: HTMLElement) {
  return {
    main: container.querySelectorAll("main").length,
    cele: container.querySelectorAll("#tresc").length,
    odnosniki: container.querySelectorAll('a[href="#tresc"]').length,
  };
}

const JEDEN = { main: 1, cele: 1, odnosniki: 1 };

async function zloz() {
  podmienRejestr({ kursyAdministracji: true });
  const { default: Uklad } = await import("@/app/(administracja)/admin/layout");
  const { default: Strona } = await import("../page");
  return render(
    <Uklad>
      <Strona />
    </Uklad>,
  );
}

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  api.mockImplementation(async (sciezka: string) => (String(sciezka) === "/me" ? { role: "project_manager" } : []));
  przywrocRejestr();
});

describe("/admin/kursy w układzie administracji (grupa włączona)", () => {
  it("ładowanie: jeden main, jeden #tresc, jeden odnośnik", async () => {
    apiPaged.mockReturnValue(new Promise(() => {}));
    const { container } = await zloz();
    await screen.findByRole("heading", { level: 1, name: "Kursy" });
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("dane: jeden main, jeden #tresc, jeden odnośnik", async () => {
    apiPaged.mockResolvedValue({ data: [KURS], meta: { current_page: 1, per_page: 100, total: 1, last_page: 1 } });
    const { container } = await zloz();
    await screen.findByText("Wywiad psychologiczny");
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("błąd sieci: jeden main, jeden #tresc, jeden odnośnik", async () => {
    apiPaged.mockRejectedValue(new TypeError("Failed to fetch"));
    const { container } = await zloz();
    await screen.findByText("Nie udało się wczytać listy kursów");
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("odmowa 403: jeden main, jeden #tresc, jeden odnośnik, bez rekordów", async () => {
    const { ApiError } = await import("@/lib/api/klient");
    apiPaged.mockRejectedValue(new ApiError({ status: 403, code: "forbidden", message: "Zabronione" }));
    const { container } = await zloz();
    await screen.findByText(/tylko dla administracji/);
    expect(screen.queryByText("Wywiad psychologiczny")).toBeNull();
    expect(zmierz(container)).toEqual(JEDEN);
  });
});

describe("kontrola dodatnia: ekran bez dostawcy powłoki", () => {
  it("ekran wewnątrz samej powłoki i bez dostawcy daje dwa main", async () => {
    apiPaged.mockReturnValue(new Promise(() => {}));
    const { default: PanelShell } = await import("@/components/layout/PanelShell");
    const { KursyAdministracji } = await import("@/nowy-front/kursy-administracji/KursyAdministracji");

    const { container } = render(
      <PanelShell panelName="Administracja" menu={[]}>
        <KursyAdministracji />
      </PanelShell>,
    );

    expect(zmierz(container).main).toBe(2);
  });
});
