import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "@/design-system/atomy/Button/Button";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import type { DanePulpitu } from "../dane";
import { grupa, kurs, pulpit, pytanie, termin } from "./atrapy";

const pobierzPulpit = vi.fn();
const push = vi.fn();
const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back, refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("../dane", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../dane")>()),
  pobierzPulpit: (...args: unknown[]) => pobierzPulpit(...args),
}));

const { PulpitProwadzacego } = await import("../PulpitProwadzacego");

const awaria = (rodzaj: "zakazane" | "siec" | "blad") => ({ stan: "awaria" as const, rodzaj });
const ZA_TYDZIEN = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

function przyciskiGlowne(kontener: HTMLElement): HTMLButtonElement[] {
  return Array.from(kontener.querySelectorAll("button")).filter((przycisk) => przycisk.className.includes("primary"));
}

function sprawdzSzablon(kontener: HTMLElement) {
  expect(() => jedenMain(kontener)).not.toThrow();
  expect(kontener.querySelector("main")?.dataset.styleId).toBe("szablon-pulpit");
}

function pulpitZTerminem(nadpisania: Partial<DanePulpitu> = {}): DanePulpitu {
  return pulpit({ grupa: { stan: "ok", dane: grupa(2, [termin(7, ZA_TYDZIEN)]) }, ...nadpisania });
}

beforeEach(() => {
  pobierzPulpit.mockReset();
  push.mockReset();
  back.mockReset();
});

describe("kontrola dodatnia licznika przycisków głównych", () => {
  it("liczy przycisk primary, nie liczy outline ani quiet", () => {
    const { container } = render(
      <>
        <Button poziom="primary">A</Button>
        <Button poziom="outline">B</Button>
        <Button poziom="quiet">C</Button>
      </>,
    );
    expect(przyciskiGlowne(container)).toHaveLength(1);
  });
});

describe("kontrola dodatnia sprawdzenia jednego main", () => {
  it("dwa main albo main bez id=tresc są odrzucone", () => {
    const dwa = render(
      <>
        <main id="tresc" tabIndex={-1} />
        <main id="tresc" tabIndex={-1} />
      </>,
    );
    expect(() => jedenMain(dwa.container)).toThrow();
    const bezId = render(<main tabIndex={-1} />);
    expect(() => jedenMain(bezId.container)).toThrow();
  });
});

describe("PulpitProwadzacego — stan ładowanie", () => {
  it("szkielet w szablonie, jeden main, bez przycisku głównego", () => {
    pobierzPulpit.mockReturnValue(new Promise(() => {}));
    const { container } = render(<PulpitProwadzacego />);
    sprawdzSzablon(container);
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(screen.queryByText("Nie masz dziś nic do zrobienia")).toBeNull();
  });
});

