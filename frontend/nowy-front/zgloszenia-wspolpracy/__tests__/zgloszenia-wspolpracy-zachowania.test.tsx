import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Zachowania ekranu zgłoszeń dalszej współpracy (administracja): filtr
 * statusu, odpowiedź na zgłoszenie i jej ciało żądania, brak przycisku na
 * wpisie zamkniętym, błędy 422/403/404 w sekcji odpowiedzi i odmowa roli
 * przy odczycie. Funkcje danych są tu podmienione; stany szablonu i transport
 * mierzy `zgloszenia-wspolpracy.test.tsx`.
 */

const pobierzZgloszeniaAdministracji = vi.fn();
const odpowiedzNaZgloszenie = vi.fn();
const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api/h01-wspolpraca", () => ({
  pobierzZgloszeniaAdministracji: (...args: unknown[]) => pobierzZgloszeniaAdministracji(...args),
  odpowiedzNaZgloszenie: (...args: unknown[]) => odpowiedzNaZgloszenie(...args),
}));

const { ApiError } = await import("@/lib/api/klient");
const { ZgloszeniaWspolpracy } = await import("../ZgloszeniaWspolpracy");

const ZGLOSZENIE_NOWE = {
  id: 11,
  body: "Chciałabym kontynuować dyżury telefoniczne.",
  status: "new" as const,
  response: null,
  responded_at: null,
  created_at: "2026-09-20T10:00:00Z",
  updated_at: "2026-09-20T10:00:00Z",
  responded_by: null,
  user: { id: 17, first_name: "Marta", last_name: "Demo", email: "marta@demo.pl" },
};

const ZGLOSZENIE_ZAMKNIETE = {
  ...ZGLOSZENIE_NOWE,
  id: 12,
  status: "closed" as const,
  response: "Dziękujemy za zgłoszenie.",
  responded_at: "2026-09-21T10:00:00Z",
  responded_by: 3,
};

beforeEach(() => {
  pobierzZgloszeniaAdministracji.mockReset();
  odpowiedzNaZgloszenie.mockReset();
  back.mockReset();
});

describe("ZgloszeniaWspolpracy — filtr statusu", () => {
  it("filtr „Nowe” → zapytanie z status=new i page=1", async () => {
    const uzytkownik = userEvent.setup();
    pobierzZgloszeniaAdministracji.mockResolvedValue({
      data: [ZGLOSZENIE_NOWE],
      meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 },
    });

    render(<ZgloszeniaWspolpracy />);
    await waitFor(() => expect(pobierzZgloszeniaAdministracji).toHaveBeenCalledTimes(1));

    await uzytkownik.click(screen.getByRole("combobox", { name: /^Status/ }));
    await uzytkownik.click(screen.getByRole("option", { name: "Nowe" }));

    await waitFor(() => expect(pobierzZgloszeniaAdministracji).toHaveBeenCalledTimes(2));
    expect(pobierzZgloszeniaAdministracji).toHaveBeenLastCalledWith({ status: "new", page: 1 });
  });
});

