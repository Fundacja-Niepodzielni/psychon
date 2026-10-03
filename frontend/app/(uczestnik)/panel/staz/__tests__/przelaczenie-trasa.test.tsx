import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * `/panel/staz` czyta rejestr przełączenia (grupa `dziennikStazu`): adres się
 * nie zmienia, zmienia się treść. Grupa wyłączona → dokładnie stara treść
 * (`StaraTresc`); grupa włączona → ekran nowego frontu (`NowyEkran`). Rejestr
 * w repozytorium ma tę grupę włączoną, więc zwykły adres renderuje nowy ekran.
 * Tytuł strony w obu wariantach zostaje „Dziennik stażu — Niepodzielni”.
 */

/**
 * Pierwszy import strony ciągnie cały ekran nowego frontu (szablon, organizmy, atomy), a pełny przebieg
 * zestawu transformuje pliki równolegle — zmierzone ponad 5 s przy domyślnym limicie. Jawny limit 15 s,
 * jak w pozostałych próbach przełączenia, które importują stronę.
 */
const LIMIT_IMPORTU = 15_000;

const api = vi.fn();
const apiPaged = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  endSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/panel/staz",
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const META = {
  current_page: 1,
  per_page: 25,
  total: 0,
  last_page: 1,
  extra: { accepted_hours: "41.5", required_hours: "72" },
};

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  apiPaged.mockResolvedValue({ data: [], meta: META });
  api.mockResolvedValue({ role: "volunteer", first_name: "Marta" });
});

afterEach(() => {
  przywrocRejestr();
});

async function wyrenderuj(element: () => React.ReactElement, czekajNa: (ekran: typeof import("@testing-library/react").screen) => Promise<unknown>) {
  const { render, screen } = await import("@testing-library/react");
  const wynik = render(element());
  await czekajNa(screen);
  // Identyfikatory pól (`useId`) rosną z każdym renderem — porównanie ich nie dotyczy.
  const html = wynik.container.innerHTML.replace(/_r_[0-9a-z]+_/g, "_r_");
  wynik.unmount();
  return html;
}

describe("/panel/staz a rejestr przełączenia", () => {
  it("rejestr w repozytorium ma grupę dziennika stażu włączoną, pod tym samym adresem", async () => {
    const { GRUPY } = await import("@/lib/przelaczenie/grupy");
    expect(GRUPY.dziennikStazu.wlaczona).toBe(true);
    expect(GRUPY.dziennikStazu.ekrany).toEqual([
      { panel: "uczestnik", staraTrasa: "/panel/staz", nowaTrasa: "/panel/staz", trasaPoligonu: "/nowy-front/staz" },
    ]);
  }, LIMIT_IMPORTU);

  it("adres zwykły przy włączonej grupie renderuje ekran nowego frontu", async () => {
    const { default: Strona } = await import("../page");
    const NowyEkran = (await import("../NowyEkran")).default;

    expect((Strona() as { type: unknown }).type).toBe(NowyEkran);
  }, LIMIT_IMPORTU);

  it("grupa wyłączona: strona zwraca starą treść", async () => {
    podmienRejestr({});
    const { default: Strona } = await import("../page");
    const StaraTresc = (await import("../StaraTresc")).default;

    expect((Strona() as { type: unknown }).type).toBe(StaraTresc);
  }, LIMIT_IMPORTU);

  it("grupa włączona: strona zwraca ekran nowego frontu", async () => {
    podmienRejestr({ dziennikStazu: true });
    const { default: Strona } = await import("../page");
    const NowyEkran = (await import("../NowyEkran")).default;

    expect((Strona() as { type: unknown }).type).toBe(NowyEkran);
  }, LIMIT_IMPORTU);

  it("tytuł strony jest ten sam niezależnie od grupy", async () => {
    podmienRejestr({});
    const wylaczona = (await import("../page")).metadata;
    podmienRejestr({ dziennikStazu: true });
    const wlaczona = (await import("../page")).metadata;

    expect(wylaczona.title).toBe("Dziennik stażu — Niepodzielni");
    expect(wlaczona.title).toBe(wylaczona.title);
  }, LIMIT_IMPORTU);

  it("grupa wyłączona: DOM strony jest DOM-em samej starej treści (poza identyfikatorami pól)", async () => {
    podmienRejestr({});
    const { default: Strona } = await import("../page");
    const StaraTresc = (await import("../StaraTresc")).default;

    const strony = await wyrenderuj(() => <Strona />, (ekran) => ekran.findByText("Nie masz jeszcze żadnych wpisów. Dodaj pierwszy powyżej."));
    const starej = await wyrenderuj(() => <StaraTresc />, (ekran) => ekran.findByText("Nie masz jeszcze żadnych wpisów. Dodaj pierwszy powyżej."));
    expect(strony).toBe(starej);
    expect(strony).toContain("Twój postęp");
  }, LIMIT_IMPORTU);

  it("adres zwykły przy włączonej grupie pokazuje nowy ekran, nie starą treść", async () => {
    const { default: Strona } = await import("../page");

    const html = await wyrenderuj(() => <Strona />, (ekran) => ekran.findByText("Nie masz jeszcze wpisów"));
    expect(html).toContain("Zatwierdzone godziny");
    expect(html).not.toContain("Twój postęp");
    expect(apiPaged).toHaveBeenCalledWith("/internship/entries?page=1&per_page=25");
  }, LIMIT_IMPORTU);
});
