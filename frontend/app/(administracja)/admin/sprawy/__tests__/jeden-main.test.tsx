import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * Trasa `/admin/sprawy` z włączoną grupą złożona tak jak robi to router:
 * układ administracji (strażnik ról i ramka) i strona z nowym ekranem, w
 * czterech stanach (ładowanie, dane, błąd sieci, odmowa 403). W każdym stanie
 * dokładnie jeden `main`, jeden `#tresc` i jeden odnośnik do treści. Podmienione
 * są wyłącznie moduły transportu HTTP.
 */

const api = vi.fn();
const apiPaged = vi.fn();

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return { ...actual, api: (...args: unknown[]) => api(...args), apiPaged: (...args: unknown[]) => apiPaged(...args) };
});

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  endSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/sprawy",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const TRASA_SPRAW = "/admin/supervision/cases";
const STRONA_PUSTA = { data: [], meta: { current_page: 1, per_page: 100, total: 0, last_page: 1 } };

function zmierz(container: HTMLElement) {
  return {
    main: container.querySelectorAll("main").length,
    cele: container.querySelectorAll("#tresc").length,
    odnosniki: container.querySelectorAll('a[href="#tresc"]').length,
  };
}

const JEDEN = { main: 1, cele: 1, odnosniki: 1 };

async function zloz() {
  podmienRejestr({ sprawy: true });
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

describe("/admin/sprawy w układzie administracji (grupa włączona)", () => {
  it("ładowanie: jeden main, jeden #tresc, jeden odnośnik", async () => {
    apiPaged.mockReturnValue(new Promise(() => {}));
    const { container } = await zloz();

    await screen.findByRole("heading", { level: 1, name: "Sprawy do decyzji" });
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("dane: jeden main, jeden #tresc, jeden odnośnik", async () => {
    apiPaged.mockImplementation(async (sciezka: string) =>
      String(sciezka).startsWith(TRASA_SPRAW)
        ? {
            data: [
              {
                id: 7,
                subject: "Nieobecność na dyżurze",
                body: "Treść.",
                created_at: "2026-09-01T10:00:00Z",
                reporter: { id: 5, first_name: "Joanna", last_name: "Demo" },
                volunteer: null,
              },
            ],
          }
        : STRONA_PUSTA,
    );
    const { container } = await zloz();

    // Zwinięty wiersz sprawy nie pokazuje tematu — temat stoi dopiero po „Otwórz”.
    const otworz = await screen.findByRole("button", { name: /^Otwórz sprawę od prowadzącego/ });
    expect(screen.queryByText("Nieobecność na dyżurze")).toBeNull();
    expect(zmierz(container)).toEqual(JEDEN);

    fireEvent.click(otworz);
    await screen.findByText("Nieobecność na dyżurze");
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("błąd sieci: jeden main, jeden #tresc, jeden odnośnik", async () => {
    apiPaged.mockRejectedValue(new TypeError("Failed to fetch"));
    const { container } = await zloz();

    await screen.findByText("Nie udało się wczytać spraw");
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("odmowa 403: jeden main, jeden #tresc, jeden odnośnik, bez rekordów", async () => {
    const { ApiError } = await import("@/lib/api/klient");
    apiPaged.mockRejectedValue(new ApiError({ status: 403, code: "forbidden", message: "Zabronione" }));
    const { container } = await zloz();

    await screen.findByRole("heading", { name: "Nie masz dostępu do tego ekranu" });
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Sprawy zgłoszone przez prowadzących" })).toBeNull());
    expect(container.querySelectorAll('[data-testid^="sprawa-prowadzacego-"]')).toHaveLength(0);
    expect(zmierz(container)).toEqual(JEDEN);
  });
});

describe("kontrola dodatnia: ekran bez dostawcy powłoki", () => {
  it("ekran wewnątrz samej powłoki i bez dostawcy daje dwa main", async () => {
    apiPaged.mockReturnValue(new Promise(() => {}));
    const { default: PanelShell } = await import("@/components/layout/PanelShell");
    const { Sprawy } = await import("@/nowy-front/sprawy/Sprawy");

    const { container } = render(
      <PanelShell panelName="Administracja" menu={[]}>
        <Sprawy />
      </PanelShell>,
    );

    expect(zmierz(container).main).toBe(2);
  });
});
