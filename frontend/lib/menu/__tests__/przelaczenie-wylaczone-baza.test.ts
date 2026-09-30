import { afterEach, describe, expect, it, vi } from "vitest";
import { adminMenu, adminMenuSections } from "@/lib/menu/admin";
import { instructorMenu, instructorMenuSections } from "@/lib/menu/instructor";
import { participantMenu, participantMenuSections } from "@/lib/menu/participant";
import { filterMenuByRole, groupMenu, type MenuEntry, type MenuGroup, type MenuSection } from "@/lib/menu/types";
import type { Role } from "@/lib/home-by-role";
import { GRUPY, type KluczGrupy } from "@/lib/przelaczenie/grupy";
import menuBazoweJson from "./menu-bazowe.json";

/**
 * Menu każdej roli przy wyłączonych grupach przełączenia jest identyczne z
 * menu sprzed wprowadzenia rejestru. Wzorzec porównania to plik
 * `menu-bazowe.json`: dla każdej z pięciu ról pełny wynik rozwiązania menu
 * (`filterMenuByRole` + `groupMenu`) — grupy, etykiety, adresy, kolejność,
 * ikony, role, sekcje — wygenerowany z menu bez rejestru przełączenia.
 */

const ROLE: Role[] = ["super_admin", "project_manager", "instructor", "volunteer", "student"];

const menuBazowe = menuBazoweJson as unknown as Record<Role, MenuGroup[]>;

interface ZestawMenu {
  admin: MenuEntry[];
  adminSekcje: MenuSection[];
  instruktor: MenuEntry[];
  instruktorSekcje: MenuSection[];
  uczestnik: MenuEntry[];
  uczestnikSekcje: MenuSection[];
  filtruj: typeof filterMenuByRole;
  grupuj: typeof groupMenu;
}

const zestawRzeczywisty: ZestawMenu = {
  admin: adminMenu,
  adminSekcje: adminMenuSections,
  instruktor: instructorMenu,
  instruktorSekcje: instructorMenuSections,
  uczestnik: participantMenu,
  uczestnikSekcje: participantMenuSections,
  filtruj: filterMenuByRole,
  grupuj: groupMenu,
};

/** Menu rozwiązane tak, jak robi to panel: filtr po roli, potem grupy. */
function rozwiazMenuRoli(zestaw: ZestawMenu, rola: Role): MenuGroup[] {
  const [menu, sekcje] =
    rola === "super_admin" || rola === "project_manager"
      ? [zestaw.admin, zestaw.adminSekcje]
      : rola === "instructor"
        ? [zestaw.instruktor, zestaw.instruktorSekcje]
        : [zestaw.uczestnik, zestaw.uczestnikSekcje];
  return zestaw.grupuj(zestaw.filtruj(menu, rola), sekcje);
}

function wpisyRoli(zestaw: ZestawMenu, rola: Role): MenuEntry[] {
  return rozwiazMenuRoli(zestaw, rola).flatMap((grupa) => grupa.entries);
}

/**
 * Ładuje menu od nowa przy podmienionym rejestrze przełączenia: każda grupa
 * dostaje flagę z `flagi` (brak wpisu = wyłączona). Pozwala sprawdzić
 * obie strony flagi bez mutowania współdzielonego rejestru.
 */
async function zaladujMenuZFlagami(flagi: Partial<Record<KluczGrupy, boolean>>): Promise<ZestawMenu> {
  vi.resetModules();
  vi.doMock("@/lib/przelaczenie/grupy", async (oryginal) => {
    const modul = await oryginal<typeof import("@/lib/przelaczenie/grupy")>();
    const grupy = Object.fromEntries(
      Object.entries(modul.GRUPY).map(([klucz, grupa]) => [
        klucz,
        { ...grupa, wlaczona: flagi[klucz as KluczGrupy] ?? false },
      ]),
    ) as unknown as typeof modul.GRUPY;
    return {
      ...modul,
      GRUPY: grupy,
      celTrasy: (klucz: KluczGrupy, panel: Parameters<typeof modul.celTrasy>[1]) =>
        modul.celTrasyEkranu(grupy[klucz], panel),
    };
  });
  const [admin, instruktor, uczestnik, typy] = await Promise.all([
    import("@/lib/menu/admin"),
    import("@/lib/menu/instructor"),
    import("@/lib/menu/participant"),
    import("@/lib/menu/types"),
  ]);
  return {
    admin: admin.adminMenu,
    adminSekcje: admin.adminMenuSections,
    instruktor: instruktor.instructorMenu,
    instruktorSekcje: instruktor.instructorMenuSections,
    uczestnik: uczestnik.participantMenu,
    uczestnikSekcje: uczestnik.participantMenuSections,
    filtruj: typy.filterMenuByRole,
    grupuj: typy.groupMenu,
  };
}

afterEach(() => {
  vi.doUnmock("@/lib/przelaczenie/grupy");
  vi.resetModules();
});

