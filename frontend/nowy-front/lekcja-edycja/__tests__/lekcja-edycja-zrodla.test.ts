import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Pomiary tekstu plików ekranu „Lekcja: treść, nagranie, materiały”:
 *  - zero surowych elementów interaktywnych i zdarzeń na surowych elementach DOM;
 *  - zero twardych kolorów, zero wstrzykiwania HTML, zero importów ze starego `components/`;
 *  - treść lekcji renderuje wyłącznie molekuła `TrescLekcji`, bez drugiego renderera;
 *  - ekran nie niesie własnego znacznika głównego — jest nim korzeń szablonu;
 *  - trasy ekranu istnieją w plikach tras zaplecza, a atrapy mają klucze zasobów z zaplecza.
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

const STRONA = join(KORZEN, "app/nowy-front/admin/lekcje/[id]/page.tsx");
const PLIKI = [...plikiZrodlowe("nowy-front/lekcja-edycja"), STRONA];
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

describe("źródła ekranu lekcji", () => {
  it("pliki ekranu istnieją, pomiar nie jest pusty", () => {
    expect(nazwy(PLIKI)).toEqual(
      expect.arrayContaining([
        "app/nowy-front/admin/lekcje/[id]/page.tsx",
        "nowy-front/lekcja-edycja/LekcjaEdycja.tsx",
        "nowy-front/lekcja-edycja/dane.ts",
        "nowy-front/lekcja-edycja/formularz.ts",
        "nowy-front/lekcja-edycja/tus.ts",
      ]),
    );
  });

  it("zero surowych przycisków, odnośników i pól formularza", () => {
    const trafienia = TSX.filter((plik) => /<(button|a|input|select|textarea)[\s>/]/.test(bezKomentarzy(tresc(plik))));
    expect(nazwy(trafienia)).toEqual([]);
  });

  it("onClick wyłącznie na atomach z design-system, nigdy na surowych elementach DOM", () => {
    const naSurowych: string[] = [];
    for (const plik of TSX) {
      const zrodlo = bezKomentarzy(tresc(plik));
      for (const trafienie of zrodlo.matchAll(/\bonClick=/g)) {
        const przed = zrodlo.slice(0, trafienie.index);
        const otwarcia = [...przed.matchAll(/<([A-Za-z][\w.]*)/g)];
        const ostatnie = otwarcia[otwarcia.length - 1]?.[1] ?? "";
        if (/^[a-z]/.test(ostatnie)) naSurowych.push(`${relative(KORZEN, plik)}:${ostatnie}`);
      }
    }
    expect(naSurowych).toEqual([]);
  });

  it("zero twardych kolorów w plikach ekranu", () => {
    const trafienia = PLIKI.filter((plik) => /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(bezKomentarzy(tresc(plik))));
    expect(nazwy(trafienia)).toEqual([]);
  });

  it("zero wstrzykiwania HTML", () => {
    const trafienia = PLIKI.filter((plik) => /dangerouslySetInnerHTML|innerHTML/.test(bezKomentarzy(tresc(plik))));
    expect(nazwy(trafienia)).toEqual([]);
  });

  it("zero importów ze starego components/", () => {
    const trafienia = PLIKI.filter((plik) => /from\s+["'][^"']*\/?components\//.test(tresc(plik)));
    expect(nazwy(trafienia)).toEqual([]);
  });

  it("szablon formularza wyłącznie z design-system, ekran bez własnego znacznika głównego", () => {
    const ekran = tresc(join(KORZEN, "nowy-front/lekcja-edycja/LekcjaEdycja.tsx"));
    expect(ekran).toMatch(/import \{ FormTemplate \} from "@\/design-system\/szablony\/FormTemplate\/FormTemplate";/);
    const znacznik = "<" + "main";
    expect(TSX.filter((plik) => tresc(plik).includes(znacznik))).toEqual([]);
  });

  it("treść lekcji renderuje molekuła TrescLekcji, bez własnego parsera Markdown", () => {
    const ekran = tresc(join(KORZEN, "nowy-front/lekcja-edycja/LekcjaEdycja.tsx"));
    expect(ekran).toMatch(/import \{ TrescLekcji \} from "@\/design-system\/molekuly\/TrescLekcji\/TrescLekcji";/);
    expect(ekran).toMatch(/<TrescLekcji\b/);
    const wlasnyParser = PLIKI.filter((plik) => /parsujTresc|marked|markdown-it|remark/.test(bezKomentarzy(tresc(plik))));
    expect(nazwy(wlasnyParser)).toEqual([]);
  });

  it("strona montuje ekran i nie wywołuje serwerowego @/auth", () => {
    const strona = tresc(STRONA);
    expect(strona).toMatch(/import \{ LekcjaEdycja \} from "@\/nowy-front\/lekcja-edycja\/LekcjaEdycja";/);
    expect(bezKomentarzy(strona)).not.toMatch(/@\/auth/);
  });

  it("ekran nie wysyła pól tematu ani kolejności", () => {
    const formularz = bezKomentarzy(tresc(join(KORZEN, "nowy-front/lekcja-edycja/formularz.ts")));
    const cialo = formularz.slice(formularz.indexOf("export function cialoZapisu"), formularz.indexOf("const POLA_SERWERA"));
    expect(cialo).not.toMatch(/topic_id|topic_position|sequence_order/);
  });
});

describe("zgodność z zapleczem", () => {
  const h08 = tresc(join(ZAPLECZE, "routes/api/h08.php"));
  const video = tresc(join(ZAPLECZE, "routes/api/video.php"));
  const me = tresc(join(ZAPLECZE, "routes/api/h01.php"));

  it("wszystkie trasy ekranu istnieją w plikach tras zaplecza", () => {
    expect(h08).toContain("Route::get('/admin/courses/{course}/lessons'");
    expect(h08).toContain("Route::patch('/admin/lessons/{lesson}'");
    expect(h08).toContain("Route::post('/admin/lessons/{lesson}/materials'");
    expect(video).toContain("->post('/admin/lessons/{lesson}/video-uploads'");
    expect(video).toContain("->get('/admin/lessons/{lesson}/video-status'");
    expect(me).toContain("Route::get('/me'");
  });

  it("ekran woła dokładnie te trasy i żadnej innej spod /admin", () => {
    const dane = bezKomentarzy(tresc(join(KORZEN, "nowy-front/lekcja-edycja/dane.ts")));
    const trasy = [...dane.matchAll(/`(\/admin\/[^`]+)`/g)].map((m) => m[1].replace(/\$\{[^}]+\}/g, "{id}"));
    expect([...new Set(trasy)].sort()).toEqual([
      "/admin/courses/{id}/lessons",
      "/admin/lessons/{id}",
      "/admin/lessons/{id}/materials",
      "/admin/lessons/{id}/video-status",
      "/admin/lessons/{id}/video-uploads",
    ]);
  });

  it("pola zasobu lekcji w zapleczu są polami typu LekcjaAdmin", () => {
    const zasob = tresc(join(ZAPLECZE, "app/Http/Resources/H08/AdminLessonResource.php"));
    const polaZaplecza = [...zasob.matchAll(/^\s+'([a-z_]+)' =>/gm)].map((m) => m[1]).sort();
    const dane = tresc(join(KORZEN, "nowy-front/lekcja-edycja/dane.ts"));
    const typ = dane.slice(dane.indexOf("export interface LekcjaAdmin"), dane.indexOf("/** `AdminMaterialResource`"));
    const polaTypu = [...typ.matchAll(/^\s+([a-z_]+):/gm)].map((m) => m[1]).sort();
    expect(polaTypu).toEqual(polaZaplecza);
    expect(polaZaplecza).toContain("content");
  });

  it("pola zasobu materiału w zapleczu są polami typu MaterialAdmin", () => {
    const zasob = tresc(join(ZAPLECZE, "app/Http/Resources/H08/AdminMaterialResource.php"));
    const polaZaplecza = [...zasob.matchAll(/^\s+'([a-z_]+)' =>/gm)].map((m) => m[1]).sort();
    const dane = tresc(join(KORZEN, "nowy-front/lekcja-edycja/dane.ts"));
    const typ = dane.slice(dane.indexOf("export interface MaterialAdmin"), dane.indexOf("/**\n * Ciało `PATCH"));
    const polaTypu = [...typ.matchAll(/^\s+([a-z_]+):/gm)].map((m) => m[1]).sort();
    expect(polaTypu).toEqual(polaZaplecza);
  });

  it("schemat odpowiedzi nagrania z openapi.json ma pola typów ZlecenieWgrania i StanNagrania", () => {
    const schemat = JSON.parse(tresc(join(ZAPLECZE, "openapi.json"))) as {
      paths: Record<string, Record<string, { responses: Record<string, { content?: Record<string, { schema: unknown }> }> }>>;
    };
    const uploads = schemat.paths["/v1/admin/lessons/{lesson}/video-uploads"].post.responses["201"].content!["application/json"]
      .schema as { properties: { data: { properties: Record<string, unknown> } } };
    expect(Object.keys(uploads.properties.data.properties).sort()).toEqual(
      ["expiration_time", "library_id", "signature", "upload_url", "video_id"],
    );
    const dane = tresc(join(KORZEN, "nowy-front/lekcja-edycja/dane.ts"));
    const zlecenie = dane.slice(dane.indexOf("export interface ZlecenieWgrania"), dane.indexOf("/** Rola z"));
    expect([...zlecenie.matchAll(/^\s+([a-z_]+):/gm)].map((m) => m[1]).sort()).toEqual(
      ["expiration_time", "library_id", "signature", "upload_url", "video_id"],
    );

    const status = schemat.paths["/v1/admin/lessons/{lesson}/video-status"].get.responses["200"].content!["application/json"]
      .schema as { anyOf: { properties: { data: { properties: Record<string, unknown> } } }[] };
    const gotowy = status.anyOf.find((wariant) => "duration_seconds" in wariant.properties.data.properties)!;
    expect(Object.keys(gotowy.properties.data.properties).sort()).toEqual(["duration_seconds", "preview_embed_url", "status"]);
  });

  it("reguły zapisu lekcji w zapleczu: limit treści 20 000 i pola zakazane", () => {
    const zadanie = tresc(join(ZAPLECZE, "app/Http/Requests/H08/UpdateLessonRequest.php"));
    expect(zadanie).toMatch(/'content' => \['sometimes', 'nullable', 'string', 'max:20000'\]/);
    expect(zadanie).toMatch(/'topic_id' => \['prohibited'\]/);
    expect(zadanie).toMatch(/'topic_position' => \['prohibited'\]/);
  });
});
