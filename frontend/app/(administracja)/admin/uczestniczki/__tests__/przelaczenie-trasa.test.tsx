import { afterEach, describe, expect, it, vi } from "vitest";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * Strona `/admin/uczestniczki` jest trasą wspólną dwóch grup przełączenia
 * (`nabor` i `listaOsob`, włączanych razem):
 * - obie wyłączone: dokładnie stara treść z zakładkami (`StaraTresc`),
 *   także dla `?zakladka=zgloszenia` — nic nie przekierowuje;
 * - obie włączone: adres bez parametru i `?zakladka=osoby` pokazują nową
 *   listę osób w dostawcy powłoki, a `?zakladka=zgloszenia` przekierowuje
 *   (307) na `/admin/nabor`, nie kończy się 404.
 */

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

type Blad = Error & { digest?: string };

async function przechwycRzucony(funkcja: () => Promise<unknown>): Promise<Blad | null> {
  try {
    await funkcja();
    return null;
  } catch (blad) {
    return blad as Blad;
  }
}

const parametry = (zakladka?: string) => ({ searchParams: Promise.resolve(zakladka === undefined ? {} : { zakladka }) });

type Korzen = { type: unknown; props: { children: { type: unknown; props: { children: { type: unknown } } } } };

afterEach(() => {
  przywrocRejestr();
});

describe("strona /admin/uczestniczki a rejestr przełączenia", () => {
  it("obie grupy wyłączone: stara treść bez owijania, także dla ?zakladka=zgloszenia", async () => {
    podmienRejestr({});
    const { default: Strona } = await import("../page");
    const StaraTresc = (await import("../StaraTresc")).default;

    for (const zakladka of [undefined, "osoby", "zgloszenia"]) {
      const element = await Strona(parametry(zakladka));
      expect((element as { type: unknown }).type, `zakladka=${zakladka}`).toBe(StaraTresc);
    }
  });

  it("obie grupy włączone: nowa lista osób w dostawcy powłoki, bez parametru i dla ?zakladka=osoby", async () => {
    podmienRejestr({ listaOsob: true, nabor: true });
    const { default: Strona } = await import("../page");
    const { DostawcaPowloki } = await import("@/design-system/szablony/KontekstPowloki");
    const { OsobyLista } = await import("@/nowy-front/osoby-lista/OsobyLista");

    for (const zakladka of [undefined, "osoby", "cokolwiek"]) {
      const korzen = (await Strona(parametry(zakladka))) as unknown as Korzen;
      expect(korzen.type, `zakladka=${zakladka}`).toBe("div");
      expect(korzen.props.children.type).toBe(DostawcaPowloki);
      expect(korzen.props.children.props.children.type).toBe(OsobyLista);
    }
  });

  it("obie grupy włączone: ?zakladka=zgloszenia przekierowuje 307 na /admin/nabor, bez 404", async () => {
    podmienRejestr({ listaOsob: true, nabor: true });
    const { default: Strona } = await import("../page");

    const rzucony = await przechwycRzucony(() => Strona(parametry("zgloszenia")));

    expect(rzucony?.digest).toBe("NEXT_REDIRECT;replace;/admin/nabor;307;");
    expect(rzucony?.digest ?? "").not.toContain("404");
  });

  it("przypadek odwrotny: wyłączona grupa naboru nie przekierowuje, a wyłączona lista osób zostawia starą treść", async () => {
    podmienRejestr({ listaOsob: true });
    const { default: Strona } = await import("../page");
    expect((await przechwycRzucony(() => Strona(parametry("zgloszenia"))))?.digest ?? "").not.toContain("NEXT_REDIRECT");

    podmienRejestr({ nabor: true });
    const { default: StronaBezListy } = await import("../page");
    const StaraTresc = (await import("../StaraTresc")).default;
    // Nabór włączony sam przekierowuje zakładkę, ale reszta adresu zostaje starą treścią.
    expect(((await StronaBezListy(parametry())) as { type: unknown }).type).toBe(StaraTresc);
  });

  it("tytuł karty zostaje taki jak dotąd", async () => {
    podmienRejestr({ listaOsob: true, nabor: true });
    const modul = await import("../page");
    expect(modul.metadata).toEqual({ title: "Uczestniczki i uczestnicy — Niepodzielni" });
  });
});