describe("PulpitProwadzacego — stan dane, prowadzący z pytaniami", () => {
  it("jeden przycisk główny „Odpowiedz na pytania” prowadzi do skrzynki pytań", async () => {
    pobierzPulpit.mockResolvedValue(pulpitZTerminem());
    const uzytkownik = userEvent.setup();
    const { container } = render(<PulpitProwadzacego />);

    const przycisk = await screen.findByRole("button", { name: "Odpowiedz na pytania" });
    sprawdzSzablon(container);
    expect(przyciskiGlowne(container)).toEqual([przycisk]);
    expect(przycisk).toBeEnabled();

    await uzytkownik.click(przycisk);
    expect(push).toHaveBeenCalledWith("/prowadzacy/pytania");
  });

  it("pokazuje liczbę pytań, grupę i kursy z odnośnikami do istniejących ekranów", async () => {
    pobierzPulpit.mockResolvedValue(pulpitZTerminem());
    render(<PulpitProwadzacego />);
    await screen.findByRole("button", { name: "Odpowiedz na pytania" });

    expect(screen.getByRole("heading", { level: 2, name: "Pytania bez odpowiedzi" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Moja grupa" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Moje kursy" })).toBeInTheDocument();
    // Wiersz pytania: tytuł to treść pytania, pod spodem osoba i lekcja.
    expect(screen.getAllByText("Jak zacząć rozmowę z osobą w kryzysie?")).toHaveLength(2);
    expect(screen.getAllByText("Marta Demo · lekcja „Wprowadzenie do wywiadu”")).toHaveLength(2);

    const adresy = screen.getAllByRole("link").map((odnosnik) => odnosnik.getAttribute("href"));
    expect(adresy).toContain("/prowadzacy/pytania");
    expect(adresy).toContain("/prowadzacy/grupa");
    expect(adresy).toContain("/prowadzacy/kursy");
    expect(adresy).toContain("/prowadzacy/kursy/2");
    expect(adresy).toContain("/prowadzacy/kursy/3");
  });

  it("pokazuje tylko pięć wierszy pytań i dopisuje, ile jest w skrzynce", async () => {
    const wiersze = Array.from({ length: 7 }, (_, i) => pytanie(i + 1));
    pobierzPulpit.mockResolvedValue(pulpitZTerminem({ pytania: { stan: "ok", dane: { liczba: 12, wiersze } } }));
    render(<PulpitProwadzacego />);
    await screen.findByRole("button", { name: "Odpowiedz na pytania" });

    expect(screen.getAllByText(/^Marta Demo · lekcja „Wprowadzenie do wywiadu”$/)).toHaveLength(5);
    expect(screen.getByText("Pokazano 5 z 12 (pytań).")).toBeInTheDocument();
  });
});

describe("PulpitProwadzacego — prowadzący bez pytań", () => {
  it("z terminem przed nami: aktywny „Zobacz pytania” w nagłówku, jedyny przycisk główny, bez nieaktywnego obrysu", async () => {
    pobierzPulpit.mockResolvedValue(pulpitZTerminem({ pytania: { stan: "ok", dane: { liczba: 0, wiersze: [] } } }));
    const uzytkownik = userEvent.setup();
    const { container } = render(<PulpitProwadzacego />);

    const przycisk = await screen.findByRole("button", { name: "Zobacz pytania" });
    expect(przycisk).toBeEnabled();
    expect(przycisk).not.toHaveAttribute("aria-disabled");
    expect(przyciskiGlowne(container)).toEqual([przycisk]);
    expect(container.querySelector("[data-testid='pageheader-glowa']")).toContainElement(przycisk);
    expect(screen.queryByRole("button", { name: "Odpowiedz na pytania" })).toBeNull();
    expect(screen.queryByText("Nie ma pytań bez odpowiedzi.")).toBeNull();
    sprawdzSzablon(container);
    await uzytkownik.click(przycisk);
    expect(push).toHaveBeenCalledWith("/prowadzacy/pytania");
    expect(screen.queryByText("Nie masz dziś nic do zrobienia")).toBeNull();
  });
});

describe("PulpitProwadzacego — karta „Do zrobienia dziś”", () => {
  it("z pytaniami: jedna karta, etykieta zdaniem, jeden h2 z liczbą pytań, bez przycisku i bez „: n” w nagłówkach kart", async () => {
    pobierzPulpit.mockResolvedValue(pulpitZTerminem());
    const { container } = render(<PulpitProwadzacego />);
    await screen.findByRole("button", { name: "Odpowiedz na pytania" });

    const obszar = container.querySelector("[data-obszar='nastepny-krok']") as HTMLElement;
    expect(obszar.querySelectorAll("[data-karta='nastepny-krok']")).toHaveLength(1);
    expect(obszar.textContent).toContain("Do zrobienia dziś");
    const naglowki = obszar.querySelectorAll("h2");
    expect(naglowki).toHaveLength(1);
    expect(naglowki[0].textContent).toBe("2 pytania czekają na odpowiedź");
    expect(obszar.querySelector("button")).toBeNull();
    for (const naglowek of Array.from(container.querySelectorAll("h2, h3"))) {
      expect(naglowek.textContent).not.toMatch(/: \d/);
    }
  });

  it("bez pytań: ta sama karta niesie najbliższą superwizję (kontrola dodatnia: z pytaniami nagłówek mówi o pytaniach)", async () => {
    pobierzPulpit.mockResolvedValue(pulpitZTerminem({ pytania: { stan: "ok", dane: { liczba: 0, wiersze: [] } } }));
    const { container } = render(<PulpitProwadzacego />);
    await screen.findByRole("button", { name: "Zobacz pytania" });

    const obszar = container.querySelector("[data-obszar='nastepny-krok']") as HTMLElement;
    expect(obszar.querySelectorAll("[data-karta='nastepny-krok']")).toHaveLength(1);
    expect(obszar.querySelectorAll("h2")).toHaveLength(1);
    expect(obszar.querySelector("h2")?.textContent).toMatch(/^Najbliższa superwizja: /);
    expect(obszar.textContent).not.toMatch(/czek(a|ają) na odpowiedź/);
  });
});

