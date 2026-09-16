import { describe, expect, it } from "vitest";
import { participantMenu } from "@/lib/menu/participant";
import { filterMenuByRole, type MenuEntry } from "@/lib/menu/types";
import type { Role } from "@/lib/home-by-role";

const SUPERWIZJA_HREF = "/panel/superwizja";

function liczHref(menu: MenuEntry[], href: string): number {
  return menu.filter((wpis) => wpis.href === href).length;
}

describe("filterMenuByRole — F-55: filtr roli w rejestrze menu uczestnika", () => {
  it('K1: rola "student" nie widzi pozycji /panel/superwizja', () => {
    const wynik = filterMenuByRole(participantMenu, "student");
    expect(liczHref(wynik, SUPERWIZJA_HREF)).toBe(0);
  });

  it('K1: rola "volunteer" widzi /panel/superwizja dokładnie raz', () => {
    const wynik = filterMenuByRole(participantMenu, "volunteer");
    expect(liczHref(wynik, SUPERWIZJA_HREF)).toBe(1);
  });

  it("K2: rola pusty string nie rzuca wyjątku i chowa pozycję z deklarowaną rolą (fail closed)", () => {
    expect(() => filterMenuByRole(participantMenu, "" as Role)).not.toThrow();
    expect(liczHref(filterMenuByRole(participantMenu, "" as Role), SUPERWIZJA_HREF)).toBe(0);
  });

  it("K2: rola spoza słownika nie rzuca wyjątku i chowa pozycję z deklarowaną rolą (fail closed)", () => {
    const rolaSpozaSlownika = "ksiegowa" as Role;
    expect(() => filterMenuByRole(participantMenu, rolaSpozaSlownika)).not.toThrow();
    expect(liczHref(filterMenuByRole(participantMenu, rolaSpozaSlownika), SUPERWIZJA_HREF)).toBe(0);
  });

  it("K2: rola undefined nie rzuca wyjątku i chowa pozycję z deklarowaną rolą (fail closed)", () => {
    expect(() => filterMenuByRole(participantMenu, undefined)).not.toThrow();
    expect(liczHref(filterMenuByRole(participantMenu, undefined), SUPERWIZJA_HREF)).toBe(0);
  });

  it("K2: rola null nie rzuca wyjątku i chowa pozycję z deklarowaną rolą (fail closed)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- świadomy zapis granicy: wywołanie spoza typu (np. dane z sieci)
    const rolaNull = null as any;
    expect(() => filterMenuByRole(participantMenu, rolaNull)).not.toThrow();
    expect(liczHref(filterMenuByRole(participantMenu, rolaNull), SUPERWIZJA_HREF)).toBe(0);
  });

  it("K2: wpisy bez deklarowanej roli przechodzą niezależnie od roli granicznej", () => {
    const wpisyBezRoli = participantMenu.filter((wpis) => !wpis.roles).length;
    expect(wpisyBezRoli).toBeGreaterThan(0);
    // Literały wprost jako (Role | undefined)[] — bez tego TS zwęża tablicę do
    // `string | undefined` (pierwsze dwa elementy nie są literałami typu Role
    // bez adnotacji) i `filterMenuByRole` przestaje się kompilować (`npm run build`).
    const graniczneRole: (Role | undefined)[] = ["" as Role, "ksiegowa" as Role, undefined];
    for (const granica of graniczneRole) {
      const wynik = filterMenuByRole(participantMenu, granica);
      expect(wynik.filter((wpis) => !wpis.roles).length).toBe(wpisyBezRoli);
    }
  });
});
