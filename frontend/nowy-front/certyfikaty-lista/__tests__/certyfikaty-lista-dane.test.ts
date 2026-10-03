import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Dane ekranu „Certyfikaty”: adres listy (z filtrem i bez), podział błędów na
 * odmowę, błąd serwera i brak połączenia oraz sprowadzenie wyniku
 * unieważnienia do trzech rodzajów.
 */

const apiPaged = vi.fn();
const api = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return {
    ...oryginal,
    apiPaged: (...args: unknown[]) => apiPaged(...args),
    api: (...args: unknown[]) => api(...args),
  };
});

const { ApiError } = await import("@/lib/api/klient");
const dane = await import("../dane");

beforeEach(() => {
  apiPaged.mockReset();
  api.mockReset();
});

describe("adres listy", () => {
  it("bez filtra jest dokładnie takim adresem jak na starym ekranie", () => {
    expect(dane.adresListy(dane.PUSTY_FILTR, 1)).toBe("/admin/certificates?page=1&per_page=25");
    expect(dane.adresListy(dane.PUSTY_FILTR, 3)).toBe("/admin/certificates?page=3&per_page=25");
    expect(dane.adresListy({ number: "  ", person: "\t" }, 1)).toBe("/admin/certificates?page=1&per_page=25");
  });

  it("filtr dopisuje numer i osobę po przycięciu, z kodowaniem znaków", () => {
    expect(dane.adresListy({ number: " NP/2026/017 ", person: "" }, 1)).toBe(
      "/admin/certificates?page=1&per_page=25&number=NP%2F2026%2F017",
    );
    expect(dane.adresListy({ number: "", person: " Marta Demo " }, 2)).toBe(
      "/admin/certificates?page=2&per_page=25&person=Marta+Demo",
    );
  });

  it("fraza dłuższa niż limit jest ucinana do 255 znaków", () => {
    const czysty = dane.oczyscFiltr({ number: "a".repeat(300), person: "b".repeat(300) });
    expect(czysty.number).toHaveLength(255);
    expect(czysty.person).toHaveLength(255);
  });

  it("filtr jest aktywny tylko przy niepustym polu", () => {
    expect(dane.filtrAktywny(dane.PUSTY_FILTR)).toBe(false);
    expect(dane.filtrAktywny({ number: "x", person: "" })).toBe(true);
    expect(dane.filtrAktywny({ number: "", person: "y" })).toBe(true);
  });

  it("odczyt woła listę tym adresem", async () => {
    apiPaged.mockResolvedValue({ data: [], meta: undefined });
    await dane.pobierzCertyfikaty({ number: "", person: "marta" }, 2);
    expect(apiPaged).toHaveBeenCalledWith("/admin/certificates?page=2&per_page=25&person=marta");
  });
});

describe("rodzaj błędu listy", () => {
  it("401 i 403 to brak uprawnień, inna odpowiedź serwera to błąd, wyjątek bez odpowiedzi to brak połączenia", () => {
    const blad = (status: number) => new ApiError({ status, code: "x", message: "x" });
    expect(dane.rodzajBledu(blad(401))).toBe("brak-uprawnien");
    expect(dane.rodzajBledu(blad(403))).toBe("brak-uprawnien");
    expect(dane.rodzajBledu(blad(404))).toBe("blad");
    expect(dane.rodzajBledu(blad(500))).toBe("blad");
    expect(dane.rodzajBledu(new TypeError("Failed to fetch"))).toBe("siec");
    expect(dane.rodzajBledu("coś innego")).toBe("siec");
  });
});

describe("wynik unieważnienia", () => {
  it("sukces: jedno żądanie POST z samym powodem", async () => {
    api.mockResolvedValue({ id: 17 });
    await expect(dane.wyslijUniewaznienie(17, "Powód rzeczowy.")).resolves.toEqual({ rodzaj: "ok" });
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/admin/certificates/17/revoke", { method: "POST", body: { reason: "Powód rzeczowy." } });
  });

  it("zdanie serwera o powodzie trafia pod pole", async () => {
    api.mockRejectedValue(
      new ApiError({ status: 422, code: "validation_failed", message: "Popraw.", errors: { reason: ["Za krótki."] } }),
    );
    await expect(dane.wyslijUniewaznienie(17, "x")).resolves.toEqual({ rodzaj: "blad-pola", komunikat: "Za krótki." });
  });

  it("inny błąd serwera niesie zdanie serwera, wyjątek bez odpowiedzi — zdanie o połączeniu", async () => {
    api.mockRejectedValueOnce(new ApiError({ status: 409, code: "already_revoked", message: "Ten certyfikat został już unieważniony." }));
    await expect(dane.wyslijUniewaznienie(17, "x")).resolves.toEqual({
      rodzaj: "blad",
      komunikat: "Ten certyfikat został już unieważniony.",
    });
    api.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(dane.wyslijUniewaznienie(17, "x")).resolves.toEqual({
      rodzaj: "blad",
      komunikat: dane.KOMUNIKAT_BLEDU_UNIEWAZNIENIA,
    });
  });
});

describe("stan słowami", () => {
  it("ważny i unieważniony, bez kodów technicznych", () => {
    expect(dane.ETYKIETA_STANU).toEqual({ valid: "ważny", revoked: "unieważniony" });
    expect(dane.WARIANT_STANU).toEqual({ valid: "ok", revoked: "error" });
  });
});
