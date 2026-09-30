import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import type { PytanieSkrzynki, StronaPytan } from "../dane";

/**
 * Ekran „Skrzynka pytań” (prowadzący): każdy stan w szablonie listy z jednym
 * `main`, lista pytań bez odpowiedzi, odpowiedź w treści (bez okna), 422 na
 * polu, 404 i 403 `entry_locked` przy odpowiedzi, odmowa z powodu roli
 * (atrapa 401/403, 0 danych w DOM), błąd połączenia z ponowieniem. Każda
 * atrapa odpowiedzi serwera ma jawny typ z `../dane`, więc brak albo obcy klucz
 * w atrapie czerwieni `npm run sprawdz-typy`.
 */

const api = vi.fn();
const apiPaged = vi.fn();
const back = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push, refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return {
    ...oryginal,
    api: (...argumenty: unknown[]) => api(...argumenty),
    apiPaged: (...argumenty: unknown[]) => apiPaged(...argumenty),
  };
});

const { ApiError } = await import("@/lib/api/klient");
const { SkrzynkaPytan } = await import("../SkrzynkaPytan");

const PYTANIE_PIERWSZE = {
  id: 11,
  lesson_id: 21,
  question: "Jak długo trwa pierwsza rozmowa z osobą zgłaszającą się?",
  answer: null,
  answered_by: null,
  answered_by_name: null,
  answered_at: null,
  created_at: "2026-09-29T10:15:00Z",
  updated_at: "2026-09-29T10:15:00Z",
  user: { id: 17, first_name: "Marta", last_name: "Demo" },
  lesson: { id: 21, title: "Wprowadzenie do wywiadu", course: { id: 3, slug: "wywiad-psychologiczny", title: "Wywiad psychologiczny" } },
} satisfies PytanieSkrzynki;

const PYTANIE_DRUGIE = {
  ...PYTANIE_PIERWSZE,
  id: 12,
  lesson_id: 22,
  question: "Czy dyżur można odbyć w parze?",
  user: { id: 18, first_name: "Filip", last_name: "Demo" },
  lesson: { id: 22, title: "Dyżur w praktyce", course: { id: 3, slug: "wywiad-psychologiczny", title: "Wywiad psychologiczny" } },
} satisfies PytanieSkrzynki;

const PYTANIE_Z_HTML = {
  ...PYTANIE_PIERWSZE,
  id: 13,
  question: '<img src=x onerror="window.zlo=1"> <script>window.zlo=2</script> Czy to jest tekst?',
} satisfies PytanieSkrzynki;

const DWA_PYTANIA = {
  data: [PYTANIE_PIERWSZE, PYTANIE_DRUGIE],
  meta: { current_page: 1, per_page: 25, total: 2, last_page: 1, extra: { unanswered: 2 } },
} satisfies StronaPytan;

const PUSTA_SKRZYNKA = {
  data: [],
  meta: { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { unanswered: 0 } },
} satisfies StronaPytan;

const ODPOWIEDZ = "Około 40 minut; zostaw zapas na notatki.";

const ODPOWIEDZIANE = {
  ...PYTANIE_PIERWSZE,
  answer: ODPOWIEDZ,
  answered_by: 5,
  answered_by_name: "Joanna Demo",
  answered_at: "2026-09-30T08:00:00Z",
} satisfies PytanieSkrzynki;

const ODPOWIEDZ_Z_HTML = '<img src=x onerror="window.zlo=3"> <script>window.zlo=4</script> Zapytaj o <b>dyżur</b>.';

const ODPOWIEDZIANE_Z_HTML = {
  ...PYTANIE_DRUGIE,
  id: 14,
  question: "Jak zapisać notatkę po dyżurze?",
  answer: ODPOWIEDZ_Z_HTML,
  answered_by: 5,
  answered_by_name: "Joanna Demo",
  answered_at: "2026-09-30T09:30:00Z",
} satisfies PytanieSkrzynki;

