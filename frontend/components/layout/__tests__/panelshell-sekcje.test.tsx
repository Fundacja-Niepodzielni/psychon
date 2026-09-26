import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { axeViolations } from "../../__tests__/axe-helper";

/**
 * Menu paneli w sekcjach: nagłówek sekcji jest przyciskiem, zwinięcie
 * zostaje w pamięci przeglądarki, sekcja z bieżącą stroną otwiera się po
 * wejściu z linku bezpośredniego, a menu bez pamięci działa rozwinięte.
 */

let sciezka = "/admin/uczestniczki";

vi.mock("next/navigation", () => ({
  usePathname: () => sciezka,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    endSession: vi.fn(),
    apiPaged: vi.fn().mockResolvedValue({ data: [], meta: undefined }),
  };
});

const PanelShell = (await import("@/components/layout/PanelShell")).default;
const { adminMenu, adminMenuSections } = await import("@/lib/menu/admin");
const { participantMenu, participantMenuSections } = await import("@/lib/menu/participant");
const { instructorMenu, instructorMenuSections } = await import("@/lib/menu/instructor");
const { filterMenuByRole } = await import("@/lib/menu/types");

const KLUCZ = "psychon.menu.admin";

/** Pamięć przeglądarki w teście: świeża mapa albo wersja, która zawsze odmawia. */
function zainstalujPamiec(odmawia = false) {
  const mapa = new Map<string, string>();
  const nie = () => {
    throw new Error("brak dostępu");
  };
  const pamiec = {
    getItem: odmawia ? nie : (k: string) => mapa.get(k) ?? null,
    setItem: odmawia ? nie : (k: string, v: string) => void mapa.set(k, String(v)),
    removeItem: (k: string) => void mapa.delete(k),
    clear: () => mapa.clear(),
    key: (i: number) => [...mapa.keys()][i] ?? null,
    get length() {
      return mapa.size;
    },
  };
  Object.defineProperty(window, "localStorage", { value: pamiec, configurable: true });
}

function renderAdmin() {
  return render(
    <PanelShell panelName="Administracja" menu={adminMenu} sections={adminMenuSections} menuKey="admin">
      <p>treść</p>
    </PanelShell>,
  );
}

function menuBoczne() {
  return screen.getAllByRole("navigation", { name: "Menu — Administracja" })[0];
}

describe("PanelShell — sekcje menu administracji", () => {
  beforeEach(() => {
    sciezka = "/admin/uczestniczki";
    zainstalujPamiec();
  });

  it("sześć nagłówków sekcji jako przyciski rozwinięte, każdy wskazuje swoją listę", () => {
    renderAdmin();
    const nav = menuBoczne();
    const naglowki = within(nav).getAllByRole("button");

    expect(naglowki.map((b) => b.textContent)).toEqual([
      "Nauka",
      "Osoby",
      "Praktyka",
      "Obsługa",
      "Raporty",
      "Konfiguracja",
    ]);
    for (const b of naglowki) {
      expect(b).toHaveAttribute("aria-expanded", "true");
      const lista = document.getElementById(b.getAttribute("aria-controls") ?? "");
      expect(lista?.tagName).toBe("UL");
    }
    expect(within(nav).getAllByRole("link")).toHaveLength(15);
  });

  it("klik zwija sekcję, chowa jej listę i zapisuje stan w pamięci przeglądarki", () => {
    renderAdmin();
    const nauka = within(menuBoczne()).getByRole("button", { name: "Nauka" });

    fireEvent.click(nauka);

    expect(nauka).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById(nauka.getAttribute("aria-controls") ?? "")).toHaveAttribute("hidden");
    // fireEvent.click wyżej wywołuje synchroniczny handler onClick (toggle
    // stanu przez useState), opakowany przez RTL w act() — zwinięcie sekcji
    // jest widoczne od razu w tym samym wywołaniu, bez oczekiwania.
    expect(within(menuBoczne()).queryByRole("link", { name: "Kursy" })).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(KLUCZ) ?? "null")).toEqual(["nauka"]);

    fireEvent.click(nauka);
    expect(nauka).toHaveAttribute("aria-expanded", "true");
    expect(JSON.parse(window.localStorage.getItem(KLUCZ) ?? "null")).toEqual([]);
  });

  it("wejście z linku bezpośredniego: sekcja z bieżącą stroną rozwinięta mimo zapisanego zwinięcia", () => {
    window.localStorage.setItem(KLUCZ, JSON.stringify(["osoby", "nauka"]));
    renderAdmin();
    const nav = menuBoczne();

    expect(within(nav).getByRole("button", { name: "Osoby" })).toHaveAttribute("aria-expanded", "true");
    expect(within(nav).getByRole("button", { name: "Nauka" })).toHaveAttribute("aria-expanded", "false");
    expect(within(nav).getByRole("link", { current: "page" })).toHaveAccessibleName("Uczestniczki");
    expect(JSON.parse(window.localStorage.getItem(KLUCZ) ?? "null")).toEqual(["nauka"]);
  });

  it("KONTROLA NEGATYWNA: bez dostępu do pamięci przeglądarki menu działa rozwinięte i dalej się zwija", () => {
    zainstalujPamiec(true);
    renderAdmin();
    const nav = menuBoczne();
    const przyciski = within(nav).getAllByRole("button");

    expect(przyciski.every((b) => b.getAttribute("aria-expanded") === "true")).toBe(true);
    fireEvent.click(within(nav).getByRole("button", { name: "Raporty" }));
    expect(within(nav).getByRole("button", { name: "Raporty" })).toHaveAttribute("aria-expanded", "false");
  });

  it("ikony są ozdobą: każda ma aria-hidden, nazwą linku jest sama etykieta", () => {
    renderAdmin();
    const nav = menuBoczne();
    const ikony = nav.querySelectorAll("svg");

    expect(ikony.length).toBe(15 + 6);
    expect([...ikony].filter((s) => s.getAttribute("aria-hidden") !== "true")).toHaveLength(0);
    expect(within(nav).getByRole("link", { name: "Skrzynka e-maili" })).toBeInTheDocument();
  });

  it("wąski ekran: przycisk Menu otwiera okno z tymi samymi sekcjami", () => {
    renderAdmin();
    const przycisk = screen.getByRole("button", { name: "Menu" });
    expect(przycisk).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(przycisk);

    expect(przycisk).toHaveAttribute("aria-expanded", "true");
    const okno = document.getElementById(przycisk.getAttribute("aria-controls") ?? "");
    expect(okno?.tagName).toBe("DIALOG");
    const sekcjeOkna = within(okno as HTMLElement)
      .getAllByRole("button")
      .filter((b) => b.hasAttribute("aria-expanded"))
      .map((b) => b.textContent);
    expect(sekcjeOkna).toEqual(["Nauka", "Osoby", "Praktyka", "Obsługa", "Raporty", "Konfiguracja"]);
  });

  it("axe: 0 naruszeń w szkielecie z sekcjami", async () => {
    const { container } = renderAdmin();
    const naruszenia = await axeViolations(container);
    expect(naruszenia).toEqual([]);
  });
});

