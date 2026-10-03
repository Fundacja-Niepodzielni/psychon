import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KURS, LEKCJA } from "./pomoce";
import { kiedyTemu } from "../kiedy";

const pobierzDaneLekcji = vi.fn();
const pobierzOdczytKursu = vi.fn();
const pobierzPytania = vi.fn();
const wyslijPytanie = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../dane", async (importOriginal) => {
  const original = await importOriginal<typeof import("../dane")>();
  return {
    ...original,
    pobierzDaneLekcji: (...args: unknown[]) => pobierzDaneLekcji(...args),
    pobierzPytania: (...args: unknown[]) => pobierzPytania(...args),
    wyslijPytanie: (...args: unknown[]) => wyslijPytanie(...args),
  };
});

vi.mock("../kurs", async (importOriginal) => {
  const original = await importOriginal<typeof import("../kurs")>();
  return { ...original, pobierzOdczytKursu: (...args: unknown[]) => pobierzOdczytKursu(...args) };
});

const { Lekcja } = await import("../Lekcja");

function pytanie(nadpisz: Record<string, unknown> = {}) {
  return {
    id: 1,
    lesson_id: 21,
    question: "Czy pytanie o samobójstwo nie podsuwa pomysłu?",
    answer: "Nie. Badania pokazują odwrotnie: pytanie wprost przynosi ulgę.",
    answered_by_name: "Marta Zielińska",
    answered_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    created_at: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString(),
    updated_at: null,
    ...nadpisz,
  };
}

async function otworz(dane: object = LEKCJA) {
  pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane, bezNagrania: true });
  render(<Lekcja id="21" />);
  await screen.findByRole("heading", { level: 1, name: LEKCJA.title });
  return screen.getByRole("region", { name: "Zapytaj prowadzącego" });
}

beforeEach(() => {
  pobierzDaneLekcji.mockReset();
  pobierzOdczytKursu.mockReset();
  pobierzOdczytKursu.mockResolvedValue(KURS);
  pobierzPytania.mockReset();
  pobierzPytania.mockResolvedValue([]);
  wyslijPytanie.mockReset();
});

