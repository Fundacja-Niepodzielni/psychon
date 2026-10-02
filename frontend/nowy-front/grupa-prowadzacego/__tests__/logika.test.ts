import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/klient";
import { DOMYSLNY_TERMIN, PUSTA_SPRAWA } from "../dane";
import {
  bladPola,
  bledyPolZOdpowiedzi,
  filtrujOsoby,
  komunikatBledu,
  licznikZnakow,
  obecnoscOsoby,
  opisTerminu,
  posortujTerminy,
  powodBrakuSprawy,
  powodBrakuTerminu,
  sprawaZmieniona,
  terminZmieniony,
  tytulTerminu,
  wartosciObecnosci,
  wierszeOsob,
  wierszeRzetelnosci,
  zdanieOObecnosci,
  zdanieOLiczbieOsob,
  zdanieOWolnychMiejscach,
  zdanieOWynikachFiltru,
} from "../logika";
import { GRUPA, MARTA, RZETELNOSC, TERMIN_PRZYSZLY, TERMIN_PUSTY, TERMIN_ZAKONCZONY } from "./atrapy";

/**
 * Teksty i reguły ekranu: odmiana liczebników (1 · 2–4 · 5+ · 12–14 · 22), słowa o postępie takie same jak na
 * pulpicie prowadzącego, filtr po nazwisku, obecności i powody niedostępności przycisków.
 */

describe("odmiana po liczbie", () => {
  it.each([
    [0, "0 osób w grupie"],
    [1, "1 osoba w grupie"],
    [2, "2 osoby w grupie"],
    [5, "5 osób w grupie"],
    [12, "12 osób w grupie"],
    [22, "22 osoby w grupie"],
  ])("liczba osób: %i", (liczba, zdanie) => {
    expect(zdanieOLiczbieOsob(liczba)).toBe(zdanie);
  });

  it.each([
    [0, "0 wolnych miejsc"],
    [1, "1 wolne miejsce"],
    [3, "3 wolne miejsca"],
    [5, "5 wolnych miejsc"],
    [14, "14 wolnych miejsc"],
    [23, "23 wolne miejsca"],
  ])("wolne miejsca: %i", (liczba, zdanie) => {
    expect(zdanieOWolnychMiejscach(liczba)).toBe(zdanie);
  });

  it.each([
    [1, 1, "Znaleziono 1 z 1 osoby."],
    [2, 5, "Znaleziono 2 z 5 osób."],
    [0, 3, "Znaleziono 0 z 3 osób."],
  ])("wyniki filtru %i z %i", (znaleziono, razem, zdanie) => {
    expect(zdanieOWynikachFiltru(znaleziono, razem)).toBe(zdanie);
  });

  it("licznik znaków: odmiana według limitu", () => {
    expect(licznikZnakow("abc", 255)).toBe("3/255 znaków");
    expect(licznikZnakow("", 5000)).toBe("0/5000 znaków");
  });
});

describe("filtrujOsoby", () => {
  it("pusta fraza zostawia wszystkich, wielkość liter i kolejność słów nie mają znaczenia", () => {
    expect(filtrujOsoby(GRUPA.members, "  ")).toHaveLength(3);
    expect(filtrujOsoby(GRUPA.members, "MARTA")).toHaveLength(1);
    expect(filtrujOsoby(GRUPA.members, "demo marta").map((o) => o.id)).toEqual([17]);
    expect(filtrujOsoby(GRUPA.members, "demo")).toHaveLength(3);
    expect(filtrujOsoby(GRUPA.members, "nikt")).toHaveLength(0);
  });
});

describe("wierszeOsob — tylko imię, nazwisko i postęp", () => {
  it("słowa jak na pulpicie: kursy „2 z 5”, staż „12,5 godz.”, superwizje liczbą, warsztat plakietką", () => {
    const [filip, marta] = wierszeOsob(GRUPA.members);
    expect(marta).toMatchObject({
      tytul: "Marta Demo",
      plakietka: { tekst: "Nieukończony" },
      komorki: { kursy: { tekst: "2 z 5" }, staz: { tekst: "12,5 godz." }, superwizje: { liczba: 1, bezJednostki: true } },
    });
    expect(filip).toMatchObject({ plakietka: { tekst: "Ukończony", wariant: "ok" }, komorki: { staz: { tekst: "72 godz." } } });
  });

  it("wiersz nie niesie żadnego pola poza imieniem, plakietką warsztatu i trzema liczbami postępu", () => {
    const [wiersz] = wierszeOsob([{ ...MARTA, progress: GRUPA.members[1].progress, email: "x@y.z", phone: "1" } as never]);
    expect(Object.keys(wiersz).sort()).toEqual(["id", "komorki", "plakietka", "tytul", "tytulPogrubiony"]);
    expect(Object.keys(wiersz.komorki ?? {}).sort()).toEqual(["kursy", "staz", "superwizje"]);
  });
});

describe("wierszeRzetelnosci", () => {
  it("poniżej progu, w normie i brak danych — słowa jak na starym ekranie", () => {
    const [zofia, marta, filip] = wierszeRzetelnosci(RZETELNOSC);
    expect(zofia).toMatchObject({ tytul: "Zofia Demo", podpowiedz: "Wynik: 15%", plakietka: { tekst: "Poniżej progu", wariant: "warn" } });
    expect(marta).toMatchObject({ podpowiedz: "Wynik: 85,5%", plakietka: { tekst: "W normie", wariant: "ok" } });
    expect(filip.plakietka).toEqual({ wariant: "neutral", tekst: "Brak danych" });
    expect(filip.podpowiedz).toBeUndefined();
  });
});

