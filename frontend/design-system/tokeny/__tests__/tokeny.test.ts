import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { ZALAMANIA } from "../zalamania";

const sciezkaCss = resolve(process.cwd(), "design-system/tokeny/tokeny.css");
const css = readFileSync(sciezkaCss, "utf-8");

/** Zwraca zawartość wszystkich plików *.module.css pod katalogiem atomów. */
function tresciCssAtomow(): string[] {
  const katalogAtomow = resolve(process.cwd(), "design-system/atomy");
  const wyniki: string[] = [];
  for (const nazwaAtomu of readdirSync(katalogAtomow)) {
    const sciezka = join(katalogAtomow, nazwaAtomu, `${nazwaAtomu}.module.css`);
    try {
      wyniki.push(readFileSync(sciezka, "utf-8"));
    } catch {
      // atom bez własnego pliku CSS (np. czysto strukturalny) — pomijamy
    }
  }
  return wyniki;
}

/** Wyciąga wartość zmiennej z pierwszego bloku, w którym występuje. */
function wartosc(nazwaZmiennej: string, blok: string): string {
  const wzorzec = new RegExp(String.raw`--${nazwaZmiennej}:\s*([^;]+);`);
  const dopasowanie = blok.match(wzorzec);
  if (!dopasowanie) {
    throw new Error(`brak zmiennej --${nazwaZmiennej} w podanym bloku`);
  }
  return dopasowanie[1].trim();
}

// Bloki motywów wycięte z pliku, żeby test mierzył jasny i ciemny osobno.
const blokJasny = css.split("[data-theme] {")[1].split("}")[0];
const blokCiemny = css.split('@media (prefers-color-scheme: dark) {')[1].split("}")[0];

describe("tokeny — barwy §1.1", () => {
  const paryZnakWZnak: Array<[string, string, string]> = [
    ["bg", "#f3f1ed", "#15151a"],
    ["card", "#ffffff", "#1e1e24"],
    ["card-warm", "#f5f4ef", "#23232a"],
    ["grey", "#f1f0ec", "#26262d"],
    ["border", "#e6e4df", "#32323b"],
    ["border-strong", "#8a8781", "#6f6f7d"],
    ["control", "#6f6d68", "#9a9aa6"],
    ["ink", "#1a1a1a", "#f4f3ef"],
    ["text", "#323232", "#e3e2dc"],
    ["muted", "#5f5d58", "#a9a8a1"],
    ["subtle", "#6b6964", "#8e8d87"],
    ["brand", "#1500bb", "#9d92ff"],
    ["link", "#594ef9", "#a79eff"],
    ["primary", "#00803a", "#1fb862"],
    ["primary-hover", "#006b30", "#35cc76"],
    ["green", "#01be4a", "#35d97a"],
    ["success", "#006b30", "#4ad686"],
    ["warn", "#8a5a00", "#f2b84b"],
    ["error", "#b23324", "#ff7b6b"],
    ["error-bg", "#fdf3f3", "#3a2320"],
    ["invert-bg", "#1a1a1a", "#2e2e38"],
    ["invert-ink", "#f4f3ef", "#f4f3ef"],
    ["invert-link", "#8be3ad", "#8be3ad"],
    ["brand-tint", "#1500bb12", "#9d92ff1f"],
    ["green-tint", "#01be4a1f", "#35d97a24"],
    ["success-bg", "#01be4a1a", "#35d97a24"],
    ["warn-bg", "#f59e0b1f", "#f59e0b26"],
    ["on-primary", "#ffffff", "#0c1a10"],
  ];

  it.each(paryZnakWZnak)(
    "--%s ma wartość jasną i ciemną znak w znak z makiety",
    (nazwa, jasna, ciemna) => {
      expect(wartosc(nazwa, blokJasny)).toBe(jasna);
      expect(wartosc(nazwa, blokCiemny)).toBe(ciemna);
    },
  );

  it("shadow ma wartość jasną i ciemną znak w znak z makiety", () => {
    expect(wartosc("shadow", blokJasny)).toBe(
      "0 1px 2px rgba(26, 26, 26, .08), 0 4px 14px rgba(26, 26, 26, .10)",
    );
    expect(wartosc("shadow", blokCiemny)).toBe(
      "0 1px 2px rgba(0, 0, 0, .4), 0 4px 14px rgba(0, 0, 0, .5)",
    );
  });

  it("--info i --info-bg mają 0 użyć w CSS atomów", () => {
    const cssAtomow = tresciCssAtomow().join("\n");
    expect([...cssAtomow.matchAll(/var\(--info(-bg)?\)/g)]).toHaveLength(0);
  });
});

