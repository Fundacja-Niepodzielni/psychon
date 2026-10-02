import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/klient";
import {
  GODZINY,
  KONTO_STUDENTA,
  KONTO_WOLONTARIUSZA,
  KURS_STUDENTA_W_TOKU,
  KURS_W_TOKU,
  KURS_ZABLOKOWANY,
  LEKCJA_DO_ZROBIENIA,
  LEKCJA_UKONCZONA,
  SZCZEGOL_W_TOKU,
  WARUNKI,
} from "./atrapy";

/**
 * Co się dzieje po naciśnięciu przycisków stanów pulpitu: „Wróć” przy braku
 * dostępu, „Odśwież” przy 404 i w stanach pustych, „Spróbuj ponownie” przy
 * błędzie, „Wstecz” w nagłówku, „Otwórz kurs” przy błędzie szczegółów kursu
 * i nieczynny „Zamknięty”. Każdy przycisk ma kontrolę dodatnią: przed
 * naciśnięciem nic się nie dzieje, po naciśnięciu dzieje się dokładnie jedno.
 */

const wstecz = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: wstecz, push, replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const pobierzKonto = vi.fn();
const pobierzKursy = vi.fn();
const pobierzSzczegolKursu = vi.fn();
const pobierzWarunkiCertyfikatu = vi.fn();
const pobierzGodzinyStazu = vi.fn();
const pobierzNadchodzaceSuperwizje = vi.fn();

vi.mock("../dane", () => ({
  pobierzKonto: (...args: unknown[]) => pobierzKonto(...args),
  pobierzKursy: (...args: unknown[]) => pobierzKursy(...args),
  pobierzSzczegolKursu: (...args: unknown[]) => pobierzSzczegolKursu(...args),
  pobierzWarunkiCertyfikatu: (...args: unknown[]) => pobierzWarunkiCertyfikatu(...args),
  pobierzGodzinyStazu: (...args: unknown[]) => pobierzGodzinyStazu(...args),
  pobierzNadchodzaceSuperwizje: (...args: unknown[]) => pobierzNadchodzaceSuperwizje(...args),
}));

const { Pulpit } = await import("../Pulpit");
const { PulpitUczestnika } = await import("../PulpitUczestnika");
const { PulpitStudenta } = await import("../PulpitStudenta");

function blad(status: number, code: string) {
  return new ApiError({ status, code, message: "komunikat" });
}

const SZCZEGOL_STUDENTA = { ...SZCZEGOL_W_TOKU, ...KURS_STUDENTA_W_TOKU };

beforeEach(() => {
  wstecz.mockReset();
  push.mockReset();
  pobierzKonto.mockReset().mockResolvedValue(KONTO_WOLONTARIUSZA);
  pobierzKursy.mockReset();
  pobierzSzczegolKursu.mockReset().mockResolvedValue(SZCZEGOL_W_TOKU);
  pobierzWarunkiCertyfikatu.mockReset().mockResolvedValue(WARUNKI);
  pobierzGodzinyStazu.mockReset().mockResolvedValue(GODZINY);
  pobierzNadchodzaceSuperwizje.mockReset().mockResolvedValue([]);
});

afterEach(cleanup);

async function ustal() {
  await act(async () => {
    await new Promise((gotowe) => setTimeout(gotowe, 0));
  });
}

