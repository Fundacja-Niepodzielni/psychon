import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AdminUserCard } from "@/lib/api/h18";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";

/**
 * Stany ekranu „Przedłużenie dostępu” w obszarach szablonu formularza,
 * zapis przedłużenia (miesiące albo data) i błędy zapisu. Atrapa siedzi na
 * kliencie HTTP (`lib/api/klient`), więc adresy, metody i ciała żądań są
 * mierzone na prawdziwych funkcjach ekranu.
 */

const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const api = vi.fn();
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, api: (...a: unknown[]) => api(...a) };
});

const { PrzedluzenieDostepu } = await import("../PrzedluzenieDostepu");
const { ApiError } = await import("@/lib/api/klient");

const KARTA: AdminUserCard = {
  profile: {
    id: 17,
    first_name: "Marta",
    last_name: "Testowa",
    email: "marta@example.test",
    role: "volunteer",
    phone: null,
    pesel: null,
    address: { street: null, city: null, zip: null },
    access_expires_at: "2026-12-31T00:00:00Z",
    program_completed_at: null,
    product_group: "psychon",
  },
  progress: {
    courses_done: 1,
    courses_total: 10,
    hours_accepted: "0",
    supervision_present: 0,
    workshop_done: false,
  },
  documents: [],
  recent_notifications: [],
  audit_entries: [],
};

function blad(status: number, code: string, errors?: Record<string, string[]>) {
  return new ApiError({ status, code, message: "Komunikat serwera.", errors });
}

interface Ustawienia {
  karta?: AdminUserCard;
  post?: (cialo: unknown) => unknown;
}

function ustawSerwer({ karta = KARTA, post }: Ustawienia = {}) {
  api.mockImplementation(async (sciezka: string, opcje?: { method?: string; body?: unknown }) => {
    if (opcje?.method === "POST") {
      if (post) return post(opcje.body);
      return {
        id: 17,
        first_name: "Marta",
        last_name: "Testowa",
        email: "marta@example.test",
        role: "volunteer",
        roles: ["volunteer"],
        access_expires_at: "2027-07-01T00:00:00Z",
        program_completed_at: null,
      };
    }
    return karta;
  });
}

async function renderGotowy(id = "17") {
  ustawSerwer();
  const wynik = render(<PrzedluzenieDostepu idOsoby={id} />);
  await screen.findByRole("button", { name: "Przedłuż dostęp" });
  return wynik;
}

function przyciskiGlowne(container: HTMLElement) {
  return Array.from(container.ownerDocument.querySelectorAll("button")).filter((b) =>
    b.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)),
  );
}

function wywolaniaZapisu() {
  return api.mock.calls.filter((wywolanie) => wywolanie[1]?.method === "POST");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-30T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("przedłużenie dostępu — stany w szablonie formularza, jeden main", () => {
  function sprawdzSzablon(container: HTMLElement, znacznik: HTMLElement) {
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.getAttribute("data-style-id")).toBe("szablon-formularz");
    expect(container.querySelector("main")!.contains(znacznik)).toBe(true);
  }

  it("dane: formularz z akcją główną w obszarze treści", async () => {
    const { container } = await renderGotowy();
    sprawdzSzablon(container, screen.getByRole("button", { name: "Przedłuż dostęp" }));
    expect(screen.getByRole("heading", { level: 1, name: "Przedłużenie dostępu" })).toBeTruthy();
    expect(screen.getByText("Marta Testowa, Wolontariusz")).toBeTruthy();
  });

  it("ładowanie: szkielet w obszarze treści", () => {
    api.mockReturnValue(new Promise(() => {}));
    const { container } = render(<PrzedluzenieDostepu idOsoby="17" />);
    sprawdzSzablon(container, container.querySelector<HTMLElement>("[aria-busy='true']")!);
  });

  it("nieznana osoba (404): stan pusty ze zdaniem i jednym wyjściem", async () => {
    api.mockRejectedValue(blad(404, "not_found"));
    const { container } = render(<PrzedluzenieDostepu idOsoby="999" />);
    sprawdzSzablon(container, await screen.findByRole("heading", { name: "Nie znaleziono osoby" }));
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Wróć" }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("identyfikator inny niż liczba: to samo 404, bez żadnego żądania", () => {
    const { container } = render(<PrzedluzenieDostepu idOsoby="abc" />);
    sprawdzSzablon(container, screen.getByRole("heading", { name: "Nie znaleziono osoby" }));
    expect(api).not.toHaveBeenCalled();
  });

  it.each([401, 403])("odmowa (%i): wariant odmowy z nazwą roli, zero danych w DOM", async (status) => {
    api.mockRejectedValue(blad(status, status === 401 ? "unauthenticated" : "forbidden"));
    const { container } = render(<PrzedluzenieDostepu idOsoby="17" />);
    sprawdzSzablon(container, await screen.findByText(/administracji/, { selector: "p" }));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(container.textContent).not.toContain("Marta");
    expect(container.textContent).not.toContain("Testowa");
  });

  it("błąd sieci: komunikat i „Spróbuj ponownie” wczytuje osobę od nowa", async () => {
    api.mockRejectedValue(new TypeError("Failed to fetch"));
    const { container } = render(<PrzedluzenieDostepu idOsoby="17" />);
    sprawdzSzablon(container, await screen.findByRole("alert"));
    ustawSerwer();
    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    await screen.findByRole("button", { name: "Przedłuż dostęp" });
    expect(container.querySelectorAll("main")).toHaveLength(1);
  });
});

