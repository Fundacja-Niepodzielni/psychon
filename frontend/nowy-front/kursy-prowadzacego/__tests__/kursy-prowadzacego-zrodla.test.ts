import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Pomiary tekstu plików ekranu „Moje kursy”:
 *  - zero surowych elementów interaktywnych i zdarzeń na surowych elementach DOM;
 *  - zero twardych kolorów, zero wstrzykiwania HTML, zero importów ze starego `components/`;
 *  - ekran nie niesie własnego znacznika głównego (jest nim korzeń szablonu);
 *  - trasa ekranu istnieje w pliku tras zaplecza, a typ ma klucze odpowiedzi z zaplecza;
 *  - cel odnośnika „Otwórz kurs” istnieje jako strona kursu prowadzącego.
 * Każdy wykrywacz ma próbę kontrolną na złej próbce — pomiar, który nie umie się zaświecić, niczego nie dowodzi.
 */

const KORZEN = process.cwd();
const ZAPLECZE = join(KORZEN, "..", "backend");

function plikiZrodlowe(katalog: string): string[] {
  const pelny = join(KORZEN, katalog);
  if (!existsSync(pelny)) return [];
  return readdirSync(pelny).flatMap((nazwa) => {
    const sciezka = join(pelny, nazwa);
    if (statSync(sciezka).isDirectory()) return plikiZrodlowe(relative(KORZEN, sciezka));
    return /\.(ts|tsx|css)$/.test(nazwa) && !sciezka.includes("__tests__") ? [sciezka] : [];
  });
}

const STRONA = join(KORZEN, "app/nowy-front/prowadzacy/kursy/page.tsx");
const EKRAN = join(KORZEN, "nowy-front/kursy-prowadzacego/KursyProwadzacego.tsx");
const DANE = join(KORZEN, "nowy-front/kursy-prowadzacego/dane.ts");
const PLIKI = [...plikiZrodlowe("nowy-front/kursy-prowadzacego"), STRONA];
const TSX = PLIKI.filter((plik) => plik.endsWith(".tsx"));

function tresc(sciezka: string): string {
  return readFileSync(sciezka, "utf-8");
}

