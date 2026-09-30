import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";
import { grupa, kurs, pytanie, termin } from "@/nowy-front/pulpit-prowadzacego/__tests__/atrapy";

/**
 * Strona startowa prowadzącego (`/prowadzacy`) a rejestr przełączenia
 * (grupa `pulpitProwadzacego`, podmiana treści pod tym samym adresem):
 * - grupa wyłączona → strona zwraca `StaraTresc`, a złożona w układzie daje
 *   dokładnie ten sam kod HTML co sama `StaraTresc`;
 * - grupa włączona → strona zwraca ekran nowego frontu w `DostawcaPowloki`;
 *   złożona z prawdziwym układem prowadzącego (`RequireRole` + `PanelShell`)
 *   ma w czterech stanach (ładowanie, dane, błąd sieci, odmowa 403)
 *   dokładnie jeden `main`, jeden `#tresc` i jeden odnośnik do treści;
 * - odmowa roli: układ pokazuje „Brak dostępu”, ekran niczego nie pobiera.
 * Podmienione są wyłącznie transport HTTP i rejestr grup.
 */

// Pierwszy test pliku ładuje od zera układ, stronę i ekran (zimny import);
// przy równoległym biegu wielu plików przekracza domyślne 5 s.
vi.setConfig({ testTimeout: 30_000 });

const api = vi.fn();
const apiPaged = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  endSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/prowadzacy",
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

type Tryb = "ladowanie" | "dane" | "siec" | "zakaz";

async function zaladuj(flagi: { pulpitProwadzacego?: boolean }) {
  podmienRejestr(flagi);
  const [uklad, strona, staraTresc, klient, powloka, ekran] = await Promise.all([
    import("@/app/(prowadzacy)/prowadzacy/layout"),
    import("@/app/(prowadzacy)/prowadzacy/page"),
    import("@/app/(prowadzacy)/prowadzacy/StaraTresc"),
    import("@/lib/api/klient"),
    import("@/design-system/szablony/KontekstPowloki"),
    import("@/nowy-front/pulpit-prowadzacego/PulpitProwadzacego"),
  ]);
  return {
    Uklad: uklad.default,
    Strona: strona.default,
    StaraTresc: staraTresc.default,
    ApiError: klient.ApiError,
    DostawcaPowloki: powloka.DostawcaPowloki,
    PulpitProwadzacego: ekran.PulpitProwadzacego,
  };
}

const META = { current_page: 1, per_page: 25, total: 1, last_page: 1, extra: { unanswered: 1 } };

function ustawSerwer(tryb: Tryb, rola: string, ApiError: Awaited<ReturnType<typeof zaladuj>>["ApiError"]) {
  const blad = (status: number) => new ApiError({ status, code: status === 403 ? "forbidden" : "server_error", message: "Błąd" });
  const odpowiedz = (dane: unknown): Promise<unknown> => {
    if (tryb === "ladowanie") return new Promise(() => {});
    if (tryb === "siec") return Promise.reject(blad(500));
    if (tryb === "zakaz") return Promise.reject(blad(403));
    return Promise.resolve(dane);
  };
  api.mockImplementation((url: string) => {
    if (url === "/me") return Promise.resolve({ role: rola });
    if (url === "/instructor/group") return odpowiedz(grupa(2, [termin(7, "2099-10-05T16:00:00Z")]));
    if (url === "/instructor/courses") return odpowiedz([kurs(2), kurs(3)]);
    return Promise.reject(new Error(`nieoczekiwane wywołanie: ${url}`));
  });
  apiPaged.mockImplementation((url: string) =>
    url.startsWith("/notifications")
      ? Promise.resolve({ data: [], meta: { current_page: 1, per_page: 20, total: 0, last_page: 1, extra: { unread: 0 } } })
      : odpowiedz({ data: [pytanie(1)], meta: META }),
  );
}

function zmierz(kontener: HTMLElement) {
  return {
    main: kontener.querySelectorAll("main").length,
    cele: kontener.querySelectorAll("#tresc").length,
    odnosniki: kontener.querySelectorAll('a[href="#tresc"]').length,
  };
}

/** Pierwsze złożenie całego układu bywa wolniejsze niż domyślny limit oczekiwania. */
const DLUGO = { timeout: 5000 };

const JEDEN = { main: 1, cele: 1, odnosniki: 1 };

/** Identyfikatory `useId` zależą od kolejności montowania, nie od treści. */
function bezIdentyfikatorow(html: string): string {
  return html.replace(/(:r[0-9a-z]+:|_r_[0-9a-z]+_)/g, "ID");
}

type Zaladowane = Awaited<ReturnType<typeof zaladuj>>;

function trasa(z: Zaladowane, dzieci?: ReactNode) {
  return render(<z.Uklad>{dzieci ?? <z.Strona />}</z.Uklad>);
}

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
});

afterEach(() => {
  przywrocRejestr();
});

