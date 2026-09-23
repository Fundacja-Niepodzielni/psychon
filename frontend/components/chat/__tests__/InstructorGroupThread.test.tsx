import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek wątku grupowego prowadzącego („prowadzący prowadzi wątek
 * grupowy"). Backend jest gotowy od dawna, ten test jest
 * pierwszym dowodem, że ekran w ogóle istnieje i woła właściwe trasy
 * (`GET /threads`, `GET /threads/{id}`, `POST /threads/{id}/messages`).
 */

const api = vi.fn();
const apiPaged = vi.fn();

class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  ApiError,
}));

const { default: InstructorGroupThread } = await import(
  "@/components/chat/InstructorGroupThread"
);

const grupowyWatek = {
  id: 41,
  type: "group" as const,
  supervisor: { id: 7, first_name: "Anna", last_name: "Prowadząca" },
  volunteer: null,
  updated_at: "2026-09-10T12:00:00Z",
};

const indywidualnyWatek = {
  id: 42,
  type: "individual" as const,
  supervisor: { id: 7, first_name: "Anna", last_name: "Prowadząca" },
  volunteer: { id: 9, first_name: "Kasia", last_name: "Wolna" },
  updated_at: "2026-09-11T09:00:00Z",
};

const wiadomosc = {
  id: 101,
  thread_id: 41,
  sender: { id: 9, first_name: "Kasia", last_name: "Wolna" },
  body: "Cześć grupo!",
  created_at: "2026-09-10T12:00:00Z",
};

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
});

describe("InstructorGroupThread", () => {
  it("noga pozytywna: listuje wątki grupowe (pomija indywidualne), otwiera wątek i pokazuje wiadomości", async () => {
    apiPaged.mockImplementation((path: string) => {
      if (path === "/threads") {
        return Promise.resolve({ data: [grupowyWatek, indywidualnyWatek] });
      }
      if (path === "/threads/41") {
        return Promise.resolve({
          data: [wiadomosc],
          meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 },
        });
      }
      throw new Error("nieoczekiwana ścieżka: " + path);
    });

    render(<InstructorGroupThread />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Otwórz wątek" })).toBeInTheDocument(),
    );
    // Dokładnie jeden wątek grupowy — indywidualny (42) nie trafia na listę.
    expect(screen.getAllByRole("button", { name: "Otwórz wątek" })).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Otwórz wątek" }));

    await waitFor(() => expect(screen.getByText("Cześć grupo!")).toBeInTheDocument());
    expect(apiPaged).toHaveBeenCalledWith("/threads");
    expect(apiPaged).toHaveBeenCalledWith("/threads/41");
  });

  it("noga pozytywna: wysłanie wiadomości woła właściwy endpoint z treścią i dopisuje wiadomość do listy", async () => {
    apiPaged.mockImplementation((path: string) => {
      if (path === "/threads") return Promise.resolve({ data: [grupowyWatek] });
      if (path === "/threads/41") return Promise.resolve({ data: [wiadomosc] });
      throw new Error("nieoczekiwana ścieżka: " + path);
    });
    const nowaWiadomosc = {
      id: 102,
      thread_id: 41,
      sender: { id: 7, first_name: "Anna", last_name: "Prowadząca" },
      body: "Do zobaczenia na zajęciach.",
      created_at: "2026-09-12T08:00:00Z",
    };
    api.mockResolvedValue(nowaWiadomosc);

    render(<InstructorGroupThread />);

    await userEvent.click(await screen.findByRole("button", { name: "Otwórz wątek" }));
    await waitFor(() => expect(screen.getByText("Cześć grupo!")).toBeInTheDocument());

    await userEvent.type(
      screen.getByLabelText("Wiadomość do grupy"),
      "Do zobaczenia na zajęciach.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Wyślij wiadomość" }));

    await waitFor(() =>
      expect(screen.getByText("Do zobaczenia na zajęciach.")).toBeInTheDocument(),
    );
    expect(api).toHaveBeenCalledWith("/threads/41/messages", {
      method: "POST",
      body: { body: "Do zobaczenia na zajęciach." },
    });
    // Wiadomość poprzednia zostaje — dopisanie, nie zastąpienie listy.
    expect(screen.getByText("Cześć grupo!")).toBeInTheDocument();
  });

  it("noga negatywna: błąd wczytania listy wątków pokazuje komunikat błędu", async () => {
    apiPaged.mockRejectedValue(new ApiError(500, "server_error", "Wątek grupowy niedostępny."));

    render(<InstructorGroupThread />);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Wątek grupowy niedostępny."),
    );
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Otwórz wątek" })).not.toBeInTheDocument();
  });

  it("noga negatywna: 403 przy wczytaniu listy pokazuje odmowę zamiast błędu serwera", async () => {
    apiPaged.mockRejectedValue(new ApiError(403, "forbidden", "Brak uprawnień."));

    render(<InstructorGroupThread />);

    await waitFor(() => expect(screen.getByText("Brak dostępu")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("noga negatywna: błąd wysyłki pokazuje komunikat i nie czyści treści szkicu", async () => {
    apiPaged.mockImplementation((path: string) => {
      if (path === "/threads") return Promise.resolve({ data: [grupowyWatek] });
      if (path === "/threads/41") return Promise.resolve({ data: [] });
      throw new Error("nieoczekiwana ścieżka: " + path);
    });
    api.mockRejectedValue(new ApiError(500, "server_error", "Nie udało się wysłać wiadomości."));

    render(<InstructorGroupThread />);

    await userEvent.click(await screen.findByRole("button", { name: "Otwórz wątek" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Wiadomość do grupy")).toBeInTheDocument(),
    );

    await userEvent.type(screen.getByLabelText("Wiadomość do grupy"), "Próba");
    await userEvent.click(screen.getByRole("button", { name: "Wyślij wiadomość" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się wysłać wiadomości."),
    );
  });
});
