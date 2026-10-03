import { afterEach, describe, expect, it } from "vitest";
import { opiszPodmianeTresci } from "@/lib/przelaczenie/__tests__/podmiana-tresci";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * Trasa `/admin/czas-nauki` a rejestr przełączenia (grupa `czasNauki`,
 * podmiana treści pod tym samym adresem): wspólny zestaw sprawdzeń
 * (wyłączona → `StaraTresc`, włączona → nowy ekran w `DostawcaPowloki`,
 * plik strony bez importów z `components/`) i tytuł karty — ten sam w obu
 * stanach, jak na dotychczasowej stronie.
 */

opiszPodmianeTresci({
  nazwa: "/admin/czas-nauki",
  klucz: "czasNauki",
  plikStrony: "(administracja)/admin/czas-nauki/page.tsx",
  zOwinieciem: true,
  zaladujStrone: () => import("../page"),
  zaladujStara: () => import("../StaraTresc"),
  zaladujNowy: () => import("@/nowy-front/czas-nauki/CzasNauki").then((m) => m.CzasNauki),
});

describe("tytuł karty trasy /admin/czas-nauki", () => {
  afterEach(przywrocRejestr);

  it("jest taki sam jak na dotychczasowej stronie, niezależnie od flagi grupy", async () => {
    for (const flagi of [{}, { czasNauki: true }] as const) {
      podmienRejestr(flagi);
      const { metadata } = await import("../page");
      expect(metadata).toEqual({ title: "Czas nauki — Niepodzielni" });
      przywrocRejestr();
    }
  });
});
