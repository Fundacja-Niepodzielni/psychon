import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { odbierzZapowiedzFokusu, zapowiedzFokusSprawy } from "../../wspolne/fokus-otwartej-sprawy";
import { ZGLOSZENIE } from "./atrapy";

/**
 * Fokus po wejściu na ekran decyzji o zgłoszeniu: z „Otwórz” na ekranie
 * „Sprawy do decyzji” fokus po wczytaniu staje na nagłówku sprawy (`h1`),
 * nigdy na przycisku decyzji; wejście inną drogą zostawia fokus na stronie
 * (pierwszy Tab nadal trafia w „Przejdź do treści”).
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const api = vi.fn();
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: (...a: unknown[]) => api(...a),
}));
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, api: (...a: unknown[]) => api(...a) };
});
vi.mock("@/lib/api/pliki", () => ({ downloadFile: vi.fn() }));

const { ZgloszenieDecyzja } = await import("../ZgloszenieDecyzja");

const NAGLOWEK = /^Zgłoszenie: Marta Demo/;

beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (sciezka: string, opcje?: { method?: string }) => {
    if (sciezka === "/admin/applications/31" && !opcje?.method) return ZGLOSZENIE;
    throw new Error(`nieoczekiwane żądanie ${opcje?.method ?? "GET"} ${sciezka}`);
  });
});

afterEach(() => {
  odbierzZapowiedzFokusu();
  window.history.pushState({}, "", "/");
});

describe("ZgloszenieDecyzja — fokus po wejściu", () => {
  it("z „Otwórz” ze Spraw: fokus na nagłówku zgłoszenia, nie na przycisku decyzji", async () => {
    zapowiedzFokusSprawy("/admin/nabor/31");
    window.history.pushState({}, "", "/admin/nabor/31");
    render(<ZgloszenieDecyzja id="31" />);

    const naglowek = await screen.findByRole("heading", { level: 1, name: NAGLOWEK });
    await waitFor(() => expect(naglowek).toHaveFocus());
    expect(naglowek).toHaveAttribute("tabindex", "-1");
    expect(document.activeElement?.tagName).not.toBe("BUTTON");
    expect(api.mock.calls.filter(([, opcje]) => (opcje as { method?: string } | undefined)?.method)).toHaveLength(0);
  });

  it("wejście bez „Otwórz” (adres, odświeżenie): fokus zostaje na stronie", async () => {
    window.history.pushState({}, "", "/admin/nabor/31");
    render(<ZgloszenieDecyzja id="31" />);

    await screen.findByRole("heading", { level: 1, name: NAGLOWEK });
    await screen.findByRole("button", { name: "Zatwierdź i utwórz konto" });
    expect(document.activeElement).toBe(document.body);
  });

  it("zapowiedź innej sprawy nie przenosi fokusu na tym ekranie", async () => {
    zapowiedzFokusSprawy("/admin/profile/2");
    window.history.pushState({}, "", "/admin/nabor/31");
    render(<ZgloszenieDecyzja id="31" />);

    await screen.findByRole("heading", { level: 1, name: NAGLOWEK });
    await screen.findByRole("button", { name: "Zatwierdź i utwórz konto" });
    expect(document.activeElement).toBe(document.body);
  });
});
