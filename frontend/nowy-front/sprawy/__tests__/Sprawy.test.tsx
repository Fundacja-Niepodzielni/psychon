import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";

/**
 * Stany ekranu A-02 „Sprawy" (KO-8): ładowanie, dane, pusto („Brak spraw do
 * decyzji"), błąd jednego źródła (Notice + reszta kolejki działa), 403 na
 * wszystkich źródłach naraz (brak dostępu), błąd sieci. Każdy stan jest
 * renderowany w szablonie `ListTemplate` — jeden `main`, znacznik szablonu.
 */

const pobierzKolejkeSpraw = vi.fn();
const push = vi.fn();
const back = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, refresh, push, replace: vi.fn() }),
}));

vi.mock("../dane", async () => {
  const rzeczywiste = await vi.importActual<typeof import("../dane")>("../dane");
  return { ...rzeczywiste, pobierzKolejkeSpraw: (...args: unknown[]) => pobierzKolejkeSpraw(...args) };
});

// Sprawy zgłoszone przez prowadzących mają osobne testy (`sprawy-prowadzacych.test.tsx`);
// tutaj ich odczyt jest atrapą z pustą listą, żeby nie wołał sieci.
const pobierzSprawyProwadzacych = vi.fn();

vi.mock("../dane-prowadzacych", async () => {
  const rzeczywiste = await vi.importActual<typeof import("../dane-prowadzacych")>("../dane-prowadzacych");
  return { ...rzeczywiste, pobierzSprawyProwadzacych: (...args: unknown[]) => pobierzSprawyProwadzacych(...args) };
});

const { Sprawy } = await import("../Sprawy");

const WYNIK_PUSTY = (rodzaj: "applications" | "internship_entries" | "profiles") => ({
  rodzaj,
  pozycje: [],
  blad: null,
  kodBledu: null,
  liczbaCalkowita: 0,
});

beforeEach(() => {
  pobierzSprawyProwadzacych.mockReset();
  pobierzSprawyProwadzacych.mockResolvedValue({ sprawy: [], blad: null, odmowa: false });
  pobierzKolejkeSpraw.mockReset();
  push.mockReset();
  back.mockReset();
  refresh.mockReset();
});

describe("Sprawy — stan ładowania", () => {
  it("pokazuje szkielet przed odpowiedzią źródeł", async () => {
    let rozwiazTest: (wynik: unknown[]) => void = () => {};
    const oczekujaca = new Promise<unknown[]>((rozwiaz) => {
      rozwiazTest = rozwiaz;
    });
    pobierzKolejkeSpraw.mockReturnValue(oczekujaca);

    render(<Sprawy />);
    expect(screen.getByRole("heading", { name: "Sprawy do decyzji", level: 1 })).toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();

    rozwiazTest([]);
    await waitFor(() => expect(pobierzKolejkeSpraw).toHaveBeenCalledTimes(1));
  });
});

describe("Sprawy — stan z danymi", () => {
  it("łączy trzy źródła w jedną kolejkę, pokazuje główną akcję i przejście po kliknięciu", async () => {
    pobierzKolejkeSpraw.mockResolvedValue([
      {
        rodzaj: "applications",
        pozycje: [
          {
            id: "applications-1",
            rodzaj: "applications",
            tytul: "Zgłoszenie — Marta Demo",
            podpowiedz: "Czeka od 1 stycznia 2026",
            czekaOd: "2026-01-01T00:00:00Z",
            href: "/admin/uczestniczki?zakladka=zgloszenia",
          },
        ],
        blad: null,
        kodBledu: null,
        liczbaCalkowita: 1,
      },
      {
        rodzaj: "internship_entries",
        pozycje: [
          {
            id: "internship_entries-9",
            rodzaj: "internship_entries",
            tytul: "Dyżur — Filip Demo",
            podpowiedz: "Czeka od 1 czerwca 2026",
            czekaOd: "2026-06-01T00:00:00Z",
            href: "/admin/staz",
          },
        ],
        blad: null,
        kodBledu: null,
        liczbaCalkowita: 1,
      },
      WYNIK_PUSTY("profiles"),
    ]);

    render(<Sprawy />);

    await waitFor(() => expect(screen.getByText("Zgłoszenie — Marta Demo")).toBeInTheDocument());
    expect(screen.getByText("Dyżur — Filip Demo")).toBeInTheDocument();

    const glownaAkcja = screen.getByRole("button", { name: "Otwórz najstarszą sprawę" });
    glownaAkcja.click();
    expect(push).toHaveBeenCalledWith("/admin/uczestniczki?zakladka=zgloszenia");
  });
});

