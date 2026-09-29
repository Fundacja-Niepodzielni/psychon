import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadkowie ekranu A-07 „Karta osoby” (H18/H07, administracja): pięć stanów
 * (KO-8: ładowanie, dane, osoba bez postępu, błąd jednej z tras, brak
 * uprawnień, 404, po zapisaniu), sekcje rzadkie zwinięte z licznikiem,
 * formularz „Zmień dane” (bez pola roli, 422 przy polu, sukces → ponowny
 * odczyt) i brak odczytu ładunku dziennika — każdy z kontrolą dodatnią.
 */

const pobierzKarteOsoby = vi.fn();
const pobierzRzetelnoscOsoby = vi.fn();
const zapiszKarteOsoby = vi.fn();
const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("../dane", async () => {
  const rzeczywiste = await vi.importActual<typeof import("../dane")>("../dane");
  return {
    ...rzeczywiste,
    pobierzKarteOsoby: (...args: unknown[]) => pobierzKarteOsoby(...args),
    pobierzRzetelnoscOsoby: (...args: unknown[]) => pobierzRzetelnoscOsoby(...args),
    zapiszKarteOsoby: (...args: unknown[]) => zapiszKarteOsoby(...args),
  };
});

const { ApiError } = await import("@/lib/api/klient");
const { KartaOsoby } = await import("../KartaOsoby");

const PROFIL = {
  id: 17,
  first_name: "Marta",
  last_name: "Demo",
  email: "marta@demo.pl",
  role: "volunteer",
  phone: "+48 600 100 200",
  pesel: "90010112345",
  address: { street: "Polna 1", city: "Warszawa", zip: "00-001" },
  access_expires_at: "2027-02-01T00:00:00Z",
  program_completed_at: null,
  product_group: "psychon",
};

const KARTA: unknown = {
  profile: PROFIL,
  progress: {
    courses_done: 8,
    courses_total: 10,
    hours_accepted: "41.5",
    supervision_present: 5,
    workshop_done: true,
    path_tests_passed: 3,
    path_tests_total: 4,
  },
  recent_notifications: [
    { id: 1, type: "internship.returned", title: "Wpis odesłany", body: "…", link: null, read_at: null, created_at: "2026-09-20T10:00:00Z" },
  ],
  audit_entries: [
    // `details` obecne w SUROWEJ odpowiedzi (jak w prawdziwym API,
    // `AdminUserCardResource.php:73`) — kontrola dodatnia dolna: gdyby ekran
    // czytał to pole, marker niżej byłby widoczny w dokumencie.
    {
      id: 501,
      action: "user.updated",
      actor_id: 3,
      created_at: "2026-09-21T09:00:00Z",
      details: { changed: ["TAJNY-LADUNEK-NIE-POKAZYWAC"] },
    },
  ],
};

const KARTA_ZERA: unknown = {
  profile: PROFIL,
  progress: {
    courses_done: 0,
    courses_total: 10,
    hours_accepted: "0",
    supervision_present: 0,
    workshop_done: false,
    path_tests_passed: 0,
    path_tests_total: 4,
  },
  recent_notifications: [],
  audit_entries: [],
};

const RZETELNOSC = { reliability_percent: "40", below_threshold: true };

beforeEach(() => {
  pobierzKarteOsoby.mockReset();
  pobierzRzetelnoscOsoby.mockReset();
  zapiszKarteOsoby.mockReset();
  back.mockReset();
});

describe("KartaOsoby — stan ładowanie", () => {
  it("pokazuje szkielet, zanim odpowiedź wróci", () => {
    pobierzKarteOsoby.mockReturnValue(new Promise(() => {}));
    render(<KartaOsoby id={17} />);
    expect(screen.getByText("Karta osoby")).toBeInTheDocument();
  });
});

