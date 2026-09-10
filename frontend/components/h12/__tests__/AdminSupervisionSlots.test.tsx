import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { dwaTerminyPrawdziwyKsztalt } from "./fixture";

/**
 * Świadek ekranu `#/admin/superwizje` (`AdminSupervisionSlots`), pisany z
 * kryterium pozycji 6: „Zapis na termin, odmowa przy braku miejsc,
 * potwierdzenie odbycia widoczne u osoby uczestniczącej i w administracji".
 * Ten plik świadczy wyłącznie o połowie „i w administracji" — zapis i odmowa
 * mają własnych świadków gdzie indziej (ekran uczestnika/prowadzącego).
 *
 * Klient API jest zaślepiony (`vi.mock`), bo mierzymy EKRAN, nie sieć.
 */

const fetchAdminSupervisionSlots = vi.fn();

class ApiError extends Error {
  status: number;
  code: string;
  errors?: Record<string, string[]>;

  constructor(status: number, code: string, message: string, errors?: Record<string, string[]>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

vi.mock("@/lib/api", () => ({
  fetchAdminSupervisionSlots: (...args: unknown[]) => fetchAdminSupervisionSlots(...args),
  ApiError,
}));

const { default: AdminSupervisionSlots } = await import("@/components/h12/AdminSupervisionSlots");

beforeEach(() => {
  fetchAdminSupervisionSlots.mockReset();
});

describe("AdminSupervisionSlots — zawartość", () => {
  it("pokazuje prowadzącego z DRUGIEGO terminu i obecność zapisaną przy nim", async () => {
    fetchAdminSupervisionSlots.mockResolvedValue(dwaTerminyPrawdziwyKsztalt("present"));
    render(<AdminSupervisionSlots />);

    expect(await screen.findByText("Bartek Drugi")).toBeInTheDocument();
    expect(await screen.findByText("Obecność potwierdzona")).toBeInTheDocument();
  });

  it("PERTURBACJA: przy braku obecności ekran NIE pokazuje potwierdzenia — dowód, że test (1) mierzy coś", async () => {
    // Bez tej nogi test wyżej byłby zielony nawet wtedy, gdyby ekran wypisywał
    // „Obecność potwierdzona" na stałe, niezależnie od danych.
    fetchAdminSupervisionSlots.mockResolvedValue(dwaTerminyPrawdziwyKsztalt(null));
    render(<AdminSupervisionSlots />);

    await screen.findByText("Bartek Drugi");
    expect(screen.queryByText("Obecność potwierdzona")).not.toBeInTheDocument();
  });
});

describe("AdminSupervisionSlots — pusto", () => {
  it("pokazuje komunikat po polsku, nie pustą stronę ani tabelę bez wierszy", async () => {
    // Prawdziwa koperta: kontroler zwraca wyłącznie `data` (bez `meta`).
    fetchAdminSupervisionSlots.mockResolvedValue({ data: [] });
    render(<AdminSupervisionSlots />);

    expect(await screen.findByText("Brak terminów superwizji do wyświetlenia.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Terminy superwizji" })).not.toBeInTheDocument();
  });
});

describe("AdminSupervisionSlots — błąd", () => {
  it("pokazuje czytelny komunikat, a nie surową treść błędu technicznego", async () => {
    // Odrzucenie, które NIE jest `ApiError` (np. sieć padła, zanim odpowiedź
    // serwera w ogóle powstała) — dokładnie taki błąd bywa surowy technicznie
    // (nazwa funkcji, ścieżka, JSON), więc to on sprawdza sanityzację ekranu.
    fetchAdminSupervisionSlots.mockRejectedValue(
      new TypeError('fetchAdminSupervisionSlots("/admin/supervision/slots"): Failed to fetch {"status":0}'),
    );
    render(<AdminSupervisionSlots />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Nie udało się wczytać terminów superwizji");

    expect(
      screen.queryByText(/fetchAdminSupervisionSlots|\/admin\/supervision\/slots|Failed to fetch|\{"status"/),
    ).not.toBeInTheDocument();
  });
});