describe("menu przy wyłączonych grupach — jak przed rejestrem przełączenia", () => {
  it("rejestr zna co najmniej jedną grupę i każda grupa rejestru jest wyłączona", () => {
    expect(Object.keys(GRUPY).length).toBeGreaterThan(0);
    for (const [klucz, grupa] of Object.entries(GRUPY)) {
      expect(grupa.wlaczona, `grupa "${klucz}"`).toBe(false);
    }
  });

  it("wzorzec obejmuje wszystkie pięć ról i niepuste menu każdej", () => {
    expect(Object.keys(menuBazowe).sort()).toEqual([...ROLE].sort());
    for (const rola of ROLE) {
      const wpisy = menuBazowe[rola].flatMap((grupa) => grupa.entries);
      expect(wpisy.length, rola).toBeGreaterThan(0);
    }
  });

  it("menu rzeczywiste każdej roli jest identyczne ze wzorcem, wpis po wpisie", () => {
    for (const rola of ROLE) {
      expect(rozwiazMenuRoli(zestawRzeczywisty, rola), `rola ${rola}`).toEqual(menuBazowe[rola]);
    }
  });

  it("menu z rejestrem podmienionym na same wyłączone grupy jest identyczne ze wzorcem", async () => {
    const zestaw = await zaladujMenuZFlagami({});
    for (const rola of ROLE) {
      expect(rozwiazMenuRoli(zestaw, rola), `rola ${rola}`).toEqual(menuBazowe[rola]);
    }
  });

  it("przypadek odwrotny: zmieniony adres w kopii wzorca daje czerwień porównania", () => {
    const kopia = JSON.parse(JSON.stringify(menuBazowe)) as Record<Role, MenuGroup[]>;
    const wpis = kopia.volunteer.flatMap((grupa) => grupa.entries).find((e) => e.href === "/panel/po-programie");
    expect(wpis).toBeDefined();
    wpis!.href = "/panel/dalsza-wspolpraca";
    expect(rozwiazMenuRoli(zestawRzeczywisty, "volunteer")).not.toEqual(kopia.volunteer);
  });

  it("przypadek odwrotny: usunięty wpis w kopii wzorca daje czerwień porównania", () => {
    const kopia = JSON.parse(JSON.stringify(menuBazowe)) as Record<Role, MenuGroup[]>;
    kopia.super_admin[0].entries.pop();
    expect(rozwiazMenuRoli(zestawRzeczywisty, "super_admin")).not.toEqual(kopia.super_admin);
  });

  it("żaden wpis żadnego menu nie wskazuje segmentu nowego frontu", () => {
    // Wzorzec złożony z części — literalny segment nie ma prawa się pojawić
    // w plikach menu ani w tym teście (pilnuje tego zliczenie w `lib/menu`).
    const segment = new RegExp(["nowy", "front"].join("-"));
    for (const wpis of [...participantMenu, ...adminMenu, ...instructorMenu]) {
      expect(wpis.href).not.toMatch(segment);
    }
  });
});

describe("menu przy włączonej grupie współpracy — wpisy prowadzą na nowe trasy produktu", () => {
  it("uczestnik: „Po programie” wskazuje nową trasę, reszta menu bez zmian", async () => {
    const zestaw = await zaladujMenuZFlagami({ wspolpraca: true });
    for (const rola of ["volunteer", "student"] as Role[]) {
      const wpisy = wpisyRoli(zestaw, rola);
      const bazowe = menuBazowe[rola].flatMap((grupa) => grupa.entries);
      expect(wpisy.find((w) => w.label === "Po programie")?.href, rola).toBe("/panel/dalsza-wspolpraca");
      const bezTegoWpisu = (lista: MenuEntry[]) => lista.filter((w) => w.label !== "Po programie");
      expect(bezTegoWpisu(wpisy)).toEqual(bezTegoWpisu(bazowe));
    }
  });

  it("administracja: powstaje wpis „Zgłoszenia współpracy” z nową trasą, tylko dla obu ról administracji", async () => {
    const zestaw = await zaladujMenuZFlagami({ wspolpraca: true });
    expect(zestaw.admin).toHaveLength(adminMenu.length + 1);
    for (const rola of ["project_manager", "super_admin"] as Role[]) {
      const wpis = wpisyRoli(zestaw, rola).find((w) => w.label === "Zgłoszenia współpracy");
      expect(wpis?.href, rola).toBe("/admin/zgloszenia-wspolpracy");
    }
    for (const rola of ["instructor", "volunteer", "student"] as Role[]) {
      expect(wpisyRoli(zestaw, rola).find((w) => w.label === "Zgłoszenia współpracy"), rola).toBeUndefined();
    }
  });

  it("przypadek odwrotny: przy wyłączonej grupie wpis administracji nie istnieje, a wpis uczestnika wskazuje starą trasę", async () => {
    const zestaw = await zaladujMenuZFlagami({});
    expect(zestaw.admin.find((w) => w.label === "Zgłoszenia współpracy")).toBeUndefined();
    expect(zestaw.uczestnik.find((w) => w.label === "Po programie")?.href).toBe("/panel/po-programie");
  });
});
