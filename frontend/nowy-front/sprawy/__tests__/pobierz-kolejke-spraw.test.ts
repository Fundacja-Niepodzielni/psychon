import { describe, expect, it, vi, beforeEach } from "vitest";

const apiPaged = vi.fn();

class ApiErrorAtrapa extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

vi.mock("@/lib/api/klient", () => ({
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  ApiError: ApiErrorAtrapa,
}));

const { pobierzKolejkeSpraw } = await import("../dane");

const STRONA_PUSTA = { data: [], meta: { current_page: 1, per_page: 100, total: 0, last_page: 1 } };

beforeEach(() => {
  apiPaged.mockReset();
});

describe("pobierzKolejkeSpraw", () => {
  it("woła dokładnie trzy źródła administracji, zero wywołań /instructor/*", async () => {
    apiPaged.mockResolvedValue(STRONA_PUSTA);

    await pobierzKolejkeSpraw();

    expect(apiPaged).toHaveBeenCalledTimes(3);
    const wywolaneSciezki = apiPaged.mock.calls.map((wywolanie) => String(wywolanie[0]));
    expect(wywolaneSciezki.some((sciezka) => sciezka.includes("/instructor"))).toBe(false);
    expect(wywolaneSciezki.some((sciezka) => sciezka.startsWith("/admin/applications"))).toBe(true);
    expect(wywolaneSciezki.some((sciezka) => sciezka.startsWith("/admin/internship/pending"))).toBe(true);
    expect(wywolaneSciezki.some((sciezka) => sciezka.startsWith("/admin/profiles"))).toBe(true);
  });

  it("źródło applications sortowane rosnąco po created_at i filtrowane do status=new", async () => {
    apiPaged.mockResolvedValue(STRONA_PUSTA);
    await pobierzKolejkeSpraw();
    const sciezkaApplications = apiPaged.mock.calls.map((w) => String(w[0])).find((s) => s.startsWith("/admin/applications"));
    expect(sciezkaApplications).toContain("status=new");
    expect(sciezkaApplications).toContain("sort=created_at");
  });

  it("błąd jednego źródła (403) nie przerywa pozostałych dwóch — wynik niesie blad tylko dla niego", async () => {
    apiPaged.mockImplementation((sciezka: string) => {
      if (sciezka.startsWith("/admin/internship/pending")) {
        return Promise.reject(new ApiErrorAtrapa(403, "forbidden", "Nie masz dostępu do tej sekcji."));
      }
      return Promise.resolve(STRONA_PUSTA);
    });

    const wyniki = await pobierzKolejkeSpraw();

    expect(wyniki).toHaveLength(3);
    const staz = wyniki.find((w) => w.rodzaj === "internship_entries");
    const applications = wyniki.find((w) => w.rodzaj === "applications");
    const profile = wyniki.find((w) => w.rodzaj === "profiles");
    expect(staz?.blad).toBe("Nie masz dostępu do tej sekcji.");
    expect(staz?.kodBledu).toBe("forbidden");
    expect(applications?.blad).toBeNull();
    expect(profile?.blad).toBeNull();
  });

  it("kontrola dodatnia: sukces na WSZYSTKICH trzech źródłach nie zostawia żadnego 'blad' niezerowego", async () => {
    apiPaged.mockResolvedValue(STRONA_PUSTA);
    const wyniki = await pobierzKolejkeSpraw();
    expect(wyniki.every((w) => w.blad === null)).toBe(true);
  });
});
