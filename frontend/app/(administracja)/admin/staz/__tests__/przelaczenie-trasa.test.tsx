import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { opiszPodmianeTresci } from "@/lib/przelaczenie/__tests__/podmiana-tresci";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * Trasa `/admin/staz` a rejestr przełączenia (grupa `kolejkaStazu`, podmiana
 * treści pod tym samym adresem):
 * - wspólny zestaw: wyłączona → `StaraTresc`, włączona → nowy ekran w
 *   `DostawcaPowloki`, plik strony bez importów z `components/`;
 * - tytuł karty ten sam w obu stanach;
 * - przy wyłączonej grupie strona renderuje się bit w bit jak sama kolejka
 *   z `components/h11` (ten sam kod HTML w stanach ładowanie, dane, błąd,
 *   odmowa), a przy włączonej — ekran nowego frontu z innym nagłówkiem.
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

// Pierwszy import strony i obu treści to zimna transformacja całego drzewa
// komponentów; pod obciążeniem maszyny trwa dłużej niż limit pierwszego testu.
// Rozgrzewamy ją raz, we wstępie z własnym limitem, zamiast w testach.
beforeAll(async () => {
  await import("../page");
  await import("../StaraTresc");
  await import("@/nowy-front/staz-kolejka/StazKolejka");
  await import("@/components/h11/AdminInternshipQueue");
}, 30_000);

opiszPodmianeTresci({
  nazwa: "/admin/staz",
  klucz: "kolejkaStazu",
  plikStrony: "(administracja)/admin/staz/page.tsx",
  zOwinieciem: true,
  zaladujStrone: () => import("../page"),
  zaladujStara: () => import("../StaraTresc"),
  zaladujNowy: () => import("@/nowy-front/staz-kolejka/StazKolejka").then((m) => m.StazKolejka),
});

describe("tytuł karty trasy /admin/staz", () => {
  it("jest taki sam jak na dotychczasowej stronie, niezależnie od flagi grupy", async () => {
    for (const flagi of [{}, { kolejkaStazu: true }] as const) {
      podmienRejestr(flagi);
      const { metadata } = await import("../page");
      expect(metadata).toEqual({ title: "Akceptacja stażu — Niepodzielni" });
      przywrocRejestr();
    }
  });
});

const WPIS = {
  id: 9,
  date: "2026-01-05",
  hours: "2.5",
  form: "phone_duty",
  consultations_count: 3,
  description: "Dyżur telefoniczny w poniedziałek.",
  status: "submitted",
  review_comment: null,
  decided_at: null,
  created_at: "2026-01-05T10:00:00Z",
  updated_at: "2026-01-05T10:00:00Z",
  user: { id: 4, first_name: "Kasia", last_name: "Wolna" },
};

const META = { current_page: 1, per_page: 25, total: 1, last_page: 1 };
const ZAWIESZONE = new Promise(() => {});

type Wynik = "ladowanie" | "dane" | "pusto" | "blad" | "odmowa";

async function ustawTransport(wynik: Wynik) {
  const { ApiError } = await import("@/lib/api/klient");
  const odpowiedz = () => {
    if (wynik === "ladowanie") return ZAWIESZONE;
    if (wynik === "dane") return Promise.resolve({ data: [WPIS], meta: META });
    if (wynik === "pusto") return Promise.resolve({ data: [], meta: { ...META, total: 0 } });
    if (wynik === "blad") {
      return Promise.reject(new ApiError({ status: 500, code: "server_error", message: "Kolejka niedostępna." }));
    }
    return Promise.reject(new ApiError({ status: 403, code: "forbidden", message: "Brak uprawnień." }));
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

describe("trasa /admin/staz przy wyłączonej grupie — bit w bit jak dotychczasowa kolejka", () => {
  const STANY: [Wynik, () => void][] = [
    ["ladowanie", () => expect(screen.getByRole("status")).toBeInTheDocument()],
    ["dane", () => expect(screen.getByText("Kasia Wolna")).toBeInTheDocument()],
    ["pusto", () => expect(screen.getByRole("heading", { name: "Brak wpisów oczekujących na decyzję." })).toBeInTheDocument()],
    ["blad", () => expect(screen.getByRole("alert")).toHaveTextContent("Kolejka niedostępna.")],
    ["odmowa", () => expect(screen.getByText("Brak dostępu")).toBeInTheDocument()],
  ];

  it.each(STANY)("stan %s: strona daje ten sam kod HTML co kolejka z components/h11", async (wynik, gotowe) => {
    podmienRejestr({});
    await ustawTransport(wynik);
    const { default: Strona } = await import("../page");
    const { default: Kolejka } = await import("@/components/h11/AdminInternshipQueue");

    const zeStrony = await html(<>{Strona()}</>, gotowe);
    const zKolejki = await html(<Kolejka />, gotowe);

    expect(zeStrony).toBe(zKolejki);
    expect(zeStrony.length).toBeGreaterThan(50);
  });

  it("kontrola dodatnia: przy włączonej grupie ten sam stan danych daje inny kod HTML i nowy nagłówek", async () => {
    podmienRejestr({ kolejkaStazu: true });
    await ustawTransport("dane");
    const { default: Strona } = await import("../page");
    const { default: Kolejka } = await import("@/components/h11/AdminInternshipQueue");

    const poKasi = () => {
      expect(screen.getByText("Kasia Wolna")).toBeInTheDocument();
    };
    const zeStrony = await html(<>{Strona()}</>, poKasi);
    const zKolejki = await html(<Kolejka />, poKasi);

    expect(zeStrony).not.toBe(zKolejki);
    render(<>{Strona()}</>);
    expect(await screen.findByRole("heading", { level: 1, name: "Dyżury do decyzji" })).toBeInTheDocument();
  });
});
