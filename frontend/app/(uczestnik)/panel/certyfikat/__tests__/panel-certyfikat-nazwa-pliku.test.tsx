import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Nazwa pobranego certyfikatu pochodzi z odpowiedzi serwera (nagłówek
 * `Content-Disposition`, także postać `filename*=`). Gdy nagłówka brak albo
 * przeglądarka go nie udostępnia, plik dostaje bezpieczną nazwę z `.pdf` —
 * serwer wydaje PDF, więc rozszerzenie `.html` czyniłoby plik nieotwieralnym.
 */

const fetchCertificateConditions = vi.fn();

vi.mock("@/lib/pulpit/data", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/pulpit/data")>();
  return {
    ...actual,
    fetchCertificateConditions: (...args: unknown[]) => fetchCertificateConditions(...args),
  };
});

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: vi.fn(async () => ({ data: { status: "queued" } })),
    getToken: vi.fn(async () => "token-probny"),
  };
});

const { default: CertificatePage } = await import("@/app/(uczestnik)/panel/certyfikat/StaraTresc");

const warunkiSpelnione = {
  eligible: true,
  conditions: [
    { key: "courses" as const, label: "Wszystkie etapy i testy", done: 10, required: 10, met: true },
    { key: "workshop" as const, label: "Warsztat stacjonarny", met: true },
  ],
  passed_tests_count: 10,
};

const fetchMock = vi.fn();
let nazwyPobran: string[] = [];

function odpowiedz(naglowek: string | null, typ: string | null) {
  const headers = new Headers();
  if (naglowek !== null) headers.set("Content-Disposition", naglowek);
  if (typ !== null) headers.set("Content-Type", typ);
  return { ok: true, status: 200, headers, blob: async () => new Blob(["%PDF-1.7"]) };
}

async function pobierzCertyfikat(naglowek: string | null, typ: string | null = null): Promise<string> {
  fetchMock.mockResolvedValue(odpowiedz(naglowek, typ));
  render(<CertificatePage />);
  fireEvent.click(await screen.findByRole("button", { name: "Wygeneruj certyfikat" }));
  fireEvent.click(await screen.findByRole("button", { name: "Pobierz certyfikat" }));
  await waitFor(() => expect(nazwyPobran).toHaveLength(1));
  return nazwyPobran[0];
}

beforeEach(() => {
  nazwyPobran = [];
  fetchCertificateConditions.mockReset();
  fetchCertificateConditions.mockResolvedValue(warunkiSpelnione);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window.URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:atrapa") });
  Object.defineProperty(window.URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    nazwyPobran.push(this.download);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CertificatePage — nazwa pobranego pliku", () => {
  it("bierze nazwę z nagłówka Content-Disposition", async () => {
    const nazwa = await pobierzCertyfikat('attachment; filename=certyfikat-NP-2026-017.pdf');
    expect(nazwa).toBe("certyfikat-NP-2026-017.pdf");
  });

  it("bierze nazwę w cudzysłowie z nagłówka", async () => {
    const nazwa = await pobierzCertyfikat('attachment; filename="certyfikat-NP-2026-017.pdf"');
    expect(nazwa).toBe("certyfikat-NP-2026-017.pdf");
  });

  it("woli postać filename*= i dekoduje ją", async () => {
    const nazwa = await pobierzCertyfikat(
      "attachment; filename=\"certyfikat-zastepczy.pdf\"; filename*=UTF-8''certyfikat-%C5%BC%C3%B3%C5%82w-017.pdf",
    );
    expect(nazwa).toBe("certyfikat-żółw-017.pdf");
  });

  it("bez nagłówka używa nazwy z rozszerzeniem .pdf", async () => {
    const nazwa = await pobierzCertyfikat(null);
    expect(nazwa).toBe("certyfikat.pdf");
  });

  it("bez nagłówka z nazwą i z typem application/pdf daje certyfikat.pdf", async () => {
    expect(await pobierzCertyfikat(null, "application/pdf")).toBe("certyfikat.pdf");
  });

  it("bez nagłówka z nazwą i z typem text/html daje certyfikat.html (dokument sprzed zmiany)", async () => {
    expect(await pobierzCertyfikat(null, "text/html")).toBe("certyfikat.html");
  });

  it("typ z parametrem i dowolna wielkość liter działają tak samo", async () => {
    expect(await pobierzCertyfikat(null, "Text/HTML; charset=utf-8")).toBe("certyfikat.html");
  });

  it("inny typ daje certyfikat.pdf", async () => {
    expect(await pobierzCertyfikat(null, "application/octet-stream")).toBe("certyfikat.pdf");
  });

  it("nazwa z nagłówka wygrywa z typem odpowiedzi", async () => {
    expect(await pobierzCertyfikat('attachment; filename="certyfikat-1.pdf"', "text/html")).toBe("certyfikat-1.pdf");
  });

  it("nazwa z samych spacji jest bezużyteczna i daje nazwę z typu odpowiedzi", async () => {
    expect(await pobierzCertyfikat('attachment; filename="   "', "text/html")).toBe("certyfikat.html");
  });

  it("nazwa z ukośnikami nie wychodzi poza ostatni człon", async () => {
    const nazwa = await pobierzCertyfikat('attachment; filename="../../etc/certyfikat-1.pdf"');
    expect(nazwa).toBe("certyfikat-1.pdf");
    expect(nazwa).not.toMatch(/[\\/]/);
  });
});
