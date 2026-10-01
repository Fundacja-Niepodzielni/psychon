import { describe, expect, it } from "vitest";
import {
  ETYKIETA_FILTRA,
  ETYKIETA_RODZAJU,
  KOLEJNOSC_RODZAJOW,
  NAZWY_RODZAJOW,
  mapujDyzur,
  mapujProfil,
  mapujZgloszenie,
  porownajSprawy,
  sortujSprawy,
  znajdzNajstarszaSprawe,
  type PozycjaKolejki,
  type RodzajSprawy,
} from "../dane";

/**
 * Porządek kolejki spraw: jedna funkcja porównania (`porownajSprawy`) dla
 * listy ekranu i dla akcji „Otwórz najstarszą sprawę”. Kolejno: najstarsza
 * `czekaOd`, pozycje bez daty na końcu, remis — rodzaj, nazwisko po polsku,
 * `idLiczbowe`.
 */

function pozycja(
  rodzaj: RodzajSprawy,
  idLiczbowe: number,
  czekaOd: string,
  nazwisko = "Demo",
): PozycjaKolejki {
  return {
    id: `${rodzaj}-${idLiczbowe}`,
    idLiczbowe,
    rodzaj,
    tytul: `${rodzaj} ${nazwisko}`,
    osoba: `Osoba ${nazwisko}`,
    nazwisko,
    podpowiedz: "Czeka od —",
    czekaOd,
    href: `/sprawa/${rodzaj}/${idLiczbowe}`,
  };
}

const ID = (pozycje: PozycjaKolejki[]) => pozycje.map((p) => p.id);

describe("porządek kolejki — od najstarszej sprawy", () => {
  it.each<{ nazwa: string; wejscie: PozycjaKolejki[]; oczekiwane: string[] }>([
    {
      nazwa: "różne daty: od najstarszej, niezależnie od rodzaju i kolejności wejścia",
      wejscie: [
        pozycja("applications", 1, "2026-09-20T10:00:00Z"),
        pozycja("profiles", 2, "2026-09-01T10:00:00Z"),
        pozycja("internship_entries", 3, "2026-09-10T10:00:00Z"),
      ],
      oczekiwane: ["profiles-2", "internship_entries-3", "applications-1"],
    },
    {
      nazwa: "ta sama chwila, różne rodzaje: stała kolejność rodzajów",
      wejscie: [
        pozycja("profiles", 1, "2026-09-10T10:00:00Z"),
        pozycja("internship_entries", 1, "2026-09-10T10:00:00Z"),
        pozycja("applications", 1, "2026-09-10T10:00:00Z"),
      ],
      oczekiwane: ["applications-1", "internship_entries-1", "profiles-1"],
    },
    {
      nazwa: "ten sam rodzaj i chwila, różne nazwiska z polskimi literami: Lis < Łukasik < Żak",
      wejscie: [
        pozycja("applications", 1, "2026-09-10T10:00:00Z", "Żak"),
        pozycja("applications", 2, "2026-09-10T10:00:00Z", "Łukasik"),
        pozycja("applications", 3, "2026-09-10T10:00:00Z", "Lis"),
      ],
      oczekiwane: ["applications-3", "applications-2", "applications-1"],
    },
    {
      nazwa: "nazwisko: „Zawada” przed „Żak” (Ż po Z), „Łukasik” przed „Mazur”",
      wejscie: [
        pozycja("profiles", 1, "2026-09-10T10:00:00Z", "Żak"),
        pozycja("profiles", 2, "2026-09-10T10:00:00Z", "Mazur"),
        pozycja("profiles", 3, "2026-09-10T10:00:00Z", "Zawada"),
        pozycja("profiles", 4, "2026-09-10T10:00:00Z", "Łukasik"),
      ],
      oczekiwane: ["profiles-4", "profiles-2", "profiles-3", "profiles-1"],
    },
    {
      nazwa: "ta sama osoba (rodzaj, chwila, nazwisko), różne idLiczbowe: liczbowo, nie leksykalnie (5 < 20)",
      wejscie: [
        pozycja("internship_entries", 20, "2026-09-10T10:00:00Z", "Lis"),
        pozycja("internship_entries", 5, "2026-09-10T10:00:00Z", "Lis"),
        pozycja("internship_entries", 100, "2026-09-10T10:00:00Z", "Lis"),
      ],
      oczekiwane: ["internship_entries-5", "internship_entries-20", "internship_entries-100"],
    },
    {
      nazwa: "brak daty na końcu, także gdy jest innego rodzaju i wcześniejszy w kolejności rodzajów",
      wejscie: [
        pozycja("applications", 1, ""),
        pozycja("profiles", 2, "2026-09-10T10:00:00Z"),
        pozycja("internship_entries", 3, "nie-data"),
        pozycja("internship_entries", 4, "2026-09-20T10:00:00Z"),
      ],
      oczekiwane: ["profiles-2", "internship_entries-4", "applications-1", "internship_entries-3"],
    },
    {
      nazwa: "ta sama chwila w innym zapisie (strefa) to remis, nie różnica",
      wejscie: [
        pozycja("profiles", 1, "2026-09-10T12:00:00+02:00"),
        pozycja("applications", 2, "2026-09-10T10:00:00Z"),
      ],
      oczekiwane: ["applications-2", "profiles-1"],
    },
  ])("$nazwa", ({ wejscie, oczekiwane }) => {
    expect(ID(sortujSprawy(wejscie))).toEqual(oczekiwane);
    // Wynik nie zależy od kolejności wejścia (porządek jest całkowity i deterministyczny).
    expect(ID(sortujSprawy([...wejscie].reverse()))).toEqual(oczekiwane);
  });

  it("sortowanie nie zmienia tablicy wejściowej", () => {
    const wejscie = [pozycja("profiles", 1, "2026-09-10T10:00:00Z"), pozycja("applications", 2, "2026-09-01T10:00:00Z")];
    const kopia = [...wejscie];
    sortujSprawy(wejscie);
    expect(wejscie).toEqual(kopia);
  });

  it("pierwsza pozycja listy jest celem „Otwórz najstarszą sprawę” — ta sama funkcja porównania", () => {
    const wejscie = [
      pozycja("profiles", 1, "2026-09-10T10:00:00Z", "Żak"),
      pozycja("applications", 9, "2026-09-10T10:00:00Z", "Łukasik"),
      pozycja("applications", 4, "2026-09-10T10:00:00Z", "Lis"),
      pozycja("internship_entries", 2, ""),
    ];
    expect(znajdzNajstarszaSprawe(wejscie)?.id).toBe(sortujSprawy(wejscie)[0].id);
    expect(znajdzNajstarszaSprawe(wejscie)?.id).toBe("applications-4");
  });

  it("porownajSprawy: znak wyniku zgodny z porządkiem, 0 tylko dla tej samej pozycji", () => {
    const a = pozycja("applications", 1, "2026-09-01T10:00:00Z");
    const b = pozycja("applications", 2, "2026-09-01T10:00:00Z");
    expect(porownajSprawy(a, b)).toBeLessThan(0);
    expect(porownajSprawy(b, a)).toBeGreaterThan(0);
    expect(porownajSprawy(a, a)).toBe(0);
  });
});

