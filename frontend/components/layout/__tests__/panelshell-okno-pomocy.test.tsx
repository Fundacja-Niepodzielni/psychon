import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Okno pomocy dostepne z kazdego ekranu zalogowanej strefy — przycisk
 * renderowany w `PanelShell` (wspolny szkielet panelu uczestnika,
 * prowadzacego i administracji), NIE w rejestrze menu roli.
 *
 * Kontrola negatywna dla tego kryterium: usuniecie `<HelpWidget />`
 * z `components/layout/PanelShell.tsx` gasi ten test na czerwono.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/panel/start",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    endSession: vi.fn(),
    // PanelShell renderuje tez `NotificationBell`, ktory sam odpytuje liste
    // powiadomien — atrapa, zeby test mierzyl wylacznie obecnosc przycisku pomocy.
    apiPaged: vi.fn().mockResolvedValue({ data: [], meta: undefined }),
  };
});

const PanelShell = (await import("@/components/layout/PanelShell")).default;

function renderShell() {
  return render(
    <PanelShell panelName="Panel testowy" menu={[]}>
      <p>treść</p>
    </PanelShell>,
  );
}

describe("PanelShell — okno pomocy", () => {
  it("przycisk pomocy jest widoczny w nagłówku szkieletu panelu", () => {
    renderShell();

    expect(screen.getByRole("button", { name: "Pomoc" })).toBeInTheDocument();
  });

  it("przycisk pomocy nie jest częścią menu bocznego (rejestr ról)", () => {
    renderShell();

    const menuBoczne = screen.getAllByRole("navigation", { name: "Menu — Panel testowy" })[0];
    expect(menuBoczne).not.toContainElement(screen.getByRole("button", { name: "Pomoc" }));
  });
});
