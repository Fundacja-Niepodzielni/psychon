import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { temat, utworzSerwer, type AtrapaSerwera } from "./atrapa-serwera";

/**
 * Próby ekranu kursu administracji dla klawiatury i czytnika ekranu:
 *  1) po czynności, która zdejmuje z ekranu kliknięty przycisk (zapis, cofnięcie
 *     ostatniej zmiany, porzucenie zmian, usunięcie tematu albo materiału,
 *     dodanie pierwszego tematu), fokus stoi na widocznym elemencie ekranu,
 *     nigdy na `body`;
 *  2) ekran ma jeden cichy obszar ogłoszeń: mówi, dokąd trafiła przeniesiona
 *     lekcja, i że zmiany zostały zapisane;
 *  3) sekcja „Dane kursu” ma nazwę także wtedy, gdy pokazuje formularz.
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

function pasekZmian() {
  return screen.getByRole("region", { name: "Niezapisane zmiany" });
}

function fokusNaEkranie() {
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).not.toBeNull();
  expect(document.body.contains(document.activeElement)).toBe(true);
}

function ogloszenia() {
  const obszary = document.querySelectorAll<HTMLElement>("[data-ogloszenia]");
  expect(obszary).toHaveLength(1);
  return obszary[0];
}

const PRZENIES_C = "Przenieś „Lekcja C” na koniec tematu „Wprowadzenie”";

beforeEach(() => {
  vi.clearAllMocks();
  serwer = utworzSerwer();
});

describe("fokus po czynności, która zdejmuje kliknięty przycisk", () => {
  it("po zapisie zmian fokus stoi na elemencie ekranu", async () => {
    await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: PRZENIES_C }));
    await userEvent.click(within(pasekZmian()).getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() => expect(screen.queryByRole("region", { name: "Niezapisane zmiany" })).toBeNull());
    fokusNaEkranie();
  });

  it("po cofnięciu jedynej zmiany fokus stoi na elemencie ekranu", async () => {
    await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: PRZENIES_C }));
    await userEvent.click(within(pasekZmian()).getByRole("button", { name: "Cofnij" }));

    expect(screen.queryByRole("region", { name: "Niezapisane zmiany" })).toBeNull();
    fokusNaEkranie();
  });

  it("po porzuceniu zmian fokus stoi na elemencie ekranu", async () => {
    await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: PRZENIES_C }));
    await userEvent.click(within(pasekZmian()).getByRole("button", { name: "Porzuć wszystko" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Porzuć wszystko" }));

    expect(screen.queryByRole("region", { name: "Niezapisane zmiany" })).toBeNull();
    fokusNaEkranie();
  });

  it("po usunięciu tematu fokus stoi na „Dodaj temat”", async () => {
    serwer = utworzSerwer({ tematy: [temat(7, "Wprowadzenie", 1, [21, 22, 23]), temat(9, "Pusty temat", 2, [])] });
    await renderEkranu();
    serwer.nadpisz("DELETE", "/admin/topics/9", () => ({ id: 9, deleted: true }));
    await userEvent.click(screen.getByRole("button", { name: "Usuń temat „Pusty temat”" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Usuń temat" }));

    await waitFor(() => expect(screen.queryByRole("heading", { level: 3, name: "Pusty temat" })).toBeNull());
    expect(screen.getByRole("button", { name: "Dodaj temat" })).toHaveFocus();
  });

  it("po dodaniu pierwszego tematu fokus stoi na „Dodaj lekcję” tego tematu", async () => {
    serwer = utworzSerwer({ tematy: [], lekcje: [] });
    render(<KursAdministracji idKursu="4" />);
    await userEvent.click(await screen.findByRole("button", { name: "Dodaj pierwszy temat" }));
    const okno = screen.getByRole("dialog", { name: "Nowy temat" });
    await userEvent.type(within(okno).getByLabelText(/^Nazwa tematu/), "Początek");
    await userEvent.click(within(okno).getByRole("button", { name: "Dodaj temat" }));

    await screen.findByRole("heading", { level: 3, name: "Początek" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement?.getAttribute("data-testid")).toMatch(/^ct-dodaj-/);
  });

  it("po usunięciu materiału fokus stoi na polu dodawania materiałów", async () => {
    await renderEkranu();
    const sekcja = document.getElementById("materialy")!;
    const pole = sekcja.querySelector<HTMLInputElement>("input[type='file']")!;
    await userEvent.upload(pole, new File(["tresc"], "karta-pracy.pdf", { type: "application/pdf" }));
    await userEvent.click(await within(sekcja).findByRole("button", { name: "Usuń materiał „karta-pracy.pdf”" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Usuń materiał" }));

    await waitFor(() => expect(within(sekcja).queryByRole("button", { name: /^Usuń materiał/ })).toBeNull());
    expect(pole).toHaveFocus();
  });
});

describe("cichy obszar ogłoszeń", () => {
  it("jest jeden, jest obszarem żywym i na starcie jest pusty", async () => {
    await renderEkranu();
    const obszar = ogloszenia();
    expect(obszar).toHaveAttribute("aria-live", "polite");
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
    expect(obszar).toHaveTextContent("");
  });

  it("przeniesienie lekcji mówi, do którego tematu i na które miejsce trafiła", async () => {
    await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: PRZENIES_C }));

    expect(ogloszenia()).toHaveTextContent("Lekcja „Lekcja C” przeniesiona do tematu „Wprowadzenie”, miejsce 3 z 3.");
  });

  it("zapis zmian mówi, że zmiany zostały zapisane", async () => {
    await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: PRZENIES_C }));
    await userEvent.click(within(pasekZmian()).getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() => expect(ogloszenia()).toHaveTextContent("Zmiany w kursie zostały zapisane."));
  });
});

describe("sekcja „Dane kursu” w trybie formularza", () => {
  it("ma nazwę dostępną przed otwarciem formularza i po nim", async () => {
    await renderEkranu();
    expect(screen.getByRole("region", { name: "Dane kursu" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Zmień dane kursu" }));

    expect(screen.getByRole("region", { name: "Dane kursu" })).toHaveAttribute("id", "opis");
  });
});
