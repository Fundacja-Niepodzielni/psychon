import { describe, expect, it } from "vitest";
import { adresObcejRamki } from "../adres-obcej-ramki";

describe("adresObcejRamki — obca ramka poligonu tylko z domeny atrapy prób", () => {
  it("przyjmuje adresy https w domenie atrapy", () => {
    expect(adresObcejRamki("https://obcy.atrapa.test/ramka.html")).toBe("https://obcy.atrapa.test/ramka.html");
    expect(adresObcejRamki("https://odtwarzacz.atrapa.test/embed/wroga")).toBe("https://odtwarzacz.atrapa.test/embed/wroga");
  });

  it("brak parametru albo pusta wartość to brak ramki", () => {
    expect(adresObcejRamki(null)).toBeNull();
    expect(adresObcejRamki("")).toBeNull();
    expect(adresObcejRamki("   ")).toBeNull();
  });

  it("odrzuca adres z innej domeny, także podobnej do domeny atrapy", () => {
    expect(adresObcejRamki("https://example.com/ramka.html")).toBeNull();
    expect(adresObcejRamki("https://atrapa.test.example.com/")).toBeNull();
    expect(adresObcejRamki("https://xatrapa.test/")).toBeNull();
    expect(adresObcejRamki("https://obcy.atrapa.test.example.com/")).toBeNull();
    expect(adresObcejRamki("https://example.com/?u=https://obcy.atrapa.test/")).toBeNull();
  });

  it("odrzuca schematy inne niż https", () => {
    expect(adresObcejRamki("http://obcy.atrapa.test/ramka.html")).toBeNull();
    expect(adresObcejRamki("javascript:alert(1)")).toBeNull();
    expect(adresObcejRamki("data:text/html,<p>x</p>")).toBeNull();
    expect(adresObcejRamki("//obcy.atrapa.test/ramka.html")).toBeNull();
  });

  it("odrzuca dane logowania w adresie i wartość, która nie jest adresem", () => {
    expect(adresObcejRamki("https://ktos:haslo@obcy.atrapa.test/")).toBeNull();
    expect(adresObcejRamki("nie adres")).toBeNull();
  });
});
