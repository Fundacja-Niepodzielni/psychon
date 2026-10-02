import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/klient";
import {
  brakujaceGodziny,
  cialoZapisu,
  czyDoPoprawy,
  dzisiaj,
  nazwaFormy,
  nazwaWpisu,
  polaZWpisu,
  pustyFormularz,
  rodzajBleduOdczytu,
  sklasyfikujBladZapisu,
  stanWpisu,
  STANY_WPISU,
  tekstGodzin,
  tekstKonsultacji,
  tekstWpisow,
  type WpisStazu,
} from "../dane";

/**
 * Czyste funkcje dziennika stażu: nazwy stanów i form, odmiana liczebników,
 * godziny z jednostką „godz.”, ciało zapisu (te same pola co stary ekran) i
 * podział błędów odczytu i zapisu na stany ekranu.
 */

function wpis(nadpisz: Partial<WpisStazu> = {}): WpisStazu {
  return {
    id: 91,
    date: "2026-08-27",
    hours: "3.5",
    form: "phone_duty",
    consultations_count: 4,
    description: "Dyżur telefoniczny — bez danych osób.",
    status: "submitted",
    review_comment: null,
    decided_at: null,
    created_at: "2026-08-27T18:00:00Z",
    updated_at: "2026-08-27T18:00:00Z",
    ...nadpisz,
  };
}

function blad(status: number, code: string, message = "Komunikat serwera.", errors?: Record<string, string[]>) {
  return new ApiError({ status, code, message, errors });
}

describe("dziennik stażu — nazwy i liczby", () => {
  it("cztery stany wpisu mają po jednej nazwie i plakietce", () => {
    expect(STANY_WPISU).toEqual({
      submitted: { tekst: "Czeka na decyzję", wariant: "pending" },
      accepted: { tekst: "Zatwierdzony", wariant: "ok" },
      returned: { tekst: "Odesłany do poprawy", wariant: "warn" },
      rejected: { tekst: "Odrzucony", wariant: "error" },
    });
    expect(stanWpisu("nieznany")).toEqual(STANY_WPISU.submitted);
  });

  it("nazwy form dyżuru jak na starym ekranie; kod spoza słownika to „Inna forma”", () => {
    expect(nazwaFormy("phone_duty")).toBe("Dyżur telefoniczny");
    expect(nazwaFormy("chat_duty")).toBe("Czat");
    expect(nazwaFormy("other")).toBe("Inna forma");
    expect(nazwaFormy("nowa_forma")).toBe("Inna forma");
  });

  it("godziny po polsku z jednostką „godz.”", () => {
    expect(tekstGodzin("3.5")).toBe("3,5 godz.");
    expect(tekstGodzin("72")).toBe("72 godz.");
  });

  it("odmiana po liczbie: konsultacje i wpisy", () => {
    expect([0, 1, 2, 5, 12, 22].map(tekstKonsultacji)).toEqual([
      "0 konsultacji",
      "1 konsultacja",
      "2 konsultacje",
      "5 konsultacji",
      "12 konsultacji",
      "22 konsultacje",
    ]);
    expect([1, 3, 14, 24].map(tekstWpisow)).toEqual(["1 wpis", "3 wpisy", "14 wpisów", "24 wpisy"]);
  });

  it("nazwa wpisu z datą w czytelnym zapisie, nigdy RRRR-MM-DD", () => {
    expect(nazwaWpisu(wpis())).toBe("wpis z 27 sierpnia 2026");
    expect(nazwaWpisu(wpis())).not.toContain("2026-08-27");
  });

  it("brakujące godziny: różnica, zero po spełnieniu i `null`, gdy liczb brak", () => {
    expect(brakujaceGodziny({ zatwierdzone: "41.5", wymagane: "72" })).toBe("30.5");
    expect(brakujaceGodziny({ zatwierdzone: "80", wymagane: "72" })).toBe("0");
    expect(brakujaceGodziny({ zatwierdzone: "1", wymagane: "" })).toBeNull();
    expect(brakujaceGodziny({ zatwierdzone: "x", wymagane: "72" })).toBeNull();
  });

  it("poprawić można wpis czekający i odesłany; zatwierdzony i odrzucony są zamknięte", () => {
    expect(czyDoPoprawy(wpis({ status: "submitted" }))).toBe(true);
    expect(czyDoPoprawy(wpis({ status: "returned" }))).toBe(true);
    expect(czyDoPoprawy(wpis({ status: "accepted" }))).toBe(false);
    expect(czyDoPoprawy(wpis({ status: "rejected" }))).toBe(false);
  });
});

