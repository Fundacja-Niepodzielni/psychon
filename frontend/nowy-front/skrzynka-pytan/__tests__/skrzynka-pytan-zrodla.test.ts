import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Pomiary tekstu plików ekranu „Skrzynka pytań”:
 *  - zero surowych elementów interaktywnych i zdarzeń na surowych elementach DOM;
 *  - zero twardych kolorów, zero wstrzykiwania HTML, zero importów ze starego `components/`;
 *  - ekran nie niesie własnego znacznika głównego (jest nim korzeń szablonu) i nie otwiera okna z formularzem;
 *  - trasy ekranu istnieją w plikach tras zaplecza, a typy mają klucze zasobu z zaplecza.
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

const STRONA = join(KORZEN, "app/nowy-front/prowadzacy/pytania/page.tsx");
const EKRAN = join(KORZEN, "nowy-front/skrzynka-pytan/SkrzynkaPytan.tsx");
const DANE = join(KORZEN, "nowy-front/skrzynka-pytan/dane.ts");
const PLIKI = [...plikiZrodlowe("nowy-front/skrzynka-pytan"), STRONA];
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

describe("źródła ekranu skrzynki pytań", () => {
  it("pliki ekranu istnieją, pomiar nie jest pusty", () => {
    expect(nazwy(PLIKI)).toEqual(
      expect.arrayContaining([
        "app/nowy-front/prowadzacy/pytania/page.tsx",
        "nowy-front/skrzynka-pytan/SkrzynkaPytan.tsx",
        "nowy-front/skrzynka-pytan/dane.ts",
        "nowy-front/skrzynka-pytan/logika.ts",
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

  it("szablon listy wyłącznie z design-system, ekran bez własnego znacznika głównego i bez okna z formularzem", () => {
    const ekran = tresc(EKRAN);
    expect(ekran).toMatch(/import \{ ListTemplate \} from "@\/design-system\/szablony\/ListTemplate\/ListTemplate";/);
    expect(ekran).toMatch(/import \{ FormSection \} from "@\/design-system\/organizmy\/FormSection\/FormSection";/);
    expect(ekran).toMatch(/import \{ RecordList \} from "@\/design-system\/organizmy\/RecordList\/RecordList";/);
    expect(bezKomentarzy(ekran)).not.toMatch(/Dialog/);
    const znacznik = "<" + "main";
    expect(TSX.filter((plik) => tresc(plik).includes(znacznik))).toEqual([]);
  });

  it("strona montuje ekran i nie wywołuje serwerowego @/auth", () => {
    const strona = tresc(STRONA);
    expect(strona).toMatch(/import \{ SkrzynkaPytan \} from "@\/nowy-front\/skrzynka-pytan\/SkrzynkaPytan";/);
    expect(bezKomentarzy(strona)).not.toMatch(/@\/auth/);
  });
});

/** Klucze tablicy PHP na dokładnie danym wcięciu, w obrębie wierszy od `od` (włącznie) do `do` (wyłącznie). */
function kluczePhp(zrodlo: string, wciecie: number, od = 0, doWiersza?: number): string[] {
  const wiersze = zrodlo.split("\n").slice(od, doWiersza);
  const wzorzec = new RegExp(`^ {${wciecie}}'([a-z_]+)' =>`);
  return wiersze.flatMap((wiersz) => wzorzec.exec(wiersz)?.[1] ?? []).sort();
}

/** Zakres wierszy zagnieżdżonej tablicy PHP: od wiersza z `'klucz' => [` do jej domknięcia na tym samym wcięciu. */
function zakresTablicy(zrodlo: string, klucz: string, wciecie: number): [number, number] {
  const wiersze = zrodlo.split("\n");
  const start = wiersze.findIndex((wiersz) => wiersz.startsWith(`${" ".repeat(wciecie)}'${klucz}' => [`));
  const koniec = wiersze.findIndex((wiersz, indeks) => indeks > start && wiersz.startsWith(`${" ".repeat(wciecie)}],`));
  return [start + 1, koniec];
}

/** Pola interfejsu TypeScript o podanej nazwie. */
function poleInterfejsu(zrodlo: string, nazwa: string): string[] {
  const start = zrodlo.indexOf(`export interface ${nazwa} {`);
  const koniec = zrodlo.indexOf("\n}", start);
  return [...zrodlo.slice(start, koniec).matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]).sort();
}

describe("próby kontrolne parsera kluczy", () => {
  it("parser PHP i interfejsu widzą zmianę klucza", () => {
    const php = "x\n            'a' => 1,\n            'b' => [\n                'c' => 2,\n            ],\n";
    expect(kluczePhp(php, 12)).toEqual(["a", "b"]);
    const [od, doW] = zakresTablicy(php, "b", 12);
    expect(kluczePhp(php, 16, od, doW)).toEqual(["c"]);
    expect(poleInterfejsu("export interface T {\n  a: number;\n  obcy: string;\n}\n", "T")).toEqual(["a", "obcy"]);
  });
});

describe("zgodność z zapleczem", () => {
  const trasy = tresc(join(ZAPLECZE, "routes/api/h17.php"));
  const zasob = tresc(join(ZAPLECZE, "app/Http/Resources/H17/InstructorQuestionResource.php"));
  const dane = tresc(DANE);

  it("obie trasy ekranu istnieją w pliku tras zaplecza, w grupie roli prowadzącego", () => {
    expect(trasy).toMatch(/'role:instructor'\]\)->group\(function \(\): void \{\s*Route::get\('\/instructor\/questions', \[InstructorQuestionController::class, 'index'\]\);\s*Route::post\('\/instructor\/questions\/\{id\}\/answer', \[InstructorQuestionController::class, 'answer'\]\)/);
  });

  it("ekran woła dokładnie te dwie trasy i żadnej innej", () => {
    const wywolane = [...bezKomentarzy(dane).matchAll(/`(\/[^`]+)`/g)].map((m) => m[1].replace(/\$\{[^}]+\}/g, "{id}"));
    expect([...new Set(wywolane)].sort()).toEqual([
      "/instructor/questions/{id}/answer",
      "/instructor/questions?answered=false&page={id}",
      "/instructor/questions?page={id}",
    ]);
  });

  it("pola zasobu pytania w zapleczu są polami typu PytanieSkrzynki", () => {
    expect(poleInterfejsu(dane, "PytanieSkrzynki")).toEqual(kluczePhp(zasob, 12));
  });

  it("pola autora, lekcji i kursu w zapleczu są polami typów AutorPytania, LekcjaPytania i KursPytania", () => {
    const [odAutora, doAutora] = zakresTablicy(zasob, "user", 12);
    expect(poleInterfejsu(dane, "AutorPytania")).toEqual(kluczePhp(zasob, 16, odAutora, doAutora));
    const [odLekcji, doLekcji] = zakresTablicy(zasob, "lesson", 12);
    expect(poleInterfejsu(dane, "LekcjaPytania")).toEqual(kluczePhp(zasob, 16, odLekcji, doLekcji));
    const [odKursu, doKursu] = zakresTablicy(zasob, "course", 16);
    expect(poleInterfejsu(dane, "KursPytania")).toEqual(kluczePhp(zasob, 20, odKursu, doKursu));
  });

  it("limit odpowiedzi i ciało żądania zgodne z regułami zaplecza", () => {
    const zadanie = tresc(join(ZAPLECZE, "app/Http/Requests/H17/AnswerQuestionRequest.php"));
    expect(zadanie).toMatch(/'answer' => \['required', 'string', 'min:1', 'max:5000'\]/);
    expect(dane).toMatch(/LIMIT_ODPOWIEDZI = 5000;/);
    expect(dane).toMatch(/body: \{ answer: odpowiedz \}/);
  });

  it("kontroler: filtr answered, licznik unanswered w meta.extra i kody 404 oraz entry_locked", () => {
    const kontroler = tresc(join(ZAPLECZE, "app/Http/Controllers/Api/V1/H17/InstructorQuestionController.php"));
    expect(kontroler).toContain("$request->has('answered')");
    expect(kontroler).toContain("'unanswered' =>");
    expect(kontroler).toContain("new ApiException(404, 'not_found'");
    expect(kontroler).toContain("new ApiException(403, 'entry_locked'");
  });

  it("filtr widoku: kontroler czyta wyłącznie parametr answered (obecny = filtr, brak = wszystkie), a ekran wysyła go tylko w widoku „bez-odpowiedzi”", () => {
    const kontroler = tresc(join(ZAPLECZE, "app/Http/Controllers/Api/V1/H17/InstructorQuestionController.php"));
    const indeks = kontroler.slice(kontroler.indexOf("public function index"), kontroler.indexOf("public function answer"));
    const parametry = [...indeks.matchAll(/\$request->(?:has|boolean|integer|input|query|get|string)\('([a-z_]+)'/g)].map((m) => m[1]);
    expect([...new Set(parametry)].sort()).toEqual(["answered", "per_page"]);
    expect(indeks).toMatch(/if \(\$request->has\('answered'\)\) \{\s*\$request->boolean\('answered'\)/);

    const bezKomentarz = bezKomentarzy(dane);
    expect(bezKomentarz).toMatch(/if \(widok === "wszystkie"\) return apiPaged<PytanieSkrzynki>\(`\/instructor\/questions\?page=\$\{strona\}`\);/);
    expect(bezKomentarz).toMatch(/return apiPaged<PytanieSkrzynki>\(`\/instructor\/questions\?answered=false&page=\$\{strona\}`\);/);
  });
});

describe("pre-wrap treści pytania na liście (tylko w CSS ekranu, bez zmiany design-system)", () => {
  const css = tresc(join(KORZEN, "nowy-front/skrzynka-pytan/SkrzynkaPytan.module.css"));
  const reguly = (zrodlo: string) => [...zrodlo.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selektor: m[1].trim(), cialo: m[2] }));

  it("reguła dla akapitów wierszy listy ma white-space: pre-wrap, a selektor trafia w to, co renderują ListRow i Text", () => {
    const regula = reguly(bezKomentarzy(css)).find((r) => r.selektor === ".lista [data-wariant] p");
    expect(regula?.cialo).toMatch(/white-space:\s*pre-wrap/);

    const wiersz = tresc(join(KORZEN, "design-system/molekuly/ListRow/ListRow.tsx"));
    expect(wiersz).toMatch(/data-wariant=\{wariant\}/);
    expect(wiersz).toMatch(/<Text>\{tytul\}<\/Text>/);
    const tekst = tresc(join(KORZEN, "design-system/atomy/Text/Text.tsx"));
    expect(tekst).toMatch(/<p /);
  });

  it("ekran opakowuje RecordList w pojemnik .lista", () => {
    expect(bezKomentarzy(tresc(EKRAN))).toMatch(/<div className=\{style\.lista\}>\s*<RecordList/);
  });

  it("próba kontrolna: parser reguł widzi brak pre-wrap w złej próbce", () => {
    const zla = ".lista [data-wariant] p { overflow-wrap: anywhere; }";
    expect(reguly(zla).find((r) => r.selektor === ".lista [data-wariant] p")?.cialo).not.toMatch(/white-space:\s*pre-wrap/);
  });
});
