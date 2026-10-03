import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/klient";
import {
  adresSpotkania,
  czyMoznaSieZapisac,
  komunikatBleduAkcji,
  KOMUNIKAT_SIECI_AKCJI,
  nazwaTerminu,
  plakietkaTerminu,
  podzielTerminy,
  powodBlokady,
  rodzajBleduOdczytu,
  tekstMinut,
  tekstTerminow,
  tekstWolnychMiejsc,
  tekstZajetych,
  type TerminSuperwizji,
} from "../dane";

/**
 * Czyste funkcje ekranu „Superwizja”: podział terminów na części ekranu,
 * plakietki stanu, powody wyłączonych przycisków, odmiana liczebników,
 * odnośnik do spotkania i podział błędów odczytu oraz zapisu.
 */

function termin(nadpisz: Partial<TerminSuperwizji> = {}): TerminSuperwizji {
  return {
    id: 4,
    starts_at: "2026-10-15T12:00:00Z",
    duration_minutes: 60,
    seats_limit: 6,
    location_or_link: null,
    active_signups_count: 2,
    available_seats: 4,
    is_full: false,
    can_sign_up: true,
    signup: null,
    ...nadpisz,
  };
}

const ZAPIS = { signed_up_at: "2026-10-01T10:00:00Z", attendance: null };

function blad(status: number, code: string, message = "Komunikat serwera.") {
  return new ApiError({ status, code, message });
}

describe("superwizja — części ekranu i plakietki", () => {
  it("podział: Twoje (z zapisem, także minione), wolne (przed rozpoczęciem, bez zapisu), minione bez zapisu", () => {
    const twojPrzyszly = termin({ id: 1, signup: ZAPIS });
    const twojMiniony = termin({ id: 2, can_sign_up: false, signup: { ...ZAPIS, attendance: "present" } });
    const wolny = termin({ id: 3 });
    const pelny = termin({ id: 4, is_full: true, available_seats: 0, active_signups_count: 6 });
    const miniony = termin({ id: 5, can_sign_up: false });
    expect(podzielTerminy([twojMiniony, miniony, twojPrzyszly, wolny, pelny])).toEqual({
      twoje: [twojMiniony, twojPrzyszly],
      wolne: [wolny, pelny],
      minione: [miniony],
    });
  });

  it("plakietki: słowa ekranu terminów w administracji dla wolnego i pełnego terminu", () => {
    expect(plakietkaTerminu(termin())).toEqual({ tekst: "Wolne miejsca", wariant: "neutral" });
    expect(plakietkaTerminu(termin({ is_full: true }))).toEqual({ tekst: "Brak wolnych miejsc", wariant: "warn" });
    expect(plakietkaTerminu(termin({ signup: ZAPIS }))).toEqual({ tekst: "Zapisano Cię", wariant: "ok" });
    expect(plakietkaTerminu(termin({ can_sign_up: false }))).toEqual({ tekst: "Termin już się odbył", wariant: "neutral" });
  });

  it("obecność na minionym terminie: potwierdzona, nieobecność i brak wpisu nazwany wprost", () => {
    const miniony = (attendance: "present" | "absent" | null) =>
      plakietkaTerminu(termin({ can_sign_up: false, signup: { ...ZAPIS, attendance } })).tekst;
    expect(miniony("present")).toBe("Obecność potwierdzona");
    expect(miniony("absent")).toBe("Nieobecność");
    expect(miniony(null)).toBe("Obecność jeszcze nieoznaczona");
  });

  it("zapis możliwy tylko przed rozpoczęciem, bez zapisu osoby i z wolnym miejscem", () => {
    expect(czyMoznaSieZapisac(termin())).toBe(true);
    expect(czyMoznaSieZapisac(termin({ is_full: true }))).toBe(false);
    expect(czyMoznaSieZapisac(termin({ can_sign_up: false }))).toBe(false);
    expect(czyMoznaSieZapisac(termin({ signup: ZAPIS }))).toBe(false);
  });

  it("powód wyłączonego przycisku: rozpoczęty termin (zapis i wypis osobno) i pełny termin; aktywny bez powodu", () => {
    expect(powodBlokady(termin({ can_sign_up: false }))).toBe("Termin już się rozpoczął — zapis nie jest już możliwy.");
    expect(powodBlokady(termin({ can_sign_up: false, signup: ZAPIS }))).toBe(
      "Termin już się rozpoczął — wypis nie jest już możliwy.",
    );
    expect(powodBlokady(termin({ is_full: true }))).toBe("Brak wolnych miejsc — termin jest pełny. Wybierz inny termin.");
    // Pełny termin z zapisem osoby: wypis działa, bo serwer pozwala na niego przed rozpoczęciem.
    expect(powodBlokady(termin({ is_full: true, signup: ZAPIS }))).toBeNull();
    expect(powodBlokady(termin())).toBeNull();
  });
});

