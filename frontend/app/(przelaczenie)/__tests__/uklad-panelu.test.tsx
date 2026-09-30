import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";

/**
 * Układ segmentu `/panel` grupy `(przelaczenie)` złożony tak jak robi to
 * router: układ grupy, a w nim układ segmentu, a w nim strona na szablonie.
 * Z transportu HTTP podmieniona jest wyłącznie warstwa klienta API — prawdziwa
 * jest powłoka, rejestr menu i filtr roli.
 */

const api = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: vi.fn().mockResolvedValue({ data: [], meta: undefined }),
  endSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/panel/dalsza-wspolpraca",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const { default: UkladPrzelaczenia } = await import("../layout");
const { default: UkladPanelu } = await import("../panel/layout");

function StronaProbna() {
  return <ListTemplate naglowek={<h1>Dalsza współpraca</h1>} lista={<p>Treść strony próbnej</p>} />;
}

function zlozUklad() {
  return render(
    <UkladPrzelaczenia>
      <UkladPanelu>
        <StronaProbna />
      </UkladPanelu>
    </UkladPrzelaczenia>,
  );
}

/** Liczby punktów orientacyjnych treści w drzewie. */
function zmierz(container: HTMLElement) {
  return {
    main: container.querySelectorAll("main").length,
    cele: container.querySelectorAll("#tresc").length,
    odnosniki: container.querySelectorAll('a[href="#tresc"]').length,
  };
}

function hrefyMenu(container: HTMLElement): string[] {
  const nawigacja = container.querySelector('nav[aria-label="Menu — Panel uczestnika"]');
  return Array.from(nawigacja?.querySelectorAll("a") ?? []).map((a) => a.getAttribute("href") ?? "");
}

beforeEach(() => {
  api.mockReset();
});

describe("układ panelu w grupie (przelaczenie)", () => {
  it("wolontariusz: jeden main, jeden #tresc, jeden odnośnik do treści, menu uczestnika", async () => {
    api.mockResolvedValue({ role: "volunteer" });
    const { container } = zlozUklad();

    await waitFor(() => expect(hrefyMenu(container)).toContain("/panel/superwizja"));

    expect(zmierz(container)).toEqual({ main: 1, cele: 1, odnosniki: 1 });
    expect(container.querySelector("nav[aria-label='Menu — Panel uczestnika']")).not.toBeNull();
    expect(hrefyMenu(container)).toEqual(expect.arrayContaining(["/panel/staz", "/panel/superwizja", "/panel/start"]));
  });

  it("szablon strony pod powłoką to div z data-style-id, a jedyny main niesie powłoka", async () => {
    api.mockResolvedValue({ role: "volunteer" });
    const { container } = zlozUklad();
    await waitFor(() => expect(hrefyMenu(container)).toContain("/panel/superwizja"));

    const korzen = container.querySelector<HTMLElement>("[data-style-id='szablon-lista']");
    expect(korzen?.tagName).toBe("DIV");
    expect(korzen?.closest("main")?.id).toBe("tresc");
    expect(screen.getByText("Treść strony próbnej")).toBeTruthy();
  });

  it("student: menu bez wpisów tylko dla wolontariusza, nadal jeden main", async () => {
    api.mockResolvedValue({ role: "student" });
    const { container } = zlozUklad();

    await waitFor(() => expect(api).toHaveBeenCalledWith("/me"));
    await waitFor(() => expect(hrefyMenu(container)).toContain("/panel/start"));

    expect(hrefyMenu(container)).not.toContain("/panel/superwizja");
    expect(hrefyMenu(container)).not.toContain("/panel/staz");
    expect(zmierz(container)).toEqual({ main: 1, cele: 1, odnosniki: 1 });
  });

  it("do czasu odpowiedzi /me wpisy zależne od roli są ukryte", async () => {
    let odpowiedz: (wartosc: { role: string }) => void = () => {};
    api.mockReturnValue(new Promise((rozwiaz) => (odpowiedz = rozwiaz)));
    const { container } = zlozUklad();

    expect(hrefyMenu(container)).not.toContain("/panel/superwizja");
    expect(hrefyMenu(container)).not.toContain("/panel/staz");
    expect(zmierz(container)).toEqual({ main: 1, cele: 1, odnosniki: 1 });

    odpowiedz({ role: "volunteer" });
    await waitFor(() => expect(hrefyMenu(container)).toContain("/panel/superwizja"));
  });

  it("pierwszym elementem fokusu jest odnośnik do treści, a cel #tresc istnieje", async () => {
    api.mockResolvedValue({ role: "volunteer" });
    const { container } = zlozUklad();
    await waitFor(() => expect(hrefyMenu(container)).toContain("/panel/superwizja"));

    const pierwszy = container.querySelector<HTMLElement>("a[href], button, input, select, textarea, [tabindex]");
    expect(pierwszy?.tagName).toBe("A");
    expect(pierwszy?.getAttribute("href")).toBe("#tresc");
    expect(pierwszy?.textContent).toBe("Przejdź do treści");
    expect(document.getElementById("tresc")?.tagName).toBe("MAIN");
  });

  it("kontrola dodatnia: szablon poza dostawcą w samej powłoce daje dwa main i dwa #tresc", async () => {
    const { default: PanelShell } = await import("@/components/layout/PanelShell");
    const { container } = render(
      <PanelShell panelName="Panel uczestnika" menu={[]}>
        <StronaProbna />
      </PanelShell>,
    );
    expect(zmierz(container)).toEqual({ main: 2, cele: 2, odnosniki: 1 });
  });

  it("kontrola dodatnia: dodatkowy odnośnik skoku w układzie podnosi licznik do dwóch", async () => {
    api.mockResolvedValue({ role: "volunteer" });
    const { container } = render(
      <UkladPrzelaczenia>
        <a href="#tresc">Przejdź do treści</a>
        <UkladPanelu>
          <StronaProbna />
        </UkladPanelu>
      </UkladPrzelaczenia>,
    );
    await waitFor(() => expect(hrefyMenu(container)).toContain("/panel/superwizja"));
    expect(zmierz(container).odnosniki).toBe(2);
  });
});
