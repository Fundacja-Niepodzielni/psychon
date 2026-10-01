import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { opiszPodmianeTresci } from "@/lib/przelaczenie/__tests__/podmiana-tresci";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * Strona `/admin/kursy` czyta rejestr przełączenia (grupa `kursyAdministracji`):
 * przy grupie wyłączonej zwraca dokładnie starą treść (`StaraTresc`), przy
 * włączonej — ekran nowego frontu w dostawcy powłoki. Adres jest ten sam w obu
 * stanach, a szczegół kursu (`/admin/kursy/[id]`) zostaje dotychczasowym
 * ekranem. Podmienione są OBA moduły klienta API (`@/lib/api` i
 * `@/lib/api/klient`).
 */

const apiPaged = vi.fn();

vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
}));

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const KURS = {
  id: 5,
  title: "Wywiad psychologiczny",
  slug: "wywiad-psychologiczny",
  description: null,
  type: "course",
  product_group: "psychon",
  sequence_order: 1,
  edition_id: 1,
  is_published: true,
  lessons_count: 3,
  materials_count: 0,
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-01T10:00:00Z",
};

afterEach(() => {
  apiPaged.mockReset();
  przywrocRejestr();
});

opiszPodmianeTresci({
  nazwa: "/admin/kursy",
  klucz: "kursyAdministracji",
  plikStrony: "(administracja)/admin/kursy/page.tsx",
  zOwinieciem: true,
  zaladujStrone: () => import("../page"),
  zaladujStara: () => import("../StaraTresc"),
  zaladujNowy: () => import("@/nowy-front/kursy-administracji/KursyAdministracji").then((m) => m.KursyAdministracji),
});

describe("tytuł karty trasy /admin/kursy", () => {
  it("grupa włączona: „Kursy — Niepodzielni”; grupa wyłączona: bez własnego tytułu jak dotąd", async () => {
    podmienRejestr({ kursyAdministracji: true });
    expect((await import("../page")).metadata).toEqual({ title: "Kursy — Niepodzielni" });
    przywrocRejestr();

    podmienRejestr({});
    expect((await import("../page")).metadata).toEqual({});
  });
});

describe("strona /admin/kursy — render obu stanów na tym samym API", () => {
  it("grupa wyłączona: dotychczasowa lista (tekst pustego stanu sprzed zmiany)", async () => {
    podmienRejestr({});
    apiPaged.mockResolvedValue({ data: [], meta: undefined });
    const { default: Strona } = await import("../page");
    render(<>{Strona()}</>);
    expect(await screen.findByRole("heading", { name: "Nie ma jeszcze żadnego kursu. Utwórz pierwszy szkic." })).toBeInTheDocument();
    expect(screen.queryByText("Brak kursów w tej edycji")).toBeNull();
    cleanup();
  });

  it("grupa włączona: ekran nowego frontu z listą kursów i odnośnikiem do kursu", async () => {
    podmienRejestr({ kursyAdministracji: true });
    apiPaged.mockResolvedValue({ data: [KURS], meta: { current_page: 1, per_page: 100, total: 1, last_page: 1 } });
    const { default: Strona } = await import("../page");
    render(<>{Strona()}</>);
    expect(await screen.findByRole("link", { name: "Otwórz kurs: Wywiad psychologiczny" })).toHaveAttribute("href", "/admin/kursy/5");
    expect(apiPaged).toHaveBeenCalledWith("/admin/courses?page=1&per_page=100&sort=sequence_order");
  });
});