describe("przedłużenie dostępu — odczyt i daty obok siebie", () => {
  it("odczyt biegnie trasą karty osoby, bez ciała", async () => {
    await renderGotowy();
    expect(api).toHaveBeenCalledTimes(1);
    expect(api.mock.calls[0][0]).toBe("/admin/users/17");
    expect(api.mock.calls[0][1]).toBeUndefined();
  });

  it("obecna i nowa data stoją obok siebie; 6 miesięcy dolicza się do obecnej daty", async () => {
    await renderGotowy();
    expect(screen.getByText("Obecnie dostęp do materiałów do")).toBeTruthy();
    expect(screen.getByText("31 grudnia 2026")).toBeTruthy();
    expect(screen.getByText("Po przedłużeniu do")).toBeTruthy();
    expect(screen.getByText("1 lipca 2027")).toBeTruthy();
  });

  it("dostęp już wygasły: miesiące liczą się od dziś", async () => {
    ustawSerwer({ karta: { ...KARTA, profile: { ...KARTA.profile, access_expires_at: "2026-01-15T00:00:00Z" } } });
    render(<PrzedluzenieDostepu idOsoby="17" />);
    await screen.findByRole("button", { name: "Przedłuż dostęp" });
    expect(screen.getByText("30 marca 2027")).toBeTruthy();
  });

  it("brak daty: zdanie zamiast kreski, miesiące liczą się od dziś", async () => {
    ustawSerwer({ karta: { ...KARTA, profile: { ...KARTA.profile, access_expires_at: null } } });
    render(<PrzedluzenieDostepu idOsoby="17" />);
    await screen.findByRole("button", { name: "Przedłuż dostęp" });
    expect(screen.getByText("brak ustawionej daty")).toBeTruthy();
    expect(screen.getByText("30 marca 2027")).toBeTruthy();
  });

  it("jeden przycisk główny na ekranie: „Przedłuż dostęp”", async () => {
    const { container } = await renderGotowy();
    const glowne = przyciskiGlowne(container);
    expect(glowne).toHaveLength(1);
    expect(glowne[0].textContent).toBe("Przedłuż dostęp");
  });
});

