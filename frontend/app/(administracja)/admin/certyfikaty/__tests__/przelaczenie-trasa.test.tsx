import { afterEach, describe, expect, it } from "vitest";
import { opiszPodmianeTresci } from "@/lib/przelaczenie/__tests__/podmiana-tresci";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * Trasa `/admin/certyfikaty` a rejestr przełączenia (grupa `certyfikaty`,
 * podmiana treści pod tym samym adresem): wspólny zestaw sprawdzeń
 * (wyłączona → `StaraTresc`, włączona → nowy ekran w `DostawcaPowloki`,
 * plik strony bez importów z `components/`) i tytuł karty — przy włączonej
 * grupie z nagłówka ekranu, przy wyłączonej bez własnego tytułu, jak dotąd.
 */

opiszPodmianeTresci({
  nazwa: "/admin/certyfikaty",
  klucz: "certyfikaty",
  plikStrony: "(administracja)/admin/certyfikaty/page.tsx",
  zOwinieciem: true,
  zaladujStrone: () => import("../page"),
  zaladujStara: () => import("../StaraTresc"),
  zaladujNowy: () => import("@/nowy-front/certyfikaty-lista/CertyfikatyLista").then((m) => m.CertyfikatyLista),
});

describe("tytuł karty trasy /admin/certyfikaty", () => {
  afterEach(przywrocRejestr);

  it("grupa włączona: tytuł z nagłówka ekranu", async () => {
    podmienRejestr({ certyfikaty: true });
    const { metadata } = await import("../page");
    expect(metadata).toEqual({ title: "Certyfikaty — Niepodzielni" });
  });

  it("grupa wyłączona: bez własnego tytułu, jak na dotychczasowej stronie", async () => {
    podmienRejestr({});
    const { metadata } = await import("../page");
    expect(metadata).toEqual({});
  });

  it("włączona grupa certyfikatu uczestnika nie zmienia tej strony", async () => {
    podmienRejestr({ certyfikat: true });
    const { default: Strona, metadata } = await import("../page");
    const { default: StaraTresc } = await import("../StaraTresc");
    expect((Strona() as { type: unknown }).type).toBe(StaraTresc);
    expect(metadata).toEqual({});
  });
});
