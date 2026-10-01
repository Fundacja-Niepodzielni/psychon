import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CourseTree, type TematCourseTree } from "../CourseTree";

/**
 * Drzewo kursu BEZ właściwości `onEdytujLekcje` i `rozwiniecie` ma dawać ten
 * sam DOM co przed ich dodaniem. Plik `zapis-bez-nowych-wlasciwosci.json` to
 * `innerHTML` siedmiu scen zapisany na wersji organizmu sprzed zmiany — tymi
 * samymi scenami i tą samą funkcją co niżej. Próba rysuje sceny na bieżącym
 * kodzie i porównuje znak w znak (nazwy klas bez skrótu pliku stylów).
 * Zapis odświeża się wyłącznie świadomie, razem ze zmianą wyglądu organizmu.
 */

const TEMATY: TematCourseTree[] = [
  {
    id: "t1",
    tytul: "Wprowadzenie",
    lekcje: [
      { id: "l1", tytul: "Powitanie", czasMin: 12 },
      { id: "l2", tytul: "Zasady programu", czasMin: 18 },
      { id: "l3", tytul: "Pierwsze zadanie", czasMin: 20 },
    ],
  },
  {
    id: "t2",
    tytul: "Wywiad psychologiczny",
    lekcje: [
      { id: "l4", tytul: "Struktura wywiadu", czasMin: 25 },
      { id: "l5", tytul: "Pytania trudne", czasMin: 30 },
    ],
  },
  { id: "t3", tytul: "Podsumowanie", lekcje: [] },
];

const ZMIENIONE: TematCourseTree[] = TEMATY.map((temat) => ({
  ...temat,
  lekcje: temat.lekcje.map((lekcja) => (lekcja.id === "l2" || lekcja.id === "l4" ? { ...lekcja, zmieniona: true } : lekcja)),
}));

const nic = () => {};
const AKCJE = {
  onPrzenies: nic,
  onDodajLekcje: nic,
  onZmienTytulLekcji: nic,
  onZapisz: nic,
  onCofnij: nic,
  onPorzucWszystko: nic,
  pusty: { naglowek: "Kurs nie ma tematów", tresc: "Dodaj pierwszy temat.", przycisk: { etykieta: "Dodaj temat", onClick: nic } },
};

/** Nazwy klas modułów CSS niosą skrót pliku stylów — zapis porównuje nazwy bez skrótu. */
function bezSkrotowKlas(html: string): string {
  return html.replace(/_([A-Za-z][A-Za-z0-9-]*)_[a-z0-9]{5,8}(?=[\s"])/g, "$1");
}

async function sceny(): Promise<Record<string, string>> {
  const wynik: Record<string, string> = {};
  function zapisz(nazwa: string, wezel: ReactElement) {
    const { container, unmount } = render(wezel);
    wynik[nazwa] = bezSkrotowKlas(container.innerHTML);
    unmount();
  }
  zapisz("rozwiniete", <CourseTree {...AKCJE} tematy={TEMATY} liczbaZmian={0} />);
  zapisz("zmienione", <CourseTree {...AKCJE} tematy={ZMIENIONE} liczbaZmian={2} />);
  zapisz("zwiniety", <CourseTree {...AKCJE} tematy={TEMATY} liczbaZmian={0} poczatkowoZwiniete={["t1"]} />);
  zapisz("kolejnosc", <CourseTree {...AKCJE} tematy={TEMATY} liczbaZmian={0} poczatkowoTrybKolejnosci />);
  zapisz(
    "przeciagany",
    <CourseTree
      {...AKCJE}
      tematy={TEMATY}
      liczbaZmian={0}
      poczatkowePrzeciaganie={{ lekcja: "l2", celTemat: "t2", celIndeks: 1 }}
    />,
  );
  zapisz("pusty", <CourseTree {...AKCJE} tematy={[]} liczbaZmian={0} />);

  const { container, unmount } = render(<CourseTree {...AKCJE} tematy={TEMATY} liczbaZmian={0} />);
  await userEvent.click(screen.getAllByRole("button", { name: "Zmień nazwę" })[1]);
  wynik["zmiana-nazwy"] = bezSkrotowKlas(container.innerHTML);
  unmount();
  return wynik;
}

const ZAPIS = JSON.parse(
  readFileSync(join(process.cwd(), "design-system/organizmy/CourseTree/__tests__/zapis-bez-nowych-wlasciwosci.json"), "utf8"),
) as Record<string, string>;

describe("CourseTree bez nowych właściwości — DOM jak przed zmianą", () => {
  it("siedem scen daje znak w znak zapisany DOM", async () => {
    const teraz = await sceny();
    expect(Object.keys(teraz).sort()).toEqual(Object.keys(ZAPIS).sort());
    for (const nazwa of Object.keys(ZAPIS)) {
      expect(teraz[nazwa], `scena „${nazwa}”`).toBe(ZAPIS[nazwa]);
    }
  });

  it("zapis nie jest pusty i nie zna nowych znaczników", () => {
    expect(Object.keys(ZAPIS)).toHaveLength(7);
    for (const html of Object.values(ZAPIS)) {
      expect(html.length).toBeGreaterThan(100);
      expect(html).not.toMatch(/data-edytuj-lekcje|data-rozwiniecie-lekcji/);
    }
    expect(ZAPIS.rozwiniete).toContain("Zmień nazwę");
  });
});
