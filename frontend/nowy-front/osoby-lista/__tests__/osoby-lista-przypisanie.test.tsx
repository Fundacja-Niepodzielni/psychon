import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axeViolations } from "@/components/__tests__/axe-helper";

/**
 * Przypisanie jednego prowadzącego wielu osobom z listy osób
 * (`POST /admin/supervisor-assignments`): pola wyboru, pasek „Wybrano: N”,
 * okno na wspólnym `Dialog` i potwierdzenie po przypisaniu. Każdy stan
 * sprawdza nagłówek, przyciski (i czy są aktywne), zdanie objaśniające oraz
 * nazwy dostępne.
 */

const apiPaged = vi.fn();
const api = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return {
    ...oryginal,
    apiPaged: (...args: unknown[]) => apiPaged(...args),
    api: (...args: unknown[]) => api(...args),
  };
});

vi.mock("@/lib/api/pliki", () => ({ downloadFile: vi.fn() }));

const { ApiError } = await import("@/lib/api/klient");
const { OsobyLista } = await import("../OsobyLista");

const JOANNA = { id: 5, name: "Joanna Demo" };
const EWA = { id: 6, name: "Ewa Demo" };

function osoba(id: number, nadpisania: Record<string, unknown> = {}) {
  return {
    id,
    first_name: "Marta",
    last_name: `Demo${id}`,
    email: `osoba${id}@demo.pl`,
    role: "volunteer",
    status: "active",
    product_group: "psychon",
    access_expires_at: "2027-02-01T00:00:00Z",
    program_completed_at: null,
    created_at: "2026-09-20T10:00:00Z",
    supervisor: null,
    ...nadpisania,
  };
}

function prowadzacy(id: number, imie: string) {
  return { ...osoba(id, { role: "instructor" }), first_name: imie, last_name: "Demo" };
}

function strona(dane: unknown[], meta: Record<string, unknown> = {}) {
  return { data: dane, meta: { current_page: 1, per_page: 25, total: dane.length, last_page: 1, ...meta } };
}

const PROWADZACY = [prowadzacy(5, "Joanna"), prowadzacy(6, "Ewa"), prowadzacy(7, "Ola")];

const OSOBY = [
  osoba(17),
  osoba(18, { supervisor: EWA }),
  osoba(19, { role: "student" }),
  osoba(20, { supervisor: JOANNA }),
  osoba(21),
];

/** Lista prowadzących dla okna i lista osób dla ekranu — po adresie żądania. */
function ustawListy(osoby: unknown[] | ((adres: string) => unknown) = OSOBY) {
  apiPaged.mockImplementation((adres: string) => {
    if (adres.includes("role=instructor")) return Promise.resolve(strona(PROWADZACY));
    return Promise.resolve(typeof osoby === "function" ? osoby(adres) : strona(osoby));
  });
}

function zapytaniaListy(): string[] {
  return apiPaged.mock.calls.map(([adres]) => String(adres)).filter((adres) => !adres.includes("role=instructor"));
}

function przyciskiGlowne(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("button[class*='primary']"));
}

async function zaznacz(uzytkownik: ReturnType<typeof userEvent.setup>, ...ids: number[]) {
  for (const id of ids) {
    await uzytkownik.click(await screen.findByRole("checkbox", { name: `Marta Demo${id}` }));
  }
}

async function otworzOkno(uzytkownik: ReturnType<typeof userEvent.setup>) {
  await uzytkownik.click(screen.getByRole("button", { name: "Przypisz prowadzącego" }));
  const okno = await screen.findByRole("dialog", { name: "Przypisz prowadzącego" });
  // Lista prowadzących wczytana — pole wyboru jest aktywne.
  await waitFor(() => expect(within(okno).getByRole("combobox", { name: /^Prowadzący/ })).not.toBeDisabled());
  return okno;
}

async function wybierzProwadzacego(uzytkownik: ReturnType<typeof userEvent.setup>, okno: HTMLElement, nazwa: string) {
  await uzytkownik.click(within(okno).getByRole("combobox", { name: /^Prowadzący/ }));
  await uzytkownik.click(screen.getByRole("option", { name: nazwa }));
}

beforeEach(() => {
  apiPaged.mockReset();
  api.mockReset();
  push.mockReset();
});

