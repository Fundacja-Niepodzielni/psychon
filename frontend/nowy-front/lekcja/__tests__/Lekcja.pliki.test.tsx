import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KURS, LEKCJA } from "./pomoce";

const pobierzDaneLekcji = vi.fn();
const pobierzOdczytKursu = vi.fn();
const downloadFile = vi.fn();
let adresKursu: string | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(adresKursu === null ? "" : `kurs=${adresKursu}`),
}));

vi.mock("../dane", async (importOriginal) => {
  const original = await importOriginal<typeof import("../dane")>();
  return { ...original, pobierzDaneLekcji: (...args: unknown[]) => pobierzDaneLekcji(...args), pobierzPytania: async () => [] };
});

vi.mock("../kurs", async (importOriginal) => {
  const original = await importOriginal<typeof import("../kurs")>();
  return { ...original, pobierzOdczytKursu: (...args: unknown[]) => pobierzOdczytKursu(...args) };
});

vi.mock("@/lib/api/pliki", () => ({ downloadFile: (...args: unknown[]) => downloadFile(...args) }));

const { ApiError } = await import("@/lib/api/klient");
const { Lekcja } = await import("../Lekcja");

const NBSP = " ";
const ZDANIE_BLEDU = "Nie udało się pobrać pliku. Spróbuj ponownie za chwilę.";
const BEZ_KURSU = { ...LEKCJA, course: undefined };

function karta() {
  return screen.getByRole("region", { name: "Materiały do pobrania" });
}

async function otworz(dane: object = LEKCJA) {
  pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane, bezNagrania: true });
  render(<Lekcja id="21" />);
  await screen.findByRole("heading", { level: 1, name: LEKCJA.title });
}

beforeEach(() => {
  pobierzDaneLekcji.mockReset();
  pobierzOdczytKursu.mockReset();
  downloadFile.mockReset();
  downloadFile.mockResolvedValue(undefined);
  pobierzOdczytKursu.mockResolvedValue(KURS);
  adresKursu = null;
});

