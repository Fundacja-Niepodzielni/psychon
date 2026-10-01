import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import type { KursProwadzacego } from "../dane";

/**
 * Ekran „Moje kursy” (prowadzący): każdy stan w szablonie listy z jednym
 * `main`, lista kursów z odnośnikiem „Otwórz kurs” do strony kursu
 * prowadzącego, stan pusty z informacją, kto przypisuje kursy, odmowa z
 * powodu roli (atrapa 401/403, 0 danych w DOM), błąd połączenia z
 * ponowieniem. Każda atrapa odpowiedzi serwera ma jawny typ z `../dane`,
 * więc brak albo obcy klucz w atrapie czerwieni `npm run sprawdz-typy`.
 */

const api = vi.fn();
const back = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push, refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, api: (...argumenty: unknown[]) => api(...argumenty) };
});

const { ApiError } = await import("@/lib/api/klient");
const { KursyProwadzacego } = await import("../KursyProwadzacego");

const KURS_W_PROGRAMIE = {
  id: 3,
  slug: "wywiad-psychologiczny",
  title: "Wywiad psychologiczny",
  sequence_order: 2,
} satisfies KursProwadzacego;

const KURS_POZA_PROGRAMEM = {
  id: 9,
  slug: "spotkanie-na-zywo",
  title: "Spotkanie na żywo: dyżur w praktyce",
  sequence_order: null,
} satisfies KursProwadzacego;

const KURS_Z_HTML = {
  id: 10,
  slug: "kurs-z-html",
  title: '<img src=x onerror="window.zlo=1"> Kurs',
  sequence_order: 1,
} satisfies KursProwadzacego;

beforeEach(() => {
  api.mockReset();
  back.mockReset();
  push.mockReset();
});

/** Sprawdzenie szablonu: jedyny `main` z `id="tresc"` i znacznik szablonu listy. */
function sprawdzSzablon(kontener: HTMLElement) {
  jedenMain(kontener);
  expect(kontener.querySelector("main")?.dataset.styleId).toBe("szablon-lista");
}

function odnosnikiOtworz(): HTMLElement[] {
  return screen.queryAllByRole("link", { name: /^Otwórz kurs: / });
}

function przyciskiGlowne(kontener: HTMLElement): HTMLElement[] {
  return Array.from(kontener.querySelectorAll<HTMLElement>("button")).filter((przycisk) => /primary/.test(przycisk.className));
}

describe("Moje kursy — próba kontrolna sprawdzenia szablonu", () => {
  it("sprawdzenie czerwienieje bez znacznika szablonu listy i przy dwóch main", () => {
    const { container } = render(<main id="tresc" tabIndex={-1} />);
    expect(() => sprawdzSzablon(container)).toThrow();
    const { container: dwa } = render(
      <div>
        <main id="tresc" tabIndex={-1} data-style-id="szablon-lista" />
        <main />
      </div>,
    );
    expect(() => sprawdzSzablon(dwa)).toThrow();
  });
});

describe("Moje kursy — ładowanie", () => {
  it("szkielet w szablonie listy, jeden main, zero kursów", () => {
    api.mockReturnValue(new Promise(() => {}));
    const { container } = render(<KursyProwadzacego />);

    sprawdzSzablon(container);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(odnosnikiOtworz()).toHaveLength(0);
    expect(screen.getByRole("heading", { level: 1, name: "Moje kursy" })).toBeInTheDocument();
  });
});

