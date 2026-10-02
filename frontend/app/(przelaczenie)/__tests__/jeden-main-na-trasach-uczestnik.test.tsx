import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Trasy panelu uczestnika, na których adres się nie zmienia, a treść strony
 * zamienia się na ekran nowego frontu (grupy `pulpitUczestnika` i `lekcja`):
 * `/panel/pulpit` i `/panel/lekcje/[id]`. Strona złożona tak jak robi to
 * router — układ segmentu `(uczestnik)/panel` (powłoka panelu z jedynym
 * `main#tresc`) i prawdziwa strona z rejestru (grupy włączone) — w stanach
 * ładowanie / dane / błąd / odmowa: dokładnie jeden `main`, jeden `#tresc`
 * i jeden odnośnik do treści. Odmowa = odpowiedź API 401/403 i zero
 * rekordów w DOM. Podmieniony jest wyłącznie transport HTTP.
 */

const api = vi.fn();
const apiPaged = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  endSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const { ApiError } = await import("@/lib/api/klient");
const { default: UkladUczestnika } = await import("@/app/(uczestnik)/panel/layout");
const { default: StronaPulpitu } = await import("@/app/(uczestnik)/panel/pulpit/page");
const { default: NowyEkranPulpitu } = await import("@/app/(uczestnik)/panel/pulpit/NowyEkran");
const { default: NowyEkranLekcji } = await import("@/app/(uczestnik)/panel/lekcje/[id]/NowyEkran");

const KURS = {
  id: 2,
  slug: "wywiad-psychologiczny",
  title: "Wywiad psychologiczny",
  sequence_order: 2,
  status: "in_progress",
  progress_percent: 40,
};
const LEKCJA = {
  id: 21,
  title: "Wprowadzenie do wywiadu",
  description: "Opis lekcji",
  content: null,
  topic: null,
  duration_seconds: 1800,
  position_seconds: 0,
  watched_seconds: 812,
  active_seconds: 700,
  is_completed: false,
  completable: false,
  completable_at_percent: 60,
};
const STRONA = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

const blad = (status: number, code: string) => new ApiError({ status, code, message: "Komunikat z zaplecza." });
const NIGDY = () => new Promise(() => {});
const JEDEN = { main: 1, cele: 1, odnosniki: 1 };

function zmierz(container: HTMLElement) {
  return {
    main: container.querySelectorAll("main").length,
    cele: container.querySelectorAll("#tresc").length,
    odnosniki: container.querySelectorAll('a[href="#tresc"]').length,
  };
}

function zapytane(): unknown[] {
  return api.mock.calls.map((wywolanie) => wywolanie[0]);
}

/** Atrapa pulpitu wolontariusza z jedną lekcją do wznowienia; `nadpisz` podmienia pojedyncze ścieżki. */
function atrapaPulpitu(nadpisz: Record<string, () => Promise<unknown>> = {}) {
  api.mockImplementation((sciezka: string) => {
    if (sciezka in nadpisz) return nadpisz[sciezka]();
    if (sciezka === "/me") return Promise.resolve({ role: "volunteer", first_name: "Zofia", program_completed_at: null });
    if (sciezka === "/courses") return Promise.resolve([KURS]);
    if (sciezka === `/courses/${KURS.slug}`) {
      return Promise.resolve({ ...KURS, lessons: [{ id: 21, title: "Lekcja 1", sequence_order: 1, is_completed: false }] });
    }
    if (sciezka === "/certificate/conditions") return Promise.resolve({ eligible: false, conditions: [] });
    return Promise.reject(blad(500, "instrument"));
  });
  apiPaged.mockImplementation((sciezka: string) =>
    sciezka.startsWith("/internship/entries")
      ? Promise.resolve({ data: [], meta: { ...STRONA, extra: { accepted_hours: "10", required_hours: "72" } } })
      : Promise.resolve({ data: [], meta: STRONA }),
  );
}

function trasaPulpitu() {
  return render(
    <UkladUczestnika>
      <StronaPulpitu />
    </UkladUczestnika>,
  );
}

/**
 * Grupa `lekcja` jest włączona, więc strona pod `/panel/lekcje/[id]` zwraca
 * ekran lekcji nowego frontu. Test renderuje ten ekran w układzie panelu wprost
 * (ten sam element, który strona zwraca), żeby pilnować jednego `main`.
 */
async function trasaLekcji() {
  return render(
    <UkladUczestnika>
      <NowyEkranLekcji id="21" />
    </UkladUczestnika>,
  );
}

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  // Dzwonek powiadomień w powłoce panelu czyta listę przez `apiPaged`.
  apiPaged.mockResolvedValue({ data: [], meta: STRONA });
});

