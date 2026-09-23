import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek ekranu H13 · Certyfikaty (`/admin/certyfikaty`): „administracja
 * unieważnia certyfikat z powodem". Trasa
 * zaplecza (`POST /admin/certificates/{certificate}/revoke`,
 * `backend/routes/api/h13.php:37`) istniała bez odbiorcy w interfejsie;
 * ten plik mierzy EKRAN (żądanie wysłane, ciało, odświeżenie listy),
 * nie sieć — logika serwera ma własnych świadków w backendzie.
 */

const api = vi.fn();
const apiPaged = vi.fn();

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
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  ApiError,
}));

const { default: AdminCertificatesPage } = await import(
  "@/app/(administracja)/admin/certyfikaty/page"
);
const { default: RequireRole } = await import("@/components/permissions/RequireRole");

const wazny = {
  id: 1,
  number: "NP/2026/001",
  issued_at: "2026-06-01T10:00:00Z",
  status: "valid" as const,
  edition: "Edycja 2026",
  user: { id: 5, first_name: "Marta", last_name: "Testowa" },
  revoked_at: null,
  revoked_reason: null,
  revoked_by: null,
};

const uniewazniony = {
  ...wazny,
  id: 2,
  number: "NP/2026/002",
  status: "revoked" as const,
  revoked_at: "2026-07-01T10:00:00Z",
  revoked_reason: "Stwierdzono naruszenie regulaminu.",
  revoked_by: 9,
};

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  apiPaged.mockResolvedValue({
    data: [wazny],
    meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 },
  });
});

describe("AdminCertificatesPage — lista i unieważnienie", () => {
  it("nagłówek i wiersz certyfikatu wczytują się z /admin/certificates", async () => {
    render(<AdminCertificatesPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Certyfikaty" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("NP/2026/001")).toBeInTheDocument());
    expect(apiPaged).toHaveBeenCalledWith("/admin/certificates?page=1&per_page=25");
  });

  it("certyfikat już unieważniony nie ma przycisku, tylko powód", async () => {
    apiPaged.mockResolvedValue({
      data: [uniewazniony],
      meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 },
    });
    render(<AdminCertificatesPage />);

    await waitFor(() => expect(screen.getByText("NP/2026/002")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Unieważnij" })).not.toBeInTheDocument();
    expect(screen.getByText("Stwierdzono naruszenie regulaminu.")).toBeInTheDocument();
  });

  it("pozytywna: klik → potwierdzenie z powodem → API wywołane z id i powodem → wiersz pokazuje unieważnienie po odświeżeniu", async () => {
    const user = userEvent.setup();
    api.mockResolvedValue({ ...wazny, status: "revoked", revoked_reason: "Powód testowy, min 10 znaków." });
    render(<AdminCertificatesPage />);

    await user.click(await screen.findByRole("button", { name: "Unieważnij" }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Powód"), "Powód testowy, min 10 znaków.");
    await user.click(within(dialog).getByRole("button", { name: "Unieważnij" }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(api).toHaveBeenCalledWith("/admin/certificates/1/revoke", {
      method: "POST",
      body: { reason: "Powód testowy, min 10 znaków." },
    });

    // Odświeżenie listy po sukcesie — drugie pobranie strony 1.
    await waitFor(() => expect(apiPaged).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/został unieważniony/)).toBeInTheDocument();
  });

  it("negatywna: Anuluj nie wysyła żądania", async () => {
    const user = userEvent.setup();
    render(<AdminCertificatesPage />);

    await user.click(await screen.findByRole("button", { name: "Unieważnij" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Anuluj" }));

    expect(api).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("negatywna: powód pusty nie wysyła żądania i mówi o tym wprost", async () => {
    const user = userEvent.setup();
    render(<AdminCertificatesPage />);

    await user.click(await screen.findByRole("button", { name: "Unieważnij" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Unieważnij" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Podaj powód unieważnienia.");
    expect(api).not.toHaveBeenCalled();
  });

  it("negatywna: błąd API pokazuje komunikat, dialog zostaje otwarty", async () => {
    const user = userEvent.setup();
    api.mockRejectedValue(new ApiError(500, "server_error", "Nie udało się unieważnić certyfikatu."));
    render(<AdminCertificatesPage />);

    await user.click(await screen.findByRole("button", { name: "Unieważnij" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Powód"), "Powód testowy, min 10 znaków.");
    await user.click(within(dialog).getByRole("button", { name: "Unieważnij" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Nie udało się unieważnić certyfikatu.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("negatywna: błąd walidacji 422 pola reason pokazuje komunikat z serwera", async () => {
    const user = userEvent.setup();
    api.mockRejectedValue(
      new ApiError(422, "validation_failed", "Popraw zaznaczone pola.", {
        reason: ["Powód musi mieć co najmniej 10 znaków."],
      }),
    );
    render(<AdminCertificatesPage />);

    await user.click(await screen.findByRole("button", { name: "Unieważnij" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Powód"), "krótko");
    await user.click(within(dialog).getByRole("button", { name: "Unieważnij" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Powód musi mieć co najmniej 10 znaków.",
    );
  });

  it("negatywna: osoba bez uprawnionej roli nie widzi ekranu ani przycisku Unieważnij — RequireRole odmawia dostępu", async () => {
    api.mockResolvedValueOnce({ role: "instructor" });
    render(
      <RequireRole allowedRoles={["project_manager", "super_admin"]}>
        <AdminCertificatesPage />
      </RequireRole>,
    );

    expect(await screen.findByText("Brak dostępu")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unieważnij" })).not.toBeInTheDocument();
    expect(apiPaged).not.toHaveBeenCalled();
  });
});
