import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WNIOSEK } from "./atrapy";

/**
 * Moduł danych decyzji o wniosku o profil: adresy, metody i ciała żądań, klasyfikacja
 * błędów z koperty oraz zgodność atrapy z kluczami zasobu zaplecza.
 */

vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const api = vi.fn();
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, api: (...a: unknown[]) => api(...a) };
});
const downloadFile = vi.fn();
vi.mock("@/lib/api/pliki", () => ({ downloadFile: (...a: unknown[]) => downloadFile(...a) }));

const { ApiError } = await import("@/lib/api/klient");
const dane = await import("../dane");

beforeEach(() => {
  api.mockReset();
  downloadFile.mockReset();
});

function bladApi(status: number, code: string, message: string, extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) {
  return new ApiError({ status, code, message, ...extra });
}

function klucze(plik: string): string[] {
  const zasob = readFileSync(join(process.cwd(), "..", "backend/app/Http/Resources/H15", plik), "utf-8");
  const cialo = zasob.slice(zasob.indexOf("return ["), zasob.lastIndexOf("];"));
  return [...cialo.matchAll(/^ {12}'([a-z_]+)' =>/gm)].map((m) => m[1]).sort();
}

describe("zgodność atrapy ze źródłem kształtu", () => {
  it("klucze atrapy wniosku = klucze AdminPsychologistProfileResource::toArray", () => {
    const oczekiwane = klucze("AdminPsychologistProfileResource.php");
    expect(oczekiwane.length).toBeGreaterThan(10);
    expect(Object.keys(WNIOSEK).sort()).toEqual(oczekiwane);
  });

  it("klucze załącznika w atrapie = klucze AdminProfileDocumentResource::toArray", () => {
    expect(Object.keys(WNIOSEK.documents[0]).sort()).toEqual(klucze("AdminProfileDocumentResource.php"));
  });

  it("trasy ekranu istnieją w h15.php: show, accept, return, dokument", () => {
    const trasy = readFileSync(join(process.cwd(), "..", "backend/routes/api/h15.php"), "utf-8");
    for (const wzorzec of [
      "Route::get('/admin/profiles/{id}'",
      "Route::post('/admin/profiles/{id}/accept'",
      "Route::post('/admin/profiles/{id}/return'",
      "Route::get('/admin/profiles/{profileId}/documents/{docId}'",
    ]) {
      expect(trasy).toContain(wzorzec);
    }
  });
});

describe("odczyt wniosku", () => {
  it("GET /admin/profiles/{id} → gotowy", async () => {
    api.mockResolvedValue(WNIOSEK);
    expect(await dane.wczytajWniosek(12)).toEqual({ rodzaj: "gotowy", wniosek: WNIOSEK });
    expect(api).toHaveBeenCalledWith("/admin/profiles/12");
  });

  it.each([
    [401, "unauthenticated", "brak-uprawnien"],
    [403, "forbidden", "brak-uprawnien"],
    [404, "not_found", "nie-znaleziono"],
    [500, "unknown_error", "blad"],
  ])("status %i → %s", async (status, code, rodzaj) => {
    api.mockRejectedValue(bladApi(status, code, "x"));
    expect((await dane.wczytajWniosek(12)).rodzaj).toBe(rodzaj);
  });

  it("wyjątek sieci → blad", async () => {
    api.mockRejectedValue(new TypeError("Failed to fetch"));
    expect((await dane.wczytajWniosek(12)).rodzaj).toBe("blad");
  });
});