describe("Moje kursy — dane", () => {
  it("woła dokładnie GET /instructor/courses i pokazuje kursy z pozycją w programie oraz odnośnikiem „Otwórz kurs” do strony kursu", async () => {
    api.mockResolvedValue([KURS_W_PROGRAMIE, KURS_POZA_PROGRAMEM] satisfies KursProwadzacego[]);
    const { container } = render(<KursyProwadzacego />);

    expect(await screen.findByText(KURS_W_PROGRAMIE.title)).toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/instructor/courses");
    expect(screen.getByText(KURS_POZA_PROGRAMEM.title)).toBeInTheDocument();
    expect(screen.getByText("Kurs 2 w programie")).toBeInTheDocument();
    expect(screen.getByText("Poza kolejnością programu")).toBeInTheDocument();
    expect(odnosnikiOtworz().map((odnosnik) => odnosnik.getAttribute("href"))).toEqual(["/prowadzacy/kursy/3", "/prowadzacy/kursy/9"]);
    // Widoczny napis akcji to samo „Otwórz”; pełna nazwa z tytułem tylko dla czytnika.
    expect(odnosnikiOtworz().map((odnosnik) => odnosnik.textContent?.replace("›", "").trim())).toEqual(["Otwórz", "Otwórz"]);
    expect(odnosnikiOtworz().map((odnosnik) => odnosnik.getAttribute("aria-label"))).toEqual([
      `Otwórz kurs: ${KURS_W_PROGRAMIE.title}`,
      `Otwórz kurs: ${KURS_POZA_PROGRAMEM.title}`,
    ]);
    sprawdzSzablon(container);
    expect(przyciskiGlowne(container)).toHaveLength(0);
  });

  it("tytuł kursu z HTML jest tekstem: zero elementów z treści, zero wykonania", async () => {
    api.mockResolvedValue([KURS_Z_HTML] satisfies KursProwadzacego[]);
    const { container } = render(<KursyProwadzacego />);

    expect(await screen.findByText(KURS_Z_HTML.title)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect("zlo" in window).toBe(false);
  });

  it("próba kontrolna: to samo sprawdzenie widzi element, gdy treść naprawdę go zawiera", () => {
    const { container } = render(<div dangerouslySetInnerHTML={{ __html: KURS_Z_HTML.title }} />);
    expect(container.querySelector("img")).not.toBeNull();
  });
});

describe("Moje kursy — stan pusty", () => {
  it("„Nie masz przypisanych kursów” z informacją, kto przypisuje; zero odnośników; wyjście do pulpitu", async () => {
    const uzytkownik = userEvent.setup();
    api.mockResolvedValue([] satisfies KursProwadzacego[]);
    const { container } = render(<KursyProwadzacego />);

    expect(await screen.findByText("Nie masz przypisanych kursów")).toBeInTheDocument();
    expect(screen.getByText(/Kursy przypisuje administracja Fundacji/)).toBeInTheDocument();
    sprawdzSzablon(container);
    expect(odnosnikiOtworz()).toHaveLength(0);
    await uzytkownik.click(screen.getByRole("button", { name: "Wróć do pulpitu" }));
    expect(push).toHaveBeenCalledWith("/prowadzacy");
  });
});

describe("Moje kursy — odmowa z powodu roli", () => {
  it.each([
    ["403 forbidden", 403, "forbidden"],
    ["401 unauthenticated", 401, "unauthenticated"],
  ])("%s: wariant odmowy z rolą, szablon, zero danych w DOM", async (_nazwa, status, kod) => {
    api.mockRejectedValue(new ApiError({ status, code: kod, message: "Nie masz dostępu do tej sekcji." }));
    const { container } = render(<KursyProwadzacego />);

    expect(await screen.findByText(/prowadzących/)).toBeInTheDocument();
    sprawdzSzablon(container);
    expect(odnosnikiOtworz()).toHaveLength(0);
    expect(screen.queryByText("Nie masz przypisanych kursów")).toBeNull();
    expect(container.textContent).not.toMatch(/Brak dostępu|Nie masz uprawnień/);
  });
});

describe("Moje kursy — błąd połączenia", () => {
  it.each([
    ["brak połączenia", () => new TypeError("Failed to fetch"), "Serwer nie odpowiedział albo zwrócił błąd. Kursy nie są pokazywane bez danych."],
    ["500 z koperty", () => new ApiError({ status: 500, code: "server_error", message: "Błąd serwera." }), "Błąd serwera."],
  ])("%s: Notice z „Spróbuj ponownie”, komunikat z koperty (albo ogólny bez koperty), ponowienie wczytuje listę", async (_nazwa, blad, tresc) => {
    const uzytkownik = userEvent.setup();
    api.mockRejectedValueOnce(blad()).mockResolvedValue([KURS_W_PROGRAMIE] satisfies KursProwadzacego[]);
    const { container } = render(<KursyProwadzacego />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Nie udało się wczytać kursów");
    expect(screen.getByRole("alert")).toHaveTextContent(tresc);
    if (blad() instanceof ApiError) {
      expect(screen.getByRole("alert")).not.toHaveTextContent("Serwer nie odpowiedział");
    }
    sprawdzSzablon(container);
    expect(odnosnikiOtworz()).toHaveLength(0);

    await uzytkownik.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(await screen.findByText(KURS_W_PROGRAMIE.title)).toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(2);
  });
});
