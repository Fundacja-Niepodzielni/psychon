import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { saPowodyPytania } from "@/design-system/szablony/NiezapisaneZmiany";
import { ID_TESTU, pytania } from "./atrapy";

/**
 * Stany ekranu „Pytania testu”: co osoba widzi (nagłówki, zielony przycisk i to,
 * czy jest czynny, zdania, nazwy odnośników i przycisków, etykiety pól i błędy)
 * i co może zrobić. Żądania są atrapami modułu danych; klasyfikacja błędów jest
 * prawdziwa, więc stany powstają z tych samych odpowiedzi serwera co na żywo.
 */

const pobierzPytania = vi.fn();
const dodajPytanie = vi.fn();
const zapiszPytanie = vi.fn();
const usunPytanie = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/nowy-front/admin/testy/10/pytania",
}));

// Odczyt konta wspólnego ekranu odmowy: bez sieci, ekran pomija wtedy zdanie o osobie.
vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: () => Promise.reject(new TypeError("Brak sieci w teście")),
}));

vi.mock("../dane", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../dane")>()),
  pobierzPytania: (...args: unknown[]) => pobierzPytania(...args),
  dodajPytanie: (...args: unknown[]) => dodajPytanie(...args),
  zapiszPytanie: (...args: unknown[]) => zapiszPytanie(...args),
  usunPytanie: (...args: unknown[]) => usunPytanie(...args),
}));

const { ApiError } = await import("@/lib/api/klient");
const { PytaniaTestu } = await import("../PytaniaTestu");

const blad = (status: number, code: string, message = "Zdanie serwera.", errors?: Record<string, string[]>) =>
  new ApiError({ status, code, message, errors });

/** Zielone przyciski poza oknami (formularza i potwierdzenia). */
function zielone() {
  return screen
    .queryAllByRole("button")
    .filter((przycisk) => przycisk.closest('[role="dialog"]') === null)
    .filter((przycisk) => przycisk.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)));
}

function przyciskGlowny() {
  const lista = zielone();
  expect(lista).toHaveLength(1);
  return lista[0];
}

async function otworz(opcje: { lista?: unknown; blad?: unknown; idTestu?: string; panel?: "administracja" | "prowadzacy"; idKursu?: string | null } = {}) {
  if (opcje.blad !== undefined) pobierzPytania.mockRejectedValue(opcje.blad);
  else pobierzPytania.mockResolvedValue(opcje.lista ?? pytania());
  const wynik = render(<PytaniaTestu idTestu={opcje.idTestu ?? String(ID_TESTU)} panel={opcje.panel ?? "administracja"} idKursu={opcje.idKursu ?? null} />);
  await waitFor(() => expect(screen.queryByText("Wczytywanie pytań…")).toBeNull());
  return wynik;
}

async function otworzDodawanie(uzytkownik: ReturnType<typeof userEvent.setup>) {
  await uzytkownik.click(przyciskGlowny());
  return screen.getByRole("dialog", { name: "Nowe pytanie" });
}

/** Przycisk zapisu w oknie formularza (zielony okna, nie ekranu). */
function zapiszWOknie(okno: HTMLElement) {
  return within(okno).getByRole("button", { name: /^(Zapisz pytanie|Zapisywanie…)$/ });
}

async function wypelnijNowe(uzytkownik: ReturnType<typeof userEvent.setup>) {
  const formularz = await otworzDodawanie(uzytkownik);
  await uzytkownik.type(within(formularz).getByLabelText(/^Treść pytania/), "Jak zakończyć rozmowę wspierającą?");
  await uzytkownik.type(within(formularz).getByLabelText(/^Odpowiedź 1/), "Podsumować i ustalić dalszy krok");
  await uzytkownik.type(within(formularz).getByLabelText(/^Odpowiedź 2/), "Przerwać bez słowa");
  return formularz;
}

beforeEach(() => {
  pobierzPytania.mockReset();
  dodajPytanie.mockReset();
  zapiszPytanie.mockReset();
  usunPytanie.mockReset();
  push.mockReset();
});

