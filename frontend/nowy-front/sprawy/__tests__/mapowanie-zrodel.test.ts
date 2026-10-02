import { describe, expect, it } from "vitest";
import { mapujProfil, mapujDyzur, mapujZgloszenie, type PozycjaKolejki } from "../dane";

/**
 * Mapowanie każdego z trzech źródeł na jednolity element kolejki
 * (`PozycjaKolejki`) — jeden wiersz tabeli na źródło. Atrapy wejściowe mają
 * dokładnie pola, które faktycznie zwraca zasób zaplecza (patrz komentarz w
 * `../dane.ts` przy każdej funkcji mapującej — `openapi.json` nie wyprowadza
 * tu typu).
 */
describe("mapowanie źródeł na jednolity element kolejki", () => {
  it.each<{
    zrodlo: string;
    zmapuj: () => PozycjaKolejki;
    oczekiwane: Partial<PozycjaKolejki>;
  }>([
    {
      zrodlo: "applications (H03)",
      zmapuj: () =>
        mapujZgloszenie({ id: 44, first_name: "Marta", last_name: "Demo", created_at: "2026-08-01T10:00:00Z" }),
      oczekiwane: {
        id: "applications-44",
        rodzaj: "applications",
        tytul: "Zgłoszenie rekrutacyjne — Marta Demo",
        osoba: "Marta Demo",
        nazwisko: "Demo",
        czekaOd: "2026-08-01T10:00:00Z",
        href: "/admin/nabor/44",
      },
    },
    {
      zrodlo: "internship_entries (H11)",
      zmapuj: () =>
        mapujDyzur({
          id: 91,
          created_at: "2026-08-27T18:00:00Z",
          user: { id: 17, first_name: "Filip", last_name: "Demo" },
        }),
      oczekiwane: {
        id: "internship_entries-91",
        rodzaj: "internship_entries",
        tytul: "Dyżur — Filip Demo",
        osoba: "Filip Demo",
        nazwisko: "Demo",
        czekaOd: "2026-08-27T18:00:00Z",
        href: "/admin/staz?dyzur=91",
      },
    },
    {
      zrodlo: "profiles (H15)",
      zmapuj: () =>
        mapujProfil({
          id: 6,
          created_at: "2026-07-15T09:00:00Z",
          user: { id: 22, first_name: "Joanna", last_name: "Demo" },
        }),
      oczekiwane: {
        id: "profiles-6",
        rodzaj: "profiles",
        tytul: "Wniosek o profil psychologa — Joanna Demo",
        osoba: "Joanna Demo",
        nazwisko: "Demo",
        czekaOd: "2026-07-15T09:00:00Z",
        href: "/admin/profile/6",
      },
    },
  ])("$zrodlo -> jednolity element kolejki", ({ zmapuj, oczekiwane }) => {
    const wynik = zmapuj();
    expect(wynik).toMatchObject(oczekiwane);
    expect(wynik.podpowiedz).toMatch(/^Czeka od /);
  });

  it("brak daty źródłowej (created_at null) -> czekaOd pusty string, nigdy null/undefined (kontrola dodatnia)", () => {
    const wynik = mapujDyzur({ id: 1, created_at: null, user: { id: 1, first_name: "A", last_name: "B" } });
    expect(wynik.czekaOd).toBe("");
    expect(wynik.podpowiedz).toBe("Czeka od —");
  });
});
