import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/klient";
import type { WpisDziennika } from "@/lib/api/h20-dziennik";
import {
  bladZakresu,
  dzienWPolsce,
  filtrAktywny,
  filtrZapytania,
  idZAdresu,
  komunikatWyniku,
  licznik,
  nazwaOsobyZWpisow,
  opiszWpis,
  polnocWPolsce,
  przesunDzien,
  PUSTY_FILTR,
  rodzajBledu,
  zakres,
} from "../dane";

/**
 * Czyste funkcje dziennika działań: dni kalendarzowe w Polsce i ich granice
 * w UTC (czas letni i zimowy), gotowe zakresy, parametry zapytania, opis
 * wiersza (ta sama reguła co wiersz pliku), licznik, komunikat dla czytnika.
 */

function wpis(nadpisz: Partial<WpisDziennika> = {}): WpisDziennika {
  return {
    id: 501,
    action: "internship.accepted",
    group: { key: "staz", label: "Staż i dyżury" },
    actor: { id: 2, first_name: "Anna", last_name: "Opiekun" },
    subject: { person: { id: 17, first_name: "Marta", last_name: "Demo" }, label: "Wpis w dzienniku stażu" },
    created_at: "2026-10-02T12:05:00Z",
    ...nadpisz,
  };
}

describe("dni kalendarzowe w Polsce", () => {
  it("dzień chwili liczony w Polsce: 22:30 UTC we wrześniu to już następny dzień", () => {
    expect(dzienWPolsce(Date.parse("2026-09-30T21:59:00Z"))).toBe("2026-09-30");
    expect(dzienWPolsce(Date.parse("2026-09-30T22:30:00Z"))).toBe("2026-10-01");
    expect(dzienWPolsce(Date.parse("2026-12-31T22:59:00Z"))).toBe("2026-12-31");
  });

  it("północ w Polsce: 22:00 UTC latem, 23:00 UTC zimą, także w dniu zmiany czasu", () => {
    expect(new Date(polnocWPolsce("2026-07-15")!).toISOString()).toBe("2026-07-14T22:00:00.000Z");
    expect(new Date(polnocWPolsce("2026-12-15")!).toISOString()).toBe("2026-12-14T23:00:00.000Z");
    expect(new Date(polnocWPolsce("2026-10-25")!).toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(new Date(polnocWPolsce("2026-03-29")!).toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(polnocWPolsce("")).toBeNull();
    expect(polnocWPolsce("2026-13-45x")).toBeNull();
  });

  it("przesunięcie dnia przechodzi przez koniec miesiąca i roku", () => {
    expect(przesunDzien("2026-09-30", 1)).toBe("2026-10-01");
    expect(przesunDzien("2027-01-03", -6)).toBe("2026-12-28");
  });

  it("gotowe zakresy: dziś, ostatnie 7 dni (z dzisiejszym), ten miesiąc", () => {
    const teraz = Date.parse("2026-10-02T09:00:00Z");
    expect(zakres("dzis", teraz)).toEqual({ od: "2026-10-02", do: "2026-10-02" });
    expect(zakres("tydzien", teraz)).toEqual({ od: "2026-09-26", do: "2026-10-02" });
    expect(zakres("miesiac", teraz)).toEqual({ od: "2026-10-01", do: "2026-10-02" });
  });
});

describe("parametry zapytania", () => {
  it("dni idą do zaplecza jako chwile UTC: początek „Od” i ostatnia milisekunda „Do”", () => {
    expect(filtrZapytania({ ...PUSTY_FILTR, od: "2026-10-01", do: "2026-10-02" }, null, 1)).toEqual({
      group: undefined,
      subject_user_id: undefined,
      subject_search: undefined,
      actor_search: undefined,
      from: "2026-09-30T22:00:00.000Z",
      to: "2026-10-02T21:59:59.999Z",
      page: 1,
      per_page: 25,
    });
  });

  it("grupa, osoba ze znacznika, frazy przycięte; plik bez stron", () => {
    const parametry = filtrZapytania({ ...PUSTY_FILTR, grupa: "staz", dotyczy: "  Marta ", kto: "" }, 17);
    expect(parametry).toMatchObject({ group: "staz", subject_user_id: 17, subject_search: "Marta", actor_search: undefined });
    expect(parametry.page).toBeUndefined();
    expect(parametry.per_page).toBeUndefined();
  });

  it("błędny zakres dat ma zdanie, poprawny i niepełny — nie", () => {
    expect(bladZakresu({ ...PUSTY_FILTR, od: "2026-10-05", do: "2026-10-01" })).toBe(
      "Data „Od” jest późniejsza niż data „Do”. Zmień jedną z nich.",
    );
    expect(bladZakresu({ ...PUSTY_FILTR, od: "2026-10-01", do: "2026-10-01" })).toBeNull();
    expect(bladZakresu({ ...PUSTY_FILTR, od: "2026-10-01" })).toBeNull();
  });

  it("filtr aktywny, gdy którekolwiek pole ma wartość (same spacje nie)", () => {
    expect(filtrAktywny(PUSTY_FILTR)).toBe(false);
    expect(filtrAktywny({ ...PUSTY_FILTR, kto: "   " })).toBe(false);
    expect(filtrAktywny({ ...PUSTY_FILTR, grupa: "inne" })).toBe(true);
  });

  it("osoba z adresu: tylko dodatnia liczba całkowita", () => {
    expect(idZAdresu("17")).toBe(17);
    expect(idZAdresu("0")).toBeNull();
    expect(idZAdresu("-3")).toBeNull();
    expect(idZAdresu("17abc")).toBeNull();
    expect(idZAdresu("99999999999")).toBeNull();
    expect(idZAdresu(null)).toBeNull();
  });
});

describe("opis wiersza", () => {
  it("wpis o rzeczy osoby: grupa, zdanie, nazwa rzeczy w „Co”, osoba z odnośnikiem do karty, wykonawca", () => {
    expect(opiszWpis(wpis())).toEqual({
      id: 501,
      kiedy: "2 października 2026, 14:05",
      grupa: "Staż i dyżury",
      zdanie: "Zatwierdzono dyżur",
      rzecz: "Wpis w dzienniku stażu",
      kogo: { tekst: "Marta Demo", href: "/admin/uczestniczki/17" },
      kto: "Anna Opiekun",
    });
  });

  it("wpis o kursie: tytuł w „Kogo dotyczy”, bez odnośnika i bez powtórzenia w „Co”", () => {
    const opis = opiszWpis(
      wpis({ action: "course.created", group: { key: "kursy", label: "Kursy i testy" }, subject: { person: null, label: "Interwencja kryzysowa" } }),
    );
    expect(opis.kogo).toEqual({ tekst: "Interwencja kryzysowa", href: null });
    expect(opis.rzecz).toBeNull();
    expect(opis.zdanie).toBe("Utworzono kurs");
  });

  it("osoba ze zgłoszenia bez konta: nazwisko bez odnośnika; wpis bez osoby i rzeczy: kreska; bez wykonawcy: „System”", () => {
    expect(
      opiszWpis(wpis({ subject: { person: { id: null, first_name: "Ola", last_name: "Demo" }, label: "Zgłoszenie rekrutacyjne" } })).kogo,
    ).toEqual({ tekst: "Ola Demo", href: null });
    expect(opiszWpis(wpis({ subject: { person: null, label: null } })).kogo).toEqual({ tekst: "—", href: null });
    expect(opiszWpis(wpis({ actor: null })).kto).toBe("System");
  });

  it("nigdy typ techniczny i numer ani kod zdarzenia", () => {
    const opis = JSON.stringify(opiszWpis(wpis()));
    expect(opis).not.toMatch(/InternshipEntry|#\d|internship\.accepted|2026-10-02T/);
  });

  it("nazwa osoby do znacznika „Dotyczy” z wczytanych wpisów", () => {
    expect(nazwaOsobyZWpisow([wpis()], 17)).toBe("Marta Demo");
    expect(nazwaOsobyZWpisow([wpis()], 18)).toBeNull();
  });
});

describe("licznik i komunikat", () => {
  it("licznik „25 z 482” i komunikat z odmianą", () => {
    expect(licznik(25, 482)).toBe("25 z 482");
    expect(komunikatWyniku(25, 482)).toBe("Pokazano 25 z 482 wpisów");
    expect(komunikatWyniku(1, 1)).toBe("Pokazano 1 z 1 wpisu");
    expect(komunikatWyniku(0, 0)).toBe("Pokazano 0 z 0 wpisów");
  });

  it("błędy odczytu: brak odpowiedzi, brak dostępu, nie znaleziono, inny błąd", () => {
    const blad = (status: number) => new ApiError({ status, code: "x", message: "x" });
    expect(rodzajBledu(new TypeError("Failed to fetch"))).toBe("siec");
    expect(rodzajBledu(blad(401))).toBe("zakazane");
    expect(rodzajBledu(blad(403))).toBe("zakazane");
    expect(rodzajBledu(blad(404))).toBe("nie-znaleziono");
    expect(rodzajBledu(blad(500))).toBe("blad");
  });
});
