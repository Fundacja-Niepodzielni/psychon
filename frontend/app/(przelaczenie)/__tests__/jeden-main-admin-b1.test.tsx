import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Dwie trasy administracji przełączone w tej partii, złożone tak jak robi to
 * router, w czterech stanach (ładowanie, dane, błąd sieci, odmowa 401/403):
 * - `/admin/formy-stazu` — układ grupy `(przelaczenie)`, układ administracji
 *   i prawdziwa strona;
 * - `/admin` — prawdziwy układ administracji i prawdziwa strona startowa
 *   (podmiana treści pod tym samym adresem).
 * W każdym stanie dokładnie jeden `main`, jeden `#tresc` i jeden odnośnik do
 * treści. Odmowa to `EmptyState` „brak-uprawnien” bez ani jednego rekordu w
 * DOM. Podmieniony jest wyłącznie transport HTTP i funkcja pobierająca formy.
 */

const api = vi.fn();
const pobierzFormyStazu = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: vi.fn().mockResolvedValue({ data: [], meta: undefined }),
  endSession: vi.fn(),
}));

vi.mock("@/nowy-front/formy-stazu/dane", () => ({
  pobierzFormyStazu: (...args: unknown[]) => pobierzFormyStazu(...args),
}));

vi.mock("@/lib/api/h11-formy", () => ({
  utworzFormeStazu: vi.fn(),
  zaktualizujFormeStazu: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND (atrapa testu)");
  },
}));

const { ApiError } = await import("@/lib/api/klient");
const { default: UkladPrzelaczenia } = await import("../layout");
const { default: UkladAdministracjiPrzelaczenia } = await import("../admin/layout");
const { default: StronaFormyStazu } = await import("../admin/formy-stazu/page");
const { default: UkladAdministracji } = await import("@/app/(administracja)/admin/layout");
const { default: StronaStartowa } = await import("@/app/(administracja)/admin/page");
const { FormyStazu } = await import("@/nowy-front/formy-stazu/FormyStazu");
const { PulpitAdministracji } = await import("@/nowy-front/pulpit-administracji/PulpitAdministracji");

const ZAKAZ = () => new ApiError({ status: 403, code: "forbidden", message: "Zabronione" });
const NIEZALOGOWANY = () => new ApiError({ status: 401, code: "unauthenticated", message: "Brak sesji" });
const BLAD = () => new ApiError({ status: 500, code: "server_error", message: "Błąd" });
const JEDEN = { main: 1, cele: 1, odnosniki: 1 };

const FORMA = {
  id: 7,
  name: "Dyżur telefoniczny do testu",
  description: "Rozmowa.",
  is_active: true,
  sort_order: 1,
  created_at: null,
  updated_at: null,
};

const PULPIT = {
  counters: { participants: 137, completed: 29, certificates: 23 },
  queues: [
    { key: "applications", count: 11, link: "/admin/uczestniczki" },
    { key: "internship_entries", count: 17, link: "/admin/staz" },
  ],
};

function zmierz(container: HTMLElement) {
  return {
    main: container.querySelectorAll("main").length,
    cele: container.querySelectorAll("#tresc").length,
    odnosniki: container.querySelectorAll('a[href="#tresc"]').length,
  };
}

/** `/me` zwraca rolę administracji; `/admin/dashboard` — zadana odpowiedź. */
function atrapaApi(dashboard: () => Promise<unknown>) {
  api.mockImplementation((sciezka: string) => {
    if (sciezka === "/me") return Promise.resolve({ role: "project_manager" });
    if (sciezka === "/admin/dashboard") return dashboard();
    return Promise.resolve(undefined);
  });
}

function trasaFormyStazu() {
  return render(
    <UkladPrzelaczenia>
      <UkladAdministracjiPrzelaczenia>
        <StronaFormyStazu />
      </UkladAdministracjiPrzelaczenia>
    </UkladPrzelaczenia>,
  );
}

function trasaStartowa() {
  return render(
    <UkladAdministracji>
      <StronaStartowa />
    </UkladAdministracji>,
  );
}

beforeEach(() => {
  api.mockReset();
  pobierzFormyStazu.mockReset();
  api.mockResolvedValue({ role: "project_manager" });
});

