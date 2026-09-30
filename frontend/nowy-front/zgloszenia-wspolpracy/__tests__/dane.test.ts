import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/klient";
import type { AdminCooperationRequest } from "@/lib/api/h01-wspolpraca";
import {
  OPCJE_FILTRA,
  PLAKIETKA_STATUSU,
  czyBrakUprawnien,
  czyPasujeDoFiltra,
  moznaOdpowiedziec,
  nazwaOsoby,
  sklasyfikujBladOdpowiedzi,
} from "../dane";

function zgloszenie(nadpisz: Partial<AdminCooperationRequest> = {}): AdminCooperationRequest {
  return {
    id: 1,
    body: "Treść.",
    status: "new",
    response: null,
    responded_at: null,
    created_at: "2026-09-20T10:00:00Z",
    updated_at: "2026-09-20T10:00:00Z",
    responded_by: null,
    user: { id: 17, first_name: "Marta", last_name: "Demo", email: "marta@demo.pl" },
    ...nadpisz,
  };
}

function blad(status: number, code: string, message: string, errors?: Record<string, string[]>) {
  return new ApiError({ status, code, message, errors });
}

describe("statusy zgłoszeń", () => {
  it("każdy status ma polską etykietę, bez kodu wewnętrznego", () => {
    expect(PLAKIETKA_STATUSU.new.tekst).toBe("nowe");
    expect(PLAKIETKA_STATUSU.answered.tekst).toBe("z odpowiedzią");
    expect(PLAKIETKA_STATUSU.closed.tekst).toBe("zamknięte");
  });

  it("filtr zawiera „Wszystkie” i trzy statusy z kontraktu", () => {
    expect(OPCJE_FILTRA.map((opcja) => opcja.wartosc)).toEqual(["", "new", "answered", "closed"]);
    expect(OPCJE_FILTRA.map((opcja) => opcja.etykieta)).toEqual(["Wszystkie", "Nowe", "Z odpowiedzią", "Zamknięte"]);
  });
});

describe("osoba i uprawnienie do odpowiedzi", () => {
  it("nazwa osoby z imienia i nazwiska, a bez osoby „Osoba nieznana”", () => {
    expect(nazwaOsoby(zgloszenie())).toBe("Marta Demo");
    expect(nazwaOsoby(zgloszenie({ user: null }))).toBe("Osoba nieznana");
  });

  it("odpowiedzieć można na zgłoszenie nowe i z odpowiedzią, nie na zamknięte", () => {
    expect(moznaOdpowiedziec(zgloszenie({ status: "new" }))).toBe(true);
    expect(moznaOdpowiedziec(zgloszenie({ status: "answered" }))).toBe(true);
    expect(moznaOdpowiedziec(zgloszenie({ status: "closed" }))).toBe(false);
  });

  it("zgłoszenie pasuje do filtra pustego i do własnego statusu", () => {
    expect(czyPasujeDoFiltra(zgloszenie({ status: "answered" }), "")).toBe(true);
    expect(czyPasujeDoFiltra(zgloszenie({ status: "answered" }), "answered")).toBe(true);
    expect(czyPasujeDoFiltra(zgloszenie({ status: "answered" }), "new")).toBe(false);
  });
});

describe("klasyfikacja błędów", () => {
  it("odmowa roli przy odczycie to 401 i 403, błąd sieci i 500 nie", () => {
    expect(czyBrakUprawnien(blad(401, "unauthenticated", "x"))).toBe(true);
    expect(czyBrakUprawnien(blad(403, "forbidden", "x"))).toBe(true);
    expect(czyBrakUprawnien(blad(500, "server_error", "x"))).toBe(false);
    expect(czyBrakUprawnien(new TypeError("Failed to fetch"))).toBe(false);
  });

  it("422 z polami → błędy pól", () => {
    expect(sklasyfikujBladOdpowiedzi(blad(422, "validation_failed", "x", { response: ["Wpisz odpowiedź."] }))).toEqual({
      rodzaj: "pola",
      bledy: { response: ["Wpisz odpowiedź."] },
    });
  });

  it("403 cooperation_request_closed → zamknięte, z komunikatem z koperty", () => {
    expect(sklasyfikujBladOdpowiedzi(blad(403, "cooperation_request_closed", "Już zamknięte."))).toEqual({
      rodzaj: "zamkniete",
      komunikat: "Już zamknięte.",
    });
  });

  it("404 → brak zgłoszenia, inny błąd serwera → komunikat serwera, błąd sieci → komunikat ogólny", () => {
    expect(sklasyfikujBladOdpowiedzi(blad(404, "not_found", "x"))).toEqual({
      rodzaj: "brak-zgloszenia",
      komunikat: "Zgłoszenie nie istnieje.",
    });
    expect(sklasyfikujBladOdpowiedzi(blad(500, "server_error", "Błąd serwera."))).toEqual({
      rodzaj: "inny",
      komunikat: "Błąd serwera.",
    });
    expect(sklasyfikujBladOdpowiedzi(new TypeError("Failed to fetch"))).toEqual({
      rodzaj: "inny",
      komunikat: "Nie udało się zapisać odpowiedzi. Spróbuj ponownie.",
    });
  });

  it("403 z innym kodem nie jest „zamknięte”", () => {
    expect(sklasyfikujBladOdpowiedzi(blad(403, "forbidden", "Zabronione."))).toEqual({
      rodzaj: "inny",
      komunikat: "Zabronione.",
    });
  });
});
