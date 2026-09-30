import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/klient";
import {
  MIESIACE_DOMYSLNE,
  MIESIACE_MAX,
  MIESIACE_MIN,
  czySkraca,
  dataPoPrzedluzeniu,
  formatujDate,
  idOsobyZAdresu,
  stanZBleduKarty,
  wynikZBleduZapisu,
  zbudujCialo,
  type OsobaPoPrzedluzeniu,
} from "../dane";

/**
 * Logika danych ekranu „Przedłużenie dostępu” oraz zgodność atrapy z
 * zapleczem: reguły żądania, klucze zasobu, trasa i flaga czytane są z
 * plików zaplecza jako tekst.
 */

const KORZEN_ZAPLECZA = join(process.cwd(), "..", "backend");

function zaplecze(sciezka: string): string {
  const pelna = join(KORZEN_ZAPLECZA, sciezka);
  if (!existsSync(pelna)) throw new Error(`Brak pliku zaplecza: ${sciezka}`);
  return readFileSync(pelna, "utf-8");
}

/** Klucze `'nazwa' =>` z ciała `toArray` zasobu, od `toArray` do końca pliku. */
function kluczeZasobu(sciezka: string): string[] {
  const tekst = zaplecze(sciezka);
  const poczatek = tekst.indexOf("function toArray");
  if (poczatek < 0) throw new Error(`Brak toArray w ${sciezka}`);
  return [...new Set([...tekst.slice(poczatek).matchAll(/'(\w+)'\s*=>/g)].map((trafienie) => trafienie[1]))];
}

function reguly(): Record<string, string> {
  const tekst = zaplecze("app/Http/Requests/H04/ExtendAccessRequest.php");
  const cialo = /function rules\(\): array\s*\{[\s\S]*?return \[([\s\S]*?)\];\s*\}/.exec(tekst)![1];
  return Object.fromEntries([...cialo.matchAll(/'(\w+)'\s*=>\s*\[([^\]]*)\]/g)].map((m) => [m[1], m[2]]));
}

const OSOBA: OsobaPoPrzedluzeniu = {
  id: 17,
  first_name: "Marta",
  last_name: "Testowa",
  email: "marta@example.test",
  role: "volunteer",
  roles: ["volunteer"],
  access_expires_at: "2027-07-01T00:00:00Z",
  program_completed_at: null,
};

function blad(status: number, errors?: Record<string, string[]>) {
  return new ApiError({ status, code: "x", message: "m", errors });
}

describe("przedłużenie dostępu — zgodność z zapleczem", () => {
  it("ciało żądania ma dokładnie dwa pola wykluczające się: months i until", () => {
    const r = reguly();
    expect(Object.keys(r).sort()).toEqual(["months", "until"]);
    expect(r.months).toContain("'prohibits:until'");
    expect(r.until).toContain("'prohibits:months'");
    expect(r.months).toContain("'required_without:until'");
    expect(r.until).toContain("'required_without:months'");
  });

  it("granice miesięcy na ekranie to granice reguły serwera", () => {
    const r = reguly();
    expect(r.months).toContain("'integer'");
    expect(r.months).toContain(`'min:${MIESIACE_MIN}'`);
    expect(r.months).toContain(`'max:${MIESIACE_MAX}'`);
    expect(r.until).toContain("'date'");
    expect(MIESIACE_MIN).toBe(1);
    expect(MIESIACE_MAX).toBe(60);
    expect(Number(MIESIACE_DOMYSLNE)).toBeGreaterThanOrEqual(MIESIACE_MIN);
    expect(Number(MIESIACE_DOMYSLNE)).toBeLessThanOrEqual(MIESIACE_MAX);
  });

  it("atrapa odpowiedzi ma klucze zasobu użytkownika bez pola potwierdzenia aktywacji", () => {
    const klucze = kluczeZasobu("app/Http/Resources/UserResource.php").filter(
      (klucz) => klucz !== "show_activation_confirmation",
    );
    expect(Object.keys(OSOBA).sort()).toEqual(klucze.sort());
    expect(zaplecze("app/Http/Controllers/Api/V1/Admin/AccessController.php")).toContain(
      "UserResource::withoutActivationConfirmation(",
    );
  });

  it("karta osoby niesie pola używane na ekranie: imię, nazwisko, rola, data końca dostępu", () => {
    const klucze = kluczeZasobu("app/Http/Resources/ProfileResource.php");
    for (const klucz of ["first_name", "last_name", "role", "access_expires_at"]) {
      expect(klucze).toContain(klucz);
    }
    expect(kluczeZasobu("app/Http/Resources/AdminUserCardResource.php")).toContain("profile");
  });

  it("trasa: POST na extend-access z rolami opiekuna projektu i super-admina, id tylko liczbą", () => {
    const tekst = zaplecze("routes/api/h04.php");
    expect(tekst).toContain("'role:project_manager,super_admin'");
    expect(tekst).toContain("->post('/admin/users/{id}/extend-access', [AccessController::class, 'extend'])");
    expect(tekst).toContain("->whereNumber('id')");
    expect(tekst).toContain("config('features.h04')");
  });

  it("karta osoby: trasa GET z tą samą bramką ról, id tylko liczbą", () => {
    const tekst = zaplecze("routes/api/h18.php");
    expect(tekst).toContain("'role:project_manager,super_admin'");
    expect(tekst).toContain("Route::get('/admin/users/{id}', [AdminUserController::class, 'show'])->whereNumber('id')");
  });

  it("serwer sam zapisuje zdarzenie przedłużenia — ekran nie wysyła nic do dziennika", () => {
    const kontroler = zaplecze("app/Http/Controllers/Api/V1/Admin/AccessController.php");
    expect(kontroler).toContain("'access.extended'");
    const dane = readFileSync(join(process.cwd(), "nowy-front/przedluzenie-dostepu/dane.ts"), "utf-8");
    expect(dane).not.toMatch(/\/admin\/audit/);
  });
});

