import { describe, expect, it } from "vitest";
import {
  adresKroku,
  adresKursu,
  etykietaKroku,
  kursWToku,
  podliniaKursu,
  ulozKursy,
  wyliczKrokListy,
} from "../logika";
import {
  KURS_POZA_SCIEZKA,
  KURS_UKONCZONY,
  KURS_W_TOKU,
  KURS_ZAMKNIETY,
  LEKCJA_DO_ZROBIENIA,
  LEKCJA_UKONCZONA,
} from "./atrapy";

describe("ulozKursy", () => {
  it("kursy ze ścieżki rosnąco po numerze, kursy poza ścieżką na końcu w kolejności z serwera", () => {
    const drugi = { ...KURS_POZA_SCIEZKA, id: 8, slug: "drugi-webinar" };
    const wynik = ulozKursy([KURS_POZA_SCIEZKA, KURS_ZAMKNIETY, drugi, KURS_UKONCZONY, KURS_W_TOKU]);
    expect(wynik.map((kurs) => kurs.id)).toEqual([1, 2, 3, 7, 8]);
  });

  it("nie zmienia wejścia", () => {
    const wejscie = [KURS_ZAMKNIETY, KURS_UKONCZONY];
    ulozKursy(wejscie);
    expect(wejscie.map((kurs) => kurs.id)).toEqual([3, 1]);
  });
});

describe("podliniaKursu", () => {
  it("kurs ze ścieżki: numer i procent jak na pulpicie", () => {
    expect(podliniaKursu(KURS_W_TOKU)).toBe("Kurs 2 · 40% ukończone");
  });

  it("kurs poza ścieżką: nazwany wprost, bez pustego numeru", () => {
    expect(podliniaKursu(KURS_POZA_SCIEZKA)).toBe("Poza ścieżką · 50% ukończone");
  });
});

describe("wyliczKrokListy", () => {
  const ulozone = ulozKursy([KURS_UKONCZONY, KURS_W_TOKU, KURS_ZAMKNIETY]);

  it("kurs w toku z nieukończoną lekcją: „Wróć do lekcji” z adresem lekcji i kursem", () => {
    const krok = wyliczKrokListy(ulozone, { stan: "ok", lekcje: [LEKCJA_DO_ZROBIENIA, LEKCJA_UKONCZONA] });
    expect(krok).toMatchObject({ rodzaj: "lekcja", lekcja: { id: 22 } });
    expect(etykietaKroku(krok!)).toBe("Wróć do lekcji");
    expect(adresKroku(krok!)).toBe("/panel/lekcje/22?kurs=wywiad-psychologiczny");
  });

  it("wszystkie lekcje ukończone: „Przejdź do testu”", () => {
    const krok = wyliczKrokListy(ulozone, { stan: "ok", lekcje: [LEKCJA_UKONCZONA] });
    expect(etykietaKroku(krok!)).toBe("Przejdź do testu");
    expect(adresKroku(krok!)).toBe("/panel/kursy/wywiad-psychologiczny/test");
  });

  it("błąd szczegółów kursu: „Otwórz kurs” zamiast braku przycisku", () => {
    const krok = wyliczKrokListy(ulozone, { stan: "blad" });
    expect(etykietaKroku(krok!)).toBe("Otwórz kurs");
    expect(adresKroku(krok!)).toBe(adresKursu("wywiad-psychologiczny"));
  });

  it("szczegóły jeszcze się ładują: brak kroku, a nie przycisk nieaktywny", () => {
    expect(wyliczKrokListy(ulozone, { stan: "ladowanie" })).toBeNull();
  });

  it("cała ścieżka ukończona: „Zobacz warunki certyfikatu”", () => {
    const krok = wyliczKrokListy([{ ...KURS_UKONCZONY }, { ...KURS_UKONCZONY, id: 9, sequence_order: 2 }], { stan: "brak" });
    expect(etykietaKroku(krok!)).toBe("Zobacz warunki certyfikatu");
    expect(adresKroku(krok!)).toBe("/panel/certyfikat");
  });

  it("żaden kurs nie jest w toku i ścieżka nie jest ukończona: brak kroku", () => {
    expect(wyliczKrokListy([KURS_UKONCZONY, KURS_ZAMKNIETY], { stan: "brak" })).toBeNull();
    expect(wyliczKrokListy([KURS_ZAMKNIETY], { stan: "brak" })).toBeNull();
  });

  it("same kursy poza ścieżką, wszystkie ukończone: bez certyfikatu (ścieżka jest pusta)", () => {
    expect(wyliczKrokListy([{ ...KURS_POZA_SCIEZKA, status: "completed" }], { stan: "brak" })).toBeNull();
  });

  it("kurs poza ścieżką w toku też ma „Wróć do lekcji”", () => {
    const krok = wyliczKrokListy([KURS_POZA_SCIEZKA], { stan: "ok", lekcje: [LEKCJA_DO_ZROBIENIA] });
    expect(krok).toMatchObject({ rodzaj: "lekcja", kurs: { slug: "webinar-superwizja" } });
  });
});

describe("kursWToku", () => {
  it("pierwszy kurs w toku w kolejności wyświetlania", () => {
    expect(kursWToku(ulozKursy([KURS_POZA_SCIEZKA, KURS_W_TOKU]))?.id).toBe(2);
    expect(kursWToku([KURS_UKONCZONY])).toBeUndefined();
  });
});
