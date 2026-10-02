import { describe, expect, it } from "vitest";
import Strona from "../page";
import { KursUczestnikaZAdresu } from "@/nowy-front/kurs-uczestnika/KursUczestnikaZAdresu";

/** Poligon `/nowy-front/kurs-uczestnika/[slug]`: slug z adresu; tryb podglądu rozstrzyga ekran z adresu i roli. */

async function wezel() {
  return (await Strona({ params: Promise.resolve({ slug: "wywiad-psychologiczny" }) })) as {
    type: unknown;
    props: Record<string, unknown>;
  };
}

describe("poligon strony kursu uczestnika", () => {
  it("renderuje ekran z adresu ze slugiem z adresu i niczym więcej", async () => {
    const element = await wezel();
    expect(element.type).toBe(KursUczestnikaZAdresu);
    expect(element.props).toEqual({ slug: "wywiad-psychologiczny" });
  });
});
