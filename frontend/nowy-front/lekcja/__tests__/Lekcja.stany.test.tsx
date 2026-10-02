import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KURS, LEKCJA, kursZ } from "./pomoce";

/**
 * Siedem stanów ekranu lekcji z zatwierdzonego układu — każdy z literalnymi
 * tekstami — oraz zasada jednego zielonego przycisku (K1, K2, K3).
 */

const pobierzDaneLekcji = vi.fn();
const ukonczLekcje = vi.fn();
const pobierzOdczytKursu = vi.fn();
const push = vi.fn();
const scrollIntoView = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../dane", async (importOriginal) => {
  const original = await importOriginal<typeof import("../dane")>();
  return {
    ...original,
    pobierzDaneLekcji: (...args: unknown[]) => pobierzDaneLekcji(...args),
    ukonczLekcje: (...args: unknown[]) => ukonczLekcje(...args),
    pobierzPytania: async () => [],
  };
});

vi.mock("../kurs", async (importOriginal) => {
  const original = await importOriginal<typeof import("../kurs")>();
  return { ...original, pobierzOdczytKursu: (...args: unknown[]) => pobierzOdczytKursu(...args) };
});

const { Lekcja } = await import("../Lekcja");

const ZRODLO = { adres: "https://nagrania.atrapa.test/lista.m3u8" };

function zNagraniem(nadpisz: Record<string, unknown> = {}) {
  return { status: "ok", dane: { ...LEKCJA, ...nadpisz }, bezNagrania: false, zrodloNagrania: ZRODLO };
}

function bezNagrania(nagranie?: "w-przygotowaniu" | "nie-dziala", nadpisz: Record<string, unknown> = {}) {
  const dane = { ...LEKCJA, video_status: nagranie === undefined ? "none" : LEKCJA.video_status, ...nadpisz };
  return { status: "ok", dane, bezNagrania: true, ...(nagranie === undefined ? {} : { nagranie }) };
}

async function otworz(wynik: unknown, kurs: unknown = KURS) {
  pobierzDaneLekcji.mockResolvedValue(wynik);
  pobierzOdczytKursu.mockResolvedValue(kurs);
  const rezultat = render(<Lekcja id="21" />);
  await screen.findByRole("heading", { level: 1, name: LEKCJA.title });
  await screen.findByText(/lekcji ukończone/);
  return rezultat;
}

function zielone() {
  return screen.getAllByRole("button").filter((b) => b.className.split(/\s+/).some((k) => /(^|_)primary(_|$)/.test(k)));
}

function przyciskGlowny() {
  const lista = zielone();
  expect(lista).toHaveLength(1);
  return lista[0];
}

beforeEach(() => {
  pobierzDaneLekcji.mockReset();
  ukonczLekcje.mockReset();
  pobierzOdczytKursu.mockReset();
  push.mockReset();
  scrollIntoView.mockReset();
  Element.prototype.scrollIntoView = scrollIntoView;
});

