import { describe, expect, it } from "vitest";
import { formatujDziesietny } from "../formatuj-dziesietny";

describe("formatujDziesietny (jeden formater liczb dziesiętnych)", () => {
  it("dziesiętny string z API dostaje przecinek według pl-PL", () => {
    expect(formatujDziesietny("41.5")).toBe("41,5");
    expect(formatujDziesietny("72")).toBe("72");
    expect(formatujDziesietny("0.5")).toBe("0,5");
  });

  it("godziny dyżuru: 3,5 z przecinkiem, 2 bez części ułamkowej", () => {
    expect(formatujDziesietny("3.5")).toBe("3,5");
    expect(formatujDziesietny("2")).toBe("2");
    expect(formatujDziesietny("3.5")).not.toContain(".");
  });

  it("tysiące dostają wąską spację nierozdzielającą, jak w atomie Num", () => {
    expect(formatujDziesietny("12345.5")).toBe("12 345,5");
  });

  it("napis, który nie jest liczbą, wraca bez zmian (kontrola dodatnia: liczba się zmienia, napis nie)", () => {
    expect(formatujDziesietny("brak")).toBe("brak");
    expect(formatujDziesietny("")).toBe("");
    expect(formatujDziesietny("41.5")).not.toBe("41.5");
  });
});
