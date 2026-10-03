// @vitest-environment node
//
// Próba par stanów wyprowadzanych z reguł CSS atomów
// (scripts/pomiar-marginesu-kontrastu.mjs: wczytajRegulyCss,
// wygrywajacaDeklaracja, zbudujParyStanowZCss, PARY_STANOW_Z_CSS).
//
// Co mierzy:
//   - wypełniony przycisk niebezpieczny (`Button`, poziom `primary` +
//     `niebezpieczny`) ma tło w barwie błędu i tekst o kontraście co
//     najmniej 4,5:1 w motywie jasnym i ciemnym (na spoczynku, `:hover`,
//     `:focus-visible`) — dawniej czerwień na zieleni, ok. 1,2:1;
//   - para jest czytana z prawdziwego `Button.module.css`, a nie wpisana
//     obok niego: reguła cofnięta do starej postaci (podana przyrządowi jako
//     tekst, bez dotykania dysku) musi zaświecić pary poniżej progu.
//
// Środowisko `node`: przyrząd liczy własną ścieżkę z `import.meta.url`.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  PARY_STANOW_Z_CSS,
  TOKENY_PAR_STANOW,
  TOKENY_POZA_ZAKRESEM,
  sprawdzTokenyStanow,
  wczytajProdukcyjneTokenyTresci,
  wyklasyfikujTokenyTresci,
  wczytajRegulyCss,
  wygrywajacaDeklaracja,
  zbudujParyStanowZCss,
} from "../scripts/pomiar-marginesu-kontrastu.mjs";

const POWIERZCHNIE = ["bg", "card", "grey", "card-warm"];
const SCIEZKA_PRZYCISKU = "design-system/atomy/Button/Button.module.css";

function czytajZDysku(plik: string): string {
  return readFileSync(fileURLToPath(new URL(`../${plik}`, import.meta.url)), "utf8");
}

type Wiersz = { etykieta: string; kontrast: number; prog: number; margines: number };

function pary(czytaj: (plik: string) => string): Wiersz[] {
  return zbudujParyStanowZCss(wczytajProdukcyjneTokenyTresci(), POWIERZCHNIE, czytaj) as Wiersz[];
}