describe("stan 1 — brakuje czasu", () => {
  it("tytuł, podtytuł, przycisk z kłódką i zdaniem „Zostały 4 minuty nagrania.”", async () => {
    await otworz(zNagraniem());

    expect(screen.getByRole("heading", { level: 1, name: "Rozpoznawanie kryzysu psychicznego" })).toBeInTheDocument();
    expect(screen.getByText("20 min nagrania · około 1 min czytania")).toBeInTheDocument();
    const przycisk = przyciskGlowny();
    expect(przycisk).toHaveTextContent("Oznacz lekcję jako ukończoną");
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    expect(przycisk.querySelector("svg")).not.toBeNull();
    expect(screen.getByText("Zostały 4 minuty nagrania.")).toBeInTheDocument();
    expect(przycisk).toHaveAccessibleDescription(/Zostały 4 minuty nagrania\./);
    expect(screen.queryByText("Ukończona")).toBeNull();
  });

  it("postęp w temacie: dwa odcinki zielone, bieżący, cztery puste i zdanie", async () => {
    const { container } = await otworz(zNagraniem());

    expect(screen.getByText("2 z 7 lekcji ukończone · jesteś w lekcji 3")).toBeInTheDocument();
    const odcinki = Array.from(container.querySelectorAll("[data-stan]")).map((el) => el.getAttribute("data-stan"));
    expect(odcinki).toEqual(["gotowy", "gotowy", "biezacy", "pusty", "pusty", "pusty", "pusty"]);
  });

  it("nagranie: zdanie o obejrzanym czasie, odtwarzacz i karty pod nim", async () => {
    await otworz(zNagraniem());

    expect(
      screen.getByText("Obejrzane: 12 z 16 potrzebnych minut. Liczy się czas oglądania, nie przewijanie."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Odtwórz nagranie" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Miejsce w nagraniu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pełny ekran" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Treść lekcji" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Materiały do pobrania" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Zapytaj prowadzącego" })).toBeInTheDocument();
    expect(screen.getByText("Odpowiada Marta Zielińska. Pytanie widzisz tylko Ty i prowadzący.")).toBeInTheDocument();
  });

  it("kliknięcie nieczynnego przycisku niczego nie wysyła, a przycisk zostaje w kolejności fokusu", async () => {
    const uzytkownik = userEvent.setup();
    await otworz(zNagraniem());
    const przycisk = przyciskGlowny();

    await uzytkownik.click(przycisk);

    expect(ukonczLekcje).not.toHaveBeenCalled();
    expect(przycisk).not.toBeDisabled();
    expect(przycisk.tabIndex).toBe(0);
    przycisk.focus();
    expect(przycisk).toHaveFocus();
  });
});

describe("stan 2 — można ukończyć", () => {
  const MOZNA = { active_seconds: 960, watched_seconds: 960, completable: true };

  it("przycisk czynny (bez aria-disabled) i zdanie „Możesz już ukończyć tę lekcję.”", async () => {
    await otworz(zNagraniem(MOZNA));

    const przycisk = przyciskGlowny();
    expect(przycisk).toHaveTextContent("Oznacz lekcję jako ukończoną");
    expect(przycisk).not.toHaveAttribute("aria-disabled");
    expect(screen.getByText("Możesz już ukończyć tę lekcję.")).toBeInTheDocument();
    expect(screen.getByText("Obejrzane: 16 z 16 potrzebnych minut.")).toBeInTheDocument();
  });

  it("ukończenie: znacznik „Ukończona” z fokusem, przycisk prowadzi do lekcji 4, bez ponownego odczytu lekcji", async () => {
    const uzytkownik = userEvent.setup();
    ukonczLekcje.mockResolvedValue({ status: "ok", completed_at: "2026-10-03T12:30:00Z" });
    await otworz(zNagraniem(MOZNA));

    await uzytkownik.click(przyciskGlowny());

    const znacznik = await screen.findByText("Ukończona");
    expect(znacznik).toBeInTheDocument();
    expect(znacznik.closest('[role="status"]')).toHaveFocus();
    expect(przyciskGlowny()).toHaveTextContent("Przejdź do lekcji 4");
    expect(screen.getByText("Następna: „Rozmowa, która nie ocenia” (16 min).")).toBeInTheDocument();
    expect(screen.getByText("3 z 7 lekcji ukończone · następna to lekcja 4")).toBeInTheDocument();
    expect(screen.getByText("Lekcja ukończona. Nagranie możesz oglądać dowolnie.")).toBeInTheDocument();
    expect(pobierzDaneLekcji).toHaveBeenCalledTimes(1);
  });
});

describe("stan 3 — ukończona", () => {
  const UKONCZONA = { is_completed: true, active_seconds: 960, watched_seconds: 960, completable: true };

  it("znacznik „Ukończona”, zdanie o nagraniu i przycisk „Przejdź do lekcji 4”", async () => {
    await otworz(zNagraniem(UKONCZONA));

    expect(screen.getByText("Ukończona")).toBeInTheDocument();
    expect(screen.getByText("Lekcja ukończona. Nagranie możesz oglądać dowolnie.")).toBeInTheDocument();
    expect(screen.getByText("3 z 7 lekcji ukończone · następna to lekcja 4")).toBeInTheDocument();
    const przycisk = przyciskGlowny();
    expect(przycisk).toHaveTextContent("Przejdź do lekcji 4");
    expect(przycisk).not.toHaveAttribute("aria-disabled");
    expect(screen.getByText("Następna: „Rozmowa, która nie ocenia” (16 min).")).toBeInTheDocument();
  });

  it("przycisk prowadzi do następnej lekcji z kursem w adresie", async () => {
    const uzytkownik = userEvent.setup();
    await otworz(zNagraniem(UKONCZONA));

    await uzytkownik.click(przyciskGlowny());

    expect(push).toHaveBeenCalledWith("/panel/lekcje/22?kurs=pierwsza-pomoc-psychologiczna");
    expect(ukonczLekcje).not.toHaveBeenCalled();
  });
});

describe("stan 4 — lekcja bez nagrania", () => {
  it("podtytuł bez nagrania, brak sekcji nagrania, przycisk czynny z zdaniem o czytaniu", async () => {
    await otworz(bezNagrania());

    expect(screen.getByText("około 1 min czytania")).toBeInTheDocument();
    expect(screen.queryByText(/min nagrania/)).toBeNull();
    expect(screen.queryByRole("heading", { name: "Nagranie" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Odtwórz nagranie" })).toBeNull();
    const przycisk = przyciskGlowny();
    expect(przycisk).toHaveTextContent("Oznacz lekcję jako ukończoną");
    expect(przycisk).not.toHaveAttribute("aria-disabled");
    expect(screen.getByText("Przeczytaj lekcję i oznacz ją jako ukończoną.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Treść lekcji" })).toBeInTheDocument();
  });

  it("ukończenie lekcji bez nagrania idzie do serwera, który rozstrzyga o warunku", async () => {
    const uzytkownik = userEvent.setup();
    ukonczLekcje.mockResolvedValue({ status: "za-malo-czasu" });
    await otworz(bezNagrania());

    await uzytkownik.click(przyciskGlowny());

    expect(ukonczLekcje).toHaveBeenCalledWith("21");
    expect(await screen.findByText("Serwer nie pozwala jeszcze ukończyć tej lekcji.")).toBeInTheDocument();
  });
});

describe("stan 5 — nagranie w przygotowaniu", () => {
  it("zdanie o przygotowaniu, przycisk nieczynny z powodem, treść do czytania", async () => {
    await otworz(bezNagrania("w-przygotowaniu"));

    expect(screen.getByText("Nagranie jest w przygotowaniu.")).toBeInTheDocument();
    expect(screen.getByText(/Zwykle trwa to do 30 minut\. Tekst i materiały możesz czytać już teraz\./)).toBeInTheDocument();
    const przycisk = przyciskGlowny();
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Nagranie nie jest jeszcze gotowe. Lekcję ukończysz po jego obejrzeniu.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Odtwórz nagranie" })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Treść lekcji" })).toBeInTheDocument();
  });
});

describe("stan 6 — nagranie nie działa", () => {
  it("zdanie o błędzie, „Napisz do prowadzącego”, przycisk nieczynny z powodem", async () => {
    await otworz(bezNagrania("nie-dziala"));

    expect(screen.getByText("Tego nagrania nie da się teraz obejrzeć.")).toBeInTheDocument();
    expect(
      screen.getByText(/Tekst i materiały możesz czytać już teraz\. Jeśli to potrwa, napisz do prowadzącego\./),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Napisz do prowadzącego" })).toBeInTheDocument();
    const przycisk = przyciskGlowny();
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Lekcję ukończysz, gdy nagranie zacznie działać.")).toBeInTheDocument();
  });

  it("nagrania z błędem nie da się ukończyć: kliknięcie zielonego przycisku niczego nie wysyła", async () => {
    const uzytkownik = userEvent.setup();
    await otworz(bezNagrania("nie-dziala", { completable: true, active_seconds: 960 }));

    await uzytkownik.click(przyciskGlowny());

    expect(przyciskGlowny()).toHaveAttribute("aria-disabled", "true");
    expect(ukonczLekcje).not.toHaveBeenCalled();
  });

  it("„Napisz do prowadzącego” przewija do pytania i ustawia fokus w polu", async () => {
    const uzytkownik = userEvent.setup();
    await otworz(bezNagrania("nie-dziala"));

    await uzytkownik.click(screen.getByRole("button", { name: "Napisz do prowadzącego" }));

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "Twoje pytanie" })).toHaveFocus();
  });
});

