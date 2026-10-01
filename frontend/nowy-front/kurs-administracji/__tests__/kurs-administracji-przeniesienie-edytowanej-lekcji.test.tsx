import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { utworzSerwer, type AtrapaSerwera } from "./atrapa-serwera";

/**
 * Przeniesienie strzałką lekcji, której formularz jest otwarty pod wierszem,
 * do innego tematu. Wiersz zmienia listę, więc formularz montuje się od nowa:
 * niezapisane zmiany nie mogą przy tym zniknąć bez pytania. Ekran pyta tym
 * samym oknem co przy każdej innej drodze zamykającej formularz lekcji.
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

const PRZENIES_C = "Przenieś „Lekcja C” na koniec tematu „Wprowadzenie”";
const PYTANIE = "Porzucić niezapisane zmiany w lekcji?";

async function renderEkranu() {
  const wynik = render(<KursAdministracji idKursu="4" />);
  await screen.findByRole("heading", { level: 3, name: "Wprowadzenie" });
  return wynik;
}

function wiersz(container: HTMLElement, id: number): HTMLElement {
  return container.querySelector<HTMLElement>(`li[data-lekcja='${id}']`)!;
}

async function otworzLekcjeC(container: HTMLElement) {
  await userEvent.click(screen.getByRole("button", { name: "Edytuj lekcję „Lekcja C”" }));
  return within(wiersz(container, 23)).findByRole("form", { name: "Edycja lekcji" });
}

function ogloszenie(): string {
  return document.querySelector("[data-ogloszenia]")?.textContent ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
  serwer = utworzSerwer();
});

describe("strzałka przy lekcji z otwartym formularzem — przeniesienie do innego tematu", () => {
  it("formularz ze zmianami: ekran pyta, lekcja zostaje na miejscu, wpisana wartość zostaje", async () => {
    const { container } = await renderEkranu();
    const formularz = await otworzLekcjeC(container);
    const tytul = within(formularz).getByLabelText(/^Tytuł lekcji/);
    await userEvent.clear(tytul);
    await userEvent.type(tytul, "Lekcja C po zmianie");

    await userEvent.click(screen.getByRole("button", { name: PRZENIES_C }));

    const okno = screen.getByRole("dialog", { name: PYTANIE });
    expect(ogloszenie()).toBe("");
    await userEvent.click(within(okno).getByRole("button", { name: "Zostań" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(wiersz(container, 23)).getByLabelText(/^Tytuł lekcji/)).toHaveValue("Lekcja C po zmianie");
    expect(ogloszenie()).toBe("");
    expect(serwer.zapisy()).toEqual([]);
  });

  it("„Porzuć zmiany”: formularz znika, lekcja trafia do tematu, fokus nie ląduje na body, zero zapisów", async () => {
    const { container } = await renderEkranu();
    const formularz = await otworzLekcjeC(container);
    await userEvent.type(within(formularz).getByLabelText(/^Tytuł lekcji/), " po zmianie");

    await userEvent.click(screen.getByRole("button", { name: PRZENIES_C }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: PYTANIE })).getByRole("button", { name: "Porzuć zmiany" }),
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container.querySelector("[data-rozwiniecie-lekcji]")).toBeNull();
    expect(ogloszenie()).toBe("Lekcja „Lekcja C” przeniesiona do tematu „Wprowadzenie”, miejsce 3 z 3.");
    expect(document.activeElement).not.toBe(document.body);
    expect(serwer.zapisy()).toEqual([]);
  });

  it("formularz bez zmian: przeniesienie od razu, bez okna, formularz zamknięty", async () => {
    const { container } = await renderEkranu();
    await otworzLekcjeC(container);

    await userEvent.click(screen.getByRole("button", { name: PRZENIES_C }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container.querySelector("[data-rozwiniecie-lekcji]")).toBeNull();
    expect(ogloszenie()).toBe("Lekcja „Lekcja C” przeniesiona do tematu „Wprowadzenie”, miejsce 3 z 3.");
    expect(document.activeElement).not.toBe(document.body);
  });

  it("strzałka przy INNEJ lekcji nie pyta i nie zamyka formularza", async () => {
    const { container } = await renderEkranu();
    const formularz = await otworzLekcjeC(container);
    await userEvent.type(within(formularz).getByLabelText(/^Tytuł lekcji/), " po zmianie");

    await userEvent.click(screen.getByRole("button", { name: /^Przenieś „Lekcja A” / }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(wiersz(container, 23)).getByLabelText(/^Tytuł lekcji/)).toHaveValue("Lekcja C po zmianie");
  });
});
