/**
 * Kontrola źródeł ekranów publicznych (bez testów): brak surowych elementów
 * interaktywnych, twardych barw, importów z zamrożonego `components/`,
 * wstrzykiwania HTML, własnych formaterów dat i adresów innych hostów.
 * Rzuca z listą naruszeń, żeby czerwień niosła treść.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const REGULY: Record<string, RegExp> = {
  "surowe elementy interaktywne": /<(?:button|a|input|select|textarea)[\s>/]|<[a-z][a-z0-9]*\s[^>]*onClick=/,
  "twarde barwy": /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/,
  "import z components/": /from\s+["'](?:@\/|(?:\.\.\/)+)components\//,
  "wstrzykiwanie HTML": /dangerouslySetInnerHTML/,
  "własny formater dat": /Intl\s*\.\s*DateTimeFormat|\.\s*toLocale(?:Date|Time)?String\b/,
  "adres innego hosta": /["'`]https?:\/\//,
};

export function plikiZrodlowe(katalog: string): string[] {
  return readdirSync(katalog, { withFileTypes: true }).flatMap((wpis) => {
    if (wpis.isDirectory()) return wpis.name === "__tests__" ? [] : plikiZrodlowe(resolve(katalog, wpis.name));
    return /\.(tsx?|css)$/.test(wpis.name) ? [resolve(katalog, wpis.name)] : [];
  });
}

/** Naruszenia reguł w plikach; `wyjatki` — nazwa reguły → pliki (końcówki ścieżek), którym wolno. */
export function naruszenia(pliki: string[], wyjatki: Record<string, string[]> = {}): string[] {
  const wynik: string[] = [];
  for (const plik of pliki) {
    const tresc = readFileSync(plik, "utf8");
    for (const [nazwa, wzorzec] of Object.entries(REGULY)) {
      if ((wyjatki[nazwa] ?? []).some((koncowka) => plik.replace(/\\/g, "/").endsWith(koncowka))) continue;
      if (wzorzec.test(tresc)) wynik.push(`${nazwa}: ${plik}`);
    }
  }
  return wynik;
}

/**
 * Strony podglądu mogą sięgnąć do `components/` wyłącznie po znak Fundacji
 * (`components/ui/Logo`) — tak jak powłoki paneli. Zwraca inne importy.
 */
export function importyComponentsInneNizLogo(pliki: string[]): string[] {
  return pliki.flatMap((plik) =>
    [...readFileSync(plik, "utf8").matchAll(/from\s+["']((?:@\/|(?:\.\.\/)+)components\/[^"']+)["']/g)]
      .map((m) => m[1])
      .filter((sciezka) => sciezka !== "@/components/ui/Logo")
      .map((sciezka) => `${sciezka}: ${plik}`),
  );
}
