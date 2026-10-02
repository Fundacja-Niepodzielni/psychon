import { describe, expect, it } from "vitest";
import { czasLekcji, liniaPostepuLekcji, zbudujWidok } from "../logika";
import { kursSzkicu, lekcjeSzkicu } from "./atrapy";

/** Pola odczytu dodawane przez zaplecze osobną zmianą i tryb podglądu w czystej logice. */

const lekcja = (zmiany: Record<string, unknown>) => ({ ...lekcjeSzkicu(0)[2], ...zmiany });

describe("linia postępu lekcji", () => {
  it("tekst ze szkicu: 720 z 960 sekund to „obejrzane 12 z 16 potrzebnych minut”", () => {
    expect(liniaPostepuLekcji(lekcja({ active_seconds: 720, required_active_seconds: 960 }))).toBe("W trakcie · obejrzane 12 z 16 potrzebnych minut");
  });

  it("zaokrągla do najbliższej minuty, najmniej 1; obejrzane nie przekraczają potrzebnych", () => {
    expect(liniaPostepuLekcji(lekcja({ active_seconds: 10, required_active_seconds: 960 }))).toBe("W trakcie · obejrzane 1 z 16 potrzebnych minut");
    expect(liniaPostepuLekcji(lekcja({ active_seconds: 89, required_active_seconds: 960 }))).toBe("W trakcie · obejrzane 1 z 16 potrzebnych minut");
    expect(liniaPostepuLekcji(lekcja({ active_seconds: 91, required_active_seconds: 960 }))).toBe("W trakcie · obejrzane 2 z 16 potrzebnych minut");
    expect(liniaPostepuLekcji(lekcja({ active_seconds: 5000, required_active_seconds: 960 }))).toBe("W trakcie · obejrzane 16 z 16 potrzebnych minut");
    expect(liniaPostepuLekcji(lekcja({ active_seconds: 20, required_active_seconds: 20 }))).toBe("W trakcie · obejrzane 1 z 1 potrzebnych minut");
  });

  it.each([
    ["brak obu pól", {}],
    ["brak czasu potrzebnego", { active_seconds: 720 }],
    ["brak czasu aktywnego", { required_active_seconds: 960 }],
    ["czas aktywny zero", { active_seconds: 0, required_active_seconds: 960 }],
    ["czas potrzebny zero", { active_seconds: 720, required_active_seconds: 0 }],
    ["lekcja ukończona", { active_seconds: 960, required_active_seconds: 960, is_completed: true }],
  ])("bez linii: %s", (_nazwa, zmiany) => {
    expect(liniaPostepuLekcji(lekcja(zmiany))).toBeNull();
  });
});

describe("opis czasu lekcji z has_recording", () => {
  it("false — „do czytania”, bez minut, także gdy odczyt niesie czas", () => {
    expect(czasLekcji(lekcja({ has_recording: false, duration_seconds: 480 }))).toBe("do czytania");
    expect(czasLekcji(lekcja({ has_recording: false, duration_seconds: null }))).toBe("do czytania");
  });

  it("true albo brak pola — minuty nagrania jak dotąd", () => {
    expect(czasLekcji(lekcja({ has_recording: true, duration_seconds: 840 }))).toBe("14 min nagrania");
    expect(czasLekcji(lekcja({ duration_seconds: 840 }))).toBe("14 min nagrania");
    expect(czasLekcji(lekcja({ duration_seconds: null }))).toBeNull();
  });
});

