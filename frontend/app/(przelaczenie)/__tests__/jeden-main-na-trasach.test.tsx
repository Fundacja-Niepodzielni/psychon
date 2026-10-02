import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Obie trasy grupy `(przelaczenie)` złożone tak jak robi to router: układ
 * grupy, układ segmentu (powłoka panelu; w administracji za strażnikiem
 * ról) i prawdziwy ekran, w czterech stanach (ładowanie, dane, błąd sieci,
 * odmowa 403). W każdym stanie dokładnie jeden `main`, jeden `#tresc`
 * i jeden odnośnik do treści. Podmienione są wyłącznie transport HTTP i
 * funkcje pobierające dane ekranów.
 */

const api = vi.fn();
const pobierzJa = vi.fn();
const pobierzMojeZgloszenia = vi.fn();
const pobierzZgloszeniaAdministracji = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: vi.fn().mockResolvedValue({ data: [], meta: undefined }),
  endSession: vi.fn(),
}));

vi.mock("@/lib/api/h01-wspolpraca", () => ({
  pobierzJa: (...args: unknown[]) => pobierzJa(...args),
  pobierzMojeZgloszenia: (...args: unknown[]) => pobierzMojeZgloszenia(...args),
  pobierzZgloszeniaAdministracji: (...args: unknown[]) => pobierzZgloszeniaAdministracji(...args),
  zglosWspolprace: vi.fn(),
  odpowiedzNaZgloszenie: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const { ApiError } = await import("@/lib/api/klient");
const { default: UkladPrzelaczenia } = await import("../layout");
const { default: UkladPanelu } = await import("../panel/layout");
const { default: UkladAdministracji } = await import("../admin/layout");
const { PoProgramieWspolpraca } = await import("@/nowy-front/po-programie-wspolpraca/PoProgramieWspolpraca");
const { ZgloszeniaWspolpracy } = await import("@/nowy-front/zgloszenia-wspolpracy/ZgloszeniaWspolpracy");

const STRONA = { current_page: 1, per_page: 25, total: 0, last_page: 1 };
const ZAKAZ = () => new ApiError({ status: 403, code: "forbidden", message: "Zabronione" });
const BLAD = () => new ApiError({ status: 500, code: "server_error", message: "Błąd" });
const PUSTA = { data: [], meta: STRONA };

function zmierz(container: HTMLElement) {
  return {
    main: container.querySelectorAll("main").length,
    cele: container.querySelectorAll("#tresc").length,
    odnosniki: container.querySelectorAll('a[href="#tresc"]').length,
  };
}

function trasaPanelu() {
  return render(
    <UkladPrzelaczenia>
      <UkladPanelu>
        <PoProgramieWspolpraca />
      </UkladPanelu>
    </UkladPrzelaczenia>,
  );
}

function trasaAdministracji() {
  return render(
    <UkladPrzelaczenia>
      <UkladAdministracji>
        <ZgloszeniaWspolpracy />
      </UkladAdministracji>
    </UkladPrzelaczenia>,
  );
}

const JEDEN = { main: 1, cele: 1, odnosniki: 1 };

beforeEach(() => {
  api.mockReset();
  pobierzJa.mockReset();
  pobierzMojeZgloszenia.mockReset();
  pobierzZgloszeniaAdministracji.mockReset();
  api.mockResolvedValue({ role: "volunteer" });
});

describe("/panel/dalsza-wspolpraca w układach grupy", () => {
  it("ładowanie: jeden main, jeden #tresc, jeden odnośnik", async () => {
    pobierzJa.mockReturnValue(new Promise(() => {}));
    pobierzMojeZgloszenia.mockReturnValue(new Promise(() => {}));
    const { container } = trasaPanelu();

    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("Po programie");
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("dane: jeden main, jeden #tresc, jeden odnośnik", async () => {
    pobierzJa.mockResolvedValue({ program_completed_at: "2026-09-01T00:00:00Z", role: "volunteer" });
    pobierzMojeZgloszenia.mockResolvedValue(PUSTA);
    const { container } = trasaPanelu();

    await screen.findByLabelText(/^Treść prośby/);
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("błąd sieci: jeden main, jeden #tresc, jeden odnośnik", async () => {
    pobierzJa.mockRejectedValue(BLAD());
    pobierzMojeZgloszenia.mockRejectedValue(BLAD());
    const { container } = trasaPanelu();

    await screen.findByText(/Nie udało się połączyć z serwerem/);
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("odmowa 403: jeden main, jeden #tresc, jeden odnośnik, bez formularza", async () => {
    pobierzJa.mockRejectedValue(ZAKAZ());
    pobierzMojeZgloszenia.mockRejectedValue(ZAKAZ());
    const { container } = trasaPanelu();

    await waitFor(() => expect(screen.queryByText(/Nie udało się połączyć z serwerem/)).toBeNull());
    await waitFor(() => expect(screen.getAllByRole("heading", { level: 1 }).length).toBeGreaterThan(0));
    expect(screen.queryByLabelText(/^Treść prośby/)).toBeNull();
    expect(zmierz(container)).toEqual(JEDEN);
  });
});

describe("/admin/zgloszenia-wspolpracy w układach grupy (rola administracji z atrapy /me)", () => {
  beforeEach(() => {
    api.mockResolvedValue({ role: "project_manager" });
  });

  it("ładowanie: jeden main, jeden #tresc, jeden odnośnik", async () => {
    pobierzZgloszeniaAdministracji.mockReturnValue(new Promise(() => {}));
    const { container } = trasaAdministracji();

    await screen.findByRole("heading", { level: 1, name: "Dalsza współpraca" });
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("dane: jeden main, jeden #tresc, jeden odnośnik", async () => {
    pobierzZgloszeniaAdministracji.mockResolvedValue(PUSTA);
    const { container } = trasaAdministracji();

    await screen.findByRole("combobox", { name: /^Stan/ });
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("błąd sieci: jeden main, jeden #tresc, jeden odnośnik", async () => {
    pobierzZgloszeniaAdministracji.mockRejectedValue(BLAD());
    const { container } = trasaAdministracji();

    await screen.findByText(/Nie udało się połączyć z serwerem/);
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("odmowa 403: jeden main, jeden #tresc, jeden odnośnik", async () => {
    pobierzZgloszeniaAdministracji.mockRejectedValue(ZAKAZ());
    const { container } = trasaAdministracji();

    await screen.findByText(/administracji/);
    expect(zmierz(container)).toEqual(JEDEN);
  });
});

describe("kontrola dodatnia: ekran bez dostawcy powłoki", () => {
  it("ekran wewnątrz samej powłoki i bez dostawcy daje dwa main na obu trasach", async () => {
    const { default: PanelShell } = await import("@/components/layout/PanelShell");
    pobierzJa.mockReturnValue(new Promise(() => {}));
    pobierzMojeZgloszenia.mockReturnValue(new Promise(() => {}));
    pobierzZgloszeniaAdministracji.mockReturnValue(new Promise(() => {}));

    const panel = render(
      <PanelShell panelName="Panel uczestnika" menu={[]}>
        <PoProgramieWspolpraca />
      </PanelShell>,
    );
    expect(zmierz(panel.container).main).toBe(2);
    panel.unmount();

    const admin = render(
      <PanelShell panelName="Administracja" menu={[]}>
        <ZgloszeniaWspolpracy />
      </PanelShell>,
    );
    expect(zmierz(admin.container).main).toBe(2);
  });
});
