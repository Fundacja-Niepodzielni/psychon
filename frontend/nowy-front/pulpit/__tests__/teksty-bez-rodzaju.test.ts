import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Teksty pulpitów (uczestnika, prowadzącego, administracji) i strony lekcji nie
 * zwracają się do osoby formą z rodzajem gramatycznym („zatrzymałaś się”,
 * „ukończyłeś”). Próba czyta źródła ekranów (bez komentarzy) i szuka czasu
 * przeszłego w drugiej osobie z końcówką rodzajową oraz dawnego zdania
 * „zatrzymałaś się na …”. Kontrola dodatnia: wzorzec łapie obie formy.
 */

const KORZEN = join(process.cwd(), "nowy-front");
const KATALOGI = ["pulpit", "pulpit-administracji", "pulpit-prowadzacego", "lekcja"];

const FORMA_RODZAJOWA = /\p{L}+(łaś|łeś)(?![\p{L}])|zatrzymał(a|e)ś/iu;

function bezKomentarzy(zrodlo: string): string {
  return zrodlo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function pliki(katalog: string): string[] {
  return readdirSync(katalog, { withFileTypes: true }).flatMap((wpis) => {
    const sciezka = join(katalog, wpis.name);
    if (wpis.isDirectory()) return wpis.name === "__tests__" ? [] : pliki(sciezka);
    return /\.(ts|tsx)$/.test(wpis.name) ? [sciezka] : [];
  });
}

describe("teksty ekranów bez formy rodzajowej", () => {
  it("kontrola dodatnia: wzorzec łapie „zatrzymałaś się” i „ukończyłeś”, nie łapie form bezosobowych", () => {
    expect(FORMA_RODZAJOWA.test("Zatrzymałaś się na 12. minucie")).toBe(true);
    expect(FORMA_RODZAJOWA.test("Ukończyłeś lekcję")).toBe(true);
    expect(FORMA_RODZAJOWA.test("Ostatnio zatrzymano w 12. minucie.")).toBe(false);
    expect(FORMA_RODZAJOWA.test("Możesz zaznaczyć lekcję jako ukończoną.")).toBe(false);
    expect(FORMA_RODZAJOWA.test("obejrzane 12 z 20 minut")).toBe(false);
  });

  it("źródła pulpitów i lekcji nie zawierają formy z rodzajem", () => {
    const wszystkie = KATALOGI.flatMap((katalog) => pliki(join(KORZEN, katalog)));
    expect(wszystkie.length).toBeGreaterThan(20);
    const trafienia = wszystkie.flatMap((plik) => {
      const tresc = bezKomentarzy(readFileSync(plik, "utf-8"));
      const trafienie = FORMA_RODZAJOWA.exec(tresc);
      return trafienie ? [`${plik}: ${trafienie[0]}`] : [];
    });
    expect(trafienia).toEqual([]);
  });
});
