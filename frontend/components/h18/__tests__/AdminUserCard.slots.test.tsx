import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * Świadek rejestru gniazd karty osoby (H18 · `lib/slots/admin-user-card.ts`).
 * Karta ma renderować wpięcia PRZEZ rejestr, nie importem na sztywno —
 * dokładnie tak, jak `lib/slots/admin-courses.ts` dla karty kursu H08a.
 *
 * Rejestr jest tu PRAWDZIWY, nieudawany: podmieniona jest wyłącznie warstwa
 * API (`@/lib/api`), żeby karta i oba wpięcia (H12, H10) mogły się
 * wyrenderować bez sieci. Gdyby karta importowała wpięcia bezpośrednio,
 * zamiast przez `slotsForRegion`, ten test i tak by przeszedł — dowodem, że
 * mierzy rejestr, a nie przypadkowy efekt uboczny, jest kontrola negatywna
 * K2 opisana w raporcie: usunięcie wpisu z pliku rejestru w drzewie roboczym
 * musi ten test wywrócić.
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

const KARTA = {
  profile: {
    id: 7,
    first_name: "Anna",
    last_name: "Kowalska",
    email: "anna@example.com",
    role: "volunteer" as const,
    phone: null,
    pesel: null,
    address: { street: null, city: null, zip: null },
    access_expires_at: null,
    program_completed_at: null,
    product_group: "psychon",
  },
  progress: {
    courses_done: 1,
    courses_total: 3,
    hours_accepted: "10",
    supervision_present: 2,
    workshop_done: false,
  },
  documents: [],
  recent_notifications: [],
  audit_entries: [],
};

beforeEach(() => {
  fetchAdminUser.mockReset().mockResolvedValue(KARTA);
  updateAdminUser.mockReset();
  blockAdminUser.mockReset();
  fetchAdminUsers.mockReset().mockResolvedValue({ data: [], meta: undefined });
  assignSupervisor.mockReset();
  resetTestAttempts.mockReset();
});

afterEach(() => {
  // Kolejność ma znaczenie: `AssignSupervisor` woła `fetchAdminUsers` w
  // efekcie montowania, a React czasem odkłada jego uruchomienie na potem —
  // odmontowanie (`cleanup`) wymusza wtedy jego dogranie, zanim naprawdę
  // zniknie. Ten plik rejestruje własny `afterEach` PO globalnym z
  // `__tests__/setup.ts`, a odwołania w tej samej fazie (`afterEach`) Vitest
  // woła w kolejności odwrotnej do rejestracji — więc bez jawnego `cleanup()`
  // tutaj ten `afterEach` odpalał się PRZED globalnym: `vi.restoreAllMocks()`
  // zdejmował gotowe odpowiedzi z zaślepki, a dopiero potem odmontowanie
  // wymuszało spóźniony efekt na już opróżnionej zaślepce — stąd
  // `fetchAdminUsers(...)` bez zaimplementowanej odpowiedzi i wywrócone
  // „.then” na `undefined` (raz na kilkanaście-kilkadziesiąt biegów, zależnie
  // od tego, czy efekt zdążył odpalić się sam w trakcie testu). Wymuszenie
  // odmontowania tutaj, przed zdjęciem zaślepek, usuwa ten wyścig u źródła.
  cleanup();
  vi.restoreAllMocks();
});

async function pokazKarte() {
  render(<AdminUserCard id={7} />);
  await screen.findByText("Anna Kowalska");
}

describe("karta osoby renderuje wpięcia przez rejestr gniazd", () => {
  it("pokazuje oba dzisiejsze wpisy rejestru: nadanie prowadzącego i reset podejść", async () => {
    await pokazKarte();

    expect(screen.getByText("Prowadzący superwizje")).toBeInTheDocument();
    expect(screen.getByText("Reset limitu podejść")).toBeInTheDocument();
  });

  it("renderuje wpisy w kolejności rosnącej wg pola order rejestru (100 przed 200)", async () => {
    await pokazKarte();

    const naglowki = screen
      .getAllByRole("heading")
      .map((h) => h.textContent);
    const pozycjaProwadzacego = naglowki.indexOf("Prowadzący superwizje");
    const pozycjaResetu = naglowki.indexOf("Reset limitu podejść");

    expect(pozycjaProwadzacego).toBeGreaterThanOrEqual(0);
    expect(pozycjaResetu).toBeGreaterThan(pozycjaProwadzacego);
  });
});
