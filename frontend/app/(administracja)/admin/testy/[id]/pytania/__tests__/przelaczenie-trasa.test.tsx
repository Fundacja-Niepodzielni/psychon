import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { opiszPodmianeTresci } from "@/lib/przelaczenie/__tests__/podmiana-tresci";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * Trasa `/admin/testy/[id]/pytania` a rejestr przełączenia (grupa
 * `pytaniaTestu`, podmiana treści pod tym samym adresem):
 * - wspólny zestaw: wyłączona → `StaraTresc`, włączona → ekran „Pytania testu”
 *   w `DostawcaPowloki`, plik strony bez importów z `components/`;
 * - tytuł karty: dotychczasowy przy wyłączonej grupie, nowy przy włączonej;
 * - ekran dostaje numer testu z adresu i numer kursu z parametru `kurs`
 *   (okruszek z powrotem do kursu), a dotychczasowa treść — sam numer testu.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  notFound: () => {
    throw new Error("notFound() wywołane");
  },
}));

opiszPodmianeTresci({
  nazwa: "/admin/testy/[id]/pytania",
  klucz: "pytaniaTestu",
  plikStrony: "(administracja)/admin/testy/[id]/pytania/page.tsx",
  argumenty: { params: Promise.resolve({ id: "12" }), searchParams: Promise.resolve({ kurs: "4" }) },
  zOwinieciem: true,
  zaladujStrone: () => import("../page"),
  zaladujStara: () => import("../StaraTresc"),
  zaladujNowy: () => import("@/nowy-front/pytania-testu/PytaniaTestu").then((m) => m.PytaniaTestu),
});

type Wezel = { props: { children: { props: { children: { props: Record<string, unknown> } } } } };

async function wlasciwosciEkranu(argumenty: Record<string, unknown>) {
  podmienRejestr({ pytaniaTestu: true });
  const { default: Strona } = await import("../page");
  const element = (await (Strona as (a: unknown) => unknown)(argumenty)) as Wezel;
  przywrocRejestr();
  return element.props.children.props.children.props;
}

describe("tytuł karty trasy /admin/testy/[id]/pytania", () => {
  it("grupa wyłączona: dotychczasowy „Bank pytań”, włączona: „Pytania testu”", async () => {
    podmienRejestr({});
    expect((await import("../page")).metadata).toEqual({ title: "Bank pytań — Niepodzielni" });
    podmienRejestr({ pytaniaTestu: true });
    expect((await import("../page")).metadata).toEqual({ title: "Pytania testu — Niepodzielni" });
    przywrocRejestr();
  });
});

describe("trasa /admin/testy/[id]/pytania — numer testu i kursu z adresu", () => {
  it("grupa włączona: ekran administracji dostaje numer testu i numer kursu z parametru `kurs`", async () => {
    const wlasciwosci = await wlasciwosciEkranu({ params: Promise.resolve({ id: "12" }), searchParams: Promise.resolve({ kurs: "4" }) });
    expect(wlasciwosci).toEqual({ idTestu: "12", panel: "administracja", idKursu: "4" });
  });

  it("bez parametru `kurs`, z parametrem powtórzonym albo bez parametrów zapytania: ekran nie dostaje numeru kursu", async () => {
    for (const searchParams of [Promise.resolve({}), Promise.resolve({ kurs: ["4", "5"] }), undefined]) {
      const wlasciwosci = await wlasciwosciEkranu({ params: Promise.resolve({ id: "12" }), searchParams });
      expect(wlasciwosci).toEqual({ idTestu: "12", panel: "administracja", idKursu: null });
    }
  });

  it("grupa wyłączona: dotychczasowa treść dostaje ten sam numer testu w `params`", async () => {
    podmienRejestr({});
    const { default: Strona } = await import("../page");
    const element = (await Strona({ params: Promise.resolve({ id: "12" }), searchParams: Promise.resolve({ kurs: "4" }) })) as unknown as {
      props: { params: Promise<{ id: string }> };
    };
    expect(await element.props.params).toEqual({ id: "12" });
    przywrocRejestr();
  });

  it("dotychczasowa treść to ten sam bank pytań starego frontu; zły numer testu kończy się 404", async () => {
    const zrodlo = readFileSync(path.join(process.cwd(), "app", "(administracja)/admin/testy/[id]/pytania/StaraTresc.tsx"), "utf-8");
    expect(zrodlo).toContain('import QuestionBank from "@/components/h10/QuestionBank";');
    expect(zrodlo).toContain("<QuestionBank key={testId} testId={testId} />");
    const { default: StaraTresc } = await import("../StaraTresc");
    await expect(StaraTresc({ params: Promise.resolve({ id: "abc" }) })).rejects.toThrow("notFound() wywołane");
  });
});