/** Nazwy zmiennych (bez `--` i bez wartości) zadeklarowanych w podanym bloku tekstu CSS. */
function nazwyZmiennych(blok: string): string[] {
  return [...blok.matchAll(/--([\w-]+):/g)].map((m) => m[1]);
}

// Wada zgłoszona w odrębnym pomiarze:
// poprzednia wersja robiła `toHaveLength` na tablicach LITERALNYCH napisanych
// dwa wiersze wyżej w TYM SAMYM teście — mierzyła długość własnego tekstu, nie
// treści pliku; dodanie zmiennej `--brand-xtra` do bloku bazowego dawało wtedy 39
// zielonych testów, zero czerwieni. Liczniki niżej są WYCIĘTE z `tokeny.css`
// (funkcją `nazwyZmiennych` na strukturalnie wydzielonym segmencie pliku, nie
// z literalnej listy), a lista `zSpecyfikacji34` służy WYŁĄCZNIE jako punkt
// odniesienia (treść z 06-ATOMY-MOLEKULY-ORGANIZMY.md §1.1), do porównania
// z tym, co naprawdę jest w pliku — nie jako to, czego długość się mierzy.
describe("tokeny — mianownik §1.1 wycięty z pliku, nie z literału", () => {
  // Segment strukturalny: od pierwszego "[data-theme] {" do komentarza "dwie zmienne lokalne" —
  // to WSZYSTKO, co plik zapisuje MIĘDZY otwarciem `[data-theme]` a zmiennymi
  // lokalnymi/skalami (barwy+cień+kształt/pismo jednej wartości, §1.1).
  // Wycinane granicą KOMENTARZA w pliku, nie numerem linii ani listą nazw.
  const segment34 = css.split("[data-theme] {")[1].split("/* dwie zmienne lokalne */")[0];
  const nazwyWSegmencie = nazwyZmiennych(segment34);
  const nazwyWBlokuCiemnym = nazwyZmiennych(blokCiemny);

  const zSpecyfikacji34 = [
    "bg", "card", "card-warm", "grey", "border", "border-strong", "control",
    "ink", "text", "muted", "subtle", "invert-bg", "invert-ink", "invert-link",
    "brand", "brand-tint", "link", "primary", "primary-hover", "green",
    "green-tint", "success", "success-bg", "warn", "warn-bg", "error",
    "error-bg", "shadow", "on-primary",
    "r-xs", "r-sm", "r-md", "sidebar", "font",
  ];

  it("segment §1.1 pliku ma dokładnie te 34 nazwy ze specyfikacji, ani jednej więcej, ani jednej mniej", () => {
    expect(nazwyWSegmencie).toHaveLength(34);
    expect([...nazwyWSegmencie].sort()).toEqual([...zSpecyfikacji34].sort());
  });

  it("--info i --info-bg nie należą do segmentu §1.1 wyciętego z pliku", () => {
    expect(nazwyWSegmencie).not.toContain("info");
    expect(nazwyWSegmencie).not.toContain("info-bg");
  });

  it("blok ciemny ma dokładnie 29 nazw — te same barwy+cień, bez 5 tokenów kształtu/pisma", () => {
    const oczekiwane29 = zSpecyfikacji34.filter((n) => !["r-xs", "r-sm", "r-md", "sidebar", "font"].includes(n));
    expect(nazwyWBlokuCiemnym).toHaveLength(29);
    expect([...nazwyWBlokuCiemnym].sort()).toEqual([...oczekiwane29].sort());
  });
});

