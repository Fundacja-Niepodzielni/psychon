import { describe, expect, it } from "vitest";
import { opiszPodmianeTresci } from "@/lib/przelaczenie/__tests__/podmiana-tresci";

opiszPodmianeTresci({
  nazwa: "/admin/wzory-dokumentow",
  klucz: "wzoryDokumentow",
  plikStrony: "(administracja)/admin/wzory-dokumentow/page.tsx",
  zOwinieciem: true,
  zaladujStrone: () => import("../page"),
  zaladujStara: () => import("../StaraTresc"),
  zaladujNowy: () => import("@/nowy-front/wzory-dokumentow/WzoryDokumentow").then((m) => m.WzoryDokumentow),
});

describe("tytuł karty trasy /admin/wzory-dokumentow", () => {
  it("jest taki sam jak na dotychczasowej stronie, niezależnie od flagi grupy", async () => {
    const { metadata } = await import("../page");
    expect(metadata).toEqual({ title: "Wzory dokumentów — Niepodzielni" });
  });
});