describe("PulpitProwadzacego — stan pusty", () => {
  it("bez pytań i bez terminów: zdanie „Nie masz dziś nic do zrobienia”, nie pusta tabela", async () => {
    pobierzPulpit.mockResolvedValue(
      pulpit({
        pytania: { stan: "ok", dane: { liczba: 0, wiersze: [] } },
        grupa: { stan: "ok", dane: grupa(0) },
        kursy: { stan: "ok", dane: [] },
      }),
    );
    const { container } = render(<PulpitProwadzacego />);

    expect(await screen.findByRole("heading", { name: "Nie masz dziś nic do zrobienia" })).toBeInTheDocument();
    sprawdzSzablon(container);
    expect(przyciskiGlowne(container)).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Zobacz pytania" })).toBeEnabled();
    expect(container.querySelector("table")).toBeNull();
  });
});

describe("PulpitProwadzacego — częściowa awaria jednej z trzech tras", () => {
  it.each([
    ["kursy", "Nie udało się wczytać: moje kursy", "Pytania bez odpowiedzi", 2],
    ["grupa", "Nie udało się wczytać: moja grupa i terminy superwizji", "Moje kursy", 3],
    ["pytania", "Nie udało się wczytać: pytania bez odpowiedzi", "Moja grupa", 3],
  ] as const)("awaria trasy %s: sekcja jako Notice, pozostałe widoczne", async (klucz, komunikat, widoczna, stopien) => {
    pobierzPulpit.mockResolvedValue(pulpitZTerminem({ [klucz]: awaria("blad") }));
    const { container } = render(<PulpitProwadzacego />);

    const alert = await screen.findByRole("alert");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(within(alert).getByRole("heading", { name: komunikat })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: stopien, name: widoczna })).toBeInTheDocument();
    sprawdzSzablon(container);
  });

  it("awaria pytań nie pokazuje zera ani „Nic do zrobienia” i nie ma przycisku głównego", async () => {
    pobierzPulpit.mockResolvedValue(pulpitZTerminem({ pytania: awaria("siec") }));
    const { container } = render(<PulpitProwadzacego />);
    await screen.findByRole("alert");
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Odpowiedz na pytania" })).toBeNull();
    expect(screen.queryByText("Nie masz dziś nic do zrobienia")).toBeNull();
    expect(screen.getByLabelText("Pytania bez odpowiedzi: brak danych")).toHaveTextContent("—");
  });
});

describe("PulpitProwadzacego — 403", () => {
  it("wszystkie trzy trasy odmówione: jedno zdanie o roli i wyjście, bez przycisku głównego", async () => {
    pobierzPulpit.mockResolvedValue({ pytania: awaria("zakazane"), grupa: awaria("zakazane"), kursy: awaria("zakazane") });
    const uzytkownik = userEvent.setup();
    const { container } = render(<PulpitProwadzacego />);

    expect(await screen.findByText(/tylko dla prowadzących/)).toBeInTheDocument();
    sprawdzSzablon(container);
    expect(przyciskiGlowne(container)).toHaveLength(0);
    await uzytkownik.click(screen.getByRole("button", { name: "Wróć" }));
    expect(back).toHaveBeenCalled();
  });
});

