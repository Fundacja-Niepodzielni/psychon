import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { ApiError } from "@/lib/api/klient";
import { KURS_POZA_SCIEZKA, KURS_UKONCZONY, KURS_W_TOKU, KURS_ZAMKNIETY, SZCZEGOL_W_TOKU } from "./atrapy";

/**
 * Stany ekranu „Moje kursy”: ładowanie · błąd · brak połączenia · brak dostępu · nie znaleziono ·
 * brak kursów · kursy w każdym stanie (ukończony, w toku, zamknięty, poza ścieżką) · jedyny
 * zielony przycisk w każdym stanie. Każdy stan sprawdza nagłówek, przycisk główny (czy jest i
 * czy działa), zdanie wyjaśniające, nazwy dostępne odnośników i przycisków.
 */

const push = vi.fn();
const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push, replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const pobierzKursy = vi.fn();
const pobierzSzczegolKursu = vi.fn();
vi.mock("../dane", () => ({
  pobierzKursy: (...argumenty: unknown[]) => pobierzKursy(...argumenty),
  pobierzSzczegolKursu: (...argumenty: unknown[]) => pobierzSzczegolKursu(...argumenty),
}));

const { KursyUczestnika } = await import("../KursyUczestnika");

/** Naruszenia axe bez kontrastu: jsdom nie liczy układu strony, więc kontrastu nie da się w nim zmierzyć. */
async function naruszenia(container: HTMLElement) {
  const wynik = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return wynik.violations;
}

function blad(status: number) {
  return new ApiError({ status, code: "x", message: "komunikat serwera" });
}

/** Przyciski główne: `Button poziom="primary"` ma klasę `primary` z modułu CSS. */
function przyciskiGlowne(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>("button")].filter((przycisk) =>
    przycisk.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)),
  );
}

function wiersz(container: HTMLElement, stan: string): HTMLElement {
  const znaleziony = container.querySelector<HTMLElement>(`[data-kurs-stan="${stan}"]`);
  if (!znaleziony) throw new Error(`brak wiersza kursu w stanie ${stan}`);
  return znaleziony;
}

beforeEach(() => {
  push.mockReset();
  back.mockReset();
  pobierzKursy.mockReset();
  pobierzSzczegolKursu.mockReset().mockResolvedValue(SZCZEGOL_W_TOKU);
});

afterEach(cleanup);

