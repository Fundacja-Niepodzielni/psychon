import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/klient";
import { rodzajBledu } from "../rodzaj-bledu";

function blad(status: number, code = "x") {
  return new ApiError({ status, code, message: "komunikat" });
}

describe("rodzajBledu — klasyfikacja odpowiedzi", () => {
  it.each([
    { nazwa: "401 → zakazane", wyjatek: blad(401, "unauthenticated"), oczekiwany: "zakazane" },
    { nazwa: "403 → zakazane", wyjatek: blad(403, "forbidden"), oczekiwany: "zakazane" },
    { nazwa: "404 → nie-znaleziono", wyjatek: blad(404, "not_found"), oczekiwany: "nie-znaleziono" },
    { nazwa: "500 → blad", wyjatek: blad(500, "server_error"), oczekiwany: "blad" },
    { nazwa: "422 → blad", wyjatek: blad(422, "validation_failed"), oczekiwany: "blad" },
    { nazwa: "wyjątek bez odpowiedzi (fetch odrzucony) → siec", wyjatek: new TypeError("Failed to fetch"), oczekiwany: "siec" },
    { nazwa: "wartość spoza Error → siec", wyjatek: "tekst", oczekiwany: "siec" },
  ])("$nazwa", ({ wyjatek, oczekiwany }) => {
    expect(rodzajBledu(wyjatek)).toBe(oczekiwany);
  });

  it("kontrola dodatnia: zmiana samego statusu zmienia rodzaj", () => {
    expect(rodzajBledu(blad(403))).not.toBe(rodzajBledu(blad(404)));
    expect(rodzajBledu(blad(404))).not.toBe(rodzajBledu(blad(500)));
  });
});
