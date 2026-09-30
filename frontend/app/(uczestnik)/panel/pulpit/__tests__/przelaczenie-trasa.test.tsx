import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * `/panel/pulpit` czyta rejestr przełączenia (grupa `pulpitUczestnika`): adres
 * się nie zmienia, zmienia się treść. Grupa wyłączona → dokładnie stara treść
 * (`StaraTresc`, ten sam DOM co przy renderze samej `StaraTresc`); grupa
 * włączona → ekran nowego frontu (`NowyEkran`). Tytuł strony w obu wariantach
 * zostaje „Pulpit — Niepodzielni".
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
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const STRONA = { current_page: 1, per_page: 100, total: 0, last_page: 1 };
const KURS = {
  id: 2,
  slug: "wywiad-psychologiczny",
  title: "Wywiad psychologiczny",
  sequence_order: 2,
  status: "in_progress",
  progress_percent: 40,
};

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  apiPaged.mockResolvedValue({ data: [], meta: STRONA });
});

afterEach(() => {
  przywrocRejestr();
});

function atrapaZDanymi() {
  api.mockImplementation((sciezka: string) => {
    if (sciezka === "/me") return Promise.resolve({ role: "student", first_name: "Zosia", program_completed_at: null });
    if (sciezka === "/courses") return Promise.resolve([KURS]);
    return Promise.reject(new Error(`nieoczekiwane wywołanie: ${sciezka}`));
  });
}

async function wyrenderuj(element: () => React.ReactElement, czekajNa: (ekran: typeof import("@testing-library/react").screen) => Promise<unknown>) {
  const { render, screen } = await import("@testing-library/react");
  const wynik = render(element());
  await czekajNa(screen);
  const html = wynik.container.innerHTML;
  wynik.unmount();
  return html;
}

describe("/panel/pulpit a rejestr przełączenia", () => {
  it("grupa wyłączona: strona zwraca starą treść", async () => {
    podmienRejestr({});
    const { default: Strona } = await import("../page");
    const StaraTresc = (await import("../StaraTresc")).default;

    expect((Strona() as { type: unknown }).type).toBe(StaraTresc);
  });

  it("grupa włączona: strona zwraca ekran nowego frontu", async () => {
    podmienRejestr({ pulpitUczestnika: true });
    const { default: Strona } = await import("../page");
    const NowyEkran = (await import("../NowyEkran")).default;

    expect((Strona() as { type: unknown }).type).toBe(NowyEkran);
  });

  it("tytuł strony jest ten sam niezależnie od grupy", async () => {
    podmienRejestr({});
    const wylaczona = (await import("../page")).metadata;
    podmienRejestr({ pulpitUczestnika: true });
    const wlaczona = (await import("../page")).metadata;

    expect(wylaczona.title).toBe("Pulpit — Niepodzielni");
    expect(wlaczona.title).toBe(wylaczona.title);
  });

  it("grupa wyłączona: DOM strony jest bit w bit DOM-em samej starej treści (ładowanie i dane)", async () => {
    podmienRejestr({});
    const { default: Strona } = await import("../page");
    const StaraTresc = (await import("../StaraTresc")).default;

    api.mockImplementation(() => new Promise(() => {}));
    const ladowanieStrony = await wyrenderuj(() => <Strona />, (ekran) => ekran.findByText("Wczytywanie pulpitu…"));
    const ladowanieStarej = await wyrenderuj(() => <StaraTresc />, (ekran) => ekran.findByText("Wczytywanie pulpitu…"));
    expect(ladowanieStrony).toBe(ladowanieStarej);

    atrapaZDanymi();
    const daneStrony = await wyrenderuj(() => <Strona />, (ekran) => ekran.findByText("Dzień dobry, Zosia"));
    const daneStarej = await wyrenderuj(() => <StaraTresc />, (ekran) => ekran.findByText("Dzień dobry, Zosia"));
    expect(daneStrony).toBe(daneStarej);
    expect(daneStrony).toContain("Mapa rozwoju");
  });

  it("grupa włączona: ta sama strona pokazuje ekran nowego frontu, nie starą treść", async () => {
    podmienRejestr({ pulpitUczestnika: true });
    const { default: Strona } = await import("../page");
    atrapaZDanymi();

    const html = await wyrenderuj(() => <Strona />, (ekran) => ekran.findByText("Twoje kursy"));
    expect(html).not.toContain("Mapa rozwoju");
    expect(html).not.toContain("Dzień dobry");
  });
});
