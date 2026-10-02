import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/klient";
import {
  doZadania,
  idPola,
  KOMUNIKAT_BLEDU_ZAPISU,
  KOMUNIKAT_POPRAW_POLA,
  polaZBledem,
  sklasyfikujBladZapisu,
  zProfilu,
} from "../formularz";
import { PROFIL } from "./atrapy";

describe("zProfilu / doZadania", () => {
  it("wypełnia pola z profilu; puste wartości z serwera stają się pustymi napisami", () => {
    expect(zProfilu(PROFIL)).toEqual({
      first_name: "Marta",
      last_name: "Demo",
      phone: "+48 600 100 200",
      pesel: "90010112345",
      street: "Testowa 1",
      city: "Warszawa",
      zip: "00-001",
    });
    expect(
      zProfilu({ ...PROFIL, phone: null, pesel: null, address: { street: null, city: null, zip: null } }),
    ).toMatchObject({ phone: "", pesel: "", street: "", city: "", zip: "" });
  });

  it("ciało zapisu: puste telefon, PESEL i adres jako null; imię i nazwisko tak, jak wpisano; bez e-maila", () => {
    const zadanie = doZadania({ first_name: "", last_name: "Demo", phone: "", pesel: "", street: "", city: "Łódź", zip: "" });
    expect(zadanie).toEqual({
      first_name: "",
      last_name: "Demo",
      phone: null,
      pesel: null,
      address: { street: null, city: "Łódź", zip: null },
    });
    expect(zadanie).not.toHaveProperty("email");
  });
});

describe("sklasyfikujBladZapisu", () => {
  it("422 z errors: pierwszy komunikat każdego pola, adres z kluczy zagnieżdżonych", () => {
    const wynik = sklasyfikujBladZapisu(
      new ApiError({
        status: 422,
        code: "validation_failed",
        message: "Popraw zaznaczone pola.",
        errors: { pesel: ["Nieprawidłowy numer PESEL.", "drugi"], "address.zip": ["Kod pocztowy jest za długi."] },
      }),
    );
    expect(wynik.rodzaj).toBe("pola");
    expect(wynik.komunikat).toBe(KOMUNIKAT_POPRAW_POLA);
    expect(wynik.pola).toEqual({ pesel: "Nieprawidłowy numer PESEL.", zip: "Kod pocztowy jest za długi." });
    expect(wynik.inne).toEqual([]);
  });

  it("klucz spoza formularza nie ginie: jego zdanie trafia do „inne”", () => {
    const wynik = sklasyfikujBladZapisu(
      new ApiError({ status: 422, code: "validation_failed", message: "x", errors: { address: ["Adres ma nieprawidłowy format."] } }),
    );
    expect(wynik.pola).toEqual({});
    expect(wynik.inne).toEqual(["Adres ma nieprawidłowy format."]);
  });

  it("inny błąd API: zdanie z serwera; wyjątek bez odpowiedzi: zdanie ogólne", () => {
    expect(sklasyfikujBladZapisu(new ApiError({ status: 500, code: "x", message: "Awaria serwera." }))).toMatchObject({
      rodzaj: "serwer",
      komunikat: "Awaria serwera.",
    });
    expect(sklasyfikujBladZapisu(new TypeError("Failed to fetch"))).toMatchObject({
      rodzaj: "serwer",
      komunikat: KOMUNIKAT_BLEDU_ZAPISU,
    });
  });

  it("422 bez errors to zwykły błąd API", () => {
    expect(sklasyfikujBladZapisu(new ApiError({ status: 422, code: "x", message: "Odmowa." })).rodzaj).toBe("serwer");
  });
});

describe("polaZBledem / idPola", () => {
  it("pola z błędem w kolejności z ekranu; identyfikatory bez podkreśleń", () => {
    expect(polaZBledem({ zip: "a", first_name: "b", pesel: "c" })).toEqual(["first_name", "pesel", "zip"]);
    expect(idPola("first_name")).toBe("profil-first-name");
    expect(idPola("zip")).toBe("profil-zip");
  });
});
