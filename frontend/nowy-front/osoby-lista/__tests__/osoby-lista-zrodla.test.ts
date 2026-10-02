import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Pomiar tekstu plików ekranu listy osób (nie renderu): surowe elementy,
 * twarde kolory, importy starych komponentów, niebezpieczny HTML i własny
 * znacznik `main`. Każdy licznik ma kontrolę dodatnią na próbce z naruszeniem.
 */

const KORZEN = process.cwd();

function pliki(katalog: string): string[] {
  const pelny = join(KORZEN, katalog);
  if (!existsSync(pelny)) return [];
  return readdirSync(pelny).flatMap((nazwa) => {
    const sciezka = join(pelny, nazwa);
    if (statSync(sciezka).isDirectory()) return nazwa === "__tests__" ? [] : pliki(relative(KORZEN, sciezka));
    return /\.(ts|tsx|css)$/.test(nazwa) ? [sciezka] : [];
  });
}

const PLIKI_EKRANU = [
  ...pliki("nowy-front/osoby-lista"),
  join(KORZEN, "app/nowy-front/admin/uczestniczki/page.tsx"),
];

const tresc = (sciezka: string) => readFileSync(sciezka, "utf-8");

/** Surowe elementy DOM — znaczniki, nie teksty w komentarzach (komentarze wycinamy). */
function bezKomentarzy(zrodlo: string): string {
  return zrodlo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function suroweElementy(zrodlo: string): string[] {
  return bezKomentarzy(zrodlo).match(/<(button|a|input|select|textarea)[\s>/]/g) ?? [];
}

/** `onClick=` na elemencie pisanym małą literą (na atomach z wielkiej litery wolno). */
function zdarzeniaNaSurowychElementach(zrodlo: string): number {
  const kod = bezKomentarzy(zrodlo);
  let licznik = 0;
  for (const dopasowanie of kod.matchAll(/onClick=/g)) {
    const poczatek = kod.lastIndexOf("<", dopasowanie.index);
    if (poczatek >= 0 && /^<[a-z]/.test(kod.slice(poczatek))) licznik += 1;
  }
  return licznik;
}

function twardeKolory(zrodlo: string): string[] {
  return bezKomentarzy(zrodlo).match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g) ?? [];
}

