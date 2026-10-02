import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { dwaTerminyPrawdziwyKsztalt } from "./fixture";

/**
 * Świadek ekranu `#/admin/superwizje` (`AdminSupervisionSlots`), pisany z
 * kryterium: „Zapis na termin, odmowa przy braku miejsc,
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

describe("AdminSupervisionSlots — termin odwołany", () => {
  it("odwołany termin ma etykietę „Odwołany” zamiast liczby miejsc; zaplanowany jej nie ma", async () => {
    const odpowiedz = dwaTerminyPrawdziwyKsztalt(null);
    const [zaplanowany, odwolany] = odpowiedz.data;
    odpowiedz.data = [
      { ...zaplanowany, status: "scheduled", cancelled_at: null },
      { ...odwolany, status: "cancelled", cancelled_at: "2026-09-11T08:00:00Z", active_signups_count: 0, available_seats: 6, signups: [] },
    ] as unknown as typeof odpowiedz.data;
    fetchAdminSupervisionSlots.mockResolvedValue(odpowiedz);
    render(<AdminSupervisionSlots />);

    const kartaOdwolanego = await screen.findByTestId("admin-slot-2");
    expect(kartaOdwolanego).toHaveTextContent("Odwołany");
    expect(kartaOdwolanego).toHaveTextContent("Termin odwołany. Zapisy zostały zwolnione.");
    expect(kartaOdwolanego).not.toHaveTextContent("0 / 6");

    const kartaZaplanowanego = screen.getByTestId("admin-slot-1");
    expect(kartaZaplanowanego).not.toHaveTextContent("Odwołany");
    expect(kartaZaplanowanego).toHaveTextContent("1 / 6");
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
