import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ZGLOSZENIE } from "@/nowy-front/zgloszenie-decyzja/__tests__/atrapy";

/**
 * Trzy trasy włączone razem w tej partii, złożone tak jak robi to router,
 * w czterech stanach (ładowanie, dane, błąd sieci, odmowa 401/403):
 * - `/admin/uczestniczki` — układ administracji (nowa ramka, bo grupa jest
 *   włączona) i prawdziwa strona z listą osób (podmiana treści pod tym samym
 *   adresem);
 * - `/admin/nabor` — układ grupy `(przelaczenie)`, układ administracji
 *   i lista zgłoszeń;
 * - `/admin/nabor/[id]` — te same układy i ekran decyzji o zgłoszeniu.
 * W każdym stanie dokładnie jeden `main`, jeden `#tresc` i jeden odnośnik do
 * treści. Odmowa to `EmptyState` „brak-uprawnien” bez ani jednego rekordu w
 * DOM. Podmieniony jest wyłącznie transport HTTP i adres strony.
 */

const api = vi.fn();
const apiPaged = vi.fn();
let sciezka = "/admin/uczestniczki";

// Układ i powłoka biorą klienta z beczki `@/lib/api`, a ekrany z `@/lib/api/klient`, więc podmieniamy oba moduły na te same atrapy.
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  endSession: vi.fn(),
}));

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  endSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => sciezka,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  redirect: (cel: string) => {
    throw new Error(`NEXT_REDIRECT ${cel} (atrapa testu)`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND (atrapa testu)");
  },
}));

vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const { ApiError } = await import("@/lib/api/klient");
const { default: UkladPrzelaczenia } = await import("../layout");
const { default: UkladAdministracjiPrzelaczenia } = await import("../admin/layout");
const { default: UkladAdministracji } = await import("@/app/(administracja)/admin/layout");
const { default: StronaOsob } = await import("@/app/(administracja)/admin/uczestniczki/page");
const { default: StronaNaboru } = await import("../admin/nabor/page");
const { default: StronaZgloszenia } = await import("../admin/nabor/[id]/page");

const ZAKAZ = () => new ApiError({ status: 403, code: "forbidden", message: "Zabronione" });
const NIEZALOGOWANY = () => new ApiError({ status: 401, code: "unauthenticated", message: "Brak sesji" });
const BLAD = () => new ApiError({ status: 500, code: "server_error", message: "Błąd" });
const JEDEN = { main: 1, cele: 1, odnosniki: 1 };

const OSOBA = {
  id: 7,
  first_name: "Marta",
  last_name: "Osobowska",
  email: "osobowska@demo.pl",
  role: "volunteer",
  status: "active",
  product_group: "psychon",
  access_expires_at: "2027-02-01T00:00:00Z",
  program_completed_at: null,
  created_at: "2026-09-20T10:00:00Z",
};

const KANDYDAT = { ...ZGLOSZENIE, id: 12, first_name: "Anna", last_name: "Kandydacka", email: "kandydacka@demo.pl" };

function strona<T>(rekord: T) {
  return { data: [rekord], meta: { current_page: 1, per_page: 25, total: 1, last_page: 1, edition_id: 1 } };
}

function zmierz(container: HTMLElement) {
  return {
    main: container.querySelectorAll("main").length,
    cele: container.querySelectorAll("#tresc").length,
    odnosniki: container.querySelectorAll('a[href="#tresc"]').length,
  };
}

/** Rekordem jest `li` w treści poza listą okruszków (`nav`). */
function rekordy(container: HTMLElement) {
  return [...(container.querySelector("#tresc")?.querySelectorAll("li") ?? [])].filter((li) => li.closest("nav") === null).length;
}

/** `/me` zwraca rolę administracji; reszta jak w teście, adresy spoza listy wywracają. */
function atrapaApi(zgloszenie: () => Promise<unknown>) {
  api.mockImplementation((adres: string) => {
    if (adres === "/me") return Promise.resolve({ role: "project_manager", first_name: "Ewa", last_name: "Demo" });
    if (adres === "/admin/applications/12") return zgloszenie();
    return Promise.reject(new Error(`nieoczekiwane żądanie ${adres}`));
  });
}

/** Dzwonek powiadomień woła tę samą atrapę z innym adresem — dostaje pustą skrzynkę. */
function ustawListe(wynik: () => Promise<unknown>) {
  apiPaged.mockImplementation((adres: string) =>
    adres.startsWith("/notifications")
      ? Promise.resolve({ data: [], meta: { current_page: 1, per_page: 20, total: 0, last_page: 1, extra: { unread: 0 } } })
      : wynik(),
  );
}

async function trasaOsob() {
  sciezka = "/admin/uczestniczki";
  const element = await StronaOsob({ searchParams: Promise.resolve({}) });
  return render(<UkladAdministracji>{element}</UkladAdministracji>);
}