describe("/admin/formy-stazu w układach grupy", () => {
  it("ładowanie: jeden main, jeden #tresc, jeden odnośnik", async () => {
    pobierzFormyStazu.mockReturnValue(new Promise(() => {}));
    const { container } = trasaFormyStazu();

    expect(await screen.findByRole("heading", { level: 1, name: "Słownik form stażu" })).toBeInTheDocument();
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("dane: jeden main, jeden #tresc, jeden odnośnik, rekord widoczny", async () => {
    pobierzFormyStazu.mockResolvedValue([FORMA]);
    const { container } = trasaFormyStazu();

    await screen.findByText(FORMA.name);
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("błąd sieci: jeden main, jeden #tresc, jeden odnośnik", async () => {
    pobierzFormyStazu.mockRejectedValue(BLAD());
    const { container } = trasaFormyStazu();

    await screen.findByText(/nieosiągalny albo zwrócił błąd/);
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it.each([
    ["403", ZAKAZ],
    ["401", NIEZALOGOWANY],
  ])("odmowa %s: EmptyState brak-uprawnien, jeden main, zero rekordów w DOM", async (_kod, blad) => {
    pobierzFormyStazu.mockRejectedValue(blad());
    const { container } = trasaFormyStazu();

    await screen.findByText(/tylko dla administracji/);
    expect(screen.getByRole("heading", { level: 2, name: "Słownik form stażu dla administracji" })).toBeInTheDocument();
    expect(screen.queryByText(FORMA.name)).toBeNull();
    expect(screen.queryByText(/nieosiągalny/)).toBeNull();
    expect(container.querySelector("#tresc")?.querySelectorAll("li").length).toBe(0);
    expect(zmierz(container)).toEqual(JEDEN);
  });
});

describe("/admin (pulpit) w układzie administracji", () => {
  it("ładowanie: jeden main, jeden #tresc, jeden odnośnik", async () => {
    atrapaApi(() => new Promise(() => {}));
    const { container } = trasaStartowa();

    await screen.findByRole("heading", { level: 1, name: "Pulpit administracji" });
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("dane: jeden main, jeden #tresc, jeden odnośnik, liczniki z API", async () => {
    atrapaApi(() => Promise.resolve(PULPIT));
    const { container } = trasaStartowa();

    await screen.findByText("137");
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("błąd sieci: jeden main, jeden #tresc, jeden odnośnik", async () => {
    atrapaApi(() => Promise.reject(BLAD()));
    const { container } = trasaStartowa();

    await screen.findByText("Nie udało się wczytać pulpitu");
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it.each([
    ["403", ZAKAZ],
    ["401", NIEZALOGOWANY],
  ])("odmowa %s: EmptyState brak-uprawnien, jeden main, zero rekordów w DOM", async (_kod, blad) => {
    atrapaApi(() => Promise.reject(blad()));
    const { container } = trasaStartowa();

    await screen.findByText(/Ten ekran jest dla administracji/);
    expect(screen.getByRole("heading", { level: 2, name: "Nie masz dostępu do tego ekranu" })).toBeInTheDocument();
    expect(screen.queryByText("137")).toBeNull();
    expect(screen.queryByText("Zgłoszenia rekrutacyjne")).toBeNull();
    // Okruszki nagłówka to lista w `nav` — rekordem jest wyłącznie `li` poza nią.
    const rekordy = [...(container.querySelector("#tresc")?.querySelectorAll("li") ?? [])].filter(
      (li) => li.closest("nav") === null,
    );
    expect(rekordy.length).toBe(0);
    await waitFor(() => expect(zmierz(container)).toEqual(JEDEN));
  });
});

describe("kontrola dodatnia: ekran bez dostawcy powłoki", () => {
  it("ekran wewnątrz samej powłoki i bez dostawcy daje dwa main na obu trasach", async () => {
    const { default: PanelShell } = await import("@/components/layout/PanelShell");
    pobierzFormyStazu.mockReturnValue(new Promise(() => {}));
    atrapaApi(() => new Promise(() => {}));

    const formy = render(
      <PanelShell panelName="Administracja" menu={[]}>
        <FormyStazu />
      </PanelShell>,
    );
    expect(zmierz(formy.container).main).toBe(2);
    formy.unmount();

    const pulpit = render(
      <PanelShell panelName="Administracja" menu={[]}>
        <PulpitAdministracji />
      </PanelShell>,
    );
    await waitFor(() => expect(zmierz(pulpit.container).main).toBe(2));
  });
});
