import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/klient";
import { zdanieOdmowyRoli } from "@/design-system/molekuly/EmptyState/EmptyState";
import {
  ROLE_ZMIANY_DATY_DOSTEPU,
  ZDANIE_BRAK_POWODU,
  ZDANIE_DATA_NIEPOPRAWNA,
  ZDANIE_DATA_NIE_POZNIEJSZA,
  czyMozeZmienicDateDostepu,
  czySkraca,
  dataKalendarzowa,
  dzisiajWWarszawie,
  opisObecnejDaty,
  sprawdzZmianeDaty,
  wynikZBleduZmianyDaty,
  zdanieOZmianieDaty,
  type OsobaPoZmianieDaty,
} from "../daneDostepu";

/**
 * Logika danych okna „Zmień datę dostępu” oraz zgodność z zapleczem: reguły
 * żądania, klucze zasobu, trasa i jej bramka ról czytane są z plików zaplecza
 * jako tekst (te same pomiary, które miał dawny ekran przedłużenia).
 */

const KORZEN_ZAPLECZA = join(process.cwd(), "..", "backend");

function zaplecze(sciezka: string): string {
  const pelna = join(KORZEN_ZAPLECZA, sciezka);
  if (!existsSync(pelna)) throw new Error(`Brak pliku zaplecza: ${sciezka}`);
  return readFileSync(pelna, "utf-8");
}

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

const OSOBA: OsobaPoZmianieDaty = {
  id: 17,
  first_name: "Marta",
  last_name: "Demo",
  email: "marta@demo.pl",
  role: "volunteer",
  roles: ["volunteer"],
  access_expires_at: "2027-07-01T00:00:00Z",
  program_completed_at: null,
};

function blad(status: number, errors?: Record<string, string[]>) {
  return new ApiError({ status, code: "x", message: "m", errors });
}