describe("stan 7 — powrót do przerwanej lekcji", () => {
  it("duży przycisk „Odtwórz od 12. minuty”, zdanie o miejscu i „Odtwórz od początku”", async () => {
    await otworz(zNagraniem({ position_seconds: 720 }));

    expect(screen.getByRole("button", { name: "Odtwórz od 12. minuty" })).toBeInTheDocument();
    expect(screen.getByText("Ostatnio zatrzymano w 12. minucie.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Odtwórz od początku" })).toBeInTheDocument();
    expect(screen.getByText("12:00 / 20:00")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Miejsce w nagraniu" })).toHaveAttribute("aria-valuetext", "12. minuta z 20");
  });

  it("„Odtwórz od początku” cofa pozycję do 0 i zdejmuje zdanie o wznowieniu", async () => {
    const uzytkownik = userEvent.setup();
    await otworz(zNagraniem({ position_seconds: 720 }));

    await uzytkownik.click(screen.getByRole("button", { name: "Odtwórz od początku" }));

    expect(screen.queryByText("Ostatnio zatrzymano w 12. minucie.")).toBeNull();
    expect(screen.getByText(/^00:0\d \/ 20:00$/)).toBeInTheDocument();
  });
});

describe("jeden zielony przycisk na ekranie, w każdym stanie (K2)", () => {
  const STANY: [string, () => unknown][] = [
    ["brakuje czasu", () => zNagraniem()],
    ["można ukończyć", () => zNagraniem({ active_seconds: 960, completable: true })],
    ["ukończona", () => zNagraniem({ is_completed: true })],
    ["bez nagrania", () => bezNagrania()],
    ["w przygotowaniu", () => bezNagrania("w-przygotowaniu")],
    ["nie działa", () => bezNagrania("nie-dziala")],
    ["powrót", () => zNagraniem({ position_seconds: 720 })],
    ["bez treści, z plikami", () => zNagraniem({ content: null, description: null })],
  ];

  it.each(STANY)("%s: dokładnie jeden przycisk główny", async (_nazwa, wynik) => {
    await otworz(wynik());
    expect(zielone()).toHaveLength(1);
  });

  it.each(STANY)("%s: przycisk główny jest pierwszym przyciskiem w kolejności fokusu (nagłówek przed nagraniem)", async (_nazwa, wynik) => {
    await otworz(wynik());
    const przyciski = screen.getAllByRole("button");
    expect(przyciski[0]).toBe(zielone()[0]);
  });

  it("stan pusty (bez nagrania, treści i plików) też ma jeden zielony przycisk, a „Wróć do kursu” jest drugorzędny", async () => {
    await otworz(bezNagrania(undefined, { content: null, description: null }), kursZ({ materials: [] }));

    expect(screen.getByRole("heading", { name: "Lekcja bez treści" })).toBeInTheDocument();
    expect(zielone()).toHaveLength(1);
    expect(within(document.body).getByRole("button", { name: "Wróć do kursu" })).toBeInTheDocument();
  });
});