const WSZYSTKIE = {
  data: [PYTANIE_PIERWSZE, ODPOWIEDZIANE_Z_HTML],
  meta: { current_page: 1, per_page: 25, total: 2, last_page: 1, extra: { unanswered: 1 } },
} satisfies StronaPytan;

const NIC_NIE_ZADANO = {
  data: [],
  meta: { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { unanswered: 0 } },
} satisfies StronaPytan;

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  back.mockReset();
  push.mockReset();
});

/** Sprawdzenie szablonu: jedyny `main` z `id="tresc"` i znacznik szablonu listy. */
function sprawdzSzablon(kontener: HTMLElement) {
  jedenMain(kontener);
  expect(kontener.querySelector("main")?.dataset.styleId).toBe("szablon-lista");
}

/** Przyciski w kolorze (`primary`) w całym korzeniu ekranu. */
function przyciskiGlowne(kontener: HTMLElement): HTMLElement[] {
  return Array.from(kontener.querySelectorAll<HTMLElement>("button")).filter((przycisk) => /primary/.test(przycisk.className));
}

function przyciskiOdpowiedz(): HTMLElement[] {
  return screen.queryAllByRole("button", { name: "Odpowiedz" });
}

describe("Skrzynka pytań — próba kontrolna sprawdzenia szablonu", () => {
  it("sprawdzenie czerwienieje bez znacznika szablonu listy i przy dwóch main", () => {
    const { container } = render(<main id="tresc" tabIndex={-1} />);
    expect(() => sprawdzSzablon(container)).toThrow();
    const { container: dwa } = render(
      <div>
        <main id="tresc" tabIndex={-1} data-style-id="szablon-lista" />
        <main />
      </div>,
    );
    expect(() => sprawdzSzablon(dwa)).toThrow();
  });
});

describe("Skrzynka pytań — ładowanie", () => {
  it("szkielet w szablonie listy, jeden main, zero pytań i przycisków odpowiedzi", () => {
    apiPaged.mockReturnValue(new Promise(() => {}));
    const { container } = render(<SkrzynkaPytan />);

    sprawdzSzablon(container);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(przyciskiOdpowiedz()).toHaveLength(0);
    expect(screen.getByRole("heading", { level: 1, name: "Skrzynka pytań" })).toBeInTheDocument();
  });
});