describe("Lekcja — karta „Materiały do pobrania”", () => {
  it("pokazuje TYLKO pliki tej lekcji, z rodzajem i rozmiarem, a przycisk „Pobierz” ma pełną nazwę", async () => {
    await otworz();

    expect(await screen.findByRole("heading", { level: 2, name: "Materiały do pobrania" })).toBeInTheDocument();
    const pozycje = within(karta()).getAllByRole("listitem");
    expect(pozycje).toHaveLength(2);
    expect(within(pozycje[0]).getByText("Schemat decyzji w kryzysie.pdf")).toBeInTheDocument();
    expect(within(pozycje[0]).getByText(`PDF · 241${NBSP}KB`)).toBeInTheDocument();
    expect(within(pozycje[1]).getByText("Numery pomocowe w Polsce.pdf")).toBeInTheDocument();
    expect(within(pozycje[1]).getByText(`PDF · 96${NBSP}KB`)).toBeInTheDocument();
    expect(within(pozycje[0]).getByRole("button", { name: "Pobierz: Schemat decyzji w kryzysie.pdf, PDF, 241 KB" })).toHaveTextContent(
      "Pobierz",
    );
    expect(screen.queryByText("Cudzy plik.pdf")).toBeNull();
  });

  it("rodzaj pliku z mime; bez mime z rozszerzenia nazwy (odpowiedź sprzed zmiany zaplecza)", async () => {
    pobierzOdczytKursu.mockResolvedValue({
      ...KURS,
      materials: [
        { id: 4, name: "Scenariusz.docx", size: 5000, lesson_id: 21, download_url: "https://api.test/4" },
        { id: 5, name: "Bez-rozszerzenia", size: 700, mime: "application/pdf", lesson_id: 21, download_url: "https://api.test/5" },
      ],
    });
    await otworz();

    const pozycje = within(await screen.findByRole("region", { name: "Materiały do pobrania" })).getAllByRole("listitem");
    expect(within(pozycje[0]).getByText(`DOCX · 5${NBSP}KB`)).toBeInTheDocument();
    expect(within(pozycje[1]).getByText(`PDF · 700${NBSP}B`)).toBeInTheDocument();
  });

  it("lekcja bez plików: karty nie ma, nie ma też zdania zastępczego", async () => {
    pobierzOdczytKursu.mockResolvedValue({ ...KURS, materials: [KURS.materials[2]] });

    await otworz();
    await waitFor(() => expect(pobierzOdczytKursu).toHaveBeenCalled());

    expect(screen.queryByRole("heading", { name: "Materiały do pobrania" })).toBeNull();
    expect(screen.queryByText(/materiałów do pobrania/)).toBeNull();
  });

  it("odpowiedź lekcji bez kursu i bez parametru adresu: nie pyta o kurs i nie pokazuje karty", async () => {
    await otworz(BEZ_KURSU);

    expect(pobierzOdczytKursu).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Materiały do pobrania" })).toBeNull();
  });

  it("odpowiedź lekcji bez kursu, ale z ?kurs= w adresie: kurs z adresu", async () => {
    adresKursu = "pierwsza-pomoc-psychologiczna";

    await otworz(BEZ_KURSU);

    expect(await screen.findByRole("heading", { level: 2, name: "Materiały do pobrania" })).toBeInTheDocument();
    expect(pobierzOdczytKursu).toHaveBeenCalledWith("pierwsza-pomoc-psychologiczna");
  });

  it.each(["Wywiad-Psychologiczny", "kurs/../me", "kurs?x=1", "kurs jeden", "wywiąd", ""])(
    "parametr o złym kształcie (%j) = brak parametru: zero zapytań o kurs",
    async (zly) => {
      adresKursu = zly;

      await otworz(BEZ_KURSU);

      expect(pobierzOdczytKursu).not.toHaveBeenCalled();
      expect(screen.queryByRole("heading", { name: "Materiały do pobrania" })).toBeNull();
    },
  );

  it("lekcji nie ma w odczycie kursu: karta nie zajmuje miejsca, ekran lekcji działa", async () => {
    pobierzOdczytKursu.mockResolvedValue({ ...KURS, lessons: [{ ...KURS.lessons[0], id: 99 }] });

    await otworz();
    await waitFor(() => expect(pobierzOdczytKursu).toHaveBeenCalled());

    expect(screen.queryByRole("heading", { name: "Materiały do pobrania" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("odczyt kursu się nie udał (null): bez karty, bez zdania o błędzie, ekran lekcji cały", async () => {
    pobierzOdczytKursu.mockResolvedValue(null);

    await otworz();
    await waitFor(() => expect(pobierzOdczytKursu).toHaveBeenCalled());

    expect(screen.queryByRole("heading", { name: "Materiały do pobrania" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Zapytaj prowadzącego" })).toBeInTheDocument();
  });

  it("lekcja zablokowana (403 course_locked): plików nie pokazuje i o kurs nie pyta", async () => {
    pobierzDaneLekcji.mockResolvedValue({ status: "zablokowany", komunikat: "Ukończ najpierw etap 2." });

    render(<Lekcja id="21" />);

    expect(await screen.findByText("Ukończ najpierw etap 2.")).toBeInTheDocument();
    expect(pobierzOdczytKursu).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Materiały do pobrania" })).toBeNull();
  });
});

describe("Lekcja — pobranie pliku", () => {
  it("naciśnięcie „Pobierz” pobiera plik pod jego adresem i nazwą", async () => {
    const uzytkownik = userEvent.setup();
    await otworz();
    await screen.findByRole("region", { name: "Materiały do pobrania" });

    await uzytkownik.click(within(karta()).getAllByRole("button", { name: /^Pobierz:/ })[0]);

    await waitFor(() => expect(downloadFile).toHaveBeenCalledTimes(1));
    expect(downloadFile).toHaveBeenCalledWith("https://api.test/materials/1", "Schemat decyzji w kryzysie.pdf");
    expect(screen.queryByText(ZDANIE_BLEDU)).toBeNull();
  });

  it("pobranie się nie udało: zdanie przy tym pliku, drugi plik bez zdania, ekran bez zmian", async () => {
    const uzytkownik = userEvent.setup();
    downloadFile.mockRejectedValue(new Error("sieć"));
    await otworz();
    await screen.findByRole("region", { name: "Materiały do pobrania" });

    await uzytkownik.click(within(karta()).getAllByRole("button", { name: /^Pobierz:/ })[0]);

    const pozycje = within(karta()).getAllByRole("listitem");
    expect(await within(pozycje[0]).findByText(ZDANIE_BLEDU)).toBeInTheDocument();
    expect(within(pozycje[1]).queryByText(ZDANIE_BLEDU)).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: LEKCJA.title })).toBeInTheDocument();
  });

  it("adres pobrania wygasł (403): kurs jest czytany ponownie, a plik pobierany pod świeżym adresem", async () => {
    const uzytkownik = userEvent.setup();
    downloadFile
      .mockRejectedValueOnce(new ApiError({ status: 403, code: "forbidden", message: "Link wygasł." }))
      .mockResolvedValue(undefined);
    await otworz();
    await screen.findByRole("region", { name: "Materiały do pobrania" });
    pobierzOdczytKursu.mockResolvedValue({
      ...KURS,
      materials: KURS.materials.map((plik) => ({ ...plik, download_url: `${plik.download_url}?swiezy=1` })),
    });
    const odczytyPrzed = pobierzOdczytKursu.mock.calls.length;

    await uzytkownik.click(within(karta()).getAllByRole("button", { name: /^Pobierz:/ })[0]);

    await waitFor(() => expect(downloadFile).toHaveBeenCalledTimes(2));
    expect(downloadFile).toHaveBeenNthCalledWith(1, "https://api.test/materials/1", "Schemat decyzji w kryzysie.pdf");
    expect(downloadFile).toHaveBeenNthCalledWith(2, "https://api.test/materials/1?swiezy=1", "Schemat decyzji w kryzysie.pdf");
    expect(pobierzOdczytKursu.mock.calls.length).toBe(odczytyPrzed + 1);
    expect(screen.queryByText(ZDANIE_BLEDU)).toBeNull();
  });

  it("adres wygasł i ponowny odczyt kursu zawodzi: zdanie o błędzie przy pliku", async () => {
    const uzytkownik = userEvent.setup();
    downloadFile.mockRejectedValue(new ApiError({ status: 403, code: "forbidden", message: "Link wygasł." }));
    await otworz();
    await screen.findByRole("region", { name: "Materiały do pobrania" });
    pobierzOdczytKursu.mockResolvedValue(null);

    await uzytkownik.click(within(karta()).getAllByRole("button", { name: /^Pobierz:/ })[0]);

    expect(await within(karta()).findByText(ZDANIE_BLEDU)).toBeInTheDocument();
    expect(downloadFile).toHaveBeenCalledTimes(1);
  });
});
