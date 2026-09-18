import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek ekranu skrzynki e-maili (H16) po przepięciu na `ListTemplate` +
 * `useZasobStronicowany` (C2 wariant C, partia P1).
 */

const apiPaged = vi.fn();

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

vi.mock("@/lib/api", () => ({
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  ApiError,
}));

const { default: AdminEmailsPage } = await import(
  "@/app/(administracja)/admin/emails/page"
);

const email = {
  id: 1,
  to_email: "marta@example.test",
  subject: "Powitanie",
  status: "simulated" as const,
  body_html: "<p>Cześć</p>",
  sent_at: "2026-09-01T10:00:00Z",
  created_at: "2026-09-01T10:00:00Z",
};

beforeEach(() => {
  apiPaged.mockReset();
});

describe("AdminEmailsPage", () => {
  it("nagłówek pochodzi z PageHeader, tabela pokazuje wiersz po wczytaniu", async () => {
    apiPaged.mockResolvedValue({
      data: [email],
      meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 },
    });
    render(<AdminEmailsPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Skrzynka e-maili" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Powitanie")).toBeInTheDocument());
    expect(apiPaged).toHaveBeenCalledWith("/admin/emails?page=1&per_page=25");
  });

  it("noga negatywna: pusta lista pokazuje EmptyState zamiast tabeli", async () => {
    apiPaged.mockResolvedValue({ data: [], meta: undefined });
    render(<AdminEmailsPage />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Brak wysłanych e-maili." })).toBeInTheDocument(),
    );
  });

  it("noga negatywna: błąd serwera pokazuje ErrorState z przyciskiem ponowienia", async () => {
    apiPaged.mockRejectedValue(new ApiError(500, "Skrzynka niedostępna."));
    render(<AdminEmailsPage />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Skrzynka niedostępna."));
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();
  });

  it("403: pokazuje odmowę dostępu, nie ErrorState", async () => {
    apiPaged.mockRejectedValue(new ApiError(403, "Brak uprawnień."));
    render(<AdminEmailsPage />);

    await waitFor(() => expect(screen.getByText("Brak dostępu")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("500: pokazuje ErrorState, nie odmowę dostępu", async () => {
    apiPaged.mockRejectedValue(new ApiError(500, "Skrzynka niedostępna."));
    render(<AdminEmailsPage />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByText("Brak dostępu")).not.toBeInTheDocument();
  });

  it("stronicowanie: klik Następna pobiera drugą stronę", async () => {
    apiPaged.mockResolvedValue({
      data: [email],
      meta: { current_page: 1, per_page: 25, total: 30, last_page: 2 },
    });
    render(<AdminEmailsPage />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Następna" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Następna" }));

    await waitFor(() =>
      expect(apiPaged).toHaveBeenLastCalledWith("/admin/emails?page=2&per_page=25"),
    );
  });

  /**
   * Przyrząd (część frontu) z decyzji architekta: ekran nie twierdzi
   * (literał w kodzie), tylko pokazuje to, co przyszło z zaplecza
   * (`meta.extra.from`). Ta gałąź dowodzi, że ekran w ogóle CZYTA to pole —
   * druga połowa porównania (czy to, co czyta, zgadza się z nagłówkiem,
   * który poczta naprawdę wstawia) jest w
   * `backend/tests/Unit/Notifications/EmailSenderHeaderTest.php`.
   */
  it("Od: pokazuje skonfigurowanego nadawcę z zaplecza, nie literał w kodzie", async () => {
    apiPaged.mockResolvedValue({
      data: [email],
      meta: {
        current_page: 1,
        per_page: 25,
        total: 1,
        last_page: 1,
        extra: { from: { address: "zwrotny@przyklad.test", name: "Zespół Testowy" } },
      },
    });
    render(<AdminEmailsPage />);

    await waitFor(() => expect(screen.getByText("Powitanie")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Podgląd" }));

    expect(
      screen.getByText("Zespół Testowy <zwrotny@przyklad.test>"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/niepodzielni\.pl/)).not.toBeInTheDocument();
  });

  it("Od: brak skonfigurowanego adresu pokazuje zdanie o braku, nie pusty napis ani placeholder", async () => {
    apiPaged.mockResolvedValue({
      data: [email],
      meta: {
        current_page: 1,
        per_page: 25,
        total: 1,
        last_page: 1,
        extra: { from: null },
      },
    });
    render(<AdminEmailsPage />);

    await waitFor(() => expect(screen.getByText("Powitanie")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Podgląd" }));

    expect(
      screen.getByText("Adres nadawcy zależy od wdrożenia — nieustawiony."),
    ).toBeInTheDocument();
  });

  it("sonda odwrotna: zmiana kosmetyczna (tytuł nagłówka) nie zmienia sposobu pokazania nadawcy", async () => {
    apiPaged.mockResolvedValue({
      data: [email],
      meta: {
        current_page: 1,
        per_page: 25,
        total: 1,
        last_page: 1,
        extra: { from: { address: "kosmetyka@przyklad.test", name: null } },
      },
    });
    render(<AdminEmailsPage />);

    // Nagłówek listy jest bez związku z polem nadawcy — zmiana tego tekstu
    // (np. literówka w tytule) nie może maskować regresji na polu "Od:".
    expect(
      screen.getByRole("heading", { level: 1, name: "Skrzynka e-maili" }),
    ).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("Powitanie")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Podgląd" }));

    expect(screen.getByText("kosmetyka@przyklad.test")).toBeInTheDocument();
  });
});
