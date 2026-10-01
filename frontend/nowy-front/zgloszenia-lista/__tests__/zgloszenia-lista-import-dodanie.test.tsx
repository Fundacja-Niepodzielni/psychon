import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Dwie akcje ekranu listy zgłoszeń: import z pliku CSV
 * (`POST /admin/applications/import`, multipart) i ręczne dodanie zgłoszenia
 * (`POST /admin/applications`). Lista (`GET`) jest atrapą `apiPaged`, zapisy —
 * atrapą `api`; sprawdzamy to, co idzie do serwera, i to, co widzi osoba.
 */

const apiPaged = vi.fn();
const api = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

// Ekran bierze klienta z `@/lib/api/klient`; beczkę `@/lib/api` podmieniamy zapobiegawczo (reszta funkcji beczki zostaje prawdziwa), żeby przyszły import z beczki nie poszedł do prawdziwego transportu.
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  api: (...args: unknown[]) => api(...args),
}));

vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return {
    ...oryginal,
    apiPaged: (...args: unknown[]) => apiPaged(...args),
    api: (...args: unknown[]) => api(...args),
  };
});

const { ApiError } = await import("@/lib/api/klient");
const { ZgloszeniaLista } = await import("../ZgloszeniaLista");

function zgloszenie(id: number) {
  return {
    id,
    edition_id: 1,
    first_name: "Anna",
    last_name: `Kandydat${id}`,
    email: `kandydat${id}@demo.pl`,
    phone: null,
    source: null,
    role: "volunteer",
    payload: null,
    university: null,
    graduation_year: null,
    consent_regulamin_at: null,
    consent_polityka_at: null,
    status: "new",
    rejection_reason: null,
    decided_by: null,
    decided_at: null,
    user_id: null,
    has_diploma_scan: false,
    diploma_scan_url: null,
    created_at: "2026-09-20T10:00:00Z",
    updated_at: "2026-09-20T10:00:00Z",
  };
}

function odpowiedz(dane: unknown[]) {
  return { data: dane, meta: { current_page: 1, per_page: 25, total: dane.length, last_page: 1 } };
}

function blad(status: number, code: string, errors?: Record<string, string[]>) {
  return new ApiError({ status, code, message: "Komunikat serwera, który nie wychodzi na ekran.", errors });
}

function przyciskiGlowne(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("button[class*='primary']"));
}

const PLIK = () => new File(["first_name,last_name,email\n"], "zgloszenia.csv", { type: "text/csv" });

async function otworzImport(uzytkownik: ReturnType<typeof userEvent.setup>, container: HTMLElement) {
  await uzytkownik.click(await screen.findByRole("button", { name: "Importuj z pliku CSV" }));
  const pole = container.querySelector<HTMLInputElement>("input[type='file']");
  if (pole === null) throw new Error("Brak pola wyboru pliku po otwarciu importu.");
  return pole;
}

async function otworzFormularz(uzytkownik: ReturnType<typeof userEvent.setup>) {
  await uzytkownik.click(await screen.findByRole("button", { name: "Dodaj zgłoszenie" }));
  await screen.findByRole("form", { name: "Nowe zgłoszenie" });
}

async function wypelnij(
  uzytkownik: ReturnType<typeof userEvent.setup>,
  wartosci: { imie?: string; nazwisko?: string; email?: string; telefon?: string },
) {
  if (wartosci.imie) await uzytkownik.type(screen.getByRole("textbox", { name: /^Imię/ }), wartosci.imie);
  if (wartosci.nazwisko) await uzytkownik.type(screen.getByRole("textbox", { name: /^Nazwisko/ }), wartosci.nazwisko);
  if (wartosci.email) await uzytkownik.type(screen.getByRole("textbox", { name: /^E-mail/ }), wartosci.email);
  if (wartosci.telefon) await uzytkownik.type(screen.getByRole("textbox", { name: /^Telefon/ }), wartosci.telefon);
}

beforeEach(() => {
  apiPaged.mockReset();
  api.mockReset();
  apiPaged.mockResolvedValue(odpowiedz([zgloszenie(11)]));
});