describe("dziennik stażu — formularz i ciało zapisu", () => {
  it("pusty formularz: dzisiejsza data, 0,5 godz., dyżur telefoniczny, 0 konsultacji, bez opisu", () => {
    const teraz = new Date(2026, 9, 2, 9, 30);
    expect(dzisiaj(teraz)).toBe("2026-10-02");
    expect(pustyFormularz(teraz)).toEqual({
      date: "2026-10-02",
      hours: "0.5",
      form: "phone_duty",
      consultations_count: "0",
      description: "",
    });
  });

  it("pola z wpisu: liczba konsultacji jako napis, brak opisu jako pusty napis", () => {
    expect(polaZWpisu(wpis({ description: null }))).toEqual({
      date: "2026-08-27",
      hours: "3.5",
      form: "phone_duty",
      consultations_count: "4",
      description: "",
    });
  });

  it("ciało zapisu: dokładnie pięć pól, konsultacje jako liczba, pusty opis jako null", () => {
    const cialo = cialoZapisu({ date: "2026-08-27", hours: "2", form: "chat_duty", consultations_count: "3", description: "" });
    expect(cialo).toEqual({ date: "2026-08-27", hours: "2", form: "chat_duty", consultations_count: 3, description: null });
    expect(Object.keys(cialo).sort()).toEqual(["consultations_count", "date", "description", "form", "hours"]);
    // Jak na starym ekranie: puste pole konsultacji to `Number("")`, czyli 0.
    expect(cialoZapisu({ ...pustyFormularz(), consultations_count: "" }).consultations_count).toBe(0);
  });
});

describe("dziennik stażu — błędy", () => {
  it("odczyt: brak odpowiedzi to sieć, 401/403 brak dostępu, wygasły dostęp osobno, 404 nie znaleziono, reszta błąd", () => {
    expect(rodzajBleduOdczytu(new TypeError("Failed to fetch"))).toBe("siec");
    expect(rodzajBleduOdczytu(blad(401, "unauthenticated"))).toBe("zakazane");
    expect(rodzajBleduOdczytu(blad(403, "forbidden"))).toBe("zakazane");
    expect(rodzajBleduOdczytu(blad(403, "access_expired"))).toBe("wygasl");
    expect(rodzajBleduOdczytu(blad(404, "not_found"))).toBe("nie-znaleziono");
    expect(rodzajBleduOdczytu(blad(500, "server_error"))).toBe("blad");
  });

  it("zapis: 422 to błędy pól (pola spoza formularza osobno), 403 entry_locked i 404 osobno, brak odpowiedzi to sieć", () => {
    expect(
      sklasyfikujBladZapisu(
        blad(422, "validation_failed", "Popraw zaznaczone pola.", {
          hours: ["Godziny podaj w krokach co 0,5."],
          internship_form_id: ["Wybierz aktywną formę stażu z listy."],
        }),
      ),
    ).toEqual({
      rodzaj: "pola",
      bledy: { hours: ["Godziny podaj w krokach co 0,5."], internship_form_id: ["Wybierz aktywną formę stażu z listy."] },
      pozostale: ["Wybierz aktywną formę stażu z listy."],
    });
    expect(sklasyfikujBladZapisu(blad(403, "entry_locked")).rodzaj).toBe("zablokowany");
    expect(sklasyfikujBladZapisu(blad(404, "not_found")).rodzaj).toBe("brak-wpisu");
    expect(sklasyfikujBladZapisu(new TypeError("Failed to fetch")).rodzaj).toBe("siec");
    expect(sklasyfikujBladZapisu(blad(403, "access_expired", "Twój dostęp wygasł."))).toEqual({
      rodzaj: "inny",
      komunikat: "Twój dostęp wygasł.",
    });
  });
});