describe("tokeny — kształt i skala §1.2", () => {
  it("promienie nazwane mają wartości z makiety", () => {
    expect(wartosc("r-2xs", blokJasny)).toBe("6px");
    expect(wartosc("r-xs", blokJasny)).toBe("8px");
    expect(wartosc("r-sm", blokJasny)).toBe("12px");
    expect(wartosc("r-md", blokJasny)).toBe("16px");
    expect(wartosc("r-pill", blokJasny)).toBe("999px");
    expect(wartosc("r-round", blokJasny)).toBe("50%");
  });

  it("skala odstępów ma dokładnie 16 wartości, nic pomiędzy", () => {
    const dozwolone = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 64];
    for (const px of dozwolone) {
      expect(wartosc(`space-${px}`, blokJasny)).toBe(`${px}px`);
    }
    const dopasowania = [...css.matchAll(/--space-(\d+):/g)].map((m) => Number(m[1]));
    const unikalne = [...new Set(dopasowania)].sort((a, b) => a - b);
    expect(unikalne).toEqual(dozwolone);
  });

  it("pismo ma dokładnie 14 stopni i 4 grubości", () => {
    const stopnie = [...css.matchAll(/--fs-[\w-]+:\s*(\d+)px;/g)].map((m) => Number(m[1]));
    expect(new Set(stopnie).size).toBe(14);
    expect(wartosc("fw-regular", blokJasny)).toBe("400");
    expect(wartosc("fw-medium", blokJasny)).toBe("500");
    expect(wartosc("fw-bold", blokJasny)).toBe("700");
    expect(wartosc("fw-black", blokJasny)).toBe("900");
  });

  // Powyższy test liczy TYLKO ILE jest różnych stopni — zmiana
  // KTÓRY token ma KTÓRĄ wartość (np. --fs-9: 15px -> 21px) zostawiała ten test
  // zielonym, bo zbiór wartości nadal miał 14 elementów, tylko przesuniętych.
  // Ten test przypina KAŻDĄ nazwę z §1.2/§2 do jej liczby, znak w znak.
  it.each([
    ["fs-1", "44px"],
    ["fs-2", "30px"],
    ["fs-2-sm", "23px"],
    ["fs-3", "24px"],
    ["fs-4", "22px"],
    ["fs-5", "20px"],
    ["fs-6", "18px"],
    ["fs-7", "17px"],
    ["fs-8", "16px"],
    ["fs-9", "15px"],
    ["fs-10", "14px"],
    ["fs-11", "13px"],
    ["fs-12", "12px"],
    ["fs-13", "11px"],
  ])("--%s ma wartość %s, przypięta do §1.2/§2 (nie tylko policzona)", (nazwa, oczekiwana) => {
    expect(wartosc(nazwa, blokJasny)).toBe(oczekiwana);
  });
});

