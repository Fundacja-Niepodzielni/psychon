import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/klient";
import {
  GODZINY,
  KURS_UKONCZONY,
  KURS_W_TOKU,
  KURS_ZABLOKOWANY,
  SZCZEGOL_W_TOKU,
  TERMIN_SUPERWIZJI,
  WARUNKI,
} from "./atrapy";
import { liczPrzyciskiGlowne, szablonPulpitu } from "./kontrole-ekranu";

/**
 * Stany pulpitu uczestnika: ładowanie · dane (następny krok + liczby) · pusto
 * przed startem · wszystko ukończone · po programie · błąd jednej z tras
 * pomocniczych (`Notice` w jej obszarze, reszta działa) · 403 · 404 · błąd
 * sieci · inny błąd trasy krytycznej. W każdym stanie w DOM stoi korzeń
 * szablonu, a przycisków głównych jest najwyżej jeden. Każdy stan ma kontrolę
 * dodatnią — zmianę danych wejścia, która MUSI zmienić to, co widać.
 *
 * Testy renderujące dwa razy sprzątają ręcznie (`cleanup()`), bo globalne
 * sprzątanie działa dopiero między przypadkami.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push, replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const pobierzKursy = vi.fn();
const pobierzSzczegolKursu = vi.fn();
const pobierzWarunkiCertyfikatu = vi.fn();
const pobierzGodzinyStazu = vi.fn();
const pobierzNadchodzaceSuperwizje = vi.fn();

vi.mock("../dane", () => ({
  pobierzKursy: (...args: unknown[]) => pobierzKursy(...args),
  pobierzSzczegolKursu: (...args: unknown[]) => pobierzSzczegolKursu(...args),
  pobierzWarunkiCertyfikatu: (...args: unknown[]) => pobierzWarunkiCertyfikatu(...args),
  pobierzGodzinyStazu: (...args: unknown[]) => pobierzGodzinyStazu(...args),
  pobierzNadchodzaceSuperwizje: (...args: unknown[]) => pobierzNadchodzaceSuperwizje(...args),
}));

const { PulpitUczestnika } = await import("../PulpitUczestnika");

function naglowekKroku() {
  return screen.getByRole("heading", { level: 2, name: "Twój następny krok" });
}

function terminWPrzyszlosci(dni: number) {
  return new Date(Date.now() + dni * 86_400_000).toISOString();
}

function blad(status: number, code: string) {
  return new ApiError({ status, code, message: "komunikat" });
}

beforeEach(() => {
  push.mockReset();
  pobierzKursy.mockReset();
  pobierzSzczegolKursu.mockReset().mockResolvedValue(SZCZEGOL_W_TOKU);
  pobierzWarunkiCertyfikatu.mockReset().mockResolvedValue(WARUNKI);
  pobierzGodzinyStazu.mockReset().mockResolvedValue(GODZINY);
  pobierzNadchodzaceSuperwizje.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PulpitUczestnika — stany z danymi", () => {
  it("ładowanie: szkielet w szablonie przed rozstrzygnięciem GET /courses (kontrola dodatnia: po danych szkielet znika)", async () => {
    let rozwiaz: (wartosc: unknown) => void = () => {};
    pobierzKursy.mockReturnValue(new Promise((resolve) => (rozwiaz = resolve)));

    const { container } = render(<PulpitUczestnika programUkonczony={false} />);
    szablonPulpitu(container);
    expect(screen.getByRole("heading", { level: 1, name: "Pulpit" })).toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();

    rozwiaz([KURS_W_TOKU]);
    await waitFor(() => expect(naglowekKroku()).toBeInTheDocument());
    szablonPulpitu(container);
  });

  it("dane: następny krok = pierwsza nieukończona lekcja, przycisk główny „Wróć do lekcji” prowadzi do niej (kontrola dodatnia: lekcje ukończone → krok „test”)", async () => {
    pobierzKursy.mockResolvedValue([KURS_UKONCZONY, KURS_W_TOKU, KURS_ZABLOKOWANY]);

    const { container } = render(<PulpitUczestnika programUkonczony={false} />);

    await waitFor(() => expect(screen.getByText(/Struktura wywiadu/)).toBeInTheDocument());
    szablonPulpitu(container);
    expect(liczPrzyciskiGlowne(container)).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Wróć do lekcji" }));
    expect(push).toHaveBeenCalledWith("/panel/lekcje/22");
    // Liczby pochodzą z /courses, /certificate/conditions i /internship/entries
    // bez własnej reguły liczenia; mianownik występuje w DOM kilka razy.
    expect(screen.getAllByText("z 3 ukończone").length).toBeGreaterThan(0);
    expect(screen.getAllByText("z 72 godzin").length).toBeGreaterThan(0);
    cleanup();

    pobierzSzczegolKursu.mockResolvedValue({
      ...SZCZEGOL_W_TOKU,
      lessons: SZCZEGOL_W_TOKU.lessons.map((l) => ({ ...l, is_completed: true })),
    });
    const drugi = render(<PulpitUczestnika programUkonczony={false} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Przejdź do testu" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Przejdź do testu" }));
    expect(push).toHaveBeenLastCalledWith("/panel/kursy/wywiad-psychologiczny/test");
    expect(screen.queryByRole("button", { name: "Wróć do lekcji" })).not.toBeInTheDocument();
    expect(liczPrzyciskiGlowne(drugi.container)).toBe(1);
  });

  it("pusto przed startem: brak kursów → pusta ścieżka i krok bez zmyślonej daty (kontrola dodatnia: dołożenie kursu usuwa oba puste komunikaty)", async () => {
    pobierzKursy.mockResolvedValue([]);
    const { container } = render(<PulpitUczestnika programUkonczony={false} />);

    await waitFor(() => expect(screen.getByText("Ścieżka jest przygotowywana")).toBeInTheDocument());
    szablonPulpitu(container);
    expect(
      screen.getByText("Gdy pierwszy kurs ścieżki stanie się dostępny, pojawi się tutaj Twój następny krok."),
    ).toBeInTheDocument();
    expect(liczPrzyciskiGlowne(container)).toBe(0);
    cleanup();

    pobierzKursy.mockResolvedValue([KURS_W_TOKU]);
    render(<PulpitUczestnika programUkonczony={false} />);
    await waitFor(() => expect(screen.getByText(/Struktura wywiadu/)).toBeInTheDocument());
    expect(screen.queryByText("Ścieżka jest przygotowywana")).not.toBeInTheDocument();
  });

  it("wszystko ukończone: krok „certyfikat” (kontrola dodatnia: cofnięcie jednego kursu usuwa przycisk certyfikatu)", async () => {
    const oba = [KURS_UKONCZONY, { ...KURS_W_TOKU, status: "completed" as const, progress_percent: 100 }];
    pobierzKursy.mockResolvedValue(oba);

    const { container } = render(<PulpitUczestnika programUkonczony={false} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Zobacz warunki certyfikatu" })).toBeInTheDocument());
    szablonPulpitu(container);
    fireEvent.click(screen.getByRole("button", { name: "Zobacz warunki certyfikatu" }));
    expect(push).toHaveBeenCalledWith("/panel/certyfikat");
    expect(screen.getAllByText("ukończony")).toHaveLength(2);
    cleanup();

    pobierzKursy.mockResolvedValue([oba[0], { ...oba[1], status: "in_progress" as const }]);
    render(<PulpitUczestnika programUkonczony={false} />);
    await waitFor(() => expect(naglowekKroku()).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Zobacz warunki certyfikatu" })).not.toBeInTheDocument();
  });

  it("po programie: krok „dalsza współpraca” (kontrola dodatnia: ten sam pulpit bez zamkniętego programu wraca do lekcji)", async () => {
    pobierzKursy.mockResolvedValue([KURS_UKONCZONY, KURS_W_TOKU]);

    const { container } = render(<PulpitUczestnika programUkonczony />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Przejdź do dalszej współpracy" })).toBeInTheDocument());
    szablonPulpitu(container);
    expect(liczPrzyciskiGlowne(container)).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Przejdź do dalszej współpracy" }));
    expect(push).toHaveBeenCalledWith("/panel/po-programie");
    expect(screen.queryByRole("button", { name: "Wróć do lekcji" })).not.toBeInTheDocument();
    cleanup();

    render(<PulpitUczestnika programUkonczony={false} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Wróć do lekcji" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Przejdź do dalszej współpracy" })).not.toBeInTheDocument();
  });

  it("błąd jednej trasy: /certificate/conditions odrzucone → Notice w tym obszarze, reszta działa (kontrola dodatnia: przy sukcesie Notice nie ma)", async () => {
    pobierzKursy.mockResolvedValue([KURS_W_TOKU]);
    pobierzWarunkiCertyfikatu.mockRejectedValue(new Error("500"));

    const { container } = render(<PulpitUczestnika programUkonczony={false} />);
    await waitFor(() => expect(screen.getByText("Warunki certyfikatu niedostępne")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/Struktura wywiadu/)).toBeInTheDocument());
    szablonPulpitu(container);
    expect(screen.getByRole("button", { name: "Wróć do lekcji" })).toBeInTheDocument();
    cleanup();

    pobierzWarunkiCertyfikatu.mockResolvedValue(WARUNKI);
    render(<PulpitUczestnika programUkonczony={false} />);
    await waitFor(() => expect(screen.getByText(/Struktura wywiadu/)).toBeInTheDocument());
    expect(screen.queryByText("Warunki certyfikatu niedostępne")).not.toBeInTheDocument();
  });

  it("błąd szczegółów kursu: krok pokazuje Notice i przycisk „Otwórz kurs” (kontrola dodatnia: przy sukcesie jest lekcja)", async () => {
    pobierzKursy.mockResolvedValue([KURS_W_TOKU]);
    pobierzSzczegolKursu.mockRejectedValue(new Error("500"));

    const { container } = render(<PulpitUczestnika programUkonczony={false} />);
    await waitFor(() => expect(screen.getByText("Szczegóły kursu niedostępne")).toBeInTheDocument());
    szablonPulpitu(container);
    expect(liczPrzyciskiGlowne(container)).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Otwórz kurs" }));
    expect(push).toHaveBeenCalledWith("/panel/kursy/wywiad-psychologiczny");
    expect(screen.queryByRole("button", { name: "Wróć do lekcji" })).not.toBeInTheDocument();
  });

  it("terminy superwizji: tylko przyszłe, rosnąco (kontrola dodatnia: usunięcie najbliższego zmienia pierwszy wiersz)", async () => {
    pobierzKursy.mockResolvedValue([KURS_W_TOKU]);
    const dalszy = { ...TERMIN_SUPERWIZJI, id: 11, starts_at: terminWPrzyszlosci(10), location_or_link: "Sala 1" };
    const blizszy = { ...TERMIN_SUPERWIZJI, id: 12, starts_at: terminWPrzyszlosci(2), location_or_link: "Sala 2" };
    const miniony = { ...TERMIN_SUPERWIZJI, id: 13, starts_at: terminWPrzyszlosci(-5), location_or_link: "Sala 3" };
    pobierzNadchodzaceSuperwizje.mockResolvedValue([dalszy, blizszy, miniony]);

    render(<PulpitUczestnika programUkonczony={false} />);
    await waitFor(() => expect(screen.getByText("Sala 2")).toBeInTheDocument());
    expect(screen.getByText("Sala 1")).toBeInTheDocument();
    expect(screen.queryByText("Sala 3")).not.toBeInTheDocument();
    cleanup();

    pobierzNadchodzaceSuperwizje.mockResolvedValue([dalszy, miniony]);
    render(<PulpitUczestnika programUkonczony={false} />);
    await waitFor(() => expect(screen.getByText("Sala 1")).toBeInTheDocument());
    expect(screen.queryByText("Sala 2")).not.toBeInTheDocument();
  });

  it("błąd trasy pomocniczej superwizji: Notice tylko w bocznym obszarze", async () => {
    pobierzKursy.mockResolvedValue([KURS_W_TOKU]);
    pobierzNadchodzaceSuperwizje.mockRejectedValue(new Error("500"));

    render(<PulpitUczestnika programUkonczony={false} />);
    await waitFor(() => expect(screen.getByText("Terminy superwizji niedostępne")).toBeInTheDocument());
    expect(screen.getByText(/Struktura wywiadu/)).toBeInTheDocument();
  });
});

describe("PulpitUczestnika — stany bez danych", () => {
  const przypadki = [
    { nazwa: "403", wyjatek: blad(403, "forbidden"), tekst: /tylko dla uczestników/ },
    { nazwa: "404", wyjatek: blad(404, "not_found"), tekst: "Nie znaleziono danych pulpitu" },
    { nazwa: "błąd sieci", wyjatek: new TypeError("Failed to fetch"), tekst: "Brak połączenia" },
    { nazwa: "błąd serwera", wyjatek: blad(500, "server_error"), tekst: "Nie udało się wczytać pulpitu" },
  ];

  it.each(przypadki)("$nazwa: komunikat w szablonie, bez przycisku głównego", async ({ wyjatek, tekst }) => {
    pobierzKursy.mockRejectedValue(wyjatek);

    const { container } = render(<PulpitUczestnika programUkonczony={false} />);
    await waitFor(() => expect(screen.getByText(tekst)).toBeInTheDocument());
    szablonPulpitu(container);
    expect(liczPrzyciskiGlowne(container)).toBe(0);
    expect(screen.queryByRole("heading", { level: 2, name: "Twój następny krok" })).not.toBeInTheDocument();
  });

  it("ponowienie z błędu sieci: drugi odczyt kończy się danymi (kontrola dodatnia: bez kliknięcia pulpit zostaje w błędzie)", async () => {
    pobierzKursy.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue([KURS_W_TOKU]);

    const { container } = render(<PulpitUczestnika programUkonczony={false} />);
    await waitFor(() => expect(screen.getByText("Brak połączenia")).toBeInTheDocument());
    expect(pobierzKursy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    await waitFor(() => expect(naglowekKroku()).toBeInTheDocument());
    expect(pobierzKursy).toHaveBeenCalledTimes(2);
    szablonPulpitu(container);
  });
});
