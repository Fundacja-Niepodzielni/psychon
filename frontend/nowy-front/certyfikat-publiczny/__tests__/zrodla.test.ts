import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { importyComponentsInneNizLogo, naruszenia, plikiZrodlowe } from "../../wspolne/strona-publiczna/__tests__/zrodla";

describe("źródła ekranów certyfikatu publicznego i ich podglądów", () => {
  it("bez surowych elementów, twardych barw, components/ (poza znakiem w podglądzie), HTML, formaterów dat i innych hostów", () => {
    const pliki = [
      ...plikiZrodlowe(resolve(__dirname, "..")),
      ...plikiZrodlowe(resolve(__dirname, "../../../app/nowy-front/publiczne/weryfikacja")),
      ...plikiZrodlowe(resolve(__dirname, "../../../app/nowy-front/publiczne/certyfikat")),
    ];
    expect(pliki.filter((p) => p.endsWith("page.tsx"))).toHaveLength(2);
    expect(naruszenia(pliki, { "import z components/": ["/page.tsx"] })).toEqual([]);
    expect(importyComponentsInneNizLogo(pliki)).toEqual([]);
  });
});
