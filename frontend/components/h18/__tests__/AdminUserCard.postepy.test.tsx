import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * Świadek pięciu wartości karty osoby (H18 · `AdminUserCard.tsx`, sekcja
 * „Postępy"): warunki dla osoby zebrane w jednym miejscu, ukończone etapy,
 * zaakceptowane godziny stażu, odbyte superwizje, zaliczenie warsztatu.
 * Podmieniona jest wyłącznie warstwa API (`@/lib/api`) — karta renderuje się
 * bez sieci, na prawdziwym kodzie komponentu.
 *
 * Wartości w danych są PARAMI RÓŻNE (4, 9, "37", 12, TAK) właśnie po to, żeby
 * zamiana dwóch pól w źródle dała czerwony wynik zamiast przypadkowo zgodnej
 * liczby — inaczej test godzin stażu mógłby przejść nawet czytając pole
 * superwizji.
 *
 * Etykieta i wartość są czytane parą przez `wartoscPrzy`, tak jak wiąże je
 * sam HTML listy opisowej (`<dl>`): z `<dl>` sekcji „Postępy" zbierane są
 * `dt, dd` jednym zapytaniem w kolejności dokumentu (zapytanie schodzi przez
 * opakowujące `<div>`-y, więc spłaszczenie ich niczego nie psuje), szukany
 * jest `<dt>` o treści równej etykiecie — jeśli trafień jest inna liczba niż
 * jedno, odczyt przerywa się komunikatem o LICZBIE ETYKIET (dwie etykiety o
 * tej samej treści nie dają po cichu wziąć pierwszej z brzegu) — a wartością
 * jest NASTĘPNY węzeł z tej samej listy, o ile jest to `<dd>` (jeśli nie
 * jest, odczyt przerywa się osobnym komunikatem). Dzięki temu wyniesienie
 * wartości poza parę (do innego miejsca w dokumencie, choćby z tym samym
 * `data-testid`) czerwieni odczyt zamiast czytać ją skądinąd, a zamiana
 * samej treści etykiety przenosi odczyt na wartość, do której ta (już
 * niepoprawna) etykieta faktycznie sąsiaduje w parze. Nie po sąsiedztwie w
 * drzewie (`nextElementSibling`/`parentElement`) ani po osobnym znaczniku na
 * `<dt>` wskazującym `<dd>` gdziekolwiek w dokumencie — element ozdobny
 * między `<dt>` a `<dd>` albo inny układ opakowania pary tego nie zrywa,
 * właśnie dlatego że oba są odrzucane z zapytania `dt, dd`, a kolejność
 * pozostałych dwóch węzłów się nie zmienia. Nagłówek sekcji jest szukany po
 * samej treści (`name`), bez `level`, żeby zmiana rozmiaru nagłówka
 * (`h2`→`h3`) nie wywracała testu. Test zaplecza (`AdminUserCardResource.php`,
 * backend) nie jest tu świadczony — ten plik świadczy wyłącznie warstwę
 * widoku.
 */

const fetchAdminUser = vi.fn();
const updateAdminUser = vi.fn();
const blockAdminUser = vi.fn();
const fetchAdminUsers = vi.fn();
const assignSupervisor = vi.fn();
const resetTestAttempts = vi.fn();

class ApiError extends Error {
  status: number;
  code: string;
  errors?: Record<string, string[]>;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

vi.mock("@/lib/api", () => ({
  fetchAdminUser: (...args: unknown[]) => fetchAdminUser(...args),
  updateAdminUser: (...args: unknown[]) => updateAdminUser(...args),
  blockAdminUser: (...args: unknown[]) => blockAdminUser(...args),
  fetchAdminUsers: (...args: unknown[]) => fetchAdminUsers(...args),
  assignSupervisor: (...args: unknown[]) => assignSupervisor(...args),
  resetTestAttempts: (...args: unknown[]) => resetTestAttempts(...args),
  ApiError,
}));

const { default: AdminUserCard } = await import("@/components/h18/AdminUserCard");

const OSOBA_ID = 91;

const KARTA = {
  profile: {
    id: OSOBA_ID,
    first_name: "Marta",
    last_name: "Nowicka",
    email: "marta@example.com",
    role: "volunteer" as const,
    phone: null,
    pesel: null,
    address: { street: null, city: null, zip: null },
    access_expires_at: null,
    program_completed_at: null,
    product_group: "psychon",
  },
  progress: {
    courses_done: 4,
    courses_total: 9,
    hours_accepted: "37",
    supervision_present: 12,
    workshop_done: true,
  },
  documents: [],
  recent_notifications: [],
  audit_entries: [],
};

// Karta INNEJ osoby (id=1) — celowo różna od KARTA na każdym polu, żeby
// pomylenie zapytań (pokazanie odpowiedzi na id=1 zamiast na OSOBA_ID) dało
// wynik odróżnialny od poprawnego, a nie przypadkowo zgodny.
const INNA = {
  profile: {
    id: 1,
    first_name: "Ewa",
    last_name: "Zielińska",
    email: "ewa@example.com",
    role: "volunteer" as const,
    phone: null,
    pesel: null,
    address: { street: null, city: null, zip: null },
    access_expires_at: null,
    program_completed_at: null,
    product_group: "psychon",
  },
  progress: {
    courses_done: 2,
    courses_total: 6,
    hours_accepted: "21",
    supervision_present: 5,
    workshop_done: false,
  },
  documents: [],
  recent_notifications: [],
  audit_entries: [],
};

beforeEach(() => {
  // Atrapa rozróżniająca argument: zwraca dane właściwej osoby wyłącznie
  // przy zapytaniu o OSOBA_ID, a dla każdego innego id (np. 1) — dane INNEJ
  // osoby. `mockResolvedValue` byłby ślepy na argument i nie wykryłby, że
  // karta pokazuje odpowiedź na cudze zapytanie.
  fetchAdminUser.mockReset().mockImplementation((arg: number) =>
    Promise.resolve(arg === OSOBA_ID ? KARTA : INNA),
  );
  updateAdminUser.mockReset();
  blockAdminUser.mockReset();
  fetchAdminUsers.mockReset().mockResolvedValue({ data: [], meta: undefined });
  assignSupervisor.mockReset();
  resetTestAttempts.mockReset();
});

afterEach(() => {
  // Ten sam wyścig co w `AdminUserCard.slots.test.tsx`: wymuszone
  // odmontowanie przed zdjęciem zaślepek `afterEach`.
  cleanup();
  vi.restoreAllMocks();
});

async function pokazKarte(id: number) {
  render(<AdminUserCard id={id} />);
  await screen.findByText("Marta Nowicka");
}

/**
 * Czyta wartość pola po etykiecie, wiążąc parę kolejnością w `<dl>` — tak,
 * jak wiąże ją sam HTML listy opisowej: wartością etykiety jest `<dd>`, które
 * po niej następuje w kolejności dokumentu.
 *
 * 1. Bierze `<dl>`, w którym stoi sekcja „Postępy", i zbiera z niego
 *    `dt, dd` jednym zapytaniem w kolejności dokumentu (zapytanie schodzi
 *    przez opakowania, więc spłaszczenie `<div>`-ów niczego nie psuje).
 * 2. Szuka `<dt>`, którego tekst równa się `etykieta`; jeśli trafień jest
 *    inna liczba niż jedno — upada z komunikatem o LICZBIE ETYKIET, nie o
 *    znaczniku.
 * 3. Bierze NASTĘPNY węzeł z tej listy i upada, jeśli to nie jest `<dd>`
 *    (np. gdy prawdziwa wartość jest wyniesiona poza parę, a na jej miejscu
 *    w `<dl>` nic nie następuje albo następuje coś innego niż `<dd>`).
 * 4. Zwraca jego tekst.
 */
function wartoscPrzy(etykieta: string): string | null {
  const naglowek = screen.getByRole("heading", { name: "Postępy" });
  const sekcja = naglowek.closest("section") ?? naglowek.parentElement;
  const dl = sekcja?.querySelector("dl");
  if (!dl) {
    throw new Error(
      `nie znaleziono listy opisowej (<dl>) w sekcji zawierającej nagłówek „Postępy"`,
    );
  }

  const wezly = Array.from(dl.querySelectorAll("dt, dd"));
  const indeksyEtykiety = wezly.reduce<number[]>((zebrane, wezel, indeks) => {
    if (wezel.tagName === "DT" && wezel.textContent === etykieta) {
      zebrane.push(indeks);
    }
    return zebrane;
  }, []);

  if (indeksyEtykiety.length !== 1) {
    throw new Error(
      `etykieta „${etykieta}" występuje ${indeksyEtykiety.length} razy w liście opisowej, oczekiwano dokładnie jednej`,
    );
  }

  const wartosc = wezly[indeksyEtykiety[0] + 1];
  if (!wartosc || wartosc.tagName !== "DD") {
    throw new Error(
      `po etykiecie „${etykieta}" nie następuje węzeł wartości (<dd>) w liście opisowej`,
    );
  }

  return wartosc.textContent ?? null;
}

describe("karta osoby — warunki (sekcja Postępy)", () => {
  it("zbiera warunki dla WSKAZANEJ osoby w jednym miejscu: karta pyta o przekazane id i pokazuje jego odpowiedź", async () => {
    await pokazKarte(OSOBA_ID);

    expect(fetchAdminUser).toHaveBeenCalledWith(OSOBA_ID);
    expect(
      screen.getByRole("heading", { name: "Postępy" }),
    ).toBeInTheDocument();
    expect(wartoscPrzy("Etapy i testy")).toBe("4 / 9");
    expect(wartoscPrzy("Godziny stażu")).toBe("37");
    expect(wartoscPrzy("Obecności na superwizji")).toBe("12");
    expect(wartoscPrzy("Warsztat stacjonarny")).toBe("TAK");
  });

  it("pokazuje ukończone etapy i testy jako parę wykonane/wszystkie", async () => {
    await pokazKarte(OSOBA_ID);

    expect(wartoscPrzy("Etapy i testy")).toBe("4 / 9");
  });

  it("pokazuje zaakceptowane godziny stażu", async () => {
    await pokazKarte(OSOBA_ID);

    expect(wartoscPrzy("Godziny stażu")).toBe("37");
  });

  it("pokazuje liczbę odbytych superwizji (obecności)", async () => {
    await pokazKarte(OSOBA_ID);

    expect(wartoscPrzy("Obecności na superwizji")).toBe("12");
  });

  it("pokazuje zaliczenie warsztatu stacjonarnego jako TAK/NIE", async () => {
    await pokazKarte(OSOBA_ID);

    expect(wartoscPrzy("Warsztat stacjonarny")).toBe("TAK");
  });
});
