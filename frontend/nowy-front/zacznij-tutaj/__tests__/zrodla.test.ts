import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { importyComponentsInneNizLogo, naruszenia, plikiZrodlowe } from "../../wspolne/strona-publiczna/__tests__/zrodla";

describe("źródła ekranu „Zacznij tutaj” i podglądu", () => {
  it("bez surowych elementów, twardych barw, components/, HTML, formaterów dat; jedyny adres hosta to odtwarzacz YouTube", () => {
    const pliki = [
      ...plikiZrodlowe(resolve(__dirname, "..")),
      ...plikiZrodlowe(resolve(__dirname, "../../../app/nowy-front/publiczne/panel/start")),
    ];
    expect(pliki.filter((p) => p.endsWith("page.tsx"))).toHaveLength(1);
    expect(naruszenia(pliki, { "adres innego hosta": ["zacznij-tutaj/logika.ts"] })).toEqual([]);
    expect(importyComponentsInneNizLogo(pliki)).toEqual([]);
  });
});