describe("KartaOsoby — stan dane", () => {
  it("filary, dane kontaktowe i data wygaśnięcia dostępu renderują się z odpowiedzi", async () => {
    pobierzKarteOsoby.mockResolvedValue(KARTA);
    pobierzRzetelnoscOsoby.mockResolvedValue(RZETELNOSC);

    render(<KartaOsoby id={17} />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Marta Demo" })).toBeInTheDocument());
    expect(screen.getByText("+48 600 100 200")).toBeInTheDocument();
    expect(screen.getByText("2027-02-01T00:00:00Z")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zmień dane" })).toBeInTheDocument();
  });

  it("kontrola dodatnia: osoba bez postępu pokazuje zera z karty, nie stan pusty", async () => {
    pobierzKarteOsoby.mockResolvedValue(KARTA_ZERA);
    pobierzRzetelnoscOsoby.mockRejectedValue(new ApiError({ status: 404, code: "not_found", message: "Nie znaleziono osoby." }));

    render(<KartaOsoby id={18} />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Marta Demo" })).toBeInTheDocument());
    // Godziny stażu / superwizje / warsztat = 0 (liczba), nie „—”: co najmniej
    // trzy kafle niosą "0" jako widoczną liczbę, żaden kafel z realnym zerem
    // nie pokazuje etykiety braku danych.
    expect(screen.getAllByText("0", { selector: "span" }).length).toBeGreaterThanOrEqual(3);
  });
});

describe("KartaOsoby — rzetelność", () => {
  it("404 rzetelności: reszta karty działa, bez komunikatu błędu", async () => {
    pobierzKarteOsoby.mockResolvedValue(KARTA);
    pobierzRzetelnoscOsoby.mockRejectedValue(new ApiError({ status: 404, code: "not_found", message: "Nie znaleziono osoby." }));

    render(<KartaOsoby id={17} />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Marta Demo" })).toBeInTheDocument());
    expect(screen.queryByText(/Nie udało się pobrać rzetelności/)).toBeNull();
  });

  it("błąd inny niż 404 na trasie rzetelności → Notice w tym obszarze, reszta karty działa", async () => {
    pobierzKarteOsoby.mockResolvedValue(KARTA);
    pobierzRzetelnoscOsoby.mockRejectedValue(new ApiError({ status: 500, code: "unknown_error", message: "Błąd serwera." }));

    render(<KartaOsoby id={17} />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Marta Demo" })).toBeInTheDocument());
    expect(await screen.findByText(/Nie udało się pobrać rzetelności/)).toBeInTheDocument();
    // Kontrola dodatnia: reszta ekranu (przycisk główny) nadal działa.
    expect(screen.getByRole("button", { name: "Zmień dane" })).toBeInTheDocument();
  });
});

describe("KartaOsoby — 404 karty i brak uprawnień", () => {
  it("404 karty → stan „nie znaleziono”", async () => {
    pobierzKarteOsoby.mockRejectedValue(new ApiError({ status: 404, code: "not_found", message: "Nie znaleziono osoby." }));
    render(<KartaOsoby id={999} />);
    expect(await screen.findByText("Nie znaleziono osoby.")).toBeInTheDocument();
  });

  it("403 → stan brak uprawnień, tak jak inne ekrany administracji nowego frontu", async () => {
    pobierzKarteOsoby.mockRejectedValue(new ApiError({ status: 403, code: "forbidden", message: "Brak dostępu." }));
    render(<KartaOsoby id={17} />);
    expect(await screen.findByText(/dostępny tylko dla/)).toBeInTheDocument();
  });

  it("401 → ten sam stan brak uprawnień co 403", async () => {
    pobierzKarteOsoby.mockRejectedValue(new ApiError({ status: 401, code: "unauthenticated", message: "Zaloguj się ponownie." }));
    render(<KartaOsoby id={17} />);
    expect(await screen.findByText(/dostępny tylko dla/)).toBeInTheDocument();
  });
});

describe("KartaOsoby — sekcje rzadkie zwinięte z licznikiem", () => {
  it("powiadomienia i dziennik startują zwinięte, licznik = długość tablicy z karty", async () => {
    pobierzKarteOsoby.mockResolvedValue(KARTA);
    pobierzRzetelnoscOsoby.mockResolvedValue(RZETELNOSC);
    render(<KartaOsoby id={17} />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Marta Demo" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Powiadomienia (1)" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Dziennik działań (1)" })).toHaveAttribute("aria-expanded", "false");
  });

  it("brak odczytu ładunku dziennika: rozwinięty wpis pokazuje rodzaj/czas/wykonawcę, NIGDY treść pola `details`", async () => {
    pobierzKarteOsoby.mockResolvedValue(KARTA);
    pobierzRzetelnoscOsoby.mockResolvedValue(RZETELNOSC);
    const uzytkownik = userEvent.setup();

    render(<KartaOsoby id={17} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Marta Demo" })).toBeInTheDocument());

    await uzytkownik.click(screen.getByRole("button", { name: "Dziennik działań (1)" }));

    // Kontrola dodatnia: pola DOZWOLONE są widoczne (renderowanie działa).
    expect(screen.getByText("user.updated")).toBeInTheDocument();
    expect(screen.getByText(/2026-09-21T09:00:00Z/)).toBeInTheDocument();
    expect(screen.getByText(/kto: 3/)).toBeInTheDocument();
    // Ładunek zdarzenia NIGDY nie trafia do dokumentu.
    expect(screen.queryByText(/TAJNY-LADUNEK-NIE-POKAZYWAC/)).toBeNull();
  });
});

describe("KartaOsoby — formularz „Zmień dane”", () => {
  it("brak pola roli w formularzu (kontrola dodatnia: inne pola obecne)", async () => {
    pobierzKarteOsoby.mockResolvedValue(KARTA);
    pobierzRzetelnoscOsoby.mockResolvedValue(RZETELNOSC);
    const uzytkownik = userEvent.setup();

    render(<KartaOsoby id={17} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Marta Demo" })).toBeInTheDocument());
    await uzytkownik.click(screen.getByRole("button", { name: "Zmień dane" }));

    const formularz = await screen.findByRole("form", { name: "Dane osoby" });
    expect(within(formularz).getByLabelText(/^Imię/)).toBeInTheDocument();
    expect(within(formularz).queryByLabelText(/^Rola/)).toBeNull();
    expect(within(formularz).queryByRole("combobox", { name: /^Rola/ })).toBeNull();
  });

  it("422 → błąd przy polu (ciało zapisu bez pola role)", async () => {
    pobierzKarteOsoby.mockResolvedValue(KARTA);
    pobierzRzetelnoscOsoby.mockResolvedValue(RZETELNOSC);
    zapiszKarteOsoby.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "validation_failed",
        message: "Popraw zaznaczone pola.",
        errors: { email: ["Podaj poprawny adres e-mail."] },
      }),
    );
    const uzytkownik = userEvent.setup();

    render(<KartaOsoby id={17} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Marta Demo" })).toBeInTheDocument());
    await uzytkownik.click(screen.getByRole("button", { name: "Zmień dane" }));

    const formularz = await screen.findByRole("form", { name: "Dane osoby" });
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Zapisz zmiany" }));

    expect(await screen.findByText("Podaj poprawny adres e-mail.")).toBeInTheDocument();
    expect(zapiszKarteOsoby).toHaveBeenCalledWith(17, expect.not.objectContaining({ role: expect.anything() }));
  });

  it("sukces → okno się zamyka, karta wczytuje się ponownie, Toast po zapisaniu", async () => {
    pobierzKarteOsoby.mockResolvedValueOnce(KARTA).mockResolvedValueOnce(KARTA_ZERA);
    pobierzRzetelnoscOsoby.mockResolvedValue(RZETELNOSC);
    zapiszKarteOsoby.mockResolvedValue(KARTA_ZERA);
    const uzytkownik = userEvent.setup();

    render(<KartaOsoby id={17} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Marta Demo" })).toBeInTheDocument());
    await uzytkownik.click(screen.getByRole("button", { name: "Zmień dane" }));

    const formularz = await screen.findByRole("form", { name: "Dane osoby" });
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() => expect(zapiszKarteOsoby).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(pobierzKarteOsoby).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Zapisano zmiany.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
