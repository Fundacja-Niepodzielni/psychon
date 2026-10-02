import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Żądania ekranów „Certyfikat” i „Dokumenty” są dokładnie tymi, które wykonują stare strony
 * (`POMIAR-STAREGO-EKRANU.md`): te same trasy, ta sama metoda i ciało, ten sam adres pobrania
 * certyfikatu z tokenem, ta sama nazwa pliku dokumentu. Kontrole dodatnie: każda trasa
 * wywołana jest dokładnie raz i z oczekiwanymi argumentami.
 */

const api = vi.fn();
const getToken = vi.fn();
vi.mock("@/lib/api/klient", () => ({
  api: (...args: unknown[]) => api(...args),
  getToken: (...args: unknown[]) => getToken(...args),
  baseUrl: () => "http://localhost:8000/api/v1",
}));

const fetchDocuments = vi.fn();
const generateDocument = vi.fn();
vi.mock("@/lib/api/h14", () => ({
  fetchDocuments: (...args: unknown[]) => fetchDocuments(...args),
  generateDocument: (...args: unknown[]) => generateDocument(...args),
}));

const downloadFile = vi.fn();
vi.mock("@/lib/api/pliki", () => ({ downloadFile: (...args: unknown[]) => downloadFile(...args) }));

const dane = await import("../dane");
const { DOKUMENT_POROZUMIENIE } = await import("./atrapy");

const fetchMock = vi.fn();

beforeEach(() => {
  api.mockReset();
  getToken.mockReset();
  getToken.mockResolvedValue("token-demo");
  fetchDocuments.mockReset();
  generateDocument.mockReset();
  downloadFile.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("certyfikat — żądania", () => {
  it("warunki: GET /certificate/conditions, bez dodatkowych argumentów", async () => {
    api.mockResolvedValue({ eligible: false, conditions: [] });
    await dane.pobierzWarunki();
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/certificate/conditions");
  });

  it("zlecenie: POST /certificate/generate bez ciała", async () => {
    api.mockResolvedValue({ status: "queued" });
    await dane.zlecCertyfikat();
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/certificate/generate", { method: "POST" });
  });

  it("pobranie: GET /certificate/download z nagłówkiem Bearer, bezpośrednio przez fetch", async () => {
    const plik = new Blob(["%PDF-"]);
    fetchMock.mockResolvedValue({ status: 200, ok: true, blob: async () => plik });

    const wynik = await dane.pobierzCertyfikat();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8000/api/v1/certificate/download", {
      headers: { Authorization: "Bearer token-demo" },
    });
    expect(wynik).toEqual({ rodzaj: "plik", plik });
    expect(api).not.toHaveBeenCalled();
  });

  it("pobranie: 404 to „jeszcze nie”, każdy inny kod poza 2xx to wyjątek", async () => {
    fetchMock.mockResolvedValue({ status: 404, ok: false });
    await expect(dane.pobierzCertyfikat()).resolves.toEqual({ rodzaj: "jeszcze-nie" });

    fetchMock.mockResolvedValue({ status: 500, ok: false });
    await expect(dane.pobierzCertyfikat()).rejects.toThrow("500");
  });

  it("pobranie bez tokenu wysyła pusty Bearer — tak jak stara strona", async () => {
    getToken.mockResolvedValue(null);
    fetchMock.mockResolvedValue({ status: 404, ok: false });
    await dane.pobierzCertyfikat();
    expect(fetchMock.mock.calls[0][1]).toEqual({ headers: { Authorization: "Bearer " } });
  });

  it("nazwa pliku certyfikatu jak na starej stronie", () => {
    expect(dane.NAZWA_PLIKU_CERTYFIKATU).toBe("certyfikat.html");
  });
});

describe("dokumenty — żądania", () => {
  it("lista: odczyt przez ten sam moduł co stara strona, jedno wywołanie", async () => {
    fetchDocuments.mockResolvedValue({ documents: [], availableTypes: null });
    await dane.pobierzDokumenty();
    expect(fetchDocuments).toHaveBeenCalledTimes(1);
  });

  it("wygenerowanie: rodzaj przekazany bez zmian", async () => {
    generateDocument.mockResolvedValue(DOKUMENT_POROZUMIENIE);
    await dane.wystawDokument("volunteer_agreement");
    expect(generateDocument).toHaveBeenCalledTimes(1);
    expect(generateDocument).toHaveBeenCalledWith("volunteer_agreement");
  });

  it("pobranie: podpisany adres z listy i nazwa z numerem, ukośniki zamienione na myślniki", async () => {
    downloadFile.mockResolvedValue(undefined);
    await dane.pobierzPlikDokumentu(DOKUMENT_POROZUMIENIE);
    expect(downloadFile).toHaveBeenCalledTimes(1);
    expect(downloadFile).toHaveBeenCalledWith("/documents/3/download", "NP-PW-2026-003.html");
  });
});
