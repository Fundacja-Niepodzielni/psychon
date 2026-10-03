import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Moduł danych ekranu „Kursy” (administracja): adresy, metody i ciała czterech
 * żądań. Atrapy siedzą na `api`/`apiPaged` klienta; `ApiError` zostaje prawdziwy.
 */

const api = vi.fn();
const apiPaged = vi.fn();
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: (...a: unknown[]) => api(...a),
  apiPaged: (...a: unknown[]) => apiPaged(...a),
}));
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return {
    ...oryginal,
    api: (...a: unknown[]) => api(...a),
    apiPaged: (...a: unknown[]) => apiPaged(...a),
  };
});

const { ApiError } = await import("@/lib/api/klient");
const dane = await import("../dane");

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
});

describe("pobierzKursy", () => {
  it("czyta stronę z sortowaniem po pozycji w ścieżce i zwraca odpowiedź bez zmian", async () => {
    const odpowiedz = { data: [], meta: { current_page: 2, per_page: 100, total: 101, last_page: 2 } };
    apiPaged.mockResolvedValueOnce(odpowiedz);
    await expect(dane.pobierzKursy(2)).resolves.toBe(odpowiedz);
    expect(apiPaged).toHaveBeenCalledWith("/admin/courses?page=2&per_page=100&sort=sequence_order");
  });
});

describe("utworzKurs", () => {
  it("POST /admin/courses z ciałem formularza", async () => {
    api.mockResolvedValueOnce({ id: 9 });
    const cialo = {
      title: "Nowy",
      slug: "nowy",
      type: "course" as const,
      product_group: "psychon" as const,
      sequence_order: null,
      description: null,
    };
    await expect(dane.utworzKurs(cialo)).resolves.toEqual({ id: 9 });
    expect(api).toHaveBeenCalledWith("/admin/courses", { method: "POST", body: cialo });
  });
});

describe("utworzKursZAdresemZTytulu", () => {
  const dane_kursu = { title: "Nowy kurs", type: "course" as const, sequence_order: null, description: null };

  const zajety = () =>
    new ApiError({ status: 422, code: "validation_failed", message: "x", errors: { slug: ["Zajęty."] } });

  const wyslaneAdresy = () => api.mock.calls.map((wywolanie) => (wywolanie[1] as { body: { slug: string } }).body.slug);

  it("pierwsza próba: POST z adresem zrobionym z tytułu, reszta ciała bez zmian", async () => {
    api.mockResolvedValueOnce({ id: 9 });
    await expect(dane.utworzKursZAdresemZTytulu(dane_kursu)).resolves.toEqual({ id: 9 });
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/admin/courses", { method: "POST", body: { ...dane_kursu, slug: "nowy-kurs" } });
  });

  it("adres zajęty (422 tylko na slug): druga próba z końcówką -2 kończy się sukcesem", async () => {
    api.mockRejectedValueOnce(zajety());
    api.mockResolvedValueOnce({ id: 9 });
    await expect(dane.utworzKursZAdresemZTytulu(dane_kursu)).resolves.toEqual({ id: 9 });
    expect(wyslaneAdresy()).toEqual(["nowy-kurs", "nowy-kurs-2"]);
  });

  it("adres zajęty cztery razy z rzędu: piąta próba (-5) jeszcze się udaje", async () => {
    for (let i = 0; i < 4; i += 1) api.mockRejectedValueOnce(zajety());
    api.mockResolvedValueOnce({ id: 9 });
    await expect(dane.utworzKursZAdresemZTytulu(dane_kursu)).resolves.toEqual({ id: 9 });
    expect(wyslaneAdresy()).toEqual(["nowy-kurs", "nowy-kurs-2", "nowy-kurs-3", "nowy-kurs-4", "nowy-kurs-5"]);
  });

  it("adres zajęty w każdej z pięciu prób: dokładnie pięć żądań, potem BrakWolnegoAdresu (szóstej próby nie ma)", async () => {
    api.mockRejectedValue(zajety());
    await expect(dane.utworzKursZAdresemZTytulu(dane_kursu)).rejects.toBeInstanceOf(dane.BrakWolnegoAdresu);
    expect(wyslaneAdresy()).toEqual(["nowy-kurs", "nowy-kurs-2", "nowy-kurs-3", "nowy-kurs-4", "nowy-kurs-5"]);
  });

  it("422 na innym polu (także razem ze slugiem) i inne błędy: wracają bez ponawiania", async () => {
    const innePole = new ApiError({ status: 422, code: "validation_failed", message: "x", errors: { title: ["Za długi."] } });
    api.mockRejectedValueOnce(innePole);
    await expect(dane.utworzKursZAdresemZTytulu(dane_kursu)).rejects.toBe(innePole);
    expect(api).toHaveBeenCalledTimes(1);

    api.mockReset();
    const razem = new ApiError({
      status: 422,
      code: "validation_failed",
      message: "x",
      errors: { slug: ["Zajęty."], sequence_order: ["Zła."] },
    });
    api.mockRejectedValueOnce(razem);
    await expect(dane.utworzKursZAdresemZTytulu(dane_kursu)).rejects.toBe(razem);
    expect(api).toHaveBeenCalledTimes(1);

    api.mockReset();
    const serwer = new ApiError({ status: 500, code: "server_error", message: "x" });
    api.mockRejectedValueOnce(serwer);
    await expect(dane.utworzKursZAdresemZTytulu(dane_kursu)).rejects.toBe(serwer);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("błąd innego rodzaju w trakcie ponawiania (druga próba): wraca bez dalszych prób", async () => {
    api.mockRejectedValueOnce(zajety());
    const siec = new Error("sieć");
    api.mockRejectedValueOnce(siec);
    await expect(dane.utworzKursZAdresemZTytulu(dane_kursu)).rejects.toBe(siec);
    expect(api).toHaveBeenCalledTimes(2);
  });
});

describe("kolejność ścieżki", () => {
  it("podgląd: POST na reorder/preview z listą identyfikatorów", async () => {
    api.mockResolvedValueOnce([]);
    await dane.podgladKolejnosci([3, 1, 2]);
    expect(api).toHaveBeenCalledWith("/admin/courses/reorder/preview", { method: "POST", body: { course_ids: [3, 1, 2] } });
  });

  it("zapis: PATCH na reorder z listą identyfikatorów", async () => {
    api.mockResolvedValueOnce([]);
    await dane.zapiszKolejnosc([3, 1, 2]);
    expect(api).toHaveBeenCalledWith("/admin/courses/reorder", { method: "PATCH", body: { course_ids: [3, 1, 2] } });
  });

  it("błąd transportu przechodzi do wołającego", async () => {
    api.mockRejectedValueOnce(new Error("sieć"));
    await expect(dane.zapiszKolejnosc([1])).rejects.toThrow("sieć");
  });
});
