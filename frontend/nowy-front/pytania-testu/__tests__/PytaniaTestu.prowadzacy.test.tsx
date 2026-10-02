import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ID_TESTU, pytania } from "./atrapy";

/**
 * Ten sam ekran w panelu prowadzącego: te same żądania co w panelu
 * administracji, okruszki i powrót do kursów prowadzącego. Kto może co,
 * rozstrzyga serwer — dziś odpowiada prowadzącemu odmową, a ekran pokazuje
 * wtedy wspólny ekran odmowy.
 */

const pobierzPytania = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/nowy-front/prowadzacy/testy/10/pytania",
}));

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: () => Promise.reject(new TypeError("Brak sieci w teście")),
}));

vi.mock("../dane", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../dane")>()),
  pobierzPytania: (...args: unknown[]) => pobierzPytania(...args),
}));

const { ApiError } = await import("@/lib/api/klient");
const { PytaniaTestu } = await import("../PytaniaTestu");

beforeEach(() => {
  pobierzPytania.mockReset();
  push.mockReset();
});

describe("panel prowadzącego", () => {
  it("odmowa serwera: wspólny ekran odmowy z powrotem do kursów prowadzącego, to samo żądanie co administracja", async () => {
    const uzytkownik = userEvent.setup();
    pobierzPytania.mockRejectedValue(new ApiError({ status: 403, code: "forbidden", message: "Nie masz dostępu do tego zasobu." }));
    render(<PytaniaTestu idTestu={String(ID_TESTU)} panel="prowadzacy" />);

    expect(await screen.findByRole("heading", { level: 2, name: "Nie masz dostępu do tego ekranu" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Pytania testu" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kursy" })).toHaveAttribute("href", "/prowadzacy/kursy");
    expect(pobierzPytania).toHaveBeenCalledWith(ID_TESTU);
    await uzytkownik.click(screen.getByRole("button", { name: "Wróć do kursów" }));
    expect(push).toHaveBeenCalledWith("/prowadzacy/kursy");
  });

  it("gdy serwer wpuści, lista jest ta sama; okruszek „Kurs” prowadzi do kursu z parametru adresu", async () => {
    pobierzPytania.mockResolvedValue(pytania());
    render(<PytaniaTestu idTestu={String(ID_TESTU)} panel="prowadzacy" idKursu="2" />);
    await waitFor(() => expect(screen.getByRole("heading", { level: 3, name: "Pytanie 1" })).toBeInTheDocument());

    expect(screen.getByRole("link", { name: "Kurs" })).toHaveAttribute("href", "/prowadzacy/kursy/2");
    expect(screen.getByRole("button", { name: "Edytuj pytanie 3" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Dodaj pytanie" })).toBeInTheDocument();
  });

  it("nie ma testu: powrót do kursu z parametru adresu", async () => {
    const uzytkownik = userEvent.setup();
    pobierzPytania.mockRejectedValue(new ApiError({ status: 404, code: "not_found", message: "Nie znaleziono zasobu." }));
    render(<PytaniaTestu idTestu={String(ID_TESTU)} panel="prowadzacy" idKursu="2" />);
    await uzytkownik.click(await screen.findByRole("button", { name: "Wróć do kursu" }));
    expect(push).toHaveBeenCalledWith("/prowadzacy/kursy/2");
  });

  it("niepoprawny numer kursu w adresie jest pomijany", async () => {
    pobierzPytania.mockResolvedValue([]);
    render(<PytaniaTestu idTestu={String(ID_TESTU)} panel="prowadzacy" idKursu="../admin" />);
    await screen.findByRole("heading", { level: 2, name: "Ten test nie ma jeszcze pytań" });
    expect(screen.queryByRole("link", { name: "Kurs" })).toBeNull();
  });
});
