import { describe, expect, it } from "vitest";
import { opiszPodmianeTresci } from "@/lib/przelaczenie/__tests__/podmiana-tresci";

opiszPodmianeTresci({
  nazwa: "/admin/emails",
  klucz: "powiadomienia",
  plikStrony: "(administracja)/admin/emails/page.tsx",
  zOwinieciem: true,
  zaladujStrone: () => import("../page"),
  zaladujStara: () => import("../StaraTresc"),
  zaladujNowy: () => import("@/nowy-front/powiadomienia-email/PowiadomieniaEmail").then((m) => m.PowiadomieniaEmail),
});

describe("tytuł karty trasy /admin/emails", () => {
  it("strona nie ustawia własnego tytułu karty, tak samo jak dotychczasowa skrzynka", async () => {
    const modul = (await import("../page")) as Record<string, unknown>;
    expect(modul.metadata).toBeUndefined();
  });
});
