import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import { KURS, LEKCJA, ramkaOdtwarzacza, wiszace, zrodloRamki } from "./pomoce";

const pobierzDaneLekcji = vi.fn();
const ukonczLekcje = vi.fn();
const pobierzOdczytKursu = vi.fn();
const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../dane", async (importOriginal) => {
  const original = await importOriginal<typeof import("../dane")>();
  return {
    ...original,
    pobierzDaneLekcji: (...args: unknown[]) => pobierzDaneLekcji(...args),
    ukonczLekcje: (...args: unknown[]) => ukonczLekcje(...args),
    pobierzPytania: async () => [],
  };
});

vi.mock("../kurs", async (importOriginal) => {
  const original = await importOriginal<typeof import("../kurs")>();
  return { ...original, pobierzOdczytKursu: (...args: unknown[]) => pobierzOdczytKursu(...args) };
});

const { Lekcja } = await import("../Lekcja");

const ZNACZNIK_SZABLONU = '[data-style-id="ekran-lekcji-uczestnika"]';
const BEZ_PLIKOW = { ...KURS, materials: [] };

beforeEach(() => {
  pobierzDaneLekcji.mockReset();
  ukonczLekcje.mockReset();
  pobierzOdczytKursu.mockReset();
  pobierzOdczytKursu.mockResolvedValue(KURS);
  back.mockReset();
});

function obszarTresci() {
  return screen.queryByRole("region", { name: "Treść lekcji" });
}

function zNagraniem(nadpisz: Record<string, unknown> = {}) {
  return { status: "ok", dane: { ...LEKCJA, ...nadpisz }, bezNagrania: false, zrodloNagrania: zrodloRamki() };
}

function bezNagrania(nadpisz: Record<string, unknown> = {}) {
  return { status: "ok", dane: { ...LEKCJA, video_status: "none", ...nadpisz }, bezNagrania: true };
}

async function otworz(wynik: unknown, kurs: unknown = KURS) {
  pobierzDaneLekcji.mockResolvedValue(wynik);
  pobierzOdczytKursu.mockResolvedValue(kurs);
  const rezultat = render(<Lekcja id="21" />);
  await screen.findByRole("heading", { level: 1, name: LEKCJA.title });
  await screen.findByText(/lekcji ukończone/);
  return rezultat;
}

