import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/lib/api/klient";
import { saPowodyPytania } from "@/design-system/szablony/NiezapisaneZmiany";
import { FILIP, GRUPA, GRUPA_PUSTA, MARTA, RZETELNOSC, TERMIN_PRZYSZLY, TERMIN_ZAKONCZONY } from "./atrapy";
import { etykietyPol, nazwyDzialan, przyciskiGlowne, szablonListy, wiersz } from "./kontrole-ekranu";

/**
 * Ekran „Moja grupa”: ładowanie · błąd · brak połączenia · brak dostępu · nie znaleziono · brak
 * przypisanej grupy · grupa z osobami na różnym etapie · filtr bez wyników · rzetelność (ładowanie,
 * błąd, dane) · panel terminu · panel sprawy · obecności. W każdym stanie: jeden korzeń szablonu,
 * jeden `h1`, najwyżej jeden przycisk główny. Każdy stan sprawdza nagłówek, przycisk główny i to, czy
 * działa, zdania wyjaśniające i nazwy wszystkich przycisków i odnośników. Każdy pomiar ma kontrolę
 * dodatnią: zmianę danych wejścia, która MUSI zmienić to, co widać.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push, replace: vi.fn(), refresh: vi.fn() }),
}));

const api = vi.fn();
vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
}));

const pobierzGrupe = vi.fn();
const pobierzRzetelnosc = vi.fn();
const utworzTermin = vi.fn();
const zapiszObecnosci = vi.fn();
const zglosSprawe = vi.fn();
vi.mock("../dane", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../dane")>()),
  pobierzGrupe: (...args: unknown[]) => pobierzGrupe(...args),
  pobierzRzetelnosc: (...args: unknown[]) => pobierzRzetelnosc(...args),
  utworzTermin: (...args: unknown[]) => utworzTermin(...args),
  zapiszObecnosci: (...args: unknown[]) => zapiszObecnosci(...args),
  zglosSprawe: (...args: unknown[]) => zglosSprawe(...args),
}));

const { GrupaProwadzacego } = await import("../GrupaProwadzacego");

function blad(status: number, code: string, message = "komunikat serwera", extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) {
  return new ApiError({ status, code, message, ...extra });
}

async function pokaz() {
  let wynik: ReturnType<typeof render> | undefined;
  await act(async () => {
    wynik = render(<GrupaProwadzacego />);
  });
  return wynik!;
}

async function pokazZDanymi(grupa: unknown = GRUPA) {
  pobierzGrupe.mockResolvedValue(grupa);
  const wynik = await pokaz();
  await screen.findByRole("heading", { level: 2, name: "Uczestnicy" });
  return wynik;
}

function glowny(container: HTMLElement): HTMLButtonElement {
  const [przycisk, ...reszta] = przyciskiGlowne(container);
  expect(reszta).toHaveLength(0);
  return przycisk;
}

beforeEach(() => {
  push.mockReset();
  api.mockReset();
  api.mockResolvedValue({ first_name: "Anna", role: "instructor" });
  for (const mock of [pobierzGrupe, pobierzRzetelnosc, utworzTermin, zapiszObecnosci, zglosSprawe]) mock.mockReset();
  pobierzRzetelnosc.mockResolvedValue(RZETELNOSC);
});

afterEach(() => {
  cleanup();
});

describe("Moja grupa — stany bez danych", () => {
  it("ładowanie: nagłówek, zdanie stanu, brak przycisku głównego", async () => {
    pobierzGrupe.mockReturnValue(new Promise(() => {}));
    const { container } = await pokaz();

    szablonListy(container);
    expect(screen.getByRole("heading", { level: 1, name: "Moja grupa" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Wczytywanie grupy…");
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(nazwyDzialan(container)).toEqual(["Wstecz"]);
  });

  it("błąd: komunikat serwera ze zdaniem wyjaśniającym i ponowieniem; ponowienie woła odczyt jeszcze raz", async () => {
    pobierzGrupe.mockRejectedValue(blad(500, "server_error", "Serwer nie odpowiada."));
    const { container } = await pokaz();

    szablonListy(container);
    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się wczytać grupy");
    expect(screen.getByRole("alert")).toHaveTextContent("Serwer nie odpowiada.");
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(nazwyDzialan(container)).toEqual(["Wstecz", "Spróbuj ponownie"]);

    pobierzGrupe.mockResolvedValue(GRUPA);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    });
    expect(pobierzGrupe).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("heading", { level: 2, name: "Uczestnicy" })).toBeInTheDocument();
  });

  it("brak połączenia: osobny komunikat, nie „coś poszło nie tak”", async () => {
    pobierzGrupe.mockRejectedValue(new TypeError("Failed to fetch"));
    const { container } = await pokaz();

    expect(screen.getByRole("alert")).toHaveTextContent("Brak połączenia");
    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.");
    expect(nazwyDzialan(container)).toEqual(["Wstecz", "Spróbuj ponownie"]);
  });

  it.each([403, 401])("brak dostępu (%i): wspólny ekran odmowy z jednym przyciskiem prowadzącym do pulpitu prowadzącego", async (status) => {
    pobierzGrupe.mockRejectedValue(blad(status, "forbidden"));
    const { container } = await pokaz();

    szablonListy(container);
    expect(screen.getByRole("heading", { level: 1, name: "Moja grupa" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Nie masz dostępu do tego ekranu" })).toBeInTheDocument();
    expect(await screen.findByText(/Ten ekran jest dla osób prowadzących\./)).toBeInTheDocument();
    expect(nazwyDzialan(container)).toEqual(["Wstecz", "Wróć do pulpitu"]);
    expect(przyciskiGlowne(container)).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Wróć do pulpitu" }));
    expect(push).toHaveBeenCalledWith("/prowadzacy");
  });

  it("nie znaleziono (404): wspólny ekran z przyciskiem „Odśwież”", async () => {
    pobierzGrupe.mockRejectedValue(blad(404, "not_found"));
    const { container } = await pokaz();

    expect(screen.getByRole("heading", { level: 2, name: "Nie znaleziono grupy" })).toBeInTheDocument();
    expect(nazwyDzialan(container)).toEqual(["Wstecz", "Odśwież"]);
  });
});

describe("Moja grupa — brak przypisanej grupy", () => {
  it("zdanie, kto przypisuje osoby; terminy i sprawy dalej dostępne", async () => {
    pobierzRzetelnosc.mockResolvedValue([]);
    const { container } = await pokazZDanymi(GRUPA_PUSTA);

    szablonListy(container);
    expect(screen.getByRole("heading", { level: 1, name: "Moja grupa" })).toBeInTheDocument();
    expect(screen.getByText("0 osób w grupie")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Nie masz jeszcze przypisanej grupy" })).toBeInTheDocument();
    expect(screen.getByText(/Osoby do grupy przypisuje administracja Fundacji\./)).toBeInTheDocument();
    expect(screen.getByText(/Nie masz jeszcze żadnego terminu\./)).toBeInTheDocument();
    expect(await screen.findByText("Nie masz obecnie przypisanych osób w grupie.")).toBeInTheDocument();
    expect(etykietyPol(container)).toEqual([]);

    const przycisk = glowny(container);
    expect(przycisk).toHaveTextContent("Utwórz termin");
    expect(przycisk).toBeEnabled();
    expect(przycisk).not.toHaveAttribute("aria-disabled");
    expect(nazwyDzialan(container)).toEqual(["Wstecz", "Zgłoś sprawę", "Utwórz termin", "Odśwież", "Odśwież"]);
  });
});

describe("Moja grupa — grupa z osobami na różnym etapie", () => {
  it("nagłówek, licznik osób, jeden zielony przycisk i nazwy wszystkich działań", async () => {
    const { container } = await pokazZDanymi();

    szablonListy(container);
    expect(screen.getByRole("heading", { level: 1, name: "Moja grupa" })).toBeInTheDocument();
    expect(screen.getByText("Sprawdzaj postępy osób w grupie i zarządzaj terminami superwizji.")).toBeInTheDocument();
    expect(screen.getByText("3 osoby w grupie")).toBeInTheDocument();
    expect(glowny(container)).toHaveTextContent("Utwórz termin");
    expect(etykietyPol(container).slice(0, 1)).toEqual(["Szukaj osoby"]);
    expect(nazwyDzialan(container)).toEqual([
      "Wstecz",
      "Zgłoś sprawę",
      "Utwórz termin",
      "Zapisz obecności: 30 września 2026, 18:00",
      "Zapisz obecności: 14 października 2026, 18:00",
    ]);
  });

  it("postęp każdej osoby słowami z pulpitu prowadzącego; nic poza imieniem, nazwiskiem i postępem", async () => {
    const { container } = await pokazZDanymi();

    expect(wiersz(container, "osoba-18")).toContain("Filip Demo");
    expect(wiersz(container, "osoba-18")).toContain("5 z 5");
    expect(wiersz(container, "osoba-18")).toContain("72 godz.");
    expect(wiersz(container, "osoba-18")).toContain("Ukończony");
    expect(wiersz(container, "osoba-17")).toContain("2 z 5");
    expect(wiersz(container, "osoba-17")).toContain("12,5 godz.");
    expect(wiersz(container, "osoba-17")).toContain("Nieukończony");
    expect(wiersz(container, "osoba-19")).toContain("0 z 5");
    expect(container.textContent).not.toMatch(/@|PESEL|telefon/i);
    expect(screen.getByRole("table", { name: "Uczestnicy" })).toBeInTheDocument();
  });

  it("filtr po nazwisku: zawęża listę i mówi, ile znaleziono; „Wyczyść filtr” przywraca wszystkich", async () => {
    const { container } = await pokazZDanymi();

    fireEvent.change(screen.getByLabelText("Szukaj osoby"), { target: { value: "marta" } });
    expect(screen.getByText("Znaleziono 1 z 3 osób.")).toBeInTheDocument();
    expect(container.querySelector('[data-wiersz="osoba-17"]')).not.toBeNull();
    expect(container.querySelector('[data-wiersz="osoba-18"]')).toBeNull();

    fireEvent.change(screen.getByLabelText("Szukaj osoby"), { target: { value: "nikt" } });
    expect(screen.getByRole("heading", { level: 2, name: "Brak osób spełniających filtr" })).toBeInTheDocument();
    expect(screen.getByText("Zmień szukaną frazę albo wyczyść filtr.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Wyczyść filtr" }));
    expect(container.querySelectorAll("[data-wiersz^='osoba-']")).toHaveLength(3);
  });

  it("kontrola dodatnia: grupa jednoosobowa mówi „1 osoba w grupie”", async () => {
    await pokazZDanymi({ ...GRUPA, members: [GRUPA.members[1]] });
    expect(screen.getByText("1 osoba w grupie")).toBeInTheDocument();
  });
});

describe("Moja grupa — rzetelność nauki", () => {
  it("lista od najniższego wyniku z plakietkami „Poniżej progu”, „W normie” i „Brak danych”", async () => {
    await pokazZDanymi();
    await screen.findByText("Poniżej progu");

    expect(screen.getByRole("heading", { level: 2, name: "Rzetelność nauki" })).toBeInTheDocument();
    const lista = (imie: string) => (screen.getAllByText(imie).map((n) => n.closest("[data-wariant]")).find(Boolean) as HTMLElement).textContent;
    expect(lista("Zofia Demo")).toContain("Wynik: 15%");
    expect(lista("Marta Demo")).toContain("Wynik: 85,5%");
    expect(lista("Marta Demo")).toContain("W normie");
    expect(lista("Filip Demo")).toContain("Brak danych");
    expect(pobierzRzetelnosc).toHaveBeenCalledTimes(1);
  });

  it("ładowanie sekcji nie blokuje reszty ekranu", async () => {
    pobierzRzetelnosc.mockReturnValue(new Promise(() => {}));
    await pokazZDanymi();

    expect(screen.getByText("Wczytywanie rzetelności grupy…")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Uczestnicy" })).toBeInTheDocument();
  });

  it("błąd sekcji: komunikat tylko w sekcji, reszta działa; „Spróbuj ponownie” czyta dane jeszcze raz", async () => {
    pobierzRzetelnosc.mockRejectedValue(blad(500, "server_error", "Serwer rzetelności nie odpowiada."));
    await pokazZDanymi();

    const komunikat = await screen.findByText("Nie udało się wczytać sekcji");
    expect(komunikat.closest("[role='alert']")).toHaveTextContent("Serwer rzetelności nie odpowiada.");
    expect(screen.getByRole("heading", { level: 2, name: "Uczestnicy" })).toBeInTheDocument();

    pobierzRzetelnosc.mockResolvedValue(RZETELNOSC);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    });
    expect(pobierzRzetelnosc).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Poniżej progu")).toBeInTheDocument();
  });

  it("błąd sieci przy rzetelności: zdanie zastępcze", async () => {
    pobierzRzetelnosc.mockRejectedValue(new TypeError("Failed to fetch"));
    await pokazZDanymi();
    expect(await screen.findByText("Nie udało się wczytać danych o rzetelności grupy.")).toBeInTheDocument();
  });
});

describe("Moja grupa — obecności na terminach", () => {
  it("termin przyszły: lista wyboru i przycisk nieaktywne, a zdanie mówi, dlaczego", async () => {
    await pokazZDanymi({ ...GRUPA, slots: [TERMIN_PRZYSZLY] });

    expect(screen.getByRole("heading", { level: 3, name: "14 października 2026, 18:00" })).toBeInTheDocument();
    expect(screen.getByText("Zajęte miejsca: 2 z 3 · 90 min")).toBeInTheDocument();
    expect(screen.getByText("1 wolne miejsce")).toBeInTheDocument();
    expect(screen.getByText("Obecność oznaczysz po zakończeniu terminu.")).toBeInTheDocument();
    const zapisz = screen.getByRole("button", { name: "Zapisz obecności: 14 października 2026, 18:00" });
    expect(zapisz).toBeDisabled();
    expect(zapisz).toHaveAccessibleDescription("Obecność oznaczysz po zakończeniu terminu.");
    expect(screen.getByRole("combobox", { name: "Obecność: Marta Demo" })).toBeDisabled();
  });

  it("termin bez zapisanych osób: zdanie zamiast listy", async () => {
    await pokazZDanymi({ ...GRUPA, slots: [{ ...TERMIN_PRZYSZLY, signups: [], active_signups_count: 0, available_seats: 3 }] });
    expect(screen.getByText("Nikt nie zapisał się na ten termin.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Zapisz obecności/ })).not.toBeInTheDocument();
  });

  it("termin zakończony: zapisana obecność widoczna, wybór drugiej osoby i zapis wysyłają dokładnie mapę z wartościami", async () => {
    zapiszObecnosci.mockResolvedValue({
      ...TERMIN_ZAKONCZONY,
      signups: [
        { user: MARTA, signed_up_at: null, attendance: "present" },
        { user: FILIP, signed_up_at: null, attendance: "absent" },
      ],
    });
    await pokazZDanymi({ ...GRUPA, slots: [TERMIN_ZAKONCZONY] });
    expect(screen.getByText("0 wolnych miejsc")).toBeInTheDocument();
    expect(screen.getByText("Zajęte miejsca: 2 z 2 · 60 min · sala 4")).toBeInTheDocument();
    expect(screen.getByText("Obecność: Obecność")).toBeInTheDocument();
    expect(screen.getByText("Obecność: Nieoznaczona")).toBeInTheDocument();
    expect(saPowodyPytania()).toBe(false);

    await userEvent.click(screen.getByRole("combobox", { name: "Obecność: Filip Demo" }));
    await userEvent.click(screen.getByRole("option", { name: "Nieobecność" }));
    expect(saPowodyPytania()).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Zapisz obecności: 30 września 2026, 18:00" }));
    });

    expect(zapiszObecnosci).toHaveBeenCalledTimes(1);
    expect(zapiszObecnosci).toHaveBeenCalledWith(30, { "17": "present", "18": "absent" });
    expect(screen.getByText("Obecności zostały zapisane.")).toBeInTheDocument();
    expect(screen.getByText("Obecność: Nieobecność")).toBeInTheDocument();
    expect(saPowodyPytania()).toBe(false);
  });

  it("zapisywanie: napis przycisku się zmienia, drugie kliknięcie niczego nie wysyła", async () => {
    let zakoncz: (termin: unknown) => void = () => {};
    zapiszObecnosci.mockReturnValue(new Promise((rozwiaz) => (zakoncz = rozwiaz)));
    await pokazZDanymi({ ...GRUPA, slots: [TERMIN_ZAKONCZONY] });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Zapisz obecności: 30 września 2026, 18:00" }));
    });
    const wTrakcie = screen.getByRole("button", { name: "Zapisywanie obecności: 30 września 2026, 18:00" });
    expect(wTrakcie).toHaveTextContent("Zapisywanie…");
    fireEvent.click(wTrakcie);
    expect(zapiszObecnosci).toHaveBeenCalledTimes(1);

    await act(async () => zakoncz(TERMIN_ZAKONCZONY));
  });

  it("błąd zapisu: komunikat serwera albo zdanie zastępcze, wybrane wartości zostają", async () => {
    zapiszObecnosci.mockRejectedValue(blad(422, "validation_failed", "Obecność można oznaczyć dopiero po zakończeniu terminu."));
    await pokazZDanymi({ ...GRUPA, slots: [TERMIN_ZAKONCZONY] });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Zapisz obecności: 30 września 2026, 18:00" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się zapisać obecności");
    expect(screen.getByRole("alert")).toHaveTextContent("Obecność można oznaczyć dopiero po zakończeniu terminu.");

    zapiszObecnosci.mockRejectedValue(new TypeError("Failed to fetch"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Zapisz obecności: 30 września 2026, 18:00" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się zapisać obecności.");
  });
});

describe("Moja grupa — panel nowego terminu", () => {
  async function otworz() {
    const wynik = await pokazZDanymi();
    fireEvent.click(screen.getByRole("button", { name: "Utwórz termin" }));
    await screen.findByRole("heading", { level: 2, name: "Nowy termin superwizji" });
    return wynik;
  }

  it("otwarcie: fokus na nagłówku panelu, w nagłówku strony nie ma już przycisków akcji, w panelu jeden zielony przycisk", async () => {
    const { container } = await otworz();

    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2, name: "Nowy termin superwizji" }));
    expect(screen.getByRole("heading", { level: 1, name: "Moja grupa" })).toBeInTheDocument();
    expect(nazwyDzialan(container)).toEqual(["Wstecz", "Utwórz termin", "Wróć do grupy"]);
    expect(etykietyPol(container)).toEqual(["Data i godzina", "Czas trwania (minuty)", "Limit miejsc", "Miejsce lub link"]);
    expect(screen.getByLabelText(/Czas trwania/)).toHaveValue(90);
    expect(screen.getByLabelText(/Limit miejsc/)).toHaveValue(3);
    expect(screen.queryByRole("heading", { level: 2, name: "Uczestnicy" })).not.toBeInTheDocument();
  });

  it("bez daty przycisk jest niedostępny i mówi, dlaczego; z datą — aktywny", async () => {
    const { container } = await otworz();

    const przycisk = glowny(container);
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    expect(przycisk).toHaveAccessibleDescription("Podaj datę i godzinę spotkania.");
    fireEvent.click(przycisk);
    expect(utworzTermin).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Data i godzina/), { target: { value: "2026-10-20T18:00" } });
    expect(glowny(container)).not.toHaveAttribute("aria-disabled");
    expect(glowny(container)).not.toHaveAttribute("aria-describedby");
  });

  it("utworzenie: żądanie z wartościami z pól, powrót do grupy, potwierdzenie i nowy termin we właściwym miejscu listy", async () => {
    const nowy = { ...TERMIN_PRZYSZLY, id: 40, starts_at: "2026-10-20T16:00:00Z", seats_limit: 4, available_seats: 4, active_signups_count: 0, signups: [] };
    utworzTermin.mockResolvedValue(nowy);
    const { container } = await otworz();
    fireEvent.change(screen.getByLabelText(/Data i godzina/), { target: { value: "2026-10-20T18:00" } });
    fireEvent.change(screen.getByLabelText(/Limit miejsc/), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Miejsce lub link"), { target: { value: "sala 4" } });
    expect(saPowodyPytania()).toBe(true);

    await act(async () => {
      fireEvent.click(glowny(container));
    });

    expect(utworzTermin).toHaveBeenCalledTimes(1);
    expect(utworzTermin).toHaveBeenCalledWith({ start: "2026-10-20T18:00", czas: "90", miejsca: "4", miejsce: "sala 4" });
    expect(screen.getByText("Termin został utworzony.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Uczestnicy" })).toBeInTheDocument();
    const naglowki = screen.getAllByRole("heading", { level: 3 }).map((n) => n.textContent);
    expect(naglowki.slice(0, 3)).toEqual(["30 września 2026, 18:00", "14 października 2026, 18:00", "20 października 2026, 18:00"]);
    expect(saPowodyPytania()).toBe(false);
  });

  it("błędy serwera (422): komunikaty pod polami i nazwy pól w podsumowaniu, panel zostaje otwarty", async () => {
    utworzTermin.mockRejectedValue(
      blad(422, "validation_failed", "Popraw zaznaczone pola.", {
        errors: { seats_limit: ["Limit miejsc jest zbyt duży."], starts_at: ["Podaj prawidłową datę i godzinę spotkania."] },
      }),
    );
    const { container } = await otworz();
    fireEvent.change(screen.getByLabelText(/Data i godzina/), { target: { value: "2026-10-20T18:00" } });

    await act(async () => {
      fireEvent.click(glowny(container));
    });

    expect(screen.getByText("Nie udało się utworzyć terminu").closest("[role='alert']")).toHaveTextContent(
      "Popraw zaznaczone pola: Data i godzina, Limit miejsc.",
    );
    expect(screen.getByText("Limit miejsc jest zbyt duży.")).toBeInTheDocument();
    expect(screen.getByText("Podaj prawidłową datę i godzinę spotkania.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Limit miejsc/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("heading", { level: 2, name: "Nowy termin superwizji" })).toBeInTheDocument();
  });

  it("inny błąd: komunikat serwera albo zdanie zastępcze; wpisane wartości zostają", async () => {
    utworzTermin.mockRejectedValue(new TypeError("Failed to fetch"));
    const { container } = await otworz();
    fireEvent.change(screen.getByLabelText(/Data i godzina/), { target: { value: "2026-10-20T18:00" } });

    await act(async () => {
      fireEvent.click(glowny(container));
    });

    expect(screen.getByText("Nie udało się utworzyć terminu").closest("[role='alert']")).toHaveTextContent("Nie udało się utworzyć terminu.");
    expect(screen.getByLabelText(/Data i godzina/)).toHaveValue("2026-10-20T18:00");
  });

  it("tworzenie: napis przycisku się zmienia, a „Wróć do grupy” zamyka panel bez żądania", async () => {
    let zakoncz: (termin: unknown) => void = () => {};
    utworzTermin.mockReturnValue(new Promise((rozwiaz) => (zakoncz = rozwiaz)));
    const { container } = await otworz();
    fireEvent.change(screen.getByLabelText(/Data i godzina/), { target: { value: "2026-10-20T18:00" } });

    await act(async () => {
      fireEvent.click(glowny(container));
    });
    expect(glowny(container)).toHaveTextContent("Tworzenie…");
    fireEvent.click(glowny(container));
    expect(utworzTermin).toHaveBeenCalledTimes(1);
    await act(async () => zakoncz({ ...TERMIN_PRZYSZLY, id: 41 }));

    fireEvent.click(screen.getByRole("button", { name: "Utwórz termin" }));
    await screen.findByRole("heading", { level: 2, name: "Nowy termin superwizji" });
    fireEvent.click(screen.getByRole("button", { name: "Wróć do grupy" }));
    expect(screen.getByRole("heading", { level: 2, name: "Uczestnicy" })).toBeInTheDocument();
    expect(utworzTermin).toHaveBeenCalledTimes(1);
  });
});

describe("Moja grupa — panel zgłoszenia sprawy", () => {
  async function otworz() {
    const wynik = await pokazZDanymi();
    fireEvent.click(screen.getByRole("button", { name: "Zgłoś sprawę" }));
    await screen.findByRole("heading", { level: 2, name: "Zgłoszenie sprawy do administracji" });
    return wynik;
  }

  it("otwarcie: fokus na nagłówku panelu, pola z licznikami znaków, przycisk niedostępny z powodem", async () => {
    const { container } = await otworz();

    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2, name: "Zgłoszenie sprawy do administracji" }));
    expect(nazwyDzialan(container)).toEqual(["Wstecz", "Zgłoś sprawę", "Wróć do grupy"]);
    expect(etykietyPol(container)).toEqual(["Dotyczy osoby (opcjonalnie)", "Temat", "Opis sprawy"]);
    expect(screen.getByText("0/255 znaków")).toBeInTheDocument();
    expect(screen.getByText("0/5000 znaków")).toBeInTheDocument();
    const przycisk = glowny(container);
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    expect(przycisk).toHaveAccessibleDescription("Wpisz temat i opis sprawy.");
    expect(screen.getByRole("combobox", { name: "Dotyczy osoby (opcjonalnie)" })).toBeInTheDocument();
  });

  it("zgłoszenie: żądanie z osobą z grupy, powrót do grupy i potwierdzenie", async () => {
    zglosSprawe.mockResolvedValue({});
    const { container } = await otworz();
    await userEvent.click(screen.getByRole("combobox", { name: "Dotyczy osoby (opcjonalnie)" }));
    await userEvent.click(screen.getByRole("option", { name: "Marta Demo" }));
    fireEvent.change(screen.getByLabelText(/Temat/), { target: { value: "Nieobecności" } });
    fireEvent.change(screen.getByLabelText(/Opis sprawy/), { target: { value: "Opis sprawy." } });
    expect(screen.getByText("12/255 znaków")).toBeInTheDocument();
    expect(glowny(container)).not.toHaveAttribute("aria-disabled");
    expect(saPowodyPytania()).toBe(true);

    await act(async () => {
      fireEvent.click(glowny(container));
    });

    expect(zglosSprawe).toHaveBeenCalledTimes(1);
    expect(zglosSprawe).toHaveBeenCalledWith({ osoba: "17", temat: "Nieobecności", opis: "Opis sprawy." });
    expect(screen.getByText("Sprawa została zgłoszona do administracji.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Uczestnicy" })).toBeInTheDocument();
    expect(saPowodyPytania()).toBe(false);
  });

  it("temat i opis jest wymagany osobno: powód nazywa to, czego brakuje", async () => {
    const { container } = await otworz();
    fireEvent.change(screen.getByLabelText(/Temat/), { target: { value: "Temat" } });
    expect(glowny(container)).toHaveAccessibleDescription("Wpisz opis sprawy.");
  });

  it("błędy serwera (422): komunikaty pod polami i nazwy pól w podsumowaniu", async () => {
    zglosSprawe.mockRejectedValue(
      blad(422, "validation_failed", "Popraw zaznaczone pola.", {
        errors: { volunteer_id: ["Możesz wskazać wyłącznie osobę ze swojej grupy."], subject: ["Temat może mieć najwyżej 255 znaków."] },
      }),
    );
    const { container } = await otworz();
    fireEvent.change(screen.getByLabelText(/Temat/), { target: { value: "Temat" } });
    fireEvent.change(screen.getByLabelText(/Opis sprawy/), { target: { value: "Opis" } });

    await act(async () => {
      fireEvent.click(glowny(container));
    });

    expect(screen.getByText("Nie udało się zgłosić sprawy").closest("[role='alert']")).toHaveTextContent(
      "Popraw zaznaczone pola: Dotyczy osoby, Temat.",
    );
    expect(screen.getByText("Możesz wskazać wyłącznie osobę ze swojej grupy.")).toBeInTheDocument();
    expect(screen.getByText("Temat może mieć najwyżej 255 znaków.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Zgłoszenie sprawy do administracji" })).toBeInTheDocument();
  });

  it("inny błąd: zdanie zastępcze; pola zostają", async () => {
    zglosSprawe.mockRejectedValue(new TypeError("Failed to fetch"));
    const { container } = await otworz();
    fireEvent.change(screen.getByLabelText(/Temat/), { target: { value: "Temat" } });
    fireEvent.change(screen.getByLabelText(/Opis sprawy/), { target: { value: "Opis" } });

    await act(async () => {
      fireEvent.click(glowny(container));
    });

    expect(screen.getByText("Nie udało się zgłosić sprawy").closest("[role='alert']")).toHaveTextContent("Nie udało się zgłosić sprawy.");
    expect(screen.getByLabelText(/Temat/)).toHaveValue("Temat");
  });

  it("limity znaków: wpisany tekst ponad limit jest ucinany do limitu", async () => {
    await otworz();
    fireEvent.change(screen.getByLabelText(/Temat/), { target: { value: "x".repeat(300) } });
    expect(screen.getByLabelText(/Temat/)).toHaveValue("x".repeat(255));
    expect(screen.getByText("255/255 znaków")).toBeInTheDocument();
  });
});
