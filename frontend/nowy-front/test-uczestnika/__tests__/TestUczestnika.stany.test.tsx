import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HISTORIA, HISTORIA_ZALICZONA, KURS, PYTANIA, SLUG, test as daneTestu, wynik as daneWyniku } from "./atrapy";

/**
 * Stany ekranu testu końcowego: co osoba widzi (nagłówek, zdanie stanu, jedyny
 * zielony przycisk, to, czy jest czynny, i zdanie, które mówi dlaczego) i co
 * może zrobić. Żądania są atrapami modułu danych; klasyfikacja błędów jest
 * prawdziwa, więc stany powstają z tych samych odpowiedzi serwera co na żywo.
 */

const pobierzTest = vi.fn();
const pobierzKursTestu = vi.fn();
const pobierzHistorie = vi.fn();
const wyslijPodejscie = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// Odczyt konta wspólnego ekranu odmowy: bez sieci, ekran pomija wtedy zdanie o osobie.
vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: () => Promise.reject(new TypeError("Brak sieci w teście")),
}));

vi.mock("../dane", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../dane")>()),
  pobierzTest: (...args: unknown[]) => pobierzTest(...args),
  pobierzKursTestu: (...args: unknown[]) => pobierzKursTestu(...args),
  pobierzHistorie: (...args: unknown[]) => pobierzHistorie(...args),
  wyslijPodejscie: (...args: unknown[]) => wyslijPodejscie(...args),
}));

const { ApiError } = await import("@/lib/api/klient");
const { TestUczestnika } = await import("../TestUczestnika");

const blad = (status: number, code: string, message = "Zdanie serwera.", reason?: Record<string, unknown>) =>
  new ApiError({ status, code, message, reason });

/** Zielone przyciski poza oknem potwierdzenia. */
function zielone() {
  return screen
    .queryAllByRole("button")
    .filter((przycisk) => przycisk.closest('[role="dialog"]') === null)
    .filter((przycisk) => przycisk.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)));
}

function przyciskGlowny() {
  const lista = zielone();
  expect(lista).toHaveLength(1);
  return lista[0];
}

async function otworz(opcje: { test?: unknown; blad?: unknown; kurs?: unknown } = {}) {
  if (opcje.blad !== undefined) pobierzTest.mockRejectedValue(opcje.blad);
  else pobierzTest.mockResolvedValue(opcje.test ?? daneTestu());
  pobierzKursTestu.mockResolvedValue(opcje.kurs === undefined ? KURS : opcje.kurs);
  const wynik = render(<TestUczestnika slug={SLUG} />);
  await waitFor(() => expect(screen.queryByText("Ładowanie testu…")).toBeNull());
  return wynik;
}

async function przejdzDoOstatniego(uzytkownik: ReturnType<typeof userEvent.setup>) {
  await uzytkownik.click(przyciskGlowny());
  for (const [indeks, pytanie] of PYTANIA.entries()) {
    await uzytkownik.click(screen.getByRole("radio", { name: pytanie.answers[0].body }));
    if (indeks < PYTANIA.length - 1) await uzytkownik.click(przyciskGlowny());
  }
}

beforeEach(() => {
  pobierzTest.mockReset();
  pobierzKursTestu.mockReset();
  pobierzHistorie.mockReset().mockResolvedValue([]);
  wyslijPodejscie.mockReset();
  push.mockReset();
});

