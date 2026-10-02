import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const ZMIENNA = "NEXT_PUBLIC_VIDEO_PLAYER_ORIGIN";
const NADPISANE = "https://odtwarzacz.atrapa.test";

async function wczytaj(nadpisanie?: string) {
  vi.resetModules();
  if (nadpisanie === undefined) vi.stubEnv(ZMIENNA, undefined);
  else vi.stubEnv(ZMIENNA, nadpisanie);
  const konfiguracja = await import("../odtwarzacz-nagran");
  const next = (await import("../../../next.config")).default;
  const naglowki = await next.headers!();
  return { konfiguracja, naglowki };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("dozwolone pochodzenie odtwarzacza", () => {
  it("wartość domyślna jest pochodzeniem https bez ścieżki i nie zależy od konta", async () => {
    const { konfiguracja } = await wczytaj();
    const pochodzenie = konfiguracja.POCHODZENIE_ODTWARZACZA;

    expect(pochodzenie).toMatch(/^https:\/\/[a-z0-9.-]+$/);
    expect(new URL(pochodzenie).origin).toBe(pochodzenie);
    expect(pochodzenie).not.toMatch(/\d/);
  });

  it("nadpisanie zmienną konfiguracji budowy zmienia stałą", async () => {
    const { konfiguracja } = await wczytaj(NADPISANE);
    expect(konfiguracja.POCHODZENIE_ODTWARZACZA).toBe(NADPISANE);
  });

  it.each([
    ["ze ścieżką", "https://odtwarzacz.atrapa.test/embed"],
    ["z zapytaniem", "https://odtwarzacz.atrapa.test/?a=1"],
    ["z danymi logowania", "https://ktos:haslo@odtwarzacz.atrapa.test"],
    ["http poza pętlą zwrotną", "http://odtwarzacz.atrapa.test"],
    ["znak wieloznaczny", "https://*.atrapa.test"],
    ["sam znak wieloznaczny", "*"],
    ["dwa pochodzenia", "https://a.atrapa.test https://b.atrapa.test"],
    ["średnik dyrektywy", "https://a.atrapa.test; script-src *"],
    ["schemat danych", "data:"],
    ["schemat blob", "blob:"],
    ["sam schemat", "https:"],
    ["pusta", ""],
    ["nie adres", "odtwarzacz"],
  ])("błędne nadpisanie (%s) niczego nie poszerza: zostaje wartość domyślna", async (_opis, wartosc) => {
    const domyslna = (await wczytaj()).konfiguracja.POCHODZENIE_ODTWARZACZA;
    const { konfiguracja, naglowki } = await wczytaj(wartosc);

    expect(konfiguracja.pochodzenieZWartosci(wartosc)).toBeNull();
    expect(konfiguracja.POCHODZENIE_ODTWARZACZA).toBe(domyslna);
    expect(naglowki[0].headers[0].value).toBe(konfiguracja.dyrektywaRamek(domyslna));
  });

  it("nadpisanie przyjmuje samo pochodzenie, także z końcowym ukośnikiem i dla pętli zwrotnej", async () => {
    const { konfiguracja } = await wczytaj();
    expect(konfiguracja.pochodzenieZWartosci("https://odtwarzacz.atrapa.test/")).toBe(NADPISANE);
    expect(konfiguracja.pochodzenieZWartosci(" https://odtwarzacz.atrapa.test ")).toBe(NADPISANE);
    expect(konfiguracja.pochodzenieZWartosci("https://odtwarzacz.atrapa.test:8443")).toBe(`${NADPISANE}:8443`);
    expect(konfiguracja.pochodzenieZWartosci("http://127.0.0.1:10751")).toBe("http://127.0.0.1:10751");
    expect(konfiguracja.pochodzenieZWartosci("http://localhost:10751")).toBe("http://localhost:10751");
  });
});

describe("nagłówek ograniczający ramki", () => {
  it.each([
    ["wartość domyślna", undefined],
    ["wartość nadpisana", NADPISANE],
  ])("dyrektywa i sprawdzenie pochodzenia czytają tę samą stałą — %s", async (_opis, nadpisanie) => {
    const { konfiguracja, naglowki } = await wczytaj(nadpisanie);
    const pochodzenie = konfiguracja.POCHODZENIE_ODTWARZACZA;

    expect(naglowki).toHaveLength(1);
    expect(naglowki[0].source).toBe("/:path*");
    expect(naglowki[0].headers).toEqual([
      {
        key: "Content-Security-Policy",
        value: `frame-src 'self' ${pochodzenie} https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com`,
      },
    ]);
    // Adres ramki przechodzi dokładnie dla pochodzenia z dyrektywy.
    expect(konfiguracja.adresRamkiOdtwarzacza(`${pochodzenie}/embed/1?token=a`)?.origin).toBe(pochodzenie);
    expect(konfiguracja.adresRamkiOdtwarzacza("https://obcy.example/embed/1")).toBeNull();
  });

  it("nagłówek niesie wyłącznie dyrektywę ramek, bez znaków wieloznacznych i schematów blob/data", async () => {
    const { naglowki } = await wczytaj();
    const wartosc = naglowki[0].headers[0].value;

    expect(wartosc.startsWith("frame-src ")).toBe(true);
    expect(wartosc).not.toContain(";");
    expect(wartosc).not.toContain("*");
    expect(wartosc).not.toMatch(/\b(blob|data|http):/);
    expect(wartosc.split(" ").filter((czesc) => czesc === "'self'")).toHaveLength(1);
  });
});

describe("jedno miejsce z hostem odtwarzacza", () => {
  it("organizm i konfiguracja budowy nie niosą własnej kopii hosta ani gwiazdki jako celu komunikatu", async () => {
    const { konfiguracja } = await wczytaj();
    const host = new URL(konfiguracja.POCHODZENIE_ODTWARZACZA).host;
    const korzen = join(__dirname, "..", "..", "..");
    const organizm = join(korzen, "design-system", "organizmy", "RecordingPlayer");
    const pliki = [
      join(korzen, "next.config.ts"),
      ...readdirSync(organizm)
        .filter((nazwa) => /\.(ts|tsx)$/.test(nazwa))
        .map((nazwa) => join(organizm, nazwa)),
    ];

    expect(pliki.length).toBeGreaterThanOrEqual(4);
    for (const plik of pliki) {
      const tresc = readFileSync(plik, "utf8");
      expect(tresc, plik).not.toContain(host);
      expect(tresc, plik).not.toMatch(/postMessage\([^)]*["'`]\*["'`]/);
    }
    const komponent = readFileSync(join(organizm, "RecordingPlayer.tsx"), "utf8");
    expect(komponent.match(/postMessage\(/g)).toHaveLength(1);
    expect(komponent).toContain("postMessage(komunikat, POCHODZENIE_ODTWARZACZA)");
    expect(komponent).toContain("zdarzenie.origin !== POCHODZENIE_ODTWARZACZA");
  });
});

describe("host ramki odtwarzacza zgadza się w trzech miejscach", () => {
  const PLIK_ZAPLECZA = join(__dirname, "..", "..", "..", "..", "backend", "app", "Services", "Video", "VideoTokenService.php");

  /** Host z adresu ramki, który wydaje zaplecze: stała klasy czytana jako tekst. */
  function hostZaplecza(): string {
    const trafienia = [...readFileSync(PLIK_ZAPLECZA, "utf8").matchAll(/const\s+string\s+EMBED_HOST\s*=\s*'([^']+)'\s*;/g)];
    expect(trafienia, "jedna stała EMBED_HOST w usłudze adresów nagrań").toHaveLength(1);
    return trafienia[0][1];
  }

  it("stała zaplecza, stała frontu i wpis frame-src w konfiguracji budowy wskazują ten sam host", async () => {
    const { konfiguracja, naglowki } = await wczytaj();
    const hostFrontu = new URL(konfiguracja.POCHODZENIE_ODTWARZACZA).host;
    const wartosc = naglowki[0].headers[0].value;
    const wpisy = wartosc.replace(/^frame-src\s+/, "").split(/\s+/);

    expect(hostZaplecza()).toBe(hostFrontu);
    expect(wpisy).toContain(`https://${hostZaplecza()}`);
  });

  it("host zaplecza jest samym hostem, bez schematu, portu i ścieżki", () => {
    expect(hostZaplecza()).toMatch(/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/);
  });
});