function trasaNaboru() {
  sciezka = "/admin/nabor";
  return render(
    <UkladPrzelaczenia>
      <UkladAdministracjiPrzelaczenia>
        <StronaNaboru />
      </UkladAdministracjiPrzelaczenia>
    </UkladPrzelaczenia>,
  );
}

async function trasaZgloszenia() {
  sciezka = "/admin/nabor/12";
  const element = await StronaZgloszenia({ params: Promise.resolve({ id: "12" }) });
  return render(
    <UkladPrzelaczenia>
      <UkladAdministracjiPrzelaczenia>{element}</UkladAdministracjiPrzelaczenia>
    </UkladPrzelaczenia>,
  );
}

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  atrapaApi(() => new Promise(() => {}));
  ustawListe(() => new Promise(() => {}));
});

describe.each([
  {
    nazwa: "/admin/uczestniczki",
    trasa: trasaOsob,
    h1: "Osoby",
    rekord: OSOBA.last_name,
    odmowa: "Lista osób jest niedostępna",
    siec: "Nie udało się wczytać listy osób",
    ustaw: ustawListe,
    dane: () => Promise.resolve(strona(OSOBA)),
  },
  {
    nazwa: "/admin/nabor",
    trasa: trasaNaboru,
    h1: "Zgłoszenia rekrutacyjne",
    rekord: KANDYDAT.last_name,
    odmowa: "Lista zgłoszeń jest niedostępna",
    siec: "Nie udało się wczytać zgłoszeń",
    ustaw: ustawListe,
    dane: () => Promise.resolve(strona(KANDYDAT)),
  },
  {
    nazwa: "/admin/nabor/[id]",
    trasa: trasaZgloszenia,
    h1: "Zgłoszenie rekrutacyjne",
    rekord: KANDYDAT.last_name,
    odmowa: "Zgłoszenie jest niedostępne",
    siec: "Nie udało się wczytać zgłoszenia",
    ustaw: (wynik: () => Promise<unknown>) => atrapaApi(wynik),
    dane: () => Promise.resolve(KANDYDAT),
  },
])("$nazwa w układach grupy", ({ trasa, rekord, odmowa, siec, ustaw, dane }) => {
  it("ładowanie: jeden main, jeden #tresc, jeden odnośnik", async () => {
    ustaw(() => new Promise(() => {}));
    const { container } = await trasa();

    await waitFor(() => expect(zmierz(container)).toEqual(JEDEN));
    expect(container.querySelector("h1")).not.toBeNull();
  });

  it("dane: jeden main, jeden #tresc, jeden odnośnik, rekord widoczny", async () => {
    ustaw(dane);
    const { container } = await trasa();

    await waitFor(() => expect(screen.getAllByText(new RegExp(rekord)).length).toBeGreaterThan(0));
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("błąd sieci: jeden main, jeden #tresc, jeden odnośnik", async () => {
    ustaw(() => Promise.reject(BLAD()));
    const { container } = await trasa();

    await screen.findByText(siec);
    expect(screen.queryByText(new RegExp(rekord))).toBeNull();
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it.each([
    ["403", ZAKAZ],
    ["401", NIEZALOGOWANY],
  ])("odmowa %s: EmptyState brak-uprawnien, jeden main, zero rekordów w DOM", async (_kod, blad) => {
    ustaw(() => Promise.reject(blad()));
    const { container } = await trasa();

    await screen.findByText(odmowa);
    expect(screen.queryByText(new RegExp(rekord))).toBeNull();
    expect(screen.queryByText(siec)).toBeNull();
    expect(rekordy(container)).toBe(0);
    await waitFor(() => expect(zmierz(container)).toEqual(JEDEN));
  });
});

describe("kontrola dodatnia: ekran bez dostawcy powłoki", () => {
  it("lista osób i lista zgłoszeń wewnątrz samej powłoki, bez dostawcy, dają dwa main", async () => {
    const { default: PanelShell } = await import("@/components/layout/PanelShell");
    const { OsobyLista } = await import("@/nowy-front/osoby-lista/OsobyLista");
    const { ZgloszeniaLista } = await import("@/nowy-front/zgloszenia-lista/ZgloszeniaLista");
    apiPaged.mockImplementation(() => new Promise(() => {}));

    const osoby = render(
      <PanelShell panelName="Administracja" menu={[]}>
        <OsobyLista />
      </PanelShell>,
    );
    expect(zmierz(osoby.container).main).toBe(2);
    osoby.unmount();

    const zgloszenia = render(
      <PanelShell panelName="Administracja" menu={[]}>
        <ZgloszeniaLista />
      </PanelShell>,
    );
    await waitFor(() => expect(zmierz(zgloszenia.container).main).toBe(2));
  });
});