describe("Skrzynka pytań — dane", () => {
  it("prosi o pytania bez odpowiedzi, pokazuje treść, autora, kurs i lekcję, licznik i jeden przycisk „Odpowiedz” na pytanie", async () => {
    apiPaged.mockResolvedValue(DWA_PYTANIA);
    const { container } = render(<SkrzynkaPytan />);

    expect(await screen.findByText(PYTANIE_PIERWSZE.question)).toBeInTheDocument();
    expect(apiPaged).toHaveBeenCalledWith("/instructor/questions?answered=false&page=1");
    expect(screen.getByText(PYTANIE_DRUGIE.question)).toBeInTheDocument();
    expect(screen.getByText(/Marta Demo · Wywiad psychologiczny · Wprowadzenie do wywiadu · 29\.09\.2026/)).toBeInTheDocument();
    expect(screen.getByText("2 pytania bez odpowiedzi")).toBeInTheDocument();
    expect(przyciskiOdpowiedz()).toHaveLength(2);
    sprawdzSzablon(container);
    expect(przyciskiGlowne(container)).toHaveLength(0);
  });

  it("treść pytania z HTML jest tekstem: zero elementów z treści, zero wykonania", async () => {
    apiPaged.mockResolvedValue({ data: [PYTANIE_Z_HTML], meta: { current_page: 1, per_page: 25, total: 1, last_page: 1, extra: { unanswered: 1 } } } satisfies StronaPytan);
    const { container } = render(<SkrzynkaPytan />);

    expect(await screen.findByText(PYTANIE_Z_HTML.question)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect("zlo" in window).toBe(false);
  });

  it("próba kontrolna: to samo sprawdzenie widzi element, gdy treść naprawdę go zawiera", () => {
    const { container } = render(<div dangerouslySetInnerHTML={{ __html: PYTANIE_Z_HTML.question }} />);
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("stronicowanie: „Następna” prosi o kolejną stronę", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockResolvedValue({
      data: [PYTANIE_PIERWSZE],
      meta: { current_page: 1, per_page: 1, total: 2, last_page: 2, extra: { unanswered: 2 } },
    } satisfies StronaPytan);
    render(<SkrzynkaPytan />);

    expect(await screen.findByText("Strona 1 z 2")).toBeInTheDocument();
    await uzytkownik.click(screen.getByRole("button", { name: "Następna" }));
    await waitFor(() => expect(apiPaged).toHaveBeenLastCalledWith("/instructor/questions?answered=false&page=2"));
  });
});

describe("Skrzynka pytań — stan pusty", () => {
  it("„Brak pytań bez odpowiedzi” w szablonie listy, zero przycisków odpowiedzi, wyjście do pulpitu", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockResolvedValue(PUSTA_SKRZYNKA);
    const { container } = render(<SkrzynkaPytan />);

    expect(await screen.findByText("Brak pytań bez odpowiedzi")).toBeInTheDocument();
    sprawdzSzablon(container);
    expect(przyciskiOdpowiedz()).toHaveLength(0);
    expect(screen.getByText("0 pytań bez odpowiedzi")).toBeInTheDocument();
    await uzytkownik.click(screen.getByRole("button", { name: "Wróć do pulpitu" }));
    expect(push).toHaveBeenCalledWith("/prowadzacy");
  });
});

describe("Skrzynka pytań — odmowa z powodu roli", () => {
  it.each([
    ["403 forbidden", 403, "forbidden"],
    ["401 unauthenticated", 401, "unauthenticated"],
  ])("%s przy odczycie: wariant odmowy z rolą, szablon, zero danych w DOM", async (_nazwa, status, kod) => {
    apiPaged.mockRejectedValue(new ApiError({ status, code: kod, message: "Nie masz dostępu do tej sekcji." }));
    const { container } = render(<SkrzynkaPytan />);

    expect(await screen.findByText(/prowadzących/)).toBeInTheDocument();
    sprawdzSzablon(container);
    expect(przyciskiOdpowiedz()).toHaveLength(0);
    expect(container.textContent).not.toContain(PYTANIE_PIERWSZE.question);
    expect(screen.queryByText(/pytań bez odpowiedzi$/)).toBeNull();
    expect(container.textContent).not.toMatch(/Brak dostępu|Nie masz uprawnień/);
  });

  it("403 forbidden przy wysyłce odpowiedzi: stan odmowy zamiast listy", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockResolvedValue(DWA_PYTANIA);
    api.mockRejectedValue(new ApiError({ status: 403, code: "forbidden", message: "Nie masz dostępu do tej sekcji." }));
    const { container } = render(<SkrzynkaPytan />);

    await screen.findByText(PYTANIE_PIERWSZE.question);
    await uzytkownik.click(przyciskiOdpowiedz()[0]);
    await uzytkownik.type(screen.getByRole("textbox", { name: /^Odpowiedź/ }), "x");
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij odpowiedź" }));

    expect(await screen.findByText(/prowadzących/)).toBeInTheDocument();
    sprawdzSzablon(container);
    expect(container.textContent).not.toContain(PYTANIE_PIERWSZE.question);
  });
});

describe("Skrzynka pytań — błąd połączenia przy odczycie", () => {
  it("Notice z „Spróbuj ponownie”; ponowienie wczytuje listę", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(DWA_PYTANIA);
    const { container } = render(<SkrzynkaPytan />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Nie udało się wczytać pytań");
    sprawdzSzablon(container);
    expect(przyciskiOdpowiedz()).toHaveLength(0);

    await uzytkownik.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(await screen.findByText(PYTANIE_PIERWSZE.question)).toBeInTheDocument();
    expect(apiPaged).toHaveBeenCalledTimes(2);
  });
});