describe("akceptacja", () => {
  it("POST accept bez ciała → wniosek po zmianie", async () => {
    const zaakceptowany = { ...WNIOSEK, status: "accepted" as const };
    api.mockResolvedValue(zaakceptowany);
    expect(await dane.zaakceptujWniosek(12)).toEqual({ rodzaj: "zapisano", wniosek: zaakceptowany });
    expect(api).toHaveBeenCalledWith("/admin/profiles/12/accept", { method: "POST" });
  });

  it("403 entry_locked → rozstrzygniete; inne 403 → brak uprawnień; 404; błąd sieci", async () => {
    api.mockRejectedValueOnce(bladApi(403, "entry_locked", "Ten wniosek został już rozstrzygnięty."));
    expect(await dane.zaakceptujWniosek(12)).toEqual({ rodzaj: "rozstrzygniete", komunikat: "Ten wniosek został już rozstrzygnięty." });
    api.mockRejectedValueOnce(bladApi(403, "forbidden", "Nie masz dostępu do tego zasobu."));
    expect((await dane.zaakceptujWniosek(12)).rodzaj).toBe("brak-uprawnien");
    api.mockRejectedValueOnce(bladApi(404, "not_found", "Nie znaleziono wniosku."));
    expect((await dane.zaakceptujWniosek(12)).rodzaj).toBe("nie-znaleziono");
    api.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await dane.zaakceptujWniosek(12)).toEqual({ rodzaj: "blad", komunikat: "Nie udało się zaakceptować wniosku. Spróbuj ponownie." });
  });
});

describe("odesłanie do poprawy", () => {
  it("POST return z polem reason → wniosek po zmianie", async () => {
    const odeslany = { ...WNIOSEK, status: "returned" as const, return_reason: "Uzupełnij." };
    api.mockResolvedValue(odeslany);
    expect(await dane.odeslijWniosek(12, "Uzupełnij.")).toEqual({ rodzaj: "zapisano", wniosek: odeslany });
    expect(api).toHaveBeenCalledWith("/admin/profiles/12/return", { method: "POST", body: { reason: "Uzupełnij." } });
  });

  it("422 z polami → bledy-pol; 403 entry_locked → rozstrzygniete", async () => {
    api.mockRejectedValueOnce(bladApi(422, "validation_failed", "Popraw zaznaczone pola.", { errors: { reason: ["Podaj komentarz."] } }));
    expect(await dane.odeslijWniosek(12, "x")).toEqual({
      rodzaj: "bledy-pol",
      komunikat: "Popraw zaznaczone pola.",
      bledy: { reason: ["Podaj komentarz."] },
    });
    api.mockRejectedValueOnce(bladApi(403, "entry_locked", "Ten wniosek został już rozstrzygnięty."));
    expect((await dane.odeslijWniosek(12, "x")).rodzaj).toBe("rozstrzygniete");
  });
});

describe("załącznik", () => {
  it("pobiera podpisanym adresem z odpowiedzi, z nazwą typ-id", async () => {
    downloadFile.mockResolvedValue(undefined);
    expect(await dane.pobierzZalacznik(WNIOSEK.documents[0].download_url, "dyplom-5")).toEqual({ rodzaj: "pobrano" });
    expect(downloadFile).toHaveBeenCalledWith(WNIOSEK.documents[0].download_url, "dyplom-5");
  });

  it("404 → komunikat z koperty; inny błąd → własne zdanie o wygasającym linku", async () => {
    downloadFile.mockRejectedValueOnce(bladApi(404, "not_found", "Nie znaleziono załącznika."));
    expect(await dane.pobierzZalacznik("u", "n")).toEqual({ rodzaj: "blad", komunikat: "Nie znaleziono załącznika." });
    downloadFile.mockRejectedValueOnce(bladApi(403, "invalid_signature", "Invalid signature."));
    const wynik = await dane.pobierzZalacznik("u", "n");
    expect(wynik.rodzaj).toBe("blad");
    expect(wynik.rodzaj === "blad" && wynik.komunikat).toMatch(/wygasa po 15 minutach/);
  });
});

describe("pomocnicze", () => {
  it("poprawneId przyjmuje tylko dodatnie liczby całkowite", () => {
    expect(dane.poprawneId("12")).toBe(12);
    for (const zle of ["0", "-1", "abc", "3.5", "", "07"]) expect(dane.poprawneId(zle)).toBeNull();
  });

  it("data po polsku, brak daty → myślnik", () => {
    expect(dane.dataPl("2026-09-12T09:00:00Z")).toBe("12 września 2026");
    expect(dane.dataPl(null)).toBe("—");
  });

  it("etykiety załączników pokrywają trzy typy", () => {
    expect(Object.keys(dane.ETYKIETY_ZALACZNIKOW).sort()).toEqual(["dyplom", "inne", "niekaralnosc"]);
  });
});
