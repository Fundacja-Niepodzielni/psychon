import { afterEach, describe, expect, it, vi } from "vitest";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * Lista osób pod `/admin/uczestniczki` dostaje adres ekranu zakładania konta
 * wyłącznie przy włączonej grupie `noweKonto` — bez niej przycisk „Dodaj
 * osobę” nie ma dokąd prowadzić i lista go nie pokazuje.
 */

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

type Korzen = { props: { children: { props: { children: { props: { adresNowejOsoby?: string } } } } } };

const BEZ_PARAMETRU = { searchParams: Promise.resolve({}) };

afterEach(() => {
  przywrocRejestr();
});

describe("adres ekranu nowej osoby na liście osób", () => {
  it("grupa zakładania konta wyłączona: lista nie dostaje adresu", async () => {
    podmienRejestr({ listaOsob: true, nabor: true });
    const { default: Strona } = await import("../page");
    const korzen = (await Strona(BEZ_PARAMETRU)) as unknown as Korzen;
    expect(korzen.props.children.props.children.props.adresNowejOsoby).toBeUndefined();
  });

  it("grupa zakładania konta włączona: lista dostaje zwykły adres ekranu, nie adres roboczy", async () => {
    podmienRejestr({ listaOsob: true, nabor: true, noweKonto: true });
    const { default: Strona } = await import("../page");
    const korzen = (await Strona(BEZ_PARAMETRU)) as unknown as Korzen;
    expect(korzen.props.children.props.children.props.adresNowejOsoby).toBe("/admin/uczestniczki/nowa");
  });
});
