import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { KURS, LEKCJA, graRamka, kursZ, ramkaOdtwarzacza, zrodloRamki } from "./pomoce";

/** Tryb podglądu: parametr adresu ORAZ rola personelu albo prowadzącego. Pas, zero zapisów, parametr w odnośnikach. */

const pobierzDaneLekcji = vi.fn();
const pobierzOdczytKursu = vi.fn();
const wyslijPostep = vi.fn();
const ukonczLekcje = vi.fn();
const pobierzPytania = vi.fn();
const wyslijPytanie = vi.fn();
const apiMe = vi.fn();
const push = vi.fn();
let parametryAdresu = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(parametryAdresu),
}));

vi.mock("@/lib/api/klient", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...original, api: (...args: unknown[]) => apiMe(...args) };
});

vi.mock("../dane", async (importOriginal) => {
  const original = await importOriginal<typeof import("../dane")>();
  return {
    ...original,
    pobierzDaneLekcji: (...args: unknown[]) => pobierzDaneLekcji(...args),
    wyslijPostep: (...args: unknown[]) => wyslijPostep(...args),
    ukonczLekcje: (...args: unknown[]) => ukonczLekcje(...args),
    pobierzPytania: (...args: unknown[]) => pobierzPytania(...args),
    wyslijPytanie: (...args: unknown[]) => wyslijPytanie(...args),
  };
});

vi.mock("../kurs", async (importOriginal) => {
  const original = await importOriginal<typeof import("../kurs")>();
  return { ...original, pobierzOdczytKursu: (...args: unknown[]) => pobierzOdczytKursu(...args) };
});

const { Lekcja } = await import("../Lekcja");

const TEKST_PASA = "Tryb podglądu. Widzisz kurs tak, jak uczestnik. Nic się nie zapisuje.";
const ZDANIE = "W podglądzie nic się nie zapisuje";
const PRZYCISK = "Oznacz lekcję jako ukończoną";
const MOZNA = { active_seconds: 960, watched_seconds: 960, completable: true };

async function przeczekaj() {
  await act(async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  });
}

async function otworz(opcje: { rola: string; podglad: boolean; dane?: Record<string, unknown>; kurs?: unknown; bezNagrania?: boolean }) {
  parametryAdresu = opcje.podglad ? "kurs=pierwsza-pomoc-psychologiczna&podglad=1" : "kurs=pierwsza-pomoc-psychologiczna";
  apiMe.mockResolvedValue({ role: opcje.rola });
  pobierzDaneLekcji.mockResolvedValue({
    status: "ok",
    dane: { ...LEKCJA, ...MOZNA, ...(opcje.dane ?? {}) },
    bezNagrania: opcje.bezNagrania ?? false,
    zrodloNagrania: zrodloRamki(),
  });
  pobierzOdczytKursu.mockResolvedValue(opcje.kurs ?? KURS);
  const wynik = render(<Lekcja id="21" />);
  await przeczekaj();
  return wynik;
}

function zielone(): HTMLElement[] {
  return screen.queryAllByRole("button").filter((przycisk) => /primary/.test(przycisk.className));
}

beforeEach(() => {
  for (const atrapa of [pobierzDaneLekcji, pobierzOdczytKursu, wyslijPostep, ukonczLekcje, pobierzPytania, wyslijPytanie, apiMe, push]) {
    atrapa.mockReset();
  }
  pobierzPytania.mockResolvedValue([]);
  wyslijPostep.mockResolvedValue({ watched_seconds: 1000, active_seconds: 1000, completable: true, completable_at_percent: 60 });
  ukonczLekcje.mockResolvedValue({ status: "ok", completed_at: "2026-10-03T12:30:00Z" });
  wyslijPytanie.mockResolvedValue({
    status: "ok",
    pytanie: { id: 1, question: "Czy mogę?", answer: null, answered_at: null, answered_by_name: null, created_at: "2026-10-03T12:00:00Z" },
  });
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("cztery nogi sygnału podglądu", () => {
  it("personel z parametrem: pas z tekstem i odnośnikiem do edycji kursu", async () => {
    await otworz({ rola: "project_manager", podglad: true });

    const pas = screen.getByRole("region", { name: "Tryb podglądu" });
    expect(pas).toHaveTextContent(TEKST_PASA);
    expect(screen.getByRole("link", { name: "Wróć do edycji kursu" })).toHaveAttribute("href", "/admin/kursy/3");
  });

  it("prowadzący z parametrem: pas, odnośnik do kursu prowadzącego", async () => {
    await otworz({ rola: "instructor", podglad: true });

    expect(screen.getByRole("region", { name: "Tryb podglądu" })).toHaveTextContent(TEKST_PASA);
    expect(screen.getByRole("link", { name: "Wróć do edycji kursu" })).toHaveAttribute("href", "/prowadzacy/kursy/3");
  });

  it("odczyt lekcji bez identyfikatora kursu: lista kursów właściwa dla roli", async () => {
    await otworz({ rola: "super_admin", podglad: true, dane: { course: null } });
    expect(screen.getByRole("link", { name: "Wróć do edycji kursu" })).toHaveAttribute("href", "/admin/kursy");
    cleanup();

    await otworz({ rola: "instructor", podglad: true, dane: { course: null } });
    expect(screen.getByRole("link", { name: "Wróć do edycji kursu" })).toHaveAttribute("href", "/prowadzacy/kursy");
  });

  it("personel bez parametru: brak pasa, konto nie jest czytane, przycisk czynny", async () => {
    await otworz({ rola: "project_manager", podglad: false });

    expect(screen.queryByRole("region", { name: "Tryb podglądu" })).toBeNull();
    expect(screen.queryByText(TEKST_PASA)).toBeNull();
    expect(apiMe).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: PRZYCISK })).not.toHaveAttribute("aria-disabled");
  });

  it("uczestnik z parametrem: ekran jak zwykle, bez pasa, zapisy działają", async () => {
    await otworz({ rola: "volunteer", podglad: true });

    expect(screen.queryByRole("region", { name: "Tryb podglądu" })).toBeNull();
    expect(screen.queryByText(ZDANIE)).toBeNull();
    const przycisk = screen.getByRole("button", { name: PRZYCISK });
    expect(przycisk).not.toHaveAttribute("aria-disabled");
    fireEvent.click(przycisk);
    await przeczekaj();
    expect(ukonczLekcje).toHaveBeenCalledTimes(1);
  });
});

