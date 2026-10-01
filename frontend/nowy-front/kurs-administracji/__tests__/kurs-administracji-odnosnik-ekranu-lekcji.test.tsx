import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";
import { utworzSerwer, type AtrapaSerwera } from "./atrapa-serwera";

/**
 * Droga z ekranu kursu do ekranu lekcji (nagranie i materiały lekcji):
 * odnośnik „Materiały i nagranie” w formularzu przy wierszu lekcji. Odnośnik
 * istnieje wyłącznie przy włączonej grupie ekranu lekcji — przy wyłączonej nie
 * ma go w DOM, bo jego adres odpowiadałby 404. Obie strony flagi sprawdza
 * podmiana rejestru, niezależnie od tego, co rejestr zawiera na dziś.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push, refresh: vi.fn(), replace: vi.fn() }),
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

const ADRES_LEKCJI_B = "/admin/kursy/4/lekcje/22";

async function renderEkranu(grupaLekcji: boolean) {
  podmienRejestr({ kursAdministracji: true, publikacjaKursu: true, zaproszeniaNaKurs: true, edycjaLekcji: grupaLekcji });
  const { KursAdministracji } = await import("../KursAdministracji");
  const wynik = render(<KursAdministracji idKursu="4" />);
  await screen.findByRole("heading", { level: 3, name: "Wprowadzenie" });
  return wynik;
}

function wiersz(container: HTMLElement, id: number): HTMLElement {
  return container.querySelector<HTMLElement>(`li[data-lekcja='${id}']`)!;
}

async function otworzLekcjeB(container: HTMLElement) {
  await userEvent.click(screen.getByRole("button", { name: "Edytuj lekcję „Lekcja B”" }));
  return within(wiersz(container, 22)).findByRole("form", { name: "Edycja lekcji" });
}

beforeEach(() => {
  vi.clearAllMocks();
  serwer = utworzSerwer();
});

afterEach(() => {
  przywrocRejestr();
});

describe("grupa ekranu lekcji wyłączona", () => {
  it("odnośnika do ekranu lekcji nie ma w DOM — ani w formularzu, ani nigdzie na ekranie kursu", async () => {
    const { container } = await renderEkranu(false);
    await otworzLekcjeB(container);

    expect(screen.queryByRole("link", { name: "Materiały i nagranie" })).toBeNull();
    expect(container.querySelector("a[href*='/lekcje/']")).toBeNull();
  });
});

describe("grupa ekranu lekcji włączona", () => {
  it("formularz przy wierszu niesie odnośnik „Materiały i nagranie” pod adres lekcji z kursem w ścieżce", async () => {
    const { container } = await renderEkranu(true);
    await otworzLekcjeB(container);

    const odnosnik = within(wiersz(container, 22)).getByRole("link", { name: "Materiały i nagranie" });
    expect(odnosnik).toHaveAttribute("href", ADRES_LEKCJI_B);
    expect(container.querySelectorAll("a[href*='/lekcje/']")).toHaveLength(1);
  });

  it("bez zmian w formularzu odnośnik przechodzi od razu, bez okna", async () => {
    const { container } = await renderEkranu(true);
    await otworzLekcjeB(container);

    await userEvent.click(within(wiersz(container, 22)).getByRole("link", { name: "Materiały i nagranie" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(push).toHaveBeenCalledWith(ADRES_LEKCJI_B);
  });

  it("ze zmianami w formularzu odnośnik pyta: „Zostań” nie przechodzi, „Porzuć zmiany” przechodzi; zero zapisów", async () => {
    const { container } = await renderEkranu(true);
    const formularz = await otworzLekcjeB(container);
    await userEvent.type(within(formularz).getByLabelText(/^Tytuł lekcji/), " po zmianie");

    await userEvent.click(within(wiersz(container, 22)).getByRole("link", { name: "Materiały i nagranie" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Zostań" }));
    expect(push).not.toHaveBeenCalled();

    await userEvent.click(within(wiersz(container, 22)).getByRole("link", { name: "Materiały i nagranie" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Porzuć zmiany" }));
    expect(push).toHaveBeenCalledWith(ADRES_LEKCJI_B);
    expect(serwer.zapisy()).toEqual([]);
  });

  it("lekcja dodana przed chwilą też ma drogę do nagrania i materiałów: „Edytuj” → odnośnik z jej identyfikatorem", async () => {
    const { container } = await renderEkranu(true);
    await userEvent.click(screen.getByTestId("ct-dodaj-8"));
    const nowa = await screen.findByRole("form", { name: "Nowa lekcja" });
    await userEvent.type(within(nowa).getByLabelText(/^Tytuł lekcji/), "Lekcja D");
    await userEvent.type(within(nowa).getByLabelText(/^Czas trwania w minutach/), "5");
    await userEvent.click(within(nowa).getByRole("button", { name: "Dodaj lekcję" }));
    await waitFor(() =>
      expect(serwer.zapisy().filter((z) => z.metoda === "POST" && z.sciezka === "/admin/courses/4/lessons")).toHaveLength(1),
    );

    await userEvent.click(await screen.findByRole("button", { name: "Edytuj lekcję „Lekcja D”" }));
    const odnosnik = await screen.findByRole("link", { name: "Materiały i nagranie" });
    const idNowej = odnosnik.closest("li[data-lekcja]")?.getAttribute("data-lekcja");

    expect(idNowej).toMatch(/^\d+$/);
    expect(odnosnik).toHaveAttribute("href", `/admin/kursy/4/lekcje/${idNowej}`);
    expect(container.querySelectorAll("a[href*='/lekcje/']")).toHaveLength(1);
  });
});
