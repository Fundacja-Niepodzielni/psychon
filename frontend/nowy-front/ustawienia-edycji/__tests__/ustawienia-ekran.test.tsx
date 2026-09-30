import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";

/**
 * Stany ekranu „Ustawienia roku programu” (A-29) na `FormTemplate`:
 * ładowanie, dane, zapis, 422 z polami, odmowa 401/403, brak (404), błąd
 * sieci (odczyt i zapis). Każdy stan: jeden `main` z `id="tresc"` i znacznik
 * szablonu w DOM. Atrapa odpowiedzi ma klucze `EditionResource` z
 * `backend/openapi.json` (próba w `ustawienia-dane.test.ts`).
 */

const api = vi.fn();
const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/api/klient", async (oryginal) => ({
  ...(await oryginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
}));

const { ApiError } = await import("@/lib/api/klient");
const { UstawieniaEdycji } = await import("../UstawieniaEdycji");

const ROK = {
  id: 1,
  name: "Rok programu 2026/27",
  starts_at: "2026-09-01",
  ends_at: "2027-06-30",
  seats_limit: null,
  test_pass_threshold: 80,
  test_attempts_limit: 3,
  internship_hours_required: 72,
  supervision_required_count: 6,
  reliability_threshold: 60,
  lesson_completion_percent: 60,
};

function blad(status: number, code: string, errors?: Record<string, string[]>) {
  return new ApiError({ status, code, message: "Komunikat serwera.", errors });
}

function poczekajNaFormularz() {
  return screen.findByRole("heading", { level: 2, name: "Progi i limity" });
}

function przyciskiGlowne() {
  return Array.from(document.querySelectorAll("button")).filter((b) =>
    b.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)),
  );
}

function sprawdzSzablon(container: HTMLElement) {
  expect(() => jedenMain(container)).not.toThrow();
  expect(container.querySelector("main")?.getAttribute("data-style-id")).toBe("szablon-formularz");
  expect(container.querySelector("#tresc")).toBe(container.querySelector("main"));
}

beforeEach(() => {
  api.mockReset();
  back.mockReset();
});

describe("A-29 — stany w szablonie FormTemplate", () => {
  it("ładowanie: szkielet, jeden main, bez przycisku głównego", () => {
    api.mockReturnValue(new Promise(() => {}));
    const { container } = render(<UstawieniaEdycji />);
    sprawdzSzablon(container);
    expect(container.querySelector("[aria-busy='true']")).toBeTruthy();
    expect(przyciskiGlowne()).toHaveLength(0);
  });

  it("dane: sześć progów, każdy ze zdaniem; jedyny przycisk główny to „Zapisz ustawienia”", async () => {
    api.mockResolvedValue(ROK);
    const { container } = render(<UstawieniaEdycji />);
    await poczekajNaFormularz();
    sprawdzSzablon(container);
    expect(api).toHaveBeenCalledWith("/admin/edition");

    expect(screen.getByLabelText(/^Próg zaliczenia testu/)).toHaveValue(80);
    expect(screen.getByLabelText(/^Liczba podejść do testu/)).toHaveValue(3);
    expect(screen.getByLabelText(/^Wymagana liczba godzin praktyki/)).toHaveValue(72);
    expect(screen.getByLabelText(/^Wymagana liczba obecności na superwizji/)).toHaveValue(6);
    expect(screen.getByLabelText(/^Próg ukończenia lekcji/)).toHaveValue(60);
    // Szósty próg jest w zwijanej sekcji „Czas nauki”.
    await userEvent.setup().click(screen.getByRole("button", { name: /^Czas nauki/ }));
    expect(screen.getByLabelText(/^Próg czasu nauki/)).toHaveValue(60);
    expect(screen.getByText(/to inny próg niż próg czasu nauki/)).toBeInTheDocument();
    expect(screen.getByText(/nie wpływa na ukończenie lekcji/)).toBeInTheDocument();

    const glowne = przyciskiGlowne();
    expect(glowne).toHaveLength(1);
    expect(glowne[0]).toHaveTextContent("Zapisz ustawienia");
  });

  it("błąd sieci przy odczycie: Notice z „Spróbuj ponownie”, ponowienie wczytuje dane", async () => {
    const uzytkownik = userEvent.setup();
    api.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(ROK);
    const { container } = render(<UstawieniaEdycji />);
    await screen.findByRole("alert");
    sprawdzSzablon(container);
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(przyciskiGlowne()).toHaveLength(0);

    await uzytkownik.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    await poczekajNaFormularz();
    expect(api).toHaveBeenCalledTimes(2);
  });

  it.each([403, 401])("odmowa %i przy odczycie: rola w tekście, zero danych w DOM", async (status) => {
    api.mockRejectedValue(blad(status, status === 403 ? "forbidden" : "unauthenticated"));
    const { container } = render(<UstawieniaEdycji />);
    await screen.findByText(/administracji/, { selector: "p" });
    sprawdzSzablon(container);
    expect(container.textContent).toMatch(/administracji/);
    expect(container.textContent).not.toMatch(/Brak dostępu|Nie masz uprawnień/);
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(screen.queryByRole("heading", { name: "Progi i limity" })).toBeNull();
    expect(przyciskiGlowne()).toHaveLength(0);
  });

  it("404 przy odczycie: stan pusty z opisem, bez formularza", async () => {
    api.mockRejectedValue(blad(404, "not_found"));
    const { container } = render(<UstawieniaEdycji />);
    await screen.findByRole("heading", { level: 2, name: "Nie ma aktywnego roku programu" });
    sprawdzSzablon(container);
    expect(container.querySelectorAll("input")).toHaveLength(0);
  });
});