describe("Osoby — przypisanie prowadzącego: zaznaczenie", () => {
  it("nic nie wybrano: pole wyboru tylko przy wolontariuszach, bez paska i bez przycisku głównego", async () => {
    ustawListy();
    const { container } = render(<OsobyLista />);
    await screen.findByText("Marta Demo19");

    const pola = screen.getAllByRole("checkbox");
    expect(pola.map((pole) => pole.getAttribute("id"))).toEqual([
      "osoby-zaznacz-strone",
      "osoba-wybor-17",
      "osoba-wybor-18",
      "osoba-wybor-20",
      "osoba-wybor-21",
    ]);
    expect(screen.getByRole("checkbox", { name: "Zaznacz wszystkie na tej stronie" })).not.toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "Marta Demo19" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Wybrane osoby" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Przypisz prowadzącego" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Wyczyść wybór" })).toBeNull();
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(await axeViolations(screen.getByRole("region", { name: "Lista osób" }))).toEqual([]);
  });

  it("coś wybrano: pasek „Wybrano: N” z aktywnymi „Przypisz prowadzącego” (główny) i „Wyczyść wybór”", async () => {
    const uzytkownik = userEvent.setup();
    ustawListy();
    const { container } = render(<OsobyLista />);
    await zaznacz(uzytkownik, 17, 18);

    const pasek = screen.getByRole("region", { name: "Wybrane osoby" });
    expect(within(pasek).getByRole("status")).toHaveTextContent("Wybrano: 2");
    const przypisz = within(pasek).getByRole("button", { name: "Przypisz prowadzącego" });
    const wyczysc = within(pasek).getByRole("button", { name: "Wyczyść wybór" });
    expect(przypisz).toBeEnabled();
    expect(wyczysc).toBeEnabled();
    expect(przyciskiGlowne(container)).toEqual([przypisz]);
    expect(wyczysc.className).not.toMatch(/primary/);
    expect(wyczysc.className).toMatch(/quiet/);
    expect(screen.getByRole("checkbox", { name: "Marta Demo17" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Marta Demo21" })).not.toBeChecked();
    expect(await axeViolations(pasek)).toEqual([]);
  });

  it("„Dodaj osobę” zostaje w nagłówku w tym samym miejscu, ale gdy coś wybrano, jest drugorzędny — zielony jest tylko przycisk paska", async () => {
    const uzytkownik = userEvent.setup();
    ustawListy();
    const { container } = render(<OsobyLista adresNowejOsoby="/admin/uczestniczki/nowa" />);
    await screen.findByText("Marta Demo19");

    const dodaj = within(screen.getByTestId("pageheader-przycisk-glowny")).getByRole("button", { name: "Dodaj osobę" });
    expect(przyciskiGlowne(container)).toEqual([dodaj]);

    await zaznacz(uzytkownik, 17);
    const przypisz = within(screen.getByRole("region", { name: "Wybrane osoby" })).getByRole("button", {
      name: "Przypisz prowadzącego",
    });
    expect(within(screen.getByTestId("pageheader-przycisk-glowny")).getByRole("button", { name: "Dodaj osobę" })).toBe(dodaj);
    expect(dodaj.className).toMatch(/outline/);
    expect(dodaj).toBeEnabled();
    expect(przyciskiGlowne(container)).toEqual([przypisz]);

    await uzytkownik.click(dodaj);
    expect(push).toHaveBeenCalledWith("/admin/uczestniczki/nowa");

    await uzytkownik.click(screen.getByRole("button", { name: "Wyczyść wybór" }));
    expect(dodaj.className).toMatch(/primary/);
    expect(przyciskiGlowne(container)).toEqual([dodaj]);
  });

  it("wolontariusz z kontem zablokowanym albo zanonimizowanym nie ma pola wyboru — serwer go nie przypisze", async () => {
    ustawListy([osoba(17), osoba(22, { status: "blocked" }), osoba(23, { status: "deleted" })]);
    render(<OsobyLista />);
    await screen.findByText("Marta Demo22");

    expect(screen.getAllByRole("checkbox").map((pole) => pole.getAttribute("id"))).toEqual([
      "osoby-zaznacz-strone",
      "osoba-wybor-17",
    ]);
  });

  it("„Zaznacz wszystkie na tej stronie” zaznacza wolontariuszy strony, drugie kliknięcie ich odznacza", async () => {
    const uzytkownik = userEvent.setup();
    ustawListy();
    render(<OsobyLista />);
    await screen.findByText("Marta Demo19");

    await uzytkownik.click(screen.getByRole("checkbox", { name: "Zaznacz wszystkie na tej stronie" }));
    expect(screen.getByRole("status")).toHaveTextContent("Wybrano: 4");
    expect(screen.getByRole("checkbox", { name: "Zaznacz wszystkie na tej stronie" })).toBeChecked();

    await uzytkownik.click(screen.getByRole("checkbox", { name: "Marta Demo21" }));
    expect(screen.getByRole("checkbox", { name: "Zaznacz wszystkie na tej stronie" })).not.toBeChecked();

    await uzytkownik.click(screen.getByRole("checkbox", { name: "Zaznacz wszystkie na tej stronie" }));
    await uzytkownik.click(screen.getByRole("checkbox", { name: "Zaznacz wszystkie na tej stronie" }));
    expect(screen.queryByRole("region", { name: "Wybrane osoby" })).toBeNull();
  });

  it("zaznaczenie przetrwa zmianę strony i filtra, a „Wyczyść wybór” je usuwa", async () => {
    const uzytkownik = userEvent.setup();
    ustawListy((adres) => {
      if (adres.includes("search=")) return strona([osoba(42), osoba(17)]);
      if (/[?&]page=2(&|$)/.test(adres)) return strona([osoba(42)], { current_page: 2, last_page: 2, total: 6 });
      return strona(OSOBY, { current_page: 1, last_page: 2, total: 6 });
    });
    render(<OsobyLista />);
    await zaznacz(uzytkownik, 17);

    await uzytkownik.click(screen.getByRole("button", { name: "Następna" }));
    await zaznacz(uzytkownik, 42);
    expect(screen.getByRole("status")).toHaveTextContent("Wybrano: 2");

    await uzytkownik.click(screen.getByRole("button", { name: "Poprzednia" }));
    expect(await screen.findByRole("checkbox", { name: "Marta Demo17" })).toBeChecked();

    await uzytkownik.type(screen.getByRole("textbox", { name: /Szukaj/ }), "demo4");
    await uzytkownik.click(screen.getByRole("button", { name: "Filtruj" }));
    await waitFor(() => expect(zapytaniaListy().at(-1)).toContain("search=demo4"));
    expect(await screen.findByRole("checkbox", { name: "Marta Demo42" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Marta Demo17" })).toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("Wybrano: 2");

    await uzytkownik.click(screen.getByRole("button", { name: "Wyczyść wybór" }));
    expect(screen.queryByRole("region", { name: "Wybrane osoby" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Marta Demo42" })).not.toBeChecked();
  });

  it("ponad 100 osób: przycisk główny zostaje aktywny, ale zamiast okna pokazuje, ile odznaczyć", async () => {
    const uzytkownik = userEvent.setup();
    ustawListy(Array.from({ length: 101 }, (_, i) => osoba(i + 100)));
    render(<OsobyLista />);
    await screen.findByText("Marta Demo100");

    // Lista ma 101 wierszy: zapytania po roli tylko w obrębie paska, pole „Zaznacz wszystkie” po etykiecie.
    await uzytkownik.click(screen.getByLabelText("Zaznacz wszystkie na tej stronie"));
    const pasek = screen.getByText("Wybrano: 101").closest<HTMLElement>("[role='region']");
    expect(pasek).not.toBeNull();
    expect(pasek).toHaveAccessibleName("Wybrane osoby");
    expect(within(pasek!).getByRole("status")).toHaveTextContent("Wybrano: 101");
    expect(within(pasek!).getByText("Jednym przypisaniem obejmiesz najwyżej 100 osób. Odznacz 1 osobę.")).toBeInTheDocument();
    const przypisz = within(pasek!).getByRole("button", { name: "Przypisz prowadzącego" });
    expect(przypisz).toBeEnabled();

    await uzytkownik.click(przypisz);
    expect(document.querySelector("dialog")).toBeNull();
    expect(api).not.toHaveBeenCalled();
  });
});

describe("Osoby — przypisanie prowadzącego: okno", () => {
  it("bez wybranego prowadzącego: przyczyna „Wybierz prowadzącego.”, kliknięcie „Przypisz (N)” niczego nie wysyła", async () => {
    const uzytkownik = userEvent.setup();
    ustawListy();
    render(<OsobyLista />);
    await zaznacz(uzytkownik, 17, 18);
    const okno = await otworzOkno(uzytkownik);

    expect(within(okno).getByRole("heading", { level: 2, name: "Przypisz prowadzącego" })).toBeInTheDocument();
    expect(within(okno).getByText(/zaznaczonym osobom: 2\./)).toBeInTheDocument();
    expect(within(okno).getByRole("combobox", { name: /^Prowadzący/ })).toHaveTextContent("Nie wybrano");
    expect(within(okno).getByText("Wybierz prowadzącego.")).toBeInTheDocument();
    expect(within(okno).queryByText(/zmieni się prowadzący/)).toBeNull();
    const anuluj = within(okno).getByRole("button", { name: "Anuluj" });
    const przypisz = within(okno).getByRole("button", { name: "Przypisz (2)" });
    expect(anuluj).toBeEnabled();
    // Przycisk główny nigdy nie jest nieaktywny (reguła atomu `Button`) — kliknięcie pokazuje brak.
    expect(przypisz).toBeEnabled();
    expect(await axeViolations(okno)).toEqual([]);

    await uzytkownik.click(przypisz);
    expect(api).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Przypisz prowadzącego" })).toBeInTheDocument();
    expect(within(okno).getByText("Wybierz prowadzącego.").className).toMatch(/blad|error/i);
  });

  it("lista prowadzących w oknie ma tylko aktywne konta, nawet gdy odpowiedź niesie też nieaktywne", async () => {
    const uzytkownik = userEvent.setup();
    const zMieszanka = [
      ...PROWADZACY,
      { ...prowadzacy(8, "Zablokowana"), status: "blocked" },
      { ...prowadzacy(9, "Zaproszony"), status: "invited" },
      { ...prowadzacy(10, "Zanonimizowana"), status: "deleted" },
    ];
    apiPaged.mockImplementation((adres: string) =>
      Promise.resolve(strona(adres.includes("role=instructor") ? zMieszanka : OSOBY)),
    );
    render(<OsobyLista />);
    await zaznacz(uzytkownik, 17);
    const okno = await otworzOkno(uzytkownik);
    await uzytkownik.click(within(okno).getByRole("combobox", { name: /^Prowadzący/ }));

    expect(screen.getAllByRole("option").map((opcja) => opcja.textContent)).toEqual([
      "Nie wybrano",
      "Joanna Demo",
      "Ewa Demo",
      "Ola Demo",
    ]);
  });

  it("zdanie o zmianie: jedna osoba w liczbie pojedynczej, kilka w mnogiej; ten sam prowadzący nie liczy się jako zmiana", async () => {
    const uzytkownik = userEvent.setup();
    ustawListy();
    render(<OsobyLista />);
    await zaznacz(uzytkownik, 17, 18, 20);
    const okno = await otworzOkno(uzytkownik);

    await wybierzProwadzacego(uzytkownik, okno, "Joanna Demo");
    expect(within(okno).queryByText("Wybierz prowadzącego.")).toBeNull();
    expect(
      within(okno).getByText(
        "U 1 osoby zmieni się prowadzący. Poprzedni prowadzący straci dostęp do rozmowy z tą osobą; zobaczy ona starą rozmowę tylko do odczytu.",
      ),
    ).toBeInTheDocument();

    await wybierzProwadzacego(uzytkownik, okno, "Ola Demo");
    expect(
      within(okno).getByText(
        "U 2 osób zmieni się prowadzący. Poprzedni prowadzący straci dostęp do rozmowy z tymi osobami; każda z nich zobaczy starą rozmowę tylko do odczytu.",
      ),
    ).toBeInTheDocument();
    expect(within(okno).getByRole("button", { name: "Przypisz (3)" })).toBeEnabled();
    expect(await axeViolations(okno)).toEqual([]);
  });

  it("„Anuluj” i Escape zamykają okno bez żądania, zaznaczenie zostaje", async () => {
    const uzytkownik = userEvent.setup();
    ustawListy();
    render(<OsobyLista />);
    await zaznacz(uzytkownik, 17);

    await otworzOkno(uzytkownik);
    await uzytkownik.click(screen.getByRole("button", { name: "Anuluj" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    await otworzOkno(uzytkownik);
    await uzytkownik.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Wybrano: 1");
  });

  it("zapisywanie: przycisk nazywa stan, pole jest zablokowane, drugie kliknięcie nie wysyła drugi raz", async () => {
    const uzytkownik = userEvent.setup();
    ustawListy();
    api.mockReturnValue(new Promise(() => {}));
    render(<OsobyLista />);
    await zaznacz(uzytkownik, 17, 18);
    const okno = await otworzOkno(uzytkownik);
    await wybierzProwadzacego(uzytkownik, okno, "Joanna Demo");

    await uzytkownik.click(within(okno).getByRole("button", { name: "Przypisz (2)" }));
    const wTrakcie = await within(okno).findByRole("button", { name: "Przypisywanie…" });
    expect(within(okno).getByRole("status")).toHaveTextContent("Trwa przypisywanie prowadzącego…");
    expect(within(okno).getByRole("combobox", { name: /^Prowadzący/ })).toBeDisabled();
    expect(within(okno).getByRole("button", { name: "Anuluj" })).toBeEnabled();

    await uzytkownik.click(wTrakcie);
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/admin/supervisor-assignments", {
      method: "POST",
      body: { supervisor_id: 5, user_ids: [17, 18] },
    });
  });
});

describe("Osoby — przypisanie prowadzącego: wynik", () => {
  it("wszyscy przypisani: okno znika, lista wczytuje się ponownie, potwierdzenie z odnośnikiem do dziennika", async () => {
    const uzytkownik = userEvent.setup();
    ustawListy();
    api.mockResolvedValue({
      supervisor_id: 5,
      results: [
        { user_id: 17, result: "assigned", reason: null },
        { user_id: 18, result: "assigned", reason: null },
      ],
      summary: { requested: 2, assigned: 2, unchanged: 0, refused: 0, not_found: 0 },
    });
    render(<OsobyLista />);
    await zaznacz(uzytkownik, 17, 18);
    const okno = await otworzOkno(uzytkownik);
    await wybierzProwadzacego(uzytkownik, okno, "Joanna Demo");
    const przedPrzypisaniem = zapytaniaListy().length;

    await uzytkownik.click(within(okno).getByRole("button", { name: "Przypisz (2)" }));

    const wynik = await screen.findByRole("region", { name: "Wynik przypisania" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(wynik).getByRole("heading", { level: 3, name: "Przypisano 2 z 2 osób." })).toBeInTheDocument();
    expect(within(wynik).getByText("Zaznaczenie zostało wyczyszczone.")).toBeInTheDocument();
    expect(within(wynik).getByRole("link", { name: "Pokaż dziennik działań" })).toHaveAttribute("href", "/admin/dziennik");
    expect(within(wynik).queryByText("Nie przypisano:")).toBeNull();
    expect(screen.queryByRole("region", { name: "Wybrane osoby" })).toBeNull();
    await waitFor(() => expect(zapytaniaListy().length).toBe(przedPrzypisaniem + 1));
    await waitFor(() => expect(wynik).toHaveFocus());
    expect(await axeViolations(wynik)).toEqual([]);
  });

  it("wynik częściowy: lista nieudanych z prostym powodem, nieudane osoby zostają zaznaczone", async () => {
    const uzytkownik = userEvent.setup();
    ustawListy();
    api.mockResolvedValue({
      supervisor_id: 5,
      results: [
        { user_id: 17, result: "assigned", reason: null },
        { user_id: 18, result: "refused", reason: "not_assignable" },
        { user_id: 20, result: "unchanged", reason: null },
        { user_id: 21, result: "not_found", reason: null },
      ],
      summary: { requested: 4, assigned: 1, unchanged: 1, refused: 1, not_found: 1 },
    });
    render(<OsobyLista />);
    await zaznacz(uzytkownik, 17, 18, 20, 21);
    const okno = await otworzOkno(uzytkownik);
    await wybierzProwadzacego(uzytkownik, okno, "Joanna Demo");

    await uzytkownik.click(within(okno).getByRole("button", { name: "Przypisz (4)" }));

    const wynik = await screen.findByRole("region", { name: "Wynik przypisania" });
    expect(within(wynik).getByRole("heading", { level: 3, name: "Przypisano 2 z 4 osób." })).toBeInTheDocument();
    expect(
      within(wynik).getByText(
        "1 z nich miała już tego prowadzącego. Osoby, których nie udało się przypisać, zostały zaznaczone.",
      ),
    ).toBeInTheDocument();
    expect(within(wynik).getAllByRole("listitem").map((pozycja) => pozycja.textContent)).toEqual([
      "Marta Demo18: prowadzącego można przypisać tylko aktywnemu kontu z rolą „Wolontariusz”.",
      "Marta Demo21: nie znaleziono tej osoby — konto mogło zostać usunięte.",
    ]);
    expect(within(wynik).getByRole("link", { name: "Pokaż dziennik działań" })).toBeInTheDocument();
    expect(wynik.textContent).not.toMatch(/not_assignable|not_found|refused/);

    expect(screen.getByRole("region", { name: "Wybrane osoby" })).toHaveTextContent("Wybrano: 2");
    expect(await screen.findByRole("checkbox", { name: "Marta Demo18" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Marta Demo21" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Marta Demo17" })).not.toBeChecked();
  });

  it("błąd serwera: okno zostaje z komunikatem i zaznaczeniem, a po zamknięciu lista wczytuje się ponownie", async () => {
    const uzytkownik = userEvent.setup();
    ustawListy();
    api.mockRejectedValue(new ApiError({ status: 500, code: "server_error", message: "Błąd." }));
    render(<OsobyLista />);
    await zaznacz(uzytkownik, 17, 18);
    const okno = await otworzOkno(uzytkownik);
    await wybierzProwadzacego(uzytkownik, okno, "Joanna Demo");
    const przedPrzypisaniem = zapytaniaListy().length;

    await uzytkownik.click(within(okno).getByRole("button", { name: "Przypisz (2)" }));

    const alert = await within(okno).findByRole("alert");
    expect(within(alert).getByRole("heading", { name: "Nie udało się przypisać prowadzącego" })).toBeInTheDocument();
    expect(alert).toHaveTextContent(/Serwer nie potwierdził przypisania\./);
    expect(within(okno).getByRole("button", { name: "Przypisz (2)" })).toBeEnabled();
    expect(within(okno).getByRole("combobox", { name: /^Prowadzący/ })).not.toBeDisabled();
    expect(screen.queryByRole("region", { name: "Wynik przypisania" })).toBeNull();

    await uzytkownik.click(within(okno).getByRole("button", { name: "Anuluj" }));
    await waitFor(() => expect(zapytaniaListy().length).toBe(przedPrzypisaniem + 1));
    expect(await screen.findByRole("region", { name: "Wybrane osoby" })).toHaveTextContent("Wybrano: 2");
  });

  it("odmowa całego żądania (422): zdanie serwera i informacja, że nikomu nie przypisano; zamknięcie nie wczytuje listy", async () => {
    const uzytkownik = userEvent.setup();
    ustawListy();
    api.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "validation_failed",
        message: "Popraw zaznaczone pola.",
        errors: { supervisor_id: ["Prowadzącym może być tylko aktywne konto z rolą prowadzącego."] },
      }),
    );
    render(<OsobyLista />);
    await zaznacz(uzytkownik, 17, 18);
    const okno = await otworzOkno(uzytkownik);
    await wybierzProwadzacego(uzytkownik, okno, "Joanna Demo");
    const przedPrzypisaniem = zapytaniaListy().length;

    await uzytkownik.click(within(okno).getByRole("button", { name: "Przypisz (2)" }));

    const alert = await within(okno).findByRole("alert");
    expect(within(alert).getByRole("heading", { name: "Serwer odrzucił przypisanie" })).toBeInTheDocument();
    expect(alert).toHaveTextContent(
      "Prowadzącym może być tylko aktywne konto z rolą prowadzącego. Nikomu nie przypisano prowadzącego.",
    );
    expect(alert.textContent).not.toMatch(/validation_failed/);

    await uzytkownik.click(within(okno).getByRole("button", { name: "Anuluj" }));
    expect(zapytaniaListy().length).toBe(przedPrzypisaniem);
    expect(screen.getByRole("status")).toHaveTextContent("Wybrano: 2");
  });

  it("w trakcie wysyłania okna nie da się zamknąć — odpowiedź serwera zawsze trafia na ekran", async () => {
    const uzytkownik = userEvent.setup();
    ustawListy();
    let odpowiedz: (wartosc: unknown) => void = () => undefined;
    api.mockImplementation(
      () =>
        new Promise((rozwiaz) => {
          odpowiedz = rozwiaz;
        }),
    );
    render(<OsobyLista />);
    await zaznacz(uzytkownik, 17);
    const okno = await otworzOkno(uzytkownik);
    await wybierzProwadzacego(uzytkownik, okno, "Joanna Demo");

    await uzytkownik.click(within(okno).getByRole("button", { name: "Przypisz (1)" }));
    await within(okno).findByText("Trwa przypisywanie prowadzącego…");
    await uzytkownik.click(within(okno).getByRole("button", { name: "Anuluj" }));
    await uzytkownik.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Przypisz prowadzącego" })).toBeInTheDocument();

    odpowiedz({
      supervisor_id: 5,
      results: [{ user_id: 17, result: "assigned", reason: null }],
      summary: { requested: 1, assigned: 1, unchanged: 0, refused: 0, not_found: 0 },
    });
    expect(await screen.findByRole("region", { name: "Wynik przypisania" })).toHaveTextContent("Przypisano 1 z 1 osoby.");
  });

  it("brak dostępu przy przypisaniu: komunikat o uprawnieniach, nic się nie zmienia", async () => {
    const uzytkownik = userEvent.setup();
    ustawListy();
    api.mockRejectedValue(new ApiError({ status: 403, code: "forbidden", message: "Nie masz dostępu do tej sekcji." }));
    render(<OsobyLista />);
    await zaznacz(uzytkownik, 17);
    const okno = await otworzOkno(uzytkownik);
    await wybierzProwadzacego(uzytkownik, okno, "Joanna Demo");
    const przedPrzypisaniem = zapytaniaListy().length;

    await uzytkownik.click(within(okno).getByRole("button", { name: "Przypisz (1)" }));

    const alert = await within(okno).findByRole("alert");
    expect(within(alert).getByRole("heading", { name: "Brak uprawnień do przypisania" })).toBeInTheDocument();
    expect(alert).toHaveTextContent("Przypisywanie prowadzących jest tylko dla administracji. Zaznaczenie zostało bez zmian.");

    await uzytkownik.click(within(okno).getByRole("button", { name: "Anuluj" }));
    expect(zapytaniaListy().length).toBe(przedPrzypisaniem);
    expect(screen.getByRole("status")).toHaveTextContent("Wybrano: 1");
  });

  it("brak dostępu do listy prowadzących: komunikat w oknie, pole wyboru zablokowane", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockImplementation((adres: string) =>
      adres.includes("role=instructor")
        ? Promise.reject(new ApiError({ status: 403, code: "forbidden", message: "Nie masz dostępu do tej sekcji." }))
        : Promise.resolve(strona(OSOBY)),
    );
    render(<OsobyLista />);
    await zaznacz(uzytkownik, 17);

    await uzytkownik.click(screen.getByRole("button", { name: "Przypisz prowadzącego" }));
    const okno = await screen.findByRole("dialog", { name: "Przypisz prowadzącego" });
    const alert = await within(okno).findByRole("alert");
    expect(within(alert).getByRole("heading", { name: "Nie udało się wczytać listy prowadzących" })).toBeInTheDocument();
    expect(alert).toHaveTextContent("Przypisywanie prowadzących jest tylko dla administracji.");
    expect(within(okno).getByRole("combobox", { name: /^Prowadzący/ })).toBeDisabled();
  });

  it("brak dostępu do listy osób: bez pól wyboru i bez paska", async () => {
    apiPaged.mockRejectedValue(new ApiError({ status: 403, code: "forbidden", message: "Odmowa." }));
    const { container } = render(<OsobyLista />);

    await screen.findByText(/administracji/);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByRole("region", { name: "Wybrane osoby" })).toBeNull();
    expect(przyciskiGlowne(container)).toHaveLength(0);
  });
});