describe("Skrzynka pytań — odpowiedź", () => {
  async function otworzPierwsze() {
    const uzytkownik = userEvent.setup();
    apiPaged.mockResolvedValue(DWA_PYTANIA);
    const wynik = render(<SkrzynkaPytan />);
    await screen.findByText(PYTANIE_PIERWSZE.question);
    await uzytkownik.click(przyciskiOdpowiedz()[0]);
    return { uzytkownik, ...wynik };
  }

  it("„Odpowiedz” otwiera formularz w treści przy pytaniu: bez okna, jeden rząd przycisków, tekst pytania widoczny", async () => {
    const { container } = await otworzPierwsze();

    const formularz = screen.getByRole("form", { name: "Odpowiedź na pytanie" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(PYTANIE_PIERWSZE.question)).toBeInTheDocument();
    expect(within(formularz).getAllByRole("button").map((przycisk) => przycisk.textContent)).toEqual([
      "Wróć do listy",
      "Wyślij odpowiedź",
    ]);
    sprawdzSzablon(container);
    expect(przyciskiGlowne(container)).toHaveLength(1);
  });

  it("wysłanie: ciało dokładnie { answer }, Toast, pytanie znika, licznik maleje od razu", async () => {
    const { uzytkownik, container } = await otworzPierwsze();
    api.mockResolvedValue(ODPOWIEDZIANE);

    await uzytkownik.type(screen.getByRole("textbox", { name: /^Odpowiedź/ }), ODPOWIEDZ);
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij odpowiedź" }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(api).toHaveBeenCalledWith("/instructor/questions/11/answer", { method: "POST", body: { answer: ODPOWIEDZ } });

    expect(await screen.findByText("Odpowiedź wysłana.")).toBeInTheDocument();
    expect(screen.queryByText(PYTANIE_PIERWSZE.question)).toBeNull();
    expect(screen.getByText(PYTANIE_DRUGIE.question)).toBeInTheDocument();
    expect(screen.getByText("1 pytanie bez odpowiedzi")).toBeInTheDocument();
    expect(screen.queryByRole("form")).toBeNull();
    expect(apiPaged).toHaveBeenCalledTimes(1);
    sprawdzSzablon(container);
  });

  it("ostatnie pytanie: po odpowiedzi stan pusty „Brak pytań bez odpowiedzi”", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockResolvedValue({
      data: [PYTANIE_PIERWSZE],
      meta: { current_page: 1, per_page: 25, total: 1, last_page: 1, extra: { unanswered: 1 } },
    } satisfies StronaPytan);
    api.mockResolvedValue(ODPOWIEDZIANE);
    render(<SkrzynkaPytan />);

    await screen.findByText(PYTANIE_PIERWSZE.question);
    await uzytkownik.click(przyciskiOdpowiedz()[0]);
    await uzytkownik.type(screen.getByRole("textbox", { name: /^Odpowiedź/ }), ODPOWIEDZ);
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij odpowiedź" }));

    expect(await screen.findByText("Brak pytań bez odpowiedzi")).toBeInTheDocument();
    expect(screen.getByText("Odpowiedź wysłana.")).toBeInTheDocument();
  });

  it("pusta odpowiedź: 422 z polem — komunikat pod polem, formularz zostaje, pytanie zostaje na liście", async () => {
    const { uzytkownik, container } = await otworzPierwsze();
    api.mockRejectedValue(
      new ApiError({ status: 422, code: "validation_failed", message: "Popraw zaznaczone pola.", errors: { answer: ["Wpisz treść odpowiedzi."] } }),
    );

    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij odpowiedź" }));

    await waitFor(() => expect(api).toHaveBeenCalledWith("/instructor/questions/11/answer", { method: "POST", body: { answer: "" } }));
    const pole = screen.getByRole("textbox", { name: /^Odpowiedź/ });
    expect(pole).toHaveAccessibleDescription(/Wpisz treść odpowiedzi\./);
    expect(screen.getAllByText("Wpisz treść odpowiedzi.").length).toBeGreaterThan(0);
    expect(screen.getByRole("form", { name: "Odpowiedź na pytanie" })).toBeInTheDocument();
    expect(screen.queryByText("Odpowiedź wysłana.")).toBeNull();
    sprawdzSzablon(container);
  });

  it("422 bez pola odpowiedzi: komunikat z koperty w Notice, formularz zostaje", async () => {
    const { uzytkownik } = await otworzPierwsze();
    api.mockRejectedValue(new ApiError({ status: 422, code: "validation_failed", message: "Popraw zaznaczone pola.", errors: { inne: ["x"] } }));

    await uzytkownik.type(screen.getByRole("textbox", { name: /^Odpowiedź/ }), "x");
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij odpowiedź" }));

    expect(await screen.findByText("Popraw zaznaczone pola.")).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Odpowiedź na pytanie" })).toBeInTheDocument();
  });

  it("404: komunikat z koperty, powrót do listy, lista wczytana ponownie", async () => {
    const { uzytkownik, container } = await otworzPierwsze();
    api.mockRejectedValue(new ApiError({ status: 404, code: "not_found", message: "Nie znaleziono pytania." }));
    apiPaged.mockResolvedValue({ data: [PYTANIE_DRUGIE], meta: { current_page: 1, per_page: 25, total: 1, last_page: 1, extra: { unanswered: 1 } } } satisfies StronaPytan);

    await uzytkownik.type(screen.getByRole("textbox", { name: /^Odpowiedź/ }), "x");
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij odpowiedź" }));

    expect(await screen.findByText("Nie znaleziono pytania.")).toBeInTheDocument();
    await waitFor(() => expect(apiPaged).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(PYTANIE_DRUGIE.question)).toBeInTheDocument();
    expect(screen.queryByText(PYTANIE_PIERWSZE.question)).toBeNull();
    expect(screen.queryByRole("form")).toBeNull();
    sprawdzSzablon(container);
  });

  it("403 entry_locked: komunikat z koperty i odświeżona lista", async () => {
    const { uzytkownik } = await otworzPierwsze();
    api.mockRejectedValue(new ApiError({ status: 403, code: "entry_locked", message: "Na to pytanie już odpowiedziano." }));
    apiPaged.mockResolvedValue({ data: [PYTANIE_DRUGIE], meta: { current_page: 1, per_page: 25, total: 1, last_page: 1, extra: { unanswered: 1 } } } satisfies StronaPytan);

    await uzytkownik.type(screen.getByRole("textbox", { name: /^Odpowiedź/ }), "x");
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij odpowiedź" }));

    expect(await screen.findByText("Na to pytanie już odpowiedziano.")).toBeInTheDocument();
    await waitFor(() => expect(apiPaged).toHaveBeenCalledTimes(2));
  });

  it("błąd połączenia przy wysyłce: Notice z „Spróbuj ponownie”, wpisany tekst zostaje, ponowienie wysyła tę samą odpowiedź", async () => {
    const { uzytkownik } = await otworzPierwsze();
    api.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(ODPOWIEDZIANE);

    await uzytkownik.type(screen.getByRole("textbox", { name: /^Odpowiedź/ }), ODPOWIEDZ);
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij odpowiedź" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Nie udało się wysłać odpowiedzi");
    expect(screen.getByRole("textbox", { name: /^Odpowiedź/ })).toHaveValue(ODPOWIEDZ);

    await uzytkownik.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(await screen.findByText("Odpowiedź wysłana.")).toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(2);
    expect(api).toHaveBeenLastCalledWith("/instructor/questions/11/answer", { method: "POST", body: { answer: ODPOWIEDZ } });
  });

  it("„Wróć do listy” zamyka formularz bez wysyłki i przywraca listę", async () => {
    const { uzytkownik } = await otworzPierwsze();

    await uzytkownik.click(screen.getByRole("button", { name: "Wróć do listy" }));

    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.getByText(PYTANIE_PIERWSZE.question)).toBeInTheDocument();
    expect(przyciskiOdpowiedz()).toHaveLength(2);
    expect(api).not.toHaveBeenCalled();
  });
});

