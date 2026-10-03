import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { opiszPodmianeTresci } from "@/lib/przelaczenie/__tests__/podmiana-tresci";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * Trasa `/prowadzacy/testy/[id]/pytania` a rejestr przełączenia (grupa
 * `pytaniaTestu`, podmiana treści pod tym samym adresem):
 * - wspólny zestaw: wyłączona → `StaraTresc`, włączona → ekran „Pytania testu”
 *   w `DostawcaPowloki`, plik strony bez importów z `components/`;
 * - tytuł karty: dotychczasowy przy wyłączonej grupie, nowy przy włączonej;
 * - ekran prowadzącego dostaje numer testu i numer kursu z parametru `kurs`;
 * - łańcuch na żywo: prawdziwy układ prowadzącego (strażnik roli + wybór ramki),
 *   strona i ekran; prowadzący czyta pytania trasą prowadzącego
 *   (`/instructor/tests/{test}/questions`) i dostaje pełny ekran z listą, a test
 *   obcego kursu (serwer: 404) pokazuje „Nie znaleziono testu”, nie ekran
 *   odmowy. Podmienione są wyłącznie transport HTTP i rejestr grup.
 */

vi.setConfig({ testTimeout: 30_000 });

const api = vi.fn();
const apiPaged = vi.fn();
const push = vi.fn();

vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
}));

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  endSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/prowadzacy/testy/12/pytania",
  useSearchParams: () => new URLSearchParams("kurs=4"),
  useRouter: () => ({ back: vi.fn(), push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  notFound: () => {
    throw new Error("notFound() wywołane");
  },
}));

opiszPodmianeTresci({
  nazwa: "/prowadzacy/testy/[id]/pytania",
  klucz: "pytaniaTestu",
  plikStrony: "(prowadzacy)/prowadzacy/testy/[id]/pytania/page.tsx",
  argumenty: { params: Promise.resolve({ id: "12" }), searchParams: Promise.resolve({ kurs: "4" }) },
  zOwinieciem: true,
  zaladujStrone: () => import("../page"),
  zaladujStara: () => import("../StaraTresc"),
  zaladujNowy: () => import("@/nowy-front/pytania-testu/PytaniaTestu").then((m) => m.PytaniaTestu),
});

type Wezel = { props: { children: { props: { children: { props: Record<string, unknown> } } } } };

describe("tytuł karty trasy /prowadzacy/testy/[id]/pytania", () => {
  it("grupa wyłączona: dotychczasowy „Bank pytań”, włączona: „Pytania testu”", async () => {
    podmienRejestr({});
    expect((await import("../page")).metadata).toEqual({ title: "Bank pytań — Panel prowadzącego — Niepodzielni" });
    podmienRejestr({ pytaniaTestu: true });
    expect((await import("../page")).metadata).toEqual({ title: "Pytania testu — Panel prowadzącego — Niepodzielni" });
    przywrocRejestr();
  });
});

describe("trasa /prowadzacy/testy/[id]/pytania — numer testu i kursu z adresu", () => {
  it("grupa włączona: ekran prowadzącego dostaje numer testu i numer kursu z parametru `kurs`", async () => {
    podmienRejestr({ pytaniaTestu: true });
    const { default: Strona } = await import("../page");
    const element = (await Strona({ params: Promise.resolve({ id: "12" }), searchParams: Promise.resolve({ kurs: "4" }) })) as unknown as Wezel;
    expect(element.props.children.props.children.props).toEqual({ idTestu: "12", panel: "prowadzacy", idKursu: "4" });
    przywrocRejestr();
  });

  it("grupa wyłączona: dotychczasowa treść dostaje ten sam numer testu w `params`", async () => {
    podmienRejestr({});
    const { default: Strona } = await import("../page");
    const element = (await Strona({ params: Promise.resolve({ id: "12" }), searchParams: Promise.resolve({}) })) as unknown as {
      props: { params: Promise<{ id: string }> };
    };
    expect(await element.props.params).toEqual({ id: "12" });
    przywrocRejestr();
  });

  it("dotychczasowa treść to ten sam bank pytań starego frontu", () => {
    const zrodlo = readFileSync(path.join(process.cwd(), "app", "(prowadzacy)/prowadzacy/testy/[id]/pytania/StaraTresc.tsx"), "utf-8");
    expect(zrodlo).toContain('import QuestionBank from "@/components/h10/QuestionBank";');
    expect(zrodlo).toContain("<QuestionBank key={testId} testId={testId} />");
  });
});

const PYTANIE = {
  id: 41,
  body: "Co jest pierwszym krokiem w rozmowie z osobą w kryzysie?",
  sequence_order: 1,
  answers: [
    { id: 210, body: "Zadbanie o bezpieczeństwo i spokojne nawiązanie kontaktu", is_correct: true },
    { id: 211, body: "Ocena, kto ponosi winę za sytuację", is_correct: false },
  ],
};

async function wyrenderujLancuch(odpowiedzPytan: () => Promise<unknown>) {
  podmienRejestr({ pytaniaTestu: true });
  const [{ default: Uklad }, { default: Strona }] = await Promise.all([
    import("@/app/(prowadzacy)/prowadzacy/layout"),
    import("../page"),
  ]);
  api.mockReset().mockImplementation((url: string) => {
    if (url === "/me") return Promise.resolve({ role: "instructor" });
    if (url === "/instructor/tests/12/questions") return odpowiedzPytan();
    return Promise.reject(new Error(`nieoczekiwane wywołanie: ${url}`));
  });
  apiPaged.mockResolvedValue({ data: [], meta: undefined });

  const tresc = (await Strona({ params: Promise.resolve({ id: "12" }), searchParams: Promise.resolve({ kurs: "4" }) })) as ReactElement;
  await act(async () => {
    render(<Uklad>{tresc}</Uklad>);
  });
}

describe("łańcuch na żywo: układ prowadzącego → strona → ekran → trasy prowadzącego", () => {
  it("prowadzący widzi pełny ekran pytań testu swojego kursu: lista, „Dodaj pytanie”, okruszek do kursu, jeden main", async () => {
    await wyrenderujLancuch(() => Promise.resolve([PYTANIE]));

    expect(await screen.findByRole("heading", { level: 3, name: "Pytanie 1" })).toBeInTheDocument();
    expect(screen.getByText("Co jest pierwszym krokiem w rozmowie z osobą w kryzysie?")).toBeInTheDocument();
    expect(screen.getByText("Poprawna")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dodaj pytanie" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edytuj pytanie 1" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Kurs" })).toHaveAttribute("href", "/prowadzacy/kursy/4");
    expect(screen.queryByRole("heading", { name: "Nie masz dostępu do tego ekranu" })).toBeNull();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(api).toHaveBeenCalledWith("/instructor/tests/12/questions");
    expect(api.mock.calls.filter(([url]) => String(url).startsWith("/admin/"))).toEqual([]);
    przywrocRejestr();
  });

  it("test obcego kursu (serwer: 404): „Nie znaleziono testu” i jeden przycisk powrotu do kursu, bez ekranu odmowy", async () => {
    const { ApiError } = await import("@/lib/api/klient");
    await wyrenderujLancuch(() => Promise.reject(new ApiError({ status: 404, code: "not_found", message: "Nie znaleziono zasobu." })));

    expect(await screen.findByRole("heading", { name: "Nie znaleziono testu" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Nie masz dostępu do tego ekranu" })).toBeNull();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    await act(async () => {
      screen.getByRole("button", { name: "Wróć do kursu" }).click();
    });
    expect(push).toHaveBeenCalledWith("/prowadzacy/kursy/4");
    przywrocRejestr();
  });
});