// Poprzednia wersja robiła
// `expect(Object.keys(oczekiwane)).toHaveLength(8)` na Record LITERALNYM
// napisanym w tym samym teście — mierzyła długość własnych kluczy, nie
// zawartość pliku. Dowód zaburzeniem: `--z-podstepny: 77`
// dopisany do `tokeny.css` -> 55 zdanych, zero czerwieni. Licznik niżej jest
// WYCIĘTY z segmentu `tokeny.css` ograniczonego komentarzami "Warstwy: 8
// nazwanych" / "Ruch" (ta sama metoda co mianownik §1.1), nie z literału.
describe("tokeny — warstwy §1.4", () => {
  const segmentWarstw = css
    .split("/* --- Warstwy: 8 nazwanych, jedyne dozwolone --- */")[1]
    .split("/* --- Ruch --- */")[0];
  const nazwyWSegmencieWarstw = nazwyZmiennych(segmentWarstw);

  const oczekiwane: Record<string, number> = {
    "z-sticky-col": 1,
    "z-savebar": 4,
    "z-topbar": 5,
    "z-listbox": 10,
    "z-scrim": 19,
    "z-drawer": 20,
    "z-toast": 50,
    "z-skiplink": 100,
  };

  it("segment warstw w pliku ma dokładnie te 8 nazw ze specyfikacji, ani jednej więcej, ani jednej mniej", () => {
    expect(nazwyWSegmencieWarstw).toHaveLength(8);
    expect([...nazwyWSegmencieWarstw].sort()).toEqual([...Object.keys(oczekiwane)].sort());
  });

  it("każda nazwana warstwa ma wartość znak w znak z makiety", () => {
    for (const nazwa of Object.keys(oczekiwane)) {
      expect(wartosc(nazwa, blokJasny)).toBe(String(oczekiwane[nazwa]));
    }
  });
});

describe("tokeny — punkty łamania §1.3", () => {
  it("ma dokładnie 9 progów nazwanych, wartości z makiety", () => {
    const wartosci = Object.values(ZALAMANIA);
    expect(wartosci).toHaveLength(9);
    expect(wartosci).toEqual([400, 480, 639, 640, 700, 900, 1023, 1180, 1380]);
  });
});

describe("tokeny — wspólne: fokus i cel dotykowy", () => {
  it("fokus to jedna reguła 3px --brand, odstęp 2px", () => {
    expect(wartosc("focus-width", blokJasny)).toBe("3px");
    expect(wartosc("focus-offset", blokJasny)).toBe("2px");
    expect(css).toContain(":focus-visible {");
    expect((css.match(/:focus-visible \{/g) ?? []).length).toBe(1);
  });

  it("cel dotykowy ma dokładnie jedną nazwaną wartość 44px", () => {
    expect(wartosc("hit-min", blokJasny)).toBe("44px");
  });

  // Wersja SPRZED tej naprawy pilnowała tylko wartości --r-2xs/--r-xs
  // jako oddzielnych deklaracji (wyżej, "promienie nazwane mają wartości z
  // makiety") — to przechodziło zielono nawet wtedy, gdy sama REGUŁA
  // :focus-visible używała złego tokenu (--r-xs zamiast --r-2xs), bo test nie
  // czytał treści tej konkretnej reguły. Ten test wycina treść reguły
  // :focus-visible z pliku i sprawdza, KTÓREGO tokenu ona faktycznie używa —
  // rozjazd między wartością tokenu a użyciem w regule jest teraz wykrywalny
  // tu (wartość statyczna z pliku CSS) i osobno w prawdziwej przeglądarce
  // (design-system/poligon/pomiar-styl-atomow.mjs mierzy wyliczony
  // border-radius elementu W STANIE FOKUSU, nie sam zapis w arkuszu).
  it("reguła :focus-visible używa var(--r-2xs), nie var(--r-xs)", () => {
    const regulaFokusu = css.match(/:focus-visible\s*\{([^}]*)\}/);
    expect(regulaFokusu).not.toBeNull();
    const trescReguly = regulaFokusu![1];
    expect(trescReguly).toMatch(/border-radius:\s*var\(--r-2xs\)/);
    expect(trescReguly).not.toMatch(/border-radius:\s*var\(--r-xs\)/);
  });
});

describe("wartosc() — odczyt wartości zmiennej z bloku", () => {
  it("zachowuje pierwszą literę wartości zaczynającej się od „s” (bez spacji po dwukropku)", () => {
    expect(wartosc("x", "--x:solid;")).toBe("solid");
  });

  it("pomija białe znaki po dwukropku, także tabulator i nowy wiersz", () => {
    expect(wartosc("x", "--x: solid;")).toBe("solid");
    expect(wartosc("x", "--x:\t solid;")).toBe("solid");
    expect(wartosc("x", "--x:\n  solid;")).toBe("solid");
  });
});
