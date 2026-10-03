import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/klient";
import {
  bladPola,
  brakiWniosku,
  czyEdytowalny,
  czyMoznaWycofac,
  czyZmieniony,
  komunikatBledu,
  opisStanu,
  opisZalacznika,
  rodzajStanu,
  zdanieOBrakach,
  zdanieOZalacznikach,
  zdanieWycofania,
} from "../logika";
import { plakietkaStanu } from "../../profile-kolejka/dane";
import { DYPLOM, WNIOSEK_PUSTY, WNIOSEK_ROBOCZY, WNIOSEK_Z_DYPLOMEM } from "./atrapy";

/**
 * Teksty i reguły ekranu: nazwy stanów równe nazwom z administracji, rozpoznanie „nie ma jeszcze
 * wniosku”, co wolno w którym stanie, braki przed wysłaniem w stałej kolejności, odmiana liczebników
 * (1 · 2–4 · 5+ · 12–14 · 22) i wybór komunikatu pola z odpowiedzi serwera.
 */

describe("rodzajStanu", () => {
  it("pusty wniosek bez dat to „brak”, a zapisany draft to „draft”", () => {
    expect(rodzajStanu(WNIOSEK_PUSTY)).toBe("brak");
    expect(rodzajStanu(WNIOSEK_ROBOCZY)).toBe("draft");
  });

  it("każdy znany stan rozpoznany, nieznany nazwany wprost", () => {
    for (const stan of ["submitted", "returned", "accepted", "published", "withdrawn"] as const) {
      expect(rodzajStanu({ ...WNIOSEK_ROBOCZY, status: stan })).toBe(stan);
    }
    expect(rodzajStanu({ ...WNIOSEK_ROBOCZY, status: "cos-nowego" })).toBe("nieznany");
  });
});

describe("opisStanu — jedna nazwa stanu na wszystkich ekranach", () => {
  it.each(["draft", "submitted", "returned", "accepted", "published", "withdrawn"] as const)("%s ma nazwę z administracji", (stan) => {
    expect(opisStanu(stan).nazwa).toBe(plakietkaStanu(stan).etykieta);
    expect(opisStanu(stan).wariant).toBe(plakietkaStanu(stan).wariant);
  });

  it("nazwy konkretnych stanów", () => {
    expect(opisStanu("draft").nazwa).toBe("Wersja robocza");
    expect(opisStanu("submitted").nazwa).toBe("Czeka na decyzję");
    expect(opisStanu("returned").nazwa).toBe("Do poprawki");
    expect(opisStanu("accepted").nazwa).toBe("Zatwierdzony");
    expect(opisStanu("published").nazwa).toBe("Opublikowany");
    expect(opisStanu("withdrawn").nazwa).toBe("Zgoda wycofana");
  });

  it("każdy stan ma zdanie „co znaczy” i „co dalej”, niepuste i różne między stanami", () => {
    const stany = ["brak", "draft", "submitted", "returned", "accepted", "published", "withdrawn", "nieznany"] as const;
    const znaczy = stany.map((stan) => opisStanu(stan).znaczy);
    for (const stan of stany) {
      expect(opisStanu(stan).znaczy.length).toBeGreaterThan(10);
      expect(opisStanu(stan).dalej.length).toBeGreaterThan(10);
    }
    expect(new Set(znaczy).size).toBe(stany.length);
  });
});

describe("co wolno w którym stanie", () => {
  it("edytowalne: brak, draft, returned", () => {
    expect(["brak", "draft", "returned", "submitted", "accepted", "published", "withdrawn", "nieznany"].map((s) => czyEdytowalny(s as never))).toEqual([
      true, true, true, false, false, false, false, false,
    ]);
  });

  it("zgodę wycofać wolno: submitted, returned, accepted, published (serwer przyjmuje wycofanie przy każdej żywej zgodzie)", () => {
    expect(["brak", "draft", "returned", "submitted", "accepted", "published", "withdrawn"].map((s) => czyMoznaWycofac(s as never))).toEqual([
      false, false, true, true, true, true, false,
    ]);
  });
});

describe("zdanieWycofania — pytanie przed wycofaniem zgody (bez obietnic o trwałości i bez publicznej listy)", () => {
  it("opublikowany: profil zniknie z bazy psychologów Fundacji", () => {
    expect(zdanieWycofania("published")).toBe(
      "Profil zniknie z bazy psychologów Fundacji.",
    );
  });

  it.each(["submitted", "returned", "accepted"] as const)("%s: profil nie zostanie opublikowany", (rodzaj) => {
    expect(zdanieWycofania(rodzaj)).toBe(
      "Profil nie zostanie opublikowany w bazie psychologów Fundacji.",
    );
  });
});

