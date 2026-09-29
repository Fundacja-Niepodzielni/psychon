import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

/**
 * Świadkowie stanów pulpitu (U-01): ładowanie · dane (następny krok + liczby)
 * · pusto przed startem · wszystko ukończone · błąd jednej z tras (`Notice`
 * w jej obszarze, reszta działa) · błąd całkowitej trasy krytycznej
 * (`GET /courses`). Każdy stan ma kontrolę dodatnią — zmianę danych wejścia,
 * która MUSI zmienić to, co widać, inaczej świadek przeszedłby i przy
 * zepsutym komponencie.
 *
 * Kilka testów renderuje `<Pulpit />` DWA razy (stan „przed" i „po" dla
 * kontroli dodatnej) — `cleanup()` między nimi jest RĘCZNY, bo globalny
 * `afterEach(cleanup)` z `__tests__/setup.ts` sprząta dopiero między
 * poszczególnymi `it(...)`, nie w środku jednego testu.
 */

const pobierzKursy = vi.fn();
const pobierzSzczegolKursu = vi.fn();
const pobierzWarunkiCertyfikatu = vi.fn();
const pobierzGodzinyStazu = vi.fn();
const pobierzNadchodzaceSuperwizje = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("../dane", () => ({
  pobierzKursy: (...args: unknown[]) => pobierzKursy(...args),
  pobierzSzczegolKursu: (...args: unknown[]) => pobierzSzczegolKursu(...args),
  pobierzWarunkiCertyfikatu: (...args: unknown[]) => pobierzWarunkiCertyfikatu(...args),
  pobierzGodzinyStazu: (...args: unknown[]) => pobierzGodzinyStazu(...args),
  pobierzNadchodzaceSuperwizje: (...args: unknown[]) => pobierzNadchodzaceSuperwizje(...args),
}));

const { Pulpit } = await import("../Pulpit");

function naglowekKroku() {
  return screen.getByRole("heading", { level: 2, name: "Twój następny krok" });
}

const KURS_UKONCZONY = {
  id: 1,
  slug: "podstawy-pomocy",
  title: "Podstawy pomocy psychologicznej",
  sequence_order: 1,
  status: "completed" as const,
  progress_percent: 100,
};

const KURS_W_TOKU = {
  id: 2,
  slug: "wywiad-psychologiczny",
  title: "Wywiad psychologiczny",
  sequence_order: 2,
  status: "in_progress" as const,
  progress_percent: 40,
};

const KURS_ZABLOKOWANY = {
  id: 3,
  slug: "interwencja-kryzysowa",
  title: "Interwencja kryzysowa",
  sequence_order: 3,
  status: "locked" as const,
  progress_percent: 0,
};

const SZCZEGOL_W_TOKU = {
  ...KURS_W_TOKU,
  instructor: null,
  materials: [],
  lessons: [
    { id: 21, title: "Wprowadzenie do wywiadu", sequence_order: 1, is_completed: true },
    { id: 22, title: "Struktura wywiadu", sequence_order: 2, is_completed: false },
  ],
};

const WARUNKI = {
  eligible: false,
  conditions: [
    { key: "courses" as const, label: "Wszystkie etapy i testy", done: 1, required: 3, met: false },
    { key: "internship" as const, label: "Godziny stażu", done: "12.5", required: "72", met: false },
    { key: "supervision" as const, label: "Obecności na superwizjach", done: 2, required: 6, met: false },
    { key: "workshop" as const, label: "Warsztat stacjonarny", met: false },
  ],
};

const GODZINY = { accepted_hours: "12.5", required_hours: "72" };

function terminWPrzyszlosci(dni: number) {
  const data = new Date(Date.now() + dni * 86_400_000);
  return data.toISOString();
}