// Niezależny rachunek WCAG (nie funkcja przyrządu), z barw wczytanych z tokeny.css.
function jasnosc(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function kontrastHex(a: string, b: string): number {
  const [x, y] = [jasnosc(a), jasnosc(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe("przycisk główny niebezpieczny — para tekst/tło z prawdziwego CSS", () => {
  const tokeny = wczytajProdukcyjneTokenyTresci() as { jasny: Record<string, string>; ciemny: Record<string, string> };

  it("tło wypełnionego przycisku niebezpiecznego to barwa błędu, a tekst nie jest barwą błędu", () => {
    const reguly = wczytajRegulyCss(czytajZDysku(SCIEZKA_PRZYCISKU), SCIEZKA_PRZYCISKU);
    const element = [".przycisk", ".primary", ".niebezpieczny"];
    const tlo = wygrywajacaDeklaracja(reguly, element, ["background", "background-color"], SCIEZKA_PRZYCISKU);
    const tekst = wygrywajacaDeklaracja(reguly, element, ["color"], SCIEZKA_PRZYCISKU);
    expect(tlo?.wartosc).toBe("var(--error)");
    expect(tekst?.wartosc).not.toBe("var(--error)");
  });

  it.each(["jasny", "ciemny"] as const)("kontrast tekstu do tła w motywie %s wynosi co najmniej 4,5 (rachunek niezależny)", (motyw) => {
    const t = tokeny[motyw];
    const reguly = wczytajRegulyCss(czytajZDysku(SCIEZKA_PRZYCISKU), SCIEZKA_PRZYCISKU);
    for (const czesci of [[], [":hover"], [":focus-visible"]]) {
      const element = [".przycisk", ".primary", ".niebezpieczny", ...czesci];
      const tlo = wygrywajacaDeklaracja(reguly, element, ["background"], SCIEZKA_PRZYCISKU)!.wartosc.match(/var\(--([\w-]+)\)/)![1];
      const tekst = wygrywajacaDeklaracja(reguly, element, ["color"], SCIEZKA_PRZYCISKU)!.wartosc.match(/var\(--([\w-]+)\)/)![1];
      expect(kontrastHex(t[tekst], t[tlo]), `${motyw} ${czesci.join("") || "spoczynek"}: --${tekst} na --${tlo}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("przyrząd: wszystkie pary stanów z prawdziwego CSS są powyżej progu i obejmują przycisk niebezpieczny w obu motywach", () => {
    const wiersze = pary(czytajZDysku);
    expect(wiersze.length).toBeGreaterThan(0);
    expect(wiersze.filter((w) => w.margines < 0).map((w) => w.etykieta)).toEqual([]);
    for (const motyw of ["jasny", "ciemny"]) {
      for (const stan of ["spoczynek", ":hover", ":focus-visible"]) {
        const etykieta = `Przycisk główny niebezpieczny (${stan}): --on-primary na --error (${motyw}, z CSS)`;
        expect(wiersze.map((w) => w.etykieta), etykieta).toContain(etykieta);
      }
    }
  });

  it("mutant w próbie: stara reguła (sam `color: var(--error)` na `.primary`) świeci pary poniżej progu w obu motywach", () => {
    const zdysku = czytajZDysku(SCIEZKA_PRZYCISKU);
    const staryCss = zdysku.replace(/\.primary\.niebezpieczny\s*\{[^}]*\}/, "");
    expect(staryCss).not.toBe(zdysku); // mutant naprawdę coś usunął
    const czerwone = pary((plik) => (plik === SCIEZKA_PRZYCISKU ? staryCss : czytajZDysku(plik))).filter((w) => w.margines < 0);
    expect(czerwone.length).toBeGreaterThan(0);
    for (const motyw of ["jasny", "ciemny"]) {
      expect(czerwone.some((w) => w.etykieta.includes(`--error na --primary (${motyw}`) && w.kontrast < 1.3)).toBe(true);
    }
  });

  it("tabela PARY_STANOW_Z_CSS wskazuje istniejące pliki CSS i element z klasą niebezpieczny", () => {
    for (const opis of PARY_STANOW_Z_CSS as Array<{ plik: string; element: string[] }>) {
      expect(() => czytajZDysku(opis.plik)).not.toThrow();
    }
    expect((PARY_STANOW_Z_CSS as Array<{ element: string[] }>).some((o) => o.element.includes(".niebezpieczny"))).toBe(true);
  });
});

describe("kaskada CSS w przyrządzie — model specyficzności", () => {
  it("wyższa specyficzność wygrywa niezależnie od kolejności; remis rozstrzyga późniejsza reguła", () => {
    const reguly = wczytajRegulyCss(
      ".a.b { color: var(--x); }\n.a { color: var(--y); }\n.c { color: var(--p); }\n.c { color: var(--q); }",
      "próba",
    );
    expect(wygrywajacaDeklaracja(reguly, [".a", ".b"], ["color"], "próba")?.wartosc).toBe("var(--x)");
    expect(wygrywajacaDeklaracja(reguly, [".c"], ["color"], "próba")?.wartosc).toBe("var(--q)");
    expect(wygrywajacaDeklaracja(reguly, [".z"], ["color"], "próba")).toBeNull();
  });

  it("selektor z kombinatorem i reguła @ są poza modelem: rzut, nie ciche pominięcie", () => {
    expect(() => wygrywajacaDeklaracja(wczytajRegulyCss(".a .b { color: red; }", "próba"), [".a"], ["color"], "próba")).toThrow(/poza modelem/);
    expect(() => wczytajRegulyCss("@media (min-width: 1px) { .a { color: red; } }", "próba")).toThrow(/poza modelem/);
  });
});

describe("klasyfikacja tokenów akcji i błędu — bez wyłączenia z pomiaru", () => {
  it("`primary`, `primary-hover`, `error`, `error-bg` i `on-primary` nie stoją już w rejestrze poza zakresem", () => {
    const poza = (TOKENY_POZA_ZAKRESEM as Array<{ nazwa: string }>).map((w) => w.nazwa);
    for (const nazwa of ["primary", "primary-hover", "error", "error-bg", "on-primary"]) {
      expect(poza).not.toContain(nazwa);
    }
  });

  it("`error` jest tekstem (wchodzi do iloczynu tekst × powierzchnia), a `error-bg` nie jest wciągnięty jako tekst przez przedrostek", () => {
    const { jasny } = wczytajProdukcyjneTokenyTresci() as unknown as { jasny: Record<string, string> };
    const { teksty, powierzchnie, stany } = wyklasyfikujTokenyTresci(Object.keys(jasny)) as {
      teksty: string[];
      powierzchnie: string[];
      stany: string[];
    };
    expect(teksty).toContain("error");
    expect(teksty).not.toContain("error-bg");
    expect(powierzchnie).not.toContain("error-bg");
    expect([...stany].sort()).toEqual([...TOKENY_PAR_STANOW].sort());
  });

  it("token z listy par stanów, którego nie ma w arkuszu, rzuca (martwy wpis nie znika po cichu)", () => {
    expect(() => sprawdzTokenyStanow({ jasny: { primary: "#000000" }, ciemny: { primary: "#000000" } })).toThrow(/primary-hover|error-bg|on-primary/);
  });
});

describe.each([
  ["pole tekstowe", "design-system/atomy/Input/Input.module.css"],
  ["lista wyboru", "design-system/atomy/Select/Select.module.css"],
])("%s w stanie błędu z fokusem klawiatury — pierścień widoczny na tle", (_nazwa, plik) => {
  const tokeny = wczytajProdukcyjneTokenyTresci() as { jasny: Record<string, string>; ciemny: Record<string, string> };
  const element = [".pole", '[aria-invalid="true"]', ":focus-visible"];

  function token(deklaracja: { wartosc: string } | null, mapa: Record<string, string>): string | null {
    const nazwy = [...(deklaracja?.wartosc ?? "").matchAll(/var\(--([\w-]+)\)/g)].map((m) => m[1]).filter((n) => n in mapa);
    return nazwy.length > 0 ? nazwy[nazwy.length - 1] : null;
  }

  it.each(["jasny", "ciemny"] as const)("motyw %s: pierścień nie jest barwą błędu ani jej tłem i ma co najmniej 3:1 wobec każdej powierzchni (rachunek niezależny)", (motyw) => {
    const t = tokeny[motyw];
    const reguly = wczytajRegulyCss(czytajZDysku(plik), plik);
    const pierscien = token(wygrywajacaDeklaracja(reguly, element, ["outline", "outline-color"], plik), t);
    const obramowanie = token(wygrywajacaDeklaracja(reguly, element, ["border-color"], plik), t);
    expect(pierscien).not.toBeNull();
    expect(obramowanie).toBe("error");
    expect(pierscien).not.toBe("error");
    expect(pierscien).not.toBe("error-bg");
    for (const powierzchnia of POWIERZCHNIE) {
      expect(kontrastHex(t[pierscien!], t[powierzchnia]), `${motyw}: --${pierscien} na --${powierzchnia}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("przyrząd: pary pierścienia z prawdziwego CSS są powyżej progu 3,0", () => {
    const wiersze = pary(czytajZDysku).filter((w) => w.etykieta.includes("pierścień") && w.etykieta.startsWith(_nazwa === "pole tekstowe" ? "Pole tekstowe" : "Lista wyboru"));
    expect(wiersze.length).toBe(POWIERZCHNIE.length * 2);
    expect(wiersze.filter((w) => w.margines < 0).map((w) => w.etykieta)).toEqual([]);
  });

  it("mutant w próbie: stary fokus (sama poświata `--error-bg`, bez reguły `:focus-visible` dla błędu) świeci pary poniżej progu", () => {
    const zdysku = czytajZDysku(plik);
    const stary = zdysku.replace(/\.pole\[aria-invalid="true"\]:focus-visible\s*\{[^}]*\}/, "");
    expect(stary).not.toBe(zdysku);
    const czerwone = pary((p) => (p === plik ? stary : czytajZDysku(p))).filter((w) => w.margines < 0);
    expect(czerwone.length).toBe(POWIERZCHNIE.length * 2);
    expect(czerwone.every((w) => w.etykieta.includes("pierścień --error-bg") && w.kontrast < 1.3)).toBe(true);
  });
});
