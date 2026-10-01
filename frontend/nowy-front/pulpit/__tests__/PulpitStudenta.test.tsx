import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/klient";
import {
  KURS_STUDENTA_UKONCZONY,
  KURS_STUDENTA_W_TOKU,
  LEKCJA_DO_ZROBIENIA,
  LEKCJA_UKONCZONA,
} from "./atrapy";
import { liczPrzyciskiGlowne, szablonPulpitu } from "./kontrole-ekranu";

/**
 * Stany pulpitu kursów studenta: ładowanie · dane („Wznów lekcję”) · pusty
 * („Nie masz jeszcze żadnego kursu” + kontakt) · wszystko ukończone · kurs bez
 * nieukończonych lekcji · błąd szczegółów kursu · 403 · 404 · błąd sieci ·
 * inny błąd. Ekran niczego nie zapisuje, więc stanu „po zapisie” nie ma.
 * W każdym stanie w DOM stoi korzeń szablonu, a przycisków głównych jest
 * najwyżej jeden. Każdy stan ma kontrolę dodatnią.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push, replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const pobierzKursy = vi.fn();
const pobierzSzczegolKursu = vi.fn();
vi.mock("../dane", () => ({
  pobierzKursy: (...args: unknown[]) => pobierzKursy(...args),
  pobierzSzczegolKursu: (...args: unknown[]) => pobierzSzczegolKursu(...args),
}));

const { PulpitStudenta, ADRES_KONTAKTOWY } = await import("../PulpitStudenta");

const SZCZEGOL = {
  ...KURS_STUDENTA_W_TOKU,
  instructor: null,
  topics: [],
  lessons: [LEKCJA_UKONCZONA, LEKCJA_DO_ZROBIENIA],
  materials: [],
};

function blad(status: number, code: string) {
  return new ApiError({ status, code, message: "komunikat" });
}

beforeEach(() => {
  push.mockReset();
  pobierzKursy.mockReset();
  pobierzSzczegolKursu.mockReset().mockResolvedValue(SZCZEGOL);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PulpitStudenta — stany z danymi", () => {
  it("ładowanie: szkielet w szablonie (kontrola dodatnia: po danych szkielet znika)", async () => {
    let rozwiaz: (wartosc: unknown) => void = () => {};
    pobierzKursy.mockReturnValue(new Promise((resolve) => (rozwiaz = resolve)));

    const { container } = render(<PulpitStudenta />);
    szablonPulpitu(container);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();

    rozwiaz([KURS_STUDENTA_W_TOKU]);
    await waitFor(() => expect(document.querySelector('[data-karta="nastepny-krok"] h2')).not.toBeNull());
    szablonPulpitu(container);
  });

  it("dane: „Wznów lekcję” prowadzi do pierwszej nieukończonej lekcji (kontrola dodatnia: wszystkie lekcje ukończone → „Otwórz kurs”)", async () => {
    pobierzKursy.mockResolvedValue([KURS_STUDENTA_UKONCZONY, KURS_STUDENTA_W_TOKU]);

    const { container } = render(<PulpitStudenta />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Wznów lekcję" })).toBeInTheDocument());
    szablonPulpitu(container);
    expect(liczPrzyciskiGlowne(container)).toBe(1);
    expect(screen.getByText(/Struktura wywiadu/)).toBeInTheDocument();
    expect(pobierzSzczegolKursu).toHaveBeenCalledWith("webinar-superwizja");
    fireEvent.click(screen.getByRole("button", { name: "Wznów lekcję" }));
    expect(push).toHaveBeenCalledWith("/panel/lekcje/22");
    expect(screen.getAllByText("z 2 kursów").length).toBeGreaterThan(0);
    cleanup();

    pobierzSzczegolKursu.mockResolvedValue({
      ...SZCZEGOL,
      lessons: SZCZEGOL.lessons.map((l) => ({ ...l, is_completed: true })),
    });
    const drugi = render(<PulpitStudenta />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Otwórz kurs" }).length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: "Wznów lekcję" })).not.toBeInTheDocument();
    expect(liczPrzyciskiGlowne(drugi.container)).toBe(1);
  });

  it("pusty: brak kursów → tekst z mapy ekranów i kontakt (kontrola dodatnia: dołożenie kursu usuwa pusty stan)", async () => {
    pobierzKursy.mockResolvedValue([]);

    const { container } = render(<PulpitStudenta />);
    await waitFor(() => expect(screen.getByText("Nie masz jeszcze żadnego kursu")).toBeInTheDocument());
    szablonPulpitu(container);
    expect(screen.getByText(new RegExp(ADRES_KONTAKTOWY.replace(".", "\\.")), { selector: "p" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: ADRES_KONTAKTOWY })).toHaveAttribute("href", `mailto:${ADRES_KONTAKTOWY}`);
    expect(liczPrzyciskiGlowne(container)).toBe(0);
    expect(pobierzSzczegolKursu).not.toHaveBeenCalled();
    cleanup();

    pobierzKursy.mockResolvedValue([KURS_STUDENTA_W_TOKU]);
    render(<PulpitStudenta />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Wznów lekcję" })).toBeInTheDocument());
    expect(screen.queryByText("Nie masz jeszcze żadnego kursu")).not.toBeInTheDocument();
  });

  it("wszystko ukończone: komunikat bez przycisku głównego (kontrola dodatnia: kurs w toku przywraca „Wznów lekcję”)", async () => {
    pobierzKursy.mockResolvedValue([KURS_STUDENTA_UKONCZONY]);

    const { container } = render(<PulpitStudenta />);
    await waitFor(() => expect(screen.getByText("Wszystkie Twoje kursy są ukończone. Dobra robota.")).toBeInTheDocument());
    szablonPulpitu(container);
    expect(liczPrzyciskiGlowne(container)).toBe(0);
    const karta = container.querySelector('[data-karta="nastepny-krok"]') as HTMLElement;
    expect(karta.textContent).toContain("Następny krok");
    expect(karta.querySelectorAll("h2")).toHaveLength(1);
    expect(karta.querySelector("button")).toBeNull();
    cleanup();

    pobierzKursy.mockResolvedValue([KURS_STUDENTA_UKONCZONY, KURS_STUDENTA_W_TOKU]);
    render(<PulpitStudenta />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Wznów lekcję" })).toBeInTheDocument());
    expect(screen.queryByText("Wszystkie Twoje kursy są ukończone. Dobra robota.")).not.toBeInTheDocument();
  });

  it("błąd szczegółów kursu: Notice w bloku i „Otwórz kurs”, lista kursów działa (kontrola dodatnia: przy sukcesie jest lekcja)", async () => {
    pobierzKursy.mockResolvedValue([KURS_STUDENTA_W_TOKU]);
    pobierzSzczegolKursu.mockRejectedValue(new Error("500"));

    const { container } = render(<PulpitStudenta />);
    await waitFor(() => expect(screen.getByText("Szczegóły kursu niedostępne")).toBeInTheDocument());
    szablonPulpitu(container);
    expect(screen.getAllByText("Webinar o superwizji").length).toBeGreaterThan(0);
    expect(liczPrzyciskiGlowne(container)).toBe(1);
    expect(screen.queryByRole("button", { name: "Wznów lekcję" })).not.toBeInTheDocument();
  });
});

describe("PulpitStudenta — stany bez danych", () => {
  const przypadki = [
    { nazwa: "403", wyjatek: blad(403, "forbidden"), tekst: /tylko dla uczestników/ },
    { nazwa: "404", wyjatek: blad(404, "not_found"), tekst: "Nie znaleziono danych pulpitu" },
    { nazwa: "błąd sieci", wyjatek: new TypeError("Failed to fetch"), tekst: "Brak połączenia" },
    { nazwa: "błąd serwera", wyjatek: blad(500, "server_error"), tekst: "Nie udało się wczytać pulpitu" },
  ];

  it.each(przypadki)("$nazwa: komunikat w szablonie, bez przycisku głównego", async ({ wyjatek, tekst }) => {
    pobierzKursy.mockRejectedValue(wyjatek);

    const { container } = render(<PulpitStudenta />);
    await waitFor(() => expect(screen.getByText(tekst)).toBeInTheDocument());
    szablonPulpitu(container);
    expect(liczPrzyciskiGlowne(container)).toBe(0);
  });

  it("ponowienie z błędu serwera: drugi odczyt kończy się danymi (kontrola dodatnia: bez kliknięcia zostaje błąd)", async () => {
    pobierzKursy.mockRejectedValueOnce(blad(500, "server_error")).mockResolvedValue([KURS_STUDENTA_W_TOKU]);

    render(<PulpitStudenta />);
    await waitFor(() => expect(screen.getByText("Nie udało się wczytać pulpitu")).toBeInTheDocument());
    expect(pobierzKursy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Wznów lekcję" })).toBeInTheDocument());
    expect(pobierzKursy).toHaveBeenCalledTimes(2);
  });
});
