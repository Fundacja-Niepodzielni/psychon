import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/klient";
import { eksport } from "./atrapy";

/**
 * Eksport danych: nie rozpoczęty · przygotowywanie · gotowy · wygasły · błąd. W każdym stanie:
 * zdanie, jedyny przycisk główny karty i to, czy działa, nazwy dostępne przycisków oraz
 * powód każdego przycisku niedostępnego. Sprawdzanie stanu biegnie co 2 sekundy, na
 * sztucznych zegarach.
 */

vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const zlecEksport = vi.fn();
const pobierzStanEksportu = vi.fn();
const pobierzPlikEksportu = vi.fn();
vi.mock("../dane", () => ({
  zlecEksport: (...argumenty: unknown[]) => zlecEksport(...argumenty),
  pobierzStanEksportu: (...argumenty: unknown[]) => pobierzStanEksportu(...argumenty),
  pobierzPlikEksportu: (...argumenty: unknown[]) => pobierzPlikEksportu(...argumenty),
}));

const { KartaEksportu } = await import("../KartaEksportu");

function przyciskiGlowne(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>("button")].filter((przycisk) =>
    przycisk.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)),
  );
}

/** Przesuwa zegar i opróżnia kolejkę obietnic, żeby odpowiedź zdążyła zmienić stan. */
async function uplyw(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function zleconyEksport(status: Parameters<typeof eksport>[0] = "queued") {
  zlecEksport.mockResolvedValue(eksport(status));
  const wynik = render(<KartaEksportu />);
  fireEvent.click(screen.getByRole("button", { name: "Przygotuj eksport" }));
  await uplyw(0);
  return wynik;
}

async function naGotowy() {
  pobierzStanEksportu.mockResolvedValue(eksport("ready"));
  const wynik = await zleconyEksport("queued");
  await uplyw(2000);
  return wynik;
}

beforeEach(() => {
  vi.useFakeTimers();
  zlecEksport.mockReset();
  pobierzStanEksportu.mockReset();
  pobierzPlikEksportu.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Eksport danych — nie rozpoczęty", () => {
  it("nagłówek, zdanie o zakresie, jeden działający przycisk główny „Przygotuj eksport”, bez stanu i bez błędu", () => {
    const { container } = render(<KartaEksportu />);

    expect(screen.getByRole("heading", { level: 2, name: "Eksport danych (RODO)" })).toBeInTheDocument();
    expect(screen.getByText(/Przygotujemy plik ze wszystkimi Twoimi danymi/)).toBeInTheDocument();
    const przycisk = screen.getByRole("button", { name: "Przygotuj eksport" });
    expect(przyciskiGlowne(container)).toEqual([przycisk]);
    expect(przycisk).not.toHaveAttribute("aria-disabled");
    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(zlecEksport).not.toHaveBeenCalled();
  });

  it("kliknięcie zleca eksport raz: POST bez argumentów", async () => {
    await zleconyEksport();
    expect(zlecEksport).toHaveBeenCalledTimes(1);
    expect(zlecEksport).toHaveBeenCalledWith();
  });

  it("w czasie zlecania przycisk mówi, co się dzieje, jest niedostępny z powodem i nie wysyła drugiego żądania", async () => {
    let rozwiaz: (wartosc: unknown) => void = () => {};
    zlecEksport.mockReturnValue(new Promise((resolve) => (rozwiaz = resolve)));
    render(<KartaEksportu />);
    fireEvent.click(screen.getByRole("button", { name: "Przygotuj eksport" }));

    await uplyw(0);
    const przycisk = screen.getByRole("button", { name: "Wysyłanie prośby…" });
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    expect(przycisk).toHaveAccessibleDescription("Wysyłamy prośbę o eksport — za chwilę pokażemy jego stan.");
    fireEvent.click(przycisk);
    expect(zlecEksport).toHaveBeenCalledTimes(1);

    rozwiaz(eksport("queued"));
    await uplyw(0);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("Eksport danych — przygotowywanie", () => {
  it("zdanie w komunikacie statusu, plakietka, jedyny przycisk główny niedostępny z powodem; kliknięcie nic nie robi", async () => {
    const { container } = await zleconyEksport("queued");

    const status = screen.getByRole("status");
    expect(within(status).getByText("przygotowywanie")).toBeInTheDocument();
    expect(within(status).getByText(/Przygotowujemy Twój plik\. Zostań na tej stronie/)).toBeInTheDocument();
    const przycisk = screen.getByRole("button", { name: "Przygotuj eksport" });
    expect(przyciskiGlowne(container)).toEqual([przycisk]);
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    expect(przycisk).toHaveAccessibleDescription("Eksport jest w trakcie przygotowania.");
    fireEvent.click(przycisk);
    expect(zlecEksport).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Pobierz plik" })).toBeNull();
  });

  it("stan sprawdzany co 2 sekundy, jedno żądanie naraz, aż eksport będzie gotowy", async () => {
    pobierzStanEksportu.mockResolvedValueOnce(eksport("processing")).mockResolvedValue(eksport("ready"));
    await zleconyEksport("queued");

    await uplyw(1900);
    expect(pobierzStanEksportu).not.toHaveBeenCalled();
    await uplyw(100);
    expect(pobierzStanEksportu).toHaveBeenCalledTimes(1);
    expect(pobierzStanEksportu).toHaveBeenCalledWith("ex_9f2");
    expect(screen.getByText("przygotowywanie")).toBeInTheDocument();

    await uplyw(2000);
    expect(pobierzStanEksportu).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Pobierz plik" })).toBeInTheDocument();

    await uplyw(10_000);
    expect(pobierzStanEksportu).toHaveBeenCalledTimes(2);
  });

  it("żądanie sprawdzenia w toku nie jest dublowane kolejnym", async () => {
    pobierzStanEksportu.mockReturnValue(new Promise(() => {}));
    await zleconyEksport("queued");
    await uplyw(10_000);
    expect(pobierzStanEksportu).toHaveBeenCalledTimes(1);
  });
});

describe("Eksport danych — gotowy", () => {
  it("zdanie o usunięciu pliku po 24 godzinach, główny przycisk „Pobierz plik”, „Przygotuj nowy eksport” niedostępny z powodem", async () => {
    const { container } = await naGotowy();

    expect(screen.getByText("gotowy")).toBeInTheDocument();
    expect(screen.getByText("Twój plik jest gotowy. Plik usuniemy po 24 godzinach.")).toBeInTheDocument();
    const pobierz = screen.getByRole("button", { name: "Pobierz plik" });
    expect(przyciskiGlowne(container)).toEqual([pobierz]);
    expect(pobierz).not.toHaveAttribute("aria-disabled");

    const nowy = screen.getByRole("button", { name: "Przygotuj nowy eksport" });
    expect(nowy).toHaveAttribute("aria-disabled", "true");
    expect(nowy).toHaveAccessibleDescription("Masz już gotowy plik. Nowy eksport przygotujesz, gdy ten wygaśnie.");
    fireEvent.click(nowy);
    expect(zlecEksport).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("pobranie: plik zamawiany z identyfikatorem eksportu; w trakcie „Pobieranie…” i bez drugiego pobrania", async () => {
    await naGotowy();
    let rozwiaz: () => void = () => {};
    pobierzPlikEksportu.mockReturnValue(new Promise<void>((resolve) => (rozwiaz = resolve)));

    fireEvent.click(screen.getByRole("button", { name: "Pobierz plik" }));
    await uplyw(0);
    const wTrakcie = screen.getByRole("button", { name: "Pobieranie…" });
    expect(wTrakcie).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(wTrakcie);
    expect(pobierzPlikEksportu).toHaveBeenCalledTimes(1);
    expect(pobierzPlikEksportu).toHaveBeenCalledWith("ex_9f2");

    rozwiaz();
    await uplyw(0);
    expect(screen.getByRole("button", { name: "Pobierz plik" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("pobranie, które kończy się 404: eksport wygasł — zdanie o wygaśnięciu, błąd z fokusem, nowy eksport możliwy", async () => {
    const { container } = await naGotowy();
    pobierzPlikEksportu.mockRejectedValue(new ApiError({ status: 404, code: "not_found", message: "x" }));

    fireEvent.click(screen.getByRole("button", { name: "Pobierz plik" }));
    await uplyw(0);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Ten eksport wygasł i plik został usunięty. Przygotuj nowy.");
    expect(document.activeElement).toBe(alert);
    expect(screen.getByText("wygasł")).toBeInTheDocument();
    expect(screen.getByText("Plik wygasł i został usunięty. Przygotuj nowy eksport.")).toBeInTheDocument();
    const nowy = screen.getByRole("button", { name: "Przygotuj nowy eksport" });
    expect(przyciskiGlowne(container)).toEqual([nowy]);
    expect(nowy).not.toHaveAttribute("aria-disabled");
    expect(screen.queryByRole("button", { name: "Pobierz plik" })).toBeNull();
  });

  it("inny błąd pobrania: „Nie udało się pobrać pliku. Spróbuj ponownie.”, przycisk pobrania zostaje", async () => {
    await naGotowy();
    pobierzPlikEksportu.mockRejectedValue(new ApiError({ status: 500, code: "x", message: "x" }));

    fireEvent.click(screen.getByRole("button", { name: "Pobierz plik" }));
    await uplyw(0);

    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się pobrać pliku. Spróbuj ponownie.");
    expect(screen.getByRole("button", { name: "Pobierz plik" })).toBeInTheDocument();
  });
});

describe("Eksport danych — wygasły", () => {
  it("status „expired” ze sprawdzania: zdanie, plakietka i jedyny przycisk główny „Przygotuj nowy eksport”, który zleca nowy eksport", async () => {
    pobierzStanEksportu.mockResolvedValue(eksport("expired"));
    const { container } = await zleconyEksport("queued");
    await uplyw(2000);

    expect(screen.getByText("wygasł")).toBeInTheDocument();
    expect(screen.getByText("Plik wygasł i został usunięty. Przygotuj nowy eksport.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    const nowy = screen.getByRole("button", { name: "Przygotuj nowy eksport" });
    expect(przyciskiGlowne(container)).toEqual([nowy]);

    zlecEksport.mockResolvedValue(eksport("queued", { id: "ex_new" }));
    fireEvent.click(nowy);
    await uplyw(0);
    expect(zlecEksport).toHaveBeenCalledTimes(2);
    expect(screen.getByText("przygotowywanie")).toBeInTheDocument();
  });
});

describe("Eksport danych — błędy", () => {
  it("status „failed”: błąd z fokusem, bez plakietki stanu, „Przygotuj nowy eksport” działa", async () => {
    pobierzStanEksportu.mockResolvedValue(eksport("failed"));
    const { container } = await zleconyEksport("queued");
    await uplyw(2000);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Przygotowanie eksportu nie powiodło się. Spróbuj ponownie.");
    expect(document.activeElement).toBe(alert);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText("przygotowywanie")).toBeNull();
    const nowy = screen.getByRole("button", { name: "Przygotuj nowy eksport" });
    expect(przyciskiGlowne(container)).toEqual([nowy]);
    expect(nowy).not.toHaveAttribute("aria-disabled");
  });

  it.each([
    [{ status: 429, code: "too_many_requests", message: "x", reason: { retry_after_seconds: 5 } }, "Za dużo żądań eksportu. Spróbuj ponownie za 5 sekund."],
    [{ status: 429, code: "too_many_requests", message: "x", reason: { retry_after_seconds: 1 } }, "Za dużo żądań eksportu. Spróbuj ponownie za 1 sekundę."],
    [{ status: 429, code: "too_many_requests", message: "x" }, "Za dużo żądań eksportu. Spróbuj ponownie za chwilę."],
    [{ status: 409, code: "export_already_available", message: "Masz już przygotowany eksport danych. Pobierz go albo poczekaj, aż wygaśnie." }, "Masz już przygotowany eksport danych. Pobierz go albo poczekaj, aż wygaśnie."],
    [{ status: 500, code: "x", message: "Awaria serwera." }, "Awaria serwera."],
  ])("zlecenie odrzucone (%j): zdanie z fokusem, przycisk znów działa", async (blad, zdanie) => {
    zlecEksport.mockRejectedValue(new ApiError(blad));
    render(<KartaEksportu />);
    fireEvent.click(screen.getByRole("button", { name: "Przygotuj eksport" }));
    await uplyw(0);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(zdanie);
    expect(document.activeElement).toBe(alert);
    expect(screen.getByRole("button", { name: "Przygotuj eksport" })).not.toHaveAttribute("aria-disabled");
  });

  it("zlecenie bez odpowiedzi serwera: zdanie ogólne", async () => {
    zlecEksport.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<KartaEksportu />);
    fireEvent.click(screen.getByRole("button", { name: "Przygotuj eksport" }));
    await uplyw(0);

    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się zlecić eksportu danych.");
  });

  it("błąd sprawdzania stanu zatrzymuje sprawdzanie; „Sprawdź ponownie” je wznawia", async () => {
    pobierzStanEksportu.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(eksport("ready"));
    await zleconyEksport("queued");
    await uplyw(2000);

    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się sprawdzić statusu eksportu.");
    await uplyw(10_000);
    expect(pobierzStanEksportu).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Sprawdź ponownie" }));
    await uplyw(2000);
    expect(pobierzStanEksportu).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Pobierz plik" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Sprawdź ponownie" })).toBeNull();
  });

  it("odmowa 409 po powrocie na ekran (serwer ma już paczkę): zdanie serwera zamiast zmyślonego stanu", async () => {
    zlecEksport.mockRejectedValue(
      new ApiError({ status: 409, code: "export_in_progress", message: "Poprzedni eksport danych jest jeszcze przygotowywany." }),
    );
    render(<KartaEksportu />);
    fireEvent.click(screen.getByRole("button", { name: "Przygotuj eksport" }));
    await uplyw(0);

    expect(screen.getByRole("alert")).toHaveTextContent("Poprzedni eksport danych jest jeszcze przygotowywany.");
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("Eksport danych — dostępność", () => {
  it("brak naruszeń axe w stanach: nie rozpoczęty, przygotowywanie, gotowy, błąd", async () => {
    vi.useRealTimers();
    const kontrola = async (container: HTMLElement) =>
      (await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations;

    const poczatek = render(<KartaEksportu />);
    expect(await kontrola(poczatek.container)).toEqual([]);

    zlecEksport.mockResolvedValue(eksport("processing"));
    fireEvent.click(screen.getByRole("button", { name: "Przygotuj eksport" }));
    await screen.findByRole("status");
    expect(await kontrola(poczatek.container)).toEqual([]);
    poczatek.unmount();

    zlecEksport.mockResolvedValue(eksport("ready"));
    const gotowy = render(<KartaEksportu />);
    fireEvent.click(screen.getByRole("button", { name: "Przygotuj eksport" }));
    await screen.findByRole("button", { name: "Pobierz plik" });
    expect(await kontrola(gotowy.container)).toEqual([]);
    gotowy.unmount();

    zlecEksport.mockRejectedValue(new TypeError("x"));
    const blad = render(<KartaEksportu />);
    fireEvent.click(screen.getByRole("button", { name: "Przygotuj eksport" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(await kontrola(blad.container)).toEqual([]);
  });
});
