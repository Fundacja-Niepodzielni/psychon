import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KURS, LEKCJA, wiszace, zrodloRamki } from "./pomoce";

const pobierzDaneLekcji = vi.fn();
const ukonczLekcje = vi.fn();
const pobierzOdczytKursu = vi.fn();
const back = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, refresh: vi.fn(), push, replace: vi.fn() }),
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

const MOZNA = { ...LEKCJA, active_seconds: 960, completable: true };

beforeEach(() => {
  pobierzDaneLekcji.mockReset();
  ukonczLekcje.mockReset();
  pobierzOdczytKursu.mockReset();
  pobierzOdczytKursu.mockResolvedValue(KURS);
  back.mockReset();
  push.mockReset();
});

describe("Lekcja — stan ładowania i danych", () => {
  it("przed odpowiedzią pokazuje szkielet, nie treść lekcji", () => {
    pobierzDaneLekcji.mockReturnValue(wiszace());

    render(<Lekcja id="21" />);

    expect(screen.queryByText(LEKCJA.title)).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("dane gotowe → tytuł, opis i okruszki z kursem i tematem", async () => {
    pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane: LEKCJA, bezNagrania: false, zrodloNagrania: zrodloRamki() });

    render(<Lekcja id="21" />);

    expect(await screen.findByRole("heading", { level: 1, name: LEKCJA.title })).toBeInTheDocument();
    expect(screen.getByText("Opis lekcji")).toBeInTheDocument();
    const okruszki = screen.getByRole("navigation", { name: "Gdzie jesteś" });
    expect(okruszki).toHaveTextContent("KursyPierwsza pomoc psychologicznaKryzys i jego przebieg");
  });

  it("odczyt kursu pyta o kurs z odczytu lekcji", async () => {
    pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane: LEKCJA, bezNagrania: false, zrodloNagrania: zrodloRamki() });

    render(<Lekcja id="21" />);
    await screen.findByText(/lekcji ukończone/);

    expect(pobierzOdczytKursu).toHaveBeenCalledWith("pierwsza-pomoc-psychologiczna");
  });
});

describe("Lekcja — ukończenie", () => {
  it("serwer odmawia (not_enough_active_time): zdanie przy przycisku, lekcja nieukończona", async () => {
    const uzytkownik = userEvent.setup();
    pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane: MOZNA, bezNagrania: false, zrodloNagrania: zrodloRamki() });
    ukonczLekcje.mockResolvedValue({ status: "za-malo-czasu" });

    render(<Lekcja id="21" />);
    await uzytkownik.click(await screen.findByRole("button", { name: "Oznacz lekcję jako ukończoną" }));

    expect(await screen.findByText("Serwer nie pozwala jeszcze ukończyć tej lekcji.")).toBeInTheDocument();
    expect(screen.queryByText("Ukończona")).toBeNull();
    expect(screen.getByRole("button", { name: "Oznacz lekcję jako ukończoną" })).toBeInTheDocument();
  });

  it("błąd sieci przy ukończeniu: zdanie z prośbą o ponowienie, przycisk zostaje, ponowienie kończy lekcję", async () => {
    const uzytkownik = userEvent.setup();
    pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane: MOZNA, bezNagrania: false, zrodloNagrania: zrodloRamki() });
    ukonczLekcje.mockResolvedValue({ status: "blad" });

    render(<Lekcja id="21" />);
    await uzytkownik.click(await screen.findByRole("button", { name: "Oznacz lekcję jako ukończoną" }));

    expect(
      await screen.findByText("Nie udało się ukończyć lekcji. Sprawdź internet i naciśnij jeszcze raz."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Oznacz lekcję jako ukończoną" })).not.toHaveAttribute("aria-disabled");

    ukonczLekcje.mockResolvedValue({ status: "ok", completed_at: "2026-10-03T12:30:00Z" });
    await uzytkownik.click(screen.getByRole("button", { name: "Oznacz lekcję jako ukończoną" }));
    expect(await screen.findByText("Ukończona")).toBeInTheDocument();
    expect(
      screen.queryByText("Nie udało się ukończyć lekcji. Sprawdź internet i naciśnij jeszcze raz."),
    ).toBeNull();
  });

  it("podwójne kliknięcie wysyła jedno żądanie", async () => {
    const uzytkownik = userEvent.setup();
    pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane: MOZNA, bezNagrania: false, zrodloNagrania: zrodloRamki() });
    ukonczLekcje.mockReturnValue(wiszace());

    render(<Lekcja id="21" />);
    const przycisk = await screen.findByRole("button", { name: "Oznacz lekcję jako ukończoną" });
    await uzytkownik.dblClick(przycisk);

    await waitFor(() => expect(ukonczLekcje).toHaveBeenCalledTimes(1));
  });
});

