import { afterEach, describe, expect, it } from "vitest";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";
import { NAZWY_RAMKI_UCZESTNIKA } from "@/lib/menu/ramka/uczestnik";

/**
 * Tytuł karty ekranów nowej ramki uczestnika i prowadzącego: przy włączonej
 * grupie tytuł = nagłówek ekranu (= nazwa pozycji menu; dla pulpitu
 * prowadzącego para ze słownika „Pulpit” / „Pulpit prowadzącego”), przy
 * wyłączonej — tytuł jak dotąd.
 */

const PRZYROSTEK = " — Niepodzielni";

afterEach(przywrocRejestr);

describe("tytuły stron nowej ramki uczestnika i prowadzącego", () => {
  it("grupy włączone: pulpit uczestnika, po programie i pulpit prowadzącego mają tytuł z nagłówka", async () => {
    podmienRejestr({ pulpitUczestnika: true, wspolpraca: true, pulpitProwadzacego: true });
    const pulpit = await import("@/app/(uczestnik)/panel/pulpit/page");
    const poProgramie = await import("@/app/(przelaczenie)/panel/dalsza-wspolpraca/page");
    const prowadzacy = await import("@/app/(prowadzacy)/prowadzacy/page");

    expect(pulpit.metadata).toEqual({ title: `${NAZWY_RAMKI_UCZESTNIKA.pulpit}${PRZYROSTEK}` });
    expect(poProgramie.metadata).toEqual({ title: `${NAZWY_RAMKI_UCZESTNIKA.poProgramie}${PRZYROSTEK}` });
    expect(prowadzacy.metadata).toEqual({ title: `Pulpit prowadzącego${PRZYROSTEK}` });
  });

  it("grupa wyłączona: pulpit prowadzącego z dotychczasowym tytułem", async () => {
    podmienRejestr({});
    const prowadzacy = await import("@/app/(prowadzacy)/prowadzacy/page");
    expect(prowadzacy.metadata).toEqual({ title: `Panel prowadzącego${PRZYROSTEK}` });
  });
});
