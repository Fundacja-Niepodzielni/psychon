import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/klient";
import { WARUNKI_NIESPELNIONE, WARUNKI_SPELNIONE } from "./atrapy";
import { nazwyDzialan, odnosnik, przyciskiGlowne, szablonListy } from "./kontrole-ekranu";

/**
 * Ekran „Certyfikat”: ładowanie · błąd · brak połączenia · brak dostępu · nie znaleziono ·
 * certyfikat jeszcze niedostępny (z listą braków) · warunki spełnione · certyfikat zlecony
 * (pobranie). W każdym stanie: jeden korzeń szablonu, jeden `h1`, najwyżej jeden przycisk
 * główny. Każdy stan sprawdza nagłówek, przycisk główny i to, czy działa, zdanie wyjaśniające,
 * tekst stanu, nazwy wszystkich przycisków i odnośników oraz cele odnośników. Każdy pomiar ma
 * kontrolę dodatnią: zmianę danych wejścia, która MUSI zmienić to, co widać.
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

const pobierzWarunki = vi.fn();
const zlecCertyfikat = vi.fn();
const pobierzCertyfikat = vi.fn();
const zapiszPlik = vi.fn();
vi.mock("../dane", () => ({
  pobierzWarunki: (...args: unknown[]) => pobierzWarunki(...args),
  zlecCertyfikat: (...args: unknown[]) => zlecCertyfikat(...args),
  pobierzCertyfikat: (...args: unknown[]) => pobierzCertyfikat(...args),
  zapiszPlik: (...args: unknown[]) => zapiszPlik(...args),
}));

const { Certyfikat } = await import("../Certyfikat");

function blad(status: number, code: string, message = "komunikat serwera") {
  return new ApiError({ status, code, message });
}

async function pokaz() {
  let wynik: ReturnType<typeof render> | undefined;
  await act(async () => {
    wynik = render(<Certyfikat />);
  });
  return wynik!;
}

async function pokazZDanymi(dane: unknown) {
  pobierzWarunki.mockResolvedValue(dane);
  const wynik = await pokaz();
  await screen.findByRole("heading", { level: 2, name: "Warunki ukończenia programu" });
  return wynik;
}

/** Stan zlecony: warunki spełnione i kliknięte „Wygeneruj certyfikat”. */
async function pokazZlecony() {
  zlecCertyfikat.mockResolvedValue({ status: "queued" });
  const wynik = await pokazZDanymi(WARUNKI_SPELNIONE);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Wygeneruj certyfikat" }));
  });
  await screen.findByRole("button", { name: "Pobierz certyfikat (PDF)" });
  return wynik;
}

