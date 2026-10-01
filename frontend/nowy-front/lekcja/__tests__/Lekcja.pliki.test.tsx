import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

const pobierzDaneLekcji = vi.fn();
const api = vi.fn();
let adresKursu: string | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(adresKursu === null ? "" : `kurs=${adresKursu}`),
}));

vi.mock("../dane", async (importOriginal) => {
  const original = await importOriginal<typeof import("../dane")>();
  return { ...original, pobierzDaneLekcji: (...args: unknown[]) => pobierzDaneLekcji(...args) };
});

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
}));

const { ApiError } = await import("@/lib/api/klient");
const { Lekcja } = await import("../Lekcja");

const LEKCJA = {
  id: 21,
  title: "Wprowadzenie do wywiadu",
  description: "Opis lekcji",
  content: null,
  topic: null,
  duration_seconds: 1800,
  position_seconds: 0,
  watched_seconds: 812,
  active_seconds: 700,
  is_completed: false,
  completable: false,
  completable_at_percent: 60,
};

const KURS = {
  lessons: [
    { id: 21, title: "Wprowadzenie do wywiadu", sequence_order: 1 },
    { id: 22, title: "Pytania otwarte", sequence_order: 2 },
  ],
  materials: [
    { id: 1, name: "Karta pracy.pdf", size: 245760, lesson_id: 21, download_url: "https://api.test/1" },
    { id: 2, name: "Slajdy drugiej lekcji.pdf", size: 1000, lesson_id: 22, download_url: "https://api.test/2" },
    { id: 3, name: "Regulamin kursu.pdf", size: 1000, lesson_id: null, download_url: "https://api.test/3" },
    { id: 4, name: "Scenariusz.docx", size: 5000, lesson_id: 21, download_url: "https://api.test/4" },
  ],
};

beforeEach(() => {
  pobierzDaneLekcji.mockReset();
  api.mockReset();
  adresKursu = null;
  pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane: LEKCJA, bezNagrania: true });
});

describe("Lekcja — karta „Pliki do pobrania” z kursem z adresu", () => {
  it("z ?kurs= pobiera kurs i pokazuje TYLKO pliki tej lekcji", async () => {
    adresKursu = "wywiad-psychologiczny";
    api.mockResolvedValue(KURS);

    render(<Lekcja id="21" />);

    expect(await screen.findByRole("heading", { level: 2, name: "Pliki do pobrania" })).toBeInTheDocument();
    const pozycje = within(screen.getByRole("region", { name: "Pliki do pobrania" })).getAllByRole("listitem");
    expect(pozycje.map((pozycja) => within(pozycja).getByRole("button").getAttribute("aria-label"))).toEqual([
      "Pobierz plik: Karta pracy.pdf",
      "Pobierz plik: Scenariusz.docx",
    ]);
    expect(screen.queryByText("Slajdy drugiej lekcji.pdf")).toBeNull();
    expect(screen.queryByText("Regulamin kursu.pdf")).toBeNull();
    expect(api).toHaveBeenCalledWith("/courses/wywiad-psychologiczny");
  });

  it("lekcja bez plików: karty nie ma, nie ma też zdania zastępczego", async () => {
    adresKursu = "wywiad-psychologiczny";
    api.mockResolvedValue({ ...KURS, materials: [KURS.materials[1]] });

    render(<Lekcja id="21" />);

    await screen.findByRole("heading", { level: 1, name: LEKCJA.title });
    await waitFor(() => expect(api).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "Pliki do pobrania" })).toBeNull();
    expect(screen.queryByText(/materiałów do pobrania/)).toBeNull();
    expect(screen.queryByText(/widoku/)).toBeNull();
  });

  it("bez parametru kursu nie pyta o kurs i nie pokazuje karty", async () => {
    render(<Lekcja id="21" />);

    await screen.findByRole("heading", { level: 1, name: LEKCJA.title });
    expect(api).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Pliki do pobrania" })).toBeNull();
    expect(screen.queryByText(/materiałów do pobrania/)).toBeNull();
  });

  it.each(["Wywiad-Psychologiczny", "kurs/../me", "kurs?x=1", "kurs jeden", "wywiąd", ""])(
    "parametr o złym kształcie (%j) = brak parametru: zero zapytań o kurs",
    async (zly) => {
      adresKursu = zly;

      render(<Lekcja id="21" />);

      await screen.findByRole("heading", { level: 1, name: LEKCJA.title });
      expect(api).not.toHaveBeenCalled();
      expect(screen.queryByRole("heading", { name: "Pliki do pobrania" })).toBeNull();
    },
  );

  it("lekcji nie ma w kursie z adresu: karta nie zajmuje miejsca, ekran lekcji działa", async () => {
    adresKursu = "inny-kurs";
    api.mockResolvedValue({ lessons: [{ id: 99, title: "Cudza", sequence_order: 1 }], materials: KURS.materials });

    render(<Lekcja id="21" />);

    expect(await screen.findByRole("heading", { level: 1, name: LEKCJA.title })).toBeInTheDocument();
    await waitFor(() => expect(api).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "Pliki do pobrania" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([
    ["403 course_locked", new ApiError({ status: 403, code: "course_locked", message: "Ukończ najpierw etap 2." })],
    ["404 not_found", new ApiError({ status: 404, code: "not_found", message: "Nie znaleziono." })],
    ["błąd sieci", new TypeError("Failed to fetch")],
  ])("odczyt kursu kończy się: %s → bez karty, bez zdania o błędzie, ekran lekcji cały", async (_opis, blad) => {
    adresKursu = "wywiad-psychologiczny";
    api.mockRejectedValue(blad);

    render(<Lekcja id="21" />);

    expect(await screen.findByRole("heading", { level: 1, name: LEKCJA.title })).toBeInTheDocument();
    await waitFor(() => expect(api).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "Pliki do pobrania" })).toBeNull();
    expect(screen.queryByText(/plik/i)).toBeNull();
  });

  it("lekcja zablokowana (403 course_locked): plików nie pokazuje i o kurs nie pyta", async () => {
    adresKursu = "wywiad-psychologiczny";
    pobierzDaneLekcji.mockResolvedValue({ status: "zablokowany", komunikat: "Ukończ najpierw etap 2." });

    render(<Lekcja id="21" />);

    expect(await screen.findByText("Ukończ najpierw etap 2.")).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Pliki do pobrania" })).toBeNull();
  });
});