describe("Skrzynka pytań — filtr widoku i podgląd odpowiedzi", () => {
  /** Zwraca dane zależnie od adresu: bez `answered` — wszystkie, z `answered=false` — bez odpowiedzi. */
  function odpowiadajWgAdresu(bezOdpowiedzi: StronaPytan, wszystkie: StronaPytan) {
    apiPaged.mockImplementation((adres: string) => Promise.resolve(adres.includes("answered=false") ? bezOdpowiedzi : wszystkie));
  }

  async function wybierzWidok(uzytkownik: ReturnType<typeof userEvent.setup>, etykieta: string) {
    await uzytkownik.click(screen.getByRole("combobox", { name: "Które pytania pokazać" }));
    await uzytkownik.click(screen.getByRole("option", { name: etykieta }));
  }

  it("domyślnie „Tylko nieodpowiedziane” (jak na poprzedniej stronie): filtr to pole wyboru, nie surowy przycisk, z dwiema opcjami", async () => {
    const uzytkownik = userEvent.setup();
    odpowiadajWgAdresu(DWA_PYTANIA, WSZYSTKIE);
    const { container } = render(<SkrzynkaPytan />);

    await screen.findByText(PYTANIE_PIERWSZE.question);
    const filtr = screen.getByRole("combobox", { name: "Które pytania pokazać" });
    expect(filtr).toHaveTextContent("Tylko nieodpowiedziane");
    expect(apiPaged).toHaveBeenCalledTimes(1);
    expect(apiPaged).toHaveBeenCalledWith("/instructor/questions?answered=false&page=1");
    expect(container.querySelector("select")).toBeNull();

    await uzytkownik.click(filtr);
    expect(screen.getAllByRole("option").map((opcja) => opcja.textContent)).toEqual(["Tylko nieodpowiedziane", "Pokaż wszystkie"]);
  });

  it("zmiana filtra zmienia listę: „Pokaż wszystkie” prosi bez parametru answered i pokazuje pytania z odpowiedzią; powrót przywraca samą kolejkę", async () => {
    const uzytkownik = userEvent.setup();
    odpowiadajWgAdresu(DWA_PYTANIA, WSZYSTKIE);
    const { container } = render(<SkrzynkaPytan />);

    await screen.findByText(PYTANIE_DRUGIE.question);
    expect(screen.getByText("Pytania bez odpowiedzi")).toBeInTheDocument();

    await wybierzWidok(uzytkownik, "Pokaż wszystkie");

    expect(await screen.findByText("Wszystkie pytania")).toBeInTheDocument();
    expect(apiPaged).toHaveBeenLastCalledWith("/instructor/questions?page=1");
    expect(apiPaged.mock.calls.at(-1)?.[0]).not.toContain("answered");
    expect(screen.getByRole("combobox", { name: "Które pytania pokazać" })).toHaveTextContent("Pokaż wszystkie");
    expect(screen.queryByText(PYTANIE_DRUGIE.question)).toBeNull();
    expect(screen.getByText(ODPOWIEDZIANE_Z_HTML.question)).toBeInTheDocument();
    expect(screen.getByText("Odpowiedziane")).toBeInTheDocument();
    expect(screen.getByText("Oczekuje")).toBeInTheDocument();
    expect(screen.getByText("1 pytanie bez odpowiedzi")).toBeInTheDocument();
    expect(przyciskiOdpowiedz()).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Zobacz odpowiedź" })).toHaveLength(1);
    sprawdzSzablon(container);

    await wybierzWidok(uzytkownik, "Tylko nieodpowiedziane");

    expect(await screen.findByText("Pytania bez odpowiedzi")).toBeInTheDocument();
    expect(apiPaged).toHaveBeenLastCalledWith("/instructor/questions?answered=false&page=1");
    expect(screen.getByText(PYTANIE_DRUGIE.question)).toBeInTheDocument();
    expect(screen.queryByText(ODPOWIEDZIANE_Z_HTML.question)).toBeNull();
  });

  it("próba kontrolna filtra: listy obu widoków różnią się treścią, więc sprawdzenie zmiany listy nie przechodzi trywialnie", () => {
    const tekstyBez = DWA_PYTANIA.data.map((p) => p.question).sort();
    const tekstyWszystkie = WSZYSTKIE.data.map((p) => p.question).sort();
    expect(tekstyBez).not.toEqual(tekstyWszystkie);
  });

  it("stronicowanie w widoku „Pokaż wszystkie” używa tego widoku (bez answered)", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockImplementation((adres: string) =>
      Promise.resolve({
        data: [adres.includes("answered=false") ? PYTANIE_PIERWSZE : ODPOWIEDZIANE_Z_HTML],
        meta: { current_page: 1, per_page: 1, total: 2, last_page: 2, extra: { unanswered: 1 } },
      } satisfies StronaPytan),
    );
    render(<SkrzynkaPytan />);

    await screen.findByText(PYTANIE_PIERWSZE.question);
    await wybierzWidok(uzytkownik, "Pokaż wszystkie");
    await screen.findByText(ODPOWIEDZIANE_Z_HTML.question);
    await uzytkownik.click(screen.getByRole("button", { name: "Następna" }));

    await waitFor(() => expect(apiPaged).toHaveBeenLastCalledWith("/instructor/questions?page=2"));
  });

  it("odpowiedź pokazana jako dosłowny tekst: zero elementów i zero wykonania z HTML w odpowiedzi, bez formularza i bez przycisku głównego", async () => {
    const uzytkownik = userEvent.setup();
    odpowiadajWgAdresu(DWA_PYTANIA, WSZYSTKIE);
    const { container } = render(<SkrzynkaPytan />);

    await screen.findByText(PYTANIE_DRUGIE.question);
    await wybierzWidok(uzytkownik, "Pokaż wszystkie");
    await screen.findByText(ODPOWIEDZIANE_Z_HTML.question);
    await uzytkownik.click(screen.getByRole("button", { name: "Zobacz odpowiedź" }));

    expect(screen.getByRole("heading", { level: 2, name: "Twoja odpowiedź" })).toBeInTheDocument();
    expect(screen.getByText(ODPOWIEDZ_Z_HTML)).toBeInTheDocument();
    expect(screen.getByText(ODPOWIEDZIANE_Z_HTML.question)).toBeInTheDocument();
    expect(screen.getByText(/30\.09\.2026/)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect("zlo" in window).toBe(false);
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Wyślij odpowiedź" })).toBeNull();
    expect(przyciskiGlowne(container)).toHaveLength(0);
    sprawdzSzablon(container);

    await uzytkownik.click(screen.getByRole("button", { name: "Wróć do listy" }));
    expect(screen.getByText("Wszystkie pytania")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Które pytania pokazać" })).toHaveTextContent("Pokaż wszystkie");
    expect(api).not.toHaveBeenCalled();
  });

  it("próba kontrolna odpowiedzi: to samo sprawdzenie widzi element, gdy odpowiedź jest naprawdę wstrzyknięta jako HTML", () => {
    const { container } = render(<div dangerouslySetInnerHTML={{ __html: ODPOWIEDZ_Z_HTML }} />);
    expect(container.querySelector("img")).not.toBeNull();
    expect(container.querySelector("b")).not.toBeNull();
  });

  it("w widoku „Pokaż wszystkie” pytanie zostaje po odpowiedzi, z odpowiedzią, licznik maleje, Toast potwierdza; lista nie jest wczytywana ponownie", async () => {
    const uzytkownik = userEvent.setup();
    odpowiadajWgAdresu(DWA_PYTANIA, WSZYSTKIE);
    api.mockResolvedValue(ODPOWIEDZIANE);
    const { container } = render(<SkrzynkaPytan />);

    await screen.findByText(PYTANIE_PIERWSZE.question);
    await wybierzWidok(uzytkownik, "Pokaż wszystkie");
    await screen.findByText("Wszystkie pytania");
    const wywolanPrzed = apiPaged.mock.calls.length;
    await uzytkownik.click(przyciskiOdpowiedz()[0]);
    await uzytkownik.type(screen.getByRole("textbox", { name: /^Odpowiedź/ }), ODPOWIEDZ);
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij odpowiedź" }));

    expect(await screen.findByText("Odpowiedź wysłana.")).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith("/instructor/questions/11/answer", { method: "POST", body: { answer: ODPOWIEDZ } });
    expect(screen.getByText(PYTANIE_PIERWSZE.question)).toBeInTheDocument();
    expect(screen.getByText("0 pytań bez odpowiedzi")).toBeInTheDocument();
    expect(przyciskiOdpowiedz()).toHaveLength(0);
    expect(screen.getAllByRole("button", { name: "Zobacz odpowiedź" })).toHaveLength(2);
    expect(apiPaged).toHaveBeenCalledTimes(wywolanPrzed);
    sprawdzSzablon(container);

    await uzytkownik.click(screen.getAllByRole("button", { name: "Zobacz odpowiedź" })[0]);
    expect(screen.getByText(ODPOWIEDZ)).toBeInTheDocument();
  });

  it("osobne stany puste: bez odpowiedzi — „Brak pytań bez odpowiedzi”, wszystkie — „Nie masz jeszcze żadnych pytań”", async () => {
    const uzytkownik = userEvent.setup();
    odpowiadajWgAdresu(PUSTA_SKRZYNKA, NIC_NIE_ZADANO);
    const { container } = render(<SkrzynkaPytan />);

    expect(await screen.findByText("Brak pytań bez odpowiedzi")).toBeInTheDocument();
    expect(screen.queryByText("Nie masz jeszcze żadnych pytań")).toBeNull();

    await wybierzWidok(uzytkownik, "Pokaż wszystkie");

    expect(await screen.findByText("Nie masz jeszcze żadnych pytań")).toBeInTheDocument();
    expect(screen.queryByText("Brak pytań bez odpowiedzi")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Które pytania pokazać" })).toHaveTextContent("Pokaż wszystkie");
    sprawdzSzablon(container);
  });

  it("jeden main i najwyżej jeden przycisk główny w stanach widoku: ładowanie, błąd, dane", async () => {
    const uzytkownik = userEvent.setup();
    odpowiadajWgAdresu(DWA_PYTANIA, WSZYSTKIE);
    const { container } = render(<SkrzynkaPytan />);
    await screen.findByText(PYTANIE_PIERWSZE.question);

    apiPaged.mockReturnValue(new Promise(() => {}));
    await wybierzWidok(uzytkownik, "Pokaż wszystkie");
    sprawdzSzablon(container);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(przyciskiGlowne(container).length).toBeLessThanOrEqual(1);

    apiPaged.mockRejectedValue(new TypeError("Failed to fetch"));
    await wybierzWidok(uzytkownik, "Tylko nieodpowiedziane");
    expect(await screen.findByRole("alert")).toHaveTextContent("Nie udało się wczytać pytań");
    sprawdzSzablon(container);
    expect(przyciskiGlowne(container).length).toBeLessThanOrEqual(1);
    expect(screen.getByRole("combobox", { name: "Które pytania pokazać" })).toHaveTextContent("Tylko nieodpowiedziane");

    apiPaged.mockResolvedValue(WSZYSTKIE);
    await uzytkownik.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    await screen.findByText(ODPOWIEDZIANE_Z_HTML.question);
    sprawdzSzablon(container);
    expect(przyciskiGlowne(container).length).toBeLessThanOrEqual(1);
  });

  it("odmowa z powodu roli przy zmianie filtra: stan odmowy, zero pytań w DOM", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockResolvedValueOnce(DWA_PYTANIA);
    const { container } = render(<SkrzynkaPytan />);
    await screen.findByText(PYTANIE_PIERWSZE.question);

    apiPaged.mockRejectedValue(new ApiError({ status: 403, code: "forbidden", message: "Nie masz dostępu do tej sekcji." }));
    await wybierzWidok(uzytkownik, "Pokaż wszystkie");

    expect(await screen.findByText(/prowadzących/)).toBeInTheDocument();
    expect(container.textContent).not.toContain(PYTANIE_PIERWSZE.question);
    sprawdzSzablon(container);
  });
});
