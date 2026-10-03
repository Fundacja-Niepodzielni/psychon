import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { ApiError } from "@/lib/api/klient";
import {
  WNIOSEK_BEZ_DOSTEPU,
  WNIOSEK_ODESLANY,
  WNIOSEK_OPUBLIKOWANY,
  WNIOSEK_PUSTY,
  WNIOSEK_ROBOCZY,
  WNIOSEK_Z_DYPLOMEM,
  WNIOSEK_ZATWIERDZONY,
  WNIOSEK_ZLOZONY,
  WNIOSEK_WYCOFANY,
} from "./atrapy";

/**
 * Dostępność ekranu w każdym stanie: axe (bez kontrastu — jsdom go nie liczy), dokładnie jeden `h1`,
 * jeden punkt orientacyjny treści i kolejność nagłówków bez przeskoków (h1 → h2 → h3).
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const api = vi.fn();
vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
}));

const pobierzWniosek = vi.fn();
const zapiszWniosek = vi.fn();
vi.mock("../dane", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../dane")>()),
  pobierzWniosek: (...args: unknown[]) => pobierzWniosek(...args),
  zapiszWniosek: (...args: unknown[]) => zapiszWniosek(...args),
}));

const { ProfilPsychologa } = await import("../ProfilPsychologa");

beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue({ first_name: "Marta", role: "volunteer" });
  pobierzWniosek.mockReset();
  zapiszWniosek.mockReset();
});

afterEach(() => {
  cleanup();
});

async function pokaz() {
  let wynik: ReturnType<typeof render> | undefined;
  await act(async () => {
    wynik = render(<ProfilPsychologa />);
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

const blad = (status: number) => new ApiError({ status, code: "x", message: "x" });

const STANY: Array<[string, () => unknown]> = [
  ["ładowanie", () => pobierzWniosek.mockReturnValue(new Promise(() => {}))],
  ["błąd", () => pobierzWniosek.mockRejectedValue(blad(500))],
  ["brak połączenia", () => pobierzWniosek.mockRejectedValue(new TypeError("Failed to fetch"))],
  ["brak dostępu", () => pobierzWniosek.mockRejectedValue(blad(403))],
  ["nie znaleziono", () => pobierzWniosek.mockRejectedValue(blad(404))],
  ["program nieukończony", () => pobierzWniosek.mockResolvedValue(WNIOSEK_BEZ_DOSTEPU)],
  ["brak wniosku", () => pobierzWniosek.mockResolvedValue(WNIOSEK_PUSTY)],
  ["wersja robocza", () => pobierzWniosek.mockResolvedValue(WNIOSEK_ROBOCZY)],
  ["roboczy z dyplomem", () => pobierzWniosek.mockResolvedValue(WNIOSEK_Z_DYPLOMEM)],
  ["czeka na decyzję", () => pobierzWniosek.mockResolvedValue(WNIOSEK_ZLOZONY)],
  ["do poprawki z uwagami", () => pobierzWniosek.mockResolvedValue(WNIOSEK_ODESLANY)],
  ["zatwierdzony", () => pobierzWniosek.mockResolvedValue(WNIOSEK_ZATWIERDZONY)],
  ["opublikowany", () => pobierzWniosek.mockResolvedValue(WNIOSEK_OPUBLIKOWANY)],
  ["zgoda wycofana", () => pobierzWniosek.mockResolvedValue(WNIOSEK_WYCOFANY)],
];

describe("Profil psychologa — dostępność", () => {
  it.each(STANY)("%s", async (_nazwa, przygotuj) => {
    przygotuj();
    const { container } = await pokaz();
    await sprawdz(container);
  });

  it("otwarte pytanie o wycofanie zgody", async () => {
    pobierzWniosek.mockResolvedValue(WNIOSEK_ZLOZONY);
    const { container } = await pokaz();
    fireEvent.click(screen.getByRole("button", { name: "Wycofaj zgodę" }));
    expect(screen.getByRole("dialog", { name: "Wycofać zgodę na publikację?" })).toBeInTheDocument();
    await sprawdz(container);
  });

  it("błędy serwera przy polach", async () => {
    pobierzWniosek.mockResolvedValue(WNIOSEK_ROBOCZY);
    zapiszWniosek.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "validation_failed",
        message: "Popraw zaznaczone pola.",
        errors: { city: ["Nazwa miasta może mieć najwyżej 255 znaków."] },
      }),
    );
    const { container } = await pokaz();
    fireEvent.change(screen.getByLabelText("Miasto"), { target: { value: "x" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
    });
    expect(screen.getByText("Nazwa miasta może mieć najwyżej 255 znaków.")).toBeInTheDocument();
    await sprawdz(container);
  });
});
