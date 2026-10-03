import { describe, expect, it } from "vitest";
import { nazwaPlikuZNaglowka } from "../pliki";

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