describe("Sprawy — stan pusty", () => {
  it("wszystkie źródła bez pozycji -> „Brak spraw do decyzji”, bez głównej akcji", async () => {
    pobierzKolejkeSpraw.mockResolvedValue([
      WYNIK_PUSTY("applications"),
      WYNIK_PUSTY("internship_entries"),
      WYNIK_PUSTY("profiles"),
    ]);

    render(<Sprawy />);

    expect(await screen.findByText("Brak spraw do decyzji")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Otwórz najstarszą sprawę" })).toBeNull();
  });
});

describe("Sprawy — błąd jednego źródła", () => {
  it("Notice przy źródle, reszta kolejki działa, najstarsza liczona z pozostałych", async () => {
    pobierzKolejkeSpraw.mockResolvedValue([
      WYNIK_PUSTY("applications"),
      {
        rodzaj: "internship_entries",
        pozycje: [],
        blad: "Backend H11 nieosiągalny.",
        kodBledu: null,
        liczbaCalkowita: 0,
      },
      {
        rodzaj: "profiles",
        pozycje: [
          {
            id: "profiles-6",
            rodzaj: "profiles",
            tytul: "Profil psychologa — Joanna Demo",
            podpowiedz: "Czeka od 15 lipca 2026",
            czekaOd: "2026-07-15T09:00:00Z",
            href: "/admin/profile/6",
          },
        ],
        blad: null,
        kodBledu: null,
        liczbaCalkowita: 1,
      },
    ]);

    render(<Sprawy />);

    expect(await screen.findByText(/Źródło „Dyżur” nieosiągalne/)).toBeInTheDocument();
    expect(screen.getByText("Profil psychologa — Joanna Demo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Otwórz najstarszą sprawę" })).toBeInTheDocument();
  });
});

describe("Sprawy — brak uprawnień (403 forbidden na wszystkich źródłach)", () => {
  it("pokazuje pełnoekranowy stan brak-uprawnien, bez listy i bez trzech osobnych Notice", async () => {
    pobierzKolejkeSpraw.mockResolvedValue([
      { rodzaj: "applications", pozycje: [], blad: "Nie masz dostępu do tej sekcji.", kodBledu: "forbidden", liczbaCalkowita: 0 },
      { rodzaj: "internship_entries", pozycje: [], blad: "Nie masz dostępu do tej sekcji.", kodBledu: "forbidden", liczbaCalkowita: 0 },
      { rodzaj: "profiles", pozycje: [], blad: "Nie masz dostępu do tej sekcji.", kodBledu: "forbidden", liczbaCalkowita: 0 },
    ]);

    render(<Sprawy />);

    expect(await screen.findByText("Sekcja dla administracji")).toBeInTheDocument();
    expect(screen.queryByText(/Źródło „/)).toBeNull();
  });
});

describe("Sprawy — główna akcja i filtr rodzaju", () => {
  const dwaRodzaje = () => [
    {
      rodzaj: "applications" as const,
      pozycje: [
        {
          id: "applications-1",
          idLiczbowe: 1,
          rodzaj: "applications" as const,
          tytul: "Zgłoszenie — Marta Demo",
          podpowiedz: "Czeka od 1 marca 2026",
          czekaOd: "2026-03-01T00:00:00Z",
          href: "/admin/uczestniczki?zakladka=zgloszenia",
        },
      ],
      blad: null,
      kodBledu: null,
      liczbaCalkowita: 1,
    },
    {
      rodzaj: "internship_entries" as const,
      pozycje: [
        {
          id: "internship_entries-9",
          idLiczbowe: 9,
          rodzaj: "internship_entries" as const,
          tytul: "Dyżur — Filip Demo",
          podpowiedz: "Czeka od 1 lutego 2026",
          czekaOd: "2026-02-01T00:00:00Z",
          href: "/admin/staz",
        },
      ],
      blad: null,
      kodBledu: null,
      liczbaCalkowita: 1,
    },
    WYNIK_PUSTY("profiles"),
  ];

  function wybierzRodzaj(etykieta: string) {
    fireEvent.click(screen.getByRole("combobox", { name: "Rodzaj sprawy" }));
    fireEvent.click(screen.getByRole("option", { name: etykieta }));
  }

  it("filtr rodzaju zawęża listę, ale najstarsza sprawa pochodzi z pełnej listy", async () => {
    pobierzKolejkeSpraw.mockResolvedValue(dwaRodzaje());
    render(<Sprawy />);
    await screen.findByText("Dyżur — Filip Demo");

    wybierzRodzaj("Zgłoszenie");

    expect(screen.queryByText("Dyżur — Filip Demo")).toBeNull();
    expect(screen.getByText("Zgłoszenie — Marta Demo")).toBeInTheDocument();
    screen.getByRole("button", { name: "Otwórz najstarszą sprawę" }).click();
    // Najstarszy jest dyżur (luty), mimo że widoczne jest tylko zgłoszenie (marzec).
    expect(push).toHaveBeenCalledWith("/admin/staz");
  });

  it("filtr bez wyników przy niepustych sprawach nie twierdzi, że brak spraw do decyzji", async () => {
    pobierzKolejkeSpraw.mockResolvedValue(dwaRodzaje());
    render(<Sprawy />);
    await screen.findByText("Dyżur — Filip Demo");

    wybierzRodzaj("Profil psychologa");

    expect(screen.getByText("Brak spraw tego rodzaju")).toBeInTheDocument();
    expect(screen.queryByText("Brak spraw do decyzji")).toBeNull();
  });

  it("dokładnie jeden przycisk główny (primary): „Otwórz najstarszą sprawę”", async () => {
    pobierzKolejkeSpraw.mockResolvedValue(dwaRodzaje());
    render(<Sprawy />);
    await screen.findByText("Dyżur — Filip Demo");

    const glowne = screen.getAllByRole("button").filter((przycisk) => /primary/.test(przycisk.className));
    expect(glowne.map((przycisk) => przycisk.textContent)).toEqual(["Otwórz najstarszą sprawę"]);
  });

  it("przycisk główny stoi w nagłówku przy tytule, nie w treści listy (makieta 2.0.4, `.head .acts`)", async () => {
    pobierzKolejkeSpraw.mockResolvedValue(dwaRodzaje());
    const { container } = render(<Sprawy />);
    const przycisk = await screen.findByRole("button", { name: "Otwórz najstarszą sprawę" });

    const glowa = container.querySelector("[data-testid='pageheader-glowa']")!;
    expect(glowa).toContainElement(screen.getByRole("heading", { level: 1, name: "Sprawy do decyzji" }));
    expect(glowa).toContainElement(przycisk);
  });
});

