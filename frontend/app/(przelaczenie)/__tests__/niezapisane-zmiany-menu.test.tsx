import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Menu ramy pyta o niezapisane zmiany na ekranach trzech ról: administracja
 * („Ustawienia roku programu”), uczestnik („Dalsza współpraca”) i prowadzący
 * („Skrzynka pytań”). Każda próba stoi na prawdziwej powłoce roli i prawdziwym
 * ekranie: bez zmiany menu przechodzi od razu, po zmianie pola pyta, „Zostań”
 * zostawia wpisaną wartość, „Wyjdź bez zapisywania” przechodzi pod adres
 * klikniętej pozycji. Podmienione są tylko transport HTTP i router.
 */

const push = vi.fn();
const api = vi.fn();
const apiPaged = vi.fn();
const sciezka = vi.hoisted(() => ({ wartosc: "/admin" }));

vi.mock("next/navigation", () => ({
  usePathname: () => sciezka.wartosc,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push, back: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  endSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  endSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/api/h01-wspolpraca", () => ({
  pobierzJa: () => Promise.resolve({ program_completed_at: "2026-09-01T00:00:00Z", role: "volunteer" }),
  pobierzMojeZgloszenia: () => Promise.resolve({ data: [], meta: undefined }),
  zglosWspolprace: vi.fn(),
}));

const { PowlokaAdministracji } = await import("@/app/(przelaczenie)/admin/PowlokaAdministracji");
const { PowlokaUczestnika } = await import("@/app/(przelaczenie)/panel/PowlokaUczestnika");
const { PowlokaProwadzacego } = await import("@/app/(przelaczenie)/prowadzacy/PowlokaProwadzacego");
const { UstawieniaEdycji } = await import("@/nowy-front/ustawienia-edycji/UstawieniaEdycji");
const { PoProgramieWspolpraca } = await import("@/nowy-front/po-programie-wspolpraca/PoProgramieWspolpraca");
const { SkrzynkaPytan } = await import("@/nowy-front/skrzynka-pytan/SkrzynkaPytan");

const ROK = {
  id: 1,
  name: "Rok programu 2026/27",
  starts_at: "2026-09-01",
  ends_at: "2027-06-30",
  seats_limit: null,
  test_pass_threshold: 80,
  test_attempts_limit: 3,
  internship_hours_required: 72,
  supervision_required_count: 6,
  reliability_threshold: 60,
  lesson_completion_percent: 60,
};

const PYTANIE = {
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
};

const TYTUL_OKNA = "Masz niezapisane zmiany";

beforeEach(() => {
  push.mockReset();
  api.mockReset();
  apiPaged.mockReset();
  apiPaged.mockImplementation((adres: string) =>
    Promise.resolve(
      adres.startsWith("/instructor/questions")
        ? { data: [PYTANIE], meta: { current_page: 1, per_page: 25, total: 1, last_page: 1, extra: { unanswered: 1 } } }
        : { data: [], meta: undefined },
    ),
  );
});

/** Pierwsza pozycja menu roli, która nie jest ekranem bieżącym. */
function innaPozycjaMenu(nazwaMenu: string): HTMLElement {
  const bok = within(screen.getByRole("complementary", { name: "Menu i konto" }));
  const pozycje = within(bok.getByRole("navigation", { name: nazwaMenu })).getAllByRole("link", { hidden: true });
  const inna = pozycje.find((pozycja) => !pozycja.hasAttribute("aria-current") && pozycja.getAttribute("href") !== sciezka.wartosc);
  if (!inna) throw new Error("menu nie ma innej pozycji");
  return inna;
}