function importyZKomponentow(zrodlo: string): string[] {
  return zrodlo.match(/from\s+["']@\/components\//g) ?? [];
}

describe("Lista osób — źródła ekranu", () => {
  it("pliki ekranu istnieją (pomiar nie jest pusty)", () => {
    expect(PLIKI_EKRANU.length).toBeGreaterThanOrEqual(4);
    expect(PLIKI_EKRANU.every((p) => existsSync(p))).toBe(true);
  });

  it("zero surowych elementów button/a/input/select/textarea", () => {
    const trafienia = PLIKI_EKRANU.filter((p) => suroweElementy(tresc(p)).length > 0);
    expect(trafienia.map((p) => relative(KORZEN, p))).toEqual([]);
  });

  it("zero onClick na surowych elementach", () => {
    const trafienia = PLIKI_EKRANU.filter((p) => zdarzeniaNaSurowychElementach(tresc(p)) > 0);
    expect(trafienia.map((p) => relative(KORZEN, p))).toEqual([]);
  });

  it("zero twardych kolorów", () => {
    const trafienia = PLIKI_EKRANU.filter((p) => twardeKolory(tresc(p)).length > 0);
    expect(trafienia.map((p) => relative(KORZEN, p))).toEqual([]);
  });

  it("zero importów z components/ i zero niebezpiecznego HTML", () => {
    expect(PLIKI_EKRANU.filter((p) => importyZKomponentow(tresc(p)).length > 0)).toEqual([]);
    expect(PLIKI_EKRANU.filter((p) => tresc(p).includes("dangerouslySetInnerHTML"))).toEqual([]);
  });

  it("jedyny main pochodzi z szablonu: ekran go nie zapisuje, a szablon jest importowany", () => {
    const wzorzec = new RegExp("<" + "main\\b");
    expect(PLIKI_EKRANU.filter((p) => wzorzec.test(tresc(p)))).toEqual([]);
    expect(tresc(join(KORZEN, "nowy-front/osoby-lista/OsobyLista.tsx"))).toMatch(
      /import \{ ListTemplate \} from "@\/design-system\/szablony\/ListTemplate\/ListTemplate";/,
    );
  });

  it("przycisk główny (poziom primary) stoi wyłącznie w pasku zaznaczenia — dokładnie jeden", () => {
    const wystapienia = PLIKI_EKRANU.flatMap((p) =>
      (tresc(p).match(/poziom=["']primary["']/g) ?? []).map(() => relative(KORZEN, p)),
    );
    expect(wystapienia).toEqual(["nowy-front/osoby-lista/PasekWyboru.tsx"]);
  });
});

/** Szerokości w pikselach większe niż treść ekranu 320 px (bez marginesów 2 × 16 px). */
function szerokosciPonad320(zrodlo: string): string[] {
  // Tylko deklaracje (kończą się średnikiem), nie warunki `@media (…-width: …)`.
  return (bezKomentarzy(zrodlo).match(/(?<![\w-])(?:min-)?width:\s*\d+px\s*;/g) ?? []).filter(
    (wpis) => Number(wpis.replace(/\D/g, "")) > 288,
  );
}

/** Treść bloku `@media (max-width: 639px)` (do jego zamykającego nawiasu). */
function blokWaskiegoEkranu(zrodlo: string): string {
  const poczatek = zrodlo.indexOf("@media (max-width: 639px)");
  if (poczatek < 0) return "";
  let glebokosc = 0;
  for (let i = zrodlo.indexOf("{", poczatek); i < zrodlo.length; i += 1) {
    if (zrodlo[i] === "{") glebokosc += 1;
    if (zrodlo[i] === "}") glebokosc -= 1;
    if (glebokosc === 0) return zrodlo.slice(poczatek, i + 1);
  }
  return "";
}

describe("Lista osób — wąskie ekrany (320 i 390 px)", () => {
  const css = (nazwa: string) => tresc(join(KORZEN, "nowy-front/osoby-lista", nazwa));

  it("żaden arkusz ekranu nie ma szerokości większej niż treść ekranu 320 px", () => {
    const trafienia = PLIKI_EKRANU.filter((p) => p.endsWith(".css") && szerokosciPonad320(tresc(p)).length > 0);
    expect(trafienia.map((p) => relative(KORZEN, p))).toEqual([]);
  });

  it("poniżej 640 px wiersz osoby jest blokiem: treść w jednej kolumnie, akcja z prawej, nagłówki kolumn tylko dla czytnika", () => {
    const blok = blokWaskiegoEkranu(css("TabelaOsob.module.css"));
    expect(blok).toMatch(/\.wiersz \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto;/);
    expect(blok).toMatch(/\.naglowki \{[^}]*clip-path: inset\(50%\);/);
  });

  it("pasek zaznaczenia jest przyklejony pod górną belką, a poniżej 640 px przyciski stoją jeden pod drugim", () => {
    const arkusz = css("PasekWyboru.module.css");
    expect(arkusz).toMatch(/\.pasek \{[^}]*position: sticky;[^}]*top: var\(--topbar-h\);[^}]*flex-wrap: wrap;/);
    expect(blokWaskiegoEkranu(arkusz)).toMatch(/\.akcje \{[^}]*flex-direction: column;[^}]*width: 100%;/);
  });
});

describe("Lista osób — kontrola dodatnia pomiarów", () => {
  it("szerokości: wartość ponad 288 px wykryta, mniejsza i komentarz nie", () => {
    expect(szerokosciPonad320(".a { min-width: 400px; }")).toHaveLength(1);
    expect(szerokosciPonad320(".a { width: 240px; } /* width: 900px; */")).toHaveLength(0);
    expect(szerokosciPonad320("@media (min-width: 640px) { .a { max-width: 900px; } }")).toHaveLength(0);
  });

  it("blok wąskiego ekranu: znaleziony razem z zagnieżdżeniem, brak bloku daje pusty napis", () => {
    expect(blokWaskiegoEkranu("@media (max-width: 639px) { .a { b: c; } } .d {}")).toBe(
      "@media (max-width: 639px) { .a { b: c; } }",
    );
    expect(blokWaskiegoEkranu(".a {}")).toBe("");
  });

  it("surowe elementy: próbka z naruszeniem jest wykryta, komentarz nie", () => {
    expect(suroweElementy('<div><button type="button">x</button><a href="/">y</a></div>')).toHaveLength(2);
    expect(suroweElementy("<input />")).toHaveLength(1);
    expect(suroweElementy("/* <button> w komentarzu */ <Button poziom='outline'>x</Button>")).toHaveLength(0);
  });

  it("onClick: element z małej litery liczony, atom z wielkiej nie", () => {
    expect(zdarzeniaNaSurowychElementach("<div onClick={() => f()}>x</div>")).toBe(1);
    expect(zdarzeniaNaSurowychElementach("<span\n  onClick={() => f()}>x</span>")).toBe(1);
    expect(zdarzeniaNaSurowychElementach("<Button poziom='outline' onClick={() => f()}>x</Button>")).toBe(0);
  });

  it("twarde kolory: zapis szesnastkowy i rgb wykryte, zmienna tokenu nie", () => {
    expect(twardeKolory(".a { color: #fff; }")).toHaveLength(1);
    expect(twardeKolory(".a { color: rgba(0, 0, 0, 0.5); }")).toHaveLength(1);
    expect(twardeKolory(".a { color: var(--text); }")).toHaveLength(0);
  });

  it("import z components/ wykryty", () => {
    expect(importyZKomponentow('import X from "@/components/ui/Table";')).toHaveLength(1);
    expect(importyZKomponentow('import X from "@/design-system/atomy/Button/Button";')).toHaveLength(0);
  });
});
