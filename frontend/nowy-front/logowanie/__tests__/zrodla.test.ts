import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { importyComponentsInneNizLogo, naruszenia, plikiZrodlowe } from "../../wspolne/strona-publiczna/__tests__/zrodla";

describe("źródła ekranów logowania i ich podglądów", () => {
  it("bez surowych elementów, twardych barw, components/, HTML, formaterów dat i innych hostów", () => {
    const pliki = [
      ...plikiZrodlowe(resolve(__dirname, "..")),
      ...plikiZrodlowe(resolve(__dirname, "../../../app/nowy-front/publiczne/logowanie")),
    ];
    expect(pliki.some((p) => p.endsWith("Logowanie.tsx"))).toBe(true);
    expect(naruszenia(pliki, { "import z components/": ["/page.tsx"] })).toEqual([]);
    expect(importyComponentsInneNizLogo(pliki)).toEqual([]);
  });
});
