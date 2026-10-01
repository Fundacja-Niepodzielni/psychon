import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * `/panel/lekcje/[id]` czyta rejestr przełączenia (grupa `lekcja`): adres się
 * nie zmienia, zmienia się treść. Grupa wyłączona → dokładnie stara treść
 * (`StaraTresc`, ten sam DOM co przy renderze samej `StaraTresc`); grupa
 * włączona → ekran nowego frontu (`NowyEkran`). Sprawdzenie identyfikatora
 * (`notFound`) jest wspólne dla obu wariantów.
 */

const api = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
  endSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

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

beforeEach(() => {
  api.mockReset();
  notFound.mockClear();
});

afterEach(() => {
  przywrocRejestr();
});

function atrapaZLekcja() {
  api.mockImplementation((sciezka: string) =>
    sciezka === "/lessons/21"
      ? Promise.resolve(LEKCJA)
      : sciezka === "/lessons/21/video-link"
        ? Promise.resolve({ url: "https://example.test/v" })
        : Promise.reject(new Error(`nieoczekiwane wywołanie: ${sciezka}`)),
  );
}

const parametry = (id: string) => ({ params: Promise.resolve({ id }) });

async function wyrenderuj(element: React.ReactElement, czekajNa: (ekran: typeof import("@testing-library/react").screen) => Promise<unknown>) {
  const { act, render, screen } = await import("@testing-library/react");
  let wynik: ReturnType<typeof render> | undefined;
  await act(async () => {
    wynik = render(element);
  });
  await czekajNa(screen);
  const html = wynik!.container.innerHTML;
  wynik!.unmount();
  return html;
}

describe("/panel/lekcje/[id] a rejestr przełączenia", () => {
  it("grupa wyłączona: strona zwraca starą treść z identyfikatorem z adresu", async () => {
    podmienRejestr({});
    const { default: Strona } = await import("../page");
    const StaraTresc = (await import("../StaraTresc")).default;

    const element = (await Strona(parametry("21"))) as { type: unknown; props: { lessonId: number } };
    expect(element.type).toBe(StaraTresc);
    expect(element.props.lessonId).toBe(21);
  });

  it("grupa włączona: strona zwraca ekran nowego frontu z identyfikatorem z adresu", async () => {
    podmienRejestr({ lekcja: true });
    const { default: Strona } = await import("../page");
    const NowyEkran = (await import("../NowyEkran")).default;

    const element = (await Strona(parametry("21"))) as { type: unknown; props: { id: string } };
    expect(element.type).toBe(NowyEkran);
    expect(element.props.id).toBe("21");
  });

  it.each([false, true])("identyfikator niepoprawny (grupa włączona: %s): notFound bez żadnego zapytania", async (wlaczona) => {
    podmienRejestr({ lekcja: wlaczona });
    const { default: Strona } = await import("../page");

    for (const id of ["abc", "0", "-3"]) {
      await expect(Strona(parametry(id))).rejects.toThrow("NEXT_NOT_FOUND");
    }
    expect(api).not.toHaveBeenCalled();
  });

  it("grupa wyłączona: DOM strony jest bit w bit DOM-em samej starej treści (ładowanie i dane)", async () => {
    podmienRejestr({});
    const { default: Strona } = await import("../page");
    const StaraTresc = (await import("../StaraTresc")).default;

    api.mockImplementation(() => new Promise(() => {}));
    const ladowanieStrony = await wyrenderuj(await Strona(parametry("21")), (ekran) => ekran.findByText("Ładowanie lekcji…"));
    const ladowanieStarej = await wyrenderuj(<StaraTresc lessonId={21} />, (ekran) => ekran.findByText("Ładowanie lekcji…"));
    expect(ladowanieStrony).toBe(ladowanieStarej);

    atrapaZLekcja();
    const daneStrony = await wyrenderuj(await Strona(parametry("21")), (ekran) => ekran.findByText("Opis lekcji"));
    const daneStarej = await wyrenderuj(<StaraTresc lessonId={21} />, (ekran) => ekran.findByText("Opis lekcji"));
    expect(daneStrony).toBe(daneStarej);
    expect(daneStrony).toContain("Wróć do listy kursów");
  });

  it("grupa włączona: ta sama strona pokazuje ekran nowego frontu, nie starą treść", async () => {
    podmienRejestr({ lekcja: true });
    const { default: Strona } = await import("../page");
    atrapaZLekcja();

    const html = await wyrenderuj(await Strona(parametry("21")), (ekran) => ekran.findByText("Oznacz jako ukończoną"));
    expect(html).not.toContain("Wróć do listy kursów");
    expect(html).not.toContain("Aktywny czas:");
  });
});
