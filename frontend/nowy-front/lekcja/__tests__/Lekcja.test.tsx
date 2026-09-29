import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pobierzDaneLekcji = vi.fn();
const ukonczLekcje = vi.fn();
const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
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

const LEKCJA_PODSTAWOWA = {
  id: 21,
  title: "Wprowadzenie do wywiadu",
  description: "Opis lekcji",
  duration_seconds: 1800,
  position_seconds: 0,
  watched_seconds: 812,
  active_seconds: 700,
  is_completed: false,
  completable: false,
  completable_at_percent: 60,
};

beforeEach(() => {
  pobierzDaneLekcji.mockReset();
  ukonczLekcje.mockReset();
  back.mockReset();
});

describe("Lekcja — stan ładowania i danych", () => {
  it("przed odpowiedzią pokazuje szkielet, nie treść lekcji", () => {
    pobierzDaneLekcji.mockReturnValue(new Promise(() => {}));

    render(<Lekcja id="21" />);

    expect(screen.queryByText(LEKCJA_PODSTAWOWA.title)).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("dane gotowe → tytuł, treść i pasek postępu widoczne", async () => {
    pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane: LEKCJA_PODSTAWOWA, bezNagrania: false });

    render(<Lekcja id="21" />);

    expect(await screen.findByRole("heading", { level: 1, name: LEKCJA_PODSTAWOWA.title })).toBeInTheDocument();
    expect(screen.getByText(LEKCJA_PODSTAWOWA.description)).toBeInTheDocument();
  });
});

describe("Lekcja — bez nagrania", () => {
  it("bezNagrania: true renderuje samą treść, bez ramki odtwarzacza", async () => {
    pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane: LEKCJA_PODSTAWOWA, bezNagrania: true });

    render(<Lekcja id="21" />);

    expect(await screen.findByText(LEKCJA_PODSTAWOWA.description)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Odtwórz" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Zatrzymaj" })).toBeNull();
  });
});

describe("Lekcja — próg ukończenia", () => {
  it("completable: false → przycisk nieaktywny, widoczny powód", async () => {
    pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane: LEKCJA_PODSTAWOWA, bezNagrania: true });

    render(<Lekcja id="21" />);

    const przycisk = await screen.findByRole("button", { name: "Oznacz jako ukończoną" });
    expect(przycisk).toBeDisabled();
    expect(screen.getByText("Brakuje 21% aktywnego czasu do progu 60%.")).toBeInTheDocument();
    expect(ukonczLekcje).not.toHaveBeenCalled();
  });

  it("completable: true → przycisk aktywny, bez tekstu braku", async () => {
    pobierzDaneLekcji.mockResolvedValue({
      status: "ok",
      dane: { ...LEKCJA_PODSTAWOWA, active_seconds: 1800, completable: true },
      bezNagrania: true,
    });

    render(<Lekcja id="21" />);

    const przycisk = await screen.findByRole("button", { name: "Oznacz jako ukończoną" });
    expect(przycisk).not.toBeDisabled();
    expect(screen.queryByText(/^Brakuje/)).toBeNull();
  });
});

describe("Lekcja — kliknięcie „Oznacz jako ukończoną”", () => {
  it("422 not_enough_active_time → komunikat, stan bez zmian", async () => {
    const uzytkownik = userEvent.setup();
    pobierzDaneLekcji.mockResolvedValue({
      status: "ok",
      dane: { ...LEKCJA_PODSTAWOWA, active_seconds: 1800, completable: true },
      bezNagrania: true,
    });
    ukonczLekcje.mockResolvedValue({ status: "za-malo-czasu" });

    render(<Lekcja id="21" />);
    const przycisk = await screen.findByRole("button", { name: "Oznacz jako ukończoną" });
    await uzytkownik.click(przycisk);

    expect(await screen.findByText("Obejrzyj więcej materiału, aby ukończyć lekcję.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Oznacz jako ukończoną" })).not.toBeDisabled();
    expect(screen.queryByText("Lekcja ukończona")).toBeNull();
  });

  it("200 → stan ukończony, przycisk znika, widoczne potwierdzenie", async () => {
    const uzytkownik = userEvent.setup();
    pobierzDaneLekcji.mockResolvedValue({
      status: "ok",
      dane: { ...LEKCJA_PODSTAWOWA, active_seconds: 1800, completable: true },
      bezNagrania: true,
    });
    ukonczLekcje.mockResolvedValue({ status: "ok", completed_at: "2026-10-03T12:30:00Z" });

    render(<Lekcja id="21" />);
    const przycisk = await screen.findByRole("button", { name: "Oznacz jako ukończoną" });
    await uzytkownik.click(przycisk);

    expect(await screen.findByText("Lekcja ukończona")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Oznacz jako ukończoną" })).toBeNull();
  });
});

describe("Lekcja — dostęp i istnienie", () => {
  it("zablokowany (course_locked) → komunikat z message koperty, bez treści lekcji", async () => {
    pobierzDaneLekcji.mockResolvedValue({ status: "zablokowany", komunikat: "Ukończ najpierw etap 2." });

    render(<Lekcja id="21" />);

    expect(await screen.findByText("Ukończ najpierw etap 2.")).toBeInTheDocument();
    expect(screen.queryByText(LEKCJA_PODSTAWOWA.title)).toBeNull();
    expect(screen.queryByText(LEKCJA_PODSTAWOWA.description)).toBeNull();
  });

  it("404 → „Nie znaleziono lekcji”, bez treści", async () => {
    pobierzDaneLekcji.mockResolvedValue({ status: "nie-znaleziono" });

    render(<Lekcja id="999" />);

    expect(await screen.findByText("Nie znaleziono lekcji.")).toBeInTheDocument();
    expect(screen.queryByText(LEKCJA_PODSTAWOWA.description)).toBeNull();
  });

  it("błąd sieci → Notice z akcją ponowienia", async () => {
    pobierzDaneLekcji.mockResolvedValue({ status: "blad" });

    render(<Lekcja id="21" />);

    expect(await screen.findByText("Nie udało się wczytać lekcji")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();

    pobierzDaneLekcji.mockResolvedValueOnce({ status: "ok", dane: LEKCJA_PODSTAWOWA, bezNagrania: true });
    const uzytkownik = userEvent.setup();
    await uzytkownik.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));

    await waitFor(() => expect(pobierzDaneLekcji).toHaveBeenCalledTimes(2));
  });
});