describe("przedłużenie dostępu — ciało żądania", () => {
  it("miesiące: ciało ma wyłącznie months jako liczbę", () => {
    expect(zbudujCialo("months", " 12 ", "2027-03-31")).toEqual({ cialo: { months: 12 } });
  });

  it("data: ciało ma wyłącznie until", () => {
    expect(zbudujCialo("until", "6", " 2027-03-31 ")).toEqual({ cialo: { until: "2027-03-31" } });
  });

  it("miesiące poza zakresem albo nie całkowite to błąd pola", () => {
    for (const wpis of ["0", "61", "-1", "2.5", "abc", "1e2"]) {
      expect(zbudujCialo("months", wpis, "")).toEqual({
        bledy: { months: "Liczba miesięcy musi być całkowita, od 1 do 60." },
      });
    }
    expect(zbudujCialo("months", "", "")).toEqual({ bledy: { months: "Podaj liczbę miesięcy." } });
    expect(zbudujCialo("months", "1", "")).toEqual({ cialo: { months: 1 } });
    expect(zbudujCialo("months", "60", "")).toEqual({ cialo: { months: 60 } });
  });

  it("data pusta albo nieistniejąca to błąd pola", () => {
    expect(zbudujCialo("until", "", "")).toEqual({ bledy: { until: "Wybierz datę." } });
    expect(zbudujCialo("until", "", "2027-02-30")).toEqual({ bledy: { until: "Podaj poprawną datę." } });
    expect(zbudujCialo("until", "", "31.03.2027")).toEqual({ bledy: { until: "Podaj poprawną datę." } });
  });
});

describe("przedłużenie dostępu — data po przedłużeniu", () => {
  const teraz = new Date("2026-09-30T10:00:00Z");

  it("dostęp trwa: miesiące od obecnej daty, z nadmiarem dnia na następny miesiąc jak na serwerze", () => {
    expect(dataPoPrzedluzeniu("2026-12-31T00:00:00Z", "months", "6", "", teraz)?.toISOString()).toBe(
      "2027-07-01T00:00:00.000Z",
    );
  });

  it("dostęp wygasł albo go brak: miesiące od teraz", () => {
    expect(dataPoPrzedluzeniu("2026-01-15T00:00:00Z", "months", "6", "", teraz)?.toISOString()).toBe(
      "2027-03-30T10:00:00.000Z",
    );
    expect(dataPoPrzedluzeniu(null, "months", "1", "", teraz)?.toISOString()).toBe("2026-10-30T10:00:00.000Z");
  });

  it("tryb daty: data wprost; pole niepoliczalne daje null", () => {
    expect(dataPoPrzedluzeniu("2026-12-31T00:00:00Z", "until", "6", "2027-03-31", teraz)?.toISOString()).toBe(
      "2027-03-31T00:00:00.000Z",
    );
    expect(dataPoPrzedluzeniu(null, "until", "6", "", teraz)).toBeNull();
    expect(dataPoPrzedluzeniu(null, "months", "abc", "", teraz)).toBeNull();
  });

  it("skracanie: tylko gdy nowa data jest wcześniejsza niż obecna", () => {
    expect(czySkraca("2026-12-31T00:00:00Z", new Date("2026-11-01T00:00:00Z"))).toBe(true);
    expect(czySkraca("2026-12-31T00:00:00Z", new Date("2027-01-01T00:00:00Z"))).toBe(false);
    expect(czySkraca(null, new Date("2027-01-01T00:00:00Z"))).toBe(false);
    expect(czySkraca("2026-12-31T00:00:00Z", null)).toBe(false);
  });

  it("formatowanie po polsku w strefie Warszawy; brak albo zły zapis to kreska", () => {
    expect(formatujDate("2026-12-31T00:00:00Z")).toBe("31 grudnia 2026");
    expect(formatujDate(null)).toBe("—");
    expect(formatujDate("nie-data")).toBe("—");
  });
});

describe("przedłużenie dostępu — błędy i adres", () => {
  it("karta: 401 i 403 to odmowa, 404 to brak osoby, reszta to błąd sieci", () => {
    expect(stanZBleduKarty(blad(401)).rodzaj).toBe("brak-uprawnien");
    expect(stanZBleduKarty(blad(403)).rodzaj).toBe("brak-uprawnien");
    expect(stanZBleduKarty(blad(404)).rodzaj).toBe("nie-znaleziono");
    expect(stanZBleduKarty(blad(500)).rodzaj).toBe("siec");
    expect(stanZBleduKarty(new TypeError("Failed to fetch")).rodzaj).toBe("siec");
  });

  it("zapis: 422 z polami trafia do pól, 422 bez pól i reszta do komunikatu ogólnego", () => {
    expect(wynikZBleduZapisu(blad(422, { months: ["a"], until: ["b"] }))).toEqual({
      rodzaj: "pola",
      bledy: { months: "a", until: "b" },
    });
    expect(wynikZBleduZapisu(blad(422)).rodzaj).toBe("ogolny");
    for (const wyjatek of [blad(403), blad(404), blad(500), new TypeError("x")]) {
      expect(wynikZBleduZapisu(wyjatek).rodzaj).toBe("ogolny");
    }
  });

  it("identyfikator z adresu: wyłącznie liczba", () => {
    expect(idOsobyZAdresu("17")).toBe(17);
    for (const zly of ["", "abc", "1a", "-1", "1.5", " 1"]) expect(idOsobyZAdresu(zly)).toBeNull();
  });
});
