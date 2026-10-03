import { describe, expect, it } from "vitest";
import type { KursUczestnika } from "../dane";
import { adresStreamu, jestWebinarem, oknoObecnosci, zbudujWidokWebinaru } from "../webinar";

/**
 * Czysta logika widoku webinaru: okno obecności (od początku do północy w
 * Warszawie), bezpieczny adres transmisji (tylko https) i wszystkie stany
 * widoku. Dane przykładowe, bez prawdziwych osób.
 */

const POCZATEK = "2026-11-05T17:00:00Z";
const KONIEC = "2026-11-05T23:00:00Z";
const ms = (iso: string) => new Date(iso).getTime();

describe("jestWebinarem", () => {
  it("tylko `type: \"webinar\"`; kurs i brak pola (zaplecze bez webinarów) to kurs", () => {
    expect(jestWebinarem({ type: "webinar" })).toBe(true);
    expect(jestWebinarem({ type: "course" })).toBe(false);
    expect(jestWebinarem({})).toBe(false);
    expect(jestWebinarem({ type: null })).toBe(false);
    expect(jestWebinarem({ type: "Webinar" })).toBe(false);
  });
});

describe("adresStreamu", () => {
  it("przepuszcza wyłącznie adres https", () => {
    expect(adresStreamu("https://transmisja.example.org/webinar/42")).toBe("https://transmisja.example.org/webinar/42");
    expect(adresStreamu("https://transmisja.example.org")).toBe("https://transmisja.example.org");
    expect(adresStreamu("HTTPS://transmisja.example.org/x")).toBe("HTTPS://transmisja.example.org/x");
  });

  it.each([
    null,
    undefined,
    "",
    "   ",
    "http://transmisja.example.org/webinar",
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<p>x</p>",
    "ftp://transmisja.example.org/x",
    "//transmisja.example.org/x",
    "/webinar/42",
    "transmisja.example.org/x",
    "https://",
    "https:///x",
    "https://uzytkownik:haslo@transmisja.example.org/x",
    " https://transmisja.example.org/x",
    "https://transmisja.example.org/x jeszcze tekst",
    "mailto:ktos@example.org",
  ])("odrzuca %j", (adres) => {
    expect(adresStreamu(adres as string | null | undefined)).toBeNull();
  });
});

describe("oknoObecnosci", () => {
  const wejscie = { serwer: undefined, startsAt: POCZATEK, zamyka: KONIEC } as const;

  it("z samych czasów: przed początkiem, od początku do północy, po północy", () => {
    expect(oknoObecnosci(wejscie, ms("2026-11-05T16:59:59Z"))).toBe("before");
    expect(oknoObecnosci(wejscie, ms("2026-11-05T17:00:00Z"))).toBe("open");
    expect(oknoObecnosci(wejscie, ms("2026-11-05T22:59:59Z"))).toBe("open");
    expect(oknoObecnosci(wejscie, ms("2026-11-05T23:00:00Z"))).toBe("closed");
    expect(oknoObecnosci(wejscie, ms("2026-11-07T10:00:00Z"))).toBe("closed");
  });

  it("bez `attendance_closes_at` koniec liczy się z początku: północ w Warszawie", () => {
    const bezKonca = { serwer: undefined, startsAt: POCZATEK, zamyka: null };
    expect(oknoObecnosci(bezKonca, ms("2026-11-05T22:59:59Z"))).toBe("open");
    expect(oknoObecnosci(bezKonca, ms("2026-11-05T23:00:00Z"))).toBe("closed");
  });

  it("dzień zmiany czasu 25.10 trwa 25 godzin: okno otwarte do 23:00 UTC, nie do 22:00", () => {
    const zmianaCzasu = { serwer: undefined, startsAt: "2026-10-25T10:00:00Z", zamyka: null };
    expect(oknoObecnosci(zmianaCzasu, ms("2026-10-25T22:30:00Z"))).toBe("open");
    expect(oknoObecnosci(zmianaCzasu, ms("2026-10-25T23:00:00Z"))).toBe("closed");
    const zKoncemSerwera = { ...zmianaCzasu, zamyka: "2026-10-25T23:00:00Z" };
    expect(oknoObecnosci(zKoncemSerwera, ms("2026-10-25T22:59:00Z"))).toBe("open");
  });

  it("serwer i zegar: wygrywa późniejszy stan, okno nigdy się nie cofa", () => {
    // Zegar jeszcze przed początkiem, ale serwer już mówi „otwarte” (zegar spóźniony).
    expect(oknoObecnosci({ ...wejscie, serwer: "open" }, ms("2026-11-05T16:00:00Z"))).toBe("open");
    // Ekran wczytany przed transmisją, zegar poszedł dalej: „przed” z serwera ustępuje czasom.
    expect(oknoObecnosci({ ...wejscie, serwer: "before" }, ms("2026-11-05T18:00:00Z"))).toBe("open");
    expect(oknoObecnosci({ ...wejscie, serwer: "open" }, ms("2026-11-06T00:00:00Z"))).toBe("closed");
    // Serwer mówi „zamknięte” — zegar tego nie odwraca.
    expect(oknoObecnosci({ ...wejscie, serwer: "closed" }, ms("2026-11-05T18:00:00Z"))).toBe("closed");
  });

  it("bez czasów rozstrzyga sam serwer; bez niczego — `null`", () => {
    expect(oknoObecnosci({ serwer: "open", startsAt: null, zamyka: null }, ms(POCZATEK))).toBe("open");
    expect(oknoObecnosci({ serwer: "before", startsAt: undefined, zamyka: undefined }, ms(POCZATEK))).toBe("before");
    expect(oknoObecnosci({ serwer: null, startsAt: null, zamyka: null }, ms(POCZATEK))).toBeNull();
    expect(oknoObecnosci({ serwer: undefined, startsAt: "to nie jest data", zamyka: null }, ms(POCZATEK))).toBeNull();
  });

  it("nieznana wartość okna z serwera jest pomijana", () => {
    expect(oknoObecnosci({ serwer: "przyszłość" as never, startsAt: null, zamyka: null }, ms(POCZATEK))).toBeNull();
  });
});