describe("terminy i obecności", () => {
  it("tytuł z datą po polsku, opis z zajętymi miejscami, czasem i miejscem (tylko, gdy podano)", () => {
    expect(tytulTerminu(TERMIN_PRZYSZLY)).toBe("14 października 2026, 18:00");
    expect(opisTerminu(TERMIN_PRZYSZLY)).toBe("Zajęte miejsca: 2 z 3 · 90 min");
    expect(opisTerminu(TERMIN_ZAKONCZONY)).toBe("Zajęte miejsca: 2 z 2 · 60 min · sala 4");
  });

  it("sortowanie rosnąco po początku, remis zachowuje kolejność z serwera", () => {
    expect(posortujTerminy([TERMIN_PUSTY, TERMIN_PRZYSZLY, TERMIN_ZAKONCZONY]).map((t) => t.id)).toEqual([30, 31, 32]);
    const remis = { ...TERMIN_PUSTY, id: 99, starts_at: TERMIN_PRZYSZLY.starts_at };
    expect(posortujTerminy([remis, TERMIN_PRZYSZLY]).map((t) => t.id)).toEqual([99, 31]);
  });

  it("zdanie o obecności osoby", () => {
    expect(zdanieOObecnosci(null)).toBe("Obecność jeszcze nieoznaczona.");
    expect(zdanieOObecnosci("present")).toBe("Oznaczono: obecność.");
    expect(zdanieOObecnosci("absent")).toBe("Oznaczono: nieobecność.");
  });

  it("obecność: wybrana teraz wygrywa z zapisaną; ciało zapisu niesie tylko osoby z wartością", () => {
    expect(obecnoscOsoby(TERMIN_ZAKONCZONY, 17, {})).toBe("present");
    expect(obecnoscOsoby(TERMIN_ZAKONCZONY, 17, { 30: { 17: "absent" } })).toBe("absent");
    expect(obecnoscOsoby(TERMIN_ZAKONCZONY, 18, {})).toBeNull();
    expect(wartosciObecnosci(TERMIN_ZAKONCZONY, {})).toEqual({ "17": "present" });
    expect(wartosciObecnosci(TERMIN_ZAKONCZONY, { 30: { 18: "absent" } })).toEqual({ "17": "present", "18": "absent" });
    expect(wartosciObecnosci(TERMIN_PRZYSZLY, {})).toEqual({});
  });
});

describe("formularze", () => {
  it("termin: powód braku i wykrywanie zmian względem wartości domyślnych", () => {
    expect(powodBrakuTerminu(DOMYSLNY_TERMIN)).toBe("Podaj datę i godzinę spotkania.");
    expect(powodBrakuTerminu({ ...DOMYSLNY_TERMIN, start: "nie-data" })).toBe("Podaj prawidłową datę i godzinę spotkania.");
    expect(powodBrakuTerminu({ ...DOMYSLNY_TERMIN, start: "2026-10-20T18:00" })).toBeNull();
    expect(terminZmieniony(DOMYSLNY_TERMIN)).toBe(false);
    for (const pole of ["start", "czas", "miejsca", "miejsce"] as const) {
      expect(terminZmieniony({ ...DOMYSLNY_TERMIN, [pole]: "x" })).toBe(true);
    }
  });

  it("sprawa: powód braku zależy od tego, czego brakuje; zmiana — od czegokolwiek", () => {
    expect(powodBrakuSprawy(PUSTA_SPRAWA)).toBe("Wpisz temat i opis sprawy.");
    expect(powodBrakuSprawy({ ...PUSTA_SPRAWA, temat: "Temat" })).toBe("Wpisz opis sprawy.");
    expect(powodBrakuSprawy({ ...PUSTA_SPRAWA, opis: "Opis" })).toBe("Wpisz temat.");
    expect(powodBrakuSprawy({ ...PUSTA_SPRAWA, temat: "  ", opis: "Opis" })).toBe("Wpisz temat.");
    expect(powodBrakuSprawy({ osoba: "", temat: "T", opis: "O" })).toBeNull();
    expect(sprawaZmieniona(PUSTA_SPRAWA)).toBe(false);
    expect(sprawaZmieniona({ ...PUSTA_SPRAWA, osoba: "17" })).toBe(true);
  });
});

describe("błędy serwera", () => {
  it("bladPola, komunikatBledu i bledyPolZOdpowiedzi", () => {
    expect(bladPola({ subject: ["Podaj temat zgłoszenia."] }, "subject")).toBe("Podaj temat zgłoszenia.");
    expect(bladPola(undefined, "subject")).toBeUndefined();
    const walidacja = new ApiError({ status: 422, code: "validation_failed", message: "x", errors: { subject: ["a"] } });
    const inny = new ApiError({ status: 500, code: "server_error", message: "Serwer." });
    expect(bledyPolZOdpowiedzi(walidacja)).toEqual({ subject: ["a"] });
    expect(bledyPolZOdpowiedzi(inny)).toBeUndefined();
    expect(bledyPolZOdpowiedzi(new TypeError("fetch"))).toBeUndefined();
    expect(komunikatBledu(inny, "zastępczy")).toBe("Serwer.");
    expect(komunikatBledu(new TypeError("fetch"), "zastępczy")).toBe("zastępczy");
  });
});
