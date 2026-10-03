import { beforeAll, describe, expect, it } from "vitest";
import { opiszPodmianeTresci } from "@/lib/przelaczenie/__tests__/podmiana-tresci";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

// Pierwszy import strony i obu treści to zimna transformacja całego drzewa
// komponentów; pod obciążeniem maszyny trwa dłużej niż limit pierwszego testu.
// Rozgrzewamy ją raz, we wstępie z własnym limitem, zamiast w testach.
beforeAll(async () => {
  await import("../page");
  await import("../StaraTresc");
  await import("@/nowy-front/karta-osoby/KartaOsoby");
}, 30_000);

opiszPodmianeTresci({
  nazwa: "/admin/uczestniczki/[id]",
  klucz: "kartaOsoby",
  plikStrony: "(administracja)/admin/uczestniczki/[id]/page.tsx",
  argumenty: { params: Promise.resolve({ id: "17" }) },
  zOwinieciem: true,
  zaladujStrone: () => import("../page"),
  zaladujStara: () => import("../StaraTresc"),
  zaladujNowy: () => import("@/nowy-front/karta-osoby/KartaOsoby").then((m) => m.KartaOsoby),
});

type Wezel = { props: { children: { props: { children: { props: Record<string, unknown> } } } } };

describe("trasa /admin/uczestniczki/[id] — numer osoby z adresu", () => {
  it("grupa włączona: karta dostaje numer jako liczbę i nie dostaje adresu przedłużenia dostępu", async () => {
    podmienRejestr({ kartaOsoby: true });
    const { default: Strona } = await import("../page");
    const element = (await Strona({ params: Promise.resolve({ id: "17" }) })) as unknown as Wezel;
    expect(element.props.children.props.children.props).toEqual({ id: 17 });
    przywrocRejestr();
  });

  it("grupa wyłączona: dotychczasowa treść dostaje ten sam numer w `params`", async () => {
    podmienRejestr({});
    const { default: Strona } = await import("../page");
    const element = (await Strona({ params: Promise.resolve({ id: "17" }) })) as unknown as {
      props: { params: Promise<{ id: string }> };
    };
    expect(await element.props.params).toEqual({ id: "17" });
    przywrocRejestr();
  });

  it("dotychczasowa treść to ta sama karta starego frontu z numerem z adresu", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const zrodlo = readFileSync(path.join(process.cwd(), "app", "(administracja)/admin/uczestniczki/[id]/StaraTresc.tsx"), "utf-8");
    expect(zrodlo).toContain('import AdminUserCard from "@/components/h18/AdminUserCard";');
    expect(zrodlo).toContain("<AdminUserCard id={Number(id)} />");
  });
});