describe("Moje kursy — ładowanie", () => {
  it("nagłówek strony, podpis „Ładowanie kursów…” i szkielet; bez przycisku głównego", () => {
    pobierzKursy.mockReturnValue(new Promise(() => {}));
    const { container } = render(<KursyUczestnika />);

    expect(screen.getByRole("heading", { level: 1, name: "Moje kursy" })).toBeInTheDocument();
    expect(screen.getByText("Kolejny etap otwiera się po ukończeniu poprzedniego.", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Ładowanie kursów…");
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(container.querySelectorAll("main")).toHaveLength(1);
  });
});

describe("Moje kursy — błędy odczytu listy", () => {
  it("błąd serwera: komunikat z przyciskiem „Spróbuj ponownie”, który wczytuje listę jeszcze raz", async () => {
    pobierzKursy.mockRejectedValueOnce(blad(500)).mockResolvedValueOnce([KURS_UKONCZONY]);
    const { container } = render(<KursyUczestnika />);

    expect(await screen.findByRole("heading", { level: 2, name: "Nie udało się wczytać kursów" })).toBeInTheDocument();
    expect(screen.getByText("Coś poszło nie tak po naszej stronie. Spróbuj ponownie za chwilę.")).toBeInTheDocument();
    expect(przyciskiGlowne(container)).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(await screen.findByText("Podstawy pomocy psychologicznej")).toBeInTheDocument();
    expect(pobierzKursy).toHaveBeenCalledTimes(2);
  });

  it("brak połączenia (wyjątek bez odpowiedzi): osobny komunikat i ponowienie", async () => {
    pobierzKursy.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<KursyUczestnika />);

    expect(await screen.findByRole("heading", { level: 2, name: "Brak połączenia" })).toBeInTheDocument();
    expect(
      screen.getByText("Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();
  });

  it.each([401, 403])("HTTP %i: wspólny ekran odmowy z jednym przyciskiem prowadzącym do pulpitu", async (status) => {
    pobierzKursy.mockRejectedValue(blad(status));
    const { container } = render(<KursyUczestnika />);

    expect(await screen.findByRole("heading", { level: 2, name: "Nie masz dostępu do tego ekranu" })).toBeInTheDocument();
    expect(screen.getByText("Ten ekran jest dla uczestników.", { exact: false })).toBeInTheDocument();
    const wroc = screen.getByRole("button", { name: "Wróć do pulpitu" });
    expect(przyciskiGlowne(container)).toHaveLength(0);
    fireEvent.click(wroc);
    expect(push).toHaveBeenCalledWith("/panel/pulpit");
  });

  it("HTTP 404: „Nie znaleziono kursów” z przyciskiem „Odśwież”", async () => {
    pobierzKursy.mockRejectedValueOnce(blad(404)).mockResolvedValueOnce([]);
    render(<KursyUczestnika />);

    expect(await screen.findByRole("heading", { level: 2, name: "Nie znaleziono kursów" })).toBeInTheDocument();
    expect(
      screen.getByText("Nie mamy dla Ciebie kursów do wyświetlenia. Odśwież stronę albo wróć za chwilę."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Odśwież" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Nie masz jeszcze kursów" })).toBeInTheDocument();
  });
});

describe("Moje kursy — brak kursów", () => {
  it("pusta lista: wyjaśnienie, skąd wezmą się kursy, przycisk „Odśwież”, brak przycisku głównego", async () => {
    pobierzKursy.mockResolvedValue([]);
    const { container } = render(<KursyUczestnika />);

    expect(await screen.findByRole("heading", { level: 2, name: "Nie masz jeszcze kursów" })).toBeInTheDocument();
    expect(
      screen.getByText("Gdy opiekun projektu udostępni Ci pierwszy etap, pojawi się on w tym miejscu."),
    ).toBeInTheDocument();
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(pobierzSzczegolKursu).not.toHaveBeenCalled();

    pobierzKursy.mockResolvedValue([KURS_UKONCZONY]);
    fireEvent.click(screen.getByRole("button", { name: "Odśwież" }));
    expect(await screen.findByText("Podstawy pomocy psychologicznej")).toBeInTheDocument();
  });
});

describe("Moje kursy — kursy w każdym stanie", () => {
  it("słowa i kolejność jak na pulpicie: ukończony · w toku · zamknięty, zdanie przy zamkniętym, nazwy odnośników", async () => {
    pobierzKursy.mockResolvedValue([KURS_ZAMKNIETY, KURS_POZA_SCIEZKA, KURS_W_TOKU, KURS_UKONCZONY]);
    const { container } = render(<KursyUczestnika />);
    await screen.findByText("Podstawy pomocy psychologicznej");

    expect(screen.getByRole("heading", { level: 2, name: "Twoje kursy" })).toBeInTheDocument();

    // Kolejność: etapy rosnąco, kurs poza ścieżką na końcu.
    const tytuly = [...container.querySelectorAll("[data-kurs-stan]")].map((w) => w.textContent ?? "");
    expect(tytuly[0]).toContain("Podstawy pomocy psychologicznej");
    expect(tytuly[1]).toContain("Wywiad psychologiczny");
    expect(tytuly[2]).toContain("Interwencja kryzysowa");
    expect(tytuly[3]).toContain("Webinar o superwizji");

    const ukonczony = wiersz(container, "completed");
    expect(within(ukonczony).getByText("ukończony")).toBeInTheDocument();
    expect(within(ukonczony).getByText("Kurs 1 · 100% ukończone")).toBeInTheDocument();
    expect(within(ukonczony).getByRole("link", { name: "Otwórz kurs: Podstawy pomocy psychologicznej" })).toHaveAttribute(
      "href",
      "/panel/kursy/podstawy-pomocy",
    );

    const wToku = container.querySelectorAll<HTMLElement>('[data-kurs-stan="in_progress"]');
    expect(wToku).toHaveLength(2);
    expect(within(wToku[0]).getByText("w toku")).toBeInTheDocument();
    expect(within(wToku[0]).getByText("Kurs 2 · 40% ukończone")).toBeInTheDocument();
    expect(within(wToku[0]).getByRole("link", { name: "Otwórz kurs: Wywiad psychologiczny" })).toHaveAttribute(
      "href",
      "/panel/kursy/wywiad-psychologiczny",
    );
    expect(within(wToku[1]).getByText("Poza ścieżką · 50% ukończone")).toBeInTheDocument();

    const zamkniety = wiersz(container, "locked");
    expect(within(zamkniety).getByText("zamknięty")).toBeInTheDocument();
    expect(within(zamkniety).getByText("Otworzy się po ukończeniu kursu „Wywiad psychologiczny”.")).toBeInTheDocument();
    const zamknietyPrzycisk = within(zamkniety).getByRole("button", { name: "Zamknięty" });
    expect(zamknietyPrzycisk).toHaveAttribute("aria-disabled", "true");
    expect(zamkniety.querySelector("a")).toBeNull();
  });

  it("kurs w toku: jedyny zielony przycisk „Wróć do lekcji” prowadzi do pierwszej nieukończonej lekcji", async () => {
    pobierzKursy.mockResolvedValue([KURS_UKONCZONY, KURS_W_TOKU, KURS_ZAMKNIETY]);
    const { container } = render(<KursyUczestnika />);

    const przycisk = await screen.findByRole("button", { name: "Wróć do lekcji" });
    expect(przyciskiGlowne(container)).toEqual([przycisk]);
    expect(przycisk).toBeEnabled();
    expect(przycisk).not.toHaveAttribute("aria-disabled");
    expect(pobierzSzczegolKursu).toHaveBeenCalledWith("wywiad-psychologiczny");

    fireEvent.click(przycisk);
    expect(push).toHaveBeenCalledWith("/panel/lekcje/22?kurs=wywiad-psychologiczny");
  });

  it("do chwili odczytu szczegółów kursu w toku nie ma przycisku głównego (a nie przycisk nieaktywny)", async () => {
    pobierzKursy.mockResolvedValue([KURS_W_TOKU]);
    pobierzSzczegolKursu.mockReturnValue(new Promise(() => {}));
    const { container } = render(<KursyUczestnika />);
    await screen.findByText("Wywiad psychologiczny");

    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Wróć do lekcji" })).toBeNull();
  });

  it("błąd odczytu szczegółów kursu: lista działa, przycisk główny to „Otwórz kurs”", async () => {
    pobierzKursy.mockResolvedValue([KURS_W_TOKU]);
    pobierzSzczegolKursu.mockRejectedValue(blad(500));
    const { container } = render(<KursyUczestnika />);

    const przycisk = await screen.findByRole("button", { name: "Otwórz kurs" });
    expect(przyciskiGlowne(container)).toEqual([przycisk]);
    expect(screen.getByRole("link", { name: "Otwórz kurs: Wywiad psychologiczny" })).toBeInTheDocument();
    fireEvent.click(przycisk);
    expect(push).toHaveBeenCalledWith("/panel/kursy/wywiad-psychologiczny");
  });

  it("wszystkie lekcje ukończone, test jeszcze nie zdany: „Przejdź do testu”", async () => {
    pobierzKursy.mockResolvedValue([KURS_W_TOKU]);
    pobierzSzczegolKursu.mockResolvedValue({ ...SZCZEGOL_W_TOKU, lessons: [SZCZEGOL_W_TOKU.lessons[0]] });
    render(<KursyUczestnika />);

    fireEvent.click(await screen.findByRole("button", { name: "Przejdź do testu" }));
    expect(push).toHaveBeenCalledWith("/panel/kursy/wywiad-psychologiczny/test");
  });

  it("cała ścieżka ukończona: „Zobacz warunki certyfikatu”", async () => {
    pobierzKursy.mockResolvedValue([KURS_UKONCZONY, { ...KURS_UKONCZONY, id: 5, slug: "drugi", sequence_order: 2 }]);
    const { container } = render(<KursyUczestnika />);

    const przycisk = await screen.findByRole("button", { name: "Zobacz warunki certyfikatu" });
    expect(przyciskiGlowne(container)).toEqual([przycisk]);
    fireEvent.click(przycisk);
    expect(push).toHaveBeenCalledWith("/panel/certyfikat");
    expect(pobierzSzczegolKursu).not.toHaveBeenCalled();
  });

  it("żaden kurs nie jest w toku, ścieżka nieukończona: wiersze są, przycisku głównego nie ma", async () => {
    pobierzKursy.mockResolvedValue([KURS_UKONCZONY, KURS_ZAMKNIETY]);
    const { container } = render(<KursyUczestnika />);
    await screen.findByText("Interwencja kryzysowa");

    expect(przyciskiGlowne(container)).toHaveLength(0);
  });

  it("lista zawsze ma dokładnie jeden punkt orientacyjny treści i nagłówek strony", async () => {
    pobierzKursy.mockResolvedValue([KURS_UKONCZONY, KURS_W_TOKU, KURS_ZAMKNIETY]);
    const { container } = render(<KursyUczestnika />);
    await screen.findByRole("button", { name: "Wróć do lekcji" });

    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(container.querySelector("main")).toHaveAttribute("data-style-id", "szablon-lista");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("brak naruszeń dostępności w stanie z danymi i w stanie błędu", async () => {
    pobierzKursy.mockResolvedValue([KURS_UKONCZONY, KURS_W_TOKU, KURS_ZAMKNIETY]);
    const { container, unmount } = render(<KursyUczestnika />);
    await screen.findByRole("button", { name: "Wróć do lekcji" });
    expect(await naruszenia(container)).toEqual([]);
    unmount();

    pobierzKursy.mockRejectedValue(blad(500));
    const bledny = render(<KursyUczestnika />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(await naruszenia(bledny.container)).toEqual([]);
  });
});