describe("nagłówek wspólny dla stanów", () => {
  it("tytuł „Test końcowy”, nazwa kursu i „Wróć do kursu” z nazwą kursu w nazwie dostępnej", async () => {
    await otworz();
    expect(screen.getByRole("heading", { level: 1, name: "Test końcowy" })).toBeInTheDocument();
    expect(screen.getByText("Pierwsza pomoc psychologiczna")).toBeInTheDocument();
    const powrot = screen.getByRole("link", { name: "Wróć do kursu: Pierwsza pomoc psychologiczna" });
    expect(powrot).toHaveAttribute("href", `/panel/kursy/${SLUG}`);
    expect(powrot).toHaveTextContent("Wróć do kursu");
  });

  it("nieudany odczyt kursu nie zatrzymuje testu: nagłówek bez nazwy kursu", async () => {
    await otworz({ kurs: null });
    expect(screen.getByRole("heading", { level: 2, name: "Zanim zaczniesz" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Wróć do kursu" })).toBeInTheDocument();
    expect(screen.queryByText("Pierwsza pomoc psychologiczna")).toBeNull();
  });
});

describe("ładowanie", () => {
  it("zdanie stanu „Ładowanie testu…”, szkielet i brak zielonego przycisku", () => {
    pobierzTest.mockReturnValue(new Promise(() => {}));
    pobierzKursTestu.mockReturnValue(new Promise(() => {}));
    render(<TestUczestnika slug={SLUG} />);
    expect(screen.getByRole("heading", { level: 1, name: "Test końcowy" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Ładowanie testu…");
    expect(zielone()).toHaveLength(0);
  });
});

describe("błąd odczytu", () => {
  it("nagłówek i zdanie błędu, czynny „Spróbuj ponownie”, który wczytuje test od nowa", async () => {
    const uzytkownik = userEvent.setup();
    await otworz({ blad: blad(500, "server_error") });

    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się wczytać testu");
    expect(screen.getByRole("heading", { level: 2, name: "Nie udało się wczytać testu" })).toBeInTheDocument();
    const przycisk = przyciskGlowny();
    expect(przycisk).toHaveTextContent("Spróbuj ponownie");
    expect(przycisk).not.toHaveAttribute("aria-disabled");
    expect(przycisk).toHaveAccessibleDescription("Twoje podejścia nie zostały zużyte.");

    pobierzTest.mockResolvedValue(daneTestu());
    await uzytkownik.click(przycisk);
    expect(await screen.findByRole("heading", { level: 2, name: "Zanim zaczniesz" })).toBeInTheDocument();
    expect(pobierzTest).toHaveBeenCalledTimes(2);
  });
});

describe("brak połączenia", () => {
  it("„Brak połączenia”, zdanie o internecie i czynny „Spróbuj ponownie”", async () => {
    await otworz({ blad: new TypeError("Failed to fetch") });

    expect(screen.getByRole("heading", { level: 2, name: "Brak połączenia" })).toBeInTheDocument();
    expect(screen.getByText("Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.")).toBeInTheDocument();
    const przycisk = przyciskGlowny();
    expect(przycisk).toHaveTextContent("Spróbuj ponownie");
    expect(przycisk).not.toHaveAttribute("aria-disabled");
  });
});

describe("nie znaleziono i brak dostępu — wspólny ekran odmowy", () => {
  it("test nie istnieje: „Nie znaleziono testu” z jednym przyciskiem „Wróć do kursu”, bez zielonego", async () => {
    const uzytkownik = userEvent.setup();
    await otworz({ blad: blad(404, "not_found") });

    expect(screen.getByRole("heading", { level: 2, name: "Nie znaleziono testu" })).toBeInTheDocument();
    expect(zielone()).toHaveLength(0);
    const przycisk = screen.getByRole("button", { name: "Wróć do kursu" });
    // Przycisk wspólnego ekranu stoi w opakowaniu ekranu, które na telefonie rozciąga go na całą szerokość.
    expect(przycisk.closest('[class*="odmowa"]')).not.toBeNull();
    await uzytkownik.click(przycisk);
    expect(push).toHaveBeenCalledWith(`/panel/kursy/${SLUG}`);
  });

  it("kursu nie ma: „Nie znaleziono kursu” i powrót do listy kursów", async () => {
    await otworz({ blad: blad(404, "not_found"), kurs: "nie-znaleziono" });

    expect(screen.getByRole("heading", { level: 2, name: "Nie znaleziono kursu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wróć do listy kursów" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Wróć do listy kursów" })).toHaveAttribute("href", "/panel/kursy");
  });

  it("kurs zamknięty kolejnością ścieżki: „Nie masz dostępu do tego ekranu” ze zdaniem serwera", async () => {
    const uzytkownik = userEvent.setup();
    await otworz({ blad: blad(403, "course_locked", "Najpierw ukończ poprzedni etap ścieżki.") });

    expect(screen.getByRole("heading", { level: 2, name: "Nie masz dostępu do tego ekranu" })).toBeInTheDocument();
    expect(screen.getByText("Najpierw ukończ poprzedni etap ścieżki.")).toBeInTheDocument();
    expect(zielone()).toHaveLength(0);
    const przycisk = screen.getByRole("button", { name: "Wróć do pulpitu" });
    expect(przycisk.closest('[class*="odmowa"]')).not.toBeNull();
    await uzytkownik.click(przycisk);
    expect(push).toHaveBeenCalledWith("/panel/pulpit");
  });

  it("inna odmowa 403 też jest brakiem dostępu ze zdaniem serwera", async () => {
    await otworz({ blad: blad(403, "forbidden", "Ta sekcja nie jest dla Twojej roli.") });
    expect(screen.getByRole("heading", { level: 2, name: "Nie masz dostępu do tego ekranu" })).toBeInTheDocument();
    expect(screen.getByText("Ta sekcja nie jest dla Twojej roli.")).toBeInTheDocument();
  });

  it("dostęp wygasł: wspólny ekran wygaśnięcia", async () => {
    await otworz({ blad: blad(403, "access_expired") });
    expect(screen.getByRole("heading", { level: 2, name: "Twój dostęp wygasł." })).toBeInTheDocument();
  });
});

describe("test zamknięty, bo lekcje nie są ukończone", () => {
  it("nagłówek, zdanie z liczbą lekcji i czynny „Wróć do kursu”", async () => {
    const uzytkownik = userEvent.setup();
    await otworz({ blad: blad(422, "conditions_not_met", "x", { missing: ["lessons"] }), kurs: { ...KURS, nieukonczone: 2 } });

    expect(screen.getByRole("heading", { level: 2, name: "Test otworzy się po ukończeniu lekcji" })).toBeInTheDocument();
    expect(screen.getByText("Zostały Ci 2 lekcje do ukończenia. Test otworzy się po ostatniej z nich.")).toBeInTheDocument();
    const przycisk = przyciskGlowny();
    expect(przycisk).toHaveTextContent("Wróć do kursu");
    expect(przycisk).not.toHaveAttribute("aria-disabled");
    expect(przycisk).toHaveAccessibleDescription("Lekcje znajdziesz na stronie kursu.");
    await uzytkownik.click(przycisk);
    expect(push).toHaveBeenCalledWith(`/panel/kursy/${SLUG}`);
  });
});

describe("kurs bez testu końcowego", () => {
  it("404 testu i has_test: false w kursie → „Ten kurs nie ma testu końcowego” z powrotem do kursu", async () => {
    await otworz({ blad: blad(404, "not_found"), kurs: { ...KURS, has_test: false } });

    expect(screen.getByRole("heading", { level: 2, name: "Ten kurs nie ma testu końcowego" })).toBeInTheDocument();
    expect(screen.getByText("Kurs kończysz, gdy ukończysz wszystkie jego lekcje.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Nie znaleziono/ })).toBeNull();
    expect(przyciskGlowny()).toHaveTextContent("Wróć do kursu");
  });
});

describe("gotowy do startu", () => {
  it("liczby testu z odczytu (próg, podejścia z limitu edycji), zdanie przebiegu i czynny „Rozpocznij test”", async () => {
    await otworz({ test: daneTestu({ attempts_used: 1, attempts_limit: 4, pass_threshold: 70 }) });

    const karta = screen.getByRole("region", { name: "Zanim zaczniesz" });
    expect(within(karta).getByText("Pytania").nextElementSibling).toHaveTextContent("3");
    expect(within(karta).getByText("Próg zaliczenia").nextElementSibling).toHaveTextContent("70%");
    expect(within(karta).getByText("Wykorzystane podejścia").nextElementSibling).toHaveTextContent("1 z 4");
    expect(within(karta).getByText("Pozostało podejść").nextElementSibling).toHaveTextContent("3");
    expect(screen.getByText(/Pytania pokazują się po kolei, bez możliwości cofania\./)).toBeInTheDocument();
    const przycisk = przyciskGlowny();
    expect(przycisk).toHaveTextContent("Rozpocznij test");
    expect(przycisk).not.toHaveAttribute("aria-disabled");
    expect(przycisk).toHaveAccessibleDescription("Zostały Ci 3 podejścia z 4.");
  });

  it("historia podejść z datą ze wspólnego formatera i stanem słowem", async () => {
    pobierzHistorie.mockResolvedValue(HISTORIA);
    await otworz();
    const historia = await screen.findByRole("region", { name: "Historia podejść" });
    expect(within(historia).getByText("Podejście 1 · 30 września 2026, 20:50")).toBeInTheDocument();
    expect(within(historia).getByText("niezaliczone")).toBeInTheDocument();
    expect(pobierzHistorie).toHaveBeenCalledWith(10);
  });
});

describe("brak podejść", () => {
  it("„Nie masz już podejść”, przycisk z kłódką nieczynny i zdanie dlaczego; kliknięcie niczego nie robi", async () => {
    const uzytkownik = userEvent.setup();
    await otworz({ test: daneTestu({ attempts_used: 5, attempts_limit: 5 }) });

    expect(screen.getByRole("heading", { level: 2, name: "Nie masz już podejść" })).toBeInTheDocument();
    const przycisk = przyciskGlowny();
    expect(przycisk).toHaveTextContent("Rozpocznij test");
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    expect(przycisk.querySelector("svg")).not.toBeNull();
    expect(przycisk).toHaveAccessibleDescription(
      "Wykorzystano wszystkie podejścia: 5 z 5. Skontaktuj się z zespołem programu, żeby zresetować limit podejść.",
    );
    await uzytkownik.click(przycisk);
    expect(screen.queryByRole("radio")).toBeNull();
    expect(przycisk.tabIndex).toBe(0);
  });
});

describe("w trakcie", () => {
  it("pytanie po kolei: nagłówek „Pytanie 1 z 3”, pasek odpowiedzi, przejście dalej dopiero po zaznaczeniu", async () => {
    const uzytkownik = userEvent.setup();
    await otworz();
    await uzytkownik.click(przyciskGlowny());

    expect(screen.getByRole("heading", { level: 2, name: "Pytanie 1 z 3" })).toHaveFocus();
    expect(screen.getByRole("group", { name: PYTANIA[0].body })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Odpowiedzi: 0 z 3" })).toBeInTheDocument();
    let przycisk = przyciskGlowny();
    expect(przycisk).toHaveTextContent("Następne pytanie");
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    expect(przycisk).toHaveAccessibleDescription("Zaznacz odpowiedź, żeby przejść dalej.");

    await uzytkownik.click(przycisk);
    expect(screen.getByRole("heading", { level: 2, name: "Pytanie 1 z 3" })).toBeInTheDocument();

    await uzytkownik.click(screen.getByRole("radio", { name: PYTANIA[0].answers[0].body }));
    przycisk = przyciskGlowny();
    expect(przycisk).not.toHaveAttribute("aria-disabled");
    expect(przycisk).toHaveAccessibleDescription("Do tego pytania nie wrócisz po przejściu dalej.");
    expect(screen.getByRole("progressbar", { name: "Odpowiedzi: 1 z 3" })).toBeInTheDocument();

    await uzytkownik.click(przycisk);
    expect(screen.getByRole("heading", { level: 2, name: "Pytanie 2 z 3" })).toHaveFocus();
    expect(screen.queryByRole("button", { name: /Poprzednie|Wstecz/ })).toBeNull();
  });

  it("ostatnie pytanie: „Zakończ i sprawdź”, a przed wysłaniem okno mówi tylko, że odpowiedzi nie da się zmienić", async () => {
    const uzytkownik = userEvent.setup();
    await otworz();
    await przejdzDoOstatniego(uzytkownik);

    const przycisk = przyciskGlowny();
    expect(przycisk).toHaveTextContent("Zakończ i sprawdź");
    expect(przycisk).toHaveAccessibleDescription("Przed wysłaniem poprosimy Cię o potwierdzenie.");
    await uzytkownik.click(przycisk);

    const okno = screen.getByRole("dialog", { name: "Wysłać odpowiedzi?" });
    expect(within(okno).getByText("Po wysłaniu nie zmienisz odpowiedzi.")).toBeInTheDocument();
    expect(within(okno).queryByText(/Bez odpowiedzi/)).toBeNull();
    expect(wyslijPodejscie).not.toHaveBeenCalled();

    await uzytkownik.click(within(okno).getByRole("button", { name: "Wróć do pytania" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Pytanie 3 z 3" })).toBeInTheDocument();
    expect(wyslijPodejscie).not.toHaveBeenCalled();
  });

  it("wysłanie jest nieodwracalne: okno w wariancie niebezpiecznym, fokus startuje na „Wróć do pytania”", async () => {
    const uzytkownik = userEvent.setup();
    await otworz();
    await przejdzDoOstatniego(uzytkownik);
    await uzytkownik.click(przyciskGlowny());

    const okno = screen.getByRole("dialog", { name: "Wysłać odpowiedzi?" });
    const wyslij = within(okno).getByRole("button", { name: "Wyślij odpowiedzi" });
    expect(wyslij.className).toMatch(/niebezpieczny/);
    expect(within(okno).getByRole("button", { name: "Wróć do pytania" })).toHaveFocus();
  });

  it("nieudane wysłanie zostawia odpowiedzi i pokazuje zdanie błędu przy przycisku", async () => {
    const uzytkownik = userEvent.setup();
    wyslijPodejscie.mockRejectedValue(new TypeError("Failed to fetch"));
    await otworz();
    await przejdzDoOstatniego(uzytkownik);
    await uzytkownik.click(przyciskGlowny());
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij odpowiedzi" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Nie udało się wysłać odpowiedzi. Sprawdź internet i spróbuj ponownie.");
    expect(screen.getByRole("radio", { name: PYTANIA[2].answers[0].body })).toBeChecked();
    expect(przyciskGlowny()).toHaveTextContent("Zakończ i sprawdź");
    expect(przyciskGlowny()).toHaveAccessibleDescription(/Nie udało się wysłać odpowiedzi/);
  });
});

describe("wysyłanie", () => {
  it("„Wysyłanie…” nieczynne ze zdaniem, odpowiedzi zablokowane; żądanie niesie wszystkie odpowiedzi", async () => {
    const uzytkownik = userEvent.setup();
    wyslijPodejscie.mockReturnValue(new Promise(() => {}));
    await otworz();
    await przejdzDoOstatniego(uzytkownik);
    await uzytkownik.click(przyciskGlowny());
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij odpowiedzi" }));

    const przycisk = przyciskGlowny();
    expect(przycisk).toHaveTextContent("Wysyłanie…");
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    expect(przycisk).toHaveAccessibleDescription("Sprawdzamy Twoje odpowiedzi.");
    expect(screen.getByRole("radio", { name: PYTANIA[2].answers[0].body })).toBeDisabled();
    expect(wyslijPodejscie).toHaveBeenCalledTimes(1);
    expect(wyslijPodejscie).toHaveBeenCalledWith(10, { 41: 210, 42: 220, 43: 230 });

    await uzytkownik.click(przycisk);
    expect(wyslijPodejscie).toHaveBeenCalledTimes(1);
  });
});

describe("wynik", () => {
  async function wyslijZWynikiem(wynik: unknown, test = daneTestu()) {
    const uzytkownik = userEvent.setup();
    wyslijPodejscie.mockResolvedValue(wynik);
    await otworz({ test });
    await przejdzDoOstatniego(uzytkownik);
    await uzytkownik.click(przyciskGlowny());
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij odpowiedzi" }));
    await screen.findByText(/^Test (zaliczony|niezaliczony)$/);
    return uzytkownik;
  }

  it("zaliczony: wynik w procentach, próg, plakietka, gratulacje i czynny „Wróć do kursu”", async () => {
    const uzytkownik = await wyslijZWynikiem(daneWyniku({ attempt_number: 2, score_percent: 100, passed: true }));

    expect(screen.getByRole("heading", { level: 2, name: "Test zaliczony" })).toHaveFocus();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("Próg zaliczenia: 70% · Podejście 2 z 4")).toBeInTheDocument();
    expect(screen.getByText("Zaliczony")).toBeInTheDocument();
    expect(screen.getByText("Gratulacje — kolejny etap ścieżki został odblokowany.")).toBeInTheDocument();
    const przycisk = przyciskGlowny();
    expect(przycisk).toHaveTextContent("Wróć do kursu");
    expect(przycisk).not.toHaveAttribute("aria-disabled");
    await uzytkownik.click(przycisk);
    expect(push).toHaveBeenCalledWith(`/panel/kursy/${SLUG}`);
    expect(pobierzHistorie).toHaveBeenCalledTimes(2);
  });

  it("niezaliczony z podejściami: lista pytań z błędem i czynny „Podejdź ponownie”, który wczytuje test od nowa", async () => {
    const uzytkownik = await wyslijZWynikiem(daneWyniku({ attempt_number: 2, score_percent: 33, passed: false, wrong_question_ids: [42, 43] }));

    expect(screen.getByRole("heading", { level: 2, name: "Test niezaliczony" })).toBeInTheDocument();
    expect(screen.getByText("Niezaliczony")).toBeInTheDocument();
    expect(screen.getByText("Test niezaliczony. Zostały Ci 2 podejścia.")).toBeInTheDocument();
    const lista = screen.getByRole("region", { name: "Pytania z błędną odpowiedzią" });
    expect(within(lista).getAllByRole("listitem").map((el) => el.textContent)).toEqual([PYTANIA[1].body, PYTANIA[2].body]);
    const przycisk = przyciskGlowny();
    expect(przycisk).toHaveTextContent("Podejdź ponownie");
    expect(przycisk).not.toHaveAttribute("aria-disabled");
    expect(przycisk).toHaveAccessibleDescription("Zostały Ci 2 podejścia z 4.");

    pobierzTest.mockResolvedValue(daneTestu({ attempts_used: 2 }));
    await uzytkownik.click(przycisk);
    expect(await screen.findByRole("heading", { level: 2, name: "Zanim zaczniesz" })).toBeInTheDocument();
    expect(pobierzTest).toHaveBeenCalledTimes(2);
    expect(pobierzKursTestu).toHaveBeenCalledTimes(1);
  });

  it("niezaliczony po ostatnim podejściu: „Podejdź ponownie” nieczynny z kłódką i zdaniem dlaczego", async () => {
    await wyslijZWynikiem(daneWyniku({ attempt_number: 4, score_percent: 33, passed: false, wrong_question_ids: [41] }));

    const przycisk = przyciskGlowny();
    expect(przycisk).toHaveTextContent("Podejdź ponownie");
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    expect(przycisk).toHaveAccessibleDescription("Nie masz już podejść. Skontaktuj się z zespołem programu, żeby zresetować limit podejść.");
  });

  it("serwer odmawia podejścia (403 attempts_exhausted): stan braku podejść ze zdaniem serwera", async () => {
    const uzytkownik = userEvent.setup();
    wyslijPodejscie.mockRejectedValue(blad(403, "attempts_exhausted", "Wykorzystałeś wszystkie dostępne podejścia do tego testu."));
    await otworz();
    await przejdzDoOstatniego(uzytkownik);
    await uzytkownik.click(przyciskGlowny());
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij odpowiedzi" }));

    expect(await screen.findByRole("heading", { level: 2, name: "Nie masz już podejść" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Wykorzystałeś wszystkie dostępne podejścia do tego testu.");
    expect(przyciskGlowny()).toHaveAttribute("aria-disabled", "true");
  });
});

describe("test już zaliczony — pole passed z odczytu testu", () => {
  it("wynik i „Test zaliczony” zamiast „Rozpocznij”; zielony „Wróć do kursu” prowadzi do kursu", async () => {
    const uzytkownik = userEvent.setup();
    pobierzHistorie.mockResolvedValue(HISTORIA_ZALICZONA);
    await otworz({ test: daneTestu({ passed: true, attempts_used: 2 }) });

    const karta = screen.getByRole("region", { name: "Test zaliczony" });
    expect(await within(karta).findByText("85%")).toBeInTheDocument();
    expect(within(karta).getByText("Próg zaliczenia: 70% · Podejście 2 z 4")).toBeInTheDocument();
    expect(within(karta).getByText("Zaliczony")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Zanim zaczniesz" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Rozpocznij/ })).toBeNull();

    const przycisk = przyciskGlowny();
    expect(przycisk).toHaveTextContent("Wróć do kursu");
    expect(przycisk).not.toHaveAttribute("aria-disabled");
    expect(przycisk).toHaveAccessibleDescription("Test zaliczony.");
    await uzytkownik.click(przycisk);
    expect(push).toHaveBeenCalledWith(`/panel/kursy/${SLUG}`);
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("bez historii (nieudany odczyt) nadal „Test zaliczony” z progiem, bez „Rozpocznij”", async () => {
    pobierzHistorie.mockResolvedValue(null);
    await otworz({ test: daneTestu({ passed: true }) });

    const karta = screen.getByRole("region", { name: "Test zaliczony" });
    expect(within(karta).getByText("Próg zaliczenia: 70%")).toBeInTheDocument();
    expect(within(karta).getByText("Zaliczony")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Rozpocznij/ })).toBeNull();
    expect(przyciskGlowny()).toHaveTextContent("Wróć do kursu");
  });

  it("serwer odmawia podejścia, bo test jest już zaliczony (403 test_already_passed): ekran wczytuje test od nowa i pokazuje zaliczenie", async () => {
    const uzytkownik = userEvent.setup();
    wyslijPodejscie.mockRejectedValue(blad(403, "test_already_passed", "Ten test jest już zaliczony."));
    await otworz();
    await przejdzDoOstatniego(uzytkownik);
    pobierzTest.mockResolvedValue(daneTestu({ passed: true, attempts_used: 2 }));
    await uzytkownik.click(przyciskGlowny());
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij odpowiedzi" }));

    expect(await screen.findByRole("heading", { level: 2, name: "Test zaliczony" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Rozpocznij/ })).toBeNull();
    expect(pobierzTest).toHaveBeenCalledTimes(2);
  });
});
