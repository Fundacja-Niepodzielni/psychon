import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { WNIOSEK } from "./atrapy";

/**
 * Decyzja o wniosku — struktura karty i nagłówka: pary etykieta–wartość stoją w jednym
 * kontenerze (jedna siatka, wspólna kolumna etykiet z arkusza karty), a stan wniosku przy h1
 * jest plakietką `Badge` w tym samym kształcie co w wierszach listy. Geometrię (`left`
 * wartości, szerokość kolumny, tło i promień plakietki) mierzy e2e w przeglądarce.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const api = vi.fn();
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, api: (...a: unknown[]) => api(...a) };
});
vi.mock("@/lib/api/pliki", () => ({ downloadFile: vi.fn() }));

const { ProfilDecyzja } = await import("../ProfilDecyzja");

beforeEach(() => {
  api.mockReset().mockResolvedValue(WNIOSEK);
});

describe("Wniosek o profil — karta i nagłówek", () => {
  it("pary etykieta–wartość są rodzeństwem w jednym kontenerze karty", async () => {
    render(<ProfilDecyzja id="12" />);
    await screen.findByRole("heading", { level: 1, name: /^Wniosek o profil: / });

    const karta = screen.getByRole("article", { name: "Ewa Przykładowa" });
    const etykiety = ["Miasto", "Podejście", "Specjalizacje", "Zgoda na publikację profilu", "Złożono"];
    const wiersze = etykiety.map((etykieta) => within(karta).getByText(etykieta).parentElement as HTMLElement);

    const kontener = wiersze[0].parentElement as HTMLElement;
    expect(kontener).not.toBeNull();
    for (const wiersz of wiersze) {
      expect(wiersz.parentElement).toBe(kontener);
    }
    expect(kontener.children).toHaveLength(etykiety.length);
    // Etykieta i wartość to dwie komórki wiersza pary: wspólna kolumna to ich kolumny w siatce kontenera.
    for (const wiersz of wiersze) {
      expect(wiersz.children).toHaveLength(2);
    }
  });

  it("stan wniosku przy h1 to plakietka Badge w nagłówku, z tekstem stanu", async () => {
    render(<ProfilDecyzja id="12" />);
    const h1 = await screen.findByRole("heading", { level: 1, name: /^Wniosek o profil: / });

    const naglowek = h1.closest("header") as HTMLElement;
    const plakietka = within(naglowek).getByText("czeka na decyzję");
    expect(plakietka.className).toMatch(/plakietka/);
    expect(plakietka.className).toMatch(/pending/);
    // To samo, co w wierszu listy: `Badge` jest `span` z klasą wariantu, nie zwykły tekst.
    expect(plakietka.tagName).toBe("SPAN");
  });
});
