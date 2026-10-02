import { describe, expect, it } from "vitest";
import { DOZWOLONE_HOSTY, rozwiazCelPrzegladarki } from "../e2e/_cel";

describe("cel testów przeglądarkowych", () => {
  it("lista dozwolonych hostów to wyłącznie adresy tej maszyny", () => {
    expect([...DOZWOLONE_HOSTY]).toEqual(["127.0.0.1", "localhost"]);
  });

  it("bez zmiennych odmawia startu i podpowiada PW_WEB_SERVER=1", () => {
    expect(() => rozwiazCelPrzegladarki({})).toThrow(/Ustaw PW_WEB_SERVER=1/);
  });

  it("puste PW_BASE_URL bez PW_WEB_SERVER też odmawia", () => {
    expect(() => rozwiazCelPrzegladarki({ PW_BASE_URL: "" })).toThrow(/Ustaw PW_WEB_SERVER=1/);
  });

  it("PW_WEB_SERVER=1 kieruje na 127.0.0.1 z domyślnym portem", () => {
    expect(rozwiazCelPrzegladarki({ PW_WEB_SERVER: "1" })).toEqual({
      baseURL: "http://127.0.0.1:3100",
      lokalnySerwer: true,
      port: "3100",
    });
  });

  it("PW_WEB_SERVER=1 z PW_PORT kieruje na 127.0.0.1 z tym portem", () => {
    expect(rozwiazCelPrzegladarki({ PW_WEB_SERVER: "1", PW_PORT: "4555" }).baseURL).toBe(
      "http://127.0.0.1:4555",
    );
  });

  it("przyjmuje adres frontu w kształcie, który ustawia uruchom.sh", () => {
    expect(rozwiazCelPrzegladarki({ PW_BASE_URL: "http://localhost:57301" })).toEqual({
      baseURL: "http://localhost:57301",
      lokalnySerwer: false,
      port: "3100",
    });
    expect(rozwiazCelPrzegladarki({ PW_BASE_URL: "http://127.0.0.1:57301" }).baseURL).toBe(
      "http://127.0.0.1:57301",
    );
  });

  it.each([
    "https://psychon-dev.niepodzielni.com",
    "http://psychon-dev.niepodzielni.com",
    "https://localhost:3100",
    "http://localhost.example.test:3100",
    "http://127.0.0.1.example.test:3100",
    "http://osoba:x@localhost:3100",
    "http://localhost:3100/panel",
    "http://localhost:3100/?a=1",
    "nie-adres",
  ])("odrzuca PW_BASE_URL=%s", (adres) => {
    expect(() => rozwiazCelPrzegladarki({ PW_BASE_URL: adres })).toThrow(/Ustaw PW_WEB_SERVER=1/);
  });

  it("adres spoza listy odrzuca także przy PW_WEB_SERVER=1", () => {
    expect(() =>
      rozwiazCelPrzegladarki({ PW_WEB_SERVER: "1", PW_BASE_URL: "https://psychon-dev.niepodzielni.com" }),
    ).toThrow(/spoza listy dozwolonych/);
  });

  it("PW_PORT inny niż liczba odmawia", () => {
    expect(() => rozwiazCelPrzegladarki({ PW_WEB_SERVER: "1", PW_PORT: "3100; echo" })).toThrow(
      /PW_PORT musi być liczbą/,
    );
  });
});