describe("Sprawy — błąd sieci / wyjątek poza ApiError", () => {
  it("odrzucona obietnica poza per-źródłowym try/catch -> stan blad", async () => {
    pobierzKolejkeSpraw.mockRejectedValue(new Error("sieć nieosiągalna"));

    render(<Sprawy />);

    expect(await screen.findByText(/Sprawy są chwilowo nieosiągalne/)).toBeInTheDocument();
  });
});

describe("Sprawy — każdy stan w szablonie ListTemplate", () => {
  const WYNIK_Z_DANYMI = {
    rodzaj: "applications" as const,
    pozycje: [
      {
        id: "applications-1",
        rodzaj: "applications" as const,
        tytul: "Zgłoszenie — Marta Demo",
        podpowiedz: "Czeka od 1 stycznia 2026",
        czekaOd: "2026-01-01T00:00:00Z",
        href: "/admin/uczestniczki?zakladka=zgloszenia",
      },
    ],
    blad: null,
    kodBledu: null,
    liczbaCalkowita: 1,
  };
  const WYNIK_ZAKAZANY = (rodzaj: "applications" | "internship_entries" | "profiles") => ({
    rodzaj,
    pozycje: [],
    blad: "Nie masz dostępu do tej sekcji.",
    kodBledu: "forbidden",
    liczbaCalkowita: 0,
  });

  function oczekujJednegoMainZSzablonem(kontener: HTMLElement) {
    expect(() => jedenMain(kontener)).not.toThrow();
    expect(kontener.querySelector("main")?.getAttribute("data-style-id")).toBe("szablon-lista");
    expect(kontener.querySelectorAll('[data-style-id="szablon-lista"]')).toHaveLength(1);
  }

  it("ładowanie: jeden main z szablonu, szkielet w slocie listy", async () => {
    pobierzKolejkeSpraw.mockReturnValue(new Promise(() => {}));
    const { container } = render(<Sprawy />);
    oczekujJednegoMainZSzablonem(container);
    expect(container.querySelector('[data-testid="obszar-lista"] [aria-busy="true"]')).not.toBeNull();
  });

  it("dane: jeden main z szablonu, filtr w slocie filtrów", async () => {
    pobierzKolejkeSpraw.mockResolvedValue([WYNIK_Z_DANYMI, WYNIK_PUSTY("internship_entries"), WYNIK_PUSTY("profiles")]);
    const { container } = render(<Sprawy />);
    await screen.findByText("Zgłoszenie — Marta Demo");
    oczekujJednegoMainZSzablonem(container);
    expect(container.querySelector('[data-testid="obszar-filtry"]')).not.toBeNull();
  });

  it("pusto: jeden main z szablonu, „Brak spraw do decyzji” w slocie listy", async () => {
    pobierzKolejkeSpraw.mockResolvedValue([
      WYNIK_PUSTY("applications"),
      WYNIK_PUSTY("internship_entries"),
      WYNIK_PUSTY("profiles"),
    ]);
    const { container } = render(<Sprawy />);
    await screen.findByText("Brak spraw do decyzji");
    oczekujJednegoMainZSzablonem(container);
  });

  it("błąd jednego źródła: jeden main z szablonu, Notice w slocie listy", async () => {
    pobierzKolejkeSpraw.mockResolvedValue([
      WYNIK_Z_DANYMI,
      { ...WYNIK_PUSTY("internship_entries"), blad: "Zaplecze nieosiągalne." },
      WYNIK_PUSTY("profiles"),
    ]);
    const { container } = render(<Sprawy />);
    await screen.findByText(/Źródło „Dyżur” nieosiągalne/);
    oczekujJednegoMainZSzablonem(container);
  });

  it("brak uprawnień: jeden main z szablonu, nagłówek ekranu zostaje", async () => {
    pobierzKolejkeSpraw.mockResolvedValue([
      WYNIK_ZAKAZANY("applications"),
      WYNIK_ZAKAZANY("internship_entries"),
      WYNIK_ZAKAZANY("profiles"),
    ]);
    const { container } = render(<Sprawy />);
    await screen.findByText("Sekcja dla administracji");
    oczekujJednegoMainZSzablonem(container);
    expect(screen.getByRole("heading", { name: "Sprawy do decyzji", level: 1 })).toBeInTheDocument();
  });

  it("błąd sieci: jeden main z szablonu, komunikat w slocie listy", async () => {
    pobierzKolejkeSpraw.mockRejectedValue(new Error("sieć nieosiągalna"));
    const { container } = render(<Sprawy />);
    await screen.findByText(/Sprawy są chwilowo nieosiągalne/);
    oczekujJednegoMainZSzablonem(container);
  });

  it("kontrola dodatnia: dwa main w DOM albo brak znacznika szablonu są wykrywane", () => {
    const podwojny = document.createElement("div");
    podwojny.innerHTML =
      '<main id="tresc" tabindex="-1" data-style-id="szablon-lista"><main id="tresc" tabindex="-1"></main></main>';
    expect(() => jedenMain(podwojny)).toThrow(/dokładnie jednego/);

    const bezSzablonu = document.createElement("div");
    bezSzablonu.innerHTML = '<main id="tresc" tabindex="-1"></main>';
    expect(bezSzablonu.querySelector('[data-style-id="szablon-lista"]')).toBeNull();
  });
});

