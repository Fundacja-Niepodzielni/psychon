import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { straznikHostow } from "../../wspolne/strona-publiczna/__tests__/hosty";

/**
 * Dokument prawny: wczytywanie, dokument opublikowany (wersja, data, akapity),
 * trzeci rodzaj, nieopublikowany (404), awaria z ponowieniem, nieznany rodzaj
 * bez żądania — ten sam pomocnik `fetchLegalDocument(typ)` co stara strona.
 */

const fetchLegalDocument = vi.fn();
vi.mock("@/lib/h22/legal-documents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/h22/legal-documents")>()),
  fetchLegalDocument: (...a: unknown[]) => fetchLegalDocument(...a),
}));

const { ApiError } = await import("@/lib/api");
const { DokumentPrawny } = await import("../DokumentPrawny");

const REGULAMIN = {
  type: "regulamin",
  version: "v1",
  content: "Pierwszy akapit regulaminu.\n\nDrugi akapit regulaminu.\n\n\n   \n\nTrzeci.",
  published_at: "2026-09-17T10:00:00Z",
};
let straznik: ReturnType<typeof straznikHostow>;

async function pokaz(typ: string) {
  let wynik: ReturnType<typeof render> | undefined;
  await act(async () => {
    wynik = render(<DokumentPrawny typ={typ} />);
  });
  return wynik!;
}

beforeEach(() => {
  fetchLegalDocument.mockReset();
  straznik = straznikHostow();
});
afterEach(() => {
  expect(straznik.adresy).toEqual([]);
  straznik.przywroc();
  cleanup();
});

describe("dokument prawny — stany", () => {
  it("wczytywanie: tytuł rodzaju i status", async () => {
    fetchLegalDocument.mockReturnValue(new Promise(() => {}));
    await pokaz("regulamin");
    expect(fetchLegalDocument).toHaveBeenCalledWith("regulamin");
    expect(screen.getByRole("heading", { level: 1, name: "Regulamin" })).toBeTruthy();
    expect(screen.getByRole("status", { name: "Wczytywanie dokumentu…" })).toBeTruthy();
  });

  it("opublikowany: wersja, data i akapity; jeden h1", async () => {
    fetchLegalDocument.mockResolvedValue(REGULAMIN);
    const { container } = await pokaz("regulamin");
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByText("Wersja v1 · 17 września 2026")).toBeTruthy();
    expect(screen.getByText("Pierwszy akapit regulaminu.")).toBeTruthy();
    expect(screen.getByText("Drugi akapit regulaminu.")).toBeTruthy();
    expect(screen.getByText("Trzeci.")).toBeTruthy();
  });

  it("trzeci rodzaj (klauzula RODO)", async () => {
    fetchLegalDocument.mockResolvedValue({ ...REGULAMIN, type: "klauzula-rodo", content: "Treść klauzuli." });
    await pokaz("klauzula-rodo");
    expect(fetchLegalDocument).toHaveBeenCalledWith("klauzula-rodo");
    expect(
      screen.getByRole("heading", { level: 1, name: "Klauzula RODO (informacja o przetwarzaniu)" }),
    ).toBeTruthy();
    expect(screen.getByText("Treść klauzuli.")).toBeTruthy();
  });

  it("nieopublikowany (404): komunikat informacyjny", async () => {
    fetchLegalDocument.mockRejectedValue(new ApiError({ status: 404, code: "not_found", message: "x" }));
    await pokaz("polityka");
    expect(screen.getByText("Dokument nie został jeszcze opublikowany.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("awaria: komunikat i ponowienie, które pyta ponownie", async () => {
    fetchLegalDocument.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await pokaz("polityka");
    expect(screen.getByRole("alert").textContent).toContain("Nie udało się połączyć z serwerem.");
    fetchLegalDocument.mockResolvedValueOnce({ ...REGULAMIN, type: "polityka", content: "Polityka." });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    });
    expect(fetchLegalDocument).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Polityka.")).toBeTruthy();
  });

  it("nieznany rodzaj: „nie znaleziono” bez żądania, odnośnik na stronę główną", async () => {
    const { container } = await pokaz("nieistniejacy");
    expect(fetchLegalDocument).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1, name: "Nie znaleziono dokumentu" })).toBeTruthy();
    expect(screen.getByText("Ten rodzaj dokumentu prawnego nie istnieje.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Wróć na stronę główną" }).getAttribute("href")).toBe("/");
    expect(container.querySelectorAll("h1")).toHaveLength(1);
  });
});
