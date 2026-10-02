import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import { alerty, naglowki, sprawdzJedenH1, sprawdzSpis, type OczekiwanyElement } from "@/nowy-front/pulpit/__tests__/co-widac";
import { KURS, LEKCJA, kursZ, wiszace, zrodloRamki } from "./pomoce";

/**
 * Co widać i co można zrobić w każdym stanie ekranu lekcji uczestnika: nagłówki,
 * jedyny przycisk główny (czynny albo nieczynny, ze zdaniem wyjaśniającym
 * wskazanym przez `aria-describedby`), nazwa dostępna każdego elementu, na który
 * da się wejść klawiaturą, w kolejności fokusu, tekst stanu i to, dokąd każdy
 * przycisk prowadzi. Stany bez danych lekcji (ładowanie, błąd, odmowy) nie mają
 * okruszków ani przycisku głównego, poza stanem lekcji zamkniętej kolejnością,
 * w którym przycisk główny jest jedyną akcją.
 *
 * Każdy stan ma kontrolę dodatnią: inny stan tego samego ekranu ma inny spis,
 * więc kontrola spisu nie przepuszcza wszystkiego.
 */

const pobierzDaneLekcji = vi.fn();
const ukonczLekcje = vi.fn();
const pobierzOdczytKursu = vi.fn();
const apiMe = vi.fn();
const push = vi.fn();
const wstecz = vi.fn();
let parametryAdresu = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: wstecz, refresh: vi.fn(), push, replace: vi.fn() }),
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
    ukonczLekcje: (...args: unknown[]) => ukonczLekcje(...args),
    pobierzPytania: async () => [],
  };
});

vi.mock("../kurs", async (importOriginal) => {
  const original = await importOriginal<typeof import("../kurs")>();
  return { ...original, pobierzOdczytKursu: (...args: unknown[]) => pobierzOdczytKursu(...args) };
});

const { Lekcja } = await import("../Lekcja");

const SLUG = "pierwsza-pomoc-psychologiczna";
const ADRES_KURSU = `/panel/kursy/${SLUG}`;
const ODMOWA_KOLEJNOSCI = "Ta lekcja będzie dostępna po ukończeniu poprzedniej.";
const MOZNA = { active_seconds: 960, watched_seconds: 960, completable: true };
const ZDANIE_CZEKANIA_NA_NAGRANIE = "Nagranie nie jest jeszcze gotowe. Lekcję ukończysz po jego obejrzeniu.";

const ZRODLO = zrodloRamki();
const zNagraniem = (nadpisz: Record<string, unknown> = {}) => ({
  status: "ok",
  dane: { ...LEKCJA, ...nadpisz },
  bezNagrania: false,
  zrodloNagrania: ZRODLO,
});
const bezNagrania = (nagranie?: "w-przygotowaniu" | "nie-dziala", nadpisz: Record<string, unknown> = {}) => ({
  status: "ok",
  dane: { ...LEKCJA, video_status: nagranie === undefined ? "none" : LEKCJA.video_status, ...nadpisz },
  bezNagrania: true,
  ...(nagranie === undefined ? {} : { nagranie }),
});
const odmowaKolejnosci = (wymaganaLekcjaId: number | null) => ({
  status: "lekcja-zamknieta",
  odmowaKolejnosci: true as const,
  komunikat: ODMOWA_KOLEJNOSCI,
  wymaganaLekcjaId,
});

