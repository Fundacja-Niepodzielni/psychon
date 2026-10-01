import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Blok „Konto” w menu ramy jest zwykłym wierszem menu: bez ramki i bez cienia, na tle menu.
 * „Wyloguj” wygląda jak pozycja menu (bez obrysu i tła w spoczynku, to samo tło najechania),
 * a napis i ikona mają barwę działań niebezpiecznych z palety — czytelną na tle menu
 * i na tle najechania (co najmniej 4,5:1), w motywie jasnym i ciemnym.
 * Jedyna krawędź bloku to cienka linia u góry, gdy pod blokiem przewija się treść menu.
 * Próba czyta arkusz szablonu i tokeny barw — liczy to, co widzi przeglądarka.
 */

const KATALOG = join(process.cwd(), "design-system");
const ARKUSZ = readFileSync(join(KATALOG, "szablony/PowlokaPanelu/PowlokaPanelu.module.css"), "utf8");
const ARKUSZ_MENU = readFileSync(join(KATALOG, "organizmy/PanelNav/PanelNav.module.css"), "utf8");
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

/** Deklaracje reguły o dokładnie takim selektorze (bez komentarzy). */
function regula(arkusz: string, selektor: string): string {
  const bezKomentarzy = arkusz.replace(/\/\*[\s\S]*?\*\//g, "");
  const wzor = selektor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blok = bezKomentarzy.match(new RegExp(`(?:^|\\})\\s*${wzor}\\s*\\{([^}]*)\\}`));
  if (!blok) throw new Error(`brak reguły ${selektor}`);
  return blok[1];
}

/** Wartość deklaracji danej właściwości w regule; `null`, gdy reguła jej nie ma. */
function deklaracja(tresc: string, wlasciwosc: string): string | null {
  const znaleziona = tresc.match(new RegExp(`(?:^|[;\\s])${wlasciwosc}:\\s*([^;]+);`));
  return znaleziona ? znaleziona[1].trim() : null;
}

/** Nazwa tokenu z deklaracji `var(--nazwa)`. */
function tokenDeklaracji(tresc: string, wlasciwosc: string): string {
  const wartosc = deklaracja(tresc, wlasciwosc);
  const nazwa = wartosc?.match(/^var\(--([a-z0-9-]+)\)$/);
  if (!nazwa) throw new Error(`deklaracja ${wlasciwosc} nie jest pojedynczym tokenem: ${wartosc}`);
  return nazwa[1];
}

const KONTO = regula(ARKUSZ, ".konto");
const KONTO_NAD_TRESCIA = regula(ARKUSZ, ".kontoNadTrescia");
const WYLOGUJ = regula(ARKUSZ, ".wyloguj");
const WYLOGUJ_NAJECHANY = regula(ARKUSZ, ".wyloguj:hover");
const WYLOGUJ_NIECZYNNY = regula(ARKUSZ, ".wyloguj:disabled");
const MOTYWY = ["jasny", "ciemny"] as const;

describe("PowlokaPanelu — blok „Konto” jest zwykłym wierszem menu", () => {
  it("blok w spoczynku nie ma ramki, cienia ani obrysu", () => {
    expect(KONTO).not.toMatch(/border/);
    expect(KONTO).not.toMatch(/box-shadow/);
    expect(KONTO).not.toMatch(/outline/);
  });

  it("tło bloku jest tłem menu — nieprzezroczyste, więc przewinięte pozycje nie prześwitują", () => {
    expect(tokenDeklaracji(KONTO, "background")).toBe(tokenDeklaracji(regula(ARKUSZ, ".bok"), "background"));
    expect(token(tokenDeklaracji(KONTO, "background"), "jasny").a).toBe(1);
    expect(token(tokenDeklaracji(KONTO, "background"), "ciemny").a).toBe(1);
  });

  it("nad treścią przewijaną pod blokiem stoi jedna cienka linia u góry, bez cienia", () => {
    expect(deklaracja(KONTO_NAD_TRESCIA, "border-top")).toBe("1px solid var(--border)");
    expect(KONTO_NAD_TRESCIA.match(/(?:^|[;\s])border[a-z-]*:/g)).toHaveLength(1);
    expect(KONTO_NAD_TRESCIA).not.toMatch(/box-shadow/);
  });

  it("pojawienie się linii nie przesuwa menu: jej 1 px jest zajęty także w spoczynku", () => {
    expect(deklaracja(KONTO, "padding-top")).toBe("1px");
    expect(deklaracja(KONTO_NAD_TRESCIA, "padding-top")).toBe("0");
  });
});

describe("PowlokaPanelu — „Wyloguj” jak pozycja menu, w barwie działań niebezpiecznych", () => {
  it("w spoczynku nie ma obrysu, ramki, cienia ani tła", () => {
    expect(deklaracja(WYLOGUJ, "border")).toBe("0");
    expect(deklaracja(WYLOGUJ, "background")).toBe("transparent");
    expect(WYLOGUJ).not.toMatch(/box-shadow/);
    expect(WYLOGUJ).not.toMatch(/outline/);
  });

  it("barwa napisu jest tokenem działań niebezpiecznych, bez barwy wpisanej wprost", () => {
    expect(tokenDeklaracji(WYLOGUJ, "color")).toBe("error");
    for (const tresc of [KONTO, KONTO_NAD_TRESCIA, WYLOGUJ, WYLOGUJ_NAJECHANY, WYLOGUJ_NIECZYNNY]) {
      expect(tresc).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    }
  });

  it("tło najechania jest tym samym tokenem co tło najechanej pozycji menu", () => {
    expect(tokenDeklaracji(WYLOGUJ_NAJECHANY, "background")).toBe(tokenDeklaracji(regula(ARKUSZ_MENU, ".grupa a:hover"), "background"));
  });

  it("cel dotyku ma co najmniej 44 px", () => {
    expect(deklaracja(WYLOGUJ, "min-height")).toBe("var(--hit-min)");
    const wysokosc = TOKENY.match(/--hit-min:\s*(\d+)px;/);
    expect(Number(wysokosc?.[1])).toBeGreaterThanOrEqual(44);
  });

  for (const motyw of MOTYWY) {
    it(`motyw ${motyw}: napis i ikona ≥ 4,5:1 względem tła menu`, () => {
      const wynik = kontrast(token(tokenDeklaracji(WYLOGUJ, "color"), motyw), token(tokenDeklaracji(KONTO, "background"), motyw));
      console.log(`POMIAR-WYLOGUJ-STYL ${motyw} spoczynek ${wynik.toFixed(2)}`);
      expect(wynik).toBeGreaterThanOrEqual(4.5);
    });

    it(`motyw ${motyw}: napis i ikona ≥ 4,5:1 względem tła najechania`, () => {
      const tloMenu = token(tokenDeklaracji(KONTO, "background"), motyw);
      const tloNajechania = naTle(token(tokenDeklaracji(WYLOGUJ_NAJECHANY, "background"), motyw), tloMenu);
      const wynik = kontrast(token(tokenDeklaracji(WYLOGUJ, "color"), motyw), tloNajechania);
      console.log(`POMIAR-WYLOGUJ-STYL ${motyw} najechanie ${wynik.toFixed(2)}`);
      expect(wynik).toBeGreaterThanOrEqual(4.5);
    });

    it(`motyw ${motyw}: napis przycisku nieczynnego ≥ 4,5:1 względem tła menu`, () => {
      const wynik = kontrast(token(tokenDeklaracji(WYLOGUJ_NIECZYNNY, "color"), motyw), token(tokenDeklaracji(KONTO, "background"), motyw));
      console.log(`POMIAR-WYLOGUJ-STYL ${motyw} nieczynny ${wynik.toFixed(2)}`);
      expect(wynik).toBeGreaterThanOrEqual(4.5);
    });
  }
});