describe("PanelShell — ten sam mechanizm w pozostałych panelach", () => {
  beforeEach(() => {
    zainstalujPamiec();
  });

  it("uczestnik (wolontariuszka, 10 wpisów): sekcje Program i Twoje konto, ikony przy każdym wpisie", () => {
    sciezka = "/panel/start";
    render(
      <PanelShell
        panelName="Panel uczestnika"
        menu={filterMenuByRole(participantMenu, "volunteer")}
        sections={participantMenuSections}
        menuKey="uczestnik"
      >
        <p>treść</p>
      </PanelShell>,
    );
    const nav = screen.getAllByRole("navigation", { name: "Menu — Panel uczestnika" })[0];

    expect(within(nav).getAllByRole("button").map((b) => b.textContent)).toEqual(["Program", "Twoje konto"]);
    expect(within(nav).getAllByRole("link")).toHaveLength(10);
    expect(nav.querySelectorAll("a svg")).toHaveLength(10);
  });

  it("uczestnik (student, 6 wpisów): jedna lista bez nagłówków, ikony przy każdym wpisie", () => {
    sciezka = "/panel/start";
    render(
      <PanelShell
        panelName="Panel uczestnika"
        menu={filterMenuByRole(participantMenu, "student")}
        sections={participantMenuSections}
        menuKey="uczestnik"
      >
        <p>treść</p>
      </PanelShell>,
    );
    const nav = screen.getAllByRole("navigation", { name: "Menu — Panel uczestnika" })[0];

    expect(within(nav).queryAllByRole("button")).toHaveLength(0);
    expect(within(nav).getAllByRole("link")).toHaveLength(6);
    expect(nav.querySelectorAll("a svg")).toHaveLength(6);
  });

  it("prowadzący (5 wpisów): jedna lista bez nagłówków, z ikonami", () => {
    sciezka = "/prowadzacy";
    render(
      <PanelShell
        panelName="Panel prowadzącego"
        menu={instructorMenu}
        sections={instructorMenuSections}
        menuKey="prowadzacy"
      >
        <p>treść</p>
      </PanelShell>,
    );
    const nav = screen.getAllByRole("navigation", { name: "Menu — Panel prowadzącego" })[0];

    expect(within(nav).queryAllByRole("button")).toHaveLength(0);
    expect(within(nav).getAllByRole("link")).toHaveLength(5);
    expect(nav.querySelectorAll("a svg")).toHaveLength(5);
  });
});