function webinar(nadpisania: Partial<KursUczestnika> = {}): KursUczestnika {
  return {
    id: 12,
    slug: "webinar-o-kryzysie",
    title: "Webinar: rozmowa w kryzysie",
    status: "in_progress",
    progress_percent: 0,
    type: "webinar",
    description: "Spotkanie na żywo z prowadzącą.",
    starts_at: POCZATEK,
    stream_url: "https://transmisja.example.org/webinar/42",
    attendance_window: "before",
    attendance_closes_at: KONIEC,
    attended_at: null,
    recording_lesson_id: null,
    topics: [],
    lessons: [],
    has_test: false,
    test_locked: false,
    test_passed: false,
    ...nadpisania,
  };
}

describe("zbudujWidokWebinaru", () => {
  const przed = ms("2026-11-05T12:00:00Z");
  const wTrakcie = ms("2026-11-05T17:30:00Z");
  const po = ms("2026-11-06T09:00:00Z");

  it("termin w Warszawie, z dniem tygodnia; tytuł i opis z odczytu", () => {
    const widok = zbudujWidokWebinaru(webinar(), przed, null, null);
    expect(widok.tytul).toBe("Webinar: rozmowa w kryzysie");
    expect(widok.opis).toBe("Spotkanie na żywo z prowadzącą.");
    expect(widok.termin).toBe("czwartek, 5 listopada 2026, 18:00");
  });

  it("brak opisu albo pusty opis to `null`", () => {
    expect(zbudujWidokWebinaru(webinar({ description: null }), przed, null, null).opis).toBeNull();
    expect(zbudujWidokWebinaru(webinar({ description: "   " }), przed, null, null).opis).toBeNull();
    expect(zbudujWidokWebinaru(webinar({ description: undefined }), przed, null, null).opis).toBeNull();
  });

  it("przed: przycisk widoczny, ale nieczynny, z powodem „od {godzina}”; transmisja już jest", () => {
    const widok = zbudujWidokWebinaru(webinar(), przed, null, null);
    expect(widok.okno).toBe("before");
    expect(widok.obecnosc).toEqual({ rodzaj: "przed", powod: "Udział potwierdzisz od 18:00." });
    expect(widok.adresStreamu).toBe("https://transmisja.example.org/webinar/42");
    expect(widok.nagranie).toEqual({ rodzaj: "brak" });
    expect(widok.ukonczony).toBe(false);
  });

  it("otwarte: przycisk czynny", () => {
    const widok = zbudujWidokWebinaru(webinar({ attendance_window: "open" }), wTrakcie, null, null);
    expect(widok.okno).toBe("open");
    expect(widok.obecnosc).toEqual({ rodzaj: "czynny" });
    expect(widok.nagranie).toEqual({ rodzaj: "brak" });
  });

  it("okno otwiera się z upływem czasu, bez ponownego odczytu", () => {
    expect(zbudujWidokWebinaru(webinar(), wTrakcie, null, null).obecnosc).toEqual({ rodzaj: "czynny" });
  });

  it("po potwierdzeniu w tej sesji: zdanie z datą i godziną, przycisku nie ma, webinar ukończony", () => {
    const widok = zbudujWidokWebinaru(webinar({ attendance_window: "open" }), wTrakcie, "2026-11-05T17:04:11Z", null);
    expect(widok.obecnosc).toEqual({ rodzaj: "potwierdzona", zdanie: "Udział potwierdzony 5 listopada 2026, 18:04." });
    expect(widok.ukonczony).toBe(true);
    expect(widok.zdanieUkonczenia).toBe("Udział potwierdzony 5 listopada 2026, 18:04.");
  });

  it("potwierdzenie z odczytu (`attended_at`) działa też po zamknięciu okna", () => {
    const widok = zbudujWidokWebinaru(
      webinar({ attendance_window: "closed", attended_at: "2026-11-05T17:04:11Z", status: "completed", progress_percent: 100 }),
      po,
      null,
      null,
    );
    expect(widok.obecnosc).toEqual({ rodzaj: "potwierdzona", zdanie: "Udział potwierdzony 5 listopada 2026, 18:04." });
    expect(widok.ukonczony).toBe(true);
  });

  it("zamknięte bez nagrania: zdanie o upływie czasu i „Nagranie pojawi się wkrótce”, przycisku nie ma", () => {
    const widok = zbudujWidokWebinaru(webinar({ attendance_window: "closed" }), po, null, null);
    expect(widok.okno).toBe("closed");
    expect(widok.obecnosc).toEqual({ rodzaj: "minelo", zdanie: "Czas na potwierdzenie udziału minął." });
    expect(widok.nagranie).toEqual({ rodzaj: "wkrotce" });
    expect(widok.ukonczony).toBe(false);
  });

  it("zamknięte z nagraniem: odnośnik do istniejącej lekcji z nagraniem", () => {
    const widok = zbudujWidokWebinaru(webinar({ attendance_window: "closed", recording_lesson_id: 345 }), po, null, null);
    expect(widok.nagranie).toEqual({ rodzaj: "link", href: "/panel/lekcje/345?kurs=webinar-o-kryzysie" });
    expect(widok.obecnosc).toEqual({ rodzaj: "minelo", zdanie: "Czas na potwierdzenie udziału minął." });
  });

  it("nagranie z odczytu jest widoczne także przed końcem okna (identyfikator ustawia serwer)", () => {
    const widok = zbudujWidokWebinaru(webinar({ attendance_window: "open", recording_lesson_id: 345 }), wTrakcie, null, null);
    expect(widok.nagranie).toEqual({ rodzaj: "link", href: "/panel/lekcje/345?kurs=webinar-o-kryzysie" });
    expect(widok.obecnosc).toEqual({ rodzaj: "czynny" });
  });

  it("ukończony przez nagranie: potwierdzenie na górze, bez przycisku obecności i bez zdania o upływie czasu", () => {
    const widok = zbudujWidokWebinaru(
      webinar({ attendance_window: "closed", status: "completed", progress_percent: 100, recording_lesson_id: 345 }),
      po,
      null,
      null,
    );
    expect(widok.ukonczony).toBe(true);
    expect(widok.zdanieUkonczenia).toBe("Nagranie obejrzane.");
    expect(widok.obecnosc).toEqual({ rodzaj: "brak" });
    expect(widok.nagranie).toEqual({ rodzaj: "link", href: "/panel/lekcje/345?kurs=webinar-o-kryzysie" });
  });

  it("ukończony bez wiadomego sposobu (`attended_at` puste, brak nagrania): potwierdzenie bez zdania o sposobie", () => {
    const widok = zbudujWidokWebinaru(webinar({ attendance_window: "open", status: "completed" }), wTrakcie, null, null);
    expect(widok.ukonczony).toBe(true);
    expect(widok.obecnosc).toEqual({ rodzaj: "brak" });
  });

  it("transmisja tylko pod adresem https; inny adres to brak odnośnika", () => {
    expect(zbudujWidokWebinaru(webinar({ stream_url: "http://transmisja.example.org/x" }), przed, null, null).adresStreamu).toBeNull();
    expect(zbudujWidokWebinaru(webinar({ stream_url: "javascript:alert(1)" }), przed, null, null).adresStreamu).toBeNull();
    expect(zbudujWidokWebinaru(webinar({ stream_url: null }), przed, null, null).adresStreamu).toBeNull();
    expect(zbudujWidokWebinaru(webinar({ stream_url: undefined }), przed, null, null).adresStreamu).toBeNull();
  });

  it("okno nadpisane odpowiedzią 422 serwera wygrywa z zegarem i z odczytem", () => {
    const widok = zbudujWidokWebinaru(webinar({ attendance_window: "open" }), wTrakcie, null, { okno: "closed", otwiera: POCZATEK, zamyka: KONIEC });
    expect(widok.okno).toBe("closed");
    expect(widok.obecnosc).toEqual({ rodzaj: "minelo", zdanie: "Czas na potwierdzenie udziału minął." });
    const przedWgSerwera = zbudujWidokWebinaru(webinar(), wTrakcie, null, { okno: "before", otwiera: POCZATEK, zamyka: KONIEC });
    expect(przedWgSerwera.okno).toBe("before");
    expect(przedWgSerwera.obecnosc).toEqual({ rodzaj: "przed", powod: "Udział potwierdzisz od 18:00." });
  });

  it("bez godziny rozpoczęcia powód jest ogólny, a nie „od —”", () => {
    const widok = zbudujWidokWebinaru(webinar({ starts_at: null, attendance_window: "before" }), przed, null, null);
    expect(widok.obecnosc).toEqual({ rodzaj: "przed", powod: "Udział potwierdzisz od rozpoczęcia transmisji." });
    expect(widok.termin).toBe("—");
  });

  it("okno nieznane (brak czasów i brak pola): obecności nie oferujemy", () => {
    const widok = zbudujWidokWebinaru(webinar({ starts_at: null, attendance_window: null, attendance_closes_at: null }), przed, null, null);
    expect(widok.okno).toBeNull();
    expect(widok.obecnosc).toEqual({ rodzaj: "brak" });
  });
});
