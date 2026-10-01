import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { lekcja, utworzSerwer, type AtrapaSerwera } from "./atrapa-serwera";

/**
 * Czas trwania lekcji na ekranie kursu administracji: pole „Czas trwania
 * w minutach” w formularzu nowej lekcji i w edycji lekcji pod wierszem.
 * Serwer dalej dostaje `duration_seconds`.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

let serwer: AtrapaSerwera;
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return {
    ...oryginal,
    api: (...a: [string, { method?: string; body?: unknown }?]) => serwer.api(...a),
    apiPaged: (...a: [string]) => serwer.apiPaged(...a),
  };
});
vi.mock("@/lib/api", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...oryginal,
    api: (...a: [string, { method?: string; body?: unknown }?]) => serwer.api(...a),
    apiPaged: (...a: [string]) => serwer.apiPaged(...a),
  };
});

const { KursAdministracji } = await import("../KursAdministracji");

async function renderEkranu() {
  const wynik = render(<KursAdministracji idKursu="4" />);
  await screen.findByRole("heading", { level: 3, name: "Wprowadzenie" });
  return wynik;
}

function zapisy(metoda: string, sciezka: string) {
  return serwer.zapisy().filter((w) => w.metoda === metoda && w.sciezka === sciezka);
}

async function nowaLekcja() {
  await userEvent.click(screen.getByTestId("ct-dodaj-8"));
  const formularz = await screen.findByRole("form", { name: "Nowa lekcja" });
  await userEvent.type(within(formularz).getByLabelText(/^Tytuł lekcji/), "Lekcja D");
  return formularz;
}

beforeEach(() => {
  vi.clearAllMocks();
  serwer = utworzSerwer({
    lekcje: [{ ...lekcja(21, "Lekcja A"), duration_seconds: 1530 }, lekcja(22, "Lekcja B"), lekcja(23, "Lekcja C")],
  });
});

describe("nowa lekcja — czas w minutach", () => {
  it("25 minut idzie do serwera jako 1500 sekund", async () => {
    await renderEkranu();
    const formularz = await nowaLekcja();
    await userEvent.type(within(formularz).getByLabelText(/^Czas trwania w minutach/), "25");
    await userEvent.click(within(formularz).getByRole("button", { name: "Dodaj lekcję" }));

    await waitFor(() => expect(zapisy("POST", "/admin/courses/4/lessons")).toHaveLength(1));
    expect((zapisy("POST", "/admin/courses/4/lessons")[0].cialo as { duration_seconds: number }).duration_seconds).toBe(1500);
  });

  it.each([["puste pole", ""], ["ułamek", "2.5"], ["liczba ujemna", "-3"]])(
    "%s: komunikat pola po polsku, zero żądań",
    async (_opis, wartosc) => {
      await renderEkranu();
      const formularz = await nowaLekcja();
      const pole = within(formularz).getByLabelText(/^Czas trwania w minutach/);
      if (wartosc !== "") await userEvent.type(pole, wartosc);
      await userEvent.click(within(formularz).getByRole("button", { name: "Dodaj lekcję" }));

      expect(pole).toHaveAccessibleDescription(/Podaj czas trwania w pełnych minutach, 0 albo więcej\./);
      expect(serwer.zapisy()).toEqual([]);
    },
  );
});

describe("edycja lekcji — czas w minutach", () => {
  it("lekcja z 1530 s pokazuje 26; zapis samego tytułu wysyła 1530, nie 1560", async () => {
    const { container } = await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: "Edytuj lekcję „Lekcja A”" }));
    const formularz = await within(container.querySelector<HTMLElement>("li[data-lekcja='21']")!).findByRole("form", {
      name: "Edycja lekcji",
    });
    expect(within(formularz).getByLabelText(/^Czas trwania w minutach/)).toHaveValue(26);

    const tytul = within(formularz).getByLabelText(/^Tytuł lekcji/);
    await userEvent.clear(tytul);
    await userEvent.type(tytul, "Lekcja A po zmianie");
    await userEvent.click(within(formularz).getByRole("button", { name: "Zapisz lekcję" }));

    await waitFor(() => expect(zapisy("PATCH", "/admin/lessons/21")).toHaveLength(1));
    expect((zapisy("PATCH", "/admin/lessons/21")[0].cialo as { duration_seconds: number }).duration_seconds).toBe(1530);
  });

  it("zmiana pola na 27 wysyła 1620", async () => {
    const { container } = await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: "Edytuj lekcję „Lekcja A”" }));
    const formularz = await within(container.querySelector<HTMLElement>("li[data-lekcja='21']")!).findByRole("form", {
      name: "Edycja lekcji",
    });
    const pole = within(formularz).getByLabelText(/^Czas trwania w minutach/);
    await userEvent.clear(pole);
    await userEvent.type(pole, "27");
    await userEvent.click(within(formularz).getByRole("button", { name: "Zapisz lekcję" }));

    await waitFor(() => expect(zapisy("PATCH", "/admin/lessons/21")).toHaveLength(1));
    expect((zapisy("PATCH", "/admin/lessons/21")[0].cialo as { duration_seconds: number }).duration_seconds).toBe(1620);
  });
});
