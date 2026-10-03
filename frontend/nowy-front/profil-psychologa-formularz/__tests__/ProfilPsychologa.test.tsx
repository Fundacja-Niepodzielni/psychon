import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/lib/api/klient";
import { saPowodyPytania } from "@/design-system/szablony/NiezapisaneZmiany";
import {
  DYPLOM,
  WNIOSEK_BEZ_DOSTEPU,
  WNIOSEK_OPUBLIKOWANY,
  WNIOSEK_ODESLANY,
  WNIOSEK_PUSTY,
  WNIOSEK_ROBOCZY,
  WNIOSEK_Z_DYPLOMEM,
  WNIOSEK_ZATWIERDZONY,
  WNIOSEK_ZLOZONY,
  WNIOSEK_WYCOFANY,
} from "./atrapy";
import { etykietyPol, nazwyDzialan, przyciskiGlowne, szablonFormularza } from "./kontrole-ekranu";

/**
 * Ekran „Profil psychologa”: ładowanie · błąd · brak połączenia · brak dostępu · nie znaleziono ·
 * brak wniosku · wersja robocza · czeka na decyzję · do poprawki z uwagami · zatwierdzony ·
 * opublikowany · zgoda wycofana · zapisywanie · zapisano · błędy serwera. W każdym stanie: jeden
 * korzeń szablonu, jeden `h1`, najwyżej jeden przycisk główny. Każdy stan sprawdza nagłówek,
 * przycisk główny i to, czy działa, zdania wyjaśniające, tekst stanu, nazwy działań, etykiety pól
 * i komunikaty błędów. Każdy pomiar ma kontrolę dodatnią: zmianę danych wejścia, która MUSI zmienić
 * to, co widać.
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

const pobierzWniosek = vi.fn();
const zapiszWniosek = vi.fn();
const dodajZalacznik = vi.fn();
const zlozWniosek = vi.fn();
const wycofajZgode = vi.fn();
vi.mock("../dane", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../dane")>()),
  pobierzWniosek: (...args: unknown[]) => pobierzWniosek(...args),
  zapiszWniosek: (...args: unknown[]) => zapiszWniosek(...args),
  dodajZalacznik: (...args: unknown[]) => dodajZalacznik(...args),
  zlozWniosek: (...args: unknown[]) => zlozWniosek(...args),
  wycofajZgode: (...args: unknown[]) => wycofajZgode(...args),
}));

const { ProfilPsychologa } = await import("../ProfilPsychologa");

const ETYKIETY_FORMULARZA = ["Specjalizacje", "Nurt terapeutyczny", "Miasto", "Opis"];
const ZGODA = "Wyrażam zgodę na publikację mojego profilu w bazie psychologów Fundacji.";
const BRAKI_PUSTEGO =
  "Brakuje 5 elementów: specjalizacje, nurt terapeutyczny, miasto, dyplom, zgoda na publikację. Uzupełnij je, żeby wysłać wniosek.";

function blad(status: number, code: string, message = "komunikat serwera", extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) {
  return new ApiError({ status, code, message, ...extra });
}

async function pokaz() {
  let wynik: ReturnType<typeof render> | undefined;
  await act(async () => {
    wynik = render(<ProfilPsychologa />);
  });
  return wynik!;
}

async function pokazZDanymi(dane: unknown) {
  pobierzWniosek.mockResolvedValue(dane);
  const wynik = await pokaz();
  await screen.findByRole("heading", { level: 2, name: "Stan wniosku" });
  return wynik;
}

function pole(etykieta: string): HTMLInputElement | HTMLTextAreaElement {
  return screen.getByLabelText(etykieta) as HTMLInputElement | HTMLTextAreaElement;
}

function wpisz(etykieta: string, tekst: string) {
  fireEvent.change(pole(etykieta), { target: { value: tekst } });
}

function glowny(container: HTMLElement): HTMLButtonElement {
  const [przycisk, ...reszta] = przyciskiGlowne(container);
  expect(reszta).toHaveLength(0);
  return przycisk;
}

beforeEach(() => {
  push.mockReset();
  api.mockReset();
  api.mockResolvedValue({ first_name: "Marta", role: "volunteer" });
  for (const mock of [pobierzWniosek, zapiszWniosek, dodajZalacznik, zlozWniosek, wycofajZgode]) mock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("Profil psychologa — stany bez danych", () => {
  it("ładowanie: nagłówek, zdanie stanu, brak przycisku głównego", async () => {
    pobierzWniosek.mockReturnValue(new Promise(() => {}));
    const { container } = await pokaz();

    szablonFormularza(container);
    expect(screen.getByRole("heading", { level: 1, name: "Profil psychologa" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Wczytywanie wniosku…");
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(nazwyDzialan(container)).toEqual(["Wstecz"]);
    expect(etykietyPol(container)).toEqual([]);
  });

  it("błąd: komunikat ze zdaniem wyjaśniającym i ponowieniem; ponowienie woła odczyt jeszcze raz", async () => {
    pobierzWniosek.mockRejectedValue(blad(500, "server_error"));
    const { container } = await pokaz();

    szablonFormularza(container);
    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się wczytać wniosku");
    expect(screen.getByRole("alert")).toHaveTextContent("Coś poszło nie tak po naszej stronie. Spróbuj ponownie za chwilę.");
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(nazwyDzialan(container)).toEqual(["Wstecz", "Spróbuj ponownie"]);

    pobierzWniosek.mockResolvedValue(WNIOSEK_ROBOCZY);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    });
    expect(pobierzWniosek).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("heading", { level: 2, name: "Stan wniosku" })).toBeInTheDocument();
  });

  it("brak połączenia: osobny komunikat, nie „coś poszło nie tak”", async () => {
    pobierzWniosek.mockRejectedValue(new TypeError("Failed to fetch"));
    const { container } = await pokaz();

    expect(screen.getByRole("alert")).toHaveTextContent("Brak połączenia");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.",
    );
    expect(nazwyDzialan(container)).toEqual(["Wstecz", "Spróbuj ponownie"]);
    expect(przyciskiGlowne(container)).toHaveLength(0);
  });

  it.each([403, 401])("brak dostępu (%i): wspólny ekran odmowy z jednym przyciskiem prowadzącym do pulpitu", async (status) => {
    pobierzWniosek.mockRejectedValue(blad(status, "forbidden"));
    const { container } = await pokaz();

    szablonFormularza(container);
    expect(screen.getByRole("heading", { level: 1, name: "Profil psychologa" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Nie masz dostępu do tego ekranu" })).toBeInTheDocument();
    expect(await screen.findByText("Twoja rola: Wolontariusz. Ten ekran jest dla osób wolontariackich.")).toBeInTheDocument();
    expect(nazwyDzialan(container)).toEqual(["Wstecz", "Wróć do pulpitu"]);
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(etykietyPol(container)).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Wróć do pulpitu" }));
    expect(push).toHaveBeenCalledWith("/panel/pulpit");
  });

  it("nie znaleziono (404): wspólny ekran z przyciskiem „Odśwież”", async () => {
    pobierzWniosek.mockRejectedValue(blad(404, "not_found"));
    const { container } = await pokaz();

    expect(screen.getByRole("heading", { level: 2, name: "Nie znaleziono wniosku" })).toBeInTheDocument();
    expect(nazwyDzialan(container)).toEqual(["Wstecz", "Odśwież"]);
  });

  it("program nieukończony: zdanie zamiast formularza, bez przycisku głównego", async () => {
    pobierzWniosek.mockResolvedValue(WNIOSEK_BEZ_DOSTEPU);
    const { container } = await pokaz();
    await screen.findByRole("heading", { level: 2, name: "Wniosek będzie dostępny po programie" });

    szablonFormularza(container);
    expect(screen.getByText("Wniosek o wpis do bazy psychologów Fundacji będzie dostępny po ukończeniu całego programu.")).toBeInTheDocument();
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(etykietyPol(container)).toEqual([]);
    expect(nazwyDzialan(container)).toEqual(["Wstecz"]);
  });
});

describe("Profil psychologa — brak wniosku", () => {
  it("stan „Nie rozpoczęto”, puste pola, niedostępny przycisk „Wyślij do sprawdzenia” z powodem", async () => {
    const { container } = await pokazZDanymi(WNIOSEK_PUSTY);

    szablonFormularza(container);
    expect(screen.getByRole("heading", { level: 1, name: "Profil psychologa" })).toBeInTheDocument();
    expect(screen.getByText("Nie rozpoczęto")).toBeInTheDocument();
    expect(screen.getByText("Nie masz jeszcze wniosku o wpis do bazy psychologów Fundacji.")).toBeInTheDocument();
    expect(screen.getByText(/Co dalej: Uzupełnij dane poniżej i zapisz je\./)).toBeInTheDocument();

    const przycisk = glowny(container);
    expect(przycisk).toHaveTextContent("Wyślij do sprawdzenia");
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    expect(document.getElementById(przycisk.getAttribute("aria-describedby") ?? "")).toHaveTextContent(BRAKI_PUSTEGO);

    expect(etykietyPol(container)).toEqual([...ETYKIETY_FORMULARZA, "Typ załącznika", ZGODA]);
    for (const etykieta of ETYKIETY_FORMULARZA) expect(pole(etykieta)).toHaveValue("");
    for (const etykieta of ETYKIETY_FORMULARZA) expect(pole(etykieta)).toBeEnabled();
    expect(screen.getByText("Nie dodano jeszcze żadnych załączników.")).toBeInTheDocument();
    expect(nazwyDzialan(container)).toEqual([
      "Wstecz",
      "Wyślij do sprawdzenia",
      "Dodaj załącznik",
    ]);
    expect(screen.getByRole("combobox", { name: "Typ załącznika" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Przeciągnij plik tutaj albo wybierz go z dysku/ })).toHaveAccessibleDescription(
      "Dozwolone formaty: PDF, JPG, PNG. Plik może mieć najwyżej 10 MB.",
    );
    expect(screen.queryByRole("button", { name: "Wycofaj zgodę" })).not.toBeInTheDocument();
  });

  it("kliknięcie niedostępnego przycisku niczego nie wysyła i przenosi fokus na formularz", async () => {
    const { container } = await pokazZDanymi(WNIOSEK_PUSTY);

    fireEvent.click(glowny(container));

    expect(zlozWniosek).not.toHaveBeenCalled();
    expect(zapiszWniosek).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("form", { name: "Dane wniosku" }));
  });

  it("kontrola dodatnia: wpisanie czegokolwiek zmienia przycisk główny na „Zapisz zmiany”, aktywny", async () => {
    const { container } = await pokazZDanymi(WNIOSEK_PUSTY);

    wpisz("Miasto", "Kraków");

    const przycisk = glowny(container);
    expect(przycisk).toHaveTextContent("Zapisz zmiany");
    expect(przycisk).not.toHaveAttribute("aria-disabled");
    expect(przycisk).toBeEnabled();
  });
});

describe("Profil psychologa — wersja robocza", () => {
  it("zapisane wartości w polach, brakuje dyplomu i zgody, a zdanie wyjaśnia, dlaczego przycisk jest niedostępny", async () => {
    const { container } = await pokazZDanymi(WNIOSEK_ROBOCZY);

    expect(screen.getByText("Wersja robocza")).toBeInTheDocument();
    expect(screen.getByText("Wniosek jest zapisany jako wersja robocza. Nikt go jeszcze nie widzi.")).toBeInTheDocument();
    expect(screen.getByText(/Co dalej: Uzupełnij dane, dodaj dyplom i zaznacz zgodę na publikację\./)).toBeInTheDocument();
    expect(pole("Specjalizacje")).toHaveValue("wsparcie w kryzysie");
    expect(pole("Nurt terapeutyczny")).toHaveValue("poznawczo-behawioralny");
    expect(pole("Miasto")).toHaveValue("Kraków");
    expect(pole("Opis")).toHaveValue("");

    const przycisk = glowny(container);
    expect(przycisk).toHaveTextContent("Wyślij do sprawdzenia");
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    expect(document.getElementById(przycisk.getAttribute("aria-describedby") ?? "")).toHaveTextContent(
      "Brakuje 2 elementów: dyplom, zgoda na publikację. Uzupełnij je, żeby wysłać wniosek.",
    );
  });

  it("zgoda zdejmuje jeden brak; dyplom i zgoda razem włączają przycisk, a kliknięcie wysyła wniosek", async () => {
    zlozWniosek.mockResolvedValue(WNIOSEK_ZLOZONY);
    const { container } = await pokazZDanymi(WNIOSEK_Z_DYPLOMEM);

    expect(document.getElementById(glowny(container).getAttribute("aria-describedby") ?? "")).toHaveTextContent(
      "Brakuje 1 elementu: zgoda na publikację.",
    );
    fireEvent.click(screen.getByLabelText(ZGODA));

    const przycisk = glowny(container);
    expect(przycisk).toHaveTextContent("Wyślij do sprawdzenia");
    expect(przycisk).not.toHaveAttribute("aria-disabled");
    expect(przycisk).not.toHaveAttribute("aria-describedby");

    await act(async () => {
      fireEvent.click(przycisk);
    });

    expect(zlozWniosek).toHaveBeenCalledTimes(1);
    expect(zlozWniosek).toHaveBeenCalledWith(true);
    expect(await screen.findByText("Czeka na decyzję")).toBeInTheDocument();
    expect(screen.getByText("Wniosek został wysłany do sprawdzenia.")).toBeInTheDocument();
    expect(przyciskiGlowne(container)).toHaveLength(0);
  });

  it("lista załączników: typ po polsku, data przez wspólny formater, odmiana „załącznik/załączniki”", async () => {
    await pokazZDanymi({ ...WNIOSEK_Z_DYPLOMEM, documents: [DYPLOM, { id: 2, type: "niekaralnosc", uploaded_at: "2026-09-11T08:00:00Z" }] });

    expect(screen.getByText("Masz 2 załączniki.")).toBeInTheDocument();
    expect(screen.getByText("Dyplom · dodano 10 września 2026")).toBeInTheDocument();
    expect(screen.getByText("Zaświadczenie o niekaralności · dodano 11 września 2026")).toBeInTheDocument();
  });

  it("niewypełniona zgoda nie wycofuje niczego: w wersji roboczej nie ma przycisku „Wycofaj zgodę”", async () => {
    await pokazZDanymi(WNIOSEK_ROBOCZY);
    expect(screen.queryByRole("button", { name: "Wycofaj zgodę" })).not.toBeInTheDocument();
  });
});

describe("Profil psychologa — zapisywanie, zapisano, błędy serwera", () => {
  it("zapisywanie: napis przycisku się zmienia, drugie kliknięcie niczego nie wysyła", async () => {
    let zakoncz: (wniosek: unknown) => void = () => {};
    zapiszWniosek.mockReturnValue(new Promise((rozwiaz) => (zakoncz = rozwiaz)));
    const { container } = await pokazZDanymi(WNIOSEK_ROBOCZY);
    wpisz("Miasto", "Warszawa");

    await act(async () => {
      fireEvent.click(glowny(container));
    });
    const wTrakcie = glowny(container);
    expect(wTrakcie).toHaveTextContent("Zapisywanie…");
    fireEvent.click(wTrakcie);
    expect(zapiszWniosek).toHaveBeenCalledTimes(1);

    await act(async () => zakoncz({ ...WNIOSEK_ROBOCZY, city: "Warszawa" }));
    expect(glowny(container)).toHaveTextContent("Wyślij do sprawdzenia");
  });

  it("zapisano: dokładnie jedno żądanie z wartościami z pól, potwierdzenie, przycisk wraca do „Wyślij do sprawdzenia”", async () => {
    zapiszWniosek.mockResolvedValue({ ...WNIOSEK_ROBOCZY, city: "Warszawa", specializations: ["a", "b"] });
    const { container } = await pokazZDanymi(WNIOSEK_ROBOCZY);
    wpisz("Miasto", "Warszawa");
    wpisz("Specjalizacje", "a,b");
    expect(glowny(container)).toHaveTextContent("Zapisz zmiany");

    await act(async () => {
      fireEvent.click(glowny(container));
    });

    expect(zapiszWniosek).toHaveBeenCalledTimes(1);
    expect(zapiszWniosek).toHaveBeenCalledWith({
      specjalizacje: "a,b",
      nurt: "poznawczo-behawioralny",
      miasto: "Warszawa",
      opis: "",
    });
    expect(screen.getByText("Wniosek został zapisany.")).toBeInTheDocument();
    expect(pole("Specjalizacje")).toHaveValue("a, b");
    expect(glowny(container)).toHaveTextContent("Wyślij do sprawdzenia");
  });

  it("niezapisane zmiany są zgłoszone ramie, a po zapisie zgłoszenie znika", async () => {
    zapiszWniosek.mockResolvedValue({ ...WNIOSEK_ROBOCZY, city: "Warszawa" });
    const { container } = await pokazZDanymi(WNIOSEK_ROBOCZY);
    expect(saPowodyPytania()).toBe(false);

    wpisz("Miasto", "Warszawa");
    expect(saPowodyPytania()).toBe(true);

    await act(async () => {
      fireEvent.click(glowny(container));
    });
    expect(saPowodyPytania()).toBe(false);
  });

  it("błędy serwera (422): komunikaty pod polami, nazwy pól w podsumowaniu, przycisk zostaje „Zapisz zmiany”", async () => {
    zapiszWniosek.mockRejectedValue(
      blad(422, "validation_failed", "Popraw zaznaczone pola.", {
        errors: {
          approach: ["Opis podejścia może mieć najwyżej 255 znaków."],
          "specializations.0": ["Każda specjalizacja musi być tekstem."],
        },
      }),
    );
    const { container } = await pokazZDanymi(WNIOSEK_ROBOCZY);
    wpisz("Nurt terapeutyczny", "x".repeat(300));

    await act(async () => {
      fireEvent.click(glowny(container));
    });

    const alert = screen.getByText("Nie udało się zapisać wniosku").closest("[role='alert']") as HTMLElement;
    expect(alert).toHaveTextContent("Popraw zaznaczone pola: Specjalizacje, Nurt terapeutyczny.");
    expect(screen.getByText("Opis podejścia może mieć najwyżej 255 znaków.")).toBeInTheDocument();
    expect(screen.getByText("Każda specjalizacja musi być tekstem.")).toBeInTheDocument();
    expect(pole("Nurt terapeutyczny")).toHaveAttribute("aria-invalid", "true");
    expect(pole("Nurt terapeutyczny")).toHaveValue("x".repeat(300));
    expect(glowny(container)).toHaveTextContent("Zapisz zmiany");
    expect(screen.queryByText("Wniosek został zapisany.")).not.toBeInTheDocument();
  });

  it("inny błąd zapisu: komunikat serwera albo zdanie zastępcze; pola zostają", async () => {
    zapiszWniosek.mockRejectedValue(blad(500, "server_error", "Serwer nie odpowiada."));
    const { container } = await pokazZDanymi(WNIOSEK_ROBOCZY);
    wpisz("Miasto", "Warszawa");

    await act(async () => {
      fireEvent.click(glowny(container));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Serwer nie odpowiada.");
    expect(pole("Miasto")).toHaveValue("Warszawa");

    zapiszWniosek.mockRejectedValue(new TypeError("Failed to fetch"));
    await act(async () => {
      fireEvent.click(glowny(container));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się zapisać wniosku. Spróbuj ponownie.");
  });

  it("wysłanie niekompletnego wniosku (422 profile_incomplete): komunikat z brakami z serwera", async () => {
    zlozWniosek.mockRejectedValue(
      blad(422, "profile_incomplete", "Uzupełnij wniosek przed złożeniem.", { reason: { missing: ["documents", "consent"] } }),
    );
    const { container } = await pokazZDanymi(WNIOSEK_Z_DYPLOMEM);
    fireEvent.click(screen.getByLabelText(ZGODA));

    await act(async () => {
      fireEvent.click(glowny(container));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Wniosek jest niekompletny");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Uzupełnij wniosek przed złożeniem. Brakuje 2 elementów: dyplom, zgoda na publikację.",
    );
    expect(screen.getByText("Wersja robocza")).toBeInTheDocument();
  });

  it("inny błąd wysłania: komunikat serwera albo zdanie zastępcze", async () => {
    zlozWniosek.mockRejectedValue(new TypeError("Failed to fetch"));
    const { container } = await pokazZDanymi(WNIOSEK_Z_DYPLOMEM);
    fireEvent.click(screen.getByLabelText(ZGODA));

    await act(async () => {
      fireEvent.click(glowny(container));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się wysłać wniosku");
    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się złożyć wniosku. Spróbuj ponownie.");
  });
});

describe("Profil psychologa — czeka na decyzję", () => {
  it("pola zablokowane, brak przycisku głównego, można tylko wycofać zgodę", async () => {
    const { container } = await pokazZDanymi(WNIOSEK_ZLOZONY);

    expect(screen.getByText("Czeka na decyzję")).toBeInTheDocument();
    expect(screen.getByText("Wniosek czeka na decyzję. Na czas sprawdzania nie możesz go zmieniać.")).toBeInTheDocument();
    expect(screen.getByText(/Gdy zespół podejmie decyzję, dostaniesz powiadomienie\./)).toBeInTheDocument();
    for (const etykieta of ETYKIETY_FORMULARZA) expect(pole(etykieta)).toBeDisabled();
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(etykietyPol(container)).toEqual(ETYKIETY_FORMULARZA);
    expect(nazwyDzialan(container)).toEqual(["Wstecz", "Wycofaj zgodę"]);
    expect(screen.getByText("Masz 1 załącznik.")).toBeInTheDocument();
  });

  it("przycisk „Wycofaj zgodę” jest w wariancie niebezpiecznym i najpierw pyta o potwierdzenie, niczego nie wysyłając", async () => {
    await pokazZDanymi(WNIOSEK_ZLOZONY);
    const wyzwalacz = screen.getByRole("button", { name: "Wycofaj zgodę" });
    expect(wyzwalacz.className).toMatch(/niebezpieczny/);

    fireEvent.click(wyzwalacz);

    const okno = screen.getByRole("dialog", { name: "Wycofać zgodę na publikację?" });
    expect(
      within(okno).getByText(
        "Profil nie zostanie opublikowany w bazie psychologów Fundacji.",
      ),
    ).toBeInTheDocument();
    // Wycofanie zgody to akcja niszcząca: we wspólnym wariancie „niebezpieczne” role się
    // odwracają — przyciskiem głównym jest „Anuluj”, a potwierdzenie ma obrys i napis w barwie błędu.
    const potwierdzenie = within(okno).getByRole("button", { name: "Wycofaj zgodę" });
    expect(potwierdzenie.className).toMatch(/outline/);
    expect(potwierdzenie.className).toMatch(/niebezpieczny/);
    const anuluj = within(okno).getByRole("button", { name: "Anuluj" });
    expect(anuluj.className).toMatch(/primary/);
    expect(anuluj).toHaveFocus();
    expect(wycofajZgode).not.toHaveBeenCalled();
  });

  it("„Anuluj” zamyka pytanie bez żądania; stan wniosku bez zmian", async () => {
    await pokazZDanymi(WNIOSEK_ZLOZONY);
    fireEvent.click(screen.getByRole("button", { name: "Wycofaj zgodę" }));

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Anuluj" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(wycofajZgode).not.toHaveBeenCalled();
    expect(screen.getByText("Czeka na decyzję")).toBeInTheDocument();
  });

  it("wycofanie zgody po potwierdzeniu: jedno żądanie, stan „Zgoda wycofana”, potwierdzenie, brak przycisków akcji", async () => {
    wycofajZgode.mockResolvedValue(WNIOSEK_WYCOFANY);
    const { container } = await pokazZDanymi(WNIOSEK_ZLOZONY);

    fireEvent.click(screen.getByRole("button", { name: "Wycofaj zgodę" }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Wycofaj zgodę" }));
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(wycofajZgode).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Zgoda wycofana")).toBeInTheDocument();
    // To samo zdanie stoi w potwierdzeniu i w opisie stanu „Zgoda wycofana”.
    expect(screen.getAllByText("Zgoda na publikację została wycofana.")).toHaveLength(2);
    expect(nazwyDzialan(container)).toEqual(["Wstecz", "Zamknij powiadomienie"]);
    expect(screen.queryByRole("button", { name: "Wycofaj zgodę" })).not.toBeInTheDocument();
  });

  it("błąd wycofania: komunikat serwera albo zdanie zastępcze, stan bez zmian", async () => {
    wycofajZgode.mockRejectedValue(new TypeError("Failed to fetch"));
    await pokazZDanymi(WNIOSEK_ZLOZONY);

    fireEvent.click(screen.getByRole("button", { name: "Wycofaj zgodę" }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Wycofaj zgodę" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się wycofać zgody. Spróbuj ponownie.");
    expect(screen.getByText("Czeka na decyzję")).toBeInTheDocument();
  });
});

describe("Profil psychologa — do poprawki, zatwierdzony, opublikowany, zgoda wycofana", () => {
  it("do poprawki: uwagi osoby sprawdzającej, przycisk „Wyślij do sprawdzenia”, edycja i wycofanie", async () => {
    const { container } = await pokazZDanymi(WNIOSEK_ODESLANY);

    expect(screen.getByText("Do poprawki")).toBeInTheDocument();
    expect(screen.getByText("Wniosek wymaga poprawek.")).toBeInTheDocument();
    const uwagi = screen.getByRole("heading", { level: 3, name: "Uwagi do wniosku" }).closest("[role='status']") as HTMLElement;
    expect(within(uwagi).getByText("Uzupełnij opis nurtu i dodaj skan dyplomu w lepszej jakości.")).toBeInTheDocument();
    expect(screen.getByText(/Co dalej: Przeczytaj uwagi, popraw dane i wyślij wniosek do sprawdzenia jeszcze raz\./)).toBeInTheDocument();
    for (const etykieta of ETYKIETY_FORMULARZA) expect(pole(etykieta)).toBeEnabled();
    expect(glowny(container)).toHaveTextContent("Wyślij do sprawdzenia");
    expect(nazwyDzialan(container)).toContain("Wycofaj zgodę");
    expect(nazwyDzialan(container)).toContain("Dodaj załącznik");
  });

  it("do poprawki bez zapisanych uwag: blok uwag się nie pojawia", async () => {
    await pokazZDanymi({ ...WNIOSEK_ODESLANY, return_reason: null });
    expect(screen.queryByRole("heading", { name: "Uwagi do wniosku" })).not.toBeInTheDocument();
  });

  it("kontrola dodatnia: uwagi pokazuje tylko stan „do poprawki”", async () => {
    await pokazZDanymi({ ...WNIOSEK_ZLOZONY, return_reason: "Stara uwaga." });
    expect(screen.queryByText("Stara uwaga.")).not.toBeInTheDocument();
  });

  it.each([
    ["zatwierdzony", WNIOSEK_ZATWIERDZONY, "Zatwierdzony", "Wniosek został zatwierdzony. Dane są zablokowane.", ["Wstecz", "Wycofaj zgodę"]],
    ["opublikowany", WNIOSEK_OPUBLIKOWANY, "Opublikowany", "Profil jest opublikowany. Dane są zablokowane.", ["Wstecz", "Wycofaj zgodę"]],
    ["zgoda wycofana", WNIOSEK_WYCOFANY, "Zgoda wycofana", "Zgoda na publikację została wycofana.", ["Wstecz"]],
  ] as const)("%s: nazwa stanu z administracji, zablokowane pola, bez przycisku głównego", async (_nazwa, dane, nazwaStanu, zdanie, dzialania) => {
    const { container } = await pokazZDanymi(dane);

    expect(screen.getByText(nazwaStanu)).toBeInTheDocument();
    expect(screen.getByText(zdanie)).toBeInTheDocument();
    for (const etykieta of ETYKIETY_FORMULARZA) expect(pole(etykieta)).toBeDisabled();
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(nazwyDzialan(container)).toEqual([...dzialania]);
    expect(screen.queryByLabelText(ZGODA)).not.toBeInTheDocument();
  });
});

describe("Profil psychologa — karta zgody bez zdań o trwałej blokadzie", () => {
  it("karta „Zgoda na publikację” mówi tylko, że zgodę można wycofać w każdej chwili", async () => {
    await pokazZDanymi(WNIOSEK_ZLOZONY);
    const karta = screen.getByRole("heading", { level: 2, name: "Zgoda na publikację" }).closest("section") as HTMLElement;
    expect(within(karta).getByText("Możesz w każdej chwili wycofać zgodę na publikację profilu.")).toBeInTheDocument();
    expect(karta.textContent).not.toMatch(/edytowaln|zgoda wycofana|nie da się cofnąć|publiczn/i);
  });

  it("stan „Zgoda wycofana”: żadne zdanie ekranu nie mówi o trwałej blokadzie ani o publicznej liście", async () => {
    const { container } = await pokazZDanymi(WNIOSEK_WYCOFANY);
    expect(screen.getByText("Profil nie zostanie opublikowany w bazie psychologów Fundacji.", { exact: false })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/zablokowany|nie możesz już|ponownie|edytowaln|publiczn/i);
  });
});

describe("Profil psychologa — wycofanie zgody z opublikowanego profilu", () => {
  it("pytanie mówi, że profil zniknie z bazy psychologów Fundacji; po potwierdzeniu jedno żądanie", async () => {
    wycofajZgode.mockResolvedValue(WNIOSEK_WYCOFANY);
    await pokazZDanymi(WNIOSEK_OPUBLIKOWANY);

    fireEvent.click(screen.getByRole("button", { name: "Wycofaj zgodę" }));
    const okno = screen.getByRole("dialog", { name: "Wycofać zgodę na publikację?" });
    expect(
      within(okno).getByText(
        "Profil zniknie z bazy psychologów Fundacji.",
      ),
    ).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(okno).getByRole("button", { name: "Wycofaj zgodę" }));
    });

    expect(wycofajZgode).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Zgoda wycofana")).toBeInTheDocument();
  });
});

describe("Profil psychologa — załączniki", () => {
  const plik = () => new File(["%PDF-"], "dyplom.pdf", { type: "application/pdf" });

  it("brak wybranego pliku: komunikat przy polu, żadnego żądania", async () => {
    await pokazZDanymi(WNIOSEK_ROBOCZY);

    fireEvent.click(screen.getByRole("button", { name: "Dodaj załącznik" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Wybierz plik przed dodaniem załącznika.");
    expect(dodajZalacznik).not.toHaveBeenCalled();
  });

  it("dodanie: typ i plik w żądaniu, nowa lista załączników, niezapisane pola zostają", async () => {
    dodajZalacznik.mockResolvedValue({ ...WNIOSEK_ROBOCZY, documents: [DYPLOM] });
    const { container } = await pokazZDanymi(WNIOSEK_ROBOCZY);
    wpisz("Miasto", "Warszawa");
    const wejscie = container.querySelector("input[type='file']") as HTMLInputElement;
    const wybrany = plik();
    await userEvent.upload(wejscie, wybrany);
    expect(screen.getByText("dyplom.pdf")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Dodaj załącznik" }));
    });

    expect(dodajZalacznik).toHaveBeenCalledTimes(1);
    expect(dodajZalacznik).toHaveBeenCalledWith("dyplom", wybrany);
    expect(screen.getByText("Masz 1 załącznik.")).toBeInTheDocument();
    expect(pole("Miasto")).toHaveValue("Warszawa");
    expect(screen.queryByText("dyplom.pdf")).not.toBeInTheDocument();
  });

  it("typ załącznika z listy trafia do żądania", async () => {
    dodajZalacznik.mockResolvedValue(WNIOSEK_ROBOCZY);
    const { container } = await pokazZDanymi(WNIOSEK_ROBOCZY);
    await userEvent.upload(container.querySelector("input[type='file']") as HTMLInputElement, plik());

    await userEvent.click(screen.getByRole("combobox", { name: "Typ załącznika" }));
    await userEvent.click(screen.getByRole("option", { name: "Zaświadczenie o niekaralności" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Dodaj załącznik" }));
    });

    expect(dodajZalacznik.mock.calls[0][0]).toBe("niekaralnosc");
  });

  it("błąd serwera przy pliku: komunikat pola z odpowiedzi, a bez niego zdanie zastępcze", async () => {
    dodajZalacznik.mockRejectedValue(
      blad(422, "validation_failed", "Popraw zaznaczone pola.", { errors: { file: ["Dozwolone formaty pliku: PDF, JPG, PNG."] } }),
    );
    const { container } = await pokazZDanymi(WNIOSEK_ROBOCZY);
    await userEvent.upload(container.querySelector("input[type='file']") as HTMLInputElement, plik());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Dodaj załącznik" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Dozwolone formaty pliku: PDF, JPG, PNG.");

    dodajZalacznik.mockRejectedValue(new TypeError("Failed to fetch"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Dodaj załącznik" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się dodać załącznika. Spróbuj ponownie.");
  });
});
