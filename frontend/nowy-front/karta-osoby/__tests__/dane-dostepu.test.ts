import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/klient";
import { zdanieOdmowyRoli } from "@/design-system/molekuly/EmptyState/EmptyState";
import {
  MIESIECY_DOSTEPU_MAKS,
  POWOD_MAKS_ZNAKOW,
  ROLE_ZMIANY_DATY_DOSTEPU,
  ZDANIE_BRAK_POWODU,
  ZDANIE_DATA_ZA_DALEKO,
  ZDANIE_ZA_DLUGI_POWOD,
  najpozniejszaDataDostepu,
  ZDANIE_DATA_NIEPOPRAWNA,
  ZDANIE_DATA_NIE_POZNIEJSZA,
  czyMozeZmienicDateDostepu,
  czyPokazacZmianeDaty,
  ROLE_Z_TERMINEM_DOSTEPU,
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

/**
 * Reguły żądania zmiany daty sprzed pozycji z powodem — dokładnie takie, jak w
 * `ExtendAccessRequest::rules()` na bazie gałęzi (spacje zwinięte). Dopóki zaplecze
 * je ma bez zmian, kontrola powodu jest pomijana z widocznym zdaniem w nazwie próby;
 * każda inna zmiana reguł (także usunięcie `reason` z już zmienionych) włącza
 * ścisłą kontrolę niżej, więc zaplecze bez wymaganego `reason` jej nie przejdzie.
 */
const REGULY_PRZED_POWODEM =
  "'months' => ['required_without:until', 'prohibits:until', 'nullable', 'integer', 'min:1', 'max:60'], " +
  "'until' => ['required_without:months', 'prohibits:months', 'nullable', 'date'],";

function trescRegul(): string {
  const tekst = zaplecze("app/Http/Requests/H04/ExtendAccessRequest.php");
  return /function rules\(\): array\s*\{[\s\S]*?return \[([\s\S]*?)\];\s*\}/.exec(tekst)![1].replace(/\s+/g, " ").trim();
}

const ZAPLECZE_PRZED_POWODEM = trescRegul() === REGULY_PRZED_POWODEM;

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
    expect(Object.keys(r).sort()).toEqual(ZAPLECZE_PRZED_POWODEM ? ["months", "until"] : ["months", "reason", "until"]);
    expect(r.until).toContain("'date'");
    expect(r.until).toContain("'prohibits:months'");
    expect(r.until).toContain("'required_without:months'");
  });

  it.skipIf(ZAPLECZE_PRZED_POWODEM)(
    "zaplecze wymaga powodu: reason jest wymaganym napisem do 1000 znaków (pomijane, dopóki reguły żądania są sprzed pozycji z powodem)",
    () => {
      const regula = reguly().reason;
      expect(regula).toContain("'required'");
      expect(regula).toContain("'string'");
      expect(regula).toContain("'max:1000'");
      expect(regula).not.toContain("'nullable'");
    },
  );

  it("powód zmiany trafia do ciała żądania w polu reason, przycięty z białych znaków", () => {
    expect(sprawdzZmianeDaty("2027-03-31", "Zmiana terminu stażu.", "2026-09-30")).toEqual({
      cialo: { until: "2027-03-31", reason: "Zmiana terminu stażu." },
    });
    expect(sprawdzZmianeDaty("2027-03-31", "  \n Zmiana terminu stażu.  ", "2026-09-30")).toEqual({
      cialo: { until: "2027-03-31", reason: "Zmiana terminu stażu." },
    });
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

  it("data późniejsza niż dziś i niepusty powód: ciało z until i reason", () => {
    expect(sprawdzZmianeDaty(" 2026-10-01 ", "Powód", DZIS)).toEqual({ cialo: { until: "2026-10-01", reason: "Powód" } });
  });

  it("data dzisiejsza, wcześniejsza albo pusta: „Data końca dostępu musi być późniejsza niż dzisiejsza.”", () => {
    for (const data of ["2026-09-30", "2026-09-29", "2020-01-01", "", "  "]) {
      expect(sprawdzZmianeDaty(data, "Powód", DZIS)).toEqual({ bledy: { data: ZDANIE_DATA_NIE_POZNIEJSZA } });
    }
    expect(ZDANIE_DATA_NIE_POZNIEJSZA).toBe("Data końca dostępu musi być późniejsza niż dzisiejsza.");
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

  it("limit powodu jak na serwerze: 1000 znaków po przycięciu przechodzi, 1001 daje błąd powodu", () => {
    expect(POWOD_MAKS_ZNAKOW).toBe(1000);
    const tysiac = "a".repeat(1000);
    expect(sprawdzZmianeDaty("2027-01-01", `  ${tysiac}  `, DZIS)).toEqual({ cialo: { until: "2027-01-01", reason: tysiac } });
    expect(sprawdzZmianeDaty("2027-01-01", "a".repeat(1001), DZIS)).toEqual({ bledy: { powod: ZDANIE_ZA_DLUGI_POWOD } });
    expect(ZDANIE_ZA_DLUGI_POWOD).toBe("Powód może mieć najwyżej 1000 znaków.");
  });

  it("limit liczy znaki, nie jednostki UTF-16: 1000 znaków, w tym spoza podstawowej płaszczyzny, mieści się", () => {
    const tysiac = "ż".repeat(500) + "😀".repeat(500);
    expect(tysiac.length).toBe(1500);
    expect(sprawdzZmianeDaty("2027-01-01", tysiac, DZIS)).toEqual({ cialo: { until: "2027-01-01", reason: tysiac } });
    expect(sprawdzZmianeDaty("2027-01-01", tysiac + "😀", DZIS)).toEqual({ bledy: { powod: ZDANIE_ZA_DLUGI_POWOD } });
  });

  it("data kalendarzowa: tylko istniejący dzień w zapisie RRRR-MM-DD", () => {
    expect(dataKalendarzowa("2028-02-29")).toBe("2028-02-29");
    expect(dataKalendarzowa("2027-02-29")).toBeNull();
    expect(dataKalendarzowa("")).toBeNull();
  });
});

describe("zmiana daty dostępu — górna granica 24 miesięcy", () => {
  const DZIS = "2026-09-30";

  it("granica to dziś + 24 miesiące kalendarzowe; 29 lutego przechodzi na ostatni dzień lutego, nie na marzec", () => {
    expect(MIESIECY_DOSTEPU_MAKS).toBe(24);
    expect(najpozniejszaDataDostepu("2026-09-30")).toBe("2028-09-30");
    expect(najpozniejszaDataDostepu("2026-01-31")).toBe("2028-01-31");
    expect(najpozniejszaDataDostepu("2026-12-31")).toBe("2028-12-31");
    expect(najpozniejszaDataDostepu("2028-02-29")).toBe("2030-02-28");
    expect(najpozniejszaDataDostepu("2024-02-29")).toBe("2026-02-28");
  });

  it("dokładnie +24 miesiące przechodzi, dzień później dostaje odmowę przy polu daty", () => {
    expect(sprawdzZmianeDaty("2028-09-30", "Powód", DZIS)).toEqual({ cialo: { until: "2028-09-30", reason: "Powód" } });
    expect(sprawdzZmianeDaty("2028-10-01", "Powód", DZIS)).toEqual({ bledy: { data: ZDANIE_DATA_ZA_DALEKO } });
    expect(sprawdzZmianeDaty("2099-12-31", "Powód", DZIS)).toEqual({ bledy: { data: ZDANIE_DATA_ZA_DALEKO } });
    expect(ZDANIE_DATA_ZA_DALEKO).toBe("Nowa data dostępu może być najwyżej 24 miesiące od dziś.");
  });

  it("odmowa za daleko nie przesłania błędu powodu — oba błędy naraz", () => {
    expect(sprawdzZmianeDaty("2028-10-01", "", DZIS)).toEqual({
      bledy: { data: "Nowa data dostępu może być najwyżej 24 miesiące od dziś.", powod: ZDANIE_BRAK_POWODU },
    });
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
    expect(sprawdzZmianeDaty("2026-10-02", "Powód", dzis)).toEqual({ cialo: { until: "2026-10-02", reason: "Powód" } });
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

describe("zmiana daty dostępu — kto widzi „Zmień datę”", () => {
  it("termin dostępu mają tylko osoby w programie", () => {
    expect([...ROLE_Z_TERMINEM_DOSTEPU]).toEqual(["volunteer", "student"]);
  });

  it.each([
    ["project_manager", "volunteer", 17, 1, true],
    ["super_admin", "student", 17, 1, true],
    ["project_manager", "instructor", 17, 1, false],
    ["project_manager", "project_manager", 17, 1, false],
    ["super_admin", "super_admin", 17, 1, false],
    ["project_manager", "volunteer", 17, 17, false],
    ["project_manager", "volunteer", 17, null, true],
    ["instructor", "volunteer", 17, 1, false],
    [null, "volunteer", 17, 1, false],
  ])("zalogowany %s, osoba z karty %s (id %s), zalogowany id %s → przycisk: %s", (rola, rolaOsoby, idOsoby, idZalogowanej, oczekiwane) => {
    expect(czyPokazacZmianeDaty(rola, { id: idOsoby, role: rolaOsoby }, idZalogowanej)).toBe(oczekiwane);
  });

  it("zdanie dolnej granicy jest dokładnie tym, które zwraca zaplecze", () => {
    expect(ZDANIE_DATA_NIE_POZNIEJSZA).toBe("Data końca dostępu musi być późniejsza niż dzisiejsza.");
    expect(zaplecze("app/Http/Requests/H04/ExtendAccessRequest.php")).toContain(ZDANIE_DATA_NIE_POZNIEJSZA);
  });
});

describe("zmiana daty dostępu — błędy zapisu", () => {
  it("422 z kodem odmowy: zdanie z koperty zaplecza na górze okna, bez zgadywania", () => {
    const odmowa = (code: string, message: string) => new ApiError({ status: 422, code, message });
    for (const [code, zdanie] of [
      ["cannot_extend_self", "Nie można zmienić daty dostępu własnego konta."],
      ["access_date_not_applicable", "Konta prowadzących i administracji nie mają terminu dostępu. Takie konto wyłącza się blokadą."],
    ]) {
      expect(wynikZBleduZmianyDaty(odmowa(code, zdanie))).toEqual({ rodzaj: "ogolny", tresc: zdanie });
    }
    // Inny kod 422 bez pól zostaje przy zdaniu zapasowym.
    expect(wynikZBleduZmianyDaty(odmowa("cos_innego", "Inne zdanie.")).rodzaj).toBe("ogolny");
    expect(wynikZBleduZmianyDaty(odmowa("cos_innego", "Inne zdanie."))).toEqual({
      rodzaj: "ogolny",
      tresc: "Popraw datę i spróbuj ponownie. Data dostępu nie została zmieniona.",
    });
  });

  it("422 z until trafia do pola daty; 422 bez pól i reszta do zdania na górze okna", () => {
    expect(wynikZBleduZmianyDaty(blad(422, { until: ["Zła data."] }))).toEqual({ rodzaj: "pola", bledy: { data: "Zła data." } });
    expect(wynikZBleduZmianyDaty(blad(422, { months: ["x"] })).rodzaj).toBe("ogolny");
    expect(wynikZBleduZmianyDaty(blad(422, { reason: ["Pole powodu jest wymagane."] }))).toEqual({
      rodzaj: "pola",
      bledy: { powod: "Pole powodu jest wymagane." },
    });
    expect(wynikZBleduZmianyDaty(blad(422, { until: ["Zła data."], reason: ["Za długi."] }))).toEqual({
      rodzaj: "pola",
      bledy: { data: "Zła data.", powod: "Za długi." },
    });
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
