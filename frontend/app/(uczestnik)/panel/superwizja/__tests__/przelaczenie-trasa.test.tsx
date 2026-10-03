import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { opiszPodmianeTresci } from "@/lib/przelaczenie/__tests__/podmiana-tresci";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * Trasa `/panel/superwizja` a rejestr przełączenia (grupa `superwizjaUczestnika`,
 * podmiana treści pod tym samym adresem; to NIE jest grupa `superwizje`
 * administracji):
 * - wspólny zestaw: wyłączona → `StaraTresc`, włączona → nowy ekran w
 *   `DostawcaPowloki`, plik strony bez importów z `components/`;
 * - tytuł karty ten sam w obu stanach;
 * - przy wyłączonej grupie strona renderuje się bit w bit jak stary komponent
 *   `components/h12/SupervisionSlots` (ładowanie, dane, pusto, błąd), a przy
 *   włączonej — ekran nowego frontu z częściami „Twoje terminy” i „Wolne terminy”.
 * Podmieniony jest wyłącznie transport HTTP — oba moduły klienta (beczka
 * `@/lib/api` i `@/lib/api/klient`) dostają te same atrapy.
 */

const api = vi.fn();
const apiPaged = vi.fn();

vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
}));

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
}));

vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

opiszPodmianeTresci({
  nazwa: "/panel/superwizja",
  klucz: "superwizjaUczestnika",
  plikStrony: "(uczestnik)/panel/superwizja/page.tsx",
  zOwinieciem: true,
  zaladujStrone: () => import("../page"),
  zaladujStara: () => import("../StaraTresc"),
  zaladujNowy: () => import("@/nowy-front/superwizja-uczestnika/SuperwizjaUczestnika").then((m) => m.SuperwizjaUczestnika),
});

describe("tytuł karty trasy /panel/superwizja", () => {
  it("jest taki sam jak na dotychczasowej stronie, niezależnie od flagi grupy", async () => {
    for (const flagi of [{}, { superwizjaUczestnika: true }] as const) {
      podmienRejestr(flagi);
      const { metadata } = await import("../page");
      expect(metadata).toEqual({ title: "Superwizja — Niepodzielni" });
      przywrocRejestr();
    }
  });
});

const TERMIN = {
  id: 4,
  starts_at: "2026-10-15T12:00:00Z",
  duration_minutes: 60,
  seats_limit: 6,
  location_or_link: null,
  active_signups_count: 2,
  available_seats: 4,
  is_full: false,
  can_sign_up: true,
  signup: null,
};

const META = { current_page: 1, per_page: 25, total: 1, last_page: 1 };
const ZAWIESZONE = new Promise(() => {});

type Wynik = "ladowanie" | "dane" | "pusto" | "blad";

async function ustawTransport(wynik: Wynik) {
  const { ApiError } = await import("@/lib/api/klient");
  const odpowiedz = () => {
    if (wynik === "ladowanie") return ZAWIESZONE;
    if (wynik === "dane") return Promise.resolve({ data: [TERMIN], meta: META });
    if (wynik === "pusto") return Promise.resolve({ data: [], meta: { ...META, total: 0 } });
    return Promise.reject(new ApiError({ status: 500, code: "server_error", message: "Terminy niedostępne." }));
  };
  api.mockImplementation(odpowiedz);
  apiPaged.mockImplementation(odpowiedz);
}

async function html(element: unknown, gotowe: () => void | Promise<void>): Promise<string> {
  const { container } = render(element as React.ReactElement);
  await waitFor(gotowe);
  const wynik = container.innerHTML;
  cleanup();
  return wynik;
}

afterEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  przywrocRejestr();
});

describe("trasa /panel/superwizja przy wyłączonej grupie — bit w bit jak dotychczasowy ekran", () => {
  const STANY: [Wynik, () => void][] = [
    ["ladowanie", () => expect(screen.getByRole("status")).toBeInTheDocument()],
    ["dane", () => expect(screen.getByTestId("slot-4")).toBeInTheDocument()],
    ["pusto", () => expect(screen.getByText("Nie masz jeszcze dostępnych terminów u swojego superwizora.")).toBeInTheDocument()],
    ["blad", () => expect(screen.getAllByText("Terminy niedostępne.").length).toBeGreaterThan(0)],
  ];

  it.each(STANY)("stan %s: strona daje ten sam kod HTML co SupervisionSlots z components/h12", async (wynik, gotowe) => {
    podmienRejestr({});
    await ustawTransport(wynik);
    const { default: Strona } = await import("../page");
    const { default: StaryEkran } = await import("@/components/h12/SupervisionSlots");

    const zeStrony = await html(<>{Strona()}</>, gotowe);
    const zeStaregoEkranu = await html(<StaryEkran />, gotowe);

    expect(zeStrony).toBe(zeStaregoEkranu);
    expect(zeStrony.length).toBeGreaterThan(50);
  });

  it("kontrola dodatnia: przy włączonej grupie ten sam stan danych daje inny kod HTML i części nowego ekranu", async () => {
    podmienRejestr({ superwizjaUczestnika: true });
    await ustawTransport("dane");
    const { default: Strona } = await import("../page");
    const { default: StaryEkran } = await import("@/components/h12/SupervisionSlots");

    const poWczytaniu = () => {
      expect(screen.getAllByText(/15 października 2026/).length).toBeGreaterThan(0);
    };
    const zeStrony = await html(<>{Strona()}</>, poWczytaniu);
    const zeStaregoEkranu = await html(<StaryEkran />, poWczytaniu);

    expect(zeStrony).not.toBe(zeStaregoEkranu);
    render(<>{Strona()}</>);
    expect(await screen.findByRole("heading", { level: 1, name: "Superwizja" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 2, name: "Wolne terminy" })).toBeInTheDocument();
  });
});
