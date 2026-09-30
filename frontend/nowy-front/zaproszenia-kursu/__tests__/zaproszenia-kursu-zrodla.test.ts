import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { czytaj, naruszenia, plikiEkranu } from "./skaner-zrodel";

/** Korzeń `frontend/` — vitest uruchamia się z tego katalogu. */
const KORZEN = process.cwd();
const PLIKI = [
  ...plikiEkranu(join(KORZEN, "nowy-front/zaproszenia-kursu")),
  join(KORZEN, "app/nowy-front/admin/kursy/[id]/zaproszenia/page.tsx"),
];

describe("Zaproszenia na kurs — źródła ekranu", () => {
  it("pomiar nie jest pusty: są pliki ekranu, styl i strona", () => {
    expect(PLIKI.length).toBeGreaterThanOrEqual(4);
  });

  it("żaden plik ekranu nie niesie surowego elementu, onClick na DOM, twardego koloru, importu z components/, dangerouslySetInnerHTML ani zakazanego tekstu odmowy", () => {
    const trafienia = PLIKI.flatMap((plik) => naruszenia(czytaj(plik)).map((powod) => `${plik}: ${powod}`));
    expect(trafienia).toEqual([]);
  });

  it("kontrola dodatnia: skaner widzi każde naruszenie na próbce", () => {
    const probki: Record<string, string> = {
      "surowy element DOM": "<input type='checkbox' />",
      "onClick na surowym elemencie": "<span onClick={f}>x</span>",
      "twardy kolor": "a { color: rgb(1, 2, 3); }",
      "import z components/": 'import X from "../../components/ui/Card";',
      dangerouslySetInnerHTML: "<Tekst dangerouslySetInnerHTML={x} />",
      "zakazany tekst odmowy": "Nie masz uprawnień",
    };
    for (const [powod, probka] of Object.entries(probki)) {
      expect(naruszenia(probka)).toContain(powod);
    }
    expect(naruszenia('<Link href="#tresc" onClick={f}>x</Link>')).toEqual([]);
  });

  it("teksty ekranu nie używają zakazanych synonimów ze słownika", () => {
    const tresc = PLIKI.filter((plik) => /\.tsx?$/.test(plik))
      .map((plik) => czytaj(plik))
      .join("\n")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const literaly = [...tresc.matchAll(/"([^"\\\n]*)"|`([^`]*)`/g)].map((dopasowanie) => dopasowanie[1] ?? dopasowanie[2]);
    // Kod typu kursu z zaplecza ("webinar") to wartość, nie tekst dla osoby.
    const zakazane = literaly.filter((literal) => literal !== "webinar" && /webinar|slug|ścieżk/i.test(literal));
    expect(zakazane).toEqual([]);
    expect(literaly.length).toBeGreaterThan(20);
  });

  it("kontrola dodatnia: wzorzec synonimów łapie zakazane słowa w literałach", () => {
    const probka = 'const a = "Zaproś na webinar"; const b = `ścieżka kursów`;';
    const literaly = [...probka.matchAll(/"([^"\\\n]*)"|`([^`]*)`/g)].map((dopasowanie) => dopasowanie[1] ?? dopasowanie[2]);
    expect(literaly.filter((literal) => /webinar|slug|ścieżk/i.test(literal))).toHaveLength(2);
  });

  it("ekran nie ma własnego znacznika main — jedyny main to korzeń szablonu", () => {
    const wzorzec = new RegExp("<" + "main\\b");
    expect(PLIKI.filter((plik) => wzorzec.test(czytaj(plik)))).toEqual([]);
    expect(czytaj(join(KORZEN, "nowy-front/zaproszenia-kursu/ZaproszeniaKursu.tsx"))).toMatch(
      /import \{ FormTemplate \} from "@\/design-system\/szablony\/FormTemplate\/FormTemplate";/,
    );
  });
});
