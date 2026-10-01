import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * Świadek wyboru ramki w układzie starej grupy tras administracji
 * (`app/(administracja)/admin/layout.tsx`): przy wszystkich grupach
 * przełączenia wyłączonych KAŻDA ścieżka `/admin/**` (każda strona z drzewa,
 * `[param]` zamieniony na liczbę) dostaje dotychczasowy `PanelShell` —
 * z menu „Menu — Administracja”, bez nowej ramki. Kontrola dodatnia: po
 * włączeniu grupy z tym samym adresem (pulpit) ta jedna ścieżka dostaje
 * nową ramkę, a sąsiednia nadal `PanelShell`. Podmienione są wyłącznie
 * transport HTTP, adres strony i rejestr przełączenia.
 */

const api = vi.fn();
let sciezka = "/admin";

// Powłoki administracji (`PowlokaAdministracji`: `api`, `endSession`; `PanelShell`: `endSession`) biorą klienta API z beczki `@/lib/api`, a transport z `@/lib/api/klient` — podmieniamy oba moduły na te same atrapy.
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: vi.fn().mockResolvedValue({ data: [], meta: undefined }),
  endSession: vi.fn(),
}));

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: vi.fn().mockResolvedValue({ data: [], meta: undefined }),
  endSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => sciezka,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const KORZEN = path.join(process.cwd(), "app", "(administracja)");

function sciezkiStron(katalog: string): string[] {
  return readdirSync(katalog).flatMap((nazwa) => {
    const pelna = path.join(katalog, nazwa);
    if (statSync(pelna).isDirectory()) return nazwa === "__tests__" ? [] : sciezkiStron(pelna);
    if (nazwa !== "page.tsx") return [];
    const wzgledna = path.relative(KORZEN, path.dirname(pelna)).split(path.sep).join("/");
    return [`/${wzgledna}`.replace(/\[[^\]]+\]/g, "12")];
  });
}

const STRONY_ADMIN = sciezkiStron(path.join(KORZEN, "admin"));

async function wyrenderujUklad(adres: string) {
  sciezka = adres;
  const { default: AdminLayout } = await import("@/app/(administracja)/admin/layout");
  const wynik = render(
    <AdminLayout>
      <p>Treść strony próbnej</p>
    </AdminLayout>,
  );
  await waitFor(() => expect(screen.getByText("Treść strony próbnej")).toBeTruthy());
  return wynik.container;
}

/**
 * Obie ramki nazywają menu tak samo („Menu — Administracja”); nową odróżnia
 * znacznik `data-powloka-panelu` szablonu `PowlokaPanelu`.
 */
function ramka(container: HTMLElement) {
  const nowa = container.querySelector("[data-powloka-panelu]") !== null;
  return {
    stara: !nowa && container.querySelector('nav[aria-label="Menu — Administracja"]') !== null,
    nowa,
    main: container.querySelectorAll("main").length,
    cele: container.querySelectorAll("#tresc").length,
  };
}

beforeEach(() => {
  api.mockReset();
  api.mockImplementation((adres: string) =>
    Promise.resolve(adres === "/me" ? { role: "project_manager", first_name: "Ewa", last_name: "Demo" } : []),
  );
});

afterEach(() => {
  cleanup();
  przywrocRejestr();
});

describe("układ starej grupy administracji — wszystkie grupy wyłączone", () => {
  it("drzewo stron jest niepuste i obejmuje strony A.2", () => {
    expect(STRONY_ADMIN.length).toBeGreaterThanOrEqual(15);
    expect(STRONY_ADMIN).toEqual(expect.arrayContaining(["/admin", "/admin/profile/12", "/admin/staz", "/admin/wzory-dokumentow", "/admin/ekran-startowy"]));
  });

  it.each(STRONY_ADMIN)("%s: dotychczasowy PanelShell, bez nowej ramki", async (adres) => {
    podmienRejestr({});
    const container = await wyrenderujUklad(adres);
    expect(ramka(container)).toEqual({ stara: true, nowa: false, main: 1, cele: 1 });
  });
});

describe("układ starej grupy administracji — kontrola dodatnia", () => {
  it("włączona grupa pulpitu: /admin w nowej ramce, /admin/kursy nadal w PanelShell", async () => {
    podmienRejestr({ pulpitAdministracji: true });
    const pulpit = await wyrenderujUklad("/admin");
    expect(ramka(pulpit)).toEqual({ stara: false, nowa: true, main: 1, cele: 1 });
    cleanup();

    const kursy = await wyrenderujUklad("/admin/kursy");
    expect(ramka(kursy)).toEqual({ stara: true, nowa: false, main: 1, cele: 1 });
  });
});