describe("PulpitProwadzacego — błąd sieci", () => {
  it("wszystkie trzy trasy bez odpowiedzi: komunikat z ponowieniem, które wczytuje dane", async () => {
    pobierzPulpit
      .mockResolvedValueOnce({ pytania: awaria("siec"), grupa: awaria("siec"), kursy: awaria("siec") })
      .mockResolvedValueOnce(pulpitZTerminem());
    const uzytkownik = userEvent.setup();
    const { container } = render(<PulpitProwadzacego />);

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/Brak połączenia z serwerem/)).toBeInTheDocument();
    sprawdzSzablon(container);
    expect(przyciskiGlowne(container)).toHaveLength(0);

    await uzytkownik.click(within(alert).getByRole("button", { name: "Spróbuj ponownie" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Odpowiedz na pytania" })).toBeEnabled());
    expect(pobierzPulpit).toHaveBeenCalledTimes(2);
    sprawdzSzablon(container);
  });
});

describe("PulpitProwadzacego — szablon w każdym stanie", () => {
  it("wszystkie stany niosą data-style-id szablonu pulpitu i jeden main", async () => {
    const stany: DanePulpitu[] = [
      pulpitZTerminem(),
      pulpitZTerminem({ kursy: { stan: "ok", dane: [kurs(2)] }, pytania: { stan: "ok", dane: { liczba: 0, wiersze: [] } } }),
      { pytania: awaria("zakazane"), grupa: awaria("zakazane"), kursy: awaria("zakazane") },
      { pytania: awaria("blad"), grupa: awaria("siec"), kursy: awaria("blad") },
    ];
    for (const stan of stany) {
      pobierzPulpit.mockResolvedValueOnce(stan);
      const { container, unmount } = render(<PulpitProwadzacego />);
      await waitFor(() => expect(container.querySelector("[aria-busy='true']")).toBeNull());
      sprawdzSzablon(container);
      unmount();
    }
  });
});

describe("PulpitProwadzacego — przycisk główny w nagłówku (makieta 2.0.4, `.head .acts`)", () => {
  it("z pytaniami: „Odpowiedz na pytania” stoi w nagłówku przy tytule, a listy głównej kolumny mają h2", async () => {
    pobierzPulpit.mockResolvedValue(pulpitZTerminem());
    const { container } = render(<PulpitProwadzacego />);

    const przycisk = await screen.findByRole("button", { name: "Odpowiedz na pytania" });
    const glowa = container.querySelector("[data-testid='pageheader-glowa']")!;
    expect(glowa).toContainElement(screen.getByRole("heading", { level: 1 }));
    expect(glowa).toContainElement(przycisk);
    expect(container.querySelector("[data-obszar='nastepny-krok'] button")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Pytania bez odpowiedzi" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Nadchodzące superwizje" })).toBeInTheDocument();
  });

  it("bez pytań: aktywny „Zobacz pytania” stoi w nagłówku przy tytule (kontrola dodatnia: z pytaniami w tym samym miejscu jest „Odpowiedz na pytania”)", async () => {
    pobierzPulpit.mockResolvedValue(pulpitZTerminem({ pytania: { stan: "ok", dane: { liczba: 0, wiersze: [] } } }));
    const { container } = render(<PulpitProwadzacego />);

    const przycisk = await screen.findByRole("button", { name: "Zobacz pytania" });
    const glowa = container.querySelector("[data-testid='pageheader-glowa']")!;
    expect(glowa).toContainElement(screen.getByRole("heading", { level: 1 }));
    expect(glowa).toContainElement(przycisk);
    cleanup();

    pobierzPulpit.mockResolvedValue(pulpitZTerminem());
    const z = render(<PulpitProwadzacego />);
    const odpowiedz = await screen.findByRole("button", { name: "Odpowiedz na pytania" });
    expect(z.container.querySelector("[data-testid='pageheader-glowa']")).toContainElement(odpowiedz);
  });
});
