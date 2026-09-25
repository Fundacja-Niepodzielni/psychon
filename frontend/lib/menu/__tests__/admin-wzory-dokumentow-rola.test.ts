import { describe, expect, it } from "vitest";
import { adminMenu } from "@/lib/menu/admin";
import { filterMenuByRole, type MenuEntry } from "@/lib/menu/types";
import type { Role } from "@/lib/home-by-role";

const WZORY_HREF = "/admin/wzory-dokumentow";

function liczHref(menu: MenuEntry[], href: string): number {
  return menu.filter((wpis) => wpis.href === href).length;
}

/**
 * Wpis menu „Wzory dokumentów" (`h22-wzory-dokumentow.ts`) ma warunek roli
 * PRZY POZYCJI (`roles`), dokładnie jak sąsiednie wpisy administracji z
 * ograniczeniem — nie chowanie po stronie ekranu. Wzorzec:
 * `filterMenuByRole.test.ts` (menu uczestnika).
 */
describe("adminMenu — warunek roli przy wpisie „Wzory dokumentów”", () => {
  it("pozycja jest zarejestrowana w adminMenu z deklarowaną rolą", () => {
    const wpis = adminMenu.find((entry) => entry.href === WZORY_HREF);
    expect(wpis).toBeDefined();
    expect(wpis?.roles).toEqual(["project_manager", "super_admin"]);
  });

  it('pozytywna: rola "project_manager" i "super_admin" widzą pozycję dokładnie raz', () => {
    expect(liczHref(filterMenuByRole(adminMenu, "project_manager"), WZORY_HREF)).toBe(1);
    expect(liczHref(filterMenuByRole(adminMenu, "super_admin"), WZORY_HREF)).toBe(1);
  });

  it('negatywna: rola uczestnika ("volunteer", "student") NIE widzi pozycji', () => {
    expect(liczHref(filterMenuByRole(adminMenu, "volunteer"), WZORY_HREF)).toBe(0);
    expect(liczHref(filterMenuByRole(adminMenu, "student"), WZORY_HREF)).toBe(0);
  });

  it('negatywna: rola prowadzącego ("instructor") NIE widzi pozycji', () => {
    expect(liczHref(filterMenuByRole(adminMenu, "instructor"), WZORY_HREF)).toBe(0);
  });

  it("negatywna: rola nieznana/undefined NIE widzi pozycji (fail closed)", () => {
    expect(liczHref(filterMenuByRole(adminMenu, undefined), WZORY_HREF)).toBe(0);
    expect(liczHref(filterMenuByRole(adminMenu, "ksiegowa" as Role), WZORY_HREF)).toBe(0);
  });
});
