import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { expectLabelledControlsAndImages } from "@/app/(uczestnik)/panel/__tests__/a11y-smoke";

/**
 * Dotychczasowa treść trasy `/panel/po-programie` (`StaraTresc`), renderowana
 * wprost, bez bramki przełączenia: `GET /me` decyduje między kartą „Program
 * ukończony” (z odnośnikami) a kartą oczekiwania; błąd serwera daje stan błędu
 * z ponowieniem, odmowa 403 — stan bez ponowienia i bez danych.
 */

const apiMock = vi.fn();

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return { ...actual, api: (...args: unknown[]) => apiMock(...args) };
});

const { ApiError } = await import("@/lib/api");
const { default: StaraTresc } = await import("../StaraTresc");

async function renderTresc() {
  let wynik: ReturnType<typeof render> | undefined;
  await act(async () => {
    wynik = render(<StaraTresc />);
  });
  return wynik!;
}

beforeEach(() => {
  apiMock.mockReset();
});

describe("StaraTresc", () => {
  it("ładowanie: nagłówek ekranu i status wczytywania, zapytanie o /me", async () => {
    apiMock.mockReturnValue(new Promise(() => {}));
    await renderTresc();

    expect(screen.getByRole("heading", { level: 1, name: "Po programie" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Wczytywanie stanu programu…" })).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith("/me");
  });

  it("błąd serwera: komunikat z koperty i przycisk „Spróbuj ponownie”, który wczytuje ekran ponownie", async () => {
    apiMock.mockRejectedValueOnce(new ApiError({ status: 500, code: "server_error", message: "Serwer nie odpowiada." }));
    await renderTresc();

    expect(screen.getByRole("alert")).toHaveTextContent("Serwer nie odpowiada.");
    const ponow = screen.getByRole("button", { name: "Spróbuj ponownie" });

    apiMock.mockResolvedValueOnce({ role: "volunteer", program_completed_at: "2026-09-20T10:00:00Z" });
    await act(async () => {
      ponow.click();
    });
    expect(await screen.findByText("Program ukończony")).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  it("błąd sieci bez koperty: komunikat ogólny i ponowienie", async () => {
    apiMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await renderTresc();

    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się wczytać ekranu. Spróbuj ponownie.");
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();
  });

  it("odmowa 403: bez ponowienia, bez karty programu i bez odnośników", async () => {
    apiMock.mockRejectedValue(new ApiError({ status: 403, code: "forbidden", message: "Odmowa." }));
    await renderTresc();

    expect(screen.queryByRole("button", { name: "Spróbuj ponownie" })).not.toBeInTheDocument();
    expect(screen.queryByText("Program ukończony")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Twoje dokumenty" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Certyfikat" })).not.toBeInTheDocument();
  });

  it("program nieukończony: karta oczekiwania, bez odnośników do certyfikatu", async () => {
    apiMock.mockResolvedValue({ role: "volunteer", program_completed_at: null });
    await renderTresc();

    expect(screen.getByText("Ekran będzie dostępny po ukończeniu programu.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Certyfikat" })).not.toBeInTheDocument();
  });

  it("program ukończony, wolontariusz: karta z odnośnikami do dokumentów, kursów i certyfikatu", async () => {
    apiMock.mockResolvedValue({ role: "volunteer", program_completed_at: "2026-09-20T10:00:00Z" });
    await renderTresc();

    expect(screen.getByText("Program ukończony")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Twoje dokumenty" })).toHaveAttribute("href", "/panel/dokumenty");
    expect(screen.getByRole("link", { name: "Kursy" })).toHaveAttribute("href", "/panel/kursy");
    expect(screen.getByRole("link", { name: "Certyfikat" })).toHaveAttribute("href", "/panel/certyfikat");
  });

  it("program ukończony, student: odnośniki bez certyfikatu", async () => {
    apiMock.mockResolvedValue({ role: "student", program_completed_at: "2026-09-20T10:00:00Z" });
    await renderTresc();

    expect(screen.getByText("Program ukończony")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Twoje dokumenty" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Certyfikat" })).not.toBeInTheDocument();
  });

  it("po załadowaniu: każde pole i obraz ma nazwę dostępną", async () => {
    apiMock.mockResolvedValue({ role: "volunteer", program_completed_at: "2026-09-20T10:00:00Z" });
    const { container } = await renderTresc();

    expectLabelledControlsAndImages(container);
    for (const odnosnik of screen.getAllByRole("link")) expect(odnosnik).toHaveAccessibleName();
  });
});