/** Ta sama sekwencja w obu wariantach: odtwarzanie w ramce, upływ czasu, kliknięcie przycisku, wysłanie pytania. */
async function sekwencja() {
  // Ramka jest widoczna także w podglądzie; gra przez 125 s, a komunikaty ramki dochodzą do ekranu.
  expect(ramkaOdtwarzacza()).not.toBeNull();
  graRamka(125);
  await przeczekaj();
  fireEvent.click(screen.getByRole("button", { name: PRZYCISK }));
  await przeczekaj();
  fireEvent.change(screen.getByRole("textbox", { name: "Twoje pytanie" }), { target: { value: "Czy mogę?" } });
  fireEvent.click(screen.getByRole("button", { name: "Wyślij pytanie" }));
  await przeczekaj();
}

describe("zero żądań zapisu w podglądzie", () => {
  it("personel w podglądzie: ani postępu, ani ukończenia, ani pytania", async () => {
    vi.useFakeTimers();
    await otworz({ rola: "project_manager", podglad: true });

    await sekwencja();

    expect(wyslijPostep).toHaveBeenCalledTimes(0);
    expect(ukonczLekcje).toHaveBeenCalledTimes(0);
    expect(wyslijPytanie).toHaveBeenCalledTimes(0);
  });

  it("prowadzący w podglądzie: to samo", async () => {
    vi.useFakeTimers();
    await otworz({ rola: "instructor", podglad: true });

    await sekwencja();

    expect(wyslijPostep).toHaveBeenCalledTimes(0);
    expect(ukonczLekcje).toHaveBeenCalledTimes(0);
    expect(wyslijPytanie).toHaveBeenCalledTimes(0);
  });

  it("kontrola dodatnia: ta sama sekwencja bez podglądu wysyła postęp, ukończenie i pytanie", async () => {
    vi.useFakeTimers();
    await otworz({ rola: "project_manager", podglad: false });

    await sekwencja();

    expect(wyslijPostep.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(ukonczLekcje).toHaveBeenCalledTimes(1);
    expect(wyslijPytanie).toHaveBeenCalledTimes(1);
  });

  it("parametr podglądu, rola jeszcze nieznana: nic nie jest wysyłane, zanim konto się odczyta", async () => {
    vi.useFakeTimers();
    apiMe.mockReturnValue(new Promise(() => {}));
    parametryAdresu = "kurs=pierwsza-pomoc-psychologiczna&podglad=1";
    pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane: { ...LEKCJA, ...MOZNA }, bezNagrania: false, zrodloNagrania: zrodloRamki() });
    pobierzOdczytKursu.mockResolvedValue(KURS);
    render(<Lekcja id="21" />);
    await przeczekaj();

    await sekwencja();

    expect(wyslijPostep).toHaveBeenCalledTimes(0);
    expect(ukonczLekcje).toHaveBeenCalledTimes(0);
    expect(wyslijPytanie).toHaveBeenCalledTimes(0);
  });
});

