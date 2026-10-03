import { readFileSync } from "node:fs";
import path from "node:path";
import { Suspense } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * `/panel/kursy/[slug]/test` czyta rejestr przełączenia (grupa `testUczestnika`):
 * adres się nie zmienia, zmienia się treść. Grupa wyłączona → dokładnie stara
 * treść (`StaraTresc`, ten sam DOM co przy renderze samej `StaraTresc`); grupa
 * włączona → ekran nowego frontu (`NowyEkran`) ze slugiem z adresu.
 */

const api = vi.fn();
const apiPaged = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  endSession: vi.fn(),
}));

const SLUG = "pierwsza-pomoc-psychologiczna";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  useParams: () => ({ slug: "pierwsza-pomoc-psychologiczna" }),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const TEST = {
  test_id: 10,
  pass_threshold: 70,
  attempts_used: 1,
  attempts_limit: 4,
  passed: false,
  questions: [
    {
      id: 43,
      body: "Kiedy trzeba wezwać pomoc?",
      sequence_order: 1,
      answers: [
        { id: 230, body: "Gdy zagrożone jest życie lub zdrowie" },
        { id: 231, body: "Nigdy, rozmowa zawsze wystarcza" },
      ],
    },
  ],
};

const KURS = { id: 2, slug: SLUG, title: "Pierwsza pomoc psychologiczna", has_test: true, lessons: [{ id: 21, is_completed: true }] };

// Pierwszy import strony i obu treści to zimna transformacja całego drzewa
// komponentów; pod obciążeniem maszyny trwa dłużej niż limit pierwszego testu.
// Rozgrzewamy ją raz, we wstępie z własnym limitem, zamiast w testach.
beforeAll(async () => {
  await import("../page");
  await import("../StaraTresc");
  await import("../NowyEkran");
}, 30_000);

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset().mockResolvedValue({ data: [], meta: { current_page: 1, per_page: 25, total: 0, last_page: 1 } });
});

afterEach(() => {
  przywrocRejestr();
});

function atrapaZTestem() {
  api.mockImplementation((sciezka: string) =>
    sciezka === `/courses/${SLUG}/test`
      ? Promise.resolve(TEST)
      : sciezka === `/courses/${SLUG}`
        ? Promise.resolve(KURS)
        : Promise.reject(new Error(`nieoczekiwane wywołanie: ${sciezka}`)),
  );
}

const parametry = () => ({ params: Promise.resolve({ slug: SLUG }) });

async function wyrenderuj(element: React.ReactElement, czekajNa: (ekran: typeof import("@testing-library/react").screen) => Promise<unknown>) {
  const { act, render, screen } = await import("@testing-library/react");
  let wynik: ReturnType<typeof render> | undefined;
  await act(async () => {
    wynik = render(<Suspense fallback={null}>{element}</Suspense>);
  });
  await czekajNa(screen);
  const html = wynik!.container.innerHTML;
  wynik!.unmount();
  return html;
}

describe("/panel/kursy/[slug]/test a rejestr przełączenia", () => {
  it("grupa wyłączona: strona zwraca starą treść (slug czyta ona sama z adresu)", async () => {
    podmienRejestr({});
    const { default: Strona } = await import("../page");
    const StaraTresc = (await import("../StaraTresc")).default;
    const NowyEkran = (await import("../NowyEkran")).default;

    const element = Strona(parametry()) as { type: unknown; props: Record<string, unknown> };
    expect(element.type).toBe(StaraTresc);
    expect(element.type).not.toBe(NowyEkran);
    expect(element.props).toEqual({});
  });

  it("grupa włączona: strona zwraca ekran nowego frontu z parametrami z adresu", async () => {
    podmienRejestr({ testUczestnika: true });
    const { default: Strona } = await import("../page");
    const NowyEkran = (await import("../NowyEkran")).default;

    const wejscie = parametry();
    const element = Strona(wejscie) as { type: unknown; props: { params: unknown } };
    expect(element.type).toBe(NowyEkran);
    expect(element.props.params).toBe(wejscie.params);
  });

  it("przypadek odwrotny: włączona sama grupa strony kursu nie zmienia strony testu", async () => {
    podmienRejestr({ kursUczestnika: true });
    const { default: Strona } = await import("../page");
    const StaraTresc = (await import("../StaraTresc")).default;

    expect((Strona(parametry()) as { type: unknown }).type).toBe(StaraTresc);
  });

  it("grupa wyłączona: DOM strony jest bit w bit DOM-em samej starej treści (ładowanie i dane)", async () => {
    podmienRejestr({});
    const { default: Strona } = await import("../page");
    const StaraTresc = (await import("../StaraTresc")).default;

    api.mockImplementation(() => new Promise(() => {}));
    const ladowanieStrony = await wyrenderuj(Strona(parametry()), (ekran) => ekran.findByText("Wczytywanie testu…"));
    const ladowanieStarej = await wyrenderuj(<StaraTresc />, (ekran) => ekran.findByText("Wczytywanie testu…"));
    expect(ladowanieStrony).toBe(ladowanieStarej);

    atrapaZTestem();
    const daneStrony = await wyrenderuj(Strona(parametry()), (ekran) => ekran.findByRole("button", { name: "Rozpocznij test" }));
    const daneStarej = await wyrenderuj(<StaraTresc />, (ekran) => ekran.findByRole("button", { name: "Rozpocznij test" }));
    expect(daneStrony).toBe(daneStarej);
    expect(daneStrony).not.toContain("Test końcowy");
  });

  it("grupa włączona: ta sama strona pokazuje ekran nowego frontu w jasnym motywie, bez drugiego main", async () => {
    podmienRejestr({ testUczestnika: true });
    const { default: Strona } = await import("../page");
    atrapaZTestem();

    const html = await wyrenderuj(Strona(parametry()), (ekran) => ekran.findByRole("heading", { level: 2, name: "Zanim zaczniesz" }));
    expect(html).toContain("Test końcowy");
    expect(html).toContain("Pierwsza pomoc psychologiczna");
    expect(html).toContain('data-theme="light"');
    expect(html).not.toContain("<main");
    expect(api).toHaveBeenCalledWith(`/courses/${SLUG}/test`);
  });

  it("plik strony nie importuje niczego z warstwy components/", () => {
    const zrodlo = readFileSync(path.join(process.cwd(), "app", "(uczestnik)", "panel", "kursy", "[slug]", "test", "page.tsx"), "utf-8");
    expect(zrodlo.split(/\r?\n/).filter((linia) => /^\s*import\b.*from\s+["']@\/components\//.test(linia))).toEqual([]);
  });
});
