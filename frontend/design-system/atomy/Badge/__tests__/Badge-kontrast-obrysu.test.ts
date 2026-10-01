import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Plakietka ma być widoczna jako kształt na tle strony i na tle karty: jej
 * obrys ma kontrast co najmniej 3:1 względem obu teł, w motywie jasnym
 * i ciemnym. Samo tło plakietki tego nie daje (`--grey` na `--bg` to około
 * 1:1). Tekst plakietki zostaje czytelny: co najmniej 4,5:1 względem tła
 * plakietki położonego na stronie i na karcie.
 * Próba czyta arkusz plakietki i tokeny barw — liczy to, co widzi przeglądarka.
 */

const KATALOG = join(process.cwd(), "design-system");
const ARKUSZ = readFileSync(join(KATALOG, "atomy/Badge/Badge.module.css"), "utf8");
const TOKENY = readFileSync(join(KATALOG, "tokeny/tokeny.css"), "utf8");

type Barwa = { r: number; g: number; b: number; a: number };

/** Kolejne wystąpienia tokenu w arkuszu: pierwsze = motyw jasny, drugie = ciemny. */
function token(nazwa: string, motyw: "jasny" | "ciemny"): Barwa {
  const wystapienia = [...TOKENY.matchAll(new RegExp(`--${nazwa}:\\s*#([0-9a-fA-F]{6,8});`, "g"))].map((m) => m[1]);
  const zapis = wystapienia[motyw === "jasny" ? 0 : 1];
  if (!zapis) throw new Error(`brak tokenu --${nazwa} dla motywu ${motyw}`);
  const liczba = (od: number) => parseInt(zapis.slice(od, od + 2), 16);
  return { r: liczba(0), g: liczba(2), b: liczba(4), a: zapis.length === 8 ? liczba(6) / 255 : 1 };
}

function naTle(barwa: Barwa, tlo: Barwa): Barwa {
  const zloz = (gora: number, dol: number) => gora * barwa.a + dol * (1 - barwa.a);
  return { r: zloz(barwa.r, tlo.r), g: zloz(barwa.g, tlo.g), b: zloz(barwa.b, tlo.b), a: 1 };
}

function jasnosc({ r, g, b }: Barwa): number {
  const kanal = (wartosc: number) => {
    const c = wartosc / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b);
}

function kontrast(a: Barwa, b: Barwa): number {
  const [jasna, ciemna] = [jasnosc(a), jasnosc(b)].sort((x, y) => y - x);
  return (jasna + 0.05) / (ciemna + 0.05);
}

/** Token użyty w deklaracji danej właściwości klasy wariantu. */
function tokenKlasy(klasa: string, wlasciwosc: string): string {
  const blok = ARKUSZ.match(new RegExp(`\\.${klasa}\\s*\\{([^}]*)\\}`));
  if (!blok) throw new Error(`brak klasy .${klasa}`);
  const deklaracja = blok[1].match(new RegExp(`(?:^|[;\\s])${wlasciwosc}:\\s*var\\(--([a-z0-9-]+)\\)`));
  if (!deklaracja) throw new Error(`klasa .${klasa} nie ma deklaracji ${wlasciwosc} z tokenem`);
  return deklaracja[1];
}

const WARIANTY = ["neutral", "warn", "error", "pending"] as const;
const MOTYWY = ["jasny", "ciemny"] as const;
const TLA = ["bg", "card"] as const;

describe("Badge — obrys widoczny na tle strony i karty", () => {
  it("plakietka ma obrys o stałej grubości", () => {
    expect(ARKUSZ).toMatch(/\.plakietka\s*\{[^}]*border:\s*1px solid/);
  });

  for (const wariant of WARIANTY) {
    for (const motyw of MOTYWY) {
      for (const tlo of TLA) {
        it(`${wariant}, motyw ${motyw}, tło --${tlo}: obrys ≥ 3:1`, () => {
          const obrys = token(tokenKlasy(wariant, "border-color"), motyw);
          expect(kontrast(obrys, token(tlo, motyw))).toBeGreaterThanOrEqual(3);
        });

        it(`${wariant}, motyw ${motyw}, tło --${tlo}: tekst ≥ 4,5:1 względem tła plakietki`, () => {
          const podklad = token(tlo, motyw);
          const tloPlakietki = naTle(token(tokenKlasy(wariant, "background"), motyw), podklad);
          expect(kontrast(token(tokenKlasy(wariant, "color"), motyw), tloPlakietki)).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }
});
