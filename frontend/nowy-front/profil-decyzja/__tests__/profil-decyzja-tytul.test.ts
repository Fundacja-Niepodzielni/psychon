import { afterEach, describe, expect, it } from "vitest";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * Tytuł karty `/admin/profile/[id]`: przy włączonej grupie stały tytuł
 * ekranu szczegółu, bez imienia i nazwiska osoby; przy wyłączonej — bez
 * własnego tytułu, jak dotychczasowa strona.
 */

afterEach(przywrocRejestr);

describe("/admin/profile/[id] — tytuł karty", () => {
  it("grupa włączona: „Wniosek o profil — Niepodzielni”", async () => {
    podmienRejestr({ decyzjaProfilu: true });
    const strona = await import("@/app/(administracja)/admin/profile/[id]/page");
    expect(strona.metadata).toEqual({ title: "Wniosek o profil — Niepodzielni" });
  });

  it("grupa wyłączona: bez własnego tytułu (jak dotąd)", async () => {
    podmienRejestr({});
    const strona = await import("@/app/(administracja)/admin/profile/[id]/page");
    expect(strona.metadata).toEqual({});
  });
});