describe("Lekcja — pytania do prowadzącego", () => {
  it("karta z adresatem z odczytu lekcji i polem pytania", async () => {
    const karta = await otworz();

    expect(within(karta).getByText("Odpowiada Marta Zielińska. Pytanie widzisz tylko Ty i prowadzący.")).toBeInTheDocument();
    expect(within(karta).getByRole("textbox", { name: "Twoje pytanie" })).toBeInTheDocument();
    expect(within(karta).getByRole("button", { name: "Wyślij pytanie" })).toBeInTheDocument();
    await waitFor(() => expect(pobierzPytania).toHaveBeenCalledWith("21"));
  });

  it("bez adresata (null albo brak pola) formularz zostaje, bez nazwiska", async () => {
    const dane = { ...LEKCJA, question_addressee: null };
    const karta = await otworz(dane);

    expect(within(karta).getByText("Pytanie widzisz tylko Ty i prowadzący.")).toBeInTheDocument();
    expect(within(karta).queryByText(/Odpowiada/)).toBeNull();
  });

  it("puste pytanie: zdanie przy polu, fokus w polu, nic nie jest wysyłane", async () => {
    const uzytkownik = userEvent.setup();
    const karta = await otworz();

    await uzytkownik.click(within(karta).getByRole("button", { name: "Wyślij pytanie" }));

    expect(await within(karta).findByText("Wpisz pytanie, zanim je wyślesz.")).toBeInTheDocument();
    expect(within(karta).getByRole("textbox", { name: "Twoje pytanie" })).toHaveFocus();
    expect(wyslijPytanie).not.toHaveBeenCalled();
  });

  it("wysłanie: pytanie trafia na listę z „Czeka na odpowiedź prowadzącego.”, pole się czyści, potwierdzenie", async () => {
    const uzytkownik = userEvent.setup();
    wyslijPytanie.mockResolvedValue({
      status: "ok",
      pytanie: pytanie({ id: 9, question: "Jak długo trwa rozmowa?", answer: null, answered_by_name: null, answered_at: null, created_at: new Date().toISOString() }),
    });
    const karta = await otworz();

    await uzytkownik.type(within(karta).getByRole("textbox", { name: "Twoje pytanie" }), "Jak długo trwa rozmowa?");
    await uzytkownik.click(within(karta).getByRole("button", { name: "Wyślij pytanie" }));

    expect(wyslijPytanie).toHaveBeenCalledWith("21", "Jak długo trwa rozmowa?");
    expect(await within(karta).findByText("Czeka na odpowiedź prowadzącego.")).toBeInTheDocument();
    expect(within(karta).getByText("Jak długo trwa rozmowa?", { selector: "b" })).toBeInTheDocument();
    expect(within(karta).getByText("Pytanie wysłane.")).toBeInTheDocument();
    expect(within(karta).getByRole("textbox", { name: "Twoje pytanie" })).toHaveValue("");
  });

  it("odmowa serwera: komunikat z pola i treść pytania zostaje w polu", async () => {
    const uzytkownik = userEvent.setup();
    wyslijPytanie.mockResolvedValue({ status: "blad", komunikat: "Nie udało się wysłać pytania. Spróbuj ponownie." });
    const karta = await otworz();

    await uzytkownik.type(within(karta).getByRole("textbox", { name: "Twoje pytanie" }), "Treść");
    await uzytkownik.click(within(karta).getByRole("button", { name: "Wyślij pytanie" }));

    expect(await within(karta).findByText("Nie udało się wysłać pytania. Spróbuj ponownie.")).toBeInTheDocument();
    expect(within(karta).getByRole("textbox", { name: "Twoje pytanie" })).toHaveValue("Treść");
  });

  it("lista: pytanie z odpowiedzią pokazuje autora i czas, pytanie bez odpowiedzi czeka", async () => {
    pobierzPytania.mockResolvedValue([
      pytanie(),
      pytanie({ id: 2, question: "Drugie?", answer: null, answered_by_name: null, answered_at: null }),
    ]);
    const karta = await otworz();

    expect(await within(karta).findByRole("heading", { name: "Twoje pytania i odpowiedzi" })).toBeInTheDocument();
    expect(within(karta).getByText("Marta Zielińska, 3 dni temu")).toBeInTheDocument();
    expect(within(karta).getByText(/Badania pokazują odwrotnie/)).toBeInTheDocument();
    expect(within(karta).getByText("Czeka na odpowiedź prowadzącego.")).toBeInTheDocument();
  });

  it("nieudany odczyt listy: formularz działa, listy nie ma, ekran bez komunikatu o błędzie", async () => {
    pobierzPytania.mockResolvedValue(null);
    const karta = await otworz();

    expect(within(karta).getByRole("button", { name: "Wyślij pytanie" })).toBeInTheDocument();
    expect(within(karta).queryByRole("heading", { name: "Twoje pytania i odpowiedzi" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("kiedyTemu", () => {
  const teraz = new Date("2026-10-10T12:00:00Z");

  it.each([
    ["2026-10-10T11:59:40Z", "przed chwilą"],
    ["2026-10-10T11:55:00Z", "5 min temu"],
    ["2026-10-10T09:00:00Z", "3 godz. temu"],
    ["2026-10-09T09:00:00Z", "wczoraj"],
    ["2026-10-07T12:00:00Z", "3 dni temu"],
    ["2026-08-01T12:00:00Z", "2026-08-01"],
  ])("%s → %s", (czas, oczekiwane) => {
    expect(kiedyTemu(czas, teraz)).toBe(oczekiwane);
  });

  it("brak albo zły czas → null", () => {
    expect(kiedyTemu(null, teraz)).toBeNull();
    expect(kiedyTemu("nie-data", teraz)).toBeNull();
  });
});