describe("ZgloszeniaWspolpracy — odpowiedź na zgłoszenie", () => {
  it("odpowiedź → ciało PATCH dokładnie {response,status:'answered'}; 200 → wiersz zmieniony; closed bez przycisku Odpowiedz", async () => {
    const uzytkownik = userEvent.setup();
    pobierzZgloszeniaAdministracji.mockResolvedValue({
      data: [ZGLOSZENIE_NOWE],
      meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 },
    });
    const zaktualizowany = {
      ...ZGLOSZENIE_NOWE,
      status: "answered" as const,
      response: "Zapraszamy do dalszej współpracy.",
      responded_at: "2026-09-22T10:00:00Z",
      responded_by: 3,
    };
    odpowiedzNaZgloszenie.mockResolvedValue(zaktualizowany);

    render(<ZgloszeniaWspolpracy />);
    await waitFor(() => expect(screen.getByText(ZGLOSZENIE_NOWE.body)).toBeInTheDocument());

    await uzytkownik.click(screen.getByRole("button", { name: "Odpowiedz na zgłoszenie" }));
    const poleOdpowiedzi = await screen.findByRole("textbox", { name: /^Odpowiedź/ });
    await uzytkownik.type(poleOdpowiedzi, zaktualizowany.response);
    await uzytkownik.click(screen.getByRole("button", { name: "Odpowiedz" }));

    await waitFor(() => expect(odpowiedzNaZgloszenie).toHaveBeenCalledTimes(1));
    expect(odpowiedzNaZgloszenie).toHaveBeenCalledWith(ZGLOSZENIE_NOWE.id, {
      response: zaktualizowany.response,
      status: "answered",
    });

    await waitFor(() => expect(screen.getByText("Z odpowiedzią")).toBeInTheDocument());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("wiersz closed nie ma przycisku „Odpowiedz na zgłoszenie”", async () => {
    pobierzZgloszeniaAdministracji.mockResolvedValue({
      data: [ZGLOSZENIE_ZAMKNIETE],
      meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 },
    });

    render(<ZgloszeniaWspolpracy />);
    await waitFor(() => expect(screen.getByText(ZGLOSZENIE_ZAMKNIETE.body)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Odpowiedz na zgłoszenie" })).toBeNull();
  });
});

describe("ZgloszeniaWspolpracy — błędy zapisu odpowiedzi", () => {
  it("422 w oknie → błąd pod polem", async () => {
    const uzytkownik = userEvent.setup();
    pobierzZgloszeniaAdministracji.mockResolvedValue({
      data: [ZGLOSZENIE_NOWE],
      meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 },
    });
    odpowiedzNaZgloszenie.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "validation_failed",
        message: "Popraw zaznaczone pola.",
        errors: { response: ["Wpisz odpowiedź dla osoby zgłaszającej."] },
      }),
    );

    render(<ZgloszeniaWspolpracy />);
    await waitFor(() => expect(screen.getByText(ZGLOSZENIE_NOWE.body)).toBeInTheDocument());
    await uzytkownik.click(screen.getByRole("button", { name: "Odpowiedz na zgłoszenie" }));
    await uzytkownik.click(screen.getByRole("button", { name: "Odpowiedz" }));

    expect(await screen.findByText("Wpisz odpowiedź dla osoby zgłaszającej.")).toBeInTheDocument();
  });

  it("403 cooperation_request_closed → Notice w oknie i odświeżenie listy", async () => {
    const uzytkownik = userEvent.setup();
    pobierzZgloszeniaAdministracji.mockResolvedValue({
      data: [ZGLOSZENIE_NOWE],
      meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 },
    });
    odpowiedzNaZgloszenie.mockRejectedValue(
      new ApiError({ status: 403, code: "cooperation_request_closed", message: "To zgłoszenie jest już zamknięte." }),
    );

    render(<ZgloszeniaWspolpracy />);
    await waitFor(() => expect(screen.getByText(ZGLOSZENIE_NOWE.body)).toBeInTheDocument());
    await uzytkownik.click(screen.getByRole("button", { name: "Odpowiedz na zgłoszenie" }));
    const poleOdpowiedzi = await screen.findByRole("textbox", { name: /^Odpowiedź/ });
    await uzytkownik.type(poleOdpowiedzi, "x");
    await uzytkownik.click(screen.getByRole("button", { name: "Odpowiedz" }));

    expect(await screen.findByText("To zgłoszenie jest już zamknięte.")).toBeInTheDocument();
    await waitFor(() => expect(pobierzZgloszeniaAdministracji).toHaveBeenCalledTimes(2));
  });

  it("404 → Notice „Zgłoszenie nie istnieje.” i odświeżenie listy", async () => {
    const uzytkownik = userEvent.setup();
    pobierzZgloszeniaAdministracji.mockResolvedValue({
      data: [ZGLOSZENIE_NOWE],
      meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 },
    });
    odpowiedzNaZgloszenie.mockRejectedValue(
      new ApiError({ status: 404, code: "not_found", message: "Nie znaleziono zgłoszenia." }),
    );

    render(<ZgloszeniaWspolpracy />);
    await waitFor(() => expect(screen.getByText(ZGLOSZENIE_NOWE.body)).toBeInTheDocument());
    await uzytkownik.click(screen.getByRole("button", { name: "Odpowiedz na zgłoszenie" }));
    const poleOdpowiedzi = await screen.findByRole("textbox", { name: /^Odpowiedź/ });
    await uzytkownik.type(poleOdpowiedzi, "x");
    await uzytkownik.click(screen.getByRole("button", { name: "Odpowiedz" }));

    expect(await screen.findByText("Zgłoszenie nie istnieje.")).toBeInTheDocument();
    await waitFor(() => expect(pobierzZgloszeniaAdministracji).toHaveBeenCalledTimes(2));
  });
});

describe("ZgloszeniaWspolpracy — odmowa przy odczycie", () => {
  it("403 forbidden przy odczycie → odmowa z nazwą roli, brak listy i przycisków odpowiedzi", async () => {
    pobierzZgloszeniaAdministracji.mockRejectedValue(
      new ApiError({ status: 403, code: "forbidden", message: "Nie masz dostępu do tej sekcji." }),
    );

    const { container } = render(<ZgloszeniaWspolpracy />);

    await waitFor(() => expect(container.textContent).toContain("administracji"));
    expect(screen.queryByRole("list", { name: "Zgłoszenia współpracy" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Odpowiedz na zgłoszenie" })).toBeNull();
  });
});
