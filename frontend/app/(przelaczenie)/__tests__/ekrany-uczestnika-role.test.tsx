import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";

/**
 * Ekrany uczestnika w segmentach `/panel` obu grup tras (`(uczestnik)` i `(przelaczenie)`), każdy
 * w swojej prawdziwej ramce, i na stronach podglądu tych ekranów pod `/nowy-front`: osoba z rolą
 * uczestnika widzi ekran (także z drugą rolą), personel i prowadzący widzą kurs, test kursu i lekcję
 * w trybie podglądu (`?podglad=1`), a każda inna osoba wspólny ekran „Nie masz dostępu do tego
 * ekranu” bez treści ekranu. Podmienione są wyłącznie transport HTTP i adres strony, a treść ekranu
 * zastępuje jeden akapit. Odpowiedzi 404 i przekierowania segmentów zapadają w układzie segmentu
 * przed strażnikiem — bez odczytu konta.
 */

const { api, push, notFound, redirect } = vi.hoisted(() => ({
  api: vi.fn(),
  push: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
  redirect: vi.fn((adres: string) => {
    throw new Error(`NEXT_REDIRECT;${adres}`);
  }),
}));
let sciezka = "/panel/pulpit";
let zapytanie = "";

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: vi.fn().mockResolvedValue({ data: [], meta: undefined }),
  endSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => sciezka,
  useSearchParams: () => new URLSearchParams(zapytanie),
  useRouter: () => ({ back: vi.fn(), push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  notFound,
  redirect,
}));

const { ApiError, endSession } = await import("@/lib/api/klient");
const { homeForRole } = await import("@/lib/home-by-role");

/** Układ trasy wywołany jak przez serwer: dzieci i parametry segmentu. */
type Uklad = (wlasciwosci: { children: ReactNode; params: Promise<Record<string, string>> }) => ReactNode | Promise<ReactNode>;
type Wczytanie = () => Promise<Uklad[]>;

interface UkladEkranu {
  nazwa: string;
  /** Łańcuch układów od zewnętrznego (ramka) do układu segmentu. */
  wczytaj: Wczytanie;
  adres: string;
  parametry?: Record<string, string>;
}

const uklad = (modul: Promise<{ default: unknown }>) => modul.then((m) => m.default as Uklad);
const lancuch =
  (...czesci: (() => Promise<Uklad>)[]): Wczytanie =>
  () =>
    Promise.all(czesci.map((czesc) => czesc()));
const ramkaUczestnika = () => uklad(import("@/app/(uczestnik)/panel/layout"));
const ramkaPrzelaczenia = () => uklad(import("@/app/(przelaczenie)/panel/layout"));

const UKLAD_KURSOW = lancuch(ramkaUczestnika, () => uklad(import("@/app/(uczestnik)/panel/kursy/layout")));
const UKLAD_LEKCJI = lancuch(ramkaUczestnika, () => uklad(import("@/app/(uczestnik)/panel/lekcje/[id]/layout")));

const UKLADY_PANELU: UkladEkranu[] = [
  { nazwa: "(uczestnik)/panel/pulpit", wczytaj: lancuch(ramkaUczestnika, () => uklad(import("@/app/(uczestnik)/panel/pulpit/layout"))), adres: "/panel/pulpit" },
  { nazwa: "(uczestnik)/panel/dokumenty", wczytaj: lancuch(ramkaUczestnika, () => uklad(import("@/app/(uczestnik)/panel/dokumenty/layout"))), adres: "/panel/dokumenty" },
  { nazwa: "(uczestnik)/panel/profil", wczytaj: lancuch(ramkaUczestnika, () => uklad(import("@/app/(uczestnik)/panel/profil/layout"))), adres: "/panel/profil" },
  { nazwa: "(uczestnik)/panel/start", wczytaj: lancuch(ramkaUczestnika, () => uklad(import("@/app/(uczestnik)/panel/start/layout"))), adres: "/panel/start" },
  { nazwa: "(uczestnik)/panel/kursy", wczytaj: UKLAD_KURSOW, adres: "/panel/kursy" },
  { nazwa: "(uczestnik)/panel/kursy/[slug]", wczytaj: UKLAD_KURSOW, adres: "/panel/kursy/wywiad" },
  { nazwa: "(uczestnik)/panel/kursy/[slug]/test", wczytaj: UKLAD_KURSOW, adres: "/panel/kursy/wywiad/test" },
  { nazwa: "(uczestnik)/panel/lekcje/[id]", wczytaj: UKLAD_LEKCJI, adres: "/panel/lekcje/21", parametry: { id: "21" } },
  {
    nazwa: "(przelaczenie)/panel/dalsza-wspolpraca",
    wczytaj: lancuch(ramkaPrzelaczenia, () => uklad(import("@/app/(przelaczenie)/panel/dalsza-wspolpraca/layout"))),
    adres: "/panel/dalsza-wspolpraca",
  },
];

