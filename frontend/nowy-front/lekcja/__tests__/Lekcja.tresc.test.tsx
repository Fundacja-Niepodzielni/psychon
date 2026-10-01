import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";

const pobierzDaneLekcji = vi.fn();
const ukonczLekcje = vi.fn();
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
  };
});

const { Lekcja } = await import("../Lekcja");

const TRESC = "## Cel lekcji\n\nPierwszy akapit z **pogrubieniem**.\n\n- punkt pierwszy\n- punkt drugi";

const LEKCJA = {
  id: 21,
  title: "Wprowadzenie do wywiadu",
  description: "Opis lekcji",
  content: TRESC,
  topic: { id: 7, title: "Rozmowa otwierająca", position: 1 },
  duration_seconds: 1800,
  position_seconds: 0,
  watched_seconds: 812,
  active_seconds: 700,
  is_completed: false,
  completable: false,
  completable_at_percent: 60,
};

const ZNACZNIK_SZABLONU = '[data-style-id="szablon-lekcja"]';

beforeEach(() => {
  pobierzDaneLekcji.mockReset();
  ukonczLekcje.mockReset();
  back.mockReset();
});

function obszarTresci() {
  return screen.queryByRole("region", { name: "Treść lekcji" });
}

describe("Lekcja — treść lekcji", () => {
  it("z nagraniem i treścią: odtwarzacz oraz treść w podzbiorze Markdown", async () => {
    pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane: LEKCJA, bezNagrania: false });

    render(<Lekcja id="21" />);

    const tresc = await screen.findByRole("region", { name: "Treść lekcji" });
    expect(screen.getByRole("button", { name: "Odtwórz" })).toBeInTheDocument();
    expect(within(tresc).getByRole("heading", { name: "Cel lekcji" })).toBeInTheDocument();
    expect(within(tresc).getByText("pogrubieniem").tagName).toBe("STRONG");
    expect(within(tresc).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Opis lekcji")).toBeInTheDocument();
  });

  it("bez nagrania, z opisem i treścią: sama treść, bez ramki odtwarzacza i bez stanu pustego", async () => {
    pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane: LEKCJA, bezNagrania: true });

    render(<Lekcja id="21" />);

    const tresc = await screen.findByRole("region", { name: "Treść lekcji" });
    expect(within(tresc).getByText(/Pierwszy akapit/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Odtwórz" })).toBeNull();
    expect(screen.queryByText("Lekcja bez treści")).toBeNull();
  });

  it("bez nagrania i bez opisu, z treścią: tytuł i treść, bez stanu pustego i bez ramki", async () => {
    pobierzDaneLekcji.mockResolvedValue({
      status: "ok",
      dane: { ...LEKCJA, description: null },
      bezNagrania: true,
    });

    const { container } = render(<Lekcja id="21" />);

    const tresc = await screen.findByRole("region", { name: "Treść lekcji" });
    expect(within(tresc).getByText(/Pierwszy akapit/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: LEKCJA.title })).toBeInTheDocument();
    expect(screen.queryByText("Lekcja bez treści")).toBeNull();
    expect(screen.queryByRole("button", { name: "Odtwórz" })).toBeNull();
    expect(container.querySelector(ZNACZNIK_SZABLONU)).not.toBeNull();
  });

  it("z nagraniem, ale bez treści (content: null): żaden obszar treści nie udaje jej", async () => {
    pobierzDaneLekcji.mockResolvedValue({
      status: "ok",
      dane: { ...LEKCJA, content: null },
      bezNagrania: false,
    });

    render(<Lekcja id="21" />);

    expect(await screen.findByRole("button", { name: "Odtwórz" })).toBeInTheDocument();
    expect(obszarTresci()).toBeNull();
  });

  it("treść złożona z samych białych znaków nie tworzy obszaru treści", async () => {
    pobierzDaneLekcji.mockResolvedValue({
      status: "ok",
      dane: { ...LEKCJA, content: "  \n\n " },
      bezNagrania: false,
    });

    render(<Lekcja id="21" />);

    await screen.findByRole("button", { name: "Odtwórz" });
    expect(obszarTresci()).toBeNull();
  });

  it("bez nagrania, bez opisu i bez treści: uczciwy stan pusty z powrotem do kursu", async () => {
    const uzytkownik = userEvent.setup();
    pobierzDaneLekcji.mockResolvedValue({
      status: "ok",
      dane: { ...LEKCJA, description: null, content: null },
      bezNagrania: true,
    });

    render(<Lekcja id="21" />);

    expect(await screen.findByRole("heading", { name: "Lekcja bez treści" })).toBeInTheDocument();
    expect(obszarTresci()).toBeNull();
    await uzytkownik.click(screen.getByRole("button", { name: "Wróć do kursu" }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("HTML i niebezpieczny link w treści są tekstem, nie elementami", async () => {
    pobierzDaneLekcji.mockResolvedValue({
      status: "ok",
      dane: {
        ...LEKCJA,
        content: "<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[kliknij](javascript:alert(1))",
      },
      bezNagrania: true,
    });

    const { container } = render(<Lekcja id="21" />);

    const tresc = await screen.findByRole("region", { name: "Treść lekcji" });
    expect(tresc.textContent).toContain("<script>alert(1)</script>");
    expect(tresc.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(tresc.querySelector("a")).toBeNull();
  });

  it("okruszki niosą temat lekcji, gdy lekcja go ma", async () => {
    pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane: LEKCJA, bezNagrania: false });

    render(<Lekcja id="21" />);

    await screen.findByRole("region", { name: "Treść lekcji" });
    expect(screen.getByText("Rozmowa otwierająca")).toBeInTheDocument();
  });
});

describe("Lekcja — szablon i jeden main w każdym stanie", () => {
  it("ładowanie", () => {
    pobierzDaneLekcji.mockReturnValue(new Promise(() => {}));

    const { container } = render(<Lekcja id="21" />);

    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector(ZNACZNIK_SZABLONU)).toBe(container.querySelector("main"));
    expect(container.querySelector('[data-obszar="glowna"] [aria-busy="true"]')).not.toBeNull();
  });

  it("dane z nagraniem", async () => {
    pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane: LEKCJA, bezNagrania: false });

    const { container } = render(<Lekcja id="21" />);
    await screen.findByRole("region", { name: "Treść lekcji" });

    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector(ZNACZNIK_SZABLONU)).toBe(container.querySelector("main"));
  });

  it("dane bez nagrania", async () => {
    pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane: LEKCJA, bezNagrania: true });

    const { container } = render(<Lekcja id="21" />);
    await screen.findByRole("region", { name: "Treść lekcji" });

    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector(ZNACZNIK_SZABLONU)).toBe(container.querySelector("main"));
  });

  it("stan pusty lekcji", async () => {
    pobierzDaneLekcji.mockResolvedValue({
      status: "ok",
      dane: { ...LEKCJA, description: null, content: null },
      bezNagrania: true,
    });

    const { container } = render(<Lekcja id="21" />);
    await screen.findByRole("heading", { name: "Lekcja bez treści" });

    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector(ZNACZNIK_SZABLONU)).toBe(container.querySelector("main"));
  });

  it("po ukończeniu lekcji", async () => {
    const uzytkownik = userEvent.setup();
    pobierzDaneLekcji.mockResolvedValue({
      status: "ok",
      dane: { ...LEKCJA, active_seconds: 1800, completable: true },
      bezNagrania: true,
    });
    ukonczLekcje.mockResolvedValue({ status: "ok", completed_at: "2026-10-03T12:30:00Z" });

    const { container } = render(<Lekcja id="21" />);
    await uzytkownik.click(await screen.findByRole("button", { name: "Oznacz jako ukończoną" }));
    await screen.findByText("Lekcja ukończona");

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
    expect(container.textContent).not.toContain("Pierwszy akapit");
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

describe("Lekcja — przycisk główny", () => {
  function przyciskiGlowne() {
    return screen
      .getAllByRole("button")
      .filter((b) => b.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)));
  }

  it("aktywny próg: „Oznacz jako ukończoną” jest jedynym przyciskiem głównym", async () => {
    pobierzDaneLekcji.mockResolvedValue({
      status: "ok",
      dane: { ...LEKCJA, active_seconds: 1800, completable: true },
      bezNagrania: true,
    });

    render(<Lekcja id="21" />);
    await screen.findByRole("button", { name: "Oznacz jako ukończoną" });

    const glowne = przyciskiGlowne();
    expect(glowne).toHaveLength(1);
    expect(glowne[0]).toHaveTextContent("Oznacz jako ukończoną");
  });

  it("poniżej progu: przycisk jest drugorzędny i nieaktywny, żaden nie jest główny", async () => {
    pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane: LEKCJA, bezNagrania: true });

    render(<Lekcja id="21" />);
    const przycisk = await screen.findByRole("button", { name: "Oznacz jako ukończoną" });

    expect(przycisk).toBeDisabled();
    expect(przyciskiGlowne()).toHaveLength(0);
  });
});
