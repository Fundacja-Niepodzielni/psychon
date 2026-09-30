import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Pomocniki pomiarów tekstu plików ekranów kolejek — wspólne dla obu
 * ekranów. Mierzą źródła, nie render. Każdy pomiar ma kontrolę na tekście
 * z celowym naruszeniem (w plikach `*.test.tsx`), więc czerwień da się
 * sprowokować.
 */

/** Korzeń `frontend/` — vitest uruchamia się z tego katalogu. */
export const KORZEN = process.cwd();

export function plikiEkranu(katalog: string, dodatkowe: string[]): string[] {
  const pelny = join(KORZEN, katalog);
  const wlasne = existsSync(pelny)
    ? readdirSync(pelny).flatMap((nazwa) => {
        const sciezka = join(pelny, nazwa);
        if (statSync(sciezka).isDirectory()) return [];
        return /\.(ts|tsx|css)$/.test(nazwa) ? [sciezka] : [];
      })
    : [];
  return [...wlasne, ...dodatkowe.map((p) => join(KORZEN, p))];
}

export function tresc(sciezka: string): string {
  return readFileSync(sciezka, "utf-8");
}

export function wzgledna(sciezka: string): string {
  return relative(KORZEN, sciezka).replace(/\\/g, "/");
}

/**
 * Początkowe znaczniki elementów DOM zapisanych małą literą (`<div …>`,
 * `<button …>`), z uwzględnieniem nawiasów klamrowych i cudzysłowów w
 * atrybutach (`onClick={() => …}` zawiera `>`). Komponenty (`<Button …>`)
 * zaczynają się wielką literą i nie wchodzą do wyniku.
 */
export function znacznikiDom(kod: string): string[] {
  const wynik: string[] = [];
  const poczatek = /<([a-z][a-z0-9]*)(?=[\s/>])/g;
  let dopasowanie: RegExpExecArray | null;
  while ((dopasowanie = poczatek.exec(kod)) !== null) {
    let i = dopasowanie.index + dopasowanie[0].length;
    let glebokosc = 0;
    let cudzyslow: string | null = null;
    for (; i < kod.length; i += 1) {
      const znak = kod[i];
      if (cudzyslow) {
        if (znak === cudzyslow) cudzyslow = null;
        continue;
      }
      if (znak === '"' || znak === "'" || (znak === "`" && glebokosc > 0)) cudzyslow = znak;
      else if (znak === "{") glebokosc += 1;
      else if (znak === "}") glebokosc -= 1;
      else if (znak === ">" && glebokosc === 0) break;
    }
    wynik.push(kod.slice(dopasowanie.index, i + 1));
  }
  return wynik;
}

const ZAKAZANE_ELEMENTY = /^<(button|a|input|select|textarea)\b/;

/** Surowe `<button|<a |<input|<select|<textarea` oraz `on…=` na elementach DOM. */
export function surowePrzyciskiIZdarzenia(kod: string): string[] {
  return znacznikiDom(kod).filter((znacznik) => ZAKAZANE_ELEMENTY.test(znacznik) || /\son[A-Z]\w*=/.test(znacznik));
}

/** Kolory zapisane wprost: szesnastkowe, `rgb(`, `rgba(`, `hsl(`, `hsla(`. */
export function twardeKolory(kod: string): string[] {
  return kod.match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g) ?? [];
}

/** Importy ze starego drzewa `components/` (nie `design-system/components`). */
export function importyZComponents(kod: string): string[] {
  return kod.match(/from\s+["'](?:@\/|\.\.?\/)+components\/[^"']*["']/g) ?? [];
}

export function zawieraInnerHtml(kod: string): boolean {
  return kod.includes("dangerously" + "SetInnerHTML");
}

export function znacznikiMain(kod: string): string[] {
  return kod.match(new RegExp("<" + "main\\b", "g")) ?? [];
}

/** Klucze (`'nazwa' =>`) zasobu PHP — schemat odpowiedzi czytany z pliku. */
export function kluczeZasobu(sciezkaPhp: string): string[] {
  const zrodlo = tresc(join(KORZEN, "..", sciezkaPhp));
  const klucze = new Set<string>();
  for (const dopasowanie of zrodlo.matchAll(/'([a-z_]+)'\s*=>/g)) klucze.add(dopasowanie[1]);
  return [...klucze].sort();
}

/** Klucze obiektu wraz z kluczami jednego poziomu zagnieżdżenia (obiekt albo pierwszy element tablicy). */
export function splaszczoneKlucze(obiekt: Record<string, unknown>): string[] {
  const klucze = new Set<string>();
  for (const [klucz, wartosc] of Object.entries(obiekt)) {
    klucze.add(klucz);
    if (wartosc && typeof wartosc === "object" && !Array.isArray(wartosc)) {
      for (const wewnetrzny of Object.keys(wartosc)) klucze.add(wewnetrzny);
    }
    if (Array.isArray(wartosc) && wartosc[0] && typeof wartosc[0] === "object") {
      for (const wewnetrzny of Object.keys(wartosc[0] as object)) klucze.add(wewnetrzny);
    }
  }
  return [...klucze].sort();
}

/** Klucze wymagane w `meta` odpowiedzi listy według `openapi.json` (trasa + ścieżka). */
export function kluczeMetaZOpenApi(sciezkaTrasy: string): string[] {
  const schemat = JSON.parse(readFileSync(join(KORZEN, "..", "backend/openapi.json"), "utf-8")) as {
    paths: Record<
      string,
      { get: { responses: Record<string, { content: { "application/json": { schema: { properties: { meta: { required: string[] } } } } } }> } }
    >;
  };
  return [...schemat.paths[sciezkaTrasy].get.responses["200"].content["application/json"].schema.properties.meta.required].sort();
}

/** Brakujące w `obiekt` klucze ze schematu. */
export function brakujaceKlucze(obiekt: Record<string, unknown>, schemat: string[]): string[] {
  const obecne = new Set(splaszczoneKlucze(obiekt));
  return schemat.filter((klucz) => !obecne.has(klucz));
}