const UKLADY_PODGLADU: UkladEkranu[] = [
  { nazwa: "nowy-front/pulpit", wczytaj: lancuch(() => uklad(import("@/app/nowy-front/pulpit/layout"))), adres: "/nowy-front/pulpit" },
  { nazwa: "nowy-front/dokumenty", wczytaj: lancuch(() => uklad(import("@/app/nowy-front/dokumenty/layout"))), adres: "/nowy-front/dokumenty" },
  { nazwa: "nowy-front/lekcja", wczytaj: lancuch(() => uklad(import("@/app/nowy-front/lekcja/layout"))), adres: "/nowy-front/lekcja/21" },
  {
    nazwa: "nowy-front/kurs-uczestnika",
    wczytaj: lancuch(() => uklad(import("@/app/nowy-front/kurs-uczestnika/layout"))),
    adres: "/nowy-front/kurs-uczestnika/wywiad",
  },
  {
    nazwa: "nowy-front/kurs-uczestnika (test)",
    wczytaj: lancuch(() => uklad(import("@/app/nowy-front/kurs-uczestnika/layout"))),
    adres: "/nowy-front/kurs-uczestnika/wywiad/test",
  },
  { nazwa: "nowy-front/po-programie", wczytaj: lancuch(() => uklad(import("@/app/nowy-front/po-programie/layout"))), adres: "/nowy-front/po-programie" },
  {
    nazwa: "nowy-front/publiczne/panel/start",
    wczytaj: lancuch(() => uklad(import("@/app/nowy-front/publiczne/panel/start/layout"))),
    adres: "/nowy-front/publiczne/panel/start",
  },
];

const TRESC_EKRANU = "Treść ekranu uczestnika";
const NAGLOWEK_ODMOWY = "Nie masz dostępu do tego ekranu";
const NIGDY = () => new Promise(() => {});

function kontoZRola(role: string, roles?: string[]) {
  api.mockImplementation((adres: string) =>
    adres === "/me" ? Promise.resolve({ role, ...(roles ? { roles } : {}), first_name: "Ala" }) : NIGDY(),
  );
}

/** Drzewo układów jak po stronie serwera: od układu segmentu na zewnątrz, wokół akapitu treści. */
async function zbuduj(wczytaj: Wczytanie, parametry: Record<string, string> = {}): Promise<ReactNode> {
  const uklady = await wczytaj();
  let drzewo: ReactNode = <p>{TRESC_EKRANU}</p>;
  for (const Uklad of [...uklady].reverse()) {
    drzewo = await Uklad({ children: drzewo, params: Promise.resolve(parametry) });
  }
  return drzewo;
}

async function renderuj(wczytaj: Wczytanie, adres: string, zapytanieAdresu = "", parametry: Record<string, string> = {}) {
  sciezka = adres;
  zapytanie = zapytanieAdresu;
  return render(<>{await zbuduj(wczytaj, parametry)}</>);
}

/** Liczba odczytów po ustaniu odczytów ramki: ta sama wartość w trzech kolejnych chwilach. */
async function odczytyPoUspokojeniu(odczyty: () => number): Promise<number> {
  let poprzednia = -1;
  let stabilne = 0;
  while (stabilne < 3) {
    await new Promise((gotowe) => setTimeout(gotowe, 20));
    const biezaca = odczyty();
    stabilne = biezaca === poprzednia ? stabilne + 1 : 0;
    poprzednia = biezaca;
  }
  return poprzednia;
}

