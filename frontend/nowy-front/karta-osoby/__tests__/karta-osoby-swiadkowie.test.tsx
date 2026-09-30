import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";

/**
 * Świadkowie ekranu A-07 „Karta osoby” (H18/H07, administracja): pięć stanów
 * (KO-8: ładowanie, dane, osoba bez postępu, błąd jednej z tras, brak
 * uprawnień, 404, po zapisaniu), sekcje rzadkie zwinięte z licznikiem,
 * formularz „Zmień dane” (bez pola roli, 422 przy polu, sukces → ponowny
 * odczyt) i brak odczytu ładunku dziennika — każdy z kontrolą dodatnią.
 */

const pobierzKarteOsoby = vi.fn();
const pobierzRzetelnoscOsoby = vi.fn();
const zapiszKarteOsoby = vi.fn();
const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("../dane", async () => {
  const rzeczywiste = await vi.importActual<typeof import("../dane")>("../dane");
  return {
    ...rzeczywiste,
    pobierzKarteOsoby: (...args: unknown[]) => pobierzKarteOsoby(...args),
    pobierzRzetelnoscOsoby: (...args: unknown[]) => pobierzRzetelnoscOsoby(...args),
    zapiszKarteOsoby: (...args: unknown[]) => zapiszKarteOsoby(...args),
  };
});

const { ApiError } = await import("@/lib/api/klient");
const { KartaOsoby } = await import("../KartaOsoby");

const PROFIL = {
  id: 17,
  first_name: "Marta",
  last_name: "Demo",
  email: "marta@demo.pl",
  role: "volunteer",
  phone: "+48 600 100 200",
  pesel: "90010112345",
  address: { street: "Polna 1", city: "Warszawa", zip: "00-001" },
  access_expires_at: "2027-02-01T00:00:00Z",
  program_completed_at: null,
  product_group: "psychon",
};

const KARTA: unknown = {
  profile: PROFIL,
  progress: {
    courses_done: 8,
    courses_total: 10,
    hours_accepted: "41.5",
    supervision_present: 5,
    workshop_done: true,
    path_tests_passed: 3,
    path_tests_total: 4,
  },
  recent_notifications: [
    { id: 1, type: "internship.returned", title: "Wpis odesłany", body: "…", link: null, read_at: null, created_at: "2026-09-20T10:00:00Z" },
  ],
  audit_entries: [
    // `details` obecne w SUROWEJ odpowiedzi (jak w prawdziwym API,
    // `AdminUserCardResource.php:73`) — kontrola dodatnia dolna: gdyby ekran
    // czytał to pole, marker niżej byłby widoczny w dokumencie.
    {
      id: 501,
      action: "user.updated",
      actor_id: 3,
      created_at: "2026-09-21T09:00:00Z",
      details: { changed: ["TAJNY-LADUNEK-NIE-POKAZYWAC"] },
    },
  ],
};

const KARTA_ZERA: unknown = {
  profile: PROFIL,
  progress: {
    courses_done: 0,
    courses_total: 10,
    hours_accepted: "0",
    supervision_present: 0,
    workshop_done: false,
    path_tests_passed: 0,
    path_tests_total: 4,
  },
  recent_notifications: [],
  audit_entries: [],
};

const RZETELNOSC = { reliability_percent: "40", below_threshold: true };

beforeEach(() => {
  pobierzKarteOsoby.mockReset();
  pobierzRzetelnoscOsoby.mockReset();
  zapiszKarteOsoby.mockReset();
  back.mockReset();
});

describe("KartaOsoby — stan ładowanie", () => {
  it("pokazuje szkielet, zanim odpowiedź wróci", () => {
    pobierzKarteOsoby.mockReturnValue(new Promise(() => {}));
    render(<KartaOsoby id={17} />);
    expect(screen.getByRole("heading", { name: "Karta osoby" })).toBeInTheDocument();
    expect(screen.getByTestId("obszar-tabela")).toBeInTheDocument();
  });
});

