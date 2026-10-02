import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api/klient";
import {
  DOKUMENT_POROZUMIENIE,
  DOKUMENTY_PUSTE,
  DOKUMENTY_Z_LISTA,
  TYPY_ZASWIADCZENIE_DOSTEPNE,
} from "./atrapy";
import { nazwyDzialan, odnosnik, przyciskiGlowne, szablonListy } from "./kontrole-ekranu";

/**
 * Ekran „Dokumenty”: ładowanie · błąd · brak połączenia · brak dostępu · nie znaleziono ·
 * pusta lista · lista dokumentów. W każdym stanie: jeden korzeń szablonu, jeden `h1`, brak
 * przycisku głównego (każde działanie należy do wiersza). Każdy stan sprawdza nagłówek,
 * zdanie wyjaśniające, tekst stanu, nazwy wszystkich przycisków i odnośników oraz cele
 * odnośników. Każdy pomiar ma kontrolę dodatnią: zmianę danych wejścia, która MUSI zmienić to,
 * co widać.
 */

const push = vi.fn();
const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push, replace: vi.fn(), refresh: vi.fn() }),
}));

const api = vi.fn();
vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
}));

const pobierzDokumenty = vi.fn();
const pobierzPlikDokumentu = vi.fn();
const wystawDokument = vi.fn();
vi.mock("../dane", () => ({
  pobierzDokumenty: (...args: unknown[]) => pobierzDokumenty(...args),
  pobierzPlikDokumentu: (...args: unknown[]) => pobierzPlikDokumentu(...args),
  wystawDokument: (...args: unknown[]) => wystawDokument(...args),
}));

const { Dokumenty } = await import("../Dokumenty");

const NAZWA_POBRANIA = "Pobierz porozumienie wolontariackie NP/PW/2026/003 (plik PDF)";

function blad(status: number, code: string, message = "komunikat serwera") {
  return new ApiError({ status, code, message });
}

async function pokaz() {
  let wynik: ReturnType<typeof render> | undefined;
  await act(async () => {
    wynik = render(<Dokumenty />);
  });
  return wynik!;
}

async function pokazZDanymi(dane: unknown) {
  pobierzDokumenty.mockResolvedValue(dane);
  const wynik = await pokaz();
  await screen.findByRole("heading", { level: 2, name: "Twoje dokumenty" });
  return wynik;
}

