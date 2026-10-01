import { afterEach, describe, expect, it } from "vitest";
import { opiszPodmianeTresci } from "@/lib/przelaczenie/__tests__/podmiana-tresci";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * Strona `/admin/kursy/[id]` czyta rejestr przełączenia (grupa
 * `kursAdministracji`): przy grupie wyłączonej zwraca dokładnie dotychczasową
 * treść (`StaraTresc`) z tym samym identyfikatorem, przy włączonej — ekran
 * kursu nowego frontu w dostawcy powłoki. Adres jest ten sam w obu stanach.
 */

const ARGUMENTY = { params: Promise.resolve({ id: "12" }) };

afterEach(() => {
  przywrocRejestr();
});

opiszPodmianeTresci({
  nazwa: "/admin/kursy/[id]",
  klucz: "kursAdministracji",
  plikStrony: "(administracja)/admin/kursy/[id]/page.tsx",
  argumenty: ARGUMENTY,
  zOwinieciem: true,
  zaladujStrone: () => import("../page"),
  zaladujStara: () => import("../StaraTresc"),
  zaladujNowy: () => import("@/nowy-front/kurs-administracji/KursAdministracji").then((m) => m.KursAdministracji),
});

interface Element {
  props: { children?: Element; params?: Promise<{ id: string }>; idKursu?: string };
}

describe("strona /admin/kursy/[id] — identyfikator z adresu trafia do obu treści", () => {
  it("grupa wyłączona: stara treść dostaje ten sam identyfikator w `params`", async () => {
    podmienRejestr({});
    const { default: Strona } = await import("../page");
    const element = (await Strona(ARGUMENTY)) as unknown as Element;

    await expect(element.props.params).resolves.toEqual({ id: "12" });
  });

  it("grupa włączona: ekran kursu dostaje identyfikator z adresu", async () => {
    podmienRejestr({ kursAdministracji: true });
    const { default: Strona } = await import("../page");
    const element = (await Strona(ARGUMENTY)) as unknown as Element;

    expect(element.props.children?.props.children?.props.idKursu).toBe("12");
  });
});
