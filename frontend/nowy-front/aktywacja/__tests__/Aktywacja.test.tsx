import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { straznikHostow } from "../../wspolne/strona-publiczna/__tests__/hosty";

/**
 * Ekran aktywacji: zawieszenie (wczytywanie), brak sesji, wiązanie, sukces,
 * odmowa, błąd ostateczny, awaria z ponowieniem — te same wywołania co
 * `app/aktywacja/page.tsx` i zero innych hostów.
 */

const getSession = vi.fn();
const signIn = vi.fn();
vi.mock("next-auth/react", () => ({
  getSession: (...a: unknown[]) => getSession(...a),
  signIn: (...a: unknown[]) => signIn(...a),
}));

const replace = vi.fn();
let zapytanie = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  useSearchParams: () => new URLSearchParams(zapytanie),
}));

const api = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: (...a: unknown[]) => api(...a),
}));

const homeForRole = vi.fn((rola: string | undefined) => `/dom/${rola}`);
vi.mock("@/lib/home-by-role", () => ({ homeForRole: (r: string | undefined) => homeForRole(r) }));

const { ApiError } = await import("@/lib/api");
const { Aktywacja } = await import("../Aktywacja");

const TOKEN = "demo-token-aktywacji";
const SESJA = { user: { id: "17" } };
let straznik: ReturnType<typeof straznikHostow>;

async function pokaz() {
  let wynik: ReturnType<typeof render> | undefined;
  await act(async () => {
    wynik = render(<Aktywacja />);
  });
  return wynik!;
}

function blad(status: number, message: string) {
  return new ApiError({ status, code: "x", message });
}

beforeEach(() => {
  getSession.mockReset();
  signIn.mockReset();
  replace.mockReset();
  api.mockReset();
  homeForRole.mockClear();
  zapytanie = `token=${TOKEN}`;
  straznik = straznikHostow();
});

afterEach(() => {
  expect(straznik.adresy).toEqual([]);
  straznik.przywroc();
  cleanup();
});

describe("aktywacja — stany", () => {
  it("sprawdzanie sesji: komunikat oczekiwania ogłaszany jako status; jeden h1", async () => {
    getSession.mockReturnValue(new Promise(() => {}));
    const { container } = await pokaz();
    expect(screen.getByRole("status").textContent).toContain("Trwa łączenie konta…");
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Aktywacja konta" })).toBeTruthy();
  });

  it("brak sesji: przycisk logowania wraca na ten sam adres z tym samym tokenem", async () => {
    zapytanie = "token=a%2Fb%3Fc";
    getSession.mockResolvedValue(null);
    await pokaz();
    expect(screen.getByText("Zaloguj się przez konto Niepodzielni, aby powiązać je z tym zaproszeniem.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Zaloguj przez konto Niepodzielni" }));
    expect(signIn).toHaveBeenCalledWith("keycloak", { callbackUrl: "/aktywacja?token=a%2Fb%3Fc" });
    expect(api).not.toHaveBeenCalled();
  });

  it("sesja: POST /sso/powiaz z tokenem i lądowanie wg roli z odpowiedzi", async () => {
    getSession.mockResolvedValue(SESJA);
    api.mockResolvedValue({ role: "student" });
    await pokaz();
    expect(api).toHaveBeenCalledWith("/sso/powiaz", { method: "POST", body: { token: TOKEN } });
    expect(homeForRole).toHaveBeenCalledWith("student");
    expect(replace).toHaveBeenCalledWith("/dom/student");
    expect(screen.getByText("Konto powiązane. Przekierowuję…")).toBeTruthy();
  });

  it("token nieprawidłowy (422): dokładnie komunikat serwera, bez ponowienia", async () => {
    getSession.mockResolvedValue(SESJA);
    api.mockRejectedValue(blad(422, "Link aktywacyjny jest nieprawidłowy albo został już wykorzystany."));
    await pokaz();
    expect(screen.getByRole("alert").textContent).toContain(
      "Link aktywacyjny jest nieprawidłowy albo został już wykorzystany.",
    );
    expect(screen.queryByRole("button", { name: "Spróbuj ponownie" })).toBeNull();
  });

  it("odmowa (403): komunikat serwera pod nagłówkiem „Brak dostępu”", async () => {
    getSession.mockResolvedValue(SESJA);
    api.mockRejectedValue(blad(403, "Konto jest zablokowane."));
    await pokaz();
    expect(screen.getByRole("heading", { level: 2, name: "Brak dostępu" })).toBeTruthy();
    expect(screen.getByText("Konto jest zablokowane.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("konflikt (409): komunikat serwera", async () => {
    getSession.mockResolvedValue(SESJA);
    api.mockRejectedValue(blad(409, "To konto jest już powiązane z innym kontem Niepodzielni."));
    await pokaz();
    expect(screen.getByText("To konto jest już powiązane z innym kontem Niepodzielni.")).toBeTruthy();
  });

  it("brak tokenu w adresie: komunikat lokalny, bez wołania API", async () => {
    zapytanie = "";
    getSession.mockResolvedValue(SESJA);
    await pokaz();
    expect(screen.getByRole("alert").textContent).toContain("Link aktywacyjny nie zawiera tokenu.");
    expect(api).not.toHaveBeenCalled();
  });

  it("401 przy wiązaniu: ekran niczego nie dorysowuje", async () => {
    getSession.mockResolvedValue(SESJA);
    api.mockRejectedValue(blad(401, "x"));
    await pokaz();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Trwa łączenie konta…")).toBeTruthy();
  });

  it("błąd serwera (500): komunikat i ponowienie wysyła kolejne żądanie", async () => {
    getSession.mockResolvedValue(SESJA);
    api.mockRejectedValueOnce(blad(500, "Błąd serwera."));
    await pokaz();
    expect(screen.getByRole("alert").textContent).toContain("Błąd serwera.");
    api.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    });
    expect(api).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("alert").textContent).toContain("Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę.");
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeTruthy();
  });

  it("żadnego pola hasła", async () => {
    getSession.mockResolvedValue(null);
    const { container } = await pokaz();
    expect(container.querySelector("input")).toBeNull();
  });
});