beforeEach(() => {
  push.mockReset();
  back.mockReset();
  api.mockReset();
  api.mockResolvedValue({ first_name: "Marta", role: "volunteer" });
  pobierzDokumenty.mockReset();
  pobierzPlikDokumentu.mockReset();
  wystawDokument.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("Dokumenty — stany bez danych", () => {
  it("ładowanie: nagłówek, zdanie stanu, brak przycisku głównego", async () => {
    pobierzDokumenty.mockReturnValue(new Promise(() => {}));
    const { container } = await pokaz();

    szablonListy(container);
    expect(screen.getByRole("heading", { level: 1, name: "Dokumenty" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Wczytywanie dokumentów…");
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(nazwyDzialan(container)).toEqual(["Wstecz"]);
  });

  it("błąd: komunikat ze zdaniem wyjaśniającym i ponowieniem; ponowienie woła odczyt jeszcze raz", async () => {
    pobierzDokumenty.mockRejectedValue(blad(500, "server_error"));
    const { container } = await pokaz();

    szablonListy(container);
    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się wczytać dokumentów");
    expect(screen.getByRole("alert")).toHaveTextContent("Coś poszło nie tak po naszej stronie. Spróbuj ponownie za chwilę.");
    expect(nazwyDzialan(container)).toEqual(["Wstecz", "Spróbuj ponownie"]);

    pobierzDokumenty.mockResolvedValue(DOKUMENTY_Z_LISTA);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    });
    expect(pobierzDokumenty).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("heading", { level: 2, name: "Twoje dokumenty" })).toBeInTheDocument();
  });

  it("brak połączenia: osobny komunikat", async () => {
    pobierzDokumenty.mockRejectedValue(new TypeError("Failed to fetch"));
    const { container } = await pokaz();

    expect(screen.getByRole("alert")).toHaveTextContent("Brak połączenia");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.",
    );
    expect(nazwyDzialan(container)).toEqual(["Wstecz", "Spróbuj ponownie"]);
  });

  it("brak dostępu (403): wspólny ekran odmowy z jednym przyciskiem prowadzącym do pulpitu, bez ponowienia", async () => {
    pobierzDokumenty.mockRejectedValue(blad(403, "forbidden"));
    const { container } = await pokaz();

    szablonListy(container);
    expect(screen.getByRole("heading", { level: 1, name: "Dokumenty" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Nie masz dostępu do tego ekranu" })).toBeInTheDocument();
    expect(
      await screen.findByText("Jesteś zalogowany jako Wolontariusz. Ten ekran jest dla osób uczestniczących w programie."),
    ).toBeInTheDocument();
    expect(nazwyDzialan(container)).toEqual(["Wstecz", "Wróć do pulpitu"]);
    expect(screen.queryByRole("button", { name: "Spróbuj ponownie" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Wróć do pulpitu" }));
    expect(push).toHaveBeenCalledWith("/panel/pulpit");
  });

  it("nie znaleziono (404): wspólny ekran z przyciskiem „Odśwież”", async () => {
    pobierzDokumenty.mockRejectedValue(blad(404, "not_found"));
    const { container } = await pokaz();

    expect(screen.getByRole("heading", { level: 2, name: "Nie znaleziono dokumentów" })).toBeInTheDocument();
    expect(nazwyDzialan(container)).toEqual(["Wstecz", "Odśwież"]);
  });
});

describe("Dokumenty — pusta lista", () => {
  it("zdanie o braku dokumentów, przycisk „Odśwież” i powód niedostępności rodzajów", async () => {
    const { container } = await pokazZDanymi(DOKUMENTY_PUSTE);

    szablonListy(container);
    expect(screen.getByRole("heading", { level: 1, name: "Dokumenty" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Brak dokumentów" })).toBeInTheDocument();
    expect(
      screen.getByText("Nie masz jeszcze żadnych dokumentów. Poniżej zobaczysz, które możesz wygenerować."),
    ).toBeInTheDocument();
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(screen.getAllByText("Jeszcze niedostępny")).toHaveLength(2);
    expect(screen.getByText("Uzupełnij w profilu: telefon, PESEL, ulica z numerem.")).toBeInTheDocument();
    expect(screen.getByText("Uzupełnij w profilu: PESEL.")).toBeInTheDocument();
    expect(nazwyDzialan(container)).toEqual([
      "Wstecz",
      "Odśwież",
      "Uzupełnij profil, aby wygenerować: Porozumienie wolontariackie",
      "Uzupełnij profil, aby wygenerować: Zaświadczenie o stażu",
    ]);
    expect(odnosnik(container, "Uzupełnij profil, aby wygenerować: Zaświadczenie o stażu")).toHaveAttribute("href", "/panel/profil");
  });

  it("kontrola dodatnia: jeden dokument na liście znosi stan pusty", async () => {
    await pokazZDanymi(DOKUMENTY_Z_LISTA);
    expect(screen.queryByRole("heading", { level: 2, name: "Brak dokumentów" })).not.toBeInTheDocument();
  });
});

describe("Dokumenty — lista dokumentów", () => {
  it("nazwa, numer, data wydania i pobranie z pełną nazwą dostępną (co i w jakim formacie)", async () => {
    const { container } = await pokazZDanymi(DOKUMENTY_Z_LISTA);

    szablonListy(container);
    expect(screen.getByRole("heading", { level: 1, name: "Dokumenty" })).toBeInTheDocument();
    expect(screen.getByText("Dokumenty, które wydano Ci w programie, i te, które możesz jeszcze wygenerować.")).toBeInTheDocument();
    expect(screen.getAllByText("Porozumienie wolontariackie").length).toBeGreaterThan(0);
    expect(screen.getByText("NP/PW/2026/003")).toBeInTheDocument();
    expect(screen.getByText("Wydano: 10 września 2026")).toBeInTheDocument();
    expect(przyciskiGlowne(container)).toHaveLength(0);

    const pobierz = screen.getByRole("button", { name: NAZWA_POBRANIA });
    expect(pobierz).toHaveTextContent("Pobierz PDF");
    expect(pobierz).toBeEnabled();
    expect(nazwyDzialan(container)).toEqual(["Wstecz", NAZWA_POBRANIA]);
  });

  it("karty rodzajów: „Wygenerowano” dla wydanego, zdanie o godzinach dla niedostępnego, bez przycisku „Wygeneruj”", async () => {
    await pokazZDanymi(DOKUMENTY_Z_LISTA);

    expect(screen.getByRole("heading", { level: 2, name: "Dokumenty do wygenerowania" })).toBeInTheDocument();
    expect(screen.getByText("Wygenerowano")).toBeInTheDocument();
    expect(screen.getByText("Ten dokument masz już na liście powyżej.")).toBeInTheDocument();
    expect(screen.getByText("Jeszcze niedostępny")).toBeInTheDocument();
    expect(screen.getByText("Zaakceptowane godziny stażu: 41,5 z 72 wymaganych.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Wygeneruj/ })).not.toBeInTheDocument();
  });

  it("kontrola dodatnia: dostępny rodzaj dostaje aktywny przycisk „Wygeneruj” z pełną nazwą", async () => {
    const { container } = await pokazZDanymi({ ...DOKUMENTY_Z_LISTA, availableTypes: TYPY_ZASWIADCZENIE_DOSTEPNE });

    expect(screen.getByText("Można wygenerować")).toBeInTheDocument();
    expect(screen.getByText("Możesz wygenerować go teraz.")).toBeInTheDocument();
    const wystaw = screen.getByRole("button", { name: "Wygeneruj zaświadczenie o stażu" });
    expect(wystaw).toHaveTextContent("Wygeneruj");
    expect(wystaw).toBeEnabled();
    expect(nazwyDzialan(container)).toEqual(["Wstecz", NAZWA_POBRANIA, "Wygeneruj zaświadczenie o stażu"]);
  });

  it("pobranie woła pobranie dokumentu z listy; w trakcie napis „Pobieranie…” i brak drugiego żądania", async () => {
    let zakoncz: () => void = () => {};
    pobierzPlikDokumentu.mockReturnValue(new Promise<void>((rozwiaz) => (zakoncz = rozwiaz)));
    await pokazZDanymi(DOKUMENTY_Z_LISTA);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: NAZWA_POBRANIA }));
    });
    expect(pobierzPlikDokumentu).toHaveBeenCalledWith(DOKUMENT_POROZUMIENIE);
    const wTrakcie = screen.getByRole("button", { name: NAZWA_POBRANIA });
    expect(wTrakcie).toHaveTextContent("Pobieranie…");
    fireEvent.click(wTrakcie);
    expect(pobierzPlikDokumentu).toHaveBeenCalledTimes(1);

    await act(async () => zakoncz());
    expect(screen.getByRole("button", { name: NAZWA_POBRANIA })).toHaveTextContent("Pobierz PDF");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("błąd pobrania: komunikat serwera albo zdanie zastępcze", async () => {
    pobierzPlikDokumentu.mockRejectedValue(blad(404, "not_found", "Nie znaleziono zasobu."));
    await pokazZDanymi(DOKUMENTY_Z_LISTA);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: NAZWA_POBRANIA }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się pobrać dokumentu");
    expect(screen.getByRole("alert")).toHaveTextContent("Nie znaleziono zasobu.");

    pobierzPlikDokumentu.mockRejectedValue(new TypeError("Failed to fetch"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: NAZWA_POBRANIA }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się pobrać dokumentu.");
  });

  it("wygenerowanie woła żądanie z rodzajem i czyta listę od nowa", async () => {
    wystawDokument.mockResolvedValue({ ...DOKUMENT_POROZUMIENIE, id: 4, type: "internship_certificate", number: "NP/ZS/2026/004" });
    await pokazZDanymi({ ...DOKUMENTY_Z_LISTA, availableTypes: TYPY_ZASWIADCZENIE_DOSTEPNE });
    pobierzDokumenty.mockResolvedValue({
      documents: [DOKUMENT_POROZUMIENIE, { ...DOKUMENT_POROZUMIENIE, id: 4, type: "internship_certificate", number: "NP/ZS/2026/004" }],
      availableTypes: DOKUMENTY_Z_LISTA.availableTypes,
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Wygeneruj zaświadczenie o stażu" }));
    });

    expect(wystawDokument).toHaveBeenCalledWith("internship_certificate");
    expect(pobierzDokumenty).toHaveBeenCalledTimes(2);
    expect(screen.getByText("NP/ZS/2026/004")).toBeInTheDocument();
    expect(screen.getAllByText("Wygenerowano")).toHaveLength(2);
  });

  it("błąd wygenerowania: komunikat pod nagłówkiem z nazwą rodzaju, przycisk zostaje", async () => {
    wystawDokument.mockRejectedValue(blad(422, "profile_incomplete", "Uzupełnij profil."));
    await pokazZDanymi({ ...DOKUMENTY_Z_LISTA, availableTypes: TYPY_ZASWIADCZENIE_DOSTEPNE });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Wygeneruj zaświadczenie o stażu" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się wygenerować: Zaświadczenie o stażu");
    expect(screen.getByRole("alert")).toHaveTextContent("Uzupełnij profil.");
    expect(screen.getByRole("button", { name: "Wygeneruj zaświadczenie o stażu" })).toBeEnabled();
  });
});
