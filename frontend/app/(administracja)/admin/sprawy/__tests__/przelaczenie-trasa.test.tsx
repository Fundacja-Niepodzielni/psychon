import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { opiszPodmianeTresci } from "@/lib/przelaczenie/__tests__/podmiana-tresci";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * Strona `/admin/sprawy` czyta rejestr przełączenia (grupa `sprawy`): przy
 * grupie wyłączonej zwraca dokładnie starą treść (`StaraTresc`), przy
 * włączonej — ekran nowego frontu w dostawcy powłoki. Adres jest ten sam w obu
 * stanach. Podmienione są OBA moduły klienta API (`@/lib/api` i
 * `@/lib/api/klient`), bo ekran i stara treść sięgają po sieć każde przez
 * inny z nich.
 */

const apiPaged = vi.fn();

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return { ...actual, apiPaged: (...args: unknown[]) => apiPaged(...args) };
});

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const SPRAWA = {
  id: 7,
  subject: "Prośba o rozmowę",
  body: "Treść sprawy",
  created_at: "2026-09-30T18:50:00Z",
  reporter: { id: 5, first_name: "Joanna", last_name: "Prowadząca" },
  volunteer: null,
};

function odpowiedzNaTrase(sciezka: string) {
  if (sciezka.startsWith("/admin/supervision/cases")) return { data: [SPRAWA], meta: undefined };
  return { data: [], meta: { current_page: 1, per_page: 100, total: 0, last_page: 1 } };
}

// Pierwszy import strony i obu treści to zimna transformacja całego drzewa
// komponentów; pod obciążeniem maszyny trwa dłużej niż limit pierwszego testu.
// Rozgrzewamy ją raz, we wstępie z własnym limitem, zamiast w testach.
beforeAll(async () => {
  await import("../page");
  await import("../StaraTresc");
  await import("@/nowy-front/sprawy/Sprawy");
}, 30_000);

afterEach(() => {
  apiPaged.mockReset();
  przywrocRejestr();
});

opiszPodmianeTresci({
  nazwa: "/admin/sprawy",
  klucz: "sprawy",
  plikStrony: "(administracja)/admin/sprawy/page.tsx",
  zOwinieciem: true,
  zaladujStrone: () => import("../page"),
  zaladujStara: () => import("../StaraTresc"),
  zaladujNowy: () => import("@/nowy-front/sprawy/Sprawy").then((m) => m.Sprawy),
});

describe("strona /admin/sprawy — render obu stanów na tym samym API", () => {
  it("wyłączona renderuje bit w bit starą treść, włączona inną (nowy ekran)", async () => {
    apiPaged.mockImplementation(async (sciezka: string) => odpowiedzNaTrase(sciezka));

    podmienRejestr({});
    const wylaczona = await import("../page");
    const stara = await import("../StaraTresc");
    const zWylaczona = render(<wylaczona.default />);
    await screen.findByText("Prośba o rozmowę");
    const htmlStrony = zWylaczona.container.innerHTML;
    zWylaczona.unmount();
    const zStarej = render(<stara.default />);
    await screen.findByText("Prośba o rozmowę");
    expect(htmlStrony).toBe(zStarej.container.innerHTML);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Sprawy");
    zStarej.unmount();

    przywrocRejestr();
    podmienRejestr({ sprawy: true });
    const wlaczona = await import("../page");
    const zWlaczona = render(<wlaczona.default />);
    // Nowy ekran pokazuje sprawę w zwiniętym wierszu (rodzaj, osoba, czas czekania);
    // temat stoi dopiero po „Otwórz” — stara treść pokazuje go od razu.
    const otworz = await screen.findByRole("button", { name: /^Otwórz sprawę od prowadzącego/ });
    expect(screen.queryByText("Prośba o rozmowę")).toBeNull();
    fireEvent.click(otworz);
    await screen.findByRole("heading", { level: 3, name: "Prośba o rozmowę" });
    expect(zWlaczona.container.innerHTML).not.toBe(htmlStrony);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Sprawy do decyzji");
    expect(screen.getByRole("heading", { level: 2, name: "Sprawy zgłoszone przez prowadzących" })).toBeInTheDocument();
  });

  it("tytuł karty jest ten sam w obu stanach grupy", async () => {
    const { metadata } = await import("../page");
    expect(metadata.title).toBe("Sprawy — Niepodzielni");
  });
});