describe("ładowanie", () => {
  it("tytuł „Pytania testu”, zdanie stanu, okruszki do kursów i brak zielonego przycisku", () => {
    pobierzPytania.mockReturnValue(new Promise(() => {}));
    render(<PytaniaTestu idTestu="10" panel="administracja" />);
    expect(screen.getByRole("heading", { level: 1, name: "Pytania testu" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Wczytywanie pytań…");
    expect(screen.getByRole("link", { name: "Kursy" })).toHaveAttribute("href", "/admin/kursy");
    expect(screen.getByRole("button", { name: "Wstecz" })).toBeInTheDocument();
    expect(zielone()).toHaveLength(0);
    expect(pobierzPytania).toHaveBeenCalledWith("administracja", 10);
  });
});

describe("błąd odczytu", () => {
  it("komunikat błędu ze zdaniem serwera i czynny „Spróbuj ponownie”, który czyta pytania od nowa", async () => {
    const uzytkownik = userEvent.setup();
    await otworz({ blad: blad(500, "server_error", "Serwer chwilowo nie odpowiada.") });

    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się wczytać pytań testu");
    expect(screen.getByText("Serwer chwilowo nie odpowiada.")).toBeInTheDocument();
    expect(zielone()).toHaveLength(0);
    const przycisk = screen.getByRole("button", { name: "Spróbuj ponownie" });
    expect(przycisk).toBeEnabled();

    pobierzPytania.mockResolvedValue(pytania());
    await uzytkownik.click(przycisk);
    expect(await screen.findByRole("heading", { level: 3, name: "Pytanie 1" })).toBeInTheDocument();
    expect(pobierzPytania).toHaveBeenCalledTimes(2);
  });
});

describe("brak połączenia", () => {
  it("„Brak połączenia”, zdanie o internecie i czynny „Spróbuj ponownie”", async () => {
    await otworz({ blad: new TypeError("Failed to fetch") });
    expect(screen.getByRole("alert")).toHaveTextContent("Brak połączenia");
    expect(screen.getByText("Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeEnabled();
  });
});

describe("brak dostępu — wspólny ekran odmowy", () => {
  it("odmowa serwera: nagłówek odmowy, dla kogo jest ekran, zdanie serwera i jeden przycisk powrotu", async () => {
    const uzytkownik = userEvent.setup();
    await otworz({ blad: blad(403, "forbidden", "Nie masz dostępu do tego zasobu.") });

    expect(screen.getByRole("heading", { level: 2, name: "Nie masz dostępu do tego ekranu" })).toBeInTheDocument();
    expect(screen.getByText("Ten ekran jest dla administracji.")).toBeInTheDocument();
    expect(screen.getByText("Nie masz dostępu do tego zasobu.")).toBeInTheDocument();
    expect(zielone()).toHaveLength(0);
    await uzytkownik.click(screen.getByRole("button", { name: "Wróć do kursów" }));
    expect(push).toHaveBeenCalledWith("/admin/kursy");
  });
});

describe("nie ma testu", () => {
  it("404 serwera: „Nie znaleziono testu” z powrotem do kursów", async () => {
    await otworz({ blad: blad(404, "not_found") });
    expect(screen.getByRole("heading", { level: 2, name: "Nie znaleziono testu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wróć do kursów" })).toBeInTheDocument();
  });

  it("adres bez poprawnego numeru testu: ten sam stan, bez żądania", async () => {
    render(<PytaniaTestu idTestu="abc" panel="administracja" />);
    expect(screen.getByRole("heading", { level: 2, name: "Nie znaleziono testu" })).toBeInTheDocument();
    expect(pobierzPytania).not.toHaveBeenCalled();
  });
});

describe("brak pytań", () => {
  it("stan pusty, opis „0 pytań” i czynny „Dodaj pytanie”", async () => {
    const uzytkownik = userEvent.setup();
    await otworz({ lista: [] });

    expect(screen.getByRole("heading", { level: 2, name: "Ten test nie ma jeszcze pytań" })).toBeInTheDocument();
    expect(screen.getByText("Test końcowy · 0 pytań")).toBeInTheDocument();
    const przycisk = przyciskGlowny();
    expect(przycisk).toHaveTextContent("Dodaj pytanie");
    expect(przycisk).not.toHaveAttribute("aria-disabled");
    await uzytkownik.click(screen.getByRole("button", { name: "Dodaj pierwsze pytanie" }));
    expect(screen.getByRole("dialog", { name: "Nowe pytanie" })).toBeInTheDocument();
  });
});

describe("lista pytań", () => {
  it("numer, treść, rodzaj i liczba odpowiedzi; przyciski z nazwą pytania; opis z odmianą", async () => {
    await otworz();

    expect(screen.getByText("Test końcowy · 3 pytania")).toBeInTheDocument();
    const lista = screen.getByRole("region", { name: "Pytania" });
    const wiersze = within(lista).getAllByRole("listitem").filter((wiersz) => wiersz.hasAttribute("data-ruch-klucz"));
    expect(wiersze).toHaveLength(3);
    expect(within(wiersze[2]).getByRole("heading", { level: 3, name: "Pytanie 3" })).toBeInTheDocument();
    expect(within(wiersze[2]).getByText("Kiedy trzeba wezwać pomoc?")).toBeInTheDocument();
    expect(within(wiersze[2]).getByText("Wybór jednej odpowiedzi · 3 odpowiedzi")).toBeInTheDocument();
    expect(within(wiersze[0]).getByText("Wybór jednej odpowiedzi · 2 odpowiedzi")).toBeInTheDocument();
    for (const numer of [1, 2, 3]) {
      expect(screen.getByRole("button", { name: `Edytuj pytanie ${numer}` })).toBeEnabled();
      expect(screen.getByRole("button", { name: `Usuń pytanie ${numer}` })).toBeEnabled();
    }
    expect(przyciskGlowny()).toHaveTextContent("Dodaj pytanie");
    expect(screen.getByRole("heading", { level: 2, name: "Jak działają pytania" })).toBeInTheDocument();
  });
});

describe("dodawanie", () => {
  it("okno formularza: etykiety pól, odpowiedź poprawna zaznaczona, fokus na treści, zielony „Zapisz pytanie” w oknie", async () => {
    const uzytkownik = userEvent.setup();
    await otworz();
    const formularz = await otworzDodawanie(uzytkownik);

    const tresc = within(formularz).getByLabelText(/^Treść pytania/);
    expect(tresc).toHaveFocus();
    expect(tresc).toHaveAccessibleDescription("Najwyżej 2000 znaków.");
    expect(within(formularz).getByRole("group", { name: "Odpowiedzi — zaznacz jedną odpowiedź poprawną" })).toBeInTheDocument();
    expect(within(formularz).getByLabelText(/^Odpowiedź 1/)).toHaveValue("");
    expect(within(formularz).getByRole("radio", { name: "Odpowiedź poprawna: odpowiedź 1" })).toBeChecked();
    expect(within(formularz).getByRole("radio", { name: "Odpowiedź poprawna: odpowiedź 2" })).not.toBeChecked();
    const przycisk = zapiszWOknie(formularz);
    expect(przycisk).toHaveTextContent("Zapisz pytanie");
    expect(przycisk).not.toHaveAttribute("aria-disabled");
    expect(within(formularz).getByRole("button", { name: "Anuluj" })).toBeEnabled();
    expect(przyciskGlowny()).toHaveTextContent("Dodaj pytanie");
  });

  it("nieczynne usunięcie odpowiedzi mówi dlaczego; dodanie i usunięcie odpowiedzi", async () => {
    const uzytkownik = userEvent.setup();
    await otworz();
    const formularz = await otworzDodawanie(uzytkownik);

    const usunOdpowiedz = within(formularz).getByRole("button", { name: "Usuń odpowiedź 1" });
    expect(usunOdpowiedz).toBeDisabled();
    expect(usunOdpowiedz).toHaveAccessibleDescription("Pytanie musi mieć co najmniej 2 odpowiedzi, więc tej nie usuniesz.");

    await uzytkownik.click(within(formularz).getByRole("button", { name: "Dodaj odpowiedź" }));
    expect(within(formularz).getByLabelText(/^Odpowiedź 3/)).toBeInTheDocument();
    expect(within(formularz).getByRole("button", { name: "Usuń odpowiedź 1" })).toBeEnabled();
    await uzytkownik.click(within(formularz).getByRole("radio", { name: "Odpowiedź poprawna: odpowiedź 3" }));
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Usuń odpowiedź 3" }));
    expect(within(formularz).getByRole("radio", { name: "Odpowiedź poprawna: odpowiedź 1" })).toBeChecked();
  });

  it("walidacja przed wysłaniem: błędy przy treści i przy pustych odpowiedziach, fokus na podsumowaniu, bez żądania", async () => {
    const uzytkownik = userEvent.setup();
    await otworz();
    const formularz = await otworzDodawanie(uzytkownik);
    await uzytkownik.click(zapiszWOknie(formularz));

    expect(within(formularz).getByRole("group", { name: "Popraw dane w formularzu" })).toHaveFocus();
    const tresc = within(formularz).getByLabelText(/^Treść pytania/);
    expect(tresc).toHaveAttribute("aria-invalid", "true");
    expect(tresc).toHaveAccessibleDescription(/Treść pytania nie może być pusta\./);
    expect(within(formularz).getByLabelText(/^Odpowiedź 1/)).toHaveAccessibleDescription("Każda odpowiedź musi mieć treść.");
    expect(within(formularz).getByLabelText(/^Odpowiedź 2/)).toHaveAccessibleDescription("Każda odpowiedź musi mieć treść.");
    expect(dodajPytanie).not.toHaveBeenCalled();
  });

  it("błędy pól z odpowiedzi serwera (422) stoją przy polach; zdanie ogólne bez błędów pól — nad formularzem", async () => {
    const uzytkownik = userEvent.setup();
    dodajPytanie
      .mockRejectedValueOnce(
        blad(422, "validation_failed", "Popraw zaznaczone pola.", {
          body: ["Treść pytania może mieć najwyżej 2000 znaków."],
          answers: ["Zaznacz dokładnie jedną poprawną odpowiedź."],
          "answers.1.body": ["Treść odpowiedzi może mieć najwyżej 1000 znaków."],
        }),
      )
      .mockRejectedValueOnce(blad(500, "server_error", ""))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await otworz();
    const formularz = await wypelnijNowe(uzytkownik);

    await uzytkownik.click(zapiszWOknie(formularz));
    const podsumowanie = await within(formularz).findByRole("group", { name: "Popraw dane w formularzu" });
    expect(podsumowanie).toHaveFocus();
    expect(within(podsumowanie).getByRole("link", { name: "Treść pytania może mieć najwyżej 2000 znaków." })).toBeInTheDocument();
    expect(within(podsumowanie).getByRole("link", { name: "Zaznacz dokładnie jedną poprawną odpowiedź." })).toBeInTheDocument();
    expect(within(formularz).getByLabelText(/^Treść pytania/)).toHaveAccessibleDescription(/Treść pytania może mieć najwyżej 2000 znaków\./);
    expect(within(formularz).getByRole("group", { name: "Odpowiedzi — zaznacz jedną odpowiedź poprawną" })).toHaveAccessibleDescription("Zaznacz dokładnie jedną poprawną odpowiedź.");
    expect(within(formularz).getByLabelText(/^Odpowiedź 2/)).toHaveAccessibleDescription("Treść odpowiedzi może mieć najwyżej 1000 znaków.");
    expect(within(formularz).queryByRole("heading", { name: "Nie udało się zapisać pytania" })).toBeNull();

    await uzytkownik.click(zapiszWOknie(formularz));
    expect(await within(formularz).findByRole("heading", { name: "Nie udało się zapisać pytania" })).toBeInTheDocument();
    expect(within(formularz).getByText("Nie udało się dodać pytania.")).toBeInTheDocument();

    await uzytkownik.click(zapiszWOknie(formularz));
    expect(await within(formularz).findByText("Nie udało się połączyć z serwerem. Sprawdź internet i spróbuj ponownie.")).toBeInTheDocument();
    expect(within(formularz).getByLabelText(/^Odpowiedź 1/)).toHaveValue("Podsumować i ustalić dalszy krok");
  });

  it("zapisywanie: „Zapisywanie…” nieczynne, pola zablokowane, jedno żądanie", async () => {
    const uzytkownik = userEvent.setup();
    dodajPytanie.mockReturnValue(new Promise(() => {}));
    await otworz();
    const formularz = await wypelnijNowe(uzytkownik);
    await uzytkownik.click(zapiszWOknie(formularz));

    const przycisk = zapiszWOknie(formularz);
    expect(przycisk).toHaveTextContent("Zapisywanie…");
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    expect(within(formularz).getByLabelText(/^Treść pytania/)).toBeDisabled();
    await uzytkownik.click(przycisk);
    expect(dodajPytanie).toHaveBeenCalledTimes(1);
  });

  it("zapisane: żądanie z treścią i odpowiedziami, powiadomienie, nowe pytanie na końcu listy, formularz zamknięty", async () => {
    const uzytkownik = userEvent.setup();
    dodajPytanie.mockResolvedValue({
      id: 44,
      body: "Jak zakończyć rozmowę wspierającą?",
      sequence_order: 4,
      answers: [
        { id: 240, body: "Podsumować i ustalić dalszy krok", is_correct: true },
        { id: 241, body: "Przerwać bez słowa", is_correct: false },
      ],
    });
    await otworz();
    const formularz = await wypelnijNowe(uzytkownik);
    await uzytkownik.click(zapiszWOknie(formularz));

    expect(await screen.findByRole("status")).toHaveTextContent("Dodano pytanie 4.");
    expect(dodajPytanie).toHaveBeenCalledWith("administracja", 10, {
      body: "Jak zakończyć rozmowę wspierającą?",
      answers: [
        { body: "Podsumować i ustalić dalszy krok", is_correct: true },
        { body: "Przerwać bez słowa", is_correct: false },
      ],
    });
    expect(screen.getByRole("heading", { level: 3, name: "Pytanie 4" })).toHaveFocus();
    expect(screen.queryByRole("dialog", { name: "Nowe pytanie" })).toBeNull();
    expect(screen.getByText("Test końcowy · 4 pytania")).toBeInTheDocument();
    expect(przyciskGlowny()).toHaveTextContent("Dodaj pytanie");
  });
});

describe("edycja", () => {
  it("formularz z treścią i odpowiedziami pytania; zapis wysyła cały zestaw z identyfikatorami", async () => {
    const uzytkownik = userEvent.setup();
    const po = { ...pytania()[1], answers: [{ id: 220, body: "Uważne słuchanie i parafraza", is_correct: false }, { id: 221, body: "Szybkie udzielanie rad", is_correct: true }] };
    zapiszPytanie.mockResolvedValue(po);
    await otworz();
    await uzytkownik.click(screen.getByRole("button", { name: "Edytuj pytanie 2" }));

    const formularz = screen.getByRole("dialog", { name: "Edycja pytania 2" });
    expect(within(formularz).getByLabelText(/^Treść pytania/)).toHaveValue("Która postawa wspiera rozmowę, która nie ocenia?");
    expect(within(formularz).getByLabelText(/^Odpowiedź 1/)).toHaveValue("Uważne słuchanie i parafraza");
    expect(within(formularz).getByRole("radio", { name: "Odpowiedź poprawna: odpowiedź 1" })).toBeChecked();
    expect(przyciskGlowny()).toHaveTextContent("Dodaj pytanie");

    await uzytkownik.click(within(formularz).getByRole("radio", { name: "Odpowiedź poprawna: odpowiedź 2" }));
    expect(saPowodyPytania()).toBe(true);
    await uzytkownik.click(zapiszWOknie(formularz));

    expect(zapiszPytanie).toHaveBeenCalledWith("administracja", 42, {
      body: "Która postawa wspiera rozmowę, która nie ocenia?",
      answers: [
        { id: 220, body: "Uważne słuchanie i parafraza", is_correct: false },
        { id: 221, body: "Szybkie udzielanie rad", is_correct: true },
      ],
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Zapisano zmiany w pytaniu 2.");
    expect(screen.getByRole("heading", { level: 3, name: "Pytanie 2" })).toHaveFocus();
    expect(saPowodyPytania()).toBe(false);
  });

  it("„Anuluj” zamyka okno bez żądania, zdejmuje pytanie o niezapisane zmiany i oddaje fokus przyciskowi „Edytuj”", async () => {
    const uzytkownik = userEvent.setup();
    await otworz();
    await uzytkownik.click(screen.getByRole("button", { name: "Edytuj pytanie 1" }));
    const formularz = screen.getByRole("dialog", { name: "Edycja pytania 1" });
    expect(saPowodyPytania()).toBe(false);
    await uzytkownik.type(within(formularz).getByLabelText(/^Treść pytania/), " Uzupełnienie");
    expect(saPowodyPytania()).toBe(true);

    await uzytkownik.click(within(formularz).getByRole("button", { name: "Anuluj" }));
    expect(screen.queryByRole("dialog", { name: "Edycja pytania 1" })).toBeNull();
    expect(screen.getByRole("button", { name: "Edytuj pytanie 1" })).toHaveFocus();
    expect(saPowodyPytania()).toBe(false);
    expect(zapiszPytanie).not.toHaveBeenCalled();
  });
});

describe("usuwanie z potwierdzeniem", () => {
  it("okno mówi, co zniknie; „Zostaw pytanie” niczego nie usuwa", async () => {
    const uzytkownik = userEvent.setup();
    await otworz();
    await uzytkownik.click(screen.getByRole("button", { name: "Usuń pytanie 3" }));

    const okno = screen.getByRole("dialog", { name: "Usunąć pytanie 3?" });
    expect(within(okno).getByText("„Kiedy trzeba wezwać pomoc?”")).toBeInTheDocument();
    expect(
      within(okno).getByText("Usuniesz treść pytania i 3 odpowiedzi, w tym odpowiedź poprawną. Tego nie da się cofnąć. Wyniki wcześniejszych podejść zostaną bez zmian."),
    ).toBeInTheDocument();
    await uzytkownik.click(within(okno).getByRole("button", { name: "Zostaw pytanie" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(usunPytanie).not.toHaveBeenCalled();
  });

  it("„Usuń pytanie”: żądanie, pytanie znika, powiadomienie, fokus na liście", async () => {
    const uzytkownik = userEvent.setup();
    usunPytanie.mockResolvedValue({ id: 42, deleted: true });
    await otworz();
    await uzytkownik.click(screen.getByRole("button", { name: "Usuń pytanie 2" }));
    await uzytkownik.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Usuń pytanie" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Usunięto pytanie 2.");
    expect(usunPytanie).toHaveBeenCalledWith("administracja", 42);
    // Numer na ekranie to miejsce na liście: usunięte znika, trzecie staje się drugim.
    expect(screen.queryByText("Która postawa wspiera rozmowę, która nie ocenia?")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Pytanie 3" })).toBeNull();
    expect(screen.getByRole("heading", { level: 3, name: "Pytanie 2" })).toHaveAttribute("id", "pytanie-testu-43");
    expect(screen.getByRole("heading", { level: 2, name: "Pytania" })).toHaveFocus();
    expect(screen.getByText("Test końcowy · 2 pytania")).toBeInTheDocument();
  });

  it("w czasie usuwania przyciski są nieczynne ze zdaniem; błąd usuwania zostawia pytanie i mówi dlaczego", async () => {
    const uzytkownik = userEvent.setup();
    let odrzuc: (powod: unknown) => void = () => {};
    usunPytanie.mockReturnValue(new Promise((_, nie) => (odrzuc = nie)));
    await otworz();
    await uzytkownik.click(screen.getByRole("button", { name: "Usuń pytanie 1" }));
    await uzytkownik.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Usuń pytanie" }));

    const usuwany = screen.getByRole("button", { name: "Usuń pytanie 1" });
    expect(usuwany).toHaveTextContent("Usuwanie…");
    expect(usuwany).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edytuj pytanie 2" })).toHaveAccessibleDescription("Usuwamy pytanie. Poczekaj chwilę.");

    odrzuc(blad(500, "server_error", ""));
    expect(await screen.findByRole("heading", { name: "Nie udało się usunąć pytania" })).toBeInTheDocument();
    expect(screen.getByText("Nie udało się usunąć pytania.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Pytanie 1" })).toBeInTheDocument();
  });
});