describe("Lekcja — dostęp i istnienie", () => {
  it("zablokowany (course_locked) → komunikat z message koperty, bez treści lekcji", async () => {
    pobierzDaneLekcji.mockResolvedValue({ status: "zablokowany", komunikat: "Ukończ najpierw etap 2." });

    render(<Lekcja id="21" />);

    expect(await screen.findByRole("heading", { level: 1, name: "Nie masz dostępu do tego ekranu" })).toHaveFocus();
    expect(screen.getByText("Ukończ najpierw etap 2.")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Wróć do pulpitu" }));
    expect(push).toHaveBeenCalledWith("/panel/pulpit");
    expect(screen.queryByText(LEKCJA.title)).toBeNull();
    expect(screen.queryByText("Opis lekcji")).toBeNull();
    expect(pobierzOdczytKursu).not.toHaveBeenCalled();
  });

  it("404 → „Nie znaleziono lekcji”, jeden przycisk powrotu do kursów, bez treści", async () => {
    pobierzDaneLekcji.mockResolvedValue({ status: "nie-znaleziono" });

    render(<Lekcja id="999" />);

    expect(await screen.findByRole("heading", { level: 1, name: "Nie znaleziono lekcji" })).toHaveFocus();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Wróć do kursów" }));
    expect(push).toHaveBeenCalledWith("/panel/kursy");
    expect(screen.queryByText("Opis lekcji")).toBeNull();
  });

  it("błąd sieci → Notice z akcją ponowienia", async () => {
    pobierzDaneLekcji.mockResolvedValue({ status: "blad" });

    render(<Lekcja id="21" />);

    expect(await screen.findByText("Nie udało się wczytać lekcji")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();

    pobierzDaneLekcji.mockResolvedValueOnce({ status: "ok", dane: LEKCJA, bezNagrania: true });
    const uzytkownik = userEvent.setup();
    await uzytkownik.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));

    await waitFor(() => expect(pobierzDaneLekcji).toHaveBeenCalledTimes(2));
  });

  it("dostęp wygasł (access_expired) → karta na wspólnym wzorze: zdanie, co dalej i jeden przycisk powrotu do kursów, bez treści lekcji", async () => {
    pobierzDaneLekcji.mockResolvedValue({ status: "wygasl", komunikat: "Twój dostęp do platformy wygasł." });

    render(<Lekcja id="21" />);

    const naglowek = await screen.findByRole("heading", { level: 1, name: "Twój dostęp wygasł." });
    expect(naglowek).toHaveFocus();
    expect(screen.getByText("Skontaktuj się z zespołem programu, żeby przedłużyć dostęp.")).toBeInTheDocument();
    expect(screen.queryByText("Twój dostęp do platformy wygasł.")).toBeNull();
    expect(screen.queryAllByRole("link", { name: "Wróć do kursów" })).toHaveLength(0);
    const przyciski = screen.getAllByRole("button");
    expect(przyciski).toHaveLength(1);
    await userEvent.click(przyciski[0]);
    expect(push).toHaveBeenCalledWith("/panel/kursy");
    expect(screen.queryByText(LEKCJA.title)).toBeNull();
  });
});