describe("nazwy rodzajów spraw — jeden słownik", () => {
  it.each<{ rodzaj: RodzajSprawy; wiersz: string; filtr: string }>([
    { rodzaj: "applications", wiersz: "Zgłoszenie rekrutacyjne", filtr: "Zgłoszenia rekrutacyjne" },
    { rodzaj: "profiles", wiersz: "Wniosek o profil psychologa", filtr: "Wnioski o profil psychologa" },
    { rodzaj: "internship_entries", wiersz: "Dyżur", filtr: "Dyżury" },
  ])("$rodzaj: wiersz „$wiersz”, filtr „$filtr”", ({ rodzaj, wiersz, filtr }) => {
    expect(NAZWY_RODZAJOW[rodzaj]).toEqual({ wiersz, filtr });
    expect(ETYKIETA_RODZAJU[rodzaj]).toBe(wiersz);
    expect(ETYKIETA_FILTRA[rodzaj]).toBe(filtr);
  });

  it("słownik obejmuje dokładnie rodzaje z kolejki, a pozycje niosą nazwę wiersza w pełnej nazwie sprawy", () => {
    expect(Object.keys(NAZWY_RODZAJOW).sort()).toEqual([...KOLEJNOSC_RODZAJOW].sort());
    expect(mapujZgloszenie({ id: 1, first_name: "Marta", last_name: "Demo", created_at: null }).tytul).toBe(
      "Zgłoszenie rekrutacyjne — Marta Demo",
    );
    expect(mapujProfil({ id: 1, created_at: null, user: { id: 2, first_name: "Joanna", last_name: "Lis" } }).tytul).toBe(
      "Wniosek o profil psychologa — Joanna Lis",
    );
    expect(mapujDyzur({ id: 1, created_at: null, user: { id: 2, first_name: "Filip", last_name: "Żak" } }).tytul).toBe(
      "Dyżur — Filip Żak",
    );
  });

  it("nazwisko pozycji pochodzi z `last_name` źródła", () => {
    expect(mapujZgloszenie({ id: 1, first_name: "Marta", last_name: "Łukasik", created_at: null }).nazwisko).toBe("Łukasik");
    expect(mapujDyzur({ id: 1, created_at: null, user: { id: 2, first_name: "A", last_name: "Żak" } }).nazwisko).toBe("Żak");
    expect(mapujProfil({ id: 1, created_at: null, user: { id: 2, first_name: "A", last_name: "Lis" } }).nazwisko).toBe("Lis");
  });
});
