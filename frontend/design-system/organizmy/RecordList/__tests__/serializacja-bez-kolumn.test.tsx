import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PRZYPADKI_BEZ_KOLUMN } from "./przypadki-bez-kolumn";
import zapis from "./serializacja-bez-kolumn.json";

/**
 * Lista bez trybu kolumn rysuje się dokładnie tak jak przed jego dodaniem:
 * serializacja każdego przypadku z `przypadki-bez-kolumn.tsx` (właściwości
 * takie, jakie podają organizmowi ekrany nieużywające kolumn) jest równa
 * zapisowi zrobionemu przed zmianą organizmu (`serializacja-bez-kolumn.json`).
 */
const ZAPIS = zapis as Record<string, string>;

describe("RecordList i ListRow bez trybu kolumn — serializacja jak przed zmianą", () => {
  it("zapis obejmuje dokładnie te same przypadki co lista przypadków", () => {
    expect(Object.keys(ZAPIS)).toEqual(PRZYPADKI_BEZ_KOLUMN.map((przypadek) => przypadek.nazwa));
    expect(PRZYPADKI_BEZ_KOLUMN.length).toBeGreaterThanOrEqual(21);
  });

  it.each(PRZYPADKI_BEZ_KOLUMN.map((przypadek) => [przypadek.nazwa, przypadek] as const))(
    "%s",
    (nazwa, przypadek) => {
      expect(renderToStaticMarkup(przypadek.element)).toBe(ZAPIS[nazwa]);
    },
  );
});
