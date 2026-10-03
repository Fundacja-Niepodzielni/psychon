import { describe, expect, it } from "vitest";
import { nazwaAwaryjnaPliku, nazwaPlikuZNaglowka } from "../pliki";

/**
 * Nazwa pobieranego pliku z nagłówka `Content-Disposition`: postać
 * `filename*=` (RFC 5987) ma pierwszeństwo, nazwa nie niesie ukośników ani
 * znaków sterujących, a przy braku użytecznej nazwy wraca nazwa domyślna.
 */

const DOMYSLNA = "certyfikat.pdf";

describe("nazwaPlikuZNaglowka", () => {
  it("zwraca nazwę z filename=", () => {
    expect(nazwaPlikuZNaglowka("attachment; filename=certyfikat-NP-1.pdf", DOMYSLNA)).toBe("certyfikat-NP-1.pdf");
  });

  it("zwraca nazwę z filename= w cudzysłowie (ze spacją w nazwie)", () => {
    expect(nazwaPlikuZNaglowka('attachment; filename="a b.pdf"', DOMYSLNA)).toBe("a b.pdf");
  });

  it("dekoduje filename*= i przedkłada go nad filename=", () => {
    expect(
      nazwaPlikuZNaglowka("attachment; filename=\"stara.pdf\"; filename*=UTF-8''zaj%C4%85c.pdf", DOMYSLNA),
    ).toBe("zając.pdf");
  });

  it("przy niepoprawnym kodowaniu filename*= wraca do filename=", () => {
    expect(nazwaPlikuZNaglowka("attachment; filename=\"dobra.pdf\"; filename*=UTF-8''%E0%A4%A.pdf", DOMYSLNA)).toBe(
      "dobra.pdf",
    );
  });

  it("brak nagłówka albo pusty nagłówek daje nazwę domyślną", () => {
    expect(nazwaPlikuZNaglowka(null, DOMYSLNA)).toBe(DOMYSLNA);
    expect(nazwaPlikuZNaglowka(undefined, DOMYSLNA)).toBe(DOMYSLNA);
    expect(nazwaPlikuZNaglowka("", DOMYSLNA)).toBe(DOMYSLNA);
    expect(nazwaPlikuZNaglowka("attachment", DOMYSLNA)).toBe(DOMYSLNA);
  });

  it("zostawia tylko ostatni człon ścieżki (ukośnik i odwrotny ukośnik)", () => {
    expect(nazwaPlikuZNaglowka('attachment; filename="../../x/cert.pdf"', DOMYSLNA)).toBe("cert.pdf");
    expect(nazwaPlikuZNaglowka('attachment; filename="C:\\temp\\cert.pdf"', DOMYSLNA)).toBe("cert.pdf");
    expect(nazwaPlikuZNaglowka("attachment; filename*=UTF-8''..%2F..%2Fcert.pdf", DOMYSLNA)).toBe("cert.pdf");
  });

  it("nazwa złożona wyłącznie ze ścieżki albo z kropek daje nazwę domyślną", () => {
    expect(nazwaPlikuZNaglowka('attachment; filename="a/"', DOMYSLNA)).toBe(DOMYSLNA);
    expect(nazwaPlikuZNaglowka('attachment; filename=".."', DOMYSLNA)).toBe(DOMYSLNA);
  });

  it("usuwa znaki sterujące", () => {
    expect(nazwaPlikuZNaglowka("attachment; filename*=UTF-8''ce%00rt%0D%0Ay.pdf", DOMYSLNA)).toBe("certy.pdf");
  });
});

describe("nazwaPlikuZNaglowka — nazwa z samych spacji", () => {
  it("nazwa z samych spacji w cudzysłowie albo po kodowaniu procentowym daje nazwę domyślną", () => {
    expect(nazwaPlikuZNaglowka('attachment; filename="   "', DOMYSLNA)).toBe(DOMYSLNA);
    expect(nazwaPlikuZNaglowka("attachment; filename*=UTF-8''%20%20%20", DOMYSLNA)).toBe(DOMYSLNA);
  });

  it("nazwa z samych spacji w filename*= ustępuje użytecznej nazwie z filename=", () => {
    expect(nazwaPlikuZNaglowka("attachment; filename=\"ok.pdf\"; filename*=UTF-8''%20%20", DOMYSLNA)).toBe("ok.pdf");
  });
});

describe("nazwaAwaryjnaPliku", () => {
  it("application/pdf daje .pdf", () => {
    expect(nazwaAwaryjnaPliku("application/pdf", "certyfikat")).toBe("certyfikat.pdf");
  });

  it("text/html daje .html, także z parametrem i w dowolnej wielkości liter", () => {
    expect(nazwaAwaryjnaPliku("text/html", "certyfikat")).toBe("certyfikat.html");
    expect(nazwaAwaryjnaPliku("text/html; charset=utf-8", "certyfikat")).toBe("certyfikat.html");
    expect(nazwaAwaryjnaPliku("TEXT/HTML;charset=UTF-8", "certyfikat")).toBe("certyfikat.html");
    expect(nazwaAwaryjnaPliku("  Text/Html ; charset=utf-8", "certyfikat")).toBe("certyfikat.html");
  });

  it("inny typ, pusty typ i brak typu dają .pdf", () => {
    expect(nazwaAwaryjnaPliku("application/octet-stream", "certyfikat")).toBe("certyfikat.pdf");
    expect(nazwaAwaryjnaPliku("text/htmlx", "certyfikat")).toBe("certyfikat.pdf");
    expect(nazwaAwaryjnaPliku("", "certyfikat")).toBe("certyfikat.pdf");
    expect(nazwaAwaryjnaPliku(null, "certyfikat")).toBe("certyfikat.pdf");
    expect(nazwaAwaryjnaPliku(undefined, "certyfikat")).toBe("certyfikat.pdf");
  });
});