describe("przycisk ukończenia i formularz pytania w podglądzie", () => {
  it("przycisk: aria-disabled, w kolejności fokusu, powód widoczny i podpięty; jeden zielony przycisk", async () => {
    await otworz({ rola: "project_manager", podglad: true });

    const przycisk = screen.getByRole("button", { name: PRZYCISK });
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    expect(przycisk).not.toBeDisabled();
    expect(przycisk.tabIndex).toBe(0);
    expect(zielone()).toHaveLength(1);
    const powod = screen.getAllByText(ZDANIE).find((element) => element.id !== "" && przycisk.getAttribute("aria-describedby")?.includes(element.id));
    expect(powod).toBeDefined();
    expect(powod).toBeVisible();
    expect(screen.queryByText("Możesz już ukończyć tę lekcję.")).toBeNull();
  });

  it("formularz pytania: grupa aria-disabled, zdanie powodu przy polu, przycisk „Wyślij pytanie” aria-disabled w kolejności fokusu", async () => {
    await otworz({ rola: "project_manager", podglad: true });

    const grupa = screen.getByRole("group", { name: "Formularz pytania" });
    expect(grupa).toHaveAttribute("aria-disabled", "true");
    const wyslij = screen.getByRole("button", { name: "Wyślij pytanie" });
    expect(wyslij).toHaveAttribute("aria-disabled", "true");
    expect(wyslij.tabIndex).toBe(0);
    expect(screen.getByRole("textbox", { name: "Twoje pytanie" }).tabIndex).toBe(0);
    expect(screen.getAllByText(ZDANIE).length).toBeGreaterThanOrEqual(2);
    expect(wyslij.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("bez podglądu formularz i przycisk są czynne, bez grupy", async () => {
    await otworz({ rola: "project_manager", podglad: false });

    expect(screen.queryByRole("group", { name: "Formularz pytania" })).toBeNull();
    expect(screen.getByRole("button", { name: "Wyślij pytanie" })).not.toHaveAttribute("aria-disabled");
  });
});

describe("parametr podglądu w odnośnikach ekranu", () => {
  it("każdy odnośnik wewnętrzny poza powrotem do edycji niesie parametr", async () => {
    await otworz({ rola: "project_manager", podglad: true });

    const wewnetrzne = screen
      .getAllByRole("link")
      .map((odnosnik) => ({ nazwa: odnosnik.textContent ?? "", adres: odnosnik.getAttribute("href") ?? "" }))
      .filter((odnosnik) => odnosnik.adres.startsWith("/") && odnosnik.nazwa !== "Wróć do edycji kursu");
    expect(wewnetrzne.length).toBeGreaterThanOrEqual(3);
    for (const odnosnik of wewnetrzne) expect(odnosnik.adres, odnosnik.nazwa).toContain("podglad=1");
    expect(screen.getByRole("link", { name: "Wróć do edycji kursu" }).getAttribute("href")).not.toContain("podglad");
  });

  it("bez podglądu odnośniki nie niosą parametru", async () => {
    await otworz({ rola: "project_manager", podglad: false });

    for (const odnosnik of screen.getAllByRole("link")) expect(odnosnik.getAttribute("href")).not.toContain("podglad");
  });

  it("lekcja ukończona: przycisk do następnej lekcji niesie kurs i parametr", async () => {
    await otworz({ rola: "instructor", podglad: true, dane: { is_completed: true } });

    fireEvent.click(screen.getByRole("button", { name: "Przejdź do lekcji 4" }));
    expect(push).toHaveBeenCalledWith("/panel/lekcje/22?kurs=pierwsza-pomoc-psychologiczna&podglad=1");
  });

  it("ostatnia lekcja kursu z testem: adres testu niesie parametr", async () => {
    const kurs = kursZ({ lessons: KURS.lessons.slice(0, 3), topics: [KURS.topics[0]] });
    await otworz({ rola: "instructor", podglad: true, dane: { is_completed: true }, kurs });

    fireEvent.click(screen.getByRole("button", { name: "Przejdź do testu" }));
    expect(push).toHaveBeenCalledWith("/panel/kursy/pierwsza-pomoc-psychologiczna/test?podglad=1");
  });

  it("lekcja zamknięta mimo podglądu (odmowa serwera): stan z numerem, pas i adres z parametrem", async () => {
    parametryAdresu = "kurs=pierwsza-pomoc-psychologiczna&podglad=1";
    apiMe.mockResolvedValue({ role: "project_manager" });
    pobierzDaneLekcji.mockResolvedValue({ status: "lekcja-zamknieta", komunikat: "x", wymaganaLekcjaId: 21 });
    pobierzOdczytKursu.mockResolvedValue(KURS);
    render(<Lekcja id="22" />);
    await przeczekaj();

    expect(screen.getByRole("heading", { level: 1, name: "Najpierw ukończ lekcję 3" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Tryb podglądu" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Przejdź do lekcji 3" }));
    expect(push).toHaveBeenCalledWith("/panel/lekcje/21?kurs=pierwsza-pomoc-psychologiczna&podglad=1");
  });
});