describe("KartaOsoby — stan dane", () => {
  it("filary, dane kontaktowe i data wygaśnięcia dostępu renderują się z odpowiedzi", async () => {
    pobierzKarteOsoby.mockResolvedValue(KARTA);
    pobierzRzetelnoscOsoby.mockResolvedValue(RZETELNOSC);

    render(<KartaOsoby id={17} />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Marta Demo" })).toBeInTheDocument());
    expect(screen.getByText("+48 600 100 200")).toBeInTheDocument();
    expect(screen.getByText("1 lutego 2027")).toBeInTheDocument();
    expect(screen.getByText("Dostęp do materiałów do")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zmień dane" })).toBeInTheDocument();
  });

  it("grupa produktowa i data dostępu: etykieta polska, zero surowego kodu i zero ISO w DOM stanu z danymi", async () => {
    pobierzKarteOsoby.mockResolvedValue(KARTA);
    pobierzRzetelnoscOsoby.mockResolvedValue(RZETELNOSC);
    const { container } = render(<KartaOsoby id={17} />);
    await screen.findByRole("heading", { name: "Marta Demo" });
    const tabela = within(screen.getByTestId("obszar-tabela")).getByRole("table");
    expect(within(tabela).getByText("PsychON")).toBeInTheDocument();
    expect(within(tabela).getByText("1 lutego 2027")).toBeInTheDocument();
    expect(container.textContent).not.toContain("psychon");
    expect(container.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("obca grupa produktowa: „—”, surowy kod nie trafia do DOM", async () => {
    const karta = { ...(KARTA as object), profile: { ...PROFIL, product_group: "obca_grupa" } };
    pobierzKarteOsoby.mockResolvedValue(karta);
    pobierzRzetelnoscOsoby.mockResolvedValue(RZETELNOSC);
    const { container } = render(<KartaOsoby id={17} />);
    await screen.findByRole("heading", { name: "Marta Demo" });
    const tabela = within(screen.getByTestId("obszar-tabela")).getByRole("table");
    const wiersz = within(tabela).getByText("Grupa produktowa").closest('[role="row"]');
    expect(wiersz).not.toBeNull();
    expect(within(wiersz as HTMLElement).getByText("—")).toBeInTheDocument();
    expect(container.textContent).not.toContain("obca_grupa");
  });

  it("po rozwinięciu sekcji rzadkich zero surowego ISO (powiadomienia i dziennik przez wspólny formater)", async () => {
    pobierzKarteOsoby.mockResolvedValue(KARTA);
    pobierzRzetelnoscOsoby.mockResolvedValue(RZETELNOSC);
    const uzytkownik = userEvent.setup();
    const { container } = render(<KartaOsoby id={17} />);
    await screen.findByRole("heading", { name: "Marta Demo" });
    await uzytkownik.click(screen.getByRole("button", { name: "Powiadomienia (1)" }));
    await uzytkownik.click(screen.getByRole("button", { name: "Dziennik działań (1)" }));
    expect(screen.getByText(/21 września 2026/)).toBeInTheDocument();
    expect(screen.getByText(/20 września 2026/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("kontrola dodatnia: osoba bez postępu pokazuje zera z karty, nie stan pusty", async () => {
    pobierzKarteOsoby.mockResolvedValue(KARTA_ZERA);
    pobierzRzetelnoscOsoby.mockRejectedValue(new ApiError({ status: 404, code: "not_found", message: "Nie znaleziono osoby." }));

    render(<KartaOsoby id={18} />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Marta Demo" })).toBeInTheDocument());
    // Godziny stażu / superwizje / warsztat = 0 (liczba), nie „—”: co najmniej
    // trzy kafle niosą "0" jako widoczną liczbę, żaden kafel z realnym zerem
    // nie pokazuje etykiety braku danych.
    expect(screen.getAllByText("0", { selector: "span" }).length).toBeGreaterThanOrEqual(3);
  });

  it("kontrola dodatnia: ekran renderuje uklad TableTemplate (bez tego komponentu ten swiadek jest czerwony)", async () => {
    pobierzKarteOsoby.mockResolvedValue(KARTA);
    pobierzRzetelnoscOsoby.mockResolvedValue(RZETELNOSC);

    const { container } = render(<KartaOsoby id={17} />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Marta Demo" })).toBeInTheDocument());

    const szablon = container.querySelector('[data-style-id="szablon-tabela"]');
    expect(szablon).not.toBeNull();
    const obszarTabeli = screen.getByTestId("obszar-tabela");
    expect(within(obszarTabeli).getByRole("table")).toBeInTheDocument();
  });
});

const SZABLON = '[data-style-id="szablon-tabela"]';

function opisStanu(nazwa: string, przygotuj: () => void, czekaj: () => Promise<unknown>) {
  it(`stan ${nazwa}: jeden main z celem skip-linku i szablon tabelaryczny w DOM`, async () => {
    przygotuj();
    const { container } = render(<KartaOsoby id={17} />);
    await czekaj();
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector(SZABLON)).not.toBeNull();
    expect(screen.getByTestId("obszar-tabela")).toBeInTheDocument();
  });
}

describe("KartaOsoby — jeden main i szablon w każdym stanie", () => {
  opisStanu(
    "ładowanie",
    () => pobierzKarteOsoby.mockReturnValue(new Promise(() => {})),
    async () => expect(screen.getByRole("heading", { name: "Karta osoby" })).toBeInTheDocument(),
  );
  opisStanu(
    "dane",
    () => {
      pobierzKarteOsoby.mockResolvedValue(KARTA);
      pobierzRzetelnoscOsoby.mockResolvedValue(RZETELNOSC);
    },
    () => screen.findByRole("heading", { name: "Marta Demo" }),
  );
  opisStanu(
    "błąd sieci",
    () => pobierzKarteOsoby.mockRejectedValue(new ApiError({ status: 500, code: "unknown_error", message: "Błąd serwera." })),
    () => screen.findByText("Nie udało się wczytać karty osoby"),
  );
  opisStanu(
    "brak uprawnień (403)",
    () => pobierzKarteOsoby.mockRejectedValue(new ApiError({ status: 403, code: "forbidden", message: "Nie masz dostępu do tego zasobu." })),
    () => screen.findByText(/tylko dla administracji/),
  );
  opisStanu(
    "brak uprawnień (401)",
    () => pobierzKarteOsoby.mockRejectedValue(new ApiError({ status: 401, code: "unauthenticated", message: "Zaloguj się ponownie." })),
    () => screen.findByText(/tylko dla administracji/),
  );
  opisStanu(
    "nie znaleziono (404)",
    () => pobierzKarteOsoby.mockRejectedValue(new ApiError({ status: 404, code: "not_found", message: "Nie znaleziono osoby." })),
    () => screen.findByText("Nie znaleziono osoby."),
  );

  it("stan po zapisie: Toast obok szablonu, nadal jeden main", async () => {
    pobierzKarteOsoby.mockResolvedValueOnce(KARTA).mockResolvedValueOnce(KARTA_ZERA);
    pobierzRzetelnoscOsoby.mockResolvedValue(RZETELNOSC);
    zapiszKarteOsoby.mockResolvedValue(KARTA_ZERA);
    const uzytkownik = userEvent.setup();
    const { container } = render(<KartaOsoby id={17} />);
    await uzytkownik.click(await screen.findByRole("button", { name: "Zmień dane" }));
    await uzytkownik.click(within(await screen.findByRole("form", { name: "Dane osoby" })).getByRole("button", { name: "Zapisz zmiany" }));
    expect(await screen.findByText("Zapisano zmiany.")).toBeInTheDocument();
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector(SZABLON)).not.toBeNull();
  });

  it("błąd sieci: „Spróbuj ponownie” wczytuje kartę jeszcze raz", async () => {
    pobierzKarteOsoby
      .mockRejectedValueOnce(new ApiError({ status: 500, code: "unknown_error", message: "Błąd serwera." }))
      .mockResolvedValueOnce(KARTA);
    pobierzRzetelnoscOsoby.mockResolvedValue(RZETELNOSC);
    const uzytkownik = userEvent.setup();
    render(<KartaOsoby id={17} />);
    await uzytkownik.click(await screen.findByRole("button", { name: "Spróbuj ponownie" }));
    expect(await screen.findByRole("heading", { name: "Marta Demo" })).toBeInTheDocument();
    expect(pobierzKarteOsoby).toHaveBeenCalledTimes(2);
  });

  it("kontrola dodatnia: dwa `main` albo brak szablonu dają czerwień", () => {
    const podwojny = document.createElement("div");
    podwojny.innerHTML = '<main id="tresc" tabindex="-1"></main><main id="tresc" tabindex="-1"></main>';
    expect(() => jedenMain(podwojny)).toThrow();
    const bezSzablonu = document.createElement("div");
    bezSzablonu.innerHTML = '<main id="tresc" tabindex="-1"></main>';
    expect(bezSzablonu.querySelector(SZABLON)).toBeNull();
  });
});

describe("KartaOsoby — jeden rząd przycisków w edycji", () => {
  const liczPrzyciski = (korzen: ParentNode) => ({
    zapisz: Array.from(korzen.querySelectorAll("button")).filter((przycisk) => /^Zapisz zmiany$/.test(przycisk.textContent ?? "")).length,
    anuluj: Array.from(korzen.querySelectorAll("button")).filter((przycisk) => /^Anuluj$/.test(przycisk.textContent ?? "")).length,
  });

  it("w stanie edycji jest dokładnie jeden przycisk zapisu i jeden anulowania, bez okna dialogowego", async () => {
    pobierzKarteOsoby.mockResolvedValue(KARTA);
    pobierzRzetelnoscOsoby.mockResolvedValue(RZETELNOSC);
    const uzytkownik = userEvent.setup();
    const { container } = render(<KartaOsoby id={17} />);
    await uzytkownik.click(await screen.findByRole("button", { name: "Zmień dane" }));
    await screen.findByRole("form", { name: "Dane osoby" });

    expect(liczPrzyciski(document.body)).toEqual({ zapisz: 1, anuluj: 1 });
    expect(screen.queryByRole("dialog")).toBeNull();
    // Jeden przycisk główny: „Zmień dane” znika na czas edycji.
    expect(screen.queryByRole("button", { name: "Zmień dane" })).toBeNull();
    // Formularz siedzi w obszarze tabeli szablonu.
    expect(within(screen.getByTestId("obszar-tabela")).getByRole("form", { name: "Dane osoby" })).toBeInTheDocument();
    expect(() => jedenMain(container)).not.toThrow();
  });

  it("otwarcie edycji przenosi fokus na pierwsze pole formularza (sekcja otwierana działaniem)", async () => {
    pobierzKarteOsoby.mockResolvedValue(KARTA);
    pobierzRzetelnoscOsoby.mockResolvedValue(RZETELNOSC);
    const uzytkownik = userEvent.setup();
    render(<KartaOsoby id={17} />);
    await uzytkownik.click(await screen.findByRole("button", { name: "Zmień dane" }));
    const formularz = await screen.findByRole("form", { name: "Dane osoby" });
    const pierwsze = formularz.querySelector<HTMLElement>("input, textarea, button, [role='combobox']");
    expect(pierwsze).not.toBeNull();
    expect(pierwsze).toHaveFocus();
  });

  it("Anuluj zamyka edycję i wraca „Zmień dane” z tabelą danych", async () => {
    pobierzKarteOsoby.mockResolvedValue(KARTA);
    pobierzRzetelnoscOsoby.mockResolvedValue(RZETELNOSC);
    const uzytkownik = userEvent.setup();
    render(<KartaOsoby id={17} />);
    await uzytkownik.click(await screen.findByRole("button", { name: "Zmień dane" }));
    await uzytkownik.click(within(await screen.findByRole("form", { name: "Dane osoby" })).getByRole("button", { name: "Anuluj" }));
    expect(await screen.findByRole("button", { name: "Zmień dane" })).toBeInTheDocument();
    expect(within(screen.getByTestId("obszar-tabela")).getByRole("table")).toBeInTheDocument();
    expect(zapiszKarteOsoby).not.toHaveBeenCalled();
  });

  it("kontrola dodatnia licznika: dwa rzędy przycisków dają wynik 2", () => {
    const podwojny = document.createElement("div");
    podwojny.innerHTML = "<button>Zapisz zmiany</button><button>Anuluj</button><button>Zapisz zmiany</button><button>Anuluj</button>";
    expect(liczPrzyciski(podwojny)).toEqual({ zapisz: 2, anuluj: 2 });
  });
});

describe("KartaOsoby — rola w nagłówku", () => {
  it("nagłówek pokazuje etykietę polską roli, bez surowego kodu", async () => {
    pobierzKarteOsoby.mockResolvedValue(KARTA);
    pobierzRzetelnoscOsoby.mockResolvedValue(RZETELNOSC);
    const { container } = render(<KartaOsoby id={17} />);
    await screen.findByRole("heading", { name: "Marta Demo" });
    expect(screen.getByText("Rola: Wolontariusz")).toBeInTheDocument();
    expect(container.textContent).not.toContain("volunteer");
  });

  it("rola spoza słownika: bez pary „Rola”, surowy kod nie trafia do dokumentu", async () => {
    const karta = { ...(KARTA as object), profile: { ...PROFIL, role: "obca_rola" } };
    pobierzKarteOsoby.mockResolvedValue(karta);
    pobierzRzetelnoscOsoby.mockResolvedValue(RZETELNOSC);
    const { container } = render(<KartaOsoby id={17} />);
    await screen.findByRole("heading", { name: "Marta Demo" });
    expect(screen.queryByText(/^Rola:/)).toBeNull();
    expect(container.textContent).not.toContain("obca_rola");
  });

  it.each(["constructor", "toString", "__proto__"])(
    "rola odziedziczona %s: bez pary „Rola”, surowy kod nie trafia do dokumentu",
    async (klucz) => {
      const profil = JSON.parse(JSON.stringify(PROFIL)) as Record<string, unknown>;
      // `__proto__` jako własny klucz wartości: literał ustawiałby prototyp,
      // dlatego pole roli zapisujemy jawnie przez defineProperty.
      Object.defineProperty(profil, "role", { value: klucz, enumerable: true, writable: true, configurable: true });
      pobierzKarteOsoby.mockResolvedValue({ ...(KARTA as object), profile: profil });
      pobierzRzetelnoscOsoby.mockResolvedValue(RZETELNOSC);
      const { container } = render(<KartaOsoby id={17} />);
      await screen.findByRole("heading", { name: "Marta Demo" });
      expect(screen.queryByText(/^Rola:/)).toBeNull();
      expect(container.textContent).not.toContain(klucz);
    },
  );
});

describe("KartaOsoby — rzetelność", () => {
  it("404 rzetelności: reszta karty działa, bez komunikatu błędu", async () => {
    pobierzKarteOsoby.mockResolvedValue(KARTA);
    pobierzRzetelnoscOsoby.mockRejectedValue(new ApiError({ status: 404, code: "not_found", message: "Nie znaleziono osoby." }));

    render(<KartaOsoby id={17} />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Marta Demo" })).toBeInTheDocument());
    expect(screen.queryByText(/Nie udało się pobrać rzetelności/)).toBeNull();
  });

  it("błąd inny niż 404 na trasie rzetelności → Notice w tym obszarze, reszta karty działa", async () => {
    pobierzKarteOsoby.mockResolvedValue(KARTA);
    pobierzRzetelnoscOsoby.mockRejectedValue(new ApiError({ status: 500, code: "unknown_error", message: "Błąd serwera." }));

    render(<KartaOsoby id={17} />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Marta Demo" })).toBeInTheDocument());
    expect(await screen.findByText(/Nie udało się pobrać rzetelności/)).toBeInTheDocument();
    // Kontrola dodatnia: reszta ekranu (przycisk główny) nadal działa.
    expect(screen.getByRole("button", { name: "Zmień dane" })).toBeInTheDocument();
  });
});

describe("KartaOsoby — 404 karty i brak uprawnień", () => {
  it("404 karty → stan „nie znaleziono”", async () => {
    pobierzKarteOsoby.mockRejectedValue(new ApiError({ status: 404, code: "not_found", message: "Nie znaleziono osoby." }));
    render(<KartaOsoby id={999} />);
    expect(await screen.findByText("Nie znaleziono osoby.")).toBeInTheDocument();
  });

  it("403 → stan brak uprawnień, tak jak inne ekrany administracji nowego frontu", async () => {
    pobierzKarteOsoby.mockRejectedValue(new ApiError({ status: 403, code: "forbidden", message: "Nie masz dostępu do tego zasobu." }));
    render(<KartaOsoby id={17} />);
    expect(await screen.findByText(/tylko dla administracji/)).toBeInTheDocument();
  });

  it("401 → ten sam stan brak uprawnień co 403", async () => {
    pobierzKarteOsoby.mockRejectedValue(new ApiError({ status: 401, code: "unauthenticated", message: "Zaloguj się ponownie." }));
    render(<KartaOsoby id={17} />);
    expect(await screen.findByText(/tylko dla administracji/)).toBeInTheDocument();
  });
});

describe("KartaOsoby — sekcje rzadkie zwinięte z licznikiem", () => {
  it("powiadomienia i dziennik startują zwinięte, licznik = długość tablicy z karty", async () => {
    pobierzKarteOsoby.mockResolvedValue(KARTA);
    pobierzRzetelnoscOsoby.mockResolvedValue(RZETELNOSC);
    render(<KartaOsoby id={17} />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Marta Demo" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Powiadomienia (1)" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Dziennik działań (1)" })).toHaveAttribute("aria-expanded", "false");
  });

  it("brak odczytu ładunku dziennika: rozwinięty wpis pokazuje rodzaj/czas/wykonawcę, NIGDY treść pola `details`", async () => {
    pobierzKarteOsoby.mockResolvedValue(KARTA);
    pobierzRzetelnoscOsoby.mockResolvedValue(RZETELNOSC);
    const uzytkownik = userEvent.setup();

    render(<KartaOsoby id={17} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Marta Demo" })).toBeInTheDocument());

    await uzytkownik.click(screen.getByRole("button", { name: "Dziennik działań (1)" }));

    // Kontrola dodatnia: pola DOZWOLONE są widoczne (renderowanie działa).
    expect(screen.getByText("user.updated")).toBeInTheDocument();
    expect(screen.getByText(/21 września 2026, 11:00/)).toBeInTheDocument();
    expect(screen.getByText(/kto: 3/)).toBeInTheDocument();
    // Ładunek zdarzenia NIGDY nie trafia do dokumentu.
    expect(screen.queryByText(/TAJNY-LADUNEK-NIE-POKAZYWAC/)).toBeNull();
  });
});

describe("KartaOsoby — wpis dziennika bez czasu", () => {
  it("brak czasu wpisu to „—” z wspólnego formatera, nie własny napis i nie surowy null", async () => {
    const karta = {
      ...(KARTA as object),
      audit_entries: [{ id: 502, action: "user.updated", actor_id: 7, created_at: null }],
    };
    pobierzKarteOsoby.mockResolvedValue(karta);
    pobierzRzetelnoscOsoby.mockResolvedValue(RZETELNOSC);
    const uzytkownik = userEvent.setup();
    const { container } = render(<KartaOsoby id={17} />);
    await screen.findByRole("heading", { name: "Marta Demo" });
    await uzytkownik.click(screen.getByRole("button", { name: "Dziennik działań (1)" }));
    expect(screen.getByText("— — kto: 7")).toBeInTheDocument();
    expect(container.textContent).not.toContain("brak daty");
    expect(container.textContent).not.toContain("null");
  });
});

describe("KartaOsoby — formularz „Zmień dane”", () => {
  it("brak pola roli w formularzu (kontrola dodatnia: inne pola obecne)", async () => {
    pobierzKarteOsoby.mockResolvedValue(KARTA);
    pobierzRzetelnoscOsoby.mockResolvedValue(RZETELNOSC);
    const uzytkownik = userEvent.setup();

    render(<KartaOsoby id={17} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Marta Demo" })).toBeInTheDocument());
    await uzytkownik.click(screen.getByRole("button", { name: "Zmień dane" }));

    const formularz = await screen.findByRole("form", { name: "Dane osoby" });
    expect(within(formularz).getByLabelText(/^Imię/)).toBeInTheDocument();
    expect(within(formularz).queryByLabelText(/^Rola/)).toBeNull();
    expect(within(formularz).queryByRole("combobox", { name: /^Rola/ })).toBeNull();
  });

  it("422 → błąd przy polu (ciało zapisu bez pola role)", async () => {
    pobierzKarteOsoby.mockResolvedValue(KARTA);
    pobierzRzetelnoscOsoby.mockResolvedValue(RZETELNOSC);
    zapiszKarteOsoby.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "validation_failed",
        message: "Popraw zaznaczone pola.",
        errors: { email: ["Podaj poprawny adres e-mail."] },
      }),
    );
    const uzytkownik = userEvent.setup();

    render(<KartaOsoby id={17} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Marta Demo" })).toBeInTheDocument());
    await uzytkownik.click(screen.getByRole("button", { name: "Zmień dane" }));

    const formularz = await screen.findByRole("form", { name: "Dane osoby" });
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Zapisz zmiany" }));

    expect(await screen.findByText("Podaj poprawny adres e-mail.")).toBeInTheDocument();
    expect(zapiszKarteOsoby).toHaveBeenCalledWith(17, expect.not.objectContaining({ role: expect.anything() }));
    // 422 to błąd pola, nie komunikat o awarii zapisu.
    expect(screen.queryByText("Nie udało się zapisać zmian")).toBeNull();
  });

  describe.each([
    ["błąd serwera 500", () => new ApiError({ status: 500, code: "unknown_error", message: "Błąd serwera." })],
    ["odrzucenie sieci", () => new TypeError("Failed to fetch")],
  ])("zapis: %s", (_nazwa, blad) => {
    it("formularz zostaje otwarty z danymi, Notice z ponowieniem; ponowienie zapisuje", async () => {
      pobierzKarteOsoby.mockResolvedValueOnce(KARTA).mockResolvedValueOnce(KARTA_ZERA);
      pobierzRzetelnoscOsoby.mockResolvedValue(RZETELNOSC);
      zapiszKarteOsoby.mockRejectedValueOnce(blad()).mockResolvedValueOnce(KARTA_ZERA);
      const uzytkownik = userEvent.setup();

      render(<KartaOsoby id={17} />);
      await uzytkownik.click(await screen.findByRole("button", { name: "Zmień dane" }));
      const formularz = await screen.findByRole("form", { name: "Dane osoby" });
      const nazwisko = within(formularz).getByLabelText(/^Nazwisko/);
      await uzytkownik.clear(nazwisko);
      await uzytkownik.type(nazwisko, "Zmienione");
      await uzytkownik.click(within(formularz).getByRole("button", { name: "Zapisz zmiany" }));

      const komunikat = await screen.findByRole("alert");
      expect(within(komunikat).getByText("Nie udało się zapisać zmian")).toBeInTheDocument();
      // Formularz otwarty, dane wpisane zachowane, bez Toastu sukcesu.
      expect(screen.getByRole("form", { name: "Dane osoby" })).toBeInTheDocument();
      expect(screen.getByLabelText(/^Nazwisko/)).toHaveValue("Zmienione");
      expect(screen.queryByText("Zapisano zmiany.")).toBeNull();
      expect(zapiszKarteOsoby).toHaveBeenCalledTimes(1);
      expect(pobierzKarteOsoby).toHaveBeenCalledTimes(1);

      await uzytkownik.click(within(komunikat).getByRole("button", { name: "Spróbuj ponownie" }));
      expect(await screen.findByText("Zapisano zmiany.")).toBeInTheDocument();
      expect(zapiszKarteOsoby).toHaveBeenCalledTimes(2);
      expect(zapiszKarteOsoby).toHaveBeenLastCalledWith(17, expect.objectContaining({ last_name: "Zmienione" }));
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("Anuluj po błędzie zamyka formularz i gasi komunikat", async () => {
      pobierzKarteOsoby.mockResolvedValue(KARTA);
      pobierzRzetelnoscOsoby.mockResolvedValue(RZETELNOSC);
      zapiszKarteOsoby.mockRejectedValue(blad());
      const uzytkownik = userEvent.setup();

      render(<KartaOsoby id={17} />);
      await uzytkownik.click(await screen.findByRole("button", { name: "Zmień dane" }));
      const formularz = await screen.findByRole("form", { name: "Dane osoby" });
      await uzytkownik.click(within(formularz).getByRole("button", { name: "Zapisz zmiany" }));
      await screen.findByRole("alert");
      await uzytkownik.click(within(screen.getByRole("form", { name: "Dane osoby" })).getByRole("button", { name: "Anuluj" }));
      expect(screen.queryByRole("alert")).toBeNull();
      expect(await screen.findByRole("button", { name: "Zmień dane" })).toBeInTheDocument();
    });
  });

  it("sukces → okno się zamyka, karta wczytuje się ponownie, Toast po zapisaniu", async () => {
    pobierzKarteOsoby.mockResolvedValueOnce(KARTA).mockResolvedValueOnce(KARTA_ZERA);
    pobierzRzetelnoscOsoby.mockResolvedValue(RZETELNOSC);
    zapiszKarteOsoby.mockResolvedValue(KARTA_ZERA);
    const uzytkownik = userEvent.setup();

    render(<KartaOsoby id={17} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Marta Demo" })).toBeInTheDocument());
    await uzytkownik.click(screen.getByRole("button", { name: "Zmień dane" }));

    const formularz = await screen.findByRole("form", { name: "Dane osoby" });
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() => expect(zapiszKarteOsoby).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(pobierzKarteOsoby).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Zapisano zmiany.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
