import { describe, expect, it } from "vitest";
import StronaAdministracji from "@/app/nowy-front/admin/testy/[id]/pytania/page";
import StronaProwadzacego from "@/app/nowy-front/prowadzacy/testy/[id]/pytania/page";
import { PytaniaTestu } from "../PytaniaTestu";

/** Poligony `/nowy-front/admin/testy/[id]/pytania` i `/nowy-front/prowadzacy/testy/[id]/pytania`: numer testu z adresu, panel ze ścieżki, kurs z parametru. */

type Wezel = { type: unknown; props: Record<string, unknown> };

describe("strony podglądu pytań testu", () => {
  it("administracja: ten sam ekran z numerem testu i kursem z parametru", async () => {
    const element = (await StronaAdministracji({ params: Promise.resolve({ id: "10" }), searchParams: Promise.resolve({ kurs: "2" }) })) as Wezel;
    expect(element.type).toBe(PytaniaTestu);
    expect(element.props).toEqual({ idTestu: "10", panel: "administracja", idKursu: "2" });
  });

  it("prowadzący: ten sam ekran; powtórzony albo brakujący parametr kursu daje brak kursu", async () => {
    const bez = (await StronaProwadzacego({ params: Promise.resolve({ id: "10" }), searchParams: Promise.resolve({}) })) as Wezel;
    expect(bez.type).toBe(PytaniaTestu);
    expect(bez.props).toEqual({ idTestu: "10", panel: "prowadzacy", idKursu: null });
    const powtorzony = (await StronaProwadzacego({ params: Promise.resolve({ id: "10" }), searchParams: Promise.resolve({ kurs: ["2", "3"] }) })) as Wezel;
    expect(powtorzony.props.idKursu).toBeNull();
  });
});
