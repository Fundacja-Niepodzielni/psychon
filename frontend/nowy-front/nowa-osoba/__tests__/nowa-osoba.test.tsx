import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";

/**
 * Ekran „Nowa osoba” (`/nowy-front/admin/osoby/nowa`): każdy stan ma jeden
 * `main` szablonu formularza z jego znacznikiem stylu, a zapis i odpowiedzi
 * 201/401/403/409/422/sieć są sprawdzane po ciele i ścieżce żądania wysłanego
 * do klienta API.
 */

const ZDANIE_O_KONTACH = "Rolę zmienia się w Kontach Niepodzielni.";

const api = vi.fn();
const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, api: (...args: unknown[]) => api(...args) };
});

const { ApiError } = await import("@/lib/api/klient");
const { NowaOsoba } = await import("../NowaOsoba");
const { SKUTEK_ROLI } = await import("../dane");

const PROFIL_OPIEKUNA = { id: 3, role: "project_manager", roles: ["project_manager"] };
const PROFIL_SUPER_ADMINA = { id: 1, role: "super_admin", roles: ["super_admin"] };
const PROFIL_PROWADZACEGO = { id: 5, role: "instructor", roles: ["instructor"] };

const KARTA_NOWEJ_OSOBY = {
  profile: { id: 44, first_name: "Marta", last_name: "Demo", email: "marta@demo.pl", role: "volunteer" },
};

function bladApi(status: number, code: string, message: string, reszta: Record<string, unknown> = {}) {
  return new ApiError({ status, code, message, ...reszta });
}

/** Odpowiedź `GET /me` plus zadany wynik dla pozostałych wywołań. */
function ustawApi(profil: unknown, reszta?: (sciezka: string, opcje?: { method?: string; body?: unknown }) => unknown) {
  api.mockImplementation(async (sciezka: string, opcje?: { method?: string; body?: unknown }) => {
    if (sciezka === "/me") {
      if (profil instanceof Error) throw profil;
      return profil;
    }
    if (!reszta) throw new Error(`nieoczekiwane wywołanie ${sciezka}`);
    const wynik = reszta(sciezka, opcje);
    if (wynik instanceof Error) throw wynik;
    return wynik;
  });
}

function wywolaniaZapisu() {
  return api.mock.calls.filter(([sciezka]) => sciezka !== "/me");
}

function przyciskiGlowne() {
  return Array.from(document.querySelectorAll("button")).filter((przycisk) =>
    przycisk.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)),
  );
}

function znacznikStylu(kontener: HTMLElement) {
  return kontener.querySelector("main")?.dataset.styleId;
}

async function wypelnij(uzytkownik: ReturnType<typeof userEvent.setup>, rola = "Wolontariusz") {
  await uzytkownik.type(await screen.findByLabelText(/^Imię/), "Marta");
  await uzytkownik.type(screen.getByLabelText(/^Nazwisko/), "Demo");
  await uzytkownik.type(screen.getByLabelText(/^Adres e-mail/), "marta@demo.pl");
  await uzytkownik.click(screen.getByRole("combobox", { name: /^Rola/ }));
  await uzytkownik.click(screen.getByRole("option", { name: rola }));
}

beforeEach(() => {
  api.mockReset();
  back.mockReset();
});

/**
 * Limit czasu przypadków, które pod obciążeniem hosta (równoległe procesy, zimny pierwszy import)
 * trwają wielokrotnie dłużej niż domyślne 5000 ms. Wartość to większa z: trzykrotność maksimum
 * z 10 pomiarów na cichym hoście albo 15 000 ms; przy każdym przypadku stoi jego zmierzony czas.
 */
const LIMIT_PRZYPADKU_MS = 15_000;

