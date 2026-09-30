import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { czytaj, naruszenia, plikiEkranu } from "./skaner-zrodel";

/** Korzeń `frontend/` — vitest uruchamia się z tego katalogu. */
const KORZEN = process.cwd();
const PLIKI = [
  ...plikiEkranu(join(KORZEN, "nowy-front/nowa-osoba")),
  join(KORZEN, "app/nowy-front/admin/osoby/nowa/page.tsx"),
];

describe("Nowa osoba — źródła ekranu", () => {
  it("pomiar nie jest pusty: są pliki ekranu i strona", () => {
    expect(PLIKI.length).toBeGreaterThanOrEqual(3);
  });

  it("żaden plik ekranu nie niesie surowego elementu, onClick na DOM, twardego koloru, importu z components/, dangerouslySetInnerHTML ani zakazanego tekstu odmowy", () => {
    const trafienia = PLIKI.flatMap((plik) => naruszenia(czytaj(plik)).map((powod) => `${plik}: ${powod}`));
    expect(trafienia).toEqual([]);
  });

  it("kontrola dodatnia: skaner widzi każde naruszenie na próbce", () => {
    const probki: Record<string, string> = {
      "surowy element DOM": "<button>x</button>",
      "onClick na surowym elemencie": "<div onClick={f}>x</div>",
      "twardy kolor": "a { color: #ff0000; }",
      "import z components/": 'import X from "@/components/ui/Button";',
      dangerouslySetInnerHTML: "<Tekst dangerouslySetInnerHTML={x} />",
      "zakazany tekst odmowy": "Brak dostępu do ekranu",
    };
    for (const [powod, probka] of Object.entries(probki)) {
      expect(naruszenia(probka)).toContain(powod);
    }
    expect(naruszenia('<Button poziom="outline" onClick={f}>x</Button>')).toEqual([]);
  });

  it("kody ról nie trafiają do tekstów komponentu — tylko etykiety z lib/h18/labels.ts", () => {
    const komponent = czytaj(join(KORZEN, "nowy-front/nowa-osoba/NowaOsoba.tsx"));
    expect(komponent).not.toMatch(/["'`](super_admin|project_manager|instructor|volunteer|student)["'`]/);
    const dane = czytaj(join(KORZEN, "nowy-front/nowa-osoba/dane.ts"));
    expect(dane).toMatch(/import \{ ROLE_LABELS \} from "@\/lib\/h18\/labels";/);
  });

  it("ekran nie ma własnego znacznika main — jedyny main to korzeń szablonu", () => {
    const wzorzec = new RegExp("<" + "main\\b");
    expect(PLIKI.filter((plik) => wzorzec.test(czytaj(plik)))).toEqual([]);
    expect(czytaj(join(KORZEN, "nowy-front/nowa-osoba/NowaOsoba.tsx"))).toMatch(
      /import \{ FormTemplate \} from "@\/design-system\/szablony\/FormTemplate\/FormTemplate";/,
    );
  });
});
