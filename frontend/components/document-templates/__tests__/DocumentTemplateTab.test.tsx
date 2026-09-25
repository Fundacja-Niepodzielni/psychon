import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek zakładki wzoru dokumentu (`DocumentTemplateTab`), użytej trzykrotnie
 * na ekranie `/admin/wzory-dokumentow` — raz na typ wzoru (`agreement`,
 * `attendance_certificate`, `certificate`). Zaplecze (`docs/.../document-templates`)
 * powstaje równolegle i nie jest jeszcze scalone — atrapa odpowiedzi API
 * siedzi tutaj, w próbach, nie w kodzie ekranu.
 */

const fetchDocumentTemplate = vi.fn();
const fetchDocumentTemplateVersions = vi.fn();
const updateDocumentTemplate = vi.fn();

class ApiError extends Error {
  status: number;
  code: string;
  errors?: Record<string, string[]>;

  constructor(status: number, code: string, message: string, errors?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

vi.mock("@/lib/api", () => ({
  fetchDocumentTemplate: (...args: unknown[]) => fetchDocumentTemplate(...args),
  fetchDocumentTemplateVersions: (...args: unknown[]) => fetchDocumentTemplateVersions(...args),
  updateDocumentTemplate: (...args: unknown[]) => updateDocumentTemplate(...args),
  ApiError,
}));

const { default: DocumentTemplateTab } = await import(
  "@/components/document-templates/DocumentTemplateTab"
);

const autor = { id: 3, name: "Anna Kowalska" };

function szablon(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    type: "agreement",
    content: "Treść porozumienia w wersji roboczej.",
    version: 1,
    updated_at: "2026-09-01T10:00:00Z",
    updated_by: autor,
    ...overrides,
  };
}

beforeEach(() => {
  fetchDocumentTemplate.mockReset();
  fetchDocumentTemplateVersions.mockReset();
  updateDocumentTemplate.mockReset();
});

describe("DocumentTemplateTab — zapis treści per typ wzoru", () => {
  it("pozytywna: zakładka porozumienia (agreement) zapisuje treść, nowa wersja pojawia się na ekranie", async () => {
    const user = userEvent.setup();
    fetchDocumentTemplate.mockResolvedValueOnce(szablon({ type: "agreement" }));
    fetchDocumentTemplateVersions.mockResolvedValueOnce([
      { version: 1, updated_at: "2026-09-01T10:00:00Z", updated_by: autor },
    ]);

    render(<DocumentTemplateTab type="agreement" label="wzoru porozumienia" />);

    const pole = (await screen.findByLabelText("Treść wzoru")) as HTMLTextAreaElement;
    expect(pole.value).toBe("Treść porozumienia w wersji roboczej.");

    await user.clear(pole);
    await user.type(pole, "Nowa treść porozumienia.");

    // Odpowiedź serwera celowo różna od tego, co wpisano lokalnie w treści
    // (backend normalizuje/odsyła to, co faktycznie zapisał) — dowód na to,
    // że ekran czyta odpowiedź `PUT`, a nie tylko lokalny stan pola.
    updateDocumentTemplate.mockResolvedValueOnce(
      szablon({
        type: "agreement",
        content: "Nowa treść porozumienia.",
        version: 2,
        updated_at: "2026-09-20T12:00:00Z",
        updated_by: { id: 7, name: "Ola Nowak" },
      }),
    );

    await user.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() =>
      expect(updateDocumentTemplate).toHaveBeenCalledWith(
        "agreement",
        "Nowa treść porozumienia.",
      ),
    );

    expect(await screen.findByText("Zapisano wzoru porozumienia — wersja #2.")).toBeInTheDocument();
    expect(screen.getByText(/Wersja #2/)).toBeInTheDocument();
    // "Ola Nowak" wisi w dwóch miejscach: podpisie pod formularzem i nowym
    // wierszu historii, który doszedł od razu po zapisie (bez drugiego GET).
    expect(screen.getAllByText(/Ola Nowak/)).toHaveLength(2);
  });

  it("pozytywna: zakładka zaświadczenia (attendance_certificate) zapisuje treść, nowa wersja pojawia się na ekranie", async () => {
    const user = userEvent.setup();
    fetchDocumentTemplate.mockResolvedValueOnce(
      szablon({ type: "attendance_certificate", content: "Treść zaświadczenia." }),
    );
    fetchDocumentTemplateVersions.mockResolvedValueOnce([
      { version: 1, updated_at: "2026-09-01T10:00:00Z", updated_by: autor },
    ]);

    render(
      <DocumentTemplateTab type="attendance_certificate" label="wzoru zaświadczenia" />,
    );

    const pole = (await screen.findByLabelText("Treść wzoru")) as HTMLTextAreaElement;
    await user.clear(pole);
    await user.type(pole, "Nowa treść zaświadczenia.");

    updateDocumentTemplate.mockResolvedValueOnce(
      szablon({
        type: "attendance_certificate",
        content: "Nowa treść zaświadczenia.",
        version: 5,
        updated_at: "2026-09-21T09:00:00Z",
        updated_by: { id: 9, name: "Ela Wiśniewska" },
      }),
    );

    await user.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() =>
      expect(updateDocumentTemplate).toHaveBeenCalledWith(
        "attendance_certificate",
        "Nowa treść zaświadczenia.",
      ),
    );

    expect(await screen.findByText("Zapisano wzoru zaświadczenia — wersja #5.")).toBeInTheDocument();
    expect(screen.getByText(/Wersja #5/)).toBeInTheDocument();
  });

  it("pozytywna: zakładka certyfikatu (certificate) zapisuje treść, nowa wersja pojawia się na ekranie", async () => {
    const user = userEvent.setup();
    fetchDocumentTemplate.mockResolvedValueOnce(
      szablon({ type: "certificate", content: "Treść certyfikatu." }),
    );
    fetchDocumentTemplateVersions.mockResolvedValueOnce([
      { version: 3, updated_at: "2026-08-01T10:00:00Z", updated_by: autor },
    ]);

    render(<DocumentTemplateTab type="certificate" label="wzoru certyfikatu" />);

    const pole = (await screen.findByLabelText("Treść wzoru")) as HTMLTextAreaElement;
    await user.clear(pole);
    await user.type(pole, "Nowa treść certyfikatu.");

    updateDocumentTemplate.mockResolvedValueOnce(
      szablon({
        type: "certificate",
        content: "Nowa treść certyfikatu.",
        version: 4,
        updated_at: "2026-09-22T08:00:00Z",
        updated_by: { id: 11, name: "Marek Zych" },
      }),
    );

    await user.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() =>
      expect(updateDocumentTemplate).toHaveBeenCalledWith("certificate", "Nowa treść certyfikatu."),
    );

    expect(await screen.findByText("Zapisano wzoru certyfikatu — wersja #4.")).toBeInTheDocument();
    expect(screen.getByText(/Wersja #4/)).toBeInTheDocument();
  });
});

describe("DocumentTemplateTab — historia wersji (sam odczyt)", () => {
  it("pozytywna: historia pokazuje wersję, datę i osobę, bez kontrolki edycji w wierszu", async () => {
    fetchDocumentTemplate.mockResolvedValueOnce(szablon());
    fetchDocumentTemplateVersions.mockResolvedValueOnce([
      { version: 2, updated_at: "2026-09-10T08:30:00Z", updated_by: { id: 4, name: "Beata Lis" } },
      { version: 1, updated_at: "2026-08-01T09:00:00Z", updated_by: { id: 3, name: "Anna Kowalska" } },
    ]);

    render(<DocumentTemplateTab type="agreement" label="wzoru porozumienia" />);

    await screen.findByRole("table", { name: "Historia wersji — wzoru porozumienia" });

    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByText("Beata Lis")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("Anna Kowalska")).toBeInTheDocument();

    // Sam odczyt: żaden wiersz historii nie ma pola edycyjnego ani przycisku.
    expect(screen.queryAllByRole("textbox").length).toBe(1); // tylko edytor treści
    expect(screen.queryAllByRole("button", { name: /wersj/i }).length).toBe(0);
  });
});

describe("DocumentTemplateTab — błąd uprawnień", () => {
  it("negatywna: 403 przy wczytywaniu pokazuje komunikat i NIE udaje zapisu (brak formularza)", async () => {
    fetchDocumentTemplate.mockRejectedValueOnce(
      new ApiError(403, "forbidden", "Nie masz uprawnień do wyświetlenia tego wzoru."),
    );
    fetchDocumentTemplateVersions.mockRejectedValueOnce(
      new ApiError(403, "forbidden", "Nie masz uprawnień do wyświetlenia tego wzoru."),
    );

    render(<DocumentTemplateTab type="agreement" label="wzoru porozumienia" />);

    expect(
      await screen.findByText("Nie masz uprawnień do wyświetlenia wzoru porozumienia."),
    ).toBeInTheDocument();

    // Ekran nie udaje zapisu: brak edytora, przycisku "Zapisz zmiany" i
    // jakiegokolwiek komunikatu sukcesu.
    expect(screen.queryByLabelText("Treść wzoru")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zapisz zmiany" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Zapisano/)).not.toBeInTheDocument();
    expect(updateDocumentTemplate).not.toHaveBeenCalled();
  });
});
