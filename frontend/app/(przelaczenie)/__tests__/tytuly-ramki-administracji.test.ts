import { afterEach, describe, expect, it } from "vitest";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";
import { NAZWY_RAMKI_ADMINISTRACJI } from "@/lib/menu/ramka/administracja";

/**
 * Tytuł karty ekranów nowej ramki administracji: przy włączonej grupie
 * tytuł = nagłówek ekranu (= nazwa pozycji menu; dla pulpitu para ze
 * słownika „Pulpit” / „Pulpit administracji”), przy wyłączonej — bez
 * własnego tytułu, jak dotąd.
 */

const PRZYROSTEK = " — Niepodzielni";

afterEach(przywrocRejestr);

describe("tytuły stron nowej ramki administracji", () => {
  it("grupy włączone: /admin, /admin/ekran-startowy i /admin/zgloszenia-wspolpracy mają tytuł z nagłówka", async () => {
    podmienRejestr({ pulpitAdministracji: true, ekranStartowy: true, wspolpraca: true });
    const pulpit = await import("@/app/(administracja)/admin/page");
    const start = await import("@/app/(administracja)/admin/ekran-startowy/page");
    const zgloszenia = await import("@/app/(przelaczenie)/admin/zgloszenia-wspolpracy/page");

    expect(pulpit.metadata).toEqual({ title: `Pulpit administracji${PRZYROSTEK}` });
    expect(start.metadata).toEqual({ title: `${NAZWY_RAMKI_ADMINISTRACJI.ekranStartowy}${PRZYROSTEK}` });
    expect(zgloszenia.metadata).toEqual({ title: `${NAZWY_RAMKI_ADMINISTRACJI.zgloszeniaWspolpracy}${PRZYROSTEK}` });
  });

  it("grupy wyłączone: /admin i /admin/ekran-startowy bez własnego tytułu (jak dotąd)", async () => {
    podmienRejestr({});
    const pulpit = await import("@/app/(administracja)/admin/page");
    const start = await import("@/app/(administracja)/admin/ekran-startowy/page");

    expect(pulpit.metadata).toEqual({});
    expect(start.metadata).toEqual({});
  });
});