/** Usuwa komentarze blokowe i liniowe — pomiar dotyczy kodu, nie opisów. */
function bezKomentarzy(zrodlo: string): string {
  return zrodlo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function nazwy(pliki: string[]): string[] {
  return pliki.map((plik) => relative(KORZEN, plik).replace(/\\/g, "/"));
}

function maSurowyElement(zrodlo: string): boolean {
  return /<(button|a|input|select|textarea)[\s>/]/.test(bezKomentarzy(zrodlo));
}

/** Nazwy surowych (małą literą) elementów, na których stoi `onClick=`. */
function onClickNaSurowych(zrodlo: string): string[] {
  const kod = bezKomentarzy(zrodlo);
  const trafione: string[] = [];
  for (const trafienie of kod.matchAll(/\bonClick=/g)) {
    const otwarcia = [...kod.slice(0, trafienie.index).matchAll(/<([A-Za-z][\w.]*)/g)];
    const ostatnie = otwarcia[otwarcia.length - 1]?.[1] ?? "";
    if (/^[a-z]/.test(ostatnie)) trafione.push(ostatnie);
  }
  return trafione;
}

function maTwardyKolor(zrodlo: string): boolean {
  return /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(bezKomentarzy(zrodlo));
}

function wstrzykujeHtml(zrodlo: string): boolean {
  return /dangerouslySetInnerHTML|innerHTML/.test(bezKomentarzy(zrodlo));
}

function importujeStareKomponenty(zrodlo: string): boolean {
  return /from\s+["'][^"']*\/?components\//.test(zrodlo);
}

describe("wykrywacze pomiarów — próby kontrolne na złych próbkach", () => {
  it("surowy element interaktywny", () => {
    expect(maSurowyElement("<div><button>Zapisz</button></div>")).toBe(true);
    expect(maSurowyElement("<div><a href='/x'>x</a></div>")).toBe(true);
    expect(maSurowyElement("<Button>Zapisz</Button>")).toBe(false);
    expect(maSurowyElement("// <button> tylko w opisie")).toBe(false);
  });

  it("onClick na surowym elemencie, nie na atomie", () => {
    expect(onClickNaSurowych("<div onClick={f}>x</div>")).toEqual(["div"]);
    expect(onClickNaSurowych("<Button onClick={f}>x</Button>")).toEqual([]);
  });

  it("twardy kolor, wstrzykiwanie HTML, import ze starego components/", () => {
    expect(maTwardyKolor(".a { color: #fff; }")).toBe(true);
    expect(maTwardyKolor(".a { color: var(--ink); }")).toBe(false);
    expect(wstrzykujeHtml("<div dangerouslySetInnerHTML={x} />")).toBe(true);
    expect(wstrzykujeHtml("<div>{x}</div>")).toBe(false);
    expect(importujeStareKomponenty('import X from "@/components/ui/X";')).toBe(true);
    expect(importujeStareKomponenty('import X from "@/design-system/atomy/X/X";')).toBe(false);
  });
});

describe("źródła ekranu Moje kursy", () => {
  it("pliki ekranu istnieją, pomiar nie jest pusty", () => {
    expect(nazwy(PLIKI)).toEqual(
      expect.arrayContaining([
        "app/nowy-front/prowadzacy/kursy/page.tsx",
        "nowy-front/kursy-prowadzacego/KursyProwadzacego.tsx",
        "nowy-front/kursy-prowadzacego/dane.ts",
        "nowy-front/kursy-prowadzacego/logika.ts",
      ]),
    );
  });

  it("zero surowych przycisków, odnośników i pól formularza", () => {
    expect(nazwy(TSX.filter((plik) => maSurowyElement(tresc(plik))))).toEqual([]);
  });

  it("onClick wyłącznie na atomach z design-system, nigdy na surowych elementach DOM", () => {
    expect(TSX.flatMap((plik) => onClickNaSurowych(tresc(plik)).map((element) => `${nazwy([plik])[0]}:${element}`))).toEqual([]);
  });

  it("zero twardych kolorów w plikach ekranu", () => {
    expect(nazwy(PLIKI.filter((plik) => maTwardyKolor(tresc(plik))))).toEqual([]);
  });

  it("zero wstrzykiwania HTML", () => {
    expect(nazwy(PLIKI.filter((plik) => wstrzykujeHtml(tresc(plik))))).toEqual([]);
  });

  it("zero importów ze starego components/", () => {
    expect(nazwy(PLIKI.filter((plik) => importujeStareKomponenty(tresc(plik))))).toEqual([]);
  });

  it("szablon listy i lista rekordów wyłącznie z design-system, ekran bez własnego znacznika głównego", () => {
    const ekran = tresc(EKRAN);
    expect(ekran).toMatch(/import \{ ListTemplate \} from "@\/design-system\/szablony\/ListTemplate\/ListTemplate";/);
    expect(ekran).toMatch(/import \{ RecordList \} from "@\/design-system\/organizmy\/RecordList\/RecordList";/);
    const znacznik = "<" + "main";
    expect(TSX.filter((plik) => tresc(plik).includes(znacznik))).toEqual([]);
  });

  it("strona montuje ekran i nie wywołuje serwerowego @/auth", () => {
    const strona = tresc(STRONA);
    expect(strona).toMatch(/import \{ KursyProwadzacego \} from "@\/nowy-front\/kursy-prowadzacego\/KursyProwadzacego";/);
    expect(bezKomentarzy(strona)).not.toMatch(/@\/auth/);
  });
});

/** Klucze tablicy PHP na dokładnie danym wcięciu w podanym fragmencie źródła. */
function kluczePhp(zrodlo: string, wciecie: number): string[] {
  const wzorzec = new RegExp(`^ {${wciecie}}'([a-z_]+)' =>`);
  return zrodlo.split("\n").flatMap((wiersz) => wzorzec.exec(wiersz)?.[1] ?? []).sort();
}

/** Pola interfejsu TypeScript o podanej nazwie. */
function poleInterfejsu(zrodlo: string, nazwa: string): string[] {
  const start = zrodlo.indexOf(`export interface ${nazwa} {`);
  const koniec = zrodlo.indexOf("\n}", start);
  return [...zrodlo.slice(start, koniec).matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]).sort();
}

describe("próby kontrolne parsera kluczy", () => {
  it("parser PHP i interfejsu widzą zmianę klucza", () => {
    expect(kluczePhp("                'a' => 1,\n                'b' => 2,\n", 16)).toEqual(["a", "b"]);
    expect(poleInterfejsu("export interface T {\n  a: number;\n  obcy: string;\n}\n", "T")).toEqual(["a", "obcy"]);
  });
});

describe("zgodność z zapleczem", () => {
  const trasy = tresc(join(ZAPLECZE, "routes/api/h09.php"));
  const kontroler = tresc(join(ZAPLECZE, "app/Http/Controllers/Api/V1/H09/MyInstructorProfileController.php"));
  const dane = tresc(DANE);

  it("trasa ekranu istnieje w pliku tras zaplecza, w grupie roli prowadzącego", () => {
    expect(trasy).toMatch(/'role:instructor'\]\)->group\(function \(\): void \{[^}]*Route::get\('\/instructor\/courses', \[MyInstructorProfileController::class, 'courses'\]\);/);
  });

  it("ekran woła dokładnie jedną trasę i żadnej innej", () => {
    const wywolane = [...bezKomentarzy(dane).matchAll(/"(\/[^"]+)"/g)].map((m) => m[1]);
    expect(wywolane).toEqual(["/instructor/courses"]);
  });

  it("pola odpowiedzi kontrolera są polami typu KursProwadzacego", () => {
    const metoda = kontroler.slice(kontroler.indexOf("public function courses"));
    expect(poleInterfejsu(dane, "KursProwadzacego")).toEqual(kluczePhp(metoda, 16));
  });

  it("schemat odpowiedzi z openapi.json ma pola typu KursProwadzacego", () => {
    const schemat = JSON.parse(tresc(join(ZAPLECZE, "openapi.json"))) as {
      paths: Record<string, { get?: { responses: Record<string, { content?: Record<string, { schema: unknown }> }> } }>;
    };
    const odpowiedz = schemat.paths["/v1/instructor/courses"].get!.responses["200"].content!["application/json"].schema as {
      properties: { data: { items: { properties: Record<string, unknown> } } };
    };
    expect(Object.keys(odpowiedz.properties.data.items.properties).sort()).toEqual(poleInterfejsu(dane, "KursProwadzacego"));
  });

  it("cel odnośnika „Otwórz kurs” istnieje jako strona kursu prowadzącego", () => {
    expect(existsSync(join(KORZEN, "app/(prowadzacy)/prowadzacy/kursy/[id]/page.tsx"))).toBe(true);
    expect(tresc(join(KORZEN, "nowy-front/kursy-prowadzacego/logika.ts"))).toContain("`/prowadzacy/kursy/${id}`");
  });

  it("zaplecze zwraca wyłącznie kursy z przypisaniem prowadzącego z tokenu", () => {
    expect(kontroler).toContain("InstructorCourses::for((int) $request->user()->id)");
  });
});
