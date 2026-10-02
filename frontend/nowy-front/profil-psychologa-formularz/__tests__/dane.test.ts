import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Żądania ekranu są dokładnie tymi, które wykonuje stary komponent (`POMIAR-STAREGO-EKRANU.md`):
 * te same trasy, metody i ciała. Kontrole dodatnie: każda trasa wołana dokładnie raz, z oczekiwanymi
 * argumentami.
 */

const api = vi.fn();
vi.mock("@/lib/api/klient", () => ({ api: (...args: unknown[]) => api(...args) }));

const dane = await import("../dane");
const { WNIOSEK_ROBOCZY } = await import("./atrapy");

beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue(WNIOSEK_ROBOCZY);
});

describe("żądania profilu psychologa", () => {
  it("odczyt: GET /psychologist-profile", async () => {
    await dane.pobierzWniosek();
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/psychologist-profile");
  });

  it("zapis: PATCH z listą specjalizacji, puste pola jako null", async () => {
    await dane.zapiszWniosek({ specjalizacje: " wsparcie w kryzysie ,, praca z młodymi dorosłymi , ", nurt: "", miasto: "Kraków", opis: "" });
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/psychologist-profile", {
      method: "PATCH",
      body: {
        specializations: ["wsparcie w kryzysie", "praca z młodymi dorosłymi"],
        approach: null,
        city: "Kraków",
        bio: null,
      },
    });
  });

  it("cialoZapisu: pusty tekst specjalizacji to pusta lista, wypełnione pola bez zmian", () => {
    expect(dane.cialoZapisu(dane.PUSTY_FORMULARZ).specializations).toEqual([]);
    expect(dane.cialoZapisu({ specjalizacje: "a", nurt: "b", miasto: "c", opis: "d" })).toEqual({
      specializations: ["a"],
      approach: "b",
      city: "c",
      bio: "d",
    });
  });

  it("załącznik: POST multipart z typem i plikiem, potem ponowny odczyt wniosku", async () => {
    const plik = new File(["%PDF-"], "dyplom.pdf", { type: "application/pdf" });
    const wynik = await dane.dodajZalacznik("dyplom", plik);

    expect(api).toHaveBeenCalledTimes(2);
    const [sciezka, opcje] = api.mock.calls[0];
    expect(sciezka).toBe("/psychologist-profile/documents");
    expect(opcje.method).toBe("POST");
    expect(opcje.body).toBeInstanceOf(FormData);
    expect(opcje.body.get("type")).toBe("dyplom");
    expect(opcje.body.get("file")).toBe(plik);
    expect(api.mock.calls[1]).toEqual(["/psychologist-profile"]);
    expect(wynik).toBe(WNIOSEK_ROBOCZY);
  });

  it("złożenie: POST ze zgodą z pola zaznaczenia; wartość false też jest wysyłana", async () => {
    await dane.zlozWniosek(true);
    await dane.zlozWniosek(false);
    expect(api).toHaveBeenNthCalledWith(1, "/psychologist-profile/submit", { method: "POST", body: { publication_consent: true } });
    expect(api).toHaveBeenNthCalledWith(2, "/psychologist-profile/submit", { method: "POST", body: { publication_consent: false } });
  });

  it("wycofanie zgody: POST bez ciała", async () => {
    await dane.wycofajZgode();
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/psychologist-profile/consent/withdraw", { method: "POST" });
  });

  it("formularzZWniosku: specjalizacje złączone przecinkiem, brak wartości to pusty tekst", () => {
    expect(dane.formularzZWniosku({ ...WNIOSEK_ROBOCZY, specializations: ["a", "b"], bio: "opis" })).toEqual({
      specjalizacje: "a, b",
      nurt: "poznawczo-behawioralny",
      miasto: "Kraków",
      opis: "opis",
    });
    expect(dane.formularzZWniosku({ ...WNIOSEK_ROBOCZY, specializations: null, approach: null, city: null, bio: null })).toEqual(
      dane.PUSTY_FORMULARZ,
    );
  });
});
