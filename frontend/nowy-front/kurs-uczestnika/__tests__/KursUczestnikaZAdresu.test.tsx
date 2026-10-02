import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { kursSzkicu } from "./atrapy";

/**
 * Tryb podglądu z adresu i roli: pas wyłącznie przy parametrze
 * `podglad=1` ORAZ roli personelu albo prowadzącego — cztery nogi: personel
 * z parametrem, prowadzący z parametrem, personel bez parametru, uczestnik
 * z parametrem.
 */

const api = vi.fn();
let adres = "";

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(adres) }));

const { KursUczestnikaZAdresu } = await import("../KursUczestnikaZAdresu");

const SLUG = "pierwsza-pomoc-psychologiczna";

beforeEach(() => {
  api.mockReset();
  adres = "";
});

afterEach(() => {
  cleanup();
});

async function pokaz(parametry: string, rola: string) {
  adres = parametry;
  api.mockImplementation((sciezka: string) => {
    if (sciezka === "/me") return Promise.resolve({ id: 1, role: rola });
    if (sciezka.startsWith("/courses/")) return Promise.resolve(kursSzkicu({ ukonczone: 2, zamknieteOd: 4 }));
    return Promise.reject(new Error(`nieoczekiwane wywołanie: ${sciezka}`));
  });
  await act(async () => {
    render(<KursUczestnikaZAdresu slug={SLUG} />);
  });
  await screen.findByRole("heading", { level: 1, name: "Pierwsza pomoc psychologiczna" });
}

const pas = () => screen.queryByRole("region", { name: "Tryb podglądu" });
const zamkniete = () => document.querySelectorAll("[data-zamknieta]").length;

describe("pas trybu podglądu: parametr adresu i rola", () => {
  it("personel z parametrem: pas, odnośnik do edycji kursu administracji, lekcje otwarte", async () => {
    await pokaz("podglad=1", "project_manager");
    await waitFor(() => expect(pas()).not.toBeNull());
    expect(screen.getByRole("link", { name: "Wróć do edycji kursu" })).toHaveAttribute("href", "/admin/kursy/2");
    expect(zamkniete()).toBe(0);
  });

  it("prowadzący z parametrem: pas, odnośnik do jego ekranu kursu", async () => {
    await pokaz("podglad=1", "instructor");
    await waitFor(() => expect(pas()).not.toBeNull());
    expect(screen.getByRole("link", { name: "Wróć do edycji kursu" })).toHaveAttribute("href", "/prowadzacy/kursy/2");
    expect(zamkniete()).toBe(0);
  });

  it("personel bez parametru: zwykły ekran, konto nie jest czytane, lekcje zamknięte jak w odczycie", async () => {
    await pokaz("", "super_admin");
    expect(pas()).toBeNull();
    expect(zamkniete()).toBe(4);
    expect(api).not.toHaveBeenCalledWith("/me");
  });

  it("uczestnik z parametrem: zwykły ekran, pasa nie ma, lekcje zamknięte jak w odczycie", async () => {
    await pokaz("podglad=1", "volunteer");
    await waitFor(() => expect(api).toHaveBeenCalledWith("/me"));
    await act(async () => {});
    expect(pas()).toBeNull();
    expect(screen.queryByText("Wróć do edycji kursu")).toBeNull();
    expect(zamkniete()).toBe(4);
  });

  it("kontrola dodatnia: te same dane z zamienioną rolą uczestnika na prowadzącego przełączają pas", async () => {
    await pokaz("podglad=1", "student");
    await act(async () => {});
    expect(pas()).toBeNull();
    cleanup();
    await pokaz("podglad=1", "instructor");
    await waitFor(() => expect(pas()).not.toBeNull());
  });
});
