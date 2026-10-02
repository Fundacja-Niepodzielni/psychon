import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * `/panel/kursy/[slug]` czyta rejestr przełączenia (grupa `kursUczestnika`):
 * adres się nie zmienia, zmienia się treść. Grupa wyłączona → dokładnie stara
 * treść (`StaraTresc`, ten sam DOM co przy renderze samej `StaraTresc`); grupa
 * włączona → ekran nowego frontu (`NowyEkran`).
 */

const api = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
  endSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const KURS = {
  id: 2,
  slug: "wywiad-psychologiczny",
  title: "Wywiad psychologiczny",
  sequence_order: 2,
  product_group: "psychon",
  status: "in_progress",
  progress_percent: 40,
  instructor: { id: 5, name: "Joanna Demo" },
  topics: [],
  lessons: [{ id: 21, title: "Wprowadzenie do wywiadu", sequence_order: 1, duration_seconds: 1800, is_completed: true, topic_id: null }],
  materials: [],
};

beforeEach(() => {
  api.mockReset();
});

afterEach(() => {
  przywrocRejestr();
});

function atrapaZKursem() {
  api.mockImplementation((sciezka: string) =>
    sciezka === "/courses/wywiad-psychologiczny"
      ? Promise.resolve(KURS)
      : sciezka === "/courses" || sciezka.startsWith("/courses?")
        ? Promise.resolve([])
        : Promise.reject(new Error(`nieoczekiwane wywołanie: ${sciezka}`)),
  );
}

const parametry = () => ({ params: Promise.resolve({ slug: "wywiad-psychologiczny" }) });

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

describe("/panel/kursy/[slug] a rejestr przełączenia", () => {
  it("grupa wyłączona: strona zwraca starą treść z parametrami z adresu", async () => {
    podmienRejestr({});
    const { default: Strona } = await import("../page");
    const StaraTresc = (await import("../StaraTresc")).default;

    const wejscie = parametry();
    const element = Strona(wejscie) as { type: unknown; props: { params: unknown } };
    expect(element.type).toBe(StaraTresc);
    expect(element.props.params).toBe(wejscie.params);
  });

  it("grupa włączona: strona zwraca ekran nowego frontu z parametrami z adresu", async () => {
    podmienRejestr({ kursUczestnika: true });
    const { default: Strona } = await import("../page");
    const NowyEkran = (await import("../NowyEkran")).default;

    const wejscie = parametry();
    const element = Strona(wejscie) as { type: unknown; props: { params: unknown } };
    expect(element.type).toBe(NowyEkran);
    expect(element.props.params).toBe(wejscie.params);
  });

  it("grupa wyłączona: DOM strony jest bit w bit DOM-em samej starej treści (ładowanie i dane)", async () => {
    podmienRejestr({});
    const { default: Strona } = await import("../page");
    const StaraTresc = (await import("../StaraTresc")).default;

    api.mockImplementation(() => new Promise(() => {}));
    const ladowanieStrony = await wyrenderuj(Strona(parametry()), (ekran) => ekran.findByRole("status"));
    const ladowanieStarej = await wyrenderuj(<StaraTresc {...parametry()} />, (ekran) => ekran.findByRole("status"));
    expect(ladowanieStrony).toBe(ladowanieStarej);

    atrapaZKursem();
    const daneStrony = await wyrenderuj(Strona(parametry()), (ekran) => ekran.findByRole("heading", { level: 1, name: "Wywiad psychologiczny" }));
    const daneStarej = await wyrenderuj(<StaraTresc {...parametry()} />, (ekran) => ekran.findByRole("heading", { level: 1, name: "Wywiad psychologiczny" }));
    expect(daneStrony).toBe(daneStarej);
    expect(daneStrony).not.toContain("data-przycisk-glowny");
  });

  it("grupa włączona: ta sama strona pokazuje ekran nowego frontu, nie starą treść", async () => {
    podmienRejestr({ kursUczestnika: true });
    const { default: Strona } = await import("../page");
    atrapaZKursem();

    const html = await wyrenderuj(Strona(parametry()), (ekran) => ekran.findByText("Test końcowy"));
    expect(html).toContain("data-przycisk-glowny");
    expect(html).toContain("Wszystkie lekcje ukończone. Został test.");
  });
});