describe("A-29 — zapis", () => {
  it("zmiana progu → PATCH tylko ze zmienionym polem → Toast „Ustawienia zostały zapisane.”", async () => {
    const uzytkownik = userEvent.setup();
    api.mockResolvedValueOnce(ROK).mockResolvedValueOnce({ ...ROK, test_pass_threshold: 75 });
    const { container } = render(<UstawieniaEdycji />);
    await poczekajNaFormularz();

    const pole = screen.getByLabelText(/^Próg zaliczenia testu/);
    await uzytkownik.clear(pole);
    await uzytkownik.type(pole, "75");
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz ustawienia" }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(api).toHaveBeenLastCalledWith("/admin/edition", { method: "PATCH", body: { test_pass_threshold: 75 } });
    expect(await screen.findByRole("status")).toHaveTextContent("Ustawienia zostały zapisane.");
    expect(screen.getByLabelText(/^Próg zaliczenia testu/)).toHaveValue(75);
    sprawdzSzablon(container);
    expect(przyciskiGlowne()).toHaveLength(1);
  });

  it("bez zmian: żadnego PATCH, Toast mówi, że nie ma czego zapisać", async () => {
    const uzytkownik = userEvent.setup();
    api.mockResolvedValue(ROK);
    render(<UstawieniaEdycji />);
    await poczekajNaFormularz();
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz ustawienia" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Nie ma zmian do zapisania.");
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("422 zakresu progu: błąd pod polem i w podsumowaniu, wpisana wartość zostaje, jeden main", async () => {
    const uzytkownik = userEvent.setup();
    api.mockResolvedValueOnce(ROK).mockRejectedValueOnce(
      blad(422, "validation_failed", {
        test_pass_threshold: ["Próg zaliczenia testu musi mieścić się w zakresie 0-100%."],
      }),
    );
    const { container } = render(<UstawieniaEdycji />);
    await poczekajNaFormularz();

    const pole = screen.getByLabelText(/^Próg zaliczenia testu/);
    await uzytkownik.clear(pole);
    await uzytkownik.type(pole, "150");
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz ustawienia" }));

    expect(api).toHaveBeenLastCalledWith("/admin/edition", { method: "PATCH", body: { test_pass_threshold: 150 } });
    await waitFor(() =>
      expect(screen.getAllByText("Próg zaliczenia testu musi mieścić się w zakresie 0-100%.").length).toBeGreaterThan(0),
    );
    expect(screen.getAllByRole("alert").some((w) => /Popraw zaznaczone pola/.test(w.textContent ?? ""))).toBe(true);
    expect(screen.getByLabelText(/^Próg zaliczenia testu/)).toHaveValue(150);
    sprawdzSzablon(container);
    expect(przyciskiGlowne()).toHaveLength(1);
  });

  it("422 na progu w zwijanej sekcji: sekcja „Czas nauki” rozwija się z błędem", async () => {
    const uzytkownik = userEvent.setup();
    api.mockResolvedValueOnce(ROK).mockRejectedValueOnce(
      blad(422, "validation_failed", {
        reliability_threshold: ["Próg rzetelności musi mieścić się w zakresie 0-100%."],
      }),
    );
    render(<UstawieniaEdycji />);
    await poczekajNaFormularz();
    await uzytkownik.click(screen.getByRole("button", { name: /^Czas nauki/ }));
    const pole = screen.getByLabelText(/^Próg czasu nauki/);
    await uzytkownik.clear(pole);
    await uzytkownik.type(pole, "101");
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz ustawienia" }));
    await waitFor(() => expect(screen.getByLabelText(/^Próg czasu nauki/)).toHaveAttribute("aria-invalid", "true"));
  });

  it("422 na progu po ręcznym zwinięciu sekcji „Czas nauki”: sekcja rozwinięta, komunikat przy polu widoczny", async () => {
    const uzytkownik = userEvent.setup();
    const komunikat = "Próg rzetelności musi mieścić się w zakresie 0-100%.";
    api.mockResolvedValueOnce(ROK).mockRejectedValueOnce(
      blad(422, "validation_failed", { reliability_threshold: [komunikat] }),
    );
    render(<UstawieniaEdycji />);
    await poczekajNaFormularz();
    const naglowek = screen.getByRole("button", { name: /^Czas nauki/ });
    await uzytkownik.click(naglowek);
    const pole = screen.getByLabelText(/^Próg czasu nauki/);
    await uzytkownik.clear(pole);
    await uzytkownik.type(pole, "101");
    await uzytkownik.click(naglowek);
    expect(naglowek).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText(/^Próg czasu nauki/)).toBeNull();

    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz ustawienia" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /^Czas nauki/ })).toHaveAttribute("aria-expanded", "true"));
    expect(screen.getByLabelText(/^Próg czasu nauki/)).toBeVisible();
    expect(screen.getByLabelText(/^Próg czasu nauki/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/^Próg czasu nauki/)).toHaveValue(101);
    expect(screen.getAllByText(komunikat).length).toBeGreaterThan(0);
  });

  it("błąd sieci przy zapisie: Notice z „Spróbuj ponownie”, formularz zachowany, ponowienie zapisuje", async () => {
    const uzytkownik = userEvent.setup();
    api
      .mockResolvedValueOnce(ROK)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ ...ROK, test_attempts_limit: 5 });
    render(<UstawieniaEdycji />);
    await poczekajNaFormularz();
    const pole = screen.getByLabelText(/^Liczba podejść do testu/);
    await uzytkownik.clear(pole);
    await uzytkownik.type(pole, "5");
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz ustawienia" }));

    await screen.findByRole("alert");
    expect(screen.getByLabelText(/^Liczba podejść do testu/)).toHaveValue(5);
    await uzytkownik.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Ustawienia zostały zapisane.");
    expect(api).toHaveBeenCalledTimes(3);
  });

  it("403 przy zapisie: odmowa z rolą, zero pól w DOM", async () => {
    const uzytkownik = userEvent.setup();
    api.mockResolvedValueOnce(ROK).mockRejectedValueOnce(blad(403, "forbidden"));
    const { container } = render(<UstawieniaEdycji />);
    await poczekajNaFormularz();
    const pole = screen.getByLabelText(/^Liczba podejść do testu/);
    await uzytkownik.clear(pole);
    await uzytkownik.type(pole, "5");
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz ustawienia" }));
    await screen.findByText(/administracji/, { selector: "p" });
    expect(container.querySelectorAll("input")).toHaveLength(0);
    sprawdzSzablon(container);
  });

  it("„Przywróć zapisane” cofa niezapisane zmiany bez wołania serwera", async () => {
    const uzytkownik = userEvent.setup();
    api.mockResolvedValue(ROK);
    render(<UstawieniaEdycji />);
    await poczekajNaFormularz();
    const pole = screen.getByLabelText(/^Próg zaliczenia testu/);
    await uzytkownik.clear(pole);
    await uzytkownik.type(pole, "10");
    await uzytkownik.click(screen.getByRole("button", { name: "Przywróć zapisane" }));
    expect(screen.getByLabelText(/^Próg zaliczenia testu/)).toHaveValue(80);
    expect(api).toHaveBeenCalledTimes(1);
  });
});
