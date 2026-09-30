import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";

/**
 * Układ segmentu `/admin` grupy `(przelaczenie)` złożony tak jak robi to
 * router: układ grupy, a w nim układ segmentu (strażnik ról + powłoka),
 * a w nim strona na szablonie. Podmieniony jest wyłącznie transport HTTP.
 */

const api = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: vi.fn().mockResolvedValue({ data: [], meta: undefined }),
  endSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/zgloszenia-wspolpracy",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const { ApiError } = await import("@/lib/api/klient");
const { default: UkladPrzelaczenia } = await import("../layout");
const { default: UkladAdministracji } = await import("../admin/layout");

function StronaProbna() {
  return <ListTemplate naglowek={<h1>Zgłoszenia współpracy</h1>} lista={<p>Treść strony próbnej</p>} />;
}

function zlozUklad() {
  return render(
    <UkladPrzelaczenia>
      <UkladAdministracji>
        <StronaProbna />
      </UkladAdministracji>
    </UkladPrzelaczenia>,
  );
}

function zmierz(container: HTMLElement) {
  return {
    main: container.querySelectorAll("main").length,
    cele: container.querySelectorAll("#tresc").length,
    odnosniki: container.querySelectorAll('a[href="#tresc"]').length,
  };
}

function hrefyMenu(container: HTMLElement): string[] {
  const nawigacja = container.querySelector('nav[aria-label="Menu — Administracja"]');
  return Array.from(nawigacja?.querySelectorAll("a") ?? []).map((a) => a.getAttribute("href") ?? "");
}

beforeEach(() => {
  api.mockReset();
});

describe.each(["project_manager", "super_admin"])("układ administracji w grupie (przelaczenie) — rola %s", (rola) => {
  it("jeden main, jeden #tresc, jeden odnośnik do treści, menu administracji", async () => {
    api.mockResolvedValue({ role: rola });
    const { container } = zlozUklad();

    await waitFor(() => expect(screen.getByText("Treść strony próbnej")).toBeTruthy());

    expect(zmierz(container)).toEqual({ main: 1, cele: 1, odnosniki: 1 });
    expect(container.querySelector("nav[aria-label='Menu — Administracja']")).not.toBeNull();
    // Nowa ramka z makiety (ta sama nazwa menu co w dotychczasowej powłoce).
    expect(container.querySelector("[data-powloka-panelu]")).not.toBeNull();
    expect(hrefyMenu(container)).toEqual(expect.arrayContaining(["/admin/kursy", "/admin/uczestniczki"]));
    expect(container.querySelector<HTMLElement>("[data-style-id='szablon-lista']")?.tagName).toBe("DIV");
  });
});

describe("układ administracji w grupie (przelaczenie) — zachowanie strażnika ról", () => {
  it.each(["volunteer", "student", "instructor"])(
    "rola %s: wspólny ekran odmowy, bez menu, bez main i bez treści strony",
    async (rola) => {
      api.mockResolvedValue({ role: rola });
      const { container } = zlozUklad();

      await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Brak dostępu"));

      expect(zmierz(container)).toEqual({ main: 0, cele: 0, odnosniki: 0 });
      expect(container.querySelector("nav")).toBeNull();
      expect(screen.queryByText("Treść strony próbnej")).toBeNull();
      expect(container.textContent).toContain("Opiekun Projektu");
      expect(api).toHaveBeenCalledTimes(1);
      expect(api).toHaveBeenCalledWith("/me");
    },
  );

  it("do czasu odpowiedzi /me: tylko nagłówek ładowania, bez menu i bez treści", () => {
    api.mockReturnValue(new Promise(() => {}));
    const { container } = zlozUklad();

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Wczytywanie…");
    expect(container.querySelector("nav")).toBeNull();
    expect(screen.queryByText("Treść strony próbnej")).toBeNull();
  });

  it("błąd sieci przy /me: ekran błędu połączenia, bez menu i bez treści", async () => {
    api.mockRejectedValue(new ApiError({ status: 500, code: "server_error", message: "Błąd" }));
    const { container } = zlozUklad();

    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Błąd połączenia"));

    expect(container.querySelector("nav")).toBeNull();
    expect(screen.queryByText("Treść strony próbnej")).toBeNull();
  });

  it("kontrola dodatnia: licznik wykrywa drugi main, gdy szablon stoi w samej powłoce bez dostawcy", async () => {
    const { default: PanelShell } = await import("@/components/layout/PanelShell");
    const { container } = render(
      <PanelShell panelName="Administracja" menu={[]}>
        <StronaProbna />
      </PanelShell>,
    );
    expect(zmierz(container).main).toBe(2);
  });
});