describe("Zgłoszenia rekrutacyjne — import z pliku", () => {
  it("sukces z pominiętymi: plik idzie pod kluczem „file”, raport niesie liczby i wiersze z powodami, lista wczytuje się jeszcze raz", async () => {
    const uzytkownik = userEvent.setup();
    api.mockResolvedValue({
      imported: 2,
      skipped: [
        { line: 3, reason: "invalid_email" },
        { line: 5, reason: "duplicate_email" },
      ],
    });
    const { container } = render(<ZgloszeniaLista />);
    await screen.findByText("Anna Kandydat11");
    const wywolanAPIPrzed = apiPaged.mock.calls.length;

    const pole = await otworzImport(uzytkownik, container);
    const plik = PLIK();
    await uzytkownik.upload(pole, plik);

    await screen.findByText("Raport z wczytywania pliku");
    expect(api).toHaveBeenCalledTimes(1);
    const [adres, opcje] = api.mock.calls[0] as [string, { method: string; body: FormData }];
    expect(adres).toBe("/admin/applications/import");
    expect(opcje.method).toBe("POST");
    expect(opcje.body).toBeInstanceOf(FormData);
    expect(opcje.body.get("file")).toBe(plik);

    expect(screen.getByText("Zaimportowano zgłoszeń: 2. Pominięto wierszy: 2.")).toBeInTheDocument();
    expect(screen.getByText("Wiersz 3: Adres e-mail jest nieprawidłowy.")).toBeInTheDocument();
    expect(
      screen.getByText("Wiersz 5: Zgłoszenie z tym adresem e-mail już jest na liście albo adres powtarza się w pliku."),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/invalid_email|duplicate_email/);

    await waitFor(() => expect(apiPaged.mock.calls.length).toBe(wywolanAPIPrzed + 1));
    expect(screen.getByText("Anna Kandydat11")).toBeInTheDocument();
  });

  it("brakujące kolumny: powód po polsku z nazwami kolumn, bez kodu serwera", async () => {
    const uzytkownik = userEvent.setup();
    api.mockResolvedValue({ imported: 0, skipped: [{ line: 1, reason: "missing_headers:first_name,email" }] });
    const { container } = render(<ZgloszeniaLista />);
    await screen.findByText("Anna Kandydat11");

    await uzytkownik.upload(await otworzImport(uzytkownik, container), PLIK());

    await screen.findByText("Wiersz 1: W pierwszym wierszu pliku brakuje wymaganych kolumn: first_name, email.");
    expect(container.textContent).not.toMatch(/missing_headers/);
    expect(screen.getByText("Zaimportowano zgłoszeń: 0. Pominięto wierszy: 1.")).toBeInTheDocument();
  });

  it("422: komunikat o pliku w powiadomieniu, lista i filtr zostają na ekranie", async () => {
    const uzytkownik = userEvent.setup();
    api.mockRejectedValue(blad(422, "validation_failed", { file: ["Plik musi być w formacie CSV."] }));
    const { container } = render(<ZgloszeniaLista />);
    await screen.findByText("Anna Kandydat11");

    await uzytkownik.upload(await otworzImport(uzytkownik, container), PLIK());

    const alarm = await screen.findByRole("alert");
    expect(within(alarm).getByText("Nie udało się wczytać pliku")).toBeInTheDocument();
    expect(within(alarm).getByText("Plik musi być w formacie CSV.")).toBeInTheDocument();
    expect(screen.getByText("Anna Kandydat11")).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Filtr zgłoszeń" })).toBeInTheDocument();
    expect(screen.queryByText("Raport z wczytywania pliku")).toBeNull();
    // Serwer nie zmienił listy, więc lista nie wczytuje się drugi raz.
    expect(apiPaged).toHaveBeenCalledTimes(1);
  });

  it("500: komunikat bez kodu z „Spróbuj ponownie”, które wysyła ten sam plik jeszcze raz", async () => {
    const uzytkownik = userEvent.setup();
    api.mockRejectedValueOnce(blad(500, "server_error"));
    api.mockResolvedValueOnce({ imported: 1, skipped: [] });
    const { container } = render(<ZgloszeniaLista />);
    await screen.findByText("Anna Kandydat11");

    const plik = PLIK();
    await uzytkownik.upload(await otworzImport(uzytkownik, container), plik);

    const alarm = await screen.findByRole("alert");
    expect(within(alarm).getByText("Serwer zwrócił błąd. Spróbuj ponownie za chwilę.")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Komunikat serwera/);
    expect(screen.getByText("Anna Kandydat11")).toBeInTheDocument();

    await uzytkownik.click(within(alarm).getByRole("button", { name: "Spróbuj ponownie" }));
    await screen.findByText("Zaimportowano zgłoszeń: 1. Pominięto wierszy: 0.");
    expect(api).toHaveBeenCalledTimes(2);
    expect((api.mock.calls[1][1] as { body: FormData }).body.get("file")).toBe(plik);
  });

  it("odrzucenie sieci: komunikat o połączeniu, lista zostaje", async () => {
    const uzytkownik = userEvent.setup();
    api.mockRejectedValue(new TypeError("Failed to fetch"));
    const { container } = render(<ZgloszeniaLista />);
    await screen.findByText("Anna Kandydat11");

    await uzytkownik.upload(await otworzImport(uzytkownik, container), PLIK());

    const alarm = await screen.findByRole("alert");
    expect(within(alarm).getByText("Sprawdź połączenie z internetem i spróbuj jeszcze raz.")).toBeInTheDocument();
    expect(screen.getByText("Anna Kandydat11")).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Filtr zgłoszeń" })).toBeInTheDocument();
  });

  it("dwa pliki naraz: komunikat, bez wysyłki", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = render(<ZgloszeniaLista />);
    await screen.findByText("Anna Kandydat11");

    await uzytkownik.upload(await otworzImport(uzytkownik, container), [PLIK(), PLIK()]);

    expect(await screen.findByText("Wybierz jeden plik naraz.")).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it("odmowa roli przy imporcie (403): brak uprawnień, zero rekordów i zero akcji", async () => {
    const uzytkownik = userEvent.setup();
    api.mockRejectedValue(blad(403, "forbidden"));
    const { container } = render(<ZgloszeniaLista />);
    await screen.findByText("Anna Kandydat11");

    await uzytkownik.upload(await otworzImport(uzytkownik, container), PLIK());

    await screen.findByText(/tylko dla administracji/);
    expect(screen.queryByText("Anna Kandydat11")).toBeNull();
    expect(screen.queryByRole("button", { name: "Importuj z pliku CSV" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Dodaj zgłoszenie" })).toBeNull();
  });

  it("akcje nagłówka nie istnieją przed potwierdzeniem roli ani przy odmowie odczytu listy", async () => {
    apiPaged.mockReturnValue(new Promise(() => {}));
    const { unmount } = render(<ZgloszeniaLista />);
    expect(screen.queryByRole("button", { name: "Importuj z pliku CSV" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Dodaj zgłoszenie" })).toBeNull();
    unmount();

    apiPaged.mockRejectedValue(blad(403, "forbidden"));
    render(<ZgloszeniaLista />);
    await screen.findByText(/tylko dla administracji/);
    expect(screen.queryByRole("button", { name: "Importuj z pliku CSV" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Dodaj zgłoszenie" })).toBeNull();
    expect(document.querySelector("input[type='file']")).toBeNull();
  });
});

describe("Zgłoszenia rekrutacyjne — dodanie zgłoszenia", () => {
  it("sukces: zapis z czterema polami, formularz zamknięty i wyczyszczony, potwierdzenie, lista wczytana jeszcze raz", async () => {
    const uzytkownik = userEvent.setup();
    api.mockResolvedValue(zgloszenie(99));
    render(<ZgloszeniaLista />);
    await screen.findByText("Anna Kandydat11");
    const wywolanAPIPrzed = apiPaged.mock.calls.length;

    await otworzFormularz(uzytkownik);
    await wypelnij(uzytkownik, {
      imie: " Ewa ",
      nazwisko: "Nowicka",
      email: "ewa.nowicka@demo.pl",
      telefon: "+48 600 100 200",
    });
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz zgłoszenie" }));

    await screen.findByText("Zgłoszenie zostało dodane.");
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/admin/applications", {
      method: "POST",
      body: { first_name: "Ewa", last_name: "Nowicka", email: "ewa.nowicka@demo.pl", phone: "+48 600 100 200" },
    });
    expect(screen.queryByRole("form", { name: "Nowe zgłoszenie" })).toBeNull();
    await waitFor(() => expect(apiPaged.mock.calls.length).toBe(wywolanAPIPrzed + 1));

    // Po ponownym otwarciu formularz jest pusty.
    await uzytkownik.click(screen.getByRole("button", { name: "Dodaj zgłoszenie" }));
    expect(screen.getByRole("textbox", { name: /^Imię/ })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: /^E-mail/ })).toHaveValue("");
  });

  it("otwarcie formularza przenosi fokus na pierwsze pole (sekcja otwierana działaniem)", async () => {
    const uzytkownik = userEvent.setup();
    api.mockResolvedValue(zgloszenie(99));
    render(<ZgloszeniaLista />);
    await screen.findByText("Anna Kandydat11");

    await otworzFormularz(uzytkownik);
    expect(screen.getByRole("textbox", { name: /^Imię/ })).toHaveFocus();
  });

  it("pusty telefon nie jest wysyłany", async () => {
    const uzytkownik = userEvent.setup();
    api.mockResolvedValue(zgloszenie(99));
    render(<ZgloszeniaLista />);
    await screen.findByText("Anna Kandydat11");

    await otworzFormularz(uzytkownik);
    await wypelnij(uzytkownik, { imie: "Ewa", nazwisko: "Nowicka", email: "ewa@demo.pl" });
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz zgłoszenie" }));

    await screen.findByText("Zgłoszenie zostało dodane.");
    expect(api.mock.calls[0][1]).toEqual({
      method: "POST",
      body: { first_name: "Ewa", last_name: "Nowicka", email: "ewa@demo.pl" },
    });
  });

  it("422: błędy z koperty pod dwoma polami, formularz i wpisane dane zostają, lista nie wczytuje się drugi raz", async () => {
    const uzytkownik = userEvent.setup();
    api.mockRejectedValue(
      blad(422, "validation_failed", {
        last_name: ["Podaj nazwisko."],
        email: ["Podaj poprawny adres e-mail."],
      }),
    );
    render(<ZgloszeniaLista />);
    await screen.findByText("Anna Kandydat11");

    await otworzFormularz(uzytkownik);
    await wypelnij(uzytkownik, { imie: "Ewa", email: "zly" });
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz zgłoszenie" }));

    await screen.findByText("Podaj nazwisko.");
    expect(document.getElementById("zgloszenie-nowe-nazwisko-blad")).toHaveTextContent("Podaj nazwisko.");
    expect(document.getElementById("zgloszenie-nowe-email-blad")).toHaveTextContent("Podaj poprawny adres e-mail.");
    expect(document.getElementById("zgloszenie-nowe-imie-blad")).toBeNull();
    expect(screen.getByRole("textbox", { name: /^Imię/ })).toHaveValue("Ewa");
    expect(screen.getByRole("textbox", { name: /^E-mail/ })).toHaveValue("zly");
    expect(screen.queryByText("Zgłoszenie zostało dodane.")).toBeNull();
    expect(apiPaged).toHaveBeenCalledTimes(1);
  });

  it("pusty e-mail: błąd z serwera stoi pod polem E-mail", async () => {
    const uzytkownik = userEvent.setup();
    api.mockRejectedValue(blad(422, "validation_failed", { email: ["Podaj adres e-mail."] }));
    render(<ZgloszeniaLista />);
    await screen.findByText("Anna Kandydat11");

    await otworzFormularz(uzytkownik);
    await wypelnij(uzytkownik, { imie: "Ewa", nazwisko: "Nowicka" });
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz zgłoszenie" }));

    await waitFor(() =>
      expect(document.getElementById("zgloszenie-nowe-email-blad")).toHaveTextContent("Podaj adres e-mail."),
    );
    expect(screen.getByRole("textbox", { name: /^E-mail/ })).toHaveAttribute("aria-invalid", "true");
  });

  it("409: komunikat o istniejącym zgłoszeniu z tym adresem, formularz i dane zostają", async () => {
    const uzytkownik = userEvent.setup();
    api.mockRejectedValue(blad(409, "application_already_exists"));
    const { container } = render(<ZgloszeniaLista />);
    await screen.findByText("Anna Kandydat11");

    await otworzFormularz(uzytkownik);
    await wypelnij(uzytkownik, { imie: "Ewa", nazwisko: "Nowicka", email: "kandydat11@demo.pl" });
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz zgłoszenie" }));

    await screen.findByText("Zgłoszenie z tym adresem już istnieje");
    expect(
      screen.getByText(/Na liście jest już zgłoszenie z adresem e-mail kandydat11@demo\.pl\./),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Komunikat serwera|application_already_exists/);
    expect(screen.getByRole("form", { name: "Nowe zgłoszenie" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^Imię/ })).toHaveValue("Ewa");
  });

  it("500 i odrzucenie sieci: komunikat bez kodu, dane w formularzu zostają", async () => {
    const uzytkownik = userEvent.setup();
    api.mockRejectedValueOnce(blad(500, "server_error"));
    api.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<ZgloszeniaLista />);
    await screen.findByText("Anna Kandydat11");

    await otworzFormularz(uzytkownik);
    await wypelnij(uzytkownik, { imie: "Ewa", nazwisko: "Nowicka", email: "ewa@demo.pl" });
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz zgłoszenie" }));
    await screen.findByText(/Serwer zwrócił błąd\. Dane w formularzu zostały/);

    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz zgłoszenie" }));
    await screen.findByText(/Sprawdź połączenie z internetem\. Dane w formularzu zostały/);
    expect(screen.getByRole("textbox", { name: /^E-mail/ })).toHaveValue("ewa@demo.pl");
  });

  it("odmowa roli przy zapisie (403): brak uprawnień, zero rekordów", async () => {
    const uzytkownik = userEvent.setup();
    api.mockRejectedValue(blad(403, "forbidden"));
    render(<ZgloszeniaLista />);
    await screen.findByText("Anna Kandydat11");

    await otworzFormularz(uzytkownik);
    await wypelnij(uzytkownik, { imie: "Ewa", nazwisko: "Nowicka", email: "ewa@demo.pl" });
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz zgłoszenie" }));

    await screen.findByText(/tylko dla administracji/);
    expect(screen.queryByText("Anna Kandydat11")).toBeNull();
    expect(screen.queryByRole("form", { name: "Nowe zgłoszenie" })).toBeNull();
  });

  it("„Wróć do listy” zamyka formularz bez wysyłki", async () => {
    const uzytkownik = userEvent.setup();
    render(<ZgloszeniaLista />);
    await screen.findByText("Anna Kandydat11");

    await otworzFormularz(uzytkownik);
    await uzytkownik.click(screen.getByRole("button", { name: "Wróć do listy" }));

    expect(screen.queryByRole("form", { name: "Nowe zgłoszenie" })).toBeNull();
    expect(api).not.toHaveBeenCalled();
  });
});

describe("Zgłoszenia rekrutacyjne — jeden przycisk w kolorze", () => {
  it("zamknięty formularz: jedyny kolorowy to „Dodaj zgłoszenie”; otwarty: jedyny kolorowy to „Zapisz zgłoszenie”", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = render(<ZgloszeniaLista />);
    await screen.findByText("Anna Kandydat11");

    expect(przyciskiGlowne(container).map((p) => p.textContent)).toEqual(["Dodaj zgłoszenie"]);
    expect(screen.getByRole("button", { name: "Importuj z pliku CSV" }).className).not.toMatch(/primary/);

    await otworzFormularz(uzytkownik);
    expect(przyciskiGlowne(container).map((p) => p.textContent)).toEqual(["Zapisz zgłoszenie"]);
  });
});
