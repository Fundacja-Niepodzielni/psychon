import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GRUPY, type DefinicjaGrupy } from "@/lib/przelaczenie/grupy";

/**
 * Rejestr grup zna każdy ekran nowego frontu, a grupy nie da się włączyć
 * bez strony pod nową trasą. Trasy stron wyprowadza z drzewa `app/`:
 * katalog w nawiasach (grupa tras) nie wchodzi do adresu, segmenty
 * dynamiczne zostają w postaci `[id]`.
 */

const KATALOG_APP = path.join(process.cwd(), "app");
const PREFIKS_POLIGONU = "/" + ["nowy", "front"].join("-");

function trasyStron(katalog: string, segmenty: string[] = []): string[] {
  const wynik: string[] = [];
  for (const wpis of readdirSync(katalog, { withFileTypes: true })) {
    if (wpis.isDirectory()) {
      if (wpis.name === "__tests__") continue;
      const jestGrupaTras = /^\(.*\)$/.test(wpis.name);
      wynik.push(...trasyStron(path.join(katalog, wpis.name), jestGrupaTras ? segmenty : [...segmenty, wpis.name]));
    } else if (wpis.name === "page.tsx") {
      wynik.push("/" + segmenty.join("/"));
    }
  }
  return wynik;
}

function ekranyGrup(grupy: Record<string, DefinicjaGrupy>) {
  return Object.values(grupy).flatMap((grupa) => grupa.ekrany.map((ekran) => ({ grupa, ekran })));
}

/** Trasy poligonu, których żaden ekran żadnej grupy nie wskazuje. */
function trasyPoligonuBezGrupy(trasyPoligonu: string[], grupy: Record<string, DefinicjaGrupy>): string[] {
  const znane = new Set(ekranyGrup(grupy).map(({ ekran }) => ekran.trasaPoligonu));
  return trasyPoligonu.filter((trasa) => !znane.has(trasa));
}

/** Ekrany grup wskazujące trasę poligonu, której strona nie istnieje. */
function ekranyBezStronyPoligonu(trasyPoligonu: string[], grupy: Record<string, DefinicjaGrupy>): string[] {
  return ekranyGrup(grupy)
    .map(({ ekran }) => ekran.trasaPoligonu)
    .filter((trasa) => !trasyPoligonu.includes(trasa));
}

/** Trasy ekranów włączonej grupy, pod którymi nie ma strony. */
function brakujaceStronyWlaczonejGrupy(grupa: DefinicjaGrupy, trasyProduktu: string[]): string[] {
  if (!grupa.wlaczona) return [];
  return grupa.ekrany.map((ekran) => ekran.nowaTrasa).filter((trasa) => !trasyProduktu.includes(trasa));
}

const wszystkieTrasy = trasyStron(KATALOG_APP);
const trasyPoligonu = wszystkieTrasy.filter((trasa) => trasa.startsWith(PREFIKS_POLIGONU + "/"));

describe("rejestr grup a ekrany nowego frontu w drzewie app/", () => {
  it("drzewo ma ekrany nowego frontu, a wyprowadzanie tras rozpoznaje grupy tras i segmenty dynamiczne", () => {
    expect(trasyPoligonu.length).toBeGreaterThan(0);
    expect(wszystkieTrasy).toContain("/panel/po-programie");
    expect(wszystkieTrasy).toContain("/prowadzacy/kursy/[id]");
    expect(wszystkieTrasy.some((trasa) => trasa.includes("("))).toBe(false);
  });

  it("każdy ekran nowego frontu należy do jakiejś grupy rejestru", () => {
    expect(trasyPoligonuBezGrupy(trasyPoligonu, GRUPY)).toEqual([]);
  });

  it("każdy ekran rejestru wskazuje istniejącą stronę nowego frontu", () => {
    expect(ekranyBezStronyPoligonu(trasyPoligonu, GRUPY)).toEqual([]);
  });

  it("przypadek odwrotny: ekran spoza rejestru albo wpis bez strony zostaje wykryty", () => {
    const { wspolpraca: _pominieta, ...bezWspolpracy } = GRUPY;
    void _pominieta;
    expect(trasyPoligonuBezGrupy(trasyPoligonu, bezWspolpracy).sort()).toEqual([
      "/nowy-front/admin/zgloszenia-wspolpracy",
      "/nowy-front/po-programie",
    ]);
    expect(ekranyBezStronyPoligonu(trasyPoligonu.filter((trasa) => trasa !== "/nowy-front/po-programie"), GRUPY)).toEqual([
      "/nowy-front/po-programie",
    ]);
  });

  it("stara trasa każdego ekranu istnieje w drzewie", () => {
    for (const { grupa, ekran } of ekranyGrup(GRUPY)) {
      if (ekran.staraTrasa === null) continue;
      expect(wszystkieTrasy, `grupa ${grupa.klucz}`).toContain(ekran.staraTrasa);
    }
  });

  it("nowa trasa nie jest trasą poligonu i nie zawiera jego segmentu", () => {
    for (const { grupa, ekran } of ekranyGrup(GRUPY)) {
      expect(ekran.nowaTrasa.startsWith(PREFIKS_POLIGONU), `grupa ${grupa.klucz}`).toBe(false);
    }
  });
});

describe("włączona grupa ma strony pod nowymi trasami", () => {
  it("każda włączona grupa rejestru ma stronę pod każdą nową trasą", () => {
    for (const grupa of Object.values(GRUPY)) {
      expect(brakujaceStronyWlaczonejGrupy(grupa, wszystkieTrasy), `grupa ${grupa.klucz}`).toEqual([]);
    }
  });

  it("grupa współpracy po włączeniu ma obie strony", () => {
    expect(brakujaceStronyWlaczonejGrupy({ ...GRUPY.wspolpraca, wlaczona: true }, wszystkieTrasy)).toEqual([]);
  });

  it("przypadek odwrotny: grupa formy stażu po włączeniu nie ma jeszcze strony, więc zostaje wykryta", () => {
    expect(brakujaceStronyWlaczonejGrupy({ ...GRUPY.formyStazu, wlaczona: true }, wszystkieTrasy)).toEqual([
      "/admin/formy-stazu",
    ]);
    expect(brakujaceStronyWlaczonejGrupy(GRUPY.formyStazu, wszystkieTrasy)).toEqual([]);
  });
});
