import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * Stara trasa `/panel/po-programie` czyta rejestr przełączenia: przy
 * wyłączonej grupie renderuje starą treść, przy włączonej przekierowuje na
 * nową trasę produktu (nie kończy się 404).
 */

type Blad = Error & { digest?: string };

function przechwycRzucony(funkcja: () => unknown): Blad | null {
  try {
    funkcja();
    return null;
  } catch (blad) {
    return blad as Blad;
  }
}

// Pierwszy import strony i obu treści to zimna transformacja całego drzewa
// komponentów; pod obciążeniem maszyny trwa dłużej niż limit pierwszego testu.
// Rozgrzewamy ją raz, we wstępie z własnym limitem, zamiast w testach.
beforeAll(async () => {
  await import("../page");
  await import("../StaraTresc");
}, 30_000);

afterEach(() => {
  przywrocRejestr();
});

describe("stara trasa /panel/po-programie a rejestr przełączenia", () => {
  it("grupa wyłączona: strona nic nie rzuca i zwraca starą treść", async () => {
    podmienRejestr({});
    const { default: Strona } = await import("../page");
    const StaraTresc = (await import("../StaraTresc")).default;

    let element: unknown;
    const rzucony = przechwycRzucony(() => {
      element = Strona();
    });

    expect(rzucony).toBeNull();
    expect((element as { type: unknown }).type).toBe(StaraTresc);
  });

  it("grupa włączona: strona przekierowuje na nową trasę produktu (307), bez 404", async () => {
    podmienRejestr({ wspolpraca: true });
    const { default: Strona } = await import("../page");

    const rzucony = przechwycRzucony(() => Strona());

    expect(rzucony).not.toBeNull();
    expect(rzucony?.digest).toBe("NEXT_REDIRECT;replace;/panel/dalsza-wspolpraca;307;");
    expect(rzucony?.digest ?? "").not.toContain("404");
  });

  it("przypadek odwrotny: ta sama strona przy wyłączonej grupie nie zawiera przekierowania", async () => {
    podmienRejestr({});
    const { default: Strona } = await import("../page");
    expect(przechwycRzucony(() => Strona())?.digest ?? "").not.toContain("NEXT_REDIRECT");
  });
});