describe("Lekcja — treść lekcji", () => {
  it("z nagraniem i treścią: odtwarzacz oraz treść w podzbiorze Markdown", async () => {
    await otworz(zNagraniem());

    const tresc = await screen.findByRole("region", { name: "Treść lekcji" });
    expect(ramkaOdtwarzacza()).not.toBeNull();
    expect(within(tresc).getByRole("heading", { name: "Po co ta lekcja" })).toBeInTheDocument();
    expect(within(tresc).getByText("uważnie").tagName).toBe("STRONG");
    expect(within(tresc).getAllByRole("listitem")).toHaveLength(2);
    expect(within(tresc).getByText("Opis lekcji")).toBeInTheDocument();
  });

  it("bez nagrania, z opisem i treścią: sama treść, bez ramki odtwarzacza i bez stanu pustego", async () => {
    await otworz(bezNagrania());

    const tresc = await screen.findByRole("region", { name: "Treść lekcji" });
    expect(within(tresc).getByText(/Kryzys psychiczny nie zawsze/)).toBeInTheDocument();
    expect(ramkaOdtwarzacza()).toBeNull();
    expect(screen.queryByText("Lekcja bez treści")).toBeNull();
  });

  it("bez nagrania i bez opisu, z treścią: tytuł i treść, bez stanu pustego i bez ramki", async () => {
    const { container } = await otworz(bezNagrania({ description: null }));

    const tresc = await screen.findByRole("region", { name: "Treść lekcji" });
    expect(within(tresc).getByText(/Kryzys psychiczny nie zawsze/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: LEKCJA.title })).toBeInTheDocument();
    expect(screen.queryByText("Lekcja bez treści")).toBeNull();
    expect(ramkaOdtwarzacza()).toBeNull();
    expect(container.querySelector(ZNACZNIK_SZABLONU)).not.toBeNull();
  });

  it("z nagraniem, ale bez treści (content: null) i bez opisu: żaden obszar treści nie udaje jej", async () => {
    await otworz(zNagraniem({ content: null, description: null }));

    await screen.findByRole("heading", { level: 1, name: LEKCJA.title });
    expect(ramkaOdtwarzacza()).not.toBeNull();
    expect(obszarTresci()).toBeNull();
  });

  it("treść złożona z samych białych znaków nie tworzy obszaru treści", async () => {
    await otworz(zNagraniem({ content: "  \n\n ", description: null }));

    expect(obszarTresci()).toBeNull();
  });

  it("bez nagrania, opisu, treści i plików: uczciwy stan pusty z powrotem do kursu", async () => {
    const uzytkownik = userEvent.setup();
    await otworz(bezNagrania({ description: null, content: null }), BEZ_PLIKOW);

    expect(await screen.findByRole("heading", { name: "Lekcja bez treści" })).toBeInTheDocument();
    expect(obszarTresci()).toBeNull();
    await uzytkownik.click(screen.getByRole("button", { name: "Wróć do kursu" }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("HTML i niebezpieczny link w treści są tekstem, nie elementami", async () => {
    const { container } = await otworz(
      bezNagrania({
        content: "<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[kliknij](javascript:alert(1))",
      }),
    );

    const tresc = await screen.findByRole("region", { name: "Treść lekcji" });
    expect(tresc.textContent).toContain("<script>alert(1)</script>");
    expect(tresc.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(tresc.querySelector("a")).toBeNull();
  });

  it("czas czytania w podtytule: 1000 słów treści to około 5 min czytania", async () => {
    await otworz(zNagraniem({ content: Array.from({ length: 1000 }, () => "słowo").join(" ") }));

    expect(screen.getByText("20 min nagrania · około 5 min czytania")).toBeInTheDocument();
  });

  it("bez treści podtytuł nie obiecuje czytania", async () => {
    await otworz(zNagraniem({ content: null }));

    expect(screen.getByText("20 min nagrania")).toBeInTheDocument();
    expect(screen.queryByText(/czytania/)).toBeNull();
  });

  it("okruszki niosą temat lekcji, gdy lekcja go ma", async () => {
    await otworz(zNagraniem());

    const okruszki = screen.getByRole("navigation", { name: "Gdzie jesteś" });
    expect(within(okruszki).getByText("Kryzys i jego przebieg")).toBeInTheDocument();
  });
});

describe("Lekcja — szablon i jeden main w każdym stanie", () => {
  it("ładowanie", () => {
    pobierzDaneLekcji.mockReturnValue(wiszace());

    const { container } = render(<Lekcja id="21" />);

    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector(ZNACZNIK_SZABLONU)).toBe(container.querySelector("main"));
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("dane z nagraniem", async () => {
    const { container } = await otworz(zNagraniem());

    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector(ZNACZNIK_SZABLONU)).toBe(container.querySelector("main"));
  });

  it("dane bez nagrania", async () => {
    const { container } = await otworz(bezNagrania());

    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector(ZNACZNIK_SZABLONU)).toBe(container.querySelector("main"));
  });

  it("stan pusty lekcji", async () => {
    const { container } = await otworz(bezNagrania({ description: null, content: null }), BEZ_PLIKOW);
    await screen.findByRole("heading", { name: "Lekcja bez treści" });

    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector(ZNACZNIK_SZABLONU)).toBe(container.querySelector("main"));
  });

  it("po ukończeniu lekcji", async () => {
    const uzytkownik = userEvent.setup();
    ukonczLekcje.mockResolvedValue({ status: "ok", completed_at: "2026-10-03T12:30:00Z" });
    const { container } = await otworz(bezNagrania());

    await uzytkownik.click(screen.getByRole("button", { name: "Oznacz lekcję jako ukończoną" }));
    await screen.findByText("Ukończona");

    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector(ZNACZNIK_SZABLONU)).toBe(container.querySelector("main"));
  });

  it("zablokowany kurs: komunikat koperty, bez treści lekcji w DOM", async () => {
    pobierzDaneLekcji.mockResolvedValue({ status: "zablokowany", komunikat: "Ukończ najpierw etap 2." });

    const { container } = render(<Lekcja id="21" />);
    await screen.findByText("Ukończ najpierw etap 2.");

    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector(ZNACZNIK_SZABLONU)).toBe(container.querySelector("main"));
    expect(obszarTresci()).toBeNull();
    expect(container.textContent).not.toContain("Kryzys psychiczny");
  });

  it("dostęp wygasł", async () => {
    pobierzDaneLekcji.mockResolvedValue({ status: "wygasl", komunikat: "Twój dostęp do platformy wygasł." });

    const { container } = render(<Lekcja id="21" />);
    await screen.findByText("Twój dostęp do platformy wygasł.");

    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector(ZNACZNIK_SZABLONU)).toBe(container.querySelector("main"));
  });

  it("nie znaleziono lekcji", async () => {
    pobierzDaneLekcji.mockResolvedValue({ status: "nie-znaleziono" });

    const { container } = render(<Lekcja id="999" />);
    await screen.findByText("Nie znaleziono lekcji.");

    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector(ZNACZNIK_SZABLONU)).toBe(container.querySelector("main"));
  });

  it("błąd sieci", async () => {
    pobierzDaneLekcji.mockResolvedValue({ status: "blad" });

    const { container } = render(<Lekcja id="21" />);
    await screen.findByText("Nie udało się wczytać lekcji");

    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector(ZNACZNIK_SZABLONU)).toBe(container.querySelector("main"));
  });
});
