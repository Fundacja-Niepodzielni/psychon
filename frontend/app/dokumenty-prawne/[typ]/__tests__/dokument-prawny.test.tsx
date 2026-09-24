import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Świadek `/dokumenty-prawne/[typ]` (H22).
 * Kontrakt: `GET /legal-documents/{type}/current`, publiczny, bez tokenu
 * (`backend/routes/api/h22.php:28`).
 *
 * Renderuje `DokumentPrawnyEkran` (nazwany eksport) zamiast domyślnego
 * `DokumentPrawnyPage` — ten drugi rozpakowuje `params: Promise<...>` przez
 * `use()`, co w tym środowisku (jsdom + Vitest + React 19.2.8) nigdy nie
 * wybudza się z Suspense nawet dla już rozstrzygniętej obietnicy (zmierzone
 * osobno, ręcznym `act`), niezależnie od logiki tego ekranu — patrz komentarz
 * w `page.tsx` przy `DokumentPrawnyEkran`.
 */

const apiMock = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: (...args: unknown[]) => apiMock(...args) };
});

const { ApiError } = await import("@/lib/api");
const { DokumentPrawnyEkran } = await import("@/app/dokumenty-prawne/[typ]/page");

beforeEach(() => {
  apiMock.mockReset();
});

describe("/dokumenty-prawne/[typ] — dokument opublikowany", () => {
  it("pokazuje tytuł, wersję i treść, dokładnie jeden h1", async () => {
    apiMock.mockResolvedValue({
      type: "regulamin",
      version: "1.2",
      content: "Pierwszy akapit regulaminu.\n\nDrugi akapit regulaminu.",
      published_at: "2026-09-01T00:00:00Z",
    });

    render(<DokumentPrawnyEkran typ="regulamin" />);

    expect(
      await screen.findByText("Pierwszy akapit regulaminu."),
    ).toBeInTheDocument();
    expect(screen.getByText("Drugi akapit regulaminu.")).toBeInTheDocument();
    expect(screen.getByText(/Wersja 1\.2/)).toBeInTheDocument();

    const naglowki = screen.getAllByRole("heading", { level: 1 });
    expect(naglowki).toHaveLength(1);
    expect(naglowki[0]).toHaveTextContent(/^Regulamin$/);

    expect(apiMock).toHaveBeenCalledWith("/legal-documents/regulamin/current");
  });
});

describe("/dokumenty-prawne/[typ] — trzeci rodzaj (klauzula-rodo)", () => {
  it("pokazuje tytuł i treść klauzuli RODO", async () => {
    apiMock.mockResolvedValue({
      type: "klauzula-rodo",
      version: "1.0",
      content: "Treść klauzuli RODO.",
      published_at: "2026-09-18T00:00:00Z",
    });

    render(<DokumentPrawnyEkran typ="klauzula-rodo" />);

    expect(await screen.findByText("Treść klauzuli RODO.")).toBeInTheDocument();

    const naglowki = screen.getAllByRole("heading", { level: 1 });
    expect(naglowki).toHaveLength(1);
    expect(naglowki[0]).toHaveTextContent(/^Klauzula RODO \(informacja o przetwarzaniu\)$/);

    expect(apiMock).toHaveBeenCalledWith("/legal-documents/klauzula-rodo/current");
  });
});

describe("/dokumenty-prawne/[typ] — dokument nieopublikowany (API 404)", () => {
  it("pokazuje komunikat o braku publikacji, bez wysypania się", async () => {
    apiMock.mockRejectedValue(
      new ApiError({ status: 404, code: "not_found", message: "Nie znaleziono zasobu." }),
    );

    render(<DokumentPrawnyEkran typ="polityka" />);

    expect(
      await screen.findByText("Dokument nie został jeszcze opublikowany."),
    ).toBeInTheDocument();
  });
});

describe("/dokumenty-prawne/[typ] — nieznany rodzaj", () => {
  it("pokazuje stan nie znaleziono, bez wołania API", async () => {
    render(<DokumentPrawnyEkran typ="cos-nieznanego" />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Nie znaleziono dokumentu" }),
    ).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
  });
});