describe("zgoda wycofana — opis stanu bez zdań o trwałej blokadzie", () => {
  it("znaczy i co dalej", () => {
    expect(opisStanu("withdrawn").znaczy).toBe("Zgoda na publikację została wycofana.");
    expect(opisStanu("withdrawn").dalej).toBe("Profil nie zostanie opublikowany w bazie psychologów Fundacji.");
  });
});

describe("brakiWniosku i zdanieOBrakach", () => {
  it("pusty wniosek bez zgody: pięć braków w stałej kolejności", () => {
    expect(brakiWniosku(WNIOSEK_PUSTY, false)).toEqual(["specializations", "approach", "city", "documents", "consent"]);
  });

  it("zgoda i dyplom zdejmują swoje braki; sam inny załącznik nie zastępuje dyplomu", () => {
    expect(brakiWniosku(WNIOSEK_ROBOCZY, false)).toEqual(["documents", "consent"]);
    expect(brakiWniosku(WNIOSEK_Z_DYPLOMEM, false)).toEqual(["consent"]);
    expect(brakiWniosku(WNIOSEK_Z_DYPLOMEM, true)).toEqual([]);
    expect(brakiWniosku({ ...WNIOSEK_ROBOCZY, documents: [{ ...DYPLOM, type: "inne" }] }, true)).toEqual(["documents"]);
  });

  it("pola z samych spacji i pusta lista specjalizacji to braki", () => {
    expect(brakiWniosku({ ...WNIOSEK_Z_DYPLOMEM, approach: "  ", city: " ", specializations: [] }, true)).toEqual([
      "specializations",
      "approach",
      "city",
    ]);
  });

  it.each([
    [["consent"], "Brakuje 1 elementu: zgoda na publikację."],
    [["documents", "consent"], "Brakuje 2 elementów: dyplom, zgoda na publikację."],
    [["specializations", "approach", "city", "documents", "consent"], "Brakuje 5 elementów: specjalizacje, nurt terapeutyczny, miasto, dyplom, zgoda na publikację."],
    [["nowy-klucz"], "Brakuje 1 elementu: nowy-klucz."],
  ])("zdanie dla %j", (klucze, zdanie) => {
    expect(zdanieOBrakach(klucze)).toBe(zdanie);
  });
});

describe("załączniki", () => {
  it.each([
    [0, "Nie dodano jeszcze żadnych załączników."],
    [1, "Masz 1 załącznik."],
    [2, "Masz 2 załączniki."],
    [5, "Masz 5 załączników."],
    [12, "Masz 12 załączników."],
    [22, "Masz 22 załączniki."],
  ])("%i", (liczba, zdanie) => {
    expect(zdanieOZalacznikach(liczba)).toBe(zdanie);
  });

  it("opis: typ po polsku i data przez wspólny formater", () => {
    expect(opisZalacznika(DYPLOM)).toBe("Dyplom · dodano 10 września 2026");
    expect(opisZalacznika({ type: "niekaralnosc", uploaded_at: "2026-09-11T08:00:00Z" })).toBe(
      "Zaświadczenie o niekaralności · dodano 11 września 2026",
    );
  });
});

describe("błędy serwera i zmiany", () => {
  it("bladPola: dokładny klucz, błąd pozycji listy, brak błędu", () => {
    expect(bladPola({ approach: ["za długie"] }, "approach")).toBe("za długie");
    expect(bladPola({ "specializations.0": ["Każda specjalizacja musi być tekstem."] }, "specializations")).toBe(
      "Każda specjalizacja musi być tekstem.",
    );
    expect(bladPola({ approach: ["x"] }, "city")).toBeUndefined();
    expect(bladPola({ approach_x: ["x"] }, "approach")).toBeUndefined();
  });

  it("komunikatBledu: tekst z serwera albo zdanie zastępcze", () => {
    expect(komunikatBledu(new ApiError({ status: 500, code: "x", message: "Serwer." }), "zastępczy")).toBe("Serwer.");
    expect(komunikatBledu(new TypeError("fetch"), "zastępczy")).toBe("zastępczy");
  });

  it("czyZmieniony: każde pole osobno", () => {
    const baza = { specjalizacje: "a", nurt: "b", miasto: "c", opis: "d" };
    expect(czyZmieniony(baza, { ...baza })).toBe(false);
    for (const pole of ["specjalizacje", "nurt", "miasto", "opis"] as const) {
      expect(czyZmieniony({ ...baza, [pole]: "x" }, baza)).toBe(true);
    }
  });
});
