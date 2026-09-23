import { describe, expect, it } from "vitest";
import type { MenuEntry } from "@/lib/menu/types";
import type { Role } from "@/lib/home-by-role";

import hPoProgramie from "@/lib/menu/participant/h-po-programie";
import h01Profil from "@/lib/menu/participant/h01-profil";
import h05Kursy from "@/lib/menu/participant/h05-kursy";
import h11Staz from "@/lib/menu/participant/h11-staz";
import h12Superwizja from "@/lib/menu/participant/h12-superwizja";
import h13Certyfikat from "@/lib/menu/participant/h13-certyfikat";
import h14Dokumenty from "@/lib/menu/participant/h14-dokumenty";
import h15ProfilPsychologa from "@/lib/menu/participant/h15-profil-psychologa";
import h21Start from "@/lib/menu/participant/h21-start";

/**
 * Każdy wpis menu uczestnika ma `roles` zgodne z middleware `role:` trasy
 * backendu, którą wywołuje jego ekran — nikt nie może zobaczyć pozycji menu,
 * której nie może otworzyć.
 *
 * Zakres: dziewięć wpisów pakietów HXX (własny plik trasy backendu).
 * `pulpit.ts` (agregator bez własnej trasy HXX) i `index.ts` (rejestr) są
 * poza tym zakresem — lider zmierzył „7 z 7” plików wpisów bez `roles`,
 * co odpowiada dokładnie tym dziewięciu wpisom minus H12/H13 (już poprawne).
 */

const PAKIETY: Record<string, MenuEntry> = {
  "h-po-programie": hPoProgramie,
  h01Profil,
  h05Kursy,
  h11Staz,
  h12Superwizja,
  h13Certyfikat,
  h14Dokumenty,
  h15ProfilPsychologa,
  h21Start,
};

/**
 * Tabela kontraktu: href → oczekiwane role, wyprowadzone z middleware `role:`
 * trasy backendu, którą czyta/wywołuje dany ekran.
 */
const OCZEKIWANE_ROLE: Record<string, Role[]> = {
  // backend/routes/api/h01.php:24-25 — grupa `auth:keycloak`, bez `role:` → GET /me
  "/panel/po-programie": ["volunteer", "student"],
  // backend/routes/api/h01.php:24-26 — grupa `auth:keycloak`, bez `role:` → GET/PATCH /me
  "/panel/profil": ["volunteer", "student"],
  // backend/routes/api/h05.php:22-23 — grupa ['auth:keycloak','access.active'], bez `role:` → GET /courses
  "/panel/kursy": ["volunteer", "student"],
  // backend/routes/api/h11.php:25 — `role:volunteer` → /internship/entries
  "/panel/staz": ["volunteer"],
  // backend/routes/api/h12.php:25 — `role:volunteer` → /supervision/slots
  "/panel/superwizja": ["volunteer"],
  // backend/routes/api/h13.php:26 — `role:volunteer` → /certificate/*
  "/panel/certyfikat": ["volunteer"],
  // backend/routes/api/h14.php:21-22 — grupa ['auth:keycloak','access.active'], bez `role:` → GET /documents
  "/panel/dokumenty": ["volunteer", "student"],
  // backend/routes/api/h15.php:25 — `role:volunteer` → /psychologist-profile
  "/panel/profil-psychologa": ["volunteer"],
  // backend/routes/api/h21.php:24-25 — grupa `auth:keycloak`, bez `role:` → GET /onboarding
  // (`role:super_admin,project_manager` na h21.php:27 dotyczy tylko PATCH /admin/onboarding)
  "/panel/start": ["volunteer", "student"],
};

/** Sprawdzacz kontraktu: wpis musi mieć niepustą tablicę `roles`. */
function maPoprawneRole(entry: MenuEntry): boolean {
  return Array.isArray(entry.roles) && entry.roles.length > 0;
}

describe("wpisy menu uczestnika a role middleware backendu", () => {
  it("gałąź pozytywna: każdy wpis pakietu HXX ma niepustą tablicę roles", () => {
    for (const [nazwa, entry] of Object.entries(PAKIETY)) {
      expect(maPoprawneRole(entry), `${nazwa} (${entry.href}) ma pustą/brakującą roles`).toBe(true);
    }
  });

  it("gałąź kontraktu: roles wpisu odpowiada dokładnie roli middleware trasy backendu", () => {
    for (const entry of Object.values(PAKIETY)) {
      const oczekiwane = OCZEKIWANE_ROLE[entry.href];
      expect(oczekiwane, `brak wpisu w tabeli kontraktu dla ${entry.href}`).toBeDefined();
      expect(entry.roles).toEqual(oczekiwane);
    }
  });

  it("KONTROLA NEGATYWNA: kopia wpisu bez roles nie przechodzi sprawdzacza", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- odrzucamy `roles` celowo, kopia ma go nie mieć
    const { roles, ...bezRoli } = h21Start;
    expect(maPoprawneRole(bezRoli as MenuEntry)).toBe(false);
  });
});
