import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { adresPowrotuAktywacji, stanPoBledzieWiazania, zdanieOczekiwania } from "../logika";

const blad = (status: number) => new ApiError({ status, code: "x", message: `komunikat ${status}` });

describe("logika aktywacji", () => {
  it("adres powrotu niesie zakodowany token", () => {
    expect(adresPowrotuAktywacji("abc")).toBe("/aktywacja?token=abc");
    expect(adresPowrotuAktywacji("a/b?c")).toBe("/aktywacja?token=a%2Fb%3Fc");
  });

  it("błąd wiązania → stan", () => {
    expect(stanPoBledzieWiazania(blad(401))).toBeNull();
    expect(stanPoBledzieWiazania(blad(403))).toEqual({ krok: "odmowa", komunikat: "komunikat 403" });
    expect(stanPoBledzieWiazania(blad(422))).toEqual({ krok: "blad", komunikat: "komunikat 422", mozliwePonowienie: false });
    expect(stanPoBledzieWiazania(blad(503))).toEqual({ krok: "blad", komunikat: "komunikat 503", mozliwePonowienie: true });
    expect(stanPoBledzieWiazania(new TypeError("x"))).toEqual({
      krok: "blad",
      komunikat: "Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę.",
      mozliwePonowienie: true,
    });
  });

  it("zdania oczekiwania", () => {
    expect(zdanieOczekiwania("sprawdzanie")).toBe("Trwa łączenie konta…");
    expect(zdanieOczekiwania("wiazanie")).toBe("Trwa łączenie konta…");
    expect(zdanieOczekiwania("sukces")).toBe("Konto powiązane. Przekierowuję…");
  });
});