describe("zmiana daty dostępu — zgodność z zapleczem", () => {
  it("trasa przyjmuje until jako datę — okno wysyła wyłącznie to pole", () => {
    const r = reguly();
    expect(Object.keys(r).sort()).toEqual(["months", "until"]);
    expect(r.until).toContain("'date'");
    expect(r.until).toContain("'prohibits:months'");
    expect(r.until).toContain("'required_without:months'");
  });

  it("trasa nie przyjmuje powodu zmiany — dlatego powód nie trafia do ciała żądania", () => {
    expect(Object.keys(reguly())).not.toContain("reason");
    expect(sprawdzZmianeDaty("2027-03-31", "Zmiana terminu stażu.", "2026-09-30")).toEqual({ cialo: { until: "2027-03-31" } });
  });

  it("przycisk widzą dokładnie role z bramki trasy: opiekun projektu i super-admin", () => {
    const tekst = zaplecze("routes/api/h04.php");
    expect(tekst).toContain("Route::middleware(['auth:keycloak', 'role:project_manager,super_admin'])");
    expect(tekst).toContain("->post('/admin/users/{id}/extend-access', [AccessController::class, 'extend'])");
    expect(tekst).toContain("->whereNumber('id')");
    expect(tekst).toContain("config('features.h04')");
    expect([...ROLE_ZMIANY_DATY_DOSTEPU].sort()).toEqual(["project_manager", "super_admin"]);
    expect(czyMozeZmienicDateDostepu("project_manager")).toBe(true);
    expect(czyMozeZmienicDateDostepu("super_admin")).toBe(true);
    for (const rola of ["instructor", "volunteer", "student", "", null]) {
      expect(czyMozeZmienicDateDostepu(rola)).toBe(false);
    }
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

  it("karta osoby niesie pola używane przez okno: imię, nazwisko i data końca dostępu", () => {
    const klucze = kluczeZasobu("app/Http/Resources/ProfileResource.php");
    for (const klucz of ["first_name", "last_name", "access_expires_at"]) {
      expect(klucze).toContain(klucz);
    }
    expect(kluczeZasobu("app/Http/Resources/AdminUserCardResource.php")).toContain("profile");
  });

  it("serwer sam zapisuje zdarzenie zmiany daty — okno nie wysyła nic do dziennika", () => {
    expect(zaplecze("app/Http/Controllers/Api/V1/Admin/AccessController.php")).toContain("'access.extended'");
    for (const plik of ["nowy-front/karta-osoby/daneDostepu.ts", "nowy-front/karta-osoby/ZmianaDatyDostepu.tsx"]) {
      expect(readFileSync(join(process.cwd(), plik), "utf-8")).not.toMatch(/\/admin\/audit/);
    }
  });
});

describe("zmiana daty dostępu — kontrola pól", () => {
  const DZIS = "2026-09-30";

  it("data późniejsza niż dziś i niepusty powód: ciało z samym until", () => {
    expect(sprawdzZmianeDaty(" 2026-10-01 ", "Powód", DZIS)).toEqual({ cialo: { until: "2026-10-01" } });
  });

  it("data dzisiejsza, wcześniejsza albo pusta: „Wybierz datę późniejszą niż dzisiejsza.”", () => {
    for (const data of ["2026-09-30", "2026-09-29", "2020-01-01", "", "  "]) {
      expect(sprawdzZmianeDaty(data, "Powód", DZIS)).toEqual({ bledy: { data: ZDANIE_DATA_NIE_POZNIEJSZA } });
    }
    expect(ZDANIE_DATA_NIE_POZNIEJSZA).toBe("Wybierz datę późniejszą niż dzisiejsza.");
  });

  it("data nieistniejąca albo w innym zapisie: „Podaj poprawną datę.”", () => {
    for (const data of ["2027-02-30", "31.03.2027", "2027-3-1", "jutro"]) {
      expect(sprawdzZmianeDaty(data, "Powód", DZIS)).toEqual({ bledy: { data: ZDANIE_DATA_NIEPOPRAWNA } });
    }
  });

  it("powód pusty albo same spacje: błąd powodu; oba błędy naraz, gdy brak obu", () => {
    expect(sprawdzZmianeDaty("2027-01-01", "   ", DZIS)).toEqual({ bledy: { powod: ZDANIE_BRAK_POWODU } });
    expect(sprawdzZmianeDaty("", "", DZIS)).toEqual({ bledy: { data: ZDANIE_DATA_NIE_POZNIEJSZA, powod: ZDANIE_BRAK_POWODU } });
  });

  it("data kalendarzowa: tylko istniejący dzień w zapisie RRRR-MM-DD", () => {
    expect(dataKalendarzowa("2028-02-29")).toBe("2028-02-29");
    expect(dataKalendarzowa("2027-02-29")).toBeNull();
    expect(dataKalendarzowa("")).toBeNull();
  });
});

describe("zmiana daty dostępu — dziś w Warszawie", () => {
  it.each([
    ["południe", "2026-09-30T10:00:00Z", "2026-09-30"],
    ["tuż po północy w Warszawie (w UTC jeszcze poprzedni dzień)", "2026-09-30T22:30:00Z", "2026-10-01"],
    ["zima, tuż przed północą w Warszawie", "2027-01-15T22:59:00Z", "2027-01-15"],
    ["zima, północ w Warszawie", "2027-01-15T23:00:00Z", "2027-01-16"],
  ])("%s", (_nazwa, iso, oczekiwany) => {
    expect(dzisiajWWarszawie(new Date(iso))).toBe(oczekiwany);
  });

  it("jutro według Warszawy jest już poprawną datą, choć w UTC jest jeszcze dziś", () => {
    const dzis = dzisiajWWarszawie(new Date("2026-09-30T22:30:00Z"));
    expect(sprawdzZmianeDaty("2026-10-01", "Powód", dzis)).toEqual({ bledy: { data: ZDANIE_DATA_NIE_POZNIEJSZA } });
    expect(sprawdzZmianeDaty("2026-10-02", "Powód", dzis)).toEqual({ cialo: { until: "2026-10-02" } });
  });
});

describe("zmiana daty dostępu — skrócenie i zdania", () => {
  it("skrócenie: tylko gdy wybrany dzień jest wcześniejszy niż obecna data", () => {
    expect(czySkraca("2026-12-31T00:00:00Z", "2026-11-01")).toBe(true);
    expect(czySkraca("2026-12-31T00:00:00Z", "2027-01-01")).toBe(false);
    expect(czySkraca(null, "2027-01-01")).toBe(false);
    expect(czySkraca("2026-12-31T00:00:00Z", "")).toBe(false);
  });

  it("obecna data po polsku w strefie Warszawy; jej brak — zdaniem", () => {
    expect(opisObecnejDaty("2026-12-31T00:00:00Z")).toBe("31 grudnia 2026");
    expect(opisObecnejDaty(null)).toBe("brak ustawionej daty");
  });

  it.each([
    ["lato, północ w Warszawie (UTC+2)", "2027-07-14T22:00:00.000Z", "15 lipca 2027"],
    ["zima, północ w Warszawie (UTC+1)", "2027-01-14T23:00:00.000Z", "15 stycznia 2027"],
    ["północ UTC", "2027-03-01T00:00:00Z", "1 marca 2027"],
  ])("zdanie po zapisie: %s → „Data dostępu zmieniona na %s”", (_nazwa, iso, oczekiwane) => {
    expect(zdanieOZmianieDaty(iso)).toBe(`Data dostępu zmieniona na ${oczekiwane}.`);
  });

  it("zdanie po zapisie jest neutralne — bez słowa „przedłużony”", () => {
    expect(zdanieOZmianieDaty("2027-03-01T00:00:00Z")).not.toMatch(/przedłuż/i);
    expect(zdanieOZmianieDaty(null)).toBe("Data dostępu zmieniona.");
  });
});

describe("zmiana daty dostępu — błędy zapisu", () => {
  it("422 z until trafia do pola daty; 422 bez pól i reszta do zdania na górze okna", () => {
    expect(wynikZBleduZmianyDaty(blad(422, { until: ["Zła data."] }))).toEqual({ rodzaj: "pola", bledy: { data: "Zła data." } });
    expect(wynikZBleduZmianyDaty(blad(422, { months: ["x"] })).rodzaj).toBe("ogolny");
    expect(wynikZBleduZmianyDaty(blad(422)).rodzaj).toBe("ogolny");
    expect(wynikZBleduZmianyDaty(blad(403))).toEqual({ rodzaj: "ogolny", tresc: zdanieOdmowyRoli("administracji") });
    expect(wynikZBleduZmianyDaty(blad(401))).toEqual({ rodzaj: "ogolny", tresc: zdanieOdmowyRoli("administracji") });
    expect(wynikZBleduZmianyDaty(blad(404))).toEqual({
      rodzaj: "ogolny",
      tresc: "Nie znaleziono osoby. Data dostępu nie została zmieniona.",
    });
    for (const wyjatek of [blad(500), new TypeError("Failed to fetch")]) {
      expect(wynikZBleduZmianyDaty(wyjatek)).toEqual({
        rodzaj: "ogolny",
        tresc: "Nie udało się zmienić daty dostępu. Data nie została zmieniona — spróbuj ponownie.",
      });
    }
  });

  it("żadne zdanie błędu nie mówi o przedłużeniu", () => {
    for (const wyjatek of [blad(422), blad(403), blad(404), blad(500)]) {
      const wynik = wynikZBleduZmianyDaty(wyjatek);
      expect(wynik.rodzaj === "ogolny" ? wynik.tresc : "").not.toMatch(/przedłuż/i);
    }
  });
});
