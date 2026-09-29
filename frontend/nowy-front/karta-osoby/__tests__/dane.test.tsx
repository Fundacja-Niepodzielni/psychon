import { describe, expect, it } from "vitest";
import {
  filaryKartyOsoby,
  wierszeDanychOsoby,
  formularzZProfilu,
  kluczBleduPola,
  type PostepOsobyKarty,
  type ProfilOsobyKarty,
  type RzetelnoscOsobyKarty,
} from "../dane";

/**
 * Świadek jednostkowy modułu danych karty osoby (H18/H07) — funkcja karta →
 * filary, tabelaryczny (osoba z postępem, osoba bez postępu,
 * `reliability_percent: null`, 404 rzetelności), każdy z kontrolą dodatnią.
 */

const POSTEP_Z_DANYMI: PostepOsobyKarty = {
  courses_done: 8,
  courses_total: 10,
  hours_accepted: "41.5",
  supervision_present: 5,
  workshop_done: true,
  path_tests_passed: 3,
  path_tests_total: 4,
};

const POSTEP_ZERA: PostepOsobyKarty = {
  courses_done: 0,
  courses_total: 10,
  hours_accepted: "0",
  supervision_present: 0,
  workshop_done: false,
  path_tests_passed: 0,
  path_tests_total: 4,
};

const RZETELNOSC_LICZBA: RzetelnoscOsobyKarty = { reliability_percent: "40", below_threshold: true };
const RZETELNOSC_NULL: RzetelnoscOsobyKarty = { reliability_percent: null, below_threshold: false };

describe("filaryKartyOsoby — tabelaryczny", () => {
  it.each([
    ["osoba z postępem", POSTEP_Z_DANYMI, RZETELNOSC_LICZBA, 8, 40],
    ["osoba bez postępu (zera, nie pusto)", POSTEP_ZERA, RZETELNOSC_LICZBA, 0, 40],
    ["reliability_percent: null", POSTEP_Z_DANYMI, RZETELNOSC_NULL, 8, undefined],
    ["404 rzetelności (brak obiektu)", POSTEP_Z_DANYMI, null, 8, undefined],
  ] as const)("%s", (_nazwa, postep, rzetelnosc, oczekiwaneKursy, oczekiwanaRzetelnosc) => {
    const kafle = filaryKartyOsoby(postep, rzetelnosc);
    const kursy = kafle.find((k) => k.id === "filar-kursy");
    const rzet = kafle.find((k) => k.id === "filar-rzetelnosc");

    expect(kursy?.wartosc).toBe(oczekiwaneKursy);
    expect(rzet?.wartosc).toBe(oczekiwanaRzetelnosc);
  });

  it("kontrola dodatnia: zero godzin stażu i zero obecności renderują się jako liczba 0, nie jako brak", () => {
    const kafle = filaryKartyOsoby(POSTEP_ZERA, null);
    expect(kafle.find((k) => k.id === "filar-staz")?.wartosc).toBe(0);
    expect(kafle.find((k) => k.id === "filar-superwizje")?.wartosc).toBe(0);
    expect(kafle.find((k) => k.id === "filar-warsztat")?.wartosc).toBe(0);
  });

  it("kontrola dodatnia: warsztat ukończony daje wartość 1 i mianownik „ukończony”", () => {
    const kafle = filaryKartyOsoby(POSTEP_Z_DANYMI, null);
    const warsztat = kafle.find((k) => k.id === "filar-warsztat");
    expect(warsztat?.wartosc).toBe(1);
    expect(warsztat?.mianownik).toBe("ukończony");
  });

  it("below_threshold=true dopisuje podpowiedź o progu rzetelności", () => {
    const kafle = filaryKartyOsoby(POSTEP_Z_DANYMI, RZETELNOSC_LICZBA);
    expect(kafle.find((k) => k.id === "filar-rzetelnosc")?.podpowiedz).toMatch(/progu/);
  });
});

const PROFIL: ProfilOsobyKarty = {
  id: 17,
  first_name: "Marta",
  last_name: "Demo",
  email: "marta@demo.pl",
  role: "volunteer",
  phone: null,
  pesel: null,
  address: { street: null, city: null, zip: null },
  access_expires_at: null,
  program_completed_at: null,
  product_group: "psychon",
};

describe("wierszeDanychOsoby", () => {
  it("pola puste renderują się jako „Brak danych”, nie jako pusty string", () => {
    const wiersze = wierszeDanychOsoby(PROFIL);
    const telefon = wiersze.find((w) => w.id === "telefon");
    const pesel = wiersze.find((w) => w.id === "pesel");
    const adres = wiersze.find((w) => w.id === "adres");
    expect(telefon?.wartosci.wartosc).toBe("Brak danych");
    expect(pesel?.wartosci.wartosc).toBe("Brak danych");
    expect(adres?.wartosci.wartosc).toBe("Brak danych");
  });

  it("kontrola dodatnia: dostęp bezterminowy pokazuje słowo, nie null", () => {
    const wiersze = wierszeDanychOsoby(PROFIL);
    expect(wiersze.find((w) => w.id === "dostep")?.wartosci.wartosc).toBe("Bezterminowo");
  });

  it("dane wypełnione przechodzą bez zmian", () => {
    const wiersze = wierszeDanychOsoby({
      ...PROFIL,
      phone: "+48 600 100 200",
      pesel: "90010112345",
      address: { street: "Polna 1", city: "Warszawa", zip: "00-001" },
      access_expires_at: "2027-02-01T00:00:00Z",
    });
    expect(wiersze.find((w) => w.id === "telefon")?.wartosci.wartosc).toBe("+48 600 100 200");
    expect(wiersze.find((w) => w.id === "adres")?.wartosci.wartosc).toBe("Polna 1, Warszawa, 00-001");
    expect(wiersze.find((w) => w.id === "dostep")?.wartosci.wartosc).toBe("2027-02-01T00:00:00Z");
  });
});

describe("formularzZProfilu i kluczBleduPola", () => {
  it("zamienia null na pusty string dla pól formularza", () => {
    const formularz = formularzZProfilu(PROFIL);
    expect(formularz.phone).toBe("");
    expect(formularz.pesel).toBe("");
    expect(formularz.address_street).toBe("");
  });

  it("adres błędu 422 dla pól adresu niesie kropkę, zgodnie z UpdateUserRequest", () => {
    expect(kluczBleduPola("address_street")).toBe("address.street");
    expect(kluczBleduPola("address_city")).toBe("address.city");
    expect(kluczBleduPola("address_zip")).toBe("address.zip");
    expect(kluczBleduPola("first_name")).toBe("first_name");
  });
});
