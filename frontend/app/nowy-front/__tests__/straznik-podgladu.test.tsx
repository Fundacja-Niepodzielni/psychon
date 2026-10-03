import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";

/**
 * Strażnik roli stron podglądu pod `/nowy-front`: w każdym układzie ze strażnikiem rola spoza
 * jego listy dostaje wspólny ekran „Brak dostępu” i nie widzi ekranu strony, a każda rola z listy
 * widzi ekran strony. Role każdego układu są tu wpisane wprost — te same co role strażnika trasy
 * produktu, którą strona podglądu pokazuje; równość ról z trasą produktu w drzewie `app/` sprawdza
 * przegląd `lib/przelaczenie/__tests__/straznik-roli-grup.test.ts`. Ekran strony zastępuje tu jeden
 * akapit, bo mierzony jest sam strażnik, a nie treść ekranu (ekrany ze strażnikiem przepuszczonym
 * odpowiedzią `GET /me` renderuje `__tests__/punkty-orientacyjne-tresc.test.tsx`).
 */

const { api, ApiError } = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { api: vi.fn(), ApiError };
});

vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => api(...args),
  ApiError,
}));

type Uklad = ComponentType<{ children: ReactNode }>;

interface UkladZeStraznikiem {
  adres: string;
  wczytaj: () => Promise<{ default: Uklad }>;
  role: string[];
  obcaRola: string;
}

const UKLADY: UkladZeStraznikiem[] = [
  {
    adres: "/nowy-front/admin",
    wczytaj: () => import("../admin/layout"),
    role: ["project_manager", "super_admin"],
    obcaRola: "instructor",
  },
  { adres: "/nowy-front/prowadzacy", wczytaj: () => import("../prowadzacy/layout"), role: ["instructor"], obcaRola: "volunteer" },
  { adres: "/nowy-front/kurs", wczytaj: () => import("../kurs/layout"), role: ["instructor"], obcaRola: "project_manager" },
  { adres: "/nowy-front/certyfikat", wczytaj: () => import("../certyfikat/layout"), role: ["volunteer"], obcaRola: "student" },
  {
    adres: "/nowy-front/profil-psychologa",
    wczytaj: () => import("../profil-psychologa/layout"),
    role: ["volunteer"],
    obcaRola: "student",
  },
  { adres: "/nowy-front/staz", wczytaj: () => import("../staz/layout"), role: ["volunteer"], obcaRola: "student" },
  { adres: "/nowy-front/superwizja", wczytaj: () => import("../superwizja/layout"), role: ["volunteer"], obcaRola: "instructor" },
];

const TRESC_EKRANU = "Ekran strony podglądu";

async function renderujZRola(wczytaj: UkladZeStraznikiem["wczytaj"], rola: string) {
  api.mockImplementation((sciezka: string) =>
    sciezka === "/me" ? Promise.resolve({ role: rola }) : Promise.reject(new ApiError(500, "nieoczekiwane żądanie")),
  );
  const { default: Uklad } = await wczytaj();
  render(
    <Uklad>
      <p>{TRESC_EKRANU}</p>
    </Uklad>,
  );
}

beforeEach(() => {
  api.mockReset();
});

describe.each(UKLADY)("strażnik roli układu $adres", ({ wczytaj, role, obcaRola }) => {
  it(`rola spoza listy (${obcaRola}) widzi „Brak dostępu”, bez ekranu strony`, async () => {
    await renderujZRola(wczytaj, obcaRola);

    expect(await screen.findByRole("heading", { level: 1, name: "Brak dostępu" })).toBeInTheDocument();
    expect(screen.queryByText(TRESC_EKRANU)).not.toBeInTheDocument();
    expect(api.mock.calls.map(([sciezka]) => sciezka)).toEqual(["/me"]);
  });

  it.each(role)("rola %s widzi ekran strony", async (rola) => {
    await renderujZRola(wczytaj, rola);

    expect(await screen.findByText(TRESC_EKRANU)).toBeInTheDocument();
    expect(screen.queryByText("Brak dostępu")).not.toBeInTheDocument();
    expect(api.mock.calls.map(([sciezka]) => sciezka)).toEqual(["/me"]);
  });
});
