import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { odbierzZapowiedzFokusu, zapowiedzFokusSprawy } from "../../wspolne/fokus-otwartej-sprawy";
import { WNIOSEK } from "./atrapy";

/**
 * Fokus po wejściu na ekran decyzji o wniosku o profil: z „Otwórz” na ekranie
 * „Sprawy do decyzji” fokus po wczytaniu staje na nagłówku wniosku (`h1`),
 * nigdy na przycisku decyzji; wejście inną drogą zostawia fokus na stronie.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/profile/12",
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const api = vi.fn();
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, api: (...a: unknown[]) => api(...a) };
});
vi.mock("@/lib/api/pliki", () => ({ downloadFile: vi.fn() }));

const { ProfilDecyzja } = await import("../ProfilDecyzja");

const NAGLOWEK = /^Wniosek o profil: Ewa Przykładowa/;

beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (sciezka: string, opcje?: { method?: string }) => {
    if (sciezka === "/admin/profiles/12" && !opcje?.method) return WNIOSEK;
    throw new Error(`nieoczekiwane żądanie ${opcje?.method ?? "GET"} ${sciezka}`);
  });
});

afterEach(() => {
  odbierzZapowiedzFokusu();
  window.history.pushState({}, "", "/");
});

describe("ProfilDecyzja — fokus po wejściu", () => {
  it("z „Otwórz” ze Spraw: fokus na nagłówku wniosku, nie na przycisku decyzji", async () => {
    zapowiedzFokusSprawy("/admin/profile/12");
    window.history.pushState({}, "", "/admin/profile/12");
    render(<ProfilDecyzja id="12" />);

    const naglowek = await screen.findByRole("heading", { level: 1, name: NAGLOWEK });
    await waitFor(() => expect(naglowek).toHaveFocus());
    expect(naglowek).toHaveAttribute("tabindex", "-1");
    expect(document.activeElement?.tagName).not.toBe("BUTTON");
    expect(api.mock.calls.filter(([, opcje]) => (opcje as { method?: string } | undefined)?.method)).toHaveLength(0);
  });

  it("wejście bez „Otwórz” (adres, odświeżenie): fokus zostaje na stronie", async () => {
    window.history.pushState({}, "", "/admin/profile/12");
    render(<ProfilDecyzja id="12" />);

    await screen.findByRole("heading", { level: 1, name: NAGLOWEK });
    await screen.findByRole("button", { name: "Zatwierdź" });
    expect(document.activeElement).toBe(document.body);
  });
});