/** Okruszki i odnośnik powrotu (widoczny na telefonie, ale stale w drzewie): cztery odnośniki, trzy z nich do strony kursu. */
function nawigacja(adres: (cel: string) => string = (cel) => cel, temat = "Kryzys i jego przebieg"): OczekiwanyElement[] {
  return [
    { rola: "link", nazwa: "Kursy", href: adres("/panel/kursy") },
    { rola: "link", nazwa: "Pierwsza pomoc psychologiczna", href: adres(ADRES_KURSU) },
    { rola: "link", nazwa: temat, href: adres(ADRES_KURSU) },
    { rola: "link", nazwa: `Wróć do tematu: ${temat}`, href: adres(ADRES_KURSU) },
  ];
}
const przyciskGlowny = (nazwa: string, opis: string, nieczynny = false): OczekiwanyElement => ({
  rola: "button",
  nazwa,
  glowny: true,
  nieczynny,
  opis,
});
const ramka = (tytul: string = LEKCJA.title): OczekiwanyElement => ({ rola: "iframe", nazwa: `Nagranie lekcji: ${tytul}` });
/** Rozmiar pliku ekran pisze z twardą spacją między liczbą a jednostką, więc taka stoi też w nazwie dostępnej przycisku. */
const NBSP = " ";
const PLIKI: OczekiwanyElement[] = [
  { rola: "button", nazwa: `Pobierz: Schemat decyzji w kryzysie.pdf, PDF, 241${NBSP}KB` },
  { rola: "button", nazwa: `Pobierz: Numery pomocowe w Polsce.pdf, PDF, 96${NBSP}KB` },
];
const PYTANIE: OczekiwanyElement[] = [
  { rola: "textbox", nazwa: "Twoje pytanie" },
  { rola: "button", nazwa: "Wyślij pytanie" },
];
const naglowkiLekcji = (...pozycje: [number, string][]) => [
  { poziom: 1, tekst: LEKCJA.title },
  ...pozycje.map(([poziom, tekst]) => ({ poziom, tekst })),
];
const Z_NAGRANIEM_I_PLIKAMI: [number, string][] = [
  [2, "Nagranie"],
  [2, "Treść lekcji"],
  [2, "Po co ta lekcja"],
  [2, "Materiały do pobrania"],
  [2, "Zapytaj prowadzącego"],
];

async function przeczekaj() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}

interface OpcjeOtwarcia {
  id?: string;
  parametry?: string;
  kurs?: unknown;
  rola?: string;
}

async function otworz(wynik: unknown, { id = "21", parametry = "", kurs = KURS, rola = "participant" }: OpcjeOtwarcia = {}) {
  parametryAdresu = parametry;
  apiMe.mockResolvedValue({ role: rola });
  pobierzDaneLekcji.mockImplementation(() => (typeof wynik === "function" ? wynik() : Promise.resolve(wynik)));
  pobierzOdczytKursu.mockResolvedValue(kurs);
  let kontener!: HTMLElement;
  await act(async () => {
    kontener = render(<Lekcja id={id} />).container;
  });
  await przeczekaj();
  return kontener;
}

