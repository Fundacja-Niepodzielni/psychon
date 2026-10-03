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
 *   strona i ekran; serwer odmawia roli prowadzącego (403, dziś trasy pytań
 *   dopuszczają tylko administrację), więc osoba widzi wspólny ekran odmowy
 *   ze swoją rolą i jednym przyciskiem powrotu. Podmienione są wyłącznie
 *   transport HTTP i rejestr grup.
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

describe("łańcuch na żywo: układ prowadzącego → strona → ekran → odmowa serwera", () => {
  it("prowadzący dostaje wspólny ekran odmowy ze swoją rolą, okruszkiem do kursu i jednym przyciskiem powrotu", async () => {
    podmienRejestr({ pytaniaTestu: true });
    const [{ default: Uklad }, { default: Strona }, { ApiError }] = await Promise.all([
      import("@/app/(prowadzacy)/prowadzacy/layout"),
      import("../page"),
      import("@/lib/api/klient"),
    ]);
    api.mockImplementation((url: string) => {
      if (url === "/me") return Promise.resolve({ role: "instructor" });
      if (url === "/admin/tests/12/questions") {
        return Promise.reject(new ApiError({ status: 403, code: "forbidden", message: "Nie masz dostępu do tej sekcji." }));
      }
      return Promise.reject(new Error(`nieoczekiwane wywołanie: ${url}`));
    });
    apiPaged.mockResolvedValue({ data: [], meta: undefined });

    const tresc = (await Strona({ params: Promise.resolve({ id: "12" }), searchParams: Promise.resolve({ kurs: "4" }) })) as ReactElement;
    await act(async () => {
      render(<Uklad>{tresc}</Uklad>);
    });

    expect(await screen.findByRole("heading", { name: "Nie masz dostępu do tego ekranu" })).toBeInTheDocument();
    expect(await screen.findByText("Twoja rola: Psycholog prowadzący. Ten ekran jest dla administracji.")).toBeInTheDocument();
    expect(screen.getByText("Nie masz dostępu do tej sekcji.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kurs" })).toHaveAttribute("href", "/prowadzacy/kursy/4");
    expect(screen.getAllByRole("main")).toHaveLength(1);
    await act(async () => {
      screen.getByRole("button", { name: "Wróć do kursu" }).click();
    });
    expect(push).toHaveBeenCalledWith("/prowadzacy/kursy/4");
    expect(api).toHaveBeenCalledWith("/admin/tests/12/questions");
    przywrocRejestr();
  });
});
