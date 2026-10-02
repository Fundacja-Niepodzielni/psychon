import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saPowodyPytania } from "@/design-system/szablony/NiezapisaneZmiany";
import { ApiError } from "@/lib/api/klient";
import { PROFIL } from "./atrapy";

/**
 * Ekran „Mój profil”: ładowanie · błąd · brak połączenia · brak dostępu · nie znaleziono ·
 * widok profilu (pola z etykietami, zgody, karta eksportu) · zapis (reguły serwera dla każdego
 * pola, zapisywanie, zapisano, błąd serwera) · ostrzeżenie o niezapisanych zmianach.
 * Eksport ma własne testy (`KartaEksportu.test.tsx`).
 */

const push = vi.fn();
const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push, replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const pobierzProfil = vi.fn();
const zapiszProfil = vi.fn();
vi.mock("../dane", () => ({
  pobierzProfil: (...argumenty: unknown[]) => pobierzProfil(...argumenty),
  zapiszProfil: (...argumenty: unknown[]) => zapiszProfil(...argumenty),
  zlecEksport: vi.fn(),
  pobierzStanEksportu: vi.fn(),
  pobierzPlikEksportu: vi.fn(),
}));

const { ProfilUczestnika } = await import("../ProfilUczestnika");

function blad(status: number, zmiany: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) {
  return new ApiError({ status, code: "x", message: "komunikat serwera", ...zmiany });
}

function przyciskiGlowne(container: HTMLElement | Element): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>("button")].filter((przycisk) =>
    przycisk.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)),
  );
}

function pole(etykieta: string): HTMLInputElement {
  return screen.getByLabelText(etykieta) as HTMLInputElement;
}

function wpisz(etykieta: string, wartosc: string) {
  fireEvent.change(pole(etykieta), { target: { value: wartosc } });
}

async function wczytany() {
  pobierzProfil.mockResolvedValue(PROFIL);
  const wynik = render(<ProfilUczestnika />);
  await screen.findByRole("heading", { level: 2, name: "Dane osobowe" });
  return wynik;
}

beforeEach(() => {
  push.mockReset();
  back.mockReset();
  pobierzProfil.mockReset();
  zapiszProfil.mockReset();
});

afterEach(cleanup);

