import { describe, expect, it } from "vitest";
import Strona from "@/app/nowy-front/admin/raport/page";
import { RaportRokuProgramu } from "../RaportRokuProgramu";

/** Poligon `/nowy-front/admin/raport`: strona montuje ekran raportu roku programu i nic więcej. */

describe("strona podglądu raportu roku programu", () => {
  it("renderuje ekran bez właściwości", () => {
    const element = Strona() as { type: unknown; props: Record<string, unknown> };
    expect(element.type).toBe(RaportRokuProgramu);
    expect(element.props).toEqual({});
  });
});
