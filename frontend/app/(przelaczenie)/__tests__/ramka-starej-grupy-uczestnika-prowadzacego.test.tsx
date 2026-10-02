import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * Świadek wyboru ramki w układach starych grup tras uczestnika
 * (`app/(uczestnik)/panel/layout.tsx`) i prowadzącego
 * (`app/(prowadzacy)/prowadzacy/layout.tsx`): przy wszystkich grupach
 * przełączenia wyłączonych KAŻDA ścieżka z drzewa stron (`[param]`
 * zamieniony na liczbę) dostaje dotychczasowy `PanelShell`, bez nowej ramki.
 * Kontrola dodatnia: po włączeniu grupy z tym samym adresem (pulpit) ta
 * jedna ścieżka dostaje nową ramkę, a sąsiednia nadal `PanelShell`.
 * Podmienione są wyłącznie transport HTTP, adres strony i rejestr przełączenia.
 */

const api = vi.fn();
let sciezka = "/panel/pulpit";

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

function sciezkiStron(korzen: string, katalog: string): string[] {
  return readdirSync(katalog).flatMap((nazwa) => {
    const pelna = path.join(katalog, nazwa);
    if (statSync(pelna).isDirectory()) return nazwa === "__tests__" ? [] : sciezkiStron(korzen, pelna);
    if (nazwa !== "page.tsx") return [];
    const wzgledna = path.relative(korzen, path.dirname(pelna)).split(path.sep).join("/");
    return [`/${wzgledna}`.replace(/\[[^\]]+\]/g, "12")];
  });
}

const KORZEN_UCZESTNIKA = path.join(process.cwd(), "app", "(uczestnik)");
const KORZEN_PROWADZACEGO = path.join(process.cwd(), "app", "(prowadzacy)");
const STRONY_UCZESTNIKA = sciezkiStron(KORZEN_UCZESTNIKA, path.join(KORZEN_UCZESTNIKA, "panel"));
const STRONY_PROWADZACEGO = sciezkiStron(KORZEN_PROWADZACEGO, path.join(KORZEN_PROWADZACEGO, "prowadzacy"));

type Uklad = ComponentType<{ children: ReactNode }>;

async function wyrenderuj(adres: string, zaladuj: () => Promise<{ default: Uklad }>) {
  sciezka = adres;
  const { default: Layout } = await zaladuj();
  const wynik = render(
    <Layout>
      <p>Treść strony próbnej</p>
    </Layout>,
  );
  await waitFor(() => expect(screen.getByText("Treść strony próbnej")).toBeTruthy());
  return wynik.container;
}

const ukladUczestnika = () => import("@/app/(uczestnik)/panel/layout");
const ukladProwadzacego = () => import("@/app/(prowadzacy)/prowadzacy/layout");

/** Obie ramki nazywają menu tak samo; nową odróżnia znacznik `data-powloka-panelu`. */
function ramka(container: HTMLElement, etykietaMenu: string) {
  const nowa = container.querySelector("[data-powloka-panelu]") !== null;
  return {
    stara: !nowa && container.querySelector(`nav[aria-label="${etykietaMenu}"]`) !== null,
    nowa,
    main: container.querySelectorAll("main").length,
    cele: container.querySelectorAll("#tresc").length,
  };
}

const STARA = { stara: true, nowa: false, main: 1, cele: 1 };
const NOWA = { stara: false, nowa: true, main: 1, cele: 1 };

let rola = "volunteer";

beforeEach(() => {
  api.mockReset();
  api.mockImplementation((adres: string) =>
    Promise.resolve(adres === "/me" ? { role: rola, first_name: "Marta", last_name: "Demo" } : []),
  );
});

afterEach(() => {
  cleanup();
  przywrocRejestr();
});

describe("układ starej grupy uczestnika — wszystkie grupy wyłączone", () => {
  it("drzewo stron jest niepuste i obejmuje pulpit", () => {
    expect(STRONY_UCZESTNIKA.length).toBeGreaterThanOrEqual(10);
    expect(STRONY_UCZESTNIKA).toContain("/panel/pulpit");
  });

  it.each(STRONY_UCZESTNIKA)("%s: dotychczasowy PanelShell, bez nowej ramki", async (adres) => {
    rola = "volunteer";
    podmienRejestr({});
    const container = await wyrenderuj(adres, ukladUczestnika);
    expect(ramka(container, "Menu — Panel uczestnika")).toEqual(STARA);
  });
});

describe("układ starej grupy prowadzącego — wszystkie grupy wyłączone", () => {
  it("drzewo stron jest niepuste i obejmuje pulpit", () => {
    expect(STRONY_PROWADZACEGO.length).toBeGreaterThanOrEqual(4);
    expect(STRONY_PROWADZACEGO).toContain("/prowadzacy");
  });

  it.each(STRONY_PROWADZACEGO)("%s: dotychczasowy PanelShell, bez nowej ramki", async (adres) => {
    rola = "instructor";
    podmienRejestr({});
    const container = await wyrenderuj(adres, ukladProwadzacego);
    await waitFor(() => expect(container.querySelector("nav")).not.toBeNull());
    expect(ramka(container, "Menu — Panel prowadzącego")).toEqual(STARA);
  });
});

describe("kontrola dodatnia — włączona grupa z tym samym adresem", () => {
  it("pulpitUczestnika: /panel/pulpit w nowej ramce, /panel/kursy nadal w PanelShell", async () => {
    rola = "volunteer";
    podmienRejestr({ pulpitUczestnika: true });
    expect(ramka(await wyrenderuj("/panel/pulpit", ukladUczestnika), "Menu — Panel uczestnika")).toEqual(NOWA);
    cleanup();
    expect(ramka(await wyrenderuj("/panel/kursy", ukladUczestnika), "Menu — Panel uczestnika")).toEqual(STARA);
  });

  it("kursUczestnika: /panel/kursy/12 w nowej ramce, lista kursów i test kursu nadal w PanelShell", async () => {
    rola = "volunteer";
    podmienRejestr({ kursUczestnika: true });
    expect(ramka(await wyrenderuj("/panel/kursy/12", ukladUczestnika), "Menu — Panel uczestnika")).toEqual(NOWA);
    cleanup();
    expect(ramka(await wyrenderuj("/panel/kursy", ukladUczestnika), "Menu — Panel uczestnika")).toEqual(STARA);
    cleanup();
    expect(ramka(await wyrenderuj("/panel/kursy/12/test", ukladUczestnika), "Menu — Panel uczestnika")).toEqual(STARA);
  });

  it("pulpitProwadzacego: /prowadzacy w nowej ramce, /prowadzacy/kursy nadal w PanelShell", async () => {
    rola = "instructor";
    podmienRejestr({ pulpitProwadzacego: true });
    const pulpit = await wyrenderuj("/prowadzacy", ukladProwadzacego);
    await waitFor(() => expect(pulpit.querySelector("nav")).not.toBeNull());
    expect(ramka(pulpit, "Menu — Panel prowadzącego")).toEqual(NOWA);
    cleanup();
    const kursy = await wyrenderuj("/prowadzacy/kursy", ukladProwadzacego);
    await waitFor(() => expect(kursy.querySelector("nav")).not.toBeNull());
    expect(ramka(kursy, "Menu — Panel prowadzącego")).toEqual(STARA);
  });
});
