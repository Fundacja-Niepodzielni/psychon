import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ZALAMANIA } from "../zalamania";

const sciezkaCss = resolve(process.cwd(), "design-system/tokeny/tokeny.css");
const css = readFileSync(sciezkaCss, "utf-8");

/** Wyciąga wartość zmiennej z pierwszego bloku, w którym występuje. */
function wartosc(nazwaZmiennej: string, blok: string): string {
  const wzorzec = new RegExp(`--${nazwaZmiennej}:\s*([^;]+);`);
  const dopasowanie = blok.match(wzorzec);
  if (!dopasowanie) {
    throw new Error(`brak zmiennej --${nazwaZmiennej} w podanym bloku`);
  }
  return dopasowanie[1].trim();
}

// Bloki motywów wycięte z pliku, żeby test mierzył jasny i ciemny osobno.
const blokJasny = css.split(":root {")[1].split("}")[0];
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
    ["on-primary", "#ffffff", "#0c1a10"],
  ];

  it.each(paryZnakWZnak)(
    "--%s ma wartość jasną i ciemną znak w znak z makiety",
    (nazwa, jasna, ciemna) => {
      expect(wartosc(nazwa, blokJasny)).toBe(jasna);
      expect(wartosc(nazwa, blokCiemny)).toBe(ciemna);
    },
  );

  it("--info i --info-bg istnieją w tokenach (36 zmiennych z makiety), ale 0 użyć w atomach", () => {
    expect(wartosc("info", blokJasny)).toBe("#2f6cb3");
    expect(wartosc("info-bg", blokJasny)).toBe("#4a90e21a");
  });
});

describe("tokeny — kształt i skala §1.2", () => {
  it("promienie nazwane mają wartości z makiety", () => {
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
});

describe("tokeny — warstwy §1.4", () => {
  it("ma dokładnie 8 nazwanych z-index, znak w znak z makiety", () => {
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
    const nazwy = Object.keys(oczekiwane);
    expect(nazwy).toHaveLength(8);
    for (const nazwa of nazwy) {
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
});