describe("Sprawy — awaria źródeł nie udaje pustej listy", () => {
  const BLAD = (rodzaj: "applications" | "internship_entries" | "profiles") => ({
    rodzaj,
    pozycje: [],
    blad: "Nie udało się pobrać danych źródła.",
    kodBledu: null,
    liczbaCalkowita: 0,
  });

  it("wszystkie trzy odczyty zawiodły: stan błędu z „Spróbuj ponownie”, bez zdania o braku spraw", async () => {
    pobierzKolejkeSpraw.mockResolvedValue([BLAD("applications"), BLAD("internship_entries"), BLAD("profiles")]);
    const { container } = render(<Sprawy />);

    await screen.findByText("Nie udało się wczytać spraw");
    expect(screen.queryByText("Brak spraw do decyzji")).toBeNull();
    expect(screen.queryByText(/Źródło „/)).toBeNull();
    expect(() => jedenMain(container)).not.toThrow();

    pobierzKolejkeSpraw.mockResolvedValue([
      WYNIK_PUSTY("applications"),
      WYNIK_PUSTY("internship_entries"),
      WYNIK_PUSTY("profiles"),
    ]);
    screen.getByRole("button", { name: "Spróbuj ponownie" }).click();
    expect(await screen.findByText("Brak spraw do decyzji")).toBeInTheDocument();
    expect(pobierzKolejkeSpraw).toHaveBeenCalledTimes(2);
  });

  it("częściowy błąd i zero pozycji z pozostałych: Notice przy źródle, bez zdania o braku spraw", async () => {
    pobierzKolejkeSpraw.mockResolvedValue([
      WYNIK_PUSTY("applications"),
      BLAD("internship_entries"),
      WYNIK_PUSTY("profiles"),
    ]);
    render(<Sprawy />);

    await screen.findByText(/Źródło „Dyżur” nieosiągalne/);
    expect(screen.queryByText("Brak spraw do decyzji")).toBeNull();
    expect(screen.queryByRole("button", { name: "Otwórz najstarszą sprawę" })).toBeNull();
  });

  it("teksty ekranu nie zawierają zakazanych nazw dla dyżuru ani listy spraw", async () => {
    pobierzKolejkeSpraw.mockResolvedValue([
      WYNIK_PUSTY("applications"),
      BLAD("internship_entries"),
      WYNIK_PUSTY("profiles"),
    ]);
    const { container } = render(<Sprawy />);
    await screen.findByText(/Źródło „Dyżur” nieosiągalne/);
    expect(container.textContent).not.toMatch(/wpis(y|u)? stażu|kolejk/i);
  });
});
