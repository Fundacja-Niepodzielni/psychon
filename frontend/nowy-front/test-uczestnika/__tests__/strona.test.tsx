import { describe, expect, it } from "vitest";
import Strona from "@/app/nowy-front/kurs-uczestnika/[slug]/test/page";
import { TestUczestnikaZAdresu } from "../TestUczestnikaZAdresu";

/** Poligon `/nowy-front/kurs-uczestnika/[slug]/test`: slug z adresu; tryb podglądu rozstrzyga ekran z adresu i roli. */

describe("poligon testu końcowego", () => {
  it("renderuje ekran z adresu ze slugiem z adresu i niczym więcej", async () => {
    const element = (await Strona({ params: Promise.resolve({ slug: "pierwsza-pomoc-psychologiczna" }) })) as {
      type: unknown;
      props: Record<string, unknown>;
    };
    expect(element.type).toBe(TestUczestnikaZAdresu);
    expect(element.props).toEqual({ slug: "pierwsza-pomoc-psychologiczna" });
  });
});