describe("/prowadzacy — strona a rejestr przełączenia", () => {
  it("grupa wyłączona: strona zwraca StaraTresc", async () => {
    const z = await zaladuj({});
    const element = z.Strona() as ReactElement;
    expect(element.type).toBe(z.StaraTresc);
  });

  it("grupa włączona: strona zwraca ekran nowego frontu w DostawcyPowloki", async () => {
    const z = await zaladuj({ pulpitProwadzacego: true });
    const element = z.Strona() as ReactElement<{ children: ReactElement<{ children: ReactElement }> }>;
    expect(element.type).toBe("div");
    expect(element.props).toMatchObject({ "data-theme": "light" });
    expect(element.props.children.type).toBe(z.DostawcaPowloki);
    expect(element.props.children.props.children.type).toBe(z.PulpitProwadzacego);
  });

  it("wyłączona: strona w układzie daje ten sam kod HTML co sama StaraTresc (bit w bit)", async () => {
    const z = await zaladuj({});
    ustawSerwer("dane", "instructor", z.ApiError);
    const przezStrone = trasa(z);
    await screen.findByText("osób w grupie", {}, DLUGO);
    const htmlStrony = bezIdentyfikatorow(przezStrone.container.innerHTML);
    przezStrone.unmount();

    const zStaraTresc = trasa(z, <z.StaraTresc />);
    await screen.findByText("osób w grupie", {}, DLUGO);
    const htmlStarej = bezIdentyfikatorow(zStaraTresc.container.innerHTML);

    expect(htmlStrony).toBe(htmlStarej);
    expect(htmlStrony).toContain("Panel prowadzącego");
  });

  it("przypadek odwrotny: włączona daje inny kod HTML niż StaraTresc", async () => {
    const z = await zaladuj({ pulpitProwadzacego: true });
    ustawSerwer("dane", "instructor", z.ApiError);
    const nowa = trasa(z);
    await screen.findByText(/^Moja grupa: 2/, {}, DLUGO);
    const htmlNowej = bezIdentyfikatorow(nowa.container.innerHTML);
    nowa.unmount();

    const stara = trasa(z, <z.StaraTresc />);
    await screen.findByText("osób w grupie", {}, DLUGO);
    expect(bezIdentyfikatorow(stara.container.innerHTML)).not.toBe(htmlNowej);
  });
});

describe("/prowadzacy włączona — układ prowadzącego, jeden main w czterech stanach", () => {
  it("ładowanie: jeden main, jeden #tresc, jeden odnośnik, jeden h1", async () => {
    const z = await zaladuj({ pulpitProwadzacego: true });
    ustawSerwer("ladowanie", "instructor", z.ApiError);
    const { container } = trasa(z);

    await screen.findByRole("heading", { level: 1, name: "Pulpit prowadzącego" }, DLUGO);
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(zmierz(container)).toEqual(JEDEN);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("dane: jeden main, jeden #tresc, jeden odnośnik, liczby z trzech tras", async () => {
    const z = await zaladuj({ pulpitProwadzacego: true });
    ustawSerwer("dane", "instructor", z.ApiError);
    const { container } = trasa(z);

    await screen.findByText("Moja grupa: 2 osoby", {}, DLUGO);
    expect(screen.getByText("Pytania bez odpowiedzi: 1")).toBeInTheDocument();
    expect(screen.getByText("Moje kursy: 2")).toBeInTheDocument();
    expect(screen.getByText("Osoba1 Demo")).toBeInTheDocument();
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("błąd sieci: jeden main, jeden #tresc, jeden odnośnik, powtórzenie dostępne", async () => {
    const z = await zaladuj({ pulpitProwadzacego: true });
    ustawSerwer("siec", "instructor", z.ApiError);
    const { container } = trasa(z);

    await screen.findByText("Nie udało się wczytać pulpitu", {}, DLUGO);
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("odmowa 403: jeden main, jeden #tresc, jeden odnośnik, EmptyState brak uprawnień i zero rekordów", async () => {
    const z = await zaladuj({ pulpitProwadzacego: true });
    ustawSerwer("zakaz", "instructor", z.ApiError);
    const { container } = trasa(z);

    await screen.findByText(/tylko dla prowadzących/, {}, DLUGO);
    expect(screen.queryByText(/Demo/)).toBeNull();
    expect(screen.queryByText(/^Moja grupa:/)).toBeNull();
    expect(screen.queryByText(/^Pytania bez odpowiedzi:/)).toBeNull();
    expect(screen.queryByText(/^Moje kursy:/)).toBeNull();
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("kontrola dodatnia: ekran bez dostawcy powłoki daje dwa main", async () => {
    const z = await zaladuj({ pulpitProwadzacego: true });
    ustawSerwer("ladowanie", "instructor", z.ApiError);
    const { container } = trasa(z, <z.PulpitProwadzacego />);

    await screen.findByRole("heading", { level: 1, name: "Pulpit prowadzącego" }, DLUGO);
    expect(zmierz(container).main).toBe(2);
  });
});

describe("/prowadzacy włączona — odmowa roli (strażnik układu)", () => {
  it("rola volunteer: „Brak dostępu”, ekran niczego nie pobiera, w DOM nie ma rekordów", async () => {
    const z = await zaladuj({ pulpitProwadzacego: true });
    ustawSerwer("dane", "volunteer", z.ApiError);
    const { container } = trasa(z);

    await waitFor(() => expect(screen.getByText("Brak dostępu")).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Pulpit prowadzącego" })).toBeNull();
    expect(screen.queryByText(/Demo/)).toBeNull();
    expect(api.mock.calls.map(([url]) => url)).toEqual(["/me"]);
    expect(apiPaged.mock.calls.map(([url]) => url)).not.toContain("/instructor/questions?answered=false");
    expect(zmierz(container).main).toBeLessThanOrEqual(1);
  });

  it("kontrola dodatnia: rola instructor z tymi samymi odpowiedziami dostaje pulpit i pobiera trzy trasy", async () => {
    const z = await zaladuj({ pulpitProwadzacego: true });
    ustawSerwer("dane", "instructor", z.ApiError);
    trasa(z);

    await screen.findByText("Moja grupa: 2 osoby", {}, DLUGO);
    expect(api.mock.calls.map(([url]) => url).sort()).toEqual(["/instructor/courses", "/instructor/group", "/me"]);
    expect(apiPaged.mock.calls.map(([url]) => url)).toContain("/instructor/questions?answered=false");
  });
});
