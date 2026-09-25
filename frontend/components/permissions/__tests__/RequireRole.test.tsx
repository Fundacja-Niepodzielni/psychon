import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import RequireRole from "@/components/permissions/RequireRole";
import { axeViolations } from "../../__tests__/axe-helper";

const { api, ApiError } = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return { api: vi.fn(), ApiError };
});

vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => api(...args),
  ApiError,
}));

beforeEach(() => {
  api.mockReset();
});

/**
 * `RequireRole` renderuje się PRZED szablonem strony (ten dopiero
 * niesie `h1` przez `PageHeader`), więc każdy jego własny stan pośredni
 * (ładowanie roli, błąd połączenia z `/me`) jest ekranem, na którym ktoś
 * realnie może wylądować — i musi mieć dokładnie jeden `h1`, tak samo jak
 * stan „denied" (`Forbidden403`) już miał.
 */
describe("RequireRole — h1 dla każdego wysterowanego stanu", () => {
  it("stan ładowania (przed rozstrzygnięciem /me) niesie h1 „Wczytywanie…”", async () => {
    api.mockImplementation(() => new Promise(() => {}));

    render(
      <RequireRole allowedRoles={["super_admin"]}>
        <p>treść panelu</p>
      </RequireRole>,
    );

    const naglowki = screen.getAllByRole("heading", { level: 1 });
    expect(naglowki).toHaveLength(1);
    expect(naglowki[0]).toHaveTextContent("Wczytywanie…");
  });

  it("stan błędu (backend nieosiągalny) niesie h1 „Błąd połączenia”", async () => {
    api.mockRejectedValue(new Error("network down"));

    render(
      <RequireRole allowedRoles={["super_admin"]}>
        <p>treść panelu</p>
      </RequireRole>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Nie udało się połączyć z serwerem/)).toBeInTheDocument();
    });

    const naglowki = screen.getAllByRole("heading", { level: 1 });
    expect(naglowki).toHaveLength(1);
    expect(naglowki[0]).toHaveTextContent("Błąd połączenia");
  });

  it("stan odmowy (rola spoza listy) niesie dokładnie jeden h1 (Forbidden403 — bez regresji)", async () => {
    api.mockResolvedValue({ role: "student" });

    render(
      <RequireRole allowedRoles={["super_admin"]}>
        <p>treść panelu</p>
      </RequireRole>,
    );

    await waitFor(() => {
      expect(screen.getByText("Brak dostępu")).toBeInTheDocument();
    });

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("stan dozwolony renderuje treść panelu (bez własnego opakowania h1 — nagłówek dostarcza szablon strony)", async () => {
    api.mockResolvedValue({ role: "super_admin" });

    render(
      <RequireRole allowedRoles={["super_admin"]}>
        <p>treść panelu</p>
      </RequireRole>,
    );

    await waitFor(() => {
      expect(screen.getByText("treść panelu")).toBeInTheDocument();
    });
  });

  it("axe: 0 naruszeń w stanie ładowania i w stanie błędu", async () => {
    api.mockImplementation(() => new Promise(() => {}));
    const { container: ladowanie } = render(
      <RequireRole allowedRoles={["super_admin"]}>
        <p>treść panelu</p>
      </RequireRole>,
    );
    expect(await axeViolations(ladowanie)).toEqual([]);

    api.mockRejectedValue(new Error("network down"));
    const { container: blad } = render(
      <RequireRole allowedRoles={["super_admin"]}>
        <p>treść panelu</p>
      </RequireRole>,
    );
    await waitFor(() => {
      expect(screen.getByText(/Nie udało się połączyć z serwerem/)).toBeInTheDocument();
    });
    expect(await axeViolations(blad)).toEqual([]);
  });
});