async function widziOdmowe() {
  expect(await screen.findByRole("heading", { level: 1, name: NAGLOWEK_ODMOWY })).toBeInTheDocument();
  expect(screen.queryByText(TRESC_EKRANU)).not.toBeInTheDocument();
}

async function widziEkran() {
  expect(await screen.findByText(TRESC_EKRANU)).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: NAGLOWEK_ODMOWY })).not.toBeInTheDocument();
}

beforeEach(() => {
  api.mockReset();
  notFound.mockClear();
  redirect.mockClear();
  push.mockReset();
});

afterEach(() => {
  cleanup();
});

describe.each([...UKLADY_PANELU, ...UKLADY_PODGLADU])("ekran uczestnika w układzie $nazwa", ({ wczytaj, adres, parametry }) => {
  it.each(["instructor", "project_manager", "super_admin"])("rola %s widzi ekran braku dostępu, bez treści ekranu", async (rola) => {
    kontoZRola(rola);
    await renderuj(wczytaj, adres, "", parametry);
    await widziOdmowe();
  });

  it.each(["student", "volunteer"])("rola %s widzi ekran", async (rola) => {
    kontoZRola(rola);
    await renderuj(wczytaj, adres, "", parametry);
    await widziEkran();
  });

  it("osoba z rolą prowadzącego i rolą wolontariusza (rola główna instructor) widzi ekran", async () => {
    kontoZRola("instructor", ["instructor", "volunteer"]);
    await renderuj(wczytaj, adres, "", parametry);
    await widziEkran();
  });

  it("osoba z dwiema rolami personelu widzi ekran braku dostępu", async () => {
    kontoZRola("super_admin", ["super_admin", "project_manager"]);
    await renderuj(wczytaj, adres, "", parametry);
    await widziOdmowe();
  });

  it("w czasie odczytu konta treści ekranu nie ma", async () => {
    api.mockImplementation(NIGDY);
    await renderuj(wczytaj, adres, "", parametry);
    expect(await screen.findByText("Wczytywanie…")).toBeInTheDocument();
    expect(screen.queryByText(TRESC_EKRANU)).not.toBeInTheDocument();
  });

  it("błąd odczytu konta: wspólne zdanie o serwerze, bez treści ekranu", async () => {
    api.mockImplementation((sciezkaApi: string) =>
      sciezkaApi === "/me" ? Promise.reject(new ApiError({ status: 500, code: "server_error", message: "x" })) : NIGDY(),
    );
    await renderuj(wczytaj, adres, "", parametry);
    expect(await screen.findByText("Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę.")).toBeInTheDocument();
    expect(screen.queryByText(TRESC_EKRANU)).not.toBeInTheDocument();
  });
});

