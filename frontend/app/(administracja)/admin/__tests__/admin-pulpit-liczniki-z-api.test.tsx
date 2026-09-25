import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

/**
 * Pulpit administracji pokazuje liczniki i kolejki dokładnie tak, jak podało
 * je API (`/admin/dashboard`) — bez przeliczania po stronie przeglądarki.
 *
 * Liczby w atrapie są parami różne, a wartości, które powstałyby z
 * przeliczenia (sumy, różnice), nie pokrywają się z żadną z nich — więc
 * pojawienie się którejkolwiek z nich na ekranie znaczy, że front liczy sam.
 */

const api = vi.fn();

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => api(...args),
  ApiError,
}));

const { default: AdminHomePage } = await import("@/app/(administracja)/admin/page");

const dashboard = {
  counters: { participants: 137, completed: 29, certificates: 23 },
  queues: [
    { key: "applications", count: 11, link: "/admin/uczestniczki" },
    { key: "internship_entries", count: 17, link: "/admin/staz" },
    { key: "profiles", count: 3, link: "/admin/profile" },
    { key: "questions", count: 5, link: "/prowadzacy/pytania" },
  ],
};

const counters: [string, number][] = [
  ["Uczestniczki i uczestnicy", 137],
  ["Ukończenia programu", 29],
  ["Wydane certyfikaty", 23],
];

const queues: [string, number, string][] = [
  ["Zgłoszenia rekrutacyjne", 11, "/admin/uczestniczki"],
  ["Wpisy stażu do akceptacji", 17, "/admin/staz"],
  ["Profile psychologa do decyzji", 3, "/admin/profile"],
  ["Pytania bez odpowiedzi", 5, "/prowadzacy/pytania"],
];

// Wartości, które dałoby przeliczenie po stronie frontu.
const derived = [
  137 + 29 + 23, // suma liczników
  137 - 29, // uczestnicy bez ukończeń
  11 + 17 + 3 + 5, // suma kolejek
];

beforeEach(() => {
  api.mockReset();
});

describe("AdminHomePage: liczby z API bez przeliczania", () => {
  it("każdy licznik stoi przy swojej etykiecie z dokładnie tą liczbą, którą podało API", async () => {
    api.mockResolvedValue(dashboard);
    render(<AdminHomePage />);

    await screen.findByText("Uczestniczki i uczestnicy");

    for (const [label, value] of counters) {
      const card = screen.getByText(label).parentElement as HTMLElement;
      expect(within(card).getByText(String(value))).toBeInTheDocument();
    }
  });

  it("każda kolejka prowadzi pod swój adres z liczbą z API", async () => {
    api.mockResolvedValue(dashboard);
    render(<AdminHomePage />);

    await screen.findByText("Zgłoszenia rekrutacyjne");

    for (const [label, value, link] of queues) {
      const row = screen.getByText(label).closest("a") as HTMLAnchorElement;
      expect(row).toHaveAttribute("href", link);
      expect(within(row).getByText(String(value))).toBeInTheDocument();
    }
  });

  it("noga negatywna: na ekranie nie ma żadnej wartości powstałej z przeliczenia", async () => {
    api.mockResolvedValue(dashboard);
    render(<AdminHomePage />);

    await screen.findByText("Uczestniczki i uczestnicy");

    for (const value of derived) {
      expect(screen.queryByText(String(value))).not.toBeInTheDocument();
    }
    // Siedem liczb z API, każda dokładnie raz.
    for (const value of [137, 29, 23, 11, 17, 3, 5]) {
      expect(screen.getAllByText(String(value))).toHaveLength(1);
    }
  });
});