beforeEach(() => {
  for (const atrapa of [pobierzDaneLekcji, ukonczLekcje, pobierzOdczytKursu, apiMe, push, wstecz]) atrapa.mockReset();
  parametryAdresu = "";
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

function kliknij(nazwa: string) {
  return act(async () => {
    fireEvent.click(screen.getByRole("button", { name: nazwa }));
  });
}

describe("ekran lekcji — stany bez danych lekcji: co widać i co można zrobić", () => {
  it("ładowanie: jeden main, szkielet ogłaszany jako zajęty, nic do naciśnięcia, żadnego komunikatu błędu", async () => {
    const kontener = await otworz(wiszace);

    jedenMain(kontener);
    sprawdzSpis(kontener, []);
    expect(kontener.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(alerty(kontener)).toEqual([]);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("błąd odczytu: h1 „Lekcja”, komunikat błędu z role=alert, jeden przycisk „Spróbuj ponownie” bez przycisku głównego", async () => {
    const kontener = await otworz({ status: "blad" });

    jedenMain(kontener);
    sprawdzJedenH1(kontener);
    expect(naglowki(kontener)).toEqual([
      { poziom: 1, tekst: "Lekcja" },
      { poziom: 3, tekst: "Nie udało się wczytać lekcji" },
    ]);
    sprawdzSpis(kontener, [{ rola: "button", nazwa: "Spróbuj ponownie" }]);
    const ogloszone = alerty(kontener);
    expect(ogloszone).toHaveLength(1);
    expect(ogloszone[0]).toContain("Nie udało się wczytać lekcji");
    expect(ogloszone[0]).toContain("Backend nie odpowiedział poprawnie — spróbuj ponownie później.");
  });

  it("błąd odczytu: „Spróbuj ponownie” czyta lekcję jeszcze raz i po sukcesie pokazuje ekran lekcji", async () => {
    const kontener = await otworz({ status: "blad" });
    expect(pobierzDaneLekcji).toHaveBeenCalledTimes(1);
    pobierzDaneLekcji.mockImplementation(() => Promise.resolve(bezNagrania()));

    await kliknij("Spróbuj ponownie");
    await przeczekaj();

    expect(pobierzDaneLekcji).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("heading", { level: 1, name: LEKCJA.title })).toBeInTheDocument();
    expect(alerty(kontener)).toEqual([]);
    expect(screen.queryByRole("button", { name: "Spróbuj ponownie" })).not.toBeInTheDocument();
  });

  it("nie znaleziono lekcji bez kursu w adresie: „Wróć do kursów” prowadzi na listę kursów", async () => {
    const kontener = await otworz({ status: "nie-znaleziono" });

    jedenMain(kontener);
    sprawdzJedenH1(kontener);
    expect(naglowki(kontener)).toEqual([{ poziom: 1, tekst: "Nie znaleziono lekcji" }]);
    sprawdzSpis(kontener, [{ rola: "button", nazwa: "Wróć do kursów" }]);
    expect(alerty(kontener)).toEqual([]);

    await kliknij("Wróć do kursów");
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/panel/kursy");
  });

  it("nie znaleziono lekcji z kursem w adresie: „Wróć do kursu” prowadzi na stronę tego kursu", async () => {
    const kontener = await otworz({ status: "nie-znaleziono" }, { parametry: `kurs=${SLUG}` });

    sprawdzSpis(kontener, [{ rola: "button", nazwa: "Wróć do kursu" }]);
    expect(naglowki(kontener)).toEqual([{ poziom: 1, tekst: "Nie znaleziono lekcji" }]);

    await kliknij("Wróć do kursu");
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(ADRES_KURSU);
  });

  it("brak dostępu (kurs zamknięty): zdanie z serwera, nagłówek odmowy z fokusem i jeden przycisk „Wróć do pulpitu”", async () => {
    const kontener = await otworz({ status: "zablokowany", komunikat: "Ukończ poprzedni kurs." });

    jedenMain(kontener);
    sprawdzJedenH1(kontener);
    expect(naglowki(kontener)).toEqual([{ poziom: 1, tekst: "Nie masz dostępu do tego ekranu" }]);
    sprawdzSpis(kontener, [{ rola: "button", nazwa: "Wróć do pulpitu" }]);
    expect(screen.getByText("Ukończ poprzedni kurs.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    expect(alerty(kontener)).toEqual([]);

    await kliknij("Wróć do pulpitu");
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/panel/pulpit");
  });

  it("dostęp wygasł: zdanie „co dalej” i jeden przycisk „Wróć do kursów”, bez tekstu z serwera", async () => {
    const kontener = await otworz({ status: "wygasl", komunikat: "Twój dostęp do platformy wygasł." });

    jedenMain(kontener);
    sprawdzJedenH1(kontener);
    expect(naglowki(kontener)).toEqual([{ poziom: 1, tekst: "Twój dostęp wygasł." }]);
    sprawdzSpis(kontener, [{ rola: "button", nazwa: "Wróć do kursów" }]);
    expect(screen.getByText("Skontaktuj się z zespołem programu, żeby przedłużyć dostęp.")).toBeInTheDocument();
    expect(screen.queryByText("Twój dostęp do platformy wygasł.")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();

    await kliknij("Wróć do kursów");
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/panel/kursy");
  });

  it("lekcja zamknięta kolejnością, numer wymaganej lekcji znany: przycisk główny „Przejdź do lekcji 2” prowadzi do niej", async () => {
    const kontener = await otworz(odmowaKolejnosci(20), { id: "22", parametry: `kurs=${SLUG}` });

    jedenMain(kontener);
    sprawdzJedenH1(kontener);
    expect(naglowki(kontener)).toEqual([{ poziom: 1, tekst: "Najpierw ukończ lekcję 2" }]);
    sprawdzSpis(kontener, [{ rola: "button", nazwa: "Przejdź do lekcji 2", glowny: true }]);
    expect(screen.getByText("Lekcje w tym kursie przechodzisz po kolei.")).toBeInTheDocument();
    expect(screen.queryByText(ODMOWA_KOLEJNOSCI)).not.toBeInTheDocument();

    await kliknij("Przejdź do lekcji 2");
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(`/panel/lekcje/20?kurs=${SLUG}`);
  });

  it("lekcja zamknięta kolejnością, numeru nie da się ustalić: zdanie z serwera i „Przejdź do wymaganej lekcji”", async () => {
    const kontener = await otworz(odmowaKolejnosci(999), { id: "22", parametry: `kurs=${SLUG}` });

    expect(naglowki(kontener)).toEqual([{ poziom: 1, tekst: "Ta lekcja jest jeszcze zamknięta" }]);
    sprawdzSpis(kontener, [{ rola: "button", nazwa: "Przejdź do wymaganej lekcji", glowny: true }]);
    expect(screen.getByText(ODMOWA_KOLEJNOSCI)).toBeInTheDocument();

    await kliknij("Przejdź do wymaganej lekcji");
    expect(push).toHaveBeenCalledWith(`/panel/lekcje/999?kurs=${SLUG}`);
  });

  it("lekcja zamknięta kolejnością bez wskazanej lekcji: „Wróć do kursu” prowadzi na stronę kursu, a bez kursu na listę kursów", async () => {
    const zKursem = await otworz(odmowaKolejnosci(null), { id: "22", parametry: `kurs=${SLUG}` });
    sprawdzSpis(zKursem, [{ rola: "button", nazwa: "Wróć do kursu", glowny: true }]);
    await kliknij("Wróć do kursu");
    expect(push).toHaveBeenLastCalledWith(ADRES_KURSU);
    cleanup();

    const bezKursu = await otworz(odmowaKolejnosci(null), { id: "22" });
    sprawdzSpis(bezKursu, [{ rola: "button", nazwa: "Wróć do kursu", glowny: true }]);
    await kliknij("Wróć do kursu");
    expect(push).toHaveBeenLastCalledWith("/panel/kursy");
  });

  it("kontrola dodatnia: spis odmowy i spis lekcji różnią się, więc spis odmowy czerwieni ekran z lekcją", async () => {
    const kontener = await otworz(zNagraniem());
    expect(() => sprawdzSpis(kontener, [{ rola: "button", nazwa: "Wróć do pulpitu" }])).toThrow();
    expect(() => sprawdzSpis(kontener, [{ rola: "button", nazwa: "Przejdź do lekcji 2", glowny: true }])).toThrow();
  });
});

describe("ekran lekcji — lekcja z nagraniem: co widać i co można zrobić", () => {
  it("brakuje czasu: przycisk główny nieczynny (aria-disabled, zostaje w kolejności fokusu) ze zdaniem w aria-live, potem nagranie, pliki i pytanie", async () => {
    const kontener = await otworz(zNagraniem());

    jedenMain(kontener);
    sprawdzJedenH1(kontener);
    expect(naglowki(kontener)).toEqual(naglowkiLekcji(...Z_NAGRANIEM_I_PLIKAMI));
    sprawdzSpis(kontener, [
      ...nawigacja(),
      przyciskGlowny("Oznacz lekcję jako ukończoną", "Zostały 4 minuty nagrania.", true),
      ramka(),
      ...PLIKI,
      ...PYTANIE,
    ]);
    expect(screen.getByText("Zostały 4 minuty nagrania.")).toHaveAttribute("aria-live", "polite");
    expect(alerty(kontener)).toEqual([]);
    expect(screen.queryByText("Ukończona")).not.toBeInTheDocument();
  });

  it("można ukończyć: ten sam przycisk jest czynny (bez aria-disabled), zdanie „Możesz już ukończyć tę lekcję.”", async () => {
    const kontener = await otworz(zNagraniem(MOZNA));

    sprawdzSpis(kontener, [
      ...nawigacja(),
      przyciskGlowny("Oznacz lekcję jako ukończoną", "Możesz już ukończyć tę lekcję."),
      ramka(),
      ...PLIKI,
      ...PYTANIE,
    ]);
    expect(naglowki(kontener)).toEqual(naglowkiLekcji(...Z_NAGRANIEM_I_PLIKAMI));
  });

  it("powrót do przerwanej lekcji: „Odtwórz od początku” stoi między przyciskiem głównym a ramką nagrania", async () => {
    const kontener = await otworz(zNagraniem({ position_seconds: 720 }));

    sprawdzSpis(kontener, [
      ...nawigacja(),
      przyciskGlowny("Oznacz lekcję jako ukończoną", "Zostały 4 minuty nagrania.", true),
      { rola: "button", nazwa: "Odtwórz od początku" },
      ramka(),
      ...PLIKI,
      ...PYTANIE,
    ]);
    expect(screen.getByText(/Ostatnio zatrzymano w 12\. minucie\./)).toBeInTheDocument();
  });

  it("ukończona, jest następna lekcja: znacznik „Ukończona” w region status, przycisk główny „Przejdź do lekcji 4” prowadzi do niej", async () => {
    const kontener = await otworz(zNagraniem({ is_completed: true }));

    sprawdzSpis(kontener, [
      ...nawigacja(),
      przyciskGlowny("Przejdź do lekcji 4", "Następna: „Rozmowa, która nie ocenia” (16 min)."),
      ramka(),
      ...PLIKI,
      ...PYTANIE,
    ]);
    expect(screen.getByText("Ukończona").closest('[role="status"]')).not.toBeNull();

    await kliknij("Przejdź do lekcji 4");
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(`/panel/lekcje/22?kurs=${SLUG}`);
    expect(ukonczLekcje).not.toHaveBeenCalled();
  });

  it("ukończona ostatnia lekcja tematu: „Przejdź do następnego tematu” z nazwą tematu w zdaniu i przejściem do jego pierwszej lekcji", async () => {
    const kontener = await otworz(zNagraniem({ id: 25, title: "Podsumowanie tematu", is_completed: true }), { id: "25" });

    sprawdzSpis(kontener, [
      ...nawigacja(),
      przyciskGlowny("Przejdź do następnego tematu", "Temat ukończony. Następny: „Rozmowa z osobą w kryzysie”."),
      ramka("Podsumowanie tematu"),
      ...PYTANIE,
    ]);

    await kliknij("Przejdź do następnego tematu");
    expect(push).toHaveBeenCalledWith(`/panel/lekcje/31?kurs=${SLUG}`);
  });

  it("ukończona ostatnia lekcja kursu z testem: „Przejdź do testu” prowadzi do testu kursu", async () => {
    const dane = {
      id: 31,
      title: "Pierwsze zdanie rozmowy",
      is_completed: true,
      topic: { id: 8, title: "Rozmowa z osobą w kryzysie", position: 2 },
    };
    const kontener = await otworz(zNagraniem(dane), { id: "31" });

    sprawdzSpis(kontener, [
      ...nawigacja(undefined, "Rozmowa z osobą w kryzysie"),
      przyciskGlowny("Przejdź do testu", "Wszystkie lekcje ukończone. Został test."),
      ramka("Pierwsze zdanie rozmowy"),
      ...PYTANIE,
    ]);

    await kliknij("Przejdź do testu");
    expect(push).toHaveBeenCalledWith(`${ADRES_KURSU}/test`);
  });

  it("ukończona ostatnia lekcja kursu bez testu: „Wróć do kursu” zamiast przejścia do testu", async () => {
    const dane = {
      id: 31,
      title: "Pierwsze zdanie rozmowy",
      is_completed: true,
      topic: { id: 8, title: "Rozmowa z osobą w kryzysie", position: 2 },
    };
    const kontener = await otworz(zNagraniem(dane), { id: "31", kurs: kursZ({ has_test: false }) });

    sprawdzSpis(kontener, [
      ...nawigacja(undefined, "Rozmowa z osobą w kryzysie"),
      przyciskGlowny("Wróć do kursu", "Wszystkie lekcje ukończone."),
      ramka("Pierwsze zdanie rozmowy"),
      ...PYTANIE,
    ]);
    expect(screen.queryByRole("button", { name: "Przejdź do testu" })).not.toBeInTheDocument();

    await kliknij("Wróć do kursu");
    expect(push).toHaveBeenCalledWith(ADRES_KURSU);
  });

  it("ukończona, a kursu nie udało się odczytać: „Wróć do kursu” ze zdaniem „Lekcja ukończona.”, bez paska postępu w temacie", async () => {
    const kontener = await otworz(zNagraniem({ is_completed: true }), { kurs: null });

    const przyciski = [...kontener.querySelectorAll("button")].map((p) => p.textContent);
    expect(przyciski).toContain("Wróć do kursu");
    expect(screen.getByText("Lekcja ukończona.")).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByText(/lekcji ukończone/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pobierz/ })).not.toBeInTheDocument();
    sprawdzSpis(kontener, [
      ...nawigacja(),
      przyciskGlowny("Wróć do kursu", "Lekcja ukończona."),
      ramka(),
      ...PYTANIE,
    ]);

    await kliknij("Wróć do kursu");
    expect(push).toHaveBeenCalledWith(ADRES_KURSU);
  });

  it("następna lekcja bez tematu: przycisk bez numeru „Przejdź do następnej lekcji” i jej tytuł w zdaniu", async () => {
    const lekcjaBezTematu = (id: number) => ({
      id,
      title: `Lekcja luzem ${id}`,
      sequence_order: id - 49,
      duration_seconds: 600,
      is_completed: id === 50,
      topic_id: null,
    });
    const kurs = kursZ({
      topics: [],
      lessons: [lekcjaBezTematu(50), lekcjaBezTematu(51)] as never,
      materials: [],
    });
    const kontener = await otworz(zNagraniem({ id: 50, title: "Lekcja luzem 50", is_completed: true, topic: null }), {
      id: "50",
      kurs,
    });

    const glowny = screen.getByRole("button", { name: "Przejdź do następnej lekcji" });
    expect(glowny).toHaveAccessibleDescription("Następna: „Lekcja luzem 51” (10 min).");
    expect(naglowki(kontener)[0]).toEqual({ poziom: 1, tekst: "Lekcja luzem 50" });

    await kliknij("Przejdź do następnej lekcji");
    expect(push).toHaveBeenCalledWith(`/panel/lekcje/51?kurs=${SLUG}`);
  });

  it("zapisywanie: przycisk zmienia nazwę na „Zapisywanie…”, drugie naciśnięcie nic nie wysyła, a po odpowiedzi pojawia się „Ukończona”", async () => {
    let zakoncz!: (wynik: unknown) => void;
    ukonczLekcje.mockImplementation(() => new Promise((rozwiaz) => (zakoncz = rozwiaz)));
    const kontener = await otworz(zNagraniem(MOZNA));

    await kliknij("Oznacz lekcję jako ukończoną");

    sprawdzSpis(kontener, [
      ...nawigacja(),
      przyciskGlowny("Zapisywanie…", "Możesz już ukończyć tę lekcję."),
      ramka(),
      ...PLIKI,
      ...PYTANIE,
    ]);
    await kliknij("Zapisywanie…");
    expect(ukonczLekcje).toHaveBeenCalledTimes(1);
    expect(ukonczLekcje).toHaveBeenCalledWith("21");

    await act(async () => {
      zakoncz({ status: "ok", completed_at: "2026-10-03T12:30:00Z" });
    });
    expect(screen.getByRole("button", { name: "Przejdź do lekcji 4" })).toHaveAccessibleDescription(
      "Następna: „Rozmowa, która nie ocenia” (16 min).",
    );
    expect(screen.queryByRole("button", { name: "Zapisywanie…" })).not.toBeInTheDocument();
  });

  it.each([
    ["serwer odmawia (za mało czasu)", { status: "za-malo-czasu" }, "Serwer nie pozwala jeszcze ukończyć tej lekcji."],
    ["błąd sieci", { status: "blad" }, "Nie udało się ukończyć lekcji. Sprawdź internet i naciśnij jeszcze raz."],
  ])("%s: jeden komunikat z role=alert, przycisk wraca do „Oznacz lekcję jako ukończoną” i opisuje się tym komunikatem", async (_nazwa, wynik, zdanie) => {
    ukonczLekcje.mockResolvedValue(wynik);
    const kontener = await otworz(zNagraniem(MOZNA));

    await kliknij("Oznacz lekcję jako ukończoną");

    const ogloszone = alerty(kontener);
    expect(ogloszone).toHaveLength(1);
    expect(ogloszone[0]).toContain(zdanie);
    const przycisk = screen.getByRole("button", { name: "Oznacz lekcję jako ukończoną" });
    expect(przycisk).not.toHaveAttribute("aria-disabled");
    expect(przycisk).toHaveAccessibleDescription(expect.stringContaining("Możesz już ukończyć tę lekcję."));
    expect(przycisk).toHaveAccessibleDescription(expect.stringContaining(zdanie));
    expect(screen.queryByText("Ukończona")).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("kontrola dodatnia: te same dane z innym stanem nagrania mają inny spis (czerwieni spis lekcji z nagraniem)", async () => {
    const kontener = await otworz(bezNagrania("w-przygotowaniu"));
    expect(() =>
      sprawdzSpis(kontener, [
        ...nawigacja(),
        przyciskGlowny("Oznacz lekcję jako ukończoną", "Zostały 4 minuty nagrania.", true),
        ramka(),
        ...PLIKI,
        ...PYTANIE,
      ]),
    ).toThrow();
  });
});

describe("ekran lekcji — lekcja bez odtwarzalnego nagrania: co widać i co można zrobić", () => {
  it("brak nagrania: bez sekcji „Nagranie” i ramki, przycisk główny czynny ze zdaniem o czytaniu", async () => {
    const kontener = await otworz(bezNagrania());

    jedenMain(kontener);
    sprawdzJedenH1(kontener);
    expect(naglowki(kontener)).toEqual(
      naglowkiLekcji([2, "Treść lekcji"], [2, "Po co ta lekcja"], [2, "Materiały do pobrania"], [2, "Zapytaj prowadzącego"]),
    );
    sprawdzSpis(kontener, [
      ...nawigacja(),
      przyciskGlowny("Oznacz lekcję jako ukończoną", "Przeczytaj lekcję i oznacz ją jako ukończoną."),
      ...PLIKI,
      ...PYTANIE,
    ]);
  });

  it("nagranie w przygotowaniu: zdanie w sekcji nagrania, przycisk główny nieczynny ze zdaniem o braku nagrania, bez ramki", async () => {
    const kontener = await otworz(bezNagrania("w-przygotowaniu"));

    expect(naglowki(kontener)).toEqual(naglowkiLekcji(...Z_NAGRANIEM_I_PLIKAMI));
    sprawdzSpis(kontener, [
      ...nawigacja(),
      przyciskGlowny("Oznacz lekcję jako ukończoną", ZDANIE_CZEKANIA_NA_NAGRANIE, true),
      ...PLIKI,
      ...PYTANIE,
    ]);
    expect(screen.getByText("Nagranie jest w przygotowaniu.")).toBeInTheDocument();
    expect(alerty(kontener)).toEqual([]);
  });

  it("nagranie nie działa: „Napisz do prowadzącego” stoi zaraz za przyciskiem głównym i prowadzi fokus do pola pytania", async () => {
    const kontener = await otworz(bezNagrania("nie-dziala"));

    expect(naglowki(kontener)).toEqual(naglowkiLekcji(...Z_NAGRANIEM_I_PLIKAMI));
    sprawdzSpis(kontener, [
      ...nawigacja(),
      przyciskGlowny("Oznacz lekcję jako ukończoną", "Lekcję ukończysz, gdy nagranie zacznie działać.", true),
      { rola: "button", nazwa: "Napisz do prowadzącego" },
      ...PLIKI,
      ...PYTANIE,
    ]);
    expect(screen.getByText("Tego nagrania nie da się teraz obejrzeć.")).toBeInTheDocument();

    await kliknij("Napisz do prowadzącego");
    expect(screen.getByRole("textbox", { name: "Twoje pytanie" })).toHaveFocus();
  });

  it("lekcja bez nagrania, treści i plików: stan pusty z przyciskiem drugorzędnym „Wróć do kursu”, który wraca o krok", async () => {
    const kontener = await otworz(bezNagrania(undefined, { content: null, description: null }), {
      kurs: kursZ({ materials: [] }),
    });

    expect(naglowki(kontener)).toEqual(naglowkiLekcji([2, "Lekcja bez treści"], [2, "Zapytaj prowadzącego"]));
    sprawdzSpis(kontener, [
      ...nawigacja(),
      przyciskGlowny("Oznacz lekcję jako ukończoną", "Przeczytaj lekcję i oznacz ją jako ukończoną."),
      { rola: "button", nazwa: "Wróć do kursu" },
      ...PYTANIE,
    ]);
    expect(screen.getByText("Ta lekcja nie ma jeszcze nagrania ani treści.")).toBeInTheDocument();

    await kliknij("Wróć do kursu");
    expect(wstecz).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });
});

describe("ekran lekcji — podgląd personelu: co widać i co można zrobić", () => {
  it("pas podglądu z odnośnikiem do edycji kursu jest pierwszy; przycisk główny, pole i „Wyślij pytanie” są nieczynne ze zdaniem o podglądzie, odnośniki niosą parametr podglądu", async () => {
    const kontener = await otworz(zNagraniem(MOZNA), {
      parametry: `kurs=${SLUG}&podglad=1`,
      rola: "project_manager",
    });
    const zPodgladem = (cel: string) => `${cel}?podglad=1`;

    sprawdzSpis(kontener, [
      { rola: "link", nazwa: "Wróć do edycji kursu", href: "/admin/kursy/3" },
      ...nawigacja(zPodgladem),
      przyciskGlowny("Oznacz lekcję jako ukończoną", "W podglądzie nic się nie zapisuje", true),
      ramka(),
      ...PLIKI,
      { rola: "textbox", nazwa: "Twoje pytanie", opis: "W podglądzie nic się nie zapisuje" },
      { rola: "button", nazwa: "Wyślij pytanie", nieczynny: true, opis: "W podglądzie nic się nie zapisuje" },
    ]);

    await kliknij("Oznacz lekcję jako ukończoną");
    expect(ukonczLekcje).not.toHaveBeenCalled();
  });

  it("kontrola dodatnia: ten sam ekran bez parametru podglądu nie ma pasa i ma czynny przycisk ukończenia", async () => {
    const kontener = await otworz(zNagraniem(MOZNA), { parametry: `kurs=${SLUG}`, rola: "project_manager" });

    expect(screen.queryByRole("link", { name: "Wróć do edycji kursu" })).not.toBeInTheDocument();
    expect(() =>
      sprawdzSpis(kontener, [{ rola: "link", nazwa: "Wróć do edycji kursu", href: "/admin/kursy/3" }]),
    ).toThrow();
    expect(screen.getByRole("button", { name: "Oznacz lekcję jako ukończoną" })).not.toHaveAttribute("aria-disabled");
  });
});
