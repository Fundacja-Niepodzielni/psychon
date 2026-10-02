import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { ApiError } from "@/lib/api/klient";
import { DOKUMENTY_PUSTE, DOKUMENTY_Z_LISTA, WARUNKI_NIESPELNIONE, WARUNKI_SPELNIONE } from "./atrapy";

/**
 * Dostępność obu ekranów w każdym stanie: axe (bez kontrastu — jsdom go nie liczy), dokładnie jeden
 * `h1`, jeden punkt orientacyjny treści i kolejność nagłówków bez przeskoków (h1 → h2).
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const api = vi.fn();
vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
}));

const pobierzWarunki = vi.fn();
const zlecCertyfikat = vi.fn();
const pobierzDokumenty = vi.fn();
vi.mock("../dane", () => ({
  NAZWA_PLIKU_CERTYFIKATU: "certyfikat.html",
  pobierzWarunki: (...args: unknown[]) => pobierzWarunki(...args),
  zlecCertyfikat: (...args: unknown[]) => zlecCertyfikat(...args),
  pobierzCertyfikat: vi.fn(),
  zapiszPlik: vi.fn(),
  pobierzDokumenty: (...args: unknown[]) => pobierzDokumenty(...args),
  pobierzPlikDokumentu: vi.fn(),
  wystawDokument: vi.fn(),
}));

const { Certyfikat } = await import("../Certyfikat");
const { Dokumenty } = await import("../Dokumenty");

beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue({ first_name: "Marta", role: "volunteer" });
  pobierzWarunki.mockReset();
  zlecCertyfikat.mockReset();
  pobierzDokumenty.mockReset();
});

afterEach(() => {
  cleanup();
});

async function pokaz(ekran: "certyfikat" | "dokumenty") {
  let wynik: ReturnType<typeof render> | undefined;
  await act(async () => {
    wynik = render(ekran === "certyfikat" ? <Certyfikat /> : <Dokumenty />);
  });
  return wynik!;
}

async function sprawdz(container: HTMLElement) {
  const wynik = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(wynik.violations.map((n) => `${n.id}: ${n.nodes.map((w) => w.target.join(" ")).join(" | ")}`)).toEqual([]);
  expect(container.querySelectorAll("h1")).toHaveLength(1);
  expect(container.querySelectorAll("main")).toHaveLength(1);
  const stopnie = [...container.querySelectorAll("h1, h2, h3, h4")].map((n) => Number(n.tagName.slice(1)));
  stopnie.reduce((poprzedni, biezacy) => {
    expect(biezacy - poprzedni).toBeLessThanOrEqual(1);
    return biezacy;
  }, 0);
}

const STANY_CERTYFIKATU: Array<[string, () => unknown]> = [
  ["ładowanie", () => pobierzWarunki.mockReturnValue(new Promise(() => {}))],
  ["błąd", () => pobierzWarunki.mockRejectedValue(new ApiError({ status: 500, code: "server_error", message: "x" }))],
  ["brak połączenia", () => pobierzWarunki.mockRejectedValue(new TypeError("Failed to fetch"))],
  ["brak dostępu", () => pobierzWarunki.mockRejectedValue(new ApiError({ status: 403, code: "forbidden", message: "x" }))],
  ["nie znaleziono", () => pobierzWarunki.mockRejectedValue(new ApiError({ status: 404, code: "not_found", message: "x" }))],
  ["jeszcze niedostępny", () => pobierzWarunki.mockResolvedValue(WARUNKI_NIESPELNIONE)],
  ["warunki spełnione", () => pobierzWarunki.mockResolvedValue(WARUNKI_SPELNIONE)],
];

describe("Certyfikat — dostępność", () => {
  it.each(STANY_CERTYFIKATU)("%s", async (_nazwa, przygotuj) => {
    await przygotuj();
    const { container } = await pokaz("certyfikat");
    await sprawdz(container);
  });

  it("zlecony, do pobrania", async () => {
    pobierzWarunki.mockResolvedValue(WARUNKI_SPELNIONE);
    zlecCertyfikat.mockResolvedValue({ status: "queued" });
    const { container } = await pokaz("certyfikat");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Wygeneruj certyfikat" }));
    });
    await screen.findByRole("button", { name: "Pobierz certyfikat (PDF)" });
    await sprawdz(container);
  });
});

const STANY_DOKUMENTOW: Array<[string, () => unknown]> = [
  ["ładowanie", () => pobierzDokumenty.mockReturnValue(new Promise(() => {}))],
  ["błąd", () => pobierzDokumenty.mockRejectedValue(new ApiError({ status: 500, code: "server_error", message: "x" }))],
  ["brak połączenia", () => pobierzDokumenty.mockRejectedValue(new TypeError("Failed to fetch"))],
  ["brak dostępu", () => pobierzDokumenty.mockRejectedValue(new ApiError({ status: 403, code: "forbidden", message: "x" }))],
  ["nie znaleziono", () => pobierzDokumenty.mockRejectedValue(new ApiError({ status: 404, code: "not_found", message: "x" }))],
  ["pusta lista", () => pobierzDokumenty.mockResolvedValue(DOKUMENTY_PUSTE)],
  ["lista dokumentów", () => pobierzDokumenty.mockResolvedValue(DOKUMENTY_Z_LISTA)],
];

describe("Dokumenty — dostępność", () => {
  it.each(STANY_DOKUMENTOW)("%s", async (_nazwa, przygotuj) => {
    przygotuj();
    const { container } = await pokaz("dokumenty");
    await sprawdz(container);
  });
});
