import { describe, expect, it } from "vitest";
import { znajdzNajstarszaSprawe, type PozycjaKolejki } from "../dane";

function pozycja(overrides: Partial<PozycjaKolejki> & Pick<PozycjaKolejki, "id" | "rodzaj">): PozycjaKolejki {
  // `idLiczbowe` domyślnie wyprowadzone z liczbowego przyrostka `id`
  // (np. "applications-20" -> 20) — dokładnie tak, jak robią to prawdziwe
  // funkcje mapujące w `../dane.ts`.
  const domyslneIdLiczbowe = Number(overrides.id.split("-").pop());
  return {
    idLiczbowe: domyslneIdLiczbowe,
    tytul: `Sprawa ${overrides.id}`,
    osoba: "Osoba Demo",
    podpowiedz: "Czeka od —",
    czekaOd: "",
    href: `/sprawa/${overrides.id}`,
    ...overrides,
  };
}

describe("znajdzNajstarszaSprawe", () => {
  it("wszystkie źródła puste -> brak akcji (null)", () => {
    expect(znajdzNajstarszaSprawe([])).toBeNull();
  });

  it.each<{ nazwa: string; pozycje: PozycjaKolejki[]; oczekiwaneId: string }>([
    {
      nazwa: "applications najstarsze",
      pozycje: [
        pozycja({ id: "applications-1", rodzaj: "applications", czekaOd: "2026-01-01T00:00:00Z" }),
        // dystraktory: wcześniejsze na liście, ale młodsze daty — pozycja
        // wygrywa datą, nie kolejnością wejścia.
        pozycja({ id: "internship_entries-9", rodzaj: "internship_entries", czekaOd: "2026-06-01T00:00:00Z" }),
        pozycja({ id: "profiles-9", rodzaj: "profiles", czekaOd: "2026-06-01T00:00:00Z" }),
      ],
      oczekiwaneId: "applications-1",
    },
    {
      nazwa: "internship_entries najstarsze",
      pozycje: [
        pozycja({ id: "applications-9", rodzaj: "applications", czekaOd: "2026-06-01T00:00:00Z" }),
        pozycja({ id: "internship_entries-2", rodzaj: "internship_entries", czekaOd: "2026-01-01T00:00:00Z" }),
        pozycja({ id: "profiles-9", rodzaj: "profiles", czekaOd: "2026-06-01T00:00:00Z" }),
      ],
      oczekiwaneId: "internship_entries-2",
    },
    {
      nazwa: "profiles najstarsze",
      pozycje: [
        pozycja({ id: "applications-9", rodzaj: "applications", czekaOd: "2026-06-01T00:00:00Z" }),
        pozycja({ id: "internship_entries-9", rodzaj: "internship_entries", czekaOd: "2026-06-01T00:00:00Z" }),
        pozycja({ id: "profiles-3", rodzaj: "profiles", czekaOd: "2026-01-01T00:00:00Z" }),
      ],
      oczekiwaneId: "profiles-3",
    },
    {
      // Remis na tej samej chwili: rozstrzyga stała kolejność rodzajów
      // (applications < internship_entries < profiles), NIE kolejność wejścia
      // do tablicy — profile stoi PIERWSZY na liście wejściowej i mimo to
      // przegrywa z applications, co jest kontrolą dodatnią tej reguły.
      nazwa: "remis tej samej chwili -> wygrywa stała kolejność rodzajów",
      pozycje: [
        pozycja({ id: "profiles-1", rodzaj: "profiles", czekaOd: "2026-03-01T00:00:00Z" }),
        pozycja({ id: "internship_entries-1", rodzaj: "internship_entries", czekaOd: "2026-03-01T00:00:00Z" }),
        pozycja({ id: "applications-1", rodzaj: "applications", czekaOd: "2026-03-01T00:00:00Z" }),
      ],
      oczekiwaneId: "applications-1",
    },
    {
      // Remis tej samej chwili I tego samego rodzaju: rozstrzyga `id` rosnąco.
      nazwa: "remis tej samej chwili i rodzaju -> wygrywa niższe id",
      pozycje: [
        pozycja({ id: "applications-20", rodzaj: "applications", czekaOd: "2026-03-01T00:00:00Z" }),
        pozycja({ id: "applications-5", rodzaj: "applications", czekaOd: "2026-03-01T00:00:00Z" }),
      ],
      oczekiwaneId: "applications-5",
    },
    {
      // Jedno źródło puste (brak pozycji `internship_entries` w ogóle) —
      // funkcja liczy z pozostałych, bez specjalnego przypadku.
      nazwa: "jedno źródło puste -> liczone z pozostałych dwóch",
      pozycje: [
        pozycja({ id: "applications-1", rodzaj: "applications", czekaOd: "2026-05-01T00:00:00Z" }),
        pozycja({ id: "profiles-1", rodzaj: "profiles", czekaOd: "2026-02-01T00:00:00Z" }),
      ],
      oczekiwaneId: "profiles-1",
    },
    {
      // Pozycja bez daty źródłowej nigdy nie wygrywa, dopóki istnieje choć
      // jedna pozycja z datą.
      nazwa: "pozycja bez daty przegrywa z pozycją z datą",
      pozycje: [
        pozycja({ id: "applications-1", rodzaj: "applications", czekaOd: "" }),
        pozycja({ id: "profiles-1", rodzaj: "profiles", czekaOd: "2026-09-01T00:00:00Z" }),
      ],
      oczekiwaneId: "profiles-1",
    },
  ])("$nazwa", ({ pozycje: wejscie, oczekiwaneId }) => {
    expect(znajdzNajstarszaSprawe(wejscie)?.id).toBe(oczekiwaneId);
  });

  it("wszystkie pozycje bez daty -> remis rozstrzyga stała kolejność rodzajów (kontrola dodatnia)", () => {
    const wynik = znajdzNajstarszaSprawe([
      pozycja({ id: "profiles-1", rodzaj: "profiles", czekaOd: "" }),
      pozycja({ id: "applications-1", rodzaj: "applications", czekaOd: "" }),
      pozycja({ id: "internship_entries-1", rodzaj: "internship_entries", czekaOd: "" }),
    ]);
    expect(wynik?.id).toBe("applications-1");
  });
});