describe("przedłużenie dostępu — zapis", () => {
  async function wybierzTryb(nazwa: string) {
    const uzytkownik = userEvent.setup();
    await uzytkownik.click(screen.getByRole("combobox", { name: "Jak przedłużyć" }));
    await uzytkownik.click(screen.getByRole("option", { name: nazwa }));
  }

  it("miesiące: POST z samym polem months, potem powiadomienie i nowa obecna data", async () => {
    await renderGotowy();
    fireEvent.change(screen.getByLabelText(/Liczba miesięcy/), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Przedłuż dostęp" }));

    const powiadomienie = await screen.findByRole("status");
    expect(powiadomienie.textContent).toContain("przedłużony do 1 lipca 2027");
    expect(powiadomienie.textContent).toContain("dzienniku działań");

    expect(wywolaniaZapisu()).toHaveLength(1);
    const zapis = wywolaniaZapisu()[0];
    expect(zapis[0]).toBe("/admin/users/17/extend-access");
    expect(zapis[1]).toEqual({ method: "POST", body: { months: 12 } });
    // Obecna data w bloku porównania pochodzi teraz z odpowiedzi serwera.
    expect(screen.getAllByText("1 lipca 2027").length).toBeGreaterThan(0);
  });

  it("data: POST z samym polem until", async () => {
    await renderGotowy();
    await wybierzTryb("Do wybranej daty");
    fireEvent.change(screen.getByLabelText(/Data końca dostępu/), { target: { value: "2027-03-31" } });
    expect(screen.getByText("31 marca 2027")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Przedłuż dostęp" }));
    await screen.findByRole("status");
    expect(wywolaniaZapisu()[0][1]).toEqual({ method: "POST", body: { until: "2027-03-31" } });
  });

  it("data wcześniejsza niż obecna: podpowiedź, że dostęp zostanie skrócony", async () => {
    await renderGotowy();
    await wybierzTryb("Do wybranej daty");
    fireEvent.change(screen.getByLabelText(/Data końca dostępu/), { target: { value: "2026-11-01" } });
    expect(screen.getByText(/dostęp zostanie skrócony/)).toBeTruthy();
  });

  it.each([
    ["", "Podaj liczbę miesięcy."],
    ["0", "Liczba miesięcy musi być całkowita, od 1 do 60."],
    ["61", "Liczba miesięcy musi być całkowita, od 1 do 60."],
    ["2.5", "Liczba miesięcy musi być całkowita, od 1 do 60."],
  ])("miesiące „%s”: błąd przy polu, żadnego żądania zapisu", async (wpis, komunikat) => {
    await renderGotowy();
    fireEvent.change(screen.getByLabelText(/Liczba miesięcy/), { target: { value: wpis } });
    fireEvent.click(screen.getByRole("button", { name: "Przedłuż dostęp" }));
    expect((await screen.findAllByText(komunikat)).length).toBeGreaterThan(0);
    expect(wywolaniaZapisu()).toHaveLength(0);
  });

  it("brak daty w trybie daty: błąd przy polu, żadnego żądania zapisu", async () => {
    await renderGotowy();
    await wybierzTryb("Do wybranej daty");
    fireEvent.click(screen.getByRole("button", { name: "Przedłuż dostęp" }));
    expect((await screen.findAllByText("Wybierz datę.")).length).toBeGreaterThan(0);
    expect(wywolaniaZapisu()).toHaveLength(0);
  });

  it("422 z polem months: komunikat serwera przy polu, wpisana liczba zostaje", async () => {
    ustawSerwer({
      post: () => {
        throw blad(422, "validation_failed", { months: ["Pole months nie może być większe niż 60."] });
      },
    });
    render(<PrzedluzenieDostepu idOsoby="17" />);
    await screen.findByRole("button", { name: "Przedłuż dostęp" });
    fireEvent.click(screen.getByRole("button", { name: "Przedłuż dostęp" }));
    expect((await screen.findAllByText("Pole months nie może być większe niż 60.")).length).toBeGreaterThan(0);
    expect((screen.getByLabelText(/Liczba miesięcy/) as HTMLInputElement).value).toBe("6");
  });

  it("422 z polem until: komunikat serwera przy polu daty", async () => {
    ustawSerwer({
      post: () => {
        throw blad(422, "validation_failed", { until: ["Pole until nie jest prawidłową datą."] });
      },
    });
    render(<PrzedluzenieDostepu idOsoby="17" />);
    await screen.findByRole("button", { name: "Przedłuż dostęp" });
    await wybierzTryb("Do wybranej daty");
    fireEvent.change(screen.getByLabelText(/Data końca dostępu/), { target: { value: "2027-03-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Przedłuż dostęp" }));
    expect((await screen.findAllByText("Pole until nie jest prawidłową datą.")).length).toBeGreaterThan(0);
  });

  it.each([
    [403, "forbidden", "dostępne tylko dla administracji"],
    [404, "not_found", "Nie znaleziono osoby"],
  ])("%i przy zapisie: komunikat nad formularzem, dostęp bez zmian", async (status, code, fragment) => {
    ustawSerwer({
      post: () => {
        throw blad(status, code);
      },
    });
    render(<PrzedluzenieDostepu idOsoby="17" />);
    await screen.findByRole("button", { name: "Przedłuż dostęp" });
    fireEvent.click(screen.getByRole("button", { name: "Przedłuż dostęp" }));
    const komunikat = await screen.findByRole("alert");
    expect(komunikat.textContent).toContain(fragment);
    expect(screen.getByText("31 grudnia 2026")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("błąd sieci przy zapisie: komunikat, pola zostają, można zapisać ponownie", async () => {
    let proby = 0;
    ustawSerwer({
      post: () => {
        proby += 1;
        if (proby === 1) throw new TypeError("Failed to fetch");
        return { id: 17, access_expires_at: "2027-07-01T00:00:00Z" };
      },
    });
    render(<PrzedluzenieDostepu idOsoby="17" />);
    await screen.findByRole("button", { name: "Przedłuż dostęp" });
    fireEvent.change(screen.getByLabelText(/Liczba miesięcy/), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Przedłuż dostęp" }));
    const komunikat = await screen.findByRole("alert");
    expect(komunikat.textContent).toContain("Dostęp nie został zmieniony");
    expect((screen.getByLabelText(/Liczba miesięcy/) as HTMLInputElement).value).toBe("3");
    fireEvent.click(screen.getByRole("button", { name: "Przedłuż dostęp" }));
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(proby).toBe(2);
  });

  it("ekran niczego nie wysyła do dziennika działań: jedyne żądania to karta osoby i przedłużenie", async () => {
    await renderGotowy();
    fireEvent.click(screen.getByRole("button", { name: "Przedłuż dostęp" }));
    await screen.findByRole("status");
    expect(api.mock.calls.map((wywolanie) => wywolanie[0])).toEqual([
      "/admin/users/17",
      "/admin/users/17/extend-access",
    ]);
  });

  it("„Anuluj” wraca bez żadnego zapisu", async () => {
    await renderGotowy();
    const formularz = screen.getByRole("form", { name: "Przedłuż dostęp" });
    fireEvent.click(within(formularz).getByRole("button", { name: "Anuluj" }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(wywolaniaZapisu()).toHaveLength(0);
  });
});