describe("brak dostępu (403): „Wróć” i „Wstecz” cofają, nic nie wraca do odczytu", () => {
  it("pulpit uczestnika: „Wróć” woła cofnięcie raz; kontrola dodatnia: przed naciśnięciem nic nie woła", async () => {
    pobierzKursy.mockRejectedValue(blad(403, "forbidden"));
    render(<PulpitUczestnika programUkonczony={false} />);
    await screen.findByRole("heading", { level: 2, name: "Nie masz dostępu do tego ekranu" });
    expect(wstecz).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Wróć" }));

    expect(wstecz).toHaveBeenCalledTimes(1);
    expect(pobierzKursy).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("pulpit z wyborem roli: inna rola dostaje „Wróć”, który cofa; ekran nie odczytuje kont drugi raz", async () => {
    pobierzKonto.mockResolvedValue({ ...KONTO_WOLONTARIUSZA, role: "instructor", roles: ["instructor"] });
    render(<Pulpit />);
    await screen.findByRole("heading", { level: 2, name: "Nie masz dostępu do tego ekranu" });
    expect(wstecz).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Wróć" }));

    expect(wstecz).toHaveBeenCalledTimes(1);
    expect(pobierzKonto).toHaveBeenCalledTimes(1);
  });

  it("„Wstecz” w nagłówku cofa w każdym stanie bez danych (kontrola dodatnia: ładowanie, 404 i błąd sieci)", async () => {
    const stany: Array<() => void> = [
      () => pobierzKursy.mockReturnValue(new Promise(() => {})),
      () => pobierzKursy.mockRejectedValue(blad(404, "not_found")),
      () => pobierzKursy.mockRejectedValue(new TypeError("Failed to fetch")),
    ];
    for (const [indeks, ustaw] of stany.entries()) {
      wstecz.mockReset();
      pobierzKursy.mockReset();
      ustaw();
      const { unmount } = render(<PulpitUczestnika programUkonczony={false} />);
      await ustal();
      expect(wstecz, `stan ${indeks + 1} przed naciśnięciem`).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Wstecz" }));

      expect(wstecz, `stan ${indeks + 1} po naciśnięciu`).toHaveBeenCalledTimes(1);
      unmount();
    }
  });
});

describe("nie znaleziono (404) i błędy odczytu: „Odśwież” i „Spróbuj ponownie” czytają jeszcze raz", () => {
  it("404 na pulpicie uczestnika: „Odśwież” ponawia odczyt kursów i pokazuje dane (kontrola dodatnia: bez naciśnięcia zostaje 404)", async () => {
    pobierzKursy.mockRejectedValueOnce(blad(404, "not_found")).mockResolvedValue([KURS_W_TOKU]);
    render(<PulpitUczestnika programUkonczony={false} />);
    await screen.findByRole("heading", { level: 2, name: "Nie znaleziono danych pulpitu" });
    expect(pobierzKursy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Odśwież" }));

    await screen.findByRole("heading", { level: 2, name: "Twoja ścieżka" });
    expect(pobierzKursy).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("heading", { level: 2, name: "Nie znaleziono danych pulpitu" })).not.toBeInTheDocument();
  });

  it("błąd serwera na pulpicie uczestnika: „Spróbuj ponownie” ponawia odczyt; ponowny błąd zostawia komunikat", async () => {
    pobierzKursy.mockRejectedValueOnce(blad(500, "server_error")).mockRejectedValueOnce(blad(500, "server_error")).mockResolvedValue([KURS_W_TOKU]);
    render(<PulpitUczestnika programUkonczony={false} />);
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    await waitFor(() => expect(pobierzKursy).toHaveBeenCalledTimes(2));
    await screen.findByRole("alert");
    expect(screen.getByText("Nie udało się wczytać pulpitu")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    await screen.findByRole("heading", { level: 2, name: "Twoja ścieżka" });
    expect(pobierzKursy).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("pulpit z wyborem roli: błąd sieci i „Spróbuj ponownie” czytają konto jeszcze raz i pokazują pulpit uczestnika", async () => {
    pobierzKonto.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(KONTO_WOLONTARIUSZA);
    pobierzKursy.mockResolvedValue([KURS_W_TOKU]);
    render(<Pulpit />);
    await screen.findByRole("alert");
    expect(pobierzKonto).toHaveBeenCalledTimes(1);
    expect(pobierzKursy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));

    await screen.findByRole("heading", { level: 2, name: "Twoja ścieżka" });
    expect(pobierzKonto).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("pulpit z wyborem roli: 404 i „Odśwież” czytają konto jeszcze raz i pokazują pulpit studenta", async () => {
    pobierzKonto.mockRejectedValueOnce(blad(404, "not_found")).mockResolvedValue(KONTO_STUDENTA);
    pobierzKursy.mockResolvedValue([KURS_STUDENTA_W_TOKU]);
    pobierzSzczegolKursu.mockResolvedValue(SZCZEGOL_STUDENTA);
    render(<Pulpit />);
    await screen.findByRole("heading", { level: 2, name: "Nie znaleziono danych pulpitu" });

    fireEvent.click(screen.getByRole("button", { name: "Odśwież" }));

    await screen.findByRole("heading", { level: 2, name: "Twoje kursy" });
    expect(pobierzKonto).toHaveBeenCalledTimes(2);
  });

  it("pulpit studenta: błąd serwera i „Spróbuj ponownie” czytają kursy jeszcze raz", async () => {
    pobierzKursy.mockRejectedValueOnce(blad(500, "server_error")).mockResolvedValue([KURS_STUDENTA_W_TOKU]);
    pobierzSzczegolKursu.mockResolvedValue(SZCZEGOL_STUDENTA);
    render(<PulpitStudenta />);
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));

    await screen.findByRole("heading", { level: 2, name: "Twoje kursy" });
    expect(pobierzKursy).toHaveBeenCalledTimes(2);
  });
});

describe("stany puste: „Odśwież” czyta dane jeszcze raz", () => {
  it("pusta ścieżka uczestnika: oba przyciski „Odśwież” czytają kursy; po dołożeniu kursu puste stany znikają", async () => {
    pobierzKursy.mockResolvedValue([]);
    render(<PulpitUczestnika programUkonczony={false} />);
    await screen.findByRole("heading", { level: 2, name: "Ścieżka jest przygotowywana" });
    await ustal();
    expect(pobierzKursy).toHaveBeenCalledTimes(1);
    const [sciezka, terminy] = screen.getAllByRole("button", { name: "Odśwież" });

    fireEvent.click(sciezka);
    await waitFor(() => expect(pobierzKursy).toHaveBeenCalledTimes(2));
    await ustal();

    fireEvent.click(terminy);
    await waitFor(() => expect(pobierzKursy).toHaveBeenCalledTimes(3));
    await ustal();

    pobierzKursy.mockResolvedValue([KURS_W_TOKU]);
    fireEvent.click(screen.getAllByRole("button", { name: "Odśwież" })[0]);
    await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: "Ścieżka jest przygotowywana" })).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Otwórz kurs: Wywiad psychologiczny" })).toBeInTheDocument();
  });

  it("pusta lista kursów studenta: „Odśwież” czyta kursy jeszcze raz i pokazuje nowy kurs", async () => {
    pobierzKursy.mockResolvedValueOnce([]).mockResolvedValue([KURS_STUDENTA_W_TOKU]);
    pobierzSzczegolKursu.mockResolvedValue(SZCZEGOL_STUDENTA);
    render(<PulpitStudenta />);
    await screen.findByRole("heading", { level: 2, name: "Nie masz jeszcze żadnego kursu" });
    expect(pobierzKursy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Odśwież" }));

    await screen.findByRole("link", { name: "Otwórz kurs: Webinar o superwizji" });
    expect(pobierzKursy).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("heading", { level: 2, name: "Nie masz jeszcze żadnego kursu" })).not.toBeInTheDocument();
  });
});

describe("przyciski główne i zamknięty kurs: dokąd prowadzą", () => {
  it("uczestnik, szczegóły kursu nie wczytały się: „Otwórz kurs” prowadzi na stronę kursu w toku", async () => {
    pobierzKursy.mockResolvedValue([KURS_W_TOKU]);
    pobierzSzczegolKursu.mockRejectedValue(new Error("brak"));
    render(<PulpitUczestnika programUkonczony={false} />);
    await screen.findByRole("button", { name: "Otwórz kurs" });
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Otwórz kurs" }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/panel/kursy/wywiad-psychologiczny");
  });

  it("student, szczegóły kursu nie wczytały się: „Otwórz kurs” prowadzi na stronę kursu", async () => {
    pobierzKursy.mockResolvedValue([KURS_STUDENTA_W_TOKU]);
    pobierzSzczegolKursu.mockRejectedValue(new Error("brak"));
    render(<PulpitStudenta />);
    await screen.findByRole("button", { name: "Otwórz kurs" });

    fireEvent.click(screen.getByRole("button", { name: "Otwórz kurs" }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/panel/kursy/webinar-superwizja");
  });

  it("student, wszystkie lekcje kursu ukończone: „Otwórz kurs” prowadzi na stronę kursu", async () => {
    pobierzKursy.mockResolvedValue([KURS_STUDENTA_W_TOKU]);
    pobierzSzczegolKursu.mockResolvedValue({
      ...SZCZEGOL_STUDENTA,
      lessons: [LEKCJA_UKONCZONA, { ...LEKCJA_DO_ZROBIENIA, is_completed: true }],
    });
    render(<PulpitStudenta />);
    await screen.findByRole("button", { name: "Otwórz kurs" });

    fireEvent.click(screen.getByRole("button", { name: "Otwórz kurs" }));

    expect(push).toHaveBeenCalledWith("/panel/kursy/webinar-superwizja");
  });

  it("zamknięty kurs: „Zamknięty” jest nieczynny, kliknięcie niczego nie otwiera i nie czyta danych jeszcze raz", async () => {
    pobierzKursy.mockResolvedValue([KURS_W_TOKU, KURS_ZABLOKOWANY]);
    render(<PulpitUczestnika programUkonczony={false} />);
    const zamkniety = await screen.findByRole("button", { name: "Zamknięty" });
    await ustal();
    expect(zamkniety).toHaveAttribute("aria-disabled", "true");

    fireEvent.click(zamkniety);

    expect(push).not.toHaveBeenCalled();
    expect(pobierzKursy).toHaveBeenCalledTimes(1);
    // Kontrola dodatnia: kurs w toku ma odnośnik, a zamknięty go nie ma.
    expect(screen.getByRole("link", { name: "Otwórz kurs: Wywiad psychologiczny" })).toHaveAttribute("href", "/panel/kursy/wywiad-psychologiczny");
    expect(screen.queryByRole("link", { name: /Interwencja kryzysowa/ })).not.toBeInTheDocument();
  });
});