beforeEach(() => {
  push.mockReset();
  back.mockReset();
  api.mockReset();
  api.mockResolvedValue({ first_name: "Marta", role: "volunteer" });
  pobierzWarunki.mockReset();
  zlecCertyfikat.mockReset();
  pobierzCertyfikat.mockReset();
  zapiszPlik.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("Certyfikat — stany bez danych", () => {
  it("ładowanie: nagłówek, zdanie stanu, brak przycisku głównego", async () => {
    pobierzWarunki.mockReturnValue(new Promise(() => {}));
    const { container } = await pokaz();

    szablonListy(container);
    expect(screen.getByRole("heading", { level: 1, name: "Certyfikat" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Wczytywanie certyfikatu…");
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(nazwyDzialan(container)).toEqual(["Wstecz"]);
  });

  it("błąd: komunikat ze zdaniem wyjaśniającym i ponowieniem; ponowienie woła odczyt jeszcze raz", async () => {
    pobierzWarunki.mockRejectedValue(blad(500, "server_error"));
    const { container } = await pokaz();

    szablonListy(container);
    expect(screen.getByRole("heading", { level: 1, name: "Certyfikat" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się wczytać certyfikatu");
    expect(screen.getByRole("alert")).toHaveTextContent("Coś poszło nie tak po naszej stronie. Spróbuj ponownie za chwilę.");
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(nazwyDzialan(container)).toEqual(["Wstecz", "Spróbuj ponownie"]);

    pobierzWarunki.mockResolvedValue(WARUNKI_NIESPELNIONE);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    });
    expect(pobierzWarunki).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("heading", { level: 2, name: "Warunki ukończenia programu" })).toBeInTheDocument();
  });

  it("brak połączenia: osobny komunikat, nie „coś poszło nie tak”", async () => {
    pobierzWarunki.mockRejectedValue(new TypeError("Failed to fetch"));
    const { container } = await pokaz();

    expect(screen.getByRole("alert")).toHaveTextContent("Brak połączenia");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.",
    );
    expect(nazwyDzialan(container)).toEqual(["Wstecz", "Spróbuj ponownie"]);
    expect(przyciskiGlowne(container)).toHaveLength(0);
  });

  it.each([403, 401])("brak dostępu (%i): wspólny ekran odmowy z jednym przyciskiem prowadzącym do pulpitu", async (status) => {
    pobierzWarunki.mockRejectedValue(blad(status, "forbidden"));
    const { container } = await pokaz();

    szablonListy(container);
    expect(screen.getByRole("heading", { level: 1, name: "Certyfikat" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Nie masz dostępu do tego ekranu" })).toBeInTheDocument();
    expect(await screen.findByText("Twoja rola: Wolontariusz. Ten ekran jest dla osób wolontariackich.")).toBeInTheDocument();
    expect(nazwyDzialan(container)).toEqual(["Wstecz", "Wróć do pulpitu"]);
    expect(przyciskiGlowne(container)).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Wróć do pulpitu" }));
    expect(push).toHaveBeenCalledWith("/panel/pulpit");
  });

  it("nie znaleziono: wspólny ekran z przyciskiem „Odśwież”", async () => {
    pobierzWarunki.mockRejectedValue(blad(404, "not_found"));
    const { container } = await pokaz();

    expect(screen.getByRole("heading", { level: 2, name: "Nie znaleziono danych certyfikatu" })).toBeInTheDocument();
    expect(
      screen.getByText("Nie mamy dla Ciebie danych do wyświetlenia. Odśwież stronę albo wróć za chwilę."),
    ).toBeInTheDocument();
    expect(nazwyDzialan(container)).toEqual(["Wstecz", "Odśwież"]);

    pobierzWarunki.mockResolvedValue(WARUNKI_NIESPELNIONE);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Odśwież" }));
    });
    expect(pobierzWarunki).toHaveBeenCalledTimes(2);
  });
});

describe("Certyfikat — jeszcze niedostępny", () => {
  it("nagłówek, zdanie, stan, niedostępny przycisk główny z powodem i lista braków", async () => {
    const { container } = await pokazZDanymi(WARUNKI_NIESPELNIONE);

    szablonListy(container);
    expect(screen.getByRole("heading", { level: 1, name: "Certyfikat" })).toBeInTheDocument();
    expect(screen.getByText("Certyfikat będzie dostępny po spełnieniu wszystkich czterech warunków.")).toBeInTheDocument();
    expect(screen.getByText("Jeszcze niedostępny")).toBeInTheDocument();

    const [glowny, ...reszta] = przyciskiGlowne(container);
    expect(reszta).toHaveLength(0);
    expect(glowny).toHaveTextContent("Wygeneruj certyfikat");
    expect(glowny).toHaveAttribute("aria-disabled", "true");
    expect(glowny).not.toBeDisabled();
    expect(document.getElementById(glowny.getAttribute("aria-describedby") ?? "")).toHaveTextContent(
      "Najpierw spełnij wszystkie warunki z listy poniżej.",
    );

    expect(screen.getByText("Spełniasz 0 warunków z 4.")).toBeInTheDocument();
    expect(screen.getByText("Masz 1 z 10.")).toBeInTheDocument();
    expect(screen.getByText("Masz 41,5 z 72 godz.")).toBeInTheDocument();
    expect(screen.getByText("Masz 5 z 6.")).toBeInTheDocument();
    expect(screen.getByText("Warsztat jeszcze niezaliczony.")).toBeInTheDocument();
    expect(screen.getByText("Masz 2 zaliczone testy.")).toBeInTheDocument();
    expect(screen.getAllByText("Brakuje")).toHaveLength(4);
    expect(screen.queryByText("Spełniony")).not.toBeInTheDocument();
  });

  it("nazwy i cele odnośników: trzy ekrany źródłowe, warsztat bez odnośnika", async () => {
    const { container } = await pokazZDanymi(WARUNKI_NIESPELNIONE);

    expect(nazwyDzialan(container)).toEqual([
      "Wstecz",
      "Wygeneruj certyfikat",
      "Otwórz kursy: Wszystkie etapy i testy. Masz 1 z 10.",
      "Otwórz dziennik stażu: Godziny stażu. Masz 41,5 z 72 godz.",
      "Otwórz superwizje: Obecności na superwizjach. Masz 5 z 6.",
    ]);
    expect(odnosnik(container, "Otwórz kursy: Wszystkie etapy i testy. Masz 1 z 10.")).toHaveAttribute("href", "/panel/kursy");
    expect(odnosnik(container, "Otwórz dziennik stażu: Godziny stażu. Masz 41,5 z 72 godz.")).toHaveAttribute("href", "/panel/staz");
    expect(odnosnik(container, "Otwórz superwizje: Obecności na superwizjach. Masz 5 z 6.")).toHaveAttribute(
      "href",
      "/panel/superwizja",
    );
  });

  it("kliknięcie niedostępnego przycisku niczego nie wysyła i przenosi fokus na listę braków", async () => {
    const { container } = await pokazZDanymi(WARUNKI_NIESPELNIONE);

    fireEvent.click(przyciskiGlowne(container)[0]);

    expect(zlecCertyfikat).not.toHaveBeenCalled();
    expect(pobierzCertyfikat).not.toHaveBeenCalled();
    expect(document.activeElement).toContainElement(screen.getByRole("heading", { level: 2, name: "Warunki ukończenia programu" }));
  });

  it("brak liczników to „brak danych”, nigdy zero; brak pola o testach też", async () => {
    await pokazZDanymi({
      eligible: false,
      conditions: [
        { key: "courses", label: "Wszystkie etapy i testy", met: false },
        ...WARUNKI_NIESPELNIONE.conditions.slice(1),
      ],
    });

    expect(screen.getByText("Brak danych o postępie.")).toBeInTheDocument();
    expect(screen.getByText("Brak danych o zaliczonych testach.")).toBeInTheDocument();
    expect(screen.queryByText(/Masz 0/)).not.toBeInTheDocument();
  });

  it("kontrola dodatnia: spełniony warunek zmienia wiersz i licznik spełnionych", async () => {
    await pokazZDanymi({
      ...WARUNKI_NIESPELNIONE,
      conditions: WARUNKI_NIESPELNIONE.conditions.map((w) =>
        w.key === "workshop" ? { ...w, met: true } : w.key === "supervision" ? { ...w, done: 6, met: true } : w,
      ),
    });

    expect(screen.getByText("Spełniasz 2 warunki z 4.")).toBeInTheDocument();
    expect(screen.getByText("Warsztat zaliczony.")).toBeInTheDocument();
    expect(screen.getAllByText("Spełniony")).toHaveLength(2);
    expect(screen.getAllByText("Brakuje")).toHaveLength(2);
  });
});

describe("Certyfikat — warunki spełnione", () => {
  it("jeden zielony, aktywny przycisk „Wygeneruj certyfikat” i zdanie o spełnionych warunkach", async () => {
    const { container } = await pokazZDanymi(WARUNKI_SPELNIONE);

    szablonListy(container);
    expect(screen.getByRole("heading", { level: 1, name: "Certyfikat" })).toBeInTheDocument();
    expect(screen.getByText("Wszystkie warunki są spełnione. Możesz wygenerować certyfikat.")).toBeInTheDocument();
    expect(screen.getByText("Warunki spełnione")).toBeInTheDocument();
    expect(screen.getByText("Spełniasz 4 warunki z 4.")).toBeInTheDocument();
    expect(screen.getByText("Masz 10 zaliczonych testów.")).toBeInTheDocument();

    const [glowny, ...reszta] = przyciskiGlowne(container);
    expect(reszta).toHaveLength(0);
    expect(glowny).toHaveTextContent("Wygeneruj certyfikat");
    expect(glowny).not.toHaveAttribute("aria-disabled");
    expect(glowny).toBeEnabled();
    expect(nazwyDzialan(container)).toEqual([
      "Wstecz",
      "Wygeneruj certyfikat",
      "Otwórz kursy: Wszystkie etapy i testy. Masz 10 z 10.",
      "Otwórz dziennik stażu: Godziny stażu. Masz 72 z 72 godz.",
      "Otwórz superwizje: Obecności na superwizjach. Masz 6 z 6.",
    ]);
  });

  it("kliknięcie zleca certyfikat dokładnie jednym żądaniem i przechodzi do pobrania", async () => {
    zlecCertyfikat.mockResolvedValue({ status: "queued" });
    await pokazZDanymi(WARUNKI_SPELNIONE);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Wygeneruj certyfikat" }));
    });

    expect(zlecCertyfikat).toHaveBeenCalledTimes(1);
    expect(pobierzCertyfikat).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Pobierz certyfikat (PDF)" })).toBeInTheDocument();
  });

  it("odmowa wydania (422 conditions_not_met): komunikat i ponowny odczyt warunków", async () => {
    zlecCertyfikat.mockRejectedValue(blad(422, "conditions_not_met"));
    await pokazZDanymi(WARUNKI_SPELNIONE);
    pobierzWarunki.mockResolvedValue(WARUNKI_NIESPELNIONE);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Wygeneruj certyfikat" }));
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("Nie wszystkie warunki są spełnione — odśwież listę poniżej.");
    expect(pobierzWarunki).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByText("Jeszcze niedostępny")).toBeInTheDocument());
  });

  it("inny błąd API przy wydaniu pokazuje komunikat serwera, błąd sieci — zdanie zastępcze; przycisk zostaje", async () => {
    zlecCertyfikat.mockRejectedValue(blad(500, "server_error", "Serwer nie odpowiada."));
    await pokazZDanymi(WARUNKI_SPELNIONE);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Wygeneruj certyfikat" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Serwer nie odpowiada.");
    expect(screen.getByRole("button", { name: "Wygeneruj certyfikat" })).toBeInTheDocument();

    zlecCertyfikat.mockRejectedValue(new TypeError("Failed to fetch"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Wygeneruj certyfikat" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się rozpocząć generowania. Spróbuj ponownie.");
  });
});

describe("Certyfikat — zlecony, do pobrania", () => {
  it("jeden zielony, aktywny przycisk z formatem pliku, zdanie i tekst stanu", async () => {
    const { container } = await pokazZlecony();

    szablonListy(container);
    expect(screen.getByRole("heading", { level: 1, name: "Certyfikat" })).toBeInTheDocument();
    expect(screen.getByText("Certyfikat został zlecony do wygenerowania. Plik będzie gotowy za chwilę.")).toBeInTheDocument();
    expect(screen.getByText("Zlecony")).toBeInTheDocument();

    const [glowny, ...reszta] = przyciskiGlowne(container);
    expect(reszta).toHaveLength(0);
    expect(glowny).toHaveTextContent("Pobierz certyfikat (PDF)");
    expect(glowny).not.toHaveAttribute("aria-disabled");
    expect(glowny).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Wygeneruj certyfikat" })).not.toBeInTheDocument();
    expect(nazwyDzialan(container).slice(0, 2)).toEqual(["Wstecz", "Pobierz certyfikat (PDF)"]);
  });

  it("pobranie zapisuje plik pod nazwą z odpowiedzi serwera", async () => {
    const plik = new Blob(["%PDF-"], { type: "application/pdf" });
    pobierzCertyfikat.mockResolvedValue({ rodzaj: "plik", plik, nazwa: "certyfikat-NP-2026-017.pdf" });
    await pokazZlecony();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pobierz certyfikat (PDF)" }));
    });

    expect(pobierzCertyfikat).toHaveBeenCalledTimes(1);
    expect(zapiszPlik).toHaveBeenCalledWith(plik, "certyfikat-NP-2026-017.pdf");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pobierz certyfikat (PDF)" })).toBeEnabled();
  });

  it("w trakcie pobierania napis przycisku się zmienia, a drugie kliknięcie niczego nie wysyła", async () => {
    let zakoncz: (wynik: unknown) => void = () => {};
    pobierzCertyfikat.mockReturnValue(new Promise((rozwiaz) => (zakoncz = rozwiaz)));
    await pokazZlecony();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pobierz certyfikat (PDF)" }));
    });
    const wTrakcie = screen.getByRole("button", { name: "Pobieranie…" });
    fireEvent.click(wTrakcie);
    expect(pobierzCertyfikat).toHaveBeenCalledTimes(1);

    await act(async () => zakoncz({ rodzaj: "jeszcze-nie" }));
    expect(screen.getByRole("button", { name: "Pobierz certyfikat (PDF)" })).toBeInTheDocument();
  });

  it("plik jeszcze się generuje (404): zdanie ostrzegawcze, przycisk zostaje do ponowienia", async () => {
    pobierzCertyfikat.mockResolvedValue({ rodzaj: "jeszcze-nie" });
    await pokazZlecony();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pobierz certyfikat (PDF)" }));
    });

    expect(screen.getByRole("status")).toHaveTextContent("Certyfikat jeszcze się generuje. Spróbuj ponownie za chwilę.");
    expect(zapiszPlik).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Pobierz certyfikat (PDF)" })).toBeEnabled();
  });

  it("inny błąd pobrania: komunikat błędu, nic nie zapisano", async () => {
    pobierzCertyfikat.mockRejectedValue(new Error("500"));
    await pokazZlecony();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pobierz certyfikat (PDF)" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się pobrać pliku. Spróbuj ponownie za chwilę.");
    expect(zapiszPlik).not.toHaveBeenCalled();
  });
});