describe("tryb podglądu personelu i prowadzącego", () => {
  const LEKCJA = { id: "21" };
  const ADRESY_Z_PODGLADEM: [string, Wczytanie, Record<string, string>][] = [
    ["/panel/kursy/wywiad", UKLAD_KURSOW, {}],
    ["/panel/kursy/wywiad/test", UKLAD_KURSOW, {}],
    ["/panel/lekcje/21", UKLAD_LEKCJI, LEKCJA],
  ];

  describe.each(ADRESY_Z_PODGLADEM)("%s", (adres, wczytaj, parametry) => {
    it.each(["project_manager", "super_admin", "instructor"])("rola %s z parametrem podglad=1 widzi ekran", async (rola) => {
      kontoZRola(rola);
      await renderuj(wczytaj, adres, "podglad=1", parametry);
      await widziEkran();
    });

    it("rola project_manager bez parametru podglądu widzi ekran braku dostępu", async () => {
      kontoZRola("project_manager");
      await renderuj(wczytaj, adres, "", parametry);
      await widziOdmowe();
    });

    it("rola project_manager z parametrem podglad=0 widzi ekran braku dostępu", async () => {
      kontoZRola("project_manager");
      await renderuj(wczytaj, adres, "podglad=0", parametry);
      await widziOdmowe();
    });
  });

  it.each(["/panel/pulpit", "/panel/dokumenty", "/panel/kursy"])(
    "ekran bez trybu podglądu (%s) z parametrem podglad=1 pokazuje personelowi ekran braku dostępu",
    async (adres) => {
      const wpis = UKLADY_PANELU.find((uklad) => uklad.adres === adres);
      kontoZRola("project_manager");
      await renderuj(wpis!.wczytaj, adres, "podglad=1");
      await widziOdmowe();
    },
  );

  describe.each([
    ["(uczestnik)/panel/start", "/panel/start", UKLADY_PANELU],
    ["nowy-front/publiczne/panel/start", "/nowy-front/publiczne/panel/start", UKLADY_PODGLADU],
  ])("ekran „Zacznij tutaj” bez trybu podglądu (%s)", (nazwa, adres, uklady) => {
    it.each(["project_manager", "super_admin", "instructor"])(
      "rola %s z parametrem podglad=1 widzi ekran braku dostępu",
      async (rola) => {
        const wpis = uklady.find((uklad) => uklad.nazwa === nazwa);
        kontoZRola(rola);
        await renderuj(wpis!.wczytaj, adres, "podglad=1");
        await widziOdmowe();
      },
    );
  });

  it.each([
    ["nowy-front/kurs-uczestnika", "/nowy-front/kurs-uczestnika/wywiad"],
    ["nowy-front/kurs-uczestnika (test)", "/nowy-front/kurs-uczestnika/wywiad/test"],
    ["nowy-front/lekcja", "/nowy-front/lekcja/21"],
  ])("strona podglądu %s z parametrem podglad=1 pokazuje ekran roli instructor", async (nazwa, adres) => {
    const uklad = UKLADY_PODGLADU.find((wpis) => wpis.nazwa === nazwa);
    kontoZRola("instructor");
    await renderuj(uklad!.wczytaj, adres, "podglad=1");
    await widziEkran();
  });

  it("przejście z podglądu kursu na listę kursów w tym samym układzie pokazuje ekran braku dostępu", async () => {
    kontoZRola("project_manager");
    const { rerender } = await renderuj(UKLAD_KURSOW, "/panel/kursy/wywiad", "podglad=1");
    await widziEkran();

    sciezka = "/panel/kursy";
    zapytanie = "";
    rerender(<>{await zbuduj(UKLAD_KURSOW)}</>);
    await widziOdmowe();
  });
});

describe("odpowiedzi serwera zapadają w układzie segmentu, przed strażnikiem", () => {
  it.each(["abc", "0", "-3", "2.5"])("lekcja o identyfikatorze %s: 404 bez odczytu konta", async (id) => {
    kontoZRola("volunteer");
    await expect(zbuduj(UKLAD_LEKCJI, { id })).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(notFound).toHaveBeenCalledTimes(1);
    expect(api).not.toHaveBeenCalled();
  });

  it("stara trasa /panel/po-programie: przekierowanie na nową trasę bez odczytu konta", async () => {
    kontoZRola("volunteer");
    const UKLAD_PO_PROGRAMIE = lancuch(ramkaUczestnika, () => uklad(import("@/app/(uczestnik)/panel/po-programie/layout")));
    await expect(zbuduj(UKLAD_PO_PROGRAMIE)).rejects.toThrow("NEXT_REDIRECT;/panel/dalsza-wspolpraca");
    expect(api).not.toHaveBeenCalled();
  });

  it("/panel: przekierowanie na start panelu w stronie, bez strażnika nad nią", async () => {
    const { default: Strona } = await import("@/app/(uczestnik)/panel/page");
    expect(() => Strona()).toThrow("NEXT_REDIRECT;/panel/start");
    expect(api).not.toHaveBeenCalled();
  });
});