describe("Mój profil — stany bez danych", () => {
  it("ładowanie: nagłówek strony, podpis „Wczytywanie profilu…”, szkielet, bez formularza i bez przycisku głównego", () => {
    pobierzProfil.mockReturnValue(new Promise(() => {}));
    const { container } = render(<ProfilUczestnika />);

    expect(screen.getByRole("heading", { level: 1, name: "Mój profil" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Wczytywanie profilu…");
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(container.querySelectorAll("main")).toHaveLength(1);
  });

  it("błąd serwera: komunikat i „Spróbuj ponownie”, które wczytuje profil jeszcze raz", async () => {
    pobierzProfil.mockRejectedValueOnce(blad(500)).mockResolvedValueOnce(PROFIL);
    const { container } = render(<ProfilUczestnika />);

    expect(await screen.findByRole("heading", { level: 2, name: "Nie udało się wczytać profilu" })).toBeInTheDocument();
    expect(screen.getByText("Coś poszło nie tak po naszej stronie. Spróbuj ponownie za chwilę.")).toBeInTheDocument();
    expect(przyciskiGlowne(container)).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Dane osobowe" })).toBeInTheDocument();
    expect(pobierzProfil).toHaveBeenCalledTimes(2);
  });

  it("brak połączenia: osobny komunikat z przyciskiem ponowienia", async () => {
    pobierzProfil.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<ProfilUczestnika />);

    expect(await screen.findByRole("heading", { level: 2, name: "Brak połączenia" })).toBeInTheDocument();
    expect(
      screen.getByText("Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();
  });

  it.each([401, 403])("HTTP %i: wspólny ekran odmowy z jednym przyciskiem do pulpitu", async (status) => {
    pobierzProfil.mockRejectedValue(blad(status));
    render(<ProfilUczestnika />);

    expect(await screen.findByRole("heading", { level: 2, name: "Nie masz dostępu do tego ekranu" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Wróć do pulpitu" }));
    expect(push).toHaveBeenCalledWith("/panel/pulpit");
  });

  it("HTTP 404: „Nie znaleziono profilu” z przyciskiem „Odśwież”", async () => {
    pobierzProfil.mockRejectedValueOnce(blad(404)).mockResolvedValueOnce(PROFIL);
    render(<ProfilUczestnika />);

    expect(await screen.findByRole("heading", { level: 2, name: "Nie znaleziono profilu" })).toBeInTheDocument();
    expect(
      screen.getByText("Nie mamy dla Ciebie danych profilu do wyświetlenia. Odśwież stronę albo wróć za chwilę."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Odśwież" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Dane osobowe" })).toBeInTheDocument();
  });
});

describe("Mój profil — widok profilu", () => {
  it("nagłówki, widoczne etykiety wszystkich pól i wartości z profilu", async () => {
    await wczytany();

    expect(screen.getByRole("heading", { level: 1, name: "Mój profil" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Eksport danych (RODO)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Zgody" })).toBeInTheDocument();

    expect(pole("Imię").value).toBe("Marta");
    expect(pole("Nazwisko").value).toBe("Demo");
    expect(pole("Telefon").value).toBe("+48 600 100 200");
    expect(pole("PESEL").value).toBe("90010112345");
    expect(pole("Ulica i numer").value).toBe("Testowa 1");
    expect(pole("Miejscowość").value).toBe("Warszawa");
    expect(pole("Kod pocztowy").value).toBe("00-001");
    // Każda etykieta jest widoczna na ekranie (element <label>), a nie tylko w nazwie dostępnej.
    for (const etykieta of ["Imię", "Nazwisko", "Adres e-mail", "Telefon", "PESEL", "Ulica i numer", "Miejscowość", "Kod pocztowy"]) {
      expect(screen.getByText(etykieta, { selector: "label" })).toBeVisible();
    }
    expect(screen.getByRole("group", { name: "Adres" })).toContainElement(pole("Ulica i numer"));
  });

  it("adres e-mail: tylko do odczytu, z powodem; PESEL: podpowiedź, po co jest potrzebny", async () => {
    await wczytany();

    const email = pole("Adres e-mail");
    expect(email.value).toBe("marta@demo.pl");
    expect(email).toBeDisabled();
    expect(email).toHaveAccessibleDescription("Adres e-mail zmienia administracja — napisz do opiekuna projektu.");
    expect(pole("PESEL")).toHaveAccessibleDescription(
      "Potrzebny do umowy wolontariackiej. Widoczny tylko dla Ciebie i administracji.",
    );
  });

  it("klawiatura numeryczna w polach PESEL i kod pocztowy, podpowiedzi autouzupełniania w pozostałych", async () => {
    await wczytany();

    expect(pole("PESEL")).toHaveAttribute("inputmode", "numeric");
    expect(pole("Kod pocztowy")).toHaveAttribute("inputmode", "numeric");
    expect(pole("Imię")).toHaveAttribute("autocomplete", "given-name");
    expect(pole("Nazwisko")).toHaveAttribute("autocomplete", "family-name");
    expect(pole("Telefon")).toHaveAttribute("autocomplete", "tel");
  });

  it("w każdej karcie z działaniem jest dokładnie jeden przycisk główny: „Zapisz zmiany” i „Przygotuj eksport”", async () => {
    const { container } = await wczytany();

    const formularz = screen.getByRole("heading", { level: 2, name: "Dane osobowe" }).closest("section") as HTMLElement;
    const eksport = screen.getByRole("heading", { level: 2, name: "Eksport danych (RODO)" }).closest("section") as HTMLElement;
    expect(przyciskiGlowne(formularz).map((p) => p.textContent)).toEqual(["Zapisz zmiany"]);
    expect(przyciskiGlowne(eksport).map((p) => p.textContent)).toEqual(["Przygotuj eksport"]);
    expect(przyciskiGlowne(container)).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Zapisz zmiany" })).not.toHaveAttribute("aria-disabled");
  });

  it("zgody: nazwa po polsku, stan słowem, wersja i data bez formatu technicznego; nieznana wersja jako myślnik", async () => {
    await wczytany();

    const zgody = screen.getByRole("heading", { level: 2, name: "Zgody" }).closest("section") as HTMLElement;
    expect(within(zgody).getByText("Regulamin platformy")).toBeInTheDocument();
    expect(within(zgody).getByText("udzielona")).toBeInTheDocument();
    expect(within(zgody).getByText("Wersja v1 · z dnia 1 września 2026")).toBeInTheDocument();
    expect(within(zgody).getByText("Zgoda marketingowa")).toBeInTheDocument();
    expect(within(zgody).getByText("wycofana")).toBeInTheDocument();
    expect(within(zgody).getByText("Wersja — · z dnia 2 września 2026")).toBeInTheDocument();
    expect(zgody.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}|T\d{2}:/);
  });

  it("brak zgód: „Brak zapisanych zgód.”; nieznany typ zgody pokazuje swój kod", async () => {
    pobierzProfil.mockResolvedValue({ ...PROFIL, consents: [] });
    const { unmount } = render(<ProfilUczestnika />);
    expect(await screen.findByText("Brak zapisanych zgód.")).toBeInTheDocument();
    unmount();

    pobierzProfil.mockResolvedValue({ ...PROFIL, consents: [{ ...PROFIL.consents[0], type: "nowa_zgoda" }] });
    render(<ProfilUczestnika />);
    expect(await screen.findByText("nowa_zgoda")).toBeInTheDocument();
  });

  it("brak naruszeń dostępności w widoku profilu i w stanie błędu odczytu", async () => {
    const { container, unmount } = await wczytany();
    const kontrola = async (wezel: Element) =>
      (await axe.run(wezel, { rules: { "color-contrast": { enabled: false } } })).violations;
    expect(await kontrola(container)).toEqual([]);
    unmount();

    pobierzProfil.mockRejectedValue(blad(500));
    const bledny = render(<ProfilUczestnika />);
    await screen.findByRole("heading", { level: 2, name: "Nie udało się wczytać profilu" });
    expect(await kontrola(bledny.container)).toEqual([]);
  });
});

describe("Mój profil — zapis", () => {
  it("ciało PATCH jak na starej stronie: wpisane wartości, puste pola jako null, bez adresu e-mail", async () => {
    await wczytany();
    zapiszProfil.mockResolvedValue(PROFIL);
    wpisz("Telefon", "");
    wpisz("PESEL", "");
    wpisz("Ulica i numer", "");
    wpisz("Imię", "Marta Anna");

    fireEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
    await waitFor(() => expect(zapiszProfil).toHaveBeenCalledTimes(1));

    expect(zapiszProfil).toHaveBeenCalledWith({
      first_name: "Marta Anna",
      last_name: "Demo",
      phone: null,
      pesel: null,
      address: { street: null, city: "Warszawa", zip: "00-001" },
    });
    expect(Object.keys(zapiszProfil.mock.calls[0][0])).not.toContain("email");
  });

  it("zapisywanie: przycisk mówi „Zapisywanie…”, jest niedostępny i nie wysyła drugiego żądania", async () => {
    await wczytany();
    let rozwiaz: (wartosc: unknown) => void = () => {};
    zapiszProfil.mockReturnValue(new Promise((resolve) => (rozwiaz = resolve)));

    fireEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
    const przycisk = await screen.findByRole("button", { name: "Zapisywanie…" });
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(przycisk);
    fireEvent.submit(przycisk.closest("form") as HTMLFormElement);
    expect(zapiszProfil).toHaveBeenCalledTimes(1);

    await act(async () => rozwiaz(PROFIL));
    expect(screen.getByRole("button", { name: "Zapisz zmiany" })).toBeInTheDocument();
  });

  it("zapisano: potwierdzenie „Zapisano zmiany.” z fokusem, formularz wypełniony odpowiedzią serwera", async () => {
    await wczytany();
    zapiszProfil.mockResolvedValue({ ...PROFIL, first_name: "Marta Anna" });
    wpisz("Imię", "  Marta Anna ");

    fireEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
    const potwierdzenie = await screen.findByText("Zapisano zmiany.");

    const pasek = potwierdzenie.closest('[role="status"]') as HTMLElement;
    expect(document.activeElement).toBe(pasek);
    expect(pole("Imię").value).toBe("Marta Anna");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("każda zmiana pola zdejmuje potwierdzenie zapisu", async () => {
    await wczytany();
    zapiszProfil.mockResolvedValue(PROFIL);
    fireEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
    await screen.findByText("Zapisano zmiany.");

    wpisz("Telefon", "600 200 300");
    expect(screen.queryByText("Zapisano zmiany.")).toBeNull();
  });

  it("zamknięcie potwierdzenia przy fokusie w środku oddaje fokus przyciskowi zapisu", async () => {
    await wczytany();
    zapiszProfil.mockResolvedValue(PROFIL);
    fireEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
    await screen.findByText("Zapisano zmiany.");

    fireEvent.click(screen.getByRole("button", { name: "Zamknij powiadomienie" }));
    expect(screen.queryByText("Zapisano zmiany.")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Zapisz zmiany" }));
  });

  describe.each([
    ["first_name", "Imię", "Imię jest za długie (maksymalnie 255 znaków)."],
    ["last_name", "Nazwisko", "Nazwisko jest za długie (maksymalnie 255 znaków)."],
    ["phone", "Telefon", "Numer telefonu jest za długi."],
    ["pesel", "PESEL", "Nieprawidłowy numer PESEL."],
    ["address.street", "Ulica i numer", "Ulica jest za długa (maksymalnie 255 znaków)."],
    ["address.city", "Miejscowość", "Miasto jest za długie (maksymalnie 255 znaków)."],
    ["address.zip", "Kod pocztowy", "Kod pocztowy jest za długi."],
  ])("reguła serwera dla pola %s", (klucz, etykieta, komunikat) => {
    it("komunikat pod polem, pole oznaczone jako niepoprawne, podsumowanie z odnośnikiem i fokus na podsumowaniu", async () => {
      await wczytany();
      zapiszProfil.mockRejectedValue(
        blad(422, { code: "validation_failed", message: "Popraw zaznaczone pola.", errors: { [klucz]: [komunikat, "drugi komunikat"] } }),
      );

      fireEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
      const podsumowanie = await screen.findByRole("heading", { level: 3, name: "Popraw zaznaczone pola" });
      const alert = podsumowanie.closest('[role="alert"]') as HTMLElement;

      expect(document.activeElement).toBe(alert);
      expect(within(alert).getByRole("link", { name: etykieta })).toHaveAttribute("href", `#${pole(etykieta).id}`);
      expect(pole(etykieta)).toHaveAttribute("aria-invalid", "true");
      expect(pole(etykieta)).toHaveAccessibleDescription(expect.stringContaining(komunikat));
      expect(screen.getByText(komunikat)).toBeInTheDocument();
      expect(screen.queryByText("drugi komunikat")).toBeNull();
      expect(screen.queryByText("Zapisano zmiany.")).toBeNull();
      // Pozostałe pola nie są oznaczone.
      expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(1);
    });
  });

  it("kilka błędów naraz: wszystkie pola oznaczone, podsumowanie wymienia je w kolejności z ekranu", async () => {
    await wczytany();
    zapiszProfil.mockRejectedValue(
      blad(422, { errors: { "address.zip": ["Kod pocztowy jest za długi."], pesel: ["Nieprawidłowy numer PESEL."] } }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
    const alert = (await screen.findByRole("heading", { level: 3, name: "Popraw zaznaczone pola" })).closest('[role="alert"]') as HTMLElement;

    expect(within(alert).getAllByRole("link").map((link) => link.textContent)).toEqual(["PESEL", "Kod pocztowy"]);
    expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(2);
  });

  it("po poprawieniu i ponownym zapisie błędy znikają, a potwierdzenie się pojawia", async () => {
    await wczytany();
    zapiszProfil.mockRejectedValueOnce(blad(422, { errors: { pesel: ["Nieprawidłowy numer PESEL."] } })).mockResolvedValueOnce(PROFIL);

    fireEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
    await screen.findByText("Nieprawidłowy numer PESEL.");
    fireEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
    await screen.findByText("Zapisano zmiany.");

    expect(screen.queryByText("Nieprawidłowy numer PESEL.")).toBeNull();
    expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0);
  });

  it("błąd serwera (inny niż walidacja): zdanie serwera w komunikacie z fokusem; pola bez oznaczeń", async () => {
    await wczytany();
    zapiszProfil.mockRejectedValue(blad(500, { message: "Awaria serwera." }));

    fireEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
    const alert = (await screen.findByRole("heading", { level: 3, name: "Nie udało się zapisać zmian" })).closest('[role="alert"]') as HTMLElement;

    expect(alert).toHaveTextContent("Awaria serwera.");
    expect(document.activeElement).toBe(alert);
    expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Zapisz zmiany" })).not.toHaveAttribute("aria-disabled");
  });

  it("brak połączenia przy zapisie: zdanie ogólne", async () => {
    await wczytany();
    zapiszProfil.mockRejectedValue(new TypeError("Failed to fetch"));

    fireEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
    const alert = (await screen.findByRole("heading", { level: 3, name: "Nie udało się zapisać zmian" })).closest('[role="alert"]') as HTMLElement;
    expect(alert).toHaveTextContent("Nie udało się zapisać zmian. Spróbuj ponownie.");
  });

  it("brak naruszeń dostępności z błędami walidacji", async () => {
    const { container } = await wczytany();
    zapiszProfil.mockRejectedValue(blad(422, { errors: { pesel: ["Nieprawidłowy numer PESEL."] } }));
    fireEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
    await screen.findByText("Nieprawidłowy numer PESEL.");

    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });
});

describe("Mój profil — ostrzeżenie o niezapisanych zmianach", () => {
  it("zgłasza się po zmianie pola, wycofuje po cofnięciu zmiany i po zapisie", async () => {
    await wczytany();
    expect(saPowodyPytania()).toBe(false);

    wpisz("Telefon", "600 200 300");
    expect(saPowodyPytania()).toBe(true);

    wpisz("Telefon", PROFIL.phone as string);
    expect(saPowodyPytania()).toBe(false);

    wpisz("Telefon", "600 200 300");
    zapiszProfil.mockResolvedValue({ ...PROFIL, phone: "600 200 300" });
    fireEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
    await screen.findByText("Zapisano zmiany.");
    expect(saPowodyPytania()).toBe(false);
  });

  it("zmiana, której zapis się nie udał, nadal jest niezapisana", async () => {
    await wczytany();
    zapiszProfil.mockRejectedValue(blad(500));
    wpisz("Telefon", "600 200 300");
    fireEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
    await screen.findByRole("heading", { level: 3, name: "Nie udało się zapisać zmian" });
    expect(saPowodyPytania()).toBe(true);
  });
});
