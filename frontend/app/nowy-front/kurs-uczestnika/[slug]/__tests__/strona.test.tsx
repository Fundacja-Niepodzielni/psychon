import { describe, expect, it } from "vitest";
import Strona from "../page";
import { KursUczestnika } from "@/nowy-front/kurs-uczestnika/KursUczestnika";

/** Poligon `/nowy-front/kurs-uczestnika/[slug]`: slug z adresu, pas podglądu tylko przy `?podglad=1`. */

async function wezel(parametry: { podglad?: string | string[] }) {
  return (await Strona({
    params: Promise.resolve({ slug: "wywiad-psychologiczny" }),
    searchParams: Promise.resolve(parametry),
  })) as { type: unknown; props: { slug: string; podglad: boolean } };
}

describe("poligon strony kursu uczestnika", () => {
  it("renderuje ekran ze slugiem z adresu, bez pasa podglądu", async () => {
    const element = await wezel({});
    expect(element.type).toBe(KursUczestnika);
    expect(element.props).toEqual({ slug: "wywiad-psychologiczny", podglad: false });
  });

  it("?podglad=1 włącza pas podglądu; inna wartość go nie włącza", async () => {
    expect((await wezel({ podglad: "1" })).props.podglad).toBe(true);
    expect((await wezel({ podglad: "0" })).props.podglad).toBe(false);
    expect((await wezel({ podglad: ["1", "1"] })).props.podglad).toBe(false);
  });
});
