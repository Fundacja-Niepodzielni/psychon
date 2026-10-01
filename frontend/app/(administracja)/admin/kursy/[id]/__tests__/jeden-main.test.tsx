import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";
import { utworzSerwer, type AtrapaSerwera } from "@/nowy-front/kurs-administracji/__tests__/atrapa-serwera";

/**
 * Trasa `/admin/kursy/[id]` z włączoną grupą, złożona tak jak robi to router:
 * układ administracji (strażnik ról i ramka) i strona z ekranem nowego frontu.
 * W każdym stanie dokładnie jeden `main`, jeden `#tresc` i jeden odnośnik do
 * treści. Podmieniony jest wyłącznie transport HTTP.
 */

let serwer: AtrapaSerwera;

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: (...a: [string, { method?: string; body?: unknown }?]) => serwer.api(...a),
    apiPaged: (...a: [string]) => serwer.apiPaged(...a),
  };
});

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...a: [string, { method?: string; body?: unknown }?]) => serwer.api(...a),
  apiPaged: (...a: [string]) => serwer.apiPaged(...a),
  endSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/kursy/4",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND (atrapa testu)");
  },
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

function zmierz(container: HTMLElement) {
  return {
    main: container.querySelectorAll("main").length,
    cele: container.querySelectorAll("#tresc").length,
    odnosniki: container.querySelectorAll('a[href="#tresc"]').length,
  };
}

const JEDEN = { main: 1, cele: 1, odnosniki: 1 };

async function zlozKurs() {
  podmienRejestr({ kursAdministracji: true });
  const { default: Uklad } = await import("@/app/(administracja)/admin/layout");
  const { default: Strona } = await import("../page");
  const strona = await Strona({ params: Promise.resolve({ id: "4" }) });
  return render(<Uklad>{strona}</Uklad>);
}

beforeEach(() => {
  przywrocRejestr();
  serwer = utworzSerwer();
});

describe("/admin/kursy/[id] w układzie administracji (grupa włączona)", () => {
  it("ładowanie: jeden main, jeden #tresc, jeden odnośnik", async () => {
    serwer.nadpisz("GET", "/admin/courses/4", () => new Promise(() => {}));
    const { container } = await zlozKurs();

    await screen.findByRole("heading", { level: 1, name: "Wczytywanie kursu" });
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("dane: jeden main, jeden #tresc, jeden odnośnik, każda sekcja ekranu raz", async () => {
    const { container } = await zlozKurs();

    await screen.findByRole("heading", { level: 1, name: "Wywiad psychologiczny" });
    await screen.findByRole("link", { name: "Otwórz pytania" });
    expect(zmierz(container)).toEqual(JEDEN);
    for (const id of ["tematy-i-lekcje", "publikacja", "ustawienia-dane", "ustawienia-prowadzacy"]) {
      expect(container.querySelectorAll(`#${id}`)).toHaveLength(1);
    }
  });

  it("odmowa 403: jeden main, jeden #tresc, jeden odnośnik, bez drzewa", async () => {
    const { ApiError } = await import("@/lib/api/klient");
    serwer.nadpisz("GET", "/admin/courses/4", () => new ApiError({ status: 403, code: "forbidden", message: "x" }));
    const { container } = await zlozKurs();

    await screen.findAllByText(/administracji/);
    expect(container.querySelector("li[data-lekcja]")).toBeNull();
    expect(zmierz(container)).toEqual(JEDEN);
  });
});
