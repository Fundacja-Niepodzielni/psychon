import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Świadek ekranu `/admin/wzory-dokumentow`: trzy zakładki (porozumienie,
 * zaświadczenie, certyfikat) na jednej trasie, wybór zakładki w adresie
 * (wzorzec `Tabs`/`admin/uczestniczki`). Treść każdej zakładki mierzy
 * `DocumentTemplateTab.test.tsx` — ten plik mierzy samo rusztowanie trzech
 * zakładek na ekranie.
 */

const fetchDocumentTemplate = vi.fn();
const fetchDocumentTemplateVersions = vi.fn();
const updateDocumentTemplate = vi.fn();

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

vi.mock("@/lib/api", () => ({
  fetchDocumentTemplate: (...args: unknown[]) => fetchDocumentTemplate(...args),
  fetchDocumentTemplateVersions: (...args: unknown[]) => fetchDocumentTemplateVersions(...args),
  updateDocumentTemplate: (...args: unknown[]) => updateDocumentTemplate(...args),
  ApiError,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/wzory-dokumentow",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const { default: DocumentTemplatesPage } = await import(
  "@/app/(administracja)/admin/wzory-dokumentow/page"
);

beforeEach(() => {
  fetchDocumentTemplate.mockReset();
  fetchDocumentTemplateVersions.mockReset();
  updateDocumentTemplate.mockReset();
  // Zakładka aktywna domyślnie (porozumienie) musi się wczytać, żeby test nie
  // mierzył stanu ładowania — pozostałe dwie NIE są montowane (Tabs), więc
  // ich atrapy zostają nieużyte.
  fetchDocumentTemplate.mockResolvedValue({
    type: "agreement",
    content: "Treść porozumienia.",
    version: 1,
    updated_at: "2026-09-01T10:00:00Z",
    updated_by: { id: 1, name: "Anna Kowalska" },
  });
  fetchDocumentTemplateVersions.mockResolvedValue([
    { version: 1, updated_at: "2026-09-01T10:00:00Z", updated_by: { id: 1, name: "Anna Kowalska" } },
  ]);
});

describe("DocumentTemplatesPage — trzy zakładki wzorów dokumentów", () => {
  it("pozytywna: ekran renderuje dokładnie trzy zakładki — porozumienie, zaświadczenie, certyfikat", async () => {
    render(<DocumentTemplatesPage />);

    const tabList = await screen.findByRole("tablist", { name: "Wzory dokumentów" });
    const tabs = screen.getAllByRole("tab");

    expect(tabList).toBeInTheDocument();
    expect(tabs).toHaveLength(3);
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Porozumienie",
      "Zaświadczenie",
      "Certyfikat",
    ]);

    // Tylko aktywna zakładka (porozumienie) odpytuje API — reszta nie jest
    // zamontowana, dopóki nikt jej nie otworzy.
    expect(fetchDocumentTemplate).toHaveBeenCalledTimes(1);
    expect(fetchDocumentTemplate).toHaveBeenCalledWith("agreement");
  });
});