describe("Nowa osoba — stany ekranu na szablonie formularza", () => {
  it("ładowanie: szkielet, jeden main, znacznik szablonu, bez formularza", () => {
    api.mockImplementation(() => new Promise(() => {}));
    const { container } = render(<NowaOsoba />);
    expect(() => jedenMain(container)).not.toThrow();
    expect(znacznikStylu(container)).toBe("szablon-formularz");
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.queryByLabelText(/^Imię/)).toBeNull();
  });

  it("dane: formularz z czterema polami, jeden main, znacznik szablonu, jeden przycisk główny „Utwórz konto”", async () => {
    ustawApi(PROFIL_OPIEKUNA);
    const { container } = render(<NowaOsoba />);
    await screen.findByLabelText(/^Imię/);
    expect(() => jedenMain(container)).not.toThrow();
    expect(znacznikStylu(container)).toBe("szablon-formularz");
    expect(screen.getByLabelText(/^Nazwisko/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Adres e-mail/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /^Rola/ })).toBeInTheDocument();
    const glowne = przyciskiGlowne();
    expect(glowne).toHaveLength(1);
    expect(glowne[0]).toHaveTextContent("Utwórz konto");
    expect(screen.getByRole("button", { name: "Wróć do listy" })).toBeInTheDocument();
  });

  it("brak uprawnień (rola bez dostępu do administracji): odmowa z nazwą roli, zero pól formularza", async () => {
    ustawApi(PROFIL_PROWADZACEGO);
    const { container } = render(<NowaOsoba />);
    await screen.findByText(/administracji/);
    expect(() => jedenMain(container)).not.toThrow();
    expect(znacznikStylu(container)).toBe("szablon-formularz");
    expect(screen.queryByLabelText(/^Imię/)).toBeNull();
    expect(container.querySelectorAll("input, textarea")).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/Brak dostępu|Nie masz uprawnień/);
    expect(wywolaniaZapisu()).toHaveLength(0);
  });

  it.each([403, 401])("odpowiedź %i na odczyt ról: ta sama odmowa, zero pól", async (status) => {
    ustawApi(bladApi(status, status === 401 ? "unauthenticated" : "forbidden", "Brak."));
    const { container } = render(<NowaOsoba />);
    await screen.findByText(/administracji/);
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelectorAll("input, textarea")).toHaveLength(0);
  });

  it("błąd sieci przy odczycie ról: komunikat i „Spróbuj ponownie”, które wczytuje ekran od nowa", async () => {
    const uzytkownik = userEvent.setup();
    ustawApi(new Error("sieć"));
    const { container } = render(<NowaOsoba />);
    const komunikat = await screen.findByRole("alert");
    expect(komunikat).toHaveTextContent("Nie udało się wczytać ekranu");
    expect(() => jedenMain(container)).not.toThrow();
    expect(znacznikStylu(container)).toBe("szablon-formularz");
    expect(screen.queryByLabelText(/^Imię/)).toBeNull();

    ustawApi(PROFIL_OPIEKUNA);
    await uzytkownik.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(await screen.findByLabelText(/^Imię/)).toBeInTheDocument();
  });
});

