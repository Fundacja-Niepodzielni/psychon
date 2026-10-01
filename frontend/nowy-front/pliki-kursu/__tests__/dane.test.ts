import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.fn();
const downloadFile = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
}));
vi.mock("@/lib/api/pliki", () => ({ downloadFile: (...args: unknown[]) => downloadFile(...args) }));

const { ApiError } = await import("@/lib/api/klient");
const { pobierzPlik, pobierzPlikiLekcji } = await import("../dane");

const PLIK = { id: 7, name: "Karta pracy.pdf", size: 2048, lesson_id: 21, download_url: "https://api.test/stary" };

function bladLinku(status = 403) {
  return new ApiError({ status, code: "link_expired", message: "Ten link do pobrania już wygasł." });
}

beforeEach(() => {
  api.mockReset();
  downloadFile.mockReset();
});

describe("pobierzPlikiLekcji — pliki jednej lekcji z odczytu kursu", () => {
  const KURS = {
    lessons: [
      { id: 21, title: "Pierwsza", sequence_order: 1 },
      { id: 22, title: "Druga", sequence_order: 2 },
    ],
    materials: [
      { id: 1, name: "a.pdf", size: 10, lesson_id: 21, download_url: "u1" },
      { id: 2, name: "b.pdf", size: 10, lesson_id: 22, download_url: "u2" },
      { id: 3, name: "kurs.pdf", size: 10, lesson_id: null, download_url: "u3" },
      { id: 4, name: "c.pdf", size: 10, lesson_id: 21, download_url: "u4" },
    ],
  };

  it("zwraca tylko pliki tej lekcji, w kolejności z odpowiedzi — bez plików innych lekcji i plików kursu", async () => {
    api.mockResolvedValue(KURS);

    const pliki = await pobierzPlikiLekcji("wywiad-psychologiczny", 21);

    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/courses/wywiad-psychologiczny");
    expect(pliki?.map((p) => p.id)).toEqual([1, 4]);
  });

  it("lekcji nie ma w lekcjach kursu → null", async () => {
    api.mockResolvedValue(KURS);

    expect(await pobierzPlikiLekcji("wywiad-psychologiczny", 999)).toBeNull();
  });

  it("kurs zablokowany (403), nieznany (404) i błąd sieci → null, bez wyjątku", async () => {
    api.mockRejectedValueOnce(new ApiError({ status: 403, code: "course_locked", message: "Zablokowany." }));
    expect(await pobierzPlikiLekcji("kurs", 21)).toBeNull();
    api.mockRejectedValueOnce(new ApiError({ status: 404, code: "not_found", message: "Brak." }));
    expect(await pobierzPlikiLekcji("kurs", 21)).toBeNull();
    api.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await pobierzPlikiLekcji("kurs", 21)).toBeNull();
  });

  it("odpowiedź bez pól lessons i materials nie wywraca odczytu", async () => {
    api.mockResolvedValue({});

    expect(await pobierzPlikiLekcji("kurs", 21)).toBeNull();
  });
});

describe("pobierzPlik — wygasły link: odświeżenie danych kursu i jedna ponowna próba", () => {
  it("udane pobranie nie odświeża danych", async () => {
    downloadFile.mockResolvedValue(undefined);
    const odswiez = vi.fn();

    expect(await pobierzPlik(PLIK, odswiez)).toBe("ok");

    expect(downloadFile).toHaveBeenCalledWith("https://api.test/stary", "Karta pracy.pdf");
    expect(odswiez).not.toHaveBeenCalled();
  });

  it("403 → odświeża dane, pobiera świeżym linkiem tego samego pliku i kończy sukcesem", async () => {
    downloadFile.mockRejectedValueOnce(bladLinku()).mockResolvedValueOnce(undefined);
    const odswiez = vi.fn().mockResolvedValue([
      { ...PLIK, id: 8, download_url: "https://api.test/cudzy" },
      { ...PLIK, download_url: "https://api.test/nowy" },
    ]);

    expect(await pobierzPlik(PLIK, odswiez)).toBe("ok");

    expect(odswiez).toHaveBeenCalledTimes(1);
    expect(downloadFile).toHaveBeenCalledTimes(2);
    expect(downloadFile).toHaveBeenLastCalledWith("https://api.test/nowy", "Karta pracy.pdf");
  });

  it("druga porażka kończy się błędem — dokładnie jedna ponowna próba, nie pętla", async () => {
    downloadFile.mockRejectedValue(bladLinku());
    const odswiez = vi.fn().mockResolvedValue([{ ...PLIK, download_url: "https://api.test/nowy" }]);

    expect(await pobierzPlik(PLIK, odswiez)).toBe("blad");

    expect(downloadFile).toHaveBeenCalledTimes(2);
    expect(odswiez).toHaveBeenCalledTimes(1);
  });

  it("odświeżenie zwraca null albo bez tego pliku → błąd, bez drugiej próby", async () => {
    downloadFile.mockRejectedValue(bladLinku());

    expect(await pobierzPlik(PLIK, vi.fn().mockResolvedValue(null))).toBe("blad");
    expect(await pobierzPlik(PLIK, vi.fn().mockResolvedValue([]))).toBe("blad");
    expect(await pobierzPlik(PLIK, vi.fn().mockRejectedValue(new Error("sieć")))).toBe("blad");
    expect(downloadFile).toHaveBeenCalledTimes(3);
  });

  it("porażka inna niż wygasły link (np. 404 pliku, sieć) nie odświeża danych", async () => {
    const odswiez = vi.fn();
    downloadFile.mockRejectedValueOnce(new ApiError({ status: 404, code: "not_found", message: "Brak pliku." }));
    expect(await pobierzPlik(PLIK, odswiez)).toBe("blad");
    downloadFile.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await pobierzPlik(PLIK, odswiez)).toBe("blad");

    expect(odswiez).not.toHaveBeenCalled();
  });

  it("bez funkcji odświeżającej wygasły link od razu daje błąd", async () => {
    downloadFile.mockRejectedValue(bladLinku());

    expect(await pobierzPlik(PLIK)).toBe("blad");
    expect(downloadFile).toHaveBeenCalledTimes(1);
  });
});