describe("/panel/pulpit w układzie panelu uczestnika", () => {
  it("ładowanie: jeden main, jeden #tresc, jeden odnośnik", async () => {
    api.mockImplementation(NIGDY);
    const { container } = trasaPulpitu();

    await screen.findByRole("heading", { level: 1, name: "Pulpit" });
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("dane: jeden main, jeden #tresc, jeden odnośnik", async () => {
    atrapaPulpitu();
    const { container } = trasaPulpitu();

    await screen.findByText("Twoja ścieżka");
    expect((await screen.findAllByText("Wywiad psychologiczny")).length).toBeGreaterThan(0);
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("błąd 500: jeden main, jeden #tresc, jeden odnośnik", async () => {
    api.mockImplementation((sciezka: string) =>
      sciezka === "/me" ? Promise.reject(blad(500, "server_error")) : Promise.resolve({ role: "volunteer" }),
    );
    const { container } = trasaPulpitu();

    await screen.findByText("Nie udało się wczytać pulpitu");
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("odmowa 403 na /me: jeden main, jeden #tresc, jeden odnośnik, zero rekordów i zero zapytań o kursy", async () => {
    atrapaPulpitu({ "/me": () => Promise.reject(blad(403, "forbidden")) });
    const { container } = trasaPulpitu();

    await screen.findByRole("heading", { level: 2, name: "Nie masz dostępu do tego ekranu" });
    expect(screen.queryByText("Wywiad psychologiczny")).toBeNull();
    expect(screen.queryByText("Twoja ścieżka")).toBeNull();
    expect(zapytane()).not.toContain("/courses");
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("odmowa roli (prowadzący na pulpicie uczestnika): zero rekordów, zero zapytań o kursy, jeden main", async () => {
    atrapaPulpitu({ "/me": () => Promise.resolve({ role: "instructor", first_name: "Piotr", program_completed_at: null }) });
    const { container } = trasaPulpitu();

    await screen.findByText(/Ten ekran jest dla uczestników/);
    expect(screen.queryByText("Wywiad psychologiczny")).toBeNull();
    expect(zapytane()).not.toContain("/courses");
    expect(zmierz(container)).toEqual(JEDEN);
  });
});

describe("/panel/lekcje/[id] w układzie panelu uczestnika", () => {
  it("ładowanie: jeden main, jeden #tresc, jeden odnośnik", async () => {
    api.mockImplementation(NIGDY);
    const { container } = await trasaLekcji();

    await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).not.toBeNull());
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("dane: jeden main, jeden #tresc, jeden odnośnik", async () => {
    api.mockImplementation((sciezka: string) =>
      sciezka === "/lessons/21"
        ? Promise.resolve(LEKCJA)
        : sciezka === "/lessons/21/video-link"
          ? Promise.resolve({ url: "https://example.test/v" })
          : Promise.resolve({ role: "volunteer" }),
    );
    const { container } = await trasaLekcji();

    await screen.findByRole("heading", { level: 1, name: LEKCJA.title });
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("błąd 500: jeden main, jeden #tresc, jeden odnośnik", async () => {
    api.mockImplementation((sciezka: string) =>
      sciezka === "/lessons/21" ? Promise.reject(blad(500, "server_error")) : Promise.resolve({ role: "volunteer" }),
    );
    const { container } = await trasaLekcji();

    await screen.findByText("Nie udało się wczytać lekcji");
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("odmowa 403 (kurs zablokowany): jeden main, jeden #tresc, jeden odnośnik, zero danych lekcji", async () => {
    api.mockImplementation((sciezka: string) =>
      sciezka === "/lessons/21" ? Promise.reject(blad(403, "course_locked")) : Promise.resolve({ role: "volunteer" }),
    );
    const { container } = await trasaLekcji();

    await screen.findByRole("heading", { name: "Nie masz dostępu do tego ekranu" });
    expect(screen.queryByText(LEKCJA.title)).toBeNull();
    expect(screen.queryByText("Opis lekcji")).toBeNull();
    expect(zapytane()).not.toContain("/lessons/21/video-link");
    expect(zmierz(container)).toEqual(JEDEN);
  });
});

describe("kontrola dodatnia: ekran bez dostawcy powłoki", () => {
  it("ekran wewnątrz samej powłoki i bez dostawcy daje dwa main na obu trasach", async () => {
    const { default: PanelShell } = await import("@/components/layout/PanelShell");
    const { Pulpit } = await import("@/nowy-front/pulpit/Pulpit");
    const { Lekcja } = await import("@/nowy-front/lekcja/Lekcja");
    api.mockImplementation(NIGDY);

    const pulpit = render(
      <PanelShell panelName="Panel uczestnika" menu={[]}>
        <Pulpit />
      </PanelShell>,
    );
    await waitFor(() => expect(zmierz(pulpit.container).main).toBe(2));
    pulpit.unmount();

    const lekcja = render(
      <PanelShell panelName="Panel uczestnika" menu={[]}>
        <Lekcja id="21" />
      </PanelShell>,
    );
    expect(zmierz(lekcja.container).main).toBe(2);
  });

  it("ekrany w samym komponencie NowyEkran (bez powłoki) nie dokładają własnego main: dostawca powłoki jest w środku", () => {
    api.mockImplementation(NIGDY);
    const pulpit = render(<NowyEkranPulpitu />);
    expect(zmierz(pulpit.container).main).toBe(0);
    pulpit.unmount();
    const lekcja = render(<NowyEkranLekcji id="21" />);
    expect(zmierz(lekcja.container).main).toBe(0);
  });
});