describe("Nowa osoba — role do wyboru i skutek nadania roli", () => {
  it.each([
    ["Opiekun Projektu", PROFIL_OPIEKUNA],
    ["Super Admin", PROFIL_SUPER_ADMINA],
  ])("%s widzi tylko role nadawane w PsychON: bez Opiekuna Projektu i bez Super Admina", async (_nazwa, profil) => {
    const uzytkownik = userEvent.setup();
    ustawApi(profil);
    render(<NowaOsoba />);
    await uzytkownik.click(await screen.findByRole("combobox", { name: /^Rola/ }));
    const opcje = screen.getAllByRole("option").map((opcja) => opcja.textContent);
    expect(opcje).toEqual(["Wybierz rolę", "Wolontariusz", "Student", "Psycholog prowadzący"]);
    expect(screen.queryByRole("option", { name: "Super Admin" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Opiekun Projektu" })).toBeNull();
  });

  it("wybór roli pokazuje zdanie o skutku tej roli", async () => {
    const uzytkownik = userEvent.setup();
    ustawApi(PROFIL_OPIEKUNA);
    render(<NowaOsoba />);
    await uzytkownik.click(await screen.findByRole("combobox", { name: /^Rola/ }));
    await uzytkownik.click(screen.getByRole("option", { name: "Student" }));
    expect(screen.getByText(SKUTEK_ROLI.student)).toBeInTheDocument();
  });
});

describe("Nowa osoba — zapis", () => {
  it("201: ciało POST zawiera dokładnie cztery pola, pojawia się potwierdzenie, formularz jest czyszczony", async () => {
    const uzytkownik = userEvent.setup();
    ustawApi(PROFIL_OPIEKUNA, () => KARTA_NOWEJ_OSOBY);
    render(<NowaOsoba />);
    await wypelnij(uzytkownik);
    await uzytkownik.click(screen.getByRole("button", { name: "Utwórz konto" }));

    await waitFor(() => expect(wywolaniaZapisu()).toHaveLength(1));
    expect(wywolaniaZapisu()[0]).toEqual([
      "/admin/users",
      { method: "POST", body: { first_name: "Marta", last_name: "Demo", email: "marta@demo.pl", role: "volunteer" } },
    ]);
    const potwierdzenie = await screen.findByRole("status");
    expect(potwierdzenie).toHaveTextContent("Konto zostało założone. Zaproszenie wysłano na adres marta@demo.pl.");
    expect(screen.getByLabelText(/^Imię/)).toHaveValue("");
    expect(screen.getByLabelText(/^Adres e-mail/)).toHaveValue("");
  });

  // zmierzone na cichym hoście: maks. 0,8 s z 10; limit 3× i co najmniej 15 s
  it("422: komunikat przy polu, podsumowanie błędów i błąd pola spoza ekranu; ciało nie ginie", { timeout: LIMIT_PRZYPADKU_MS }, async () => {
    const uzytkownik = userEvent.setup();
    ustawApi(PROFIL_OPIEKUNA, () =>
      bladApi(422, "validation_failed", "Popraw zaznaczone pola.", {
        errors: { email: ["Podaj poprawny adres e-mail."], pesel: ["Nieprawidłowy numer PESEL."] },
      }),
    );
    render(<NowaOsoba />);
    await wypelnij(uzytkownik);
    await uzytkownik.click(screen.getByRole("button", { name: "Utwórz konto" }));

    expect(await screen.findByText("Podaj poprawny adres e-mail.")).toBeInTheDocument();
    expect(screen.getByText("Popraw zaznaczone pola")).toBeInTheDocument();
    expect(screen.getByText("Nieprawidłowy numer PESEL.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Imię/)).toHaveValue("Marta");
  });

  // zmierzone na cichym hoście: maks. 0,9 s z 10; limit 3× i co najmniej 15 s
  it("409: duplikat adresu → zdanie, że rolę zmienia się w Kontach Niepodzielni, bez przycisku zmiany roli i bez PATCH", { timeout: LIMIT_PRZYPADKU_MS }, async () => {
    const uzytkownik = userEvent.setup();
    ustawApi(PROFIL_OPIEKUNA, () =>
      bladApi(409, "email_already_registered", "Konto z tym adresem e-mail już istnieje.", {
        reason: { existing_user_id: 44 },
      }),
    );
    render(<NowaOsoba />);
    await wypelnij(uzytkownik, "Student");
    await uzytkownik.click(screen.getByRole("button", { name: "Utwórz konto" }));

    expect(await screen.findByText("Konto z tym adresem już istnieje")).toBeInTheDocument();
    expect(screen.getByText(`Konto z tym adresem e-mail już istnieje. ${ZDANIE_O_KONTACH}`)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zmień rolę tego konta" })).toBeNull();
    expect(przyciskiGlowne()).toHaveLength(1);
    expect(wywolaniaZapisu()).toHaveLength(1);
    expect(wywolaniaZapisu().filter(([, opcje]) => (opcje as { method?: string } | undefined)?.method === "PATCH")).toEqual([]);
  });

  it("409 bez wybranej roli: to samo zdanie i brak przycisku zmiany roli", async () => {
    const uzytkownik = userEvent.setup();
    ustawApi(PROFIL_OPIEKUNA, () =>
      bladApi(409, "email_already_registered", "Konto z tym adresem e-mail już istnieje.", {
        reason: { existing_user_id: 44 },
      }),
    );
    render(<NowaOsoba />);
    await uzytkownik.type(await screen.findByLabelText(/^Imię/), "Marta");
    await uzytkownik.click(screen.getByRole("button", { name: "Utwórz konto" }));
    expect(await screen.findByText("Konto z tym adresem już istnieje")).toBeInTheDocument();
    expect(screen.getByText(`Konto z tym adresem e-mail już istnieje. ${ZDANIE_O_KONTACH}`)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zmień rolę tego konta" })).toBeNull();
  });

  // zmierzone na cichym hoście: maks. 0,8 s z 10; limit 3× i co najmniej 15 s
  it("403 przy zapisie: komunikat serwera, formularz zostaje", { timeout: LIMIT_PRZYPADKU_MS }, async () => {
    const uzytkownik = userEvent.setup();
    ustawApi(PROFIL_OPIEKUNA, () =>
      bladApi(403, "forbidden", "Tylko Super Admin może zarządzać kontami Super Admina."),
    );
    render(<NowaOsoba />);
    await wypelnij(uzytkownik);
    await uzytkownik.click(screen.getByRole("button", { name: "Utwórz konto" }));

    expect(await screen.findByText("Tylko Super Admin może zarządzać kontami Super Admina.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Imię/)).toHaveValue("Marta");
  });

  // zmierzone na cichym hoście: maks. 0,8 s z 10; limit 3× i co najmniej 15 s
  it("401 przy zapisie: ekran przechodzi w odmowę, zero pól", { timeout: LIMIT_PRZYPADKU_MS }, async () => {
    const uzytkownik = userEvent.setup();
    ustawApi(PROFIL_OPIEKUNA, () => bladApi(401, "unauthenticated", "Zaloguj się."));
    const { container } = render(<NowaOsoba />);
    await wypelnij(uzytkownik);
    await uzytkownik.click(screen.getByRole("button", { name: "Utwórz konto" }));
    await screen.findByText(/administracji/);
    expect(container.querySelectorAll("input, textarea")).toHaveLength(0);
    expect(() => jedenMain(container)).not.toThrow();
  });

  // zmierzone na cichym hoście: maks. 0,9 s z 10; limit 3× i co najmniej 15 s
  it("błąd sieci przy zapisie: „Spróbuj ponownie” powtarza to samo żądanie", { timeout: LIMIT_PRZYPADKU_MS }, async () => {
    const uzytkownik = userEvent.setup();
    let proby = 0;
    ustawApi(PROFIL_OPIEKUNA, () => {
      proby += 1;
      return proby === 1 ? new Error("sieć") : KARTA_NOWEJ_OSOBY;
    });
    render(<NowaOsoba />);
    await wypelnij(uzytkownik);
    await uzytkownik.click(screen.getByRole("button", { name: "Utwórz konto" }));

    expect(await screen.findByText("Nie udało się zapisać")).toBeInTheDocument();
    await uzytkownik.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));

    await waitFor(() => expect(wywolaniaZapisu()).toHaveLength(2));
    expect(wywolaniaZapisu()[1]).toEqual(wywolaniaZapisu()[0]);
    expect(await screen.findByRole("status")).toHaveTextContent("Konto zostało założone.");
  });

  it("„Wróć do listy” wraca bez żadnego zapisu", async () => {
    const uzytkownik = userEvent.setup();
    ustawApi(PROFIL_OPIEKUNA);
    render(<NowaOsoba />);
    await uzytkownik.click(await screen.findByRole("button", { name: "Wróć do listy" }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(wywolaniaZapisu()).toHaveLength(0);
  });
});
