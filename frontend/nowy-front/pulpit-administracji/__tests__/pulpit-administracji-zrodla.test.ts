import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Pomiar tekstu plików ekranu „Pulpit administracji”: nie sprawdza renderu,
 * tylko to, czego w plikach ekranu (poza katalogami testów) nie wolno mieć.
 * Każdy wzorzec ma próbkę z naruszeniem, żeby pomiar nie mógł zielenieć,
 * gdy nic nie znajduje.
 */

const KORZEN = process.cwd();

function plikiZrodlowe(katalog: string): string[] {
  const pelny = join(KORZEN, katalog);
  if (!existsSync(pelny)) return [];
  return readdirSync(pelny).flatMap((nazwa) => {
    const sciezka = join(pelny, nazwa);
    if (statSync(sciezka).isDirectory()) {
      return nazwa === "__tests__" ? [] : plikiZrodlowe(relative(KORZEN, sciezka));
    }
    return /\.(ts|tsx|css)$/.test(nazwa) ? [sciezka] : [];
  });
}

const STRONA = join(KORZEN, "app/nowy-front/admin/pulpit/page.tsx");
const PLIKI = [...plikiZrodlowe("nowy-front/pulpit-administracji"), STRONA];

const WZORCE: Record<string, { wzorzec: RegExp; probka: string }> = {
  "surowy przycisk": { wzorzec: /<button\b/, probka: "<button>OK</button>" },
  "surowy odnośnik": { wzorzec: /<a\s/, probka: '<a href="/x">x</a>' },
  "surowe pole": { wzorzec: /<(input|select|textarea)\b/, probka: "<input />" },
  // Uchwyt na elemencie DOM (tag z małej litery); `onClick` na komponentach warstwy design-system jest dozwolony.
  "onClick na elemencie DOM": { wzorzec: /<[a-z][\w-]*\s[^>]*onClick=/, probka: "<div onClick={f} />" },
  "twardy kolor": {
    wzorzec: /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/,
    probka: "color: #ff0000;",
  },
  "import z components": { wzorzec: /from\s+["'][^"']*\/components\//, probka: 'import x from "@/components/ui/Card";' },
  "surowy HTML": { wzorzec: /dangerouslySetInnerHTML/, probka: "<div dangerouslySetInnerHTML={{ __html: h }} />" },
};

function trafienia(wzorzec: RegExp): string[] {
  return PLIKI.filter((plik) => wzorzec.test(readFileSync(plik, "utf-8"))).map((plik) => relative(KORZEN, plik));
}

describe("pliki ekranu „Pulpit administracji”", () => {
  it("pomiar obejmuje komponent, moduł danych, widok, styl i stronę", () => {
    const nazwy = PLIKI.map((plik) => relative(KORZEN, plik).replace(/\\/g, "/"));
    expect(nazwy).toEqual(
      expect.arrayContaining([
        "nowy-front/pulpit-administracji/PulpitAdministracji.tsx",
        "nowy-front/pulpit-administracji/PulpitAdministracji.module.css",
        "nowy-front/pulpit-administracji/dane.ts",
        "nowy-front/pulpit-administracji/widok.ts",
        "app/nowy-front/admin/pulpit/page.tsx",
      ]),
    );
  });

  it.each(Object.entries(WZORCE))("%s: próbka z naruszeniem jest wykrywana, pliki ekranu są czyste", (_nazwa, { wzorzec, probka }) => {
    expect(wzorzec.test(probka)).toBe(true);
    expect(trafienia(wzorzec)).toEqual([]);
  });

  it("szablon pulpitu pochodzi z warstwy design-system, a strona tylko wstawia ekran", () => {
    const ekran = readFileSync(join(KORZEN, "nowy-front/pulpit-administracji/PulpitAdministracji.tsx"), "utf-8");
    expect(ekran).toMatch(/import \{ DashboardTemplate \} from "@\/design-system\/szablony\/DashboardTemplate\/DashboardTemplate";/);
    expect(ekran).toMatch(/<DashboardTemplate\b/);
    expect(ekran).not.toMatch(/<main\b/);
    const strona = readFileSync(STRONA, "utf-8");
    expect(strona).toMatch(/<PulpitAdministracji \/>/);
    expect(strona).not.toMatch(/useState|fetch\(/);
  });

  it("dokładnie jeden przycisk główny w komponencie ekranu, w nagłówku (przyciskGlowny), nie w dzieci", () => {
    const ekran = readFileSync(join(KORZEN, "nowy-front/pulpit-administracji/PulpitAdministracji.tsx"), "utf-8");
    expect(ekran.match(/przyciskGlowny:/g)).toHaveLength(1);
    expect(ekran.match(/poziom="primary"/g)).toBeNull();
    expect(ekran).not.toMatch(/dzieci:/);
  });

  it("jedyną trasą API ekranu jest GET /admin/dashboard", () => {
    const dane = readFileSync(join(KORZEN, "nowy-front/pulpit-administracji/dane.ts"), "utf-8");
    expect(dane.match(/api<[^>]*>\("([^"]+)"/g)).toEqual(['api<unknown>("/admin/dashboard"']);
  });
});
