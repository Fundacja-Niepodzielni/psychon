import { describe, expect, it } from "vitest";
import { opiszPodmianeTresci } from "@/lib/przelaczenie/__tests__/podmiana-tresci";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

opiszPodmianeTresci({
  nazwa: "/admin/profile/[id]",
  klucz: "decyzjaProfilu",
  plikStrony: "(administracja)/admin/profile/[id]/page.tsx",
  argumenty: { params: Promise.resolve({ id: "3" }) },
  zaladujStrone: () => import("../page"),
  zaladujStara: () => import("../StaraTresc"),
  zaladujNowy: () => import("@/nowy-front/profil-decyzja/ProfilDecyzja").then((m) => m.ProfilDecyzja),
});

describe("trasa /admin/profile/[id] — numer wniosku z adresu", () => {
  it("grupa włączona: nowy ekran dostaje numer z adresu bez zmian", async () => {
    podmienRejestr({ decyzjaProfilu: true });
    const { default: Strona } = await import("../page");
    const element = (await Strona({ params: Promise.resolve({ id: "17" }) })) as {
      props: { children: { props: { id: string } } };
    };
    expect(element.props.children.props.id).toBe("17");
    przywrocRejestr();
  });

  it("grupa wyłączona: dotychczasowa treść dostaje ten sam numer w `params`", async () => {
    podmienRejestr({});
    const { default: Strona } = await import("../page");
    const element = (await Strona({ params: Promise.resolve({ id: "17" }) })) as {
      props: { params: Promise<{ id: string }> };
    };
    expect(await element.props.params).toEqual({ id: "17" });
    przywrocRejestr();
  });
});