describe("przycisk główny z polami postępu", () => {
  it("pierwsza nieukończona lekcja z czasem aktywnym, także gdy wcześniejsza nie ma postępu", () => {
    const widok = zbudujWidok(kursSzkicu({ ukonczone: 0, nowePola: true, wTrakcieNr: 3 }));
    expect(widok.akcja).toMatchObject({ etykieta: "Kontynuuj lekcję 3", powod: "„Rozpoznawanie kryzysu psychicznego”" });
    expect(widok.indeksNastepnej).toBe(2);
    expect(widok.tematy[0].wiersze.map((wiersz) => wiersz.etykieta)).toEqual(["Rozpocznij lekcję", "Rozpocznij lekcję", "Kontynuuj", "Rozpocznij lekcję"]);
  });

  it("z kilkoma lekcjami w toku wygrywa pierwsza w kolejności", () => {
    const kurs = kursSzkicu({ ukonczone: 0, nowePola: true, wTrakcieNr: 3 });
    kurs.lessons[4] = { ...kurs.lessons[4], active_seconds: 100, required_active_seconds: 500 };
    expect(zbudujWidok(kurs).akcja).toMatchObject({ etykieta: "Kontynuuj lekcję 3" });
    expect(zbudujWidok(kurs).tematy.flatMap((temat) => temat.wiersze).filter((wiersz) => wiersz.etykieta === "Kontynuuj")).toHaveLength(2);
  });

  it("bez lekcji z czasem aktywnym albo bez pól — reguła zastępcza", () => {
    expect(zbudujWidok(kursSzkicu({ ukonczone: 2, nowePola: true })).akcja).toMatchObject({ etykieta: "Kontynuuj lekcję 3" });
    expect(zbudujWidok(kursSzkicu({ ukonczone: 0, nowePola: true })).akcja).toMatchObject({ etykieta: "Rozpocznij lekcję 1" });
    expect(zbudujWidok(kursSzkicu({ ukonczone: 0 })).akcja).toMatchObject({ etykieta: "Rozpocznij lekcję 1" });
  });

  it("lekcja zamknięta odczytem nie jest wskazywana, nawet z czasem aktywnym", () => {
    const kurs = kursSzkicu({ ukonczone: 0, nowePola: true, wTrakcieNr: 3 });
    kurs.lessons[2].locked = true;
    expect(zbudujWidok(kurs).akcja).toMatchObject({ etykieta: "Rozpocznij lekcję 1" });
  });
});

describe("test zaliczony (test_passed)", () => {
  it("zdanie „Test zaliczony.”; przy wszystkich lekcjach ukończonych brak przycisku głównego", () => {
    const widok = zbudujWidok(kursSzkicu({ ukonczone: 7, testZaliczony: true }));
    expect(widok.test.zdanie).toBe("Test zaliczony.");
    expect(widok.testZaliczony).toBe(true);
    expect(widok.akcja).toEqual({ rodzaj: "brak" });
  });

  it("test_passed: false albo brak pola — jak dotąd", () => {
    expect(zbudujWidok(kursSzkicu({ ukonczone: 7, testZaliczony: false })).akcja).toMatchObject({ etykieta: "Przejdź do testu" });
    expect(zbudujWidok(kursSzkicu({ ukonczone: 7 })).test.zdanie).toMatch(/^Możesz już/);
  });

  it("lekcje jeszcze w toku: przycisk główny dalej prowadzi do lekcji", () => {
    expect(zbudujWidok(kursSzkicu({ ukonczone: 2, testZaliczony: true })).akcja).toMatchObject({ etykieta: "Kontynuuj lekcję 3" });
  });
});

describe("tryb podglądu w logice", () => {
  it("pole locked jest ignorowane: żadna lekcja nie jest zamknięta, przycisk główny jak przy otwartych", () => {
    const kurs = kursSzkicu({ ukonczone: 2, zamknieteOd: 4 });
    const zwykly = zbudujWidok(kurs);
    const podglad = zbudujWidok(kurs, { podglad: true });
    expect(zwykly.tematy.flatMap((temat) => temat.wiersze).filter((wiersz) => wiersz.zamknieta)).toHaveLength(4);
    expect(podglad.tematy.flatMap((temat) => temat.wiersze).filter((wiersz) => wiersz.zamknieta)).toHaveLength(0);
    expect(podglad.akcja).toEqual(zwykly.akcja);
  });

  it("kontrola dodatnia: gdy zamknięta jest następna lekcja, podgląd wskazuje ją, a zwykły widok nie", () => {
    const kurs = kursSzkicu({ ukonczone: 2, zamknieteOd: 3 });
    expect(zbudujWidok(kurs).akcja).toEqual({ rodzaj: "brak" });
    expect(zbudujWidok(kurs, { podglad: true }).akcja).toMatchObject({ etykieta: "Kontynuuj lekcję 3" });
  });
});