describe("ekran braku dostępu", () => {
  it.each([
    ["project_manager", "/admin"],
    ["super_admin", "/admin"],
    ["instructor", "/prowadzacy"],
  ])("rola %s: zdanie o roli i przycisk „Wróć do pulpitu” do %s", async (rola, cel) => {
    kontoZRola(rola);
    await renderuj(UKLADY_PANELU[0].wczytaj, "/panel/pulpit");
    await widziOdmowe();

    expect(await screen.findByText(/Ten ekran jest dla osób uczestniczących w programie\.$/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Wróć do pulpitu" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(cel));
  });
});

describe("ekran braku dostępu konta bez rozpoznanej roli", () => {
  const przypisz = vi.fn();
  const pobierz = vi.fn();

  beforeEach(() => {
    vi.mocked(endSession).mockReset();
    vi.mocked(endSession).mockResolvedValue(undefined);
    przypisz.mockReset();
    pobierz.mockReset();
    pobierz.mockResolvedValue({ json: () => Promise.resolve({ url: "https://konta.example/wyloguj" }) });
    vi.stubGlobal("fetch", pobierz);
    vi.stubGlobal("location", { ...window.location, assign: przypisz });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Ekran odmowy bez ramki wokół niego (ramka ma własne przyciski). */
  function ekranOdmowy(): HTMLElement {
    const kontener = screen.getByRole("heading", { level: 1, name: NAGLOWEK_ODMOWY }).closest<HTMLElement>("[data-theme]");
    if (!kontener) throw new Error("brak kontenera ekranu odmowy");
    return kontener;
  }

  const KONTA: [string, () => void][] = [
    ["rola spoza słownika", () => kontoZRola("gosc")],
    ["konto bez roli", () => api.mockImplementation((adres: string) => (adres === "/me" ? Promise.resolve({ first_name: "Ala" }) : NIGDY()))],
    [
      "odczyt konta 403",
      () =>
        api.mockImplementation((adres: string) =>
          adres === "/me" ? Promise.reject(new ApiError({ status: 403, code: "forbidden", message: "Forbidden" })) : NIGDY(),
        ),
    ],
  ];

  describe.each(UKLADY_PANELU)("układ $nazwa", ({ wczytaj, adres, parametry }) => {
    it.each(KONTA)("%s: ekran odmowy z jednym przyciskiem „Wyloguj się”, bez przejścia na start panelu", async (_opis, ustaw) => {
      ustaw();
      await renderuj(wczytaj, adres, "", parametry);
      await widziOdmowe();

      const odczytyKonta = () => api.mock.calls.filter(([adresZadania]) => adresZadania === "/me").length;
      const odczytyPrzedKliknieciem = await odczytyPoUspokojeniu(odczytyKonta);
      const odmowa = within(ekranOdmowy());
      expect(odmowa.getAllByRole("button")).toHaveLength(1);
      expect(screen.queryByRole("button", { name: "Wróć do pulpitu" })).not.toBeInTheDocument();
      fireEvent.click(odmowa.getByRole("button", { name: "Wyloguj się" }));

      await waitFor(() => expect(przypisz).toHaveBeenCalledWith("https://konta.example/wyloguj"));
      expect(pobierz).toHaveBeenCalledWith("/api/auth/end-session-url");
      expect(endSession).toHaveBeenCalledTimes(1);
      expect(push).not.toHaveBeenCalled();
      await widziOdmowe();
      expect(await odczytyPoUspokojeniu(odczytyKonta)).toBe(odczytyPrzedKliknieciem);
    });
  });

  it("adres wylogowania niedostępny: koniec sesji i strona logowania", async () => {
    pobierz.mockRejectedValue(new TypeError("Failed to fetch"));
    kontoZRola("gosc");
    await renderuj(UKLADY_PANELU[0].wczytaj, "/panel/pulpit");
    await widziOdmowe();

    fireEvent.click(within(ekranOdmowy()).getByRole("button", { name: "Wyloguj się" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/logowanie"));
    expect(endSession).toHaveBeenCalledTimes(1);
    expect(przypisz).not.toHaveBeenCalled();
  });

  it("start panelu, dokąd prowadzi rola spoza słownika, też stoi za ekranem odmowy", async () => {
    kontoZRola("gosc");
    const start = UKLADY_PANELU.find((wpis) => wpis.adres === homeForRole("gosc"));
    await renderuj(start!.wczytaj, homeForRole("gosc"));
    await widziOdmowe();
  });
});
