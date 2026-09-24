import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

/**
 * Świadek `LessonPlayer` (`components/lesson/LessonPlayer.tsx`) — dziś bez
 * żadnej próby. Zachowanie „wznów od miejsca, w którym skończyłaś" stało
 * wyłącznie na komentarzu w kodzie (linie 255–258); tu jest zmierzone:
 *
 * - lekcja z zapisaną pozycją startuje odtwarzacz od tej pozycji (nie od 0),
 * - zapis postępu niesie pozycję Z ODTWARZACZA (nie stałą z zamknięcia),
 * - nieudany zapis nie kasuje wczytanej treści lekcji — ekran zostaje,
 *   widać komunikat "Postęp nie został zapisany",
 * - atrapa API jest świadoma argumentu `id` (inaczej sama próba niczego by
 *   nie mierzyła).
 *
 * Klient API jest zaślepiony (`vi.mock`) — przedmiotem pomiaru jest EKRAN i
 * to, co realny `VideoPlayer` (NIE zaślepiony) robi z propsami, które od
 * ekranu dostaje.
 */

class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const apiMock = vi.fn();

vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => apiMock(...args),
  ApiError,
}));

const { default: LessonPlayer } = await import("@/components/lesson/LessonPlayer");

function lekcja(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 5,
    title: "Lekcja o oddechu",
    description: "Krótkie ćwiczenie oddechowe.",
    duration_seconds: 600,
    position_seconds: 120,
    watched_seconds: 60,
    active_seconds: 50,
    is_completed: false,
    completable: false,
    completable_at_percent: 60,
    ...overrides,
  };
}

beforeEach(() => {
  apiMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

async function przesun(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Przesuwa zegar sekunda po sekundzie, żeby React zdążył scommitować efekt
 * synchronizujący `positionRef` między kolejnymi tyknięciami zegara odtwarzacza
 * — dokładnie tak, jak dzieje się to w przeglądarce (tyknięcia oddzielone
 * realnym czasem, więc commit + efekty zawsze zdążą między nimi). */
async function przesunSekundamiPoKolei(sekundy: number) {
  for (let i = 0; i < sekundy; i++) {
    await przesun(1000);
  }
}

describe("lekcja z position_seconds różnym od zera", () => {
  it("odtwarzacz startuje od tej wartości, nie od zera", async () => {
    apiMock.mockResolvedValueOnce(lekcja({ position_seconds: 120, duration_seconds: 600 }));

    render(<LessonPlayer lessonId={5} />);

    expect(await screen.findByLabelText("Pozycja")).toHaveTextContent("2:00");
  });
});

describe("zapis postępu niesie pozycję z odtwarzacza", () => {
  it("wysłany position_seconds rośnie razem z realnym odtwarzaniem, nie jest stały", async () => {
    apiMock.mockResolvedValueOnce(lekcja({ position_seconds: 5, duration_seconds: 600 }));
    apiMock.mockResolvedValueOnce({
      watched_seconds: 70,
      active_seconds: 60,
      completable: false,
      completable_at_percent: 60,
    });

    vi.useFakeTimers();
    render(<LessonPlayer lessonId={5} />);
    await przesun(0);

    const przycisk = screen.getByRole("button", { name: "Odtwórz" });
    fireEvent.click(przycisk);

    await przesunSekundamiPoKolei(10);

    expect(apiMock).toHaveBeenCalledTimes(2);
    const [sciezka, opcje] = apiMock.mock.calls[1] as [string, { body: { position_seconds: number } }];
    expect(sciezka).toBe("/lessons/5/progress");
    // Start 5 s + 10 tyknięć zegara po 1 s = 15 s — wartość Z odtwarzacza,
    // nie stała 0 (regresja: `position_seconds: next.position_seconds` → `0`).
    expect(opcje.body.position_seconds).toBe(15);
  });
});

describe("nieudany zapis nie kasuje wczytanej lekcji", () => {
  it("treść lekcji zostaje na ekranie, widać komunikat o nieudanym zapisie", async () => {
    apiMock.mockResolvedValueOnce(lekcja({ title: "Lekcja o oddechu", position_seconds: 5 }));
    apiMock.mockRejectedValueOnce(
      new ApiError(500, "server_error", "Nie udało się zapisać postępu."),
    );

    vi.useFakeTimers();
    render(<LessonPlayer lessonId={5} />);
    await przesun(0);

    const przycisk = screen.getByRole("button", { name: "Odtwórz" });
    fireEvent.click(przycisk);
    await przesunSekundamiPoKolei(10);

    expect(screen.getByRole("alert")).toHaveTextContent("Postęp nie został zapisany");
    // Treść lekcji zostaje — błąd zapisu NIE przełącza ekranu na stan błędu wczytania.
    expect(screen.getByText("Lekcja o oddechu")).toBeInTheDocument();
    expect(screen.getByLabelText("Pozycja")).toBeInTheDocument();
  });
});

describe("atrapa API musi honorować argument id", () => {
  it("zapytanie o lekcję 5 zwraca lekcję 5, nie lekcję 1 (atrapa nie jest ślepa na argument)", async () => {
    const lekcjaPierwsza = lekcja({ id: 1, title: "Lekcja pierwsza" });
    const lekcjaPiata = lekcja({ id: 5, title: "Lekcja piąta" });

    apiMock.mockImplementation((sciezka: string) => {
      if (sciezka === "/lessons/5") return Promise.resolve(lekcjaPiata);
      if (sciezka === "/lessons/1") return Promise.resolve(lekcjaPierwsza);
      return Promise.reject(new Error("atrapa: nieznana ścieżka " + sciezka));
    });

    render(<LessonPlayer lessonId={5} />);

    expect(await screen.findByText("Lekcja piąta")).toBeInTheDocument();
    expect(screen.queryByText("Lekcja pierwsza")).not.toBeInTheDocument();
  });
});
