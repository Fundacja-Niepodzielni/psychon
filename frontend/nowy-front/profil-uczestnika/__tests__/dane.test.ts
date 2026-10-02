import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Te same żądania co na starej stronie profilu: metoda, ścieżka i pola. Test pilnuje, że
 * nowy ekran nie dodał trasy ani nie zmienił ciała żądania.
 */

const api = vi.fn();
const downloadFile = vi.fn();
vi.mock("@/lib/api/klient", () => ({
  api: (...argumenty: unknown[]) => api(...argumenty),
  baseUrl: () => "http://localhost:8000/api/v1",
}));
vi.mock("@/lib/api/pliki", () => ({ downloadFile: (...argumenty: unknown[]) => downloadFile(...argumenty) }));

const { pobierzPlikEksportu, pobierzProfil, pobierzStanEksportu, zapiszProfil, zlecEksport } = await import("../dane");

beforeEach(() => {
  api.mockReset().mockResolvedValue({});
  downloadFile.mockReset().mockResolvedValue(undefined);
});

describe("żądania ekranu „Mój profil”", () => {
  it("GET /me bez opcji", async () => {
    await pobierzProfil();
    expect(api).toHaveBeenCalledWith("/me");
  });

  it("PATCH /me z ciałem zadania, bez pola email", async () => {
    const zadanie = {
      first_name: "Marta",
      last_name: "Demo",
      phone: null,
      pesel: null,
      address: { street: null, city: "Warszawa", zip: null },
    };
    await zapiszProfil(zadanie);
    expect(api).toHaveBeenCalledWith("/me", { method: "PATCH", body: zadanie });
    expect(Object.keys(api.mock.calls[0][1].body)).not.toContain("email");
  });

  it("POST /me/exports bez ciała", async () => {
    await zlecEksport();
    expect(api).toHaveBeenCalledWith("/me/exports", { method: "POST" });
  });

  it("GET /me/exports/{id}", async () => {
    await pobierzStanEksportu("ex_9f2");
    expect(api).toHaveBeenCalledWith("/me/exports/ex_9f2");
  });

  it("pobranie: GET /me/exports/{id}/download z tokenem, plik moje-dane-{id}.json", async () => {
    await pobierzPlikEksportu("ex_9f2");
    expect(downloadFile).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/me/exports/ex_9f2/download",
      "moje-dane-ex_9f2.json",
    );
  });
});