/** Wspólny przebieg: zmiana → menu → okno → „Zostań” → wartość zachowana → menu → „Wyjdź bez zapisywania” → przejście. */
async function przebiegPrzezMenu(nazwaMenu: string, pole: () => HTMLElement, wpis: string, wartoscPoWpisie: string | number) {
  const uzytkownik = userEvent.setup();
  await uzytkownik.clear(pole());
  await uzytkownik.type(pole(), wpis);
  const pozycja = innaPozycjaMenu(nazwaMenu);
  const adres = pozycja.getAttribute("href");

  expect(fireEvent.click(pozycja)).toBe(false);
  expect(screen.getByRole("dialog", { name: TYTUL_OKNA })).toBeInTheDocument();
  expect(push).not.toHaveBeenCalled();

  await uzytkownik.click(screen.getByRole("button", { name: "Zostań" }));
  expect(screen.queryByRole("dialog", { name: TYTUL_OKNA })).toBeNull();
  expect(push).not.toHaveBeenCalled();
  expect(pole()).toHaveValue(wartoscPoWpisie);

  fireEvent.click(pozycja);
  await uzytkownik.click(screen.getByRole("button", { name: "Wyjdź bez zapisywania" }));
  expect(push.mock.calls).toEqual([[adres]]);
  expect(screen.queryByRole("dialog", { name: TYTUL_OKNA })).toBeNull();
}

describe("administracja — „Ustawienia roku programu”", () => {
  function wyrenderuj() {
    sciezka.wartosc = "/admin/ustawienia";
    api.mockImplementation((adres: string) => {
      if (adres === "/me") return Promise.resolve({ role: "project_manager", first_name: "Ewa", last_name: "Demo" });
      if (adres === "/admin/edition") return Promise.resolve(ROK);
      return Promise.resolve([]);
    });
    render(
      <PowlokaAdministracji>
        <UstawieniaEdycji />
      </PowlokaAdministracji>,
    );
  }

  it("bez zmiany: menu przechodzi od razu, bez okna", async () => {
    wyrenderuj();
    await screen.findByLabelText(/^Próg zaliczenia testu/);
    const pozycja = innaPozycjaMenu("Menu — Administracja");

    fireEvent.click(pozycja);

    expect(push.mock.calls).toEqual([[pozycja.getAttribute("href")]]);
    expect(screen.queryByRole("dialog", { name: TYTUL_OKNA })).toBeNull();
  });

  it("po zmianie pola: menu pyta; „Zostań” zostawia wartość; „Wyjdź bez zapisywania” przechodzi", async () => {
    wyrenderuj();
    await screen.findByLabelText(/^Próg zaliczenia testu/);
    await przebiegPrzezMenu("Menu — Administracja", () => screen.getByLabelText(/^Próg zaliczenia testu/), "85", 85);
  });
});

describe("uczestnik — „Dalsza współpraca”", () => {
  it("po wpisaniu treści zgłoszenia: menu pyta; „Zostań” zostawia treść; „Wyjdź bez zapisywania” przechodzi", async () => {
    sciezka.wartosc = "/panel/dalsza-wspolpraca";
    api.mockImplementation((adres: string) =>
      Promise.resolve(adres === "/me" ? { role: "volunteer", first_name: "Marta", last_name: "Demo" } : []),
    );
    render(
      <PowlokaUczestnika>
        <PoProgramieWspolpraca />
      </PowlokaUczestnika>,
    );
    await screen.findByLabelText(/^Treść prośby/);
    await przebiegPrzezMenu(
      "Menu — Panel uczestnika",
      () => screen.getByLabelText(/^Treść prośby/),
      "Chcę kontynuować współpracę.",
      "Chcę kontynuować współpracę.",
    );
  });
});

describe("prowadzący — „Skrzynka pytań”", () => {
  it("po wpisaniu odpowiedzi: menu pyta; „Zostań” zostawia odpowiedź; „Wyjdź bez zapisywania” przechodzi", async () => {
    sciezka.wartosc = "/prowadzacy/pytania";
    api.mockImplementation((adres: string) =>
      Promise.resolve(adres === "/me" ? { role: "instructor", first_name: "Joanna", last_name: "Demo" } : []),
    );
    render(
      <PowlokaProwadzacego>
        <SkrzynkaPytan />
      </PowlokaProwadzacego>,
    );
    await screen.findByText(PYTANIE.question);
    await userEvent.setup().click(screen.getAllByRole("button", { name: /^Odpowiedz/ })[0]);
    const nazwaMenu = within(screen.getByRole("complementary", { name: "Menu i konto" }))
      .getByRole("navigation")
      .getAttribute("aria-label");
    await przebiegPrzezMenu(
      nazwaMenu ?? "",
      () => screen.getByRole("textbox", { name: /^Odpowiedź/ }),
      "Około 40 minut.",
      "Około 40 minut.",
    );
  });
});