beforeEach(() => {
  pobierzKursy.mockReset();
  pobierzSzczegolKursu.mockReset().mockResolvedValue(SZCZEGOL_W_TOKU);
  pobierzWarunkiCertyfikatu.mockReset().mockResolvedValue(WARUNKI);
  pobierzGodzinyStazu.mockReset().mockResolvedValue(GODZINY);
  pobierzNadchodzaceSuperwizje.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Pulpit — stany", () => {
  it("ładowanie: pokazuje szkielet przed rozstrzygnięciem GET /courses", async () => {
    let rozwiaz: (wartosc: unknown) => void = () => {};
    pobierzKursy.mockReturnValue(new Promise((resolve) => (rozwiaz = resolve)));

    render(<Pulpit />);
    expect(screen.getByRole("heading", { level: 1, name: "Pulpit" })).toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();

    rozwiaz([KURS_W_TOKU]);
    await waitFor(() => expect(naglowekKroku()).toBeInTheDocument());
  });

  it("dane: następny krok = pierwsza nieukończona lekcja etapu w toku (i kontrola dodatnia: lekcja ukończona → krok „test”)", async () => {
    pobierzKursy.mockResolvedValue([KURS_UKONCZONY, KURS_W_TOKU, KURS_ZABLOKOWANY]);

    render(<Pulpit />);

    await waitFor(() => expect(screen.getByText(/Struktura wywiadu/)).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Wróć do lekcji" })).toHaveAttribute("href", "/panel/lekcje/22");
    // Liczby StatRow pochodzą z /courses + /certificate/conditions + /internship/entries,
    // bez własnej reguły liczenia (kontrakt §2 H07/H13). Mianownik pojawia się
    // dwa razy w DOM (raz przy liczbie `Num`, raz przy etykiecie `ProgressBar`
    // dominującego kafla) — stąd `getAllByText`, nie `getByText`.
    expect(screen.getAllByText("z 3 etapów").length).toBeGreaterThan(0);
    cleanup();

    // kontrola dodatnia — ta sama lista kursów, ale etap w toku ma WSZYSTKIE
    // lekcje ukończone: krok MUSI się zmienić z „lekcja” na „test”.
    pobierzSzczegolKursu.mockResolvedValue({
      ...SZCZEGOL_W_TOKU,
      lessons: SZCZEGOL_W_TOKU.lessons.map((l) => ({ ...l, is_completed: true })),
    });
    render(<Pulpit />);
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Przejdź do testu" })).toHaveAttribute(
        "href",
        "/panel/kursy/wywiad-psychologiczny/test",
      ),
    );
    expect(screen.queryByRole("link", { name: "Wróć do lekcji" })).not.toBeInTheDocument();
  });

  it("pusto przed startem: brak kursów → stan pusty ścieżki i następnego kroku bez zmyślonej daty (kontrola dodatnia: dołożenie kursu usuwa oba puste komunikaty)", async () => {
    pobierzKursy.mockResolvedValue([]);
    render(<Pulpit />);

    await waitFor(() => expect(screen.getByText("Ścieżka jest przygotowywana")).toBeInTheDocument());
    expect(
      screen.getByText("Gdy pierwszy etap ścieżki stanie się dostępny, pojawi się tutaj Twój następny krok."),
    ).toBeInTheDocument();
    cleanup();

    pobierzKursy.mockResolvedValue([KURS_W_TOKU]);
    render(<Pulpit />);
    await waitFor(() => expect(screen.getByText(/Struktura wywiadu/)).toBeInTheDocument());
    expect(screen.queryByText("Ścieżka jest przygotowywana")).not.toBeInTheDocument();
  });

  it("wszystko ukończone: krok „certyfikat” + wiersze ścieżki oznaczone jako ukończone (kontrola dodatnia: cofnięcie jednego etapu usuwa CTA certyfikatu)", async () => {
    const oba = [KURS_UKONCZONY, { ...KURS_W_TOKU, status: "completed" as const, progress_percent: 100 }];
    pobierzKursy.mockResolvedValue(oba);

    render(<Pulpit />);
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Zobacz warunki certyfikatu" })).toHaveAttribute(
        "href",
        "/panel/certyfikat",
      ),
    );
    expect(screen.getAllByText("Ukończony")).toHaveLength(2);
    cleanup();

    pobierzKursy.mockResolvedValue([oba[0], { ...oba[1], status: "in_progress" as const }]);
    render(<Pulpit />);
    await waitFor(() => expect(naglowekKroku()).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: "Zobacz warunki certyfikatu" })).not.toBeInTheDocument();
  });

  it("błąd jednej z tras: /certificate/conditions odrzucone → Notice w tym obszarze, reszta pulpitu (ścieżka, następny krok) działa", async () => {
    pobierzKursy.mockResolvedValue([KURS_W_TOKU]);
    pobierzWarunkiCertyfikatu.mockRejectedValue(new Error("500"));

    render(<Pulpit />);

    await waitFor(() =>
      expect(
        screen.getByText(
          "Nie udało się wczytać warunków certyfikatu — liczba obecności na superwizjach powyżej może być niepełna.",
        ),
      ).toBeInTheDocument(),
    );
    // Reszta pulpitu nadal działa — następny krok i ścieżka renderują się normalnie.
    await waitFor(() => expect(screen.getByText(/Struktura wywiadu/)).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Wróć do lekcji" })).toBeInTheDocument();
  });

  it("błąd trasy krytycznej: /courses odrzucone → cała strona pokazuje stan błędu zamiast pustego/zepsutego pulpitu", async () => {
    pobierzKursy.mockRejectedValue(new Error("500"));

    render(<Pulpit />);
    await waitFor(() =>
      expect(screen.getByText("Nie udało się wczytać pulpitu. Spróbuj ponownie później.")).toBeInTheDocument(),
    );
  });

  it("wspierająca: tylko przyszłe terminy superwizji, posortowane rosnąco (kontrola dodatnia: usunięcie najbliższego zmienia pierwszy wiersz)", async () => {
    pobierzKursy.mockResolvedValue([KURS_W_TOKU]);
    const dalszy = { id: 11, starts_at: terminWPrzyszlosci(10), location_or_link: "Sala 1" };
    const blizszy = { id: 12, starts_at: terminWPrzyszlosci(2), location_or_link: "Sala 2" };
    const miniony = { id: 13, starts_at: terminWPrzyszlosci(-5), location_or_link: "Sala 3" };
    pobierzNadchodzaceSuperwizje.mockResolvedValue([dalszy, blizszy, miniony]);

    render(<Pulpit />);
    await waitFor(() => expect(screen.getByText("Sala 2")).toBeInTheDocument());
    expect(screen.getByText("Sala 1")).toBeInTheDocument();
    expect(screen.queryByText("Sala 3")).not.toBeInTheDocument();
    cleanup();

    pobierzNadchodzaceSuperwizje.mockResolvedValue([dalszy, miniony]);
    render(<Pulpit />);
    await waitFor(() => expect(screen.getByText("Sala 1")).toBeInTheDocument());
    expect(screen.queryByText("Sala 2")).not.toBeInTheDocument();
  });
});
