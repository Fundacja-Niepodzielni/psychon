import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ucieknijWyrazenie } from "../e2e/_wyrazenie";

describe("ucieknijWyrazenie — adres wstawiany do wyrażenia regularnego prób przeglądarkowych", () => {
  it("zwykły adres dopasowuje się do siebie i tylko do siebie", () => {
    const wzorzec = new RegExp(`${ucieknijWyrazenie("/admin/wzory-dokumentow")}$`);
    expect(wzorzec.test("http://127.0.0.1:3000/admin/wzory-dokumentow")).toBe(true);
    expect(wzorzec.test("http://127.0.0.1:3000/admin/wzory-dokumentowx")).toBe(false);
  });

  it("znaki specjalne wyrażenia są dosłowne, w tym ukośnik wsteczny", () => {
    const ukosnikWsteczny = String.fromCharCode(92);
    const przypadki = ["a.b", "a*b", "a+b", "a?b", "a^b", "a$b", "a{1}b", "a(b)c", "a|b", "a[b]c", `a${ukosnikWsteczny}b`, `a${ukosnikWsteczny}d`];
    for (const znaki of przypadki) {
      const wzorzec = new RegExp(`^${ucieknijWyrazenie(znaki)}$`);
      expect(wzorzec.test(znaki), znaki).toBe(true);
    }
    expect(new RegExp(`^${ucieknijWyrazenie("a.c")}$`).test("abc")).toBe(false);
    expect(new RegExp(`^${ucieknijWyrazenie(`a${ukosnikWsteczny}d`)}$`).test("a1")).toBe(false);
  });

  it("ukośnik zwykły też jest dosłowny", () => {
    expect(new RegExp(`^${ucieknijWyrazenie("/a/b")}$`).test("/a/b")).toBe(true);
  });

  it("żadna próba przeglądarkowa nie buduje wyrażenia z adresu własną zamianą znaków — tylko przez ucieknijWyrazenie", () => {
    const katalog = join(__dirname, "..", "e2e");
    const wlasnaZamiana = /new RegExp\(`[^`]*\$\{[^}]*\.replace\(/;
    const naruszenia = readdirSync(katalog)
      .filter((nazwa) => nazwa.endsWith(".ts"))
      .flatMap((nazwa) =>
        readFileSync(join(katalog, nazwa), "utf8")
          .split("\n")
          .map((wiersz, indeks) => ({ miejsce: `${nazwa}:${indeks + 1}`, wiersz }))
          .filter(({ wiersz }) => wlasnaZamiana.test(wiersz))
          .map(({ miejsce }) => miejsce),
      );
    expect(naruszenia).toEqual([]);
  });
});