describe("superwizja — tekst i liczby", () => {
  it("data z godziną w czytelnym zapisie, w czasie polskim", () => {
    expect(nazwaTerminu(termin())).toBe("15 października 2026, 14:00");
    expect(nazwaTerminu(termin())).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("odmiana po liczbie: minuty, terminy, wolne miejsca", () => {
    expect([1, 2, 5, 45, 60, 90, 22].map(tekstMinut)).toEqual([
      "1 minuta",
      "2 minuty",
      "5 minut",
      "45 minut",
      "60 minut",
      "90 minut",
      "22 minuty",
    ]);
    expect([1, 3, 12, 25].map(tekstTerminow)).toEqual(["1 termin", "3 terminy", "12 terminów", "25 terminów"]);
    expect([1, 2, 4, 5, 0].map(tekstWolnychMiejsc)).toEqual([
      "1 wolne miejsce",
      "2 wolne miejsca",
      "4 wolne miejsca",
      "5 wolnych miejsc",
      "0 wolnych miejsc",
    ]);
    expect(tekstZajetych(termin())).toBe("2 z 6");
  });

  it("odnośnik do spotkania tylko z adresów http i https; reszta zostaje tekstem", () => {
    expect(adresSpotkania("https://przyklad.test/superwizja-1")).toBe("https://przyklad.test/superwizja-1");
    expect(adresSpotkania(" http://przyklad.test/s ")).toBe("http://przyklad.test/s");
    expect(adresSpotkania("ftp://przyklad.test/plik")).toBeNull();
    expect(adresSpotkania("Sala szkoleniowa, piętro 1")).toBeNull();
    expect(adresSpotkania("https://przyklad.test/a b")).toBeNull();
    expect(adresSpotkania(null)).toBeNull();
  });
});

describe("superwizja — błędy", () => {
  it("odczyt: sieć, brak dostępu, wygasły dostęp, nie znaleziono, błąd serwera", () => {
    expect(rodzajBleduOdczytu(new TypeError("Failed to fetch"))).toBe("siec");
    expect(rodzajBleduOdczytu(blad(401, "unauthenticated"))).toBe("zakazane");
    expect(rodzajBleduOdczytu(blad(403, "forbidden"))).toBe("zakazane");
    expect(rodzajBleduOdczytu(blad(403, "access_expired"))).toBe("wygasl");
    expect(rodzajBleduOdczytu(blad(404, "not_found"))).toBe("nie-znaleziono");
    expect(rodzajBleduOdczytu(blad(500, "server_error"))).toBe("blad");
  });

  it("zapis i wypis: pełny termin i cudzy superwizor mają własne zdania, sieć — zdanie o połączeniu, reszta — komunikat serwera", () => {
    expect(komunikatBleduAkcji(blad(409, "slot_full"))).toBe("Ten termin został właśnie zapełniony. Wybierz inny termin.");
    expect(komunikatBleduAkcji(blad(403, "not_your_supervisor"))).toBe(
      "Możesz zapisywać się tylko na terminy swojego superwizora.",
    );
    expect(komunikatBleduAkcji(new TypeError("Failed to fetch"))).toBe(KOMUNIKAT_SIECI_AKCJI);
    expect(komunikatBleduAkcji(blad(422, "validation_failed", "Po rozpoczęciu terminu nie można się wypisać."))).toBe(
      "Po rozpoczęciu terminu nie można się wypisać.",
    );
  });
});
