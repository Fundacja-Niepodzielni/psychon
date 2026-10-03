import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ZGLOSZENIE } from "./atrapy";

/**
 * Moduł danych decyzji o zgłoszeniu: adresy, metody i ciała żądań, klasyfikacja
 * błędów z koperty oraz zgodność atrapy z kluczami zasobu i schematu odpowiedzi.
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

describe("zgodność atrapy ze źródłem kształtu", () => {
  it("klucze atrapy zgłoszenia = klucze ApplicationResource::toArray", () => {
    const zasob = readFileSync(join(process.cwd(), "..", "backend/app/Http/Resources/H03/ApplicationResource.php"), "utf-8");
    const cialo = zasob.slice(zasob.indexOf("return ["), zasob.indexOf("];"));
    const klucze = [...cialo.matchAll(/^\s+'([a-z_]+)' =>/gm)].map((m) => m[1]).sort();
    expect(klucze.length).toBeGreaterThan(15);
    expect(Object.keys(ZGLOSZENIE).sort()).toEqual(klucze);
  });

  it("odpowiedź odrzucenia niesie rejection_mail sent|failed obok zasobu zgłoszenia (ApplicationController::reject)", () => {
    const kontroler = readFileSync(
      join(process.cwd(), "..", "backend/app/Http/Controllers/Api/V1/Admin/ApplicationController.php"),
      "utf-8",
    );
    const poczatek = kontroler.indexOf("public function reject(");
    const cialo = kontroler.slice(poczatek, kontroler.indexOf("public function import(", poczatek));
    expect(poczatek).toBeGreaterThan(-1);
    expect(cialo).toMatch(/\.\.\.ApplicationResource::make\(\$application\)->resolve\(\$request\)/);
    expect(cialo).toMatch(/'rejection_mail' => \$sent \? 'sent' : 'failed'/);
  });

  it("odpowiedź akceptacji ma klucze schematu openapi.json", () => {
    const schemat = JSON.parse(readFileSync(join(process.cwd(), "..", "backend/openapi.json"), "utf-8"));
    const odpowiedz =
      schemat.paths["/v1/admin/applications/{id}/accept"].post.responses["201"].content["application/json"].schema;
    expect(Object.keys(odpowiedz.properties.data.properties).sort()).toEqual([
      "access_expires_at",
      "invitation_mail",
      "user_id",
    ]);
  });
});

describe("odczyt zgłoszenia", () => {
  it("GET /admin/applications/{id} → gotowy", async () => {
    api.mockResolvedValue(ZGLOSZENIE);
    expect(await dane.wczytajZgloszenie(31)).toEqual({ rodzaj: "gotowy", zgloszenie: ZGLOSZENIE });
    expect(api).toHaveBeenCalledWith("/admin/applications/31");
  });

  it.each([
    [401, "unauthenticated", "brak-uprawnien"],
    [403, "forbidden", "brak-uprawnien"],
    [404, "not_found", "nie-znaleziono"],
    [500, "unknown_error", "blad"],
  ])("status %i → %s", async (status, code, rodzaj) => {
    api.mockRejectedValue(bladApi(status, code, "x"));
    expect((await dane.wczytajZgloszenie(31)).rodzaj).toBe(rodzaj);
  });

  it("wyjątek sieci → blad", async () => {
    api.mockRejectedValue(new TypeError("Failed to fetch"));
    expect((await dane.wczytajZgloszenie(31)).rodzaj).toBe("blad");
  });
});

describe("akceptacja", () => {
  it("POST accept z samą rolą; bez force gdy limit nie jest wymuszany", async () => {
    api.mockResolvedValue({ user_id: 44, access_expires_at: "2027-03-12T09:00:00Z", invitation_mail: "sent" });
    const wynik = await dane.zaakceptujZgloszenie(31, "student", false);
    expect(wynik).toEqual({ rodzaj: "zaakceptowano", userId: 44, zaproszenie: "sent" });
    expect(api).toHaveBeenCalledWith("/admin/applications/31/accept", { method: "POST", body: { role: "student" } });
  });

  it("wymuszenie limitu dokłada force:true", async () => {
    api.mockResolvedValue({ user_id: 44, access_expires_at: "2027-03-12T09:00:00Z", invitation_mail: "failed" });
    const wynik = await dane.zaakceptujZgloszenie(31, "volunteer", true);
    expect(wynik).toEqual({ rodzaj: "zaakceptowano", userId: 44, zaproszenie: "failed" });
    expect(api).toHaveBeenCalledWith("/admin/applications/31/accept", {
      method: "POST",
      body: { role: "volunteer", force: true },
    });
  });

  it("409 email_already_registered niesie komunikat z koperty i existing_user_id", async () => {
    api.mockRejectedValue(
      bladApi(409, "email_already_registered", "Na ten adres jest już zarejestrowane konto.", {
        reason: { existing_user_id: 17 },
      }),
    );
    expect(await dane.zaakceptujZgloszenie(31, "volunteer", false)).toEqual({
      rodzaj: "istnieje-konto",
      komunikat: "Na ten adres jest już zarejestrowane konto.",
      istniejacaOsoba: 17,
    });
  });

  it("409 edition_capacity_exceeded niesie limit i liczbę zajętych", async () => {
    api.mockRejectedValue(
      bladApi(409, "edition_capacity_exceeded", "Limit miejsc w edycji został przekroczony.", {
        reason: { capacity: 20, active: 20, requested: 1 },
      }),
    );
    expect(await dane.zaakceptujZgloszenie(31, "volunteer", false)).toEqual({
      rodzaj: "limit-miejsc",
      komunikat: "Limit miejsc w edycji został przekroczony.",
      limit: 20,
      zajete: 20,
    });
  });

  it("409 application_already_decided, 422, 403, 404, błąd sieci", async () => {
    api.mockRejectedValueOnce(bladApi(409, "application_already_decided", "Zgłoszenie zostało już rozstrzygnięte."));
    expect((await dane.zaakceptujZgloszenie(31, "volunteer", false)).rodzaj).toBe("rozstrzygniete");
    api.mockRejectedValueOnce(bladApi(422, "validation_failed", "Popraw zaznaczone pola.", { errors: { role: ["Nieznana rola."] } }));
    expect(await dane.zaakceptujZgloszenie(31, "volunteer", false)).toEqual({
      rodzaj: "bledy-pol",
      komunikat: "Popraw zaznaczone pola.",
      bledy: { role: ["Nieznana rola."] },
    });
    api.mockRejectedValueOnce(bladApi(403, "forbidden", "Nie masz dostępu do tego zasobu."));
    expect((await dane.zaakceptujZgloszenie(31, "volunteer", false)).rodzaj).toBe("brak-uprawnien");
    api.mockRejectedValueOnce(bladApi(404, "not_found", "Nie znaleziono zgłoszenia."));
    expect((await dane.zaakceptujZgloszenie(31, "volunteer", false)).rodzaj).toBe("nie-znaleziono");
    api.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect((await dane.zaakceptujZgloszenie(31, "volunteer", false)).rodzaj).toBe("blad");
  });
});

describe("odrzucenie", () => {
  it("POST reject z polem reason → zgłoszenie po zmianie i stan wiadomości do kandydata osobno", async () => {
    const odrzucone = { ...ZGLOSZENIE, status: "rejected" as const, rejection_reason: "Brak dyplomu." };
    api.mockResolvedValue({ ...odrzucone, rejection_mail: "sent" });
    expect(await dane.odrzucZgloszenie(31, "Brak dyplomu.")).toEqual({ rodzaj: "odrzucono", zgloszenie: odrzucone, wiadomosc: "sent" });
    expect(api).toHaveBeenCalledWith("/admin/applications/31/reject", { method: "POST", body: { reason: "Brak dyplomu." } });
  });

  it.each([
    ["failed", "failed"],
    [undefined, null],
    ["queued", null],
  ])("rejection_mail %s → wiadomosc %s; zasób zgłoszenia bez tego pola", async (pole, oczekiwane) => {
    const odrzucone = { ...ZGLOSZENIE, status: "rejected" as const, rejection_reason: "Brak dyplomu." };
    api.mockResolvedValue(pole === undefined ? odrzucone : { ...odrzucone, rejection_mail: pole });
    const wynik = await dane.odrzucZgloszenie(31, "Brak dyplomu.");
    expect(wynik).toEqual({ rodzaj: "odrzucono", zgloszenie: odrzucone, wiadomosc: oczekiwane });
    expect(wynik.rodzaj === "odrzucono" && "rejection_mail" in wynik.zgloszenie).toBe(false);
  });

  it("422 z polami, 409 rozstrzygnięte, 403, 404", async () => {
    api.mockRejectedValueOnce(bladApi(422, "validation_failed", "Popraw zaznaczone pola.", { errors: { reason: ["Podaj powód odrzucenia zgłoszenia."] } }));
    expect((await dane.odrzucZgloszenie(31, "x")).rodzaj).toBe("bledy-pol");
    api.mockRejectedValueOnce(bladApi(409, "application_already_decided", "Zgłoszenie zostało już rozstrzygnięte."));
    expect((await dane.odrzucZgloszenie(31, "x")).rodzaj).toBe("rozstrzygniete");
    api.mockRejectedValueOnce(bladApi(403, "forbidden", "Nie masz dostępu do tego zasobu."));
    expect((await dane.odrzucZgloszenie(31, "x")).rodzaj).toBe("brak-uprawnien");
    api.mockRejectedValueOnce(bladApi(404, "not_found", "Nie znaleziono zgłoszenia."));
    expect((await dane.odrzucZgloszenie(31, "x")).rodzaj).toBe("nie-znaleziono");
  });
});

describe("skan dyplomu", () => {
  it("pobiera z adresu trasy diploma-scan z tokenem osoby", async () => {
    downloadFile.mockResolvedValue(undefined);
    expect(await dane.pobierzSkanDyplomu(31)).toEqual({ rodzaj: "pobrano" });
    expect(downloadFile).toHaveBeenCalledWith("http://localhost:8000/api/v1/admin/applications/31/diploma-scan", "skan-dyplomu-31");
  });

  it("błąd koperty → komunikat z serwera", async () => {
    downloadFile.mockRejectedValue(bladApi(404, "diploma_scan_not_found", "Nie znaleziono pliku skanu dyplomu."));
    expect(await dane.pobierzSkanDyplomu(31)).toEqual({ rodzaj: "blad", komunikat: "Nie znaleziono pliku skanu dyplomu." });
  });
});

describe("pomocnicze", () => {
  it("poprawneId przyjmuje tylko dodatnie liczby całkowite", () => {
    expect(dane.poprawneId("31")).toBe(31);
    for (const zle of ["0", "-1", "abc", "3.5", "", "07"]) expect(dane.poprawneId(zle)).toBeNull();
  });

  it("rola domyślna: rola ze zgłoszenia, rola administracji zamieniona na wolontariusza", () => {
    expect(dane.rolaDomyslna("instructor")).toBe("instructor");
    expect(dane.rolaDomyslna("super_admin")).toBe("volunteer");
    expect(dane.rolaDomyslna("project_manager")).toBe("volunteer");
  });

  it("opcje roli przy akceptacji to tylko role nadawane w PsychON, bez ról administracji", () => {
    expect(dane.OPCJE_ROL).toEqual([
      { wartosc: "volunteer", etykieta: "Wolontariusz" },
      { wartosc: "student", etykieta: "Student" },
      { wartosc: "instructor", etykieta: "Psycholog prowadzący" },
    ]);
  });

  it("adres karty osoby to istniejąca trasa uczestników", () => {
    expect(dane.adresKartyOsoby(17)).toBe("/admin/uczestniczki/17");
  });

  it("data po polsku, brak daty → myślnik", () => {
    expect(dane.dataPl("2026-09-12T09:00:00Z")).toBe("12 września 2026");
    expect(dane.dataPl(null)).toBe("—");
  });
});
