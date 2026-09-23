import { describe, expect, it } from "vitest";
import { participantMenu, participantMenuSections } from "@/lib/menu/participant";
import { adminMenu, adminMenuSections } from "@/lib/menu/admin";
import { instructorMenu, instructorMenuSections } from "@/lib/menu/instructor";
import {
  filterMenuByRole,
  groupMenu,
  type MenuEntry,
  type MenuSection,
} from "@/lib/menu/types";

/**
 * Dwa wpisy z tą samą wartością `order` w jednym rejestrze menu dają wynik
 * zależny WYŁĄCZNIE od kolejności w tablicy przekazanej do `sortMenu` w
 * `index.ts` (sortowanie jest stabilne) — czyli od przypadku, nie od
 * świadomej decyzji o kolejności. Ten test mierzy WARTOŚCI `order`, nie
 * wyrenderowany ekran: zbiór wartości ma być tej samej liczności co lista
 * wpisów w każdym rejestrze roli.
 */

const rejestry: Record<string, MenuEntry[]> = {
  uczestnik: participantMenu,
  administracja: adminMenu,
  prowadzacy: instructorMenu,
};

describe("rejestry menu — unikalne wartości order", () => {
  it.each(Object.entries(rejestry))(
    "%s: żadne dwa wpisy nie dzielą tej samej wartości order",
    (_nazwaRejestru, menu) => {
      const wartosci = menu.map((wpis) => wpis.order);
      const duplikaty = wartosci.filter((wartosc, indeks) => wartosci.indexOf(wartosc) !== indeks);

      expect(duplikaty).toEqual([]);
    },
  );
});

const sekcjePaneli: Record<string, [MenuEntry[], MenuSection[]]> = {
  uczestnik: [participantMenu, participantMenuSections],
  administracja: [adminMenu, adminMenuSections],
  prowadzacy: [instructorMenu, instructorMenuSections],
};

describe("rejestry menu — sekcje", () => {
  it.each(Object.entries(sekcjePaneli))(
    "%s: każdy wpis z sekcją wskazuje sekcję opisaną w rejestrze, sekcje mają unikalne id i order",
    (_nazwa, [menu, sekcje]) => {
      const znane = sekcje.map((s) => s.id);
      const nieznane = menu.filter((w) => w.section && !znane.includes(w.section));
      const kolejnosc = sekcje.map((s) => s.order);

      expect(nieznane.map((w) => w.label)).toEqual([]);
      expect(new Set(znane).size).toBe(znane.length);
      expect(new Set(kolejnosc).size).toBe(kolejnosc.length);
    },
  );

  it.each(Object.entries(sekcjePaneli))(
    "%s: każdy wpis ma ikonę",
    (_nazwa, [menu]) => {
      expect(menu.filter((w) => !w.icon).map((w) => w.label)).toEqual([]);
    },
  );

  it("administracja: przyjęty podział na sekcje i kolejność w sekcjach", () => {
    const grupy = groupMenu(adminMenu, adminMenuSections);

    expect(grupy.map((g) => [g.label ?? "", g.entries.map((e) => e.label)])).toEqual([
      ["", ["Pulpit"]],
      ["Nauka", ["Kursy", "Czas nauki"]],
      ["Osoby", ["Uczestniczki", "Certyfikaty", "Profile psychologa"]],
      ["Praktyka", ["Akceptacja stażu", "Superwizje"]],
      ["Obsługa", ["Sprawy", "Skrzynka e-maili"]],
      ["Raporty", ["Raport", "Dziennik działań"]],
      ["Konfiguracja", ["Ekran startowy", "Ustawienia"]],
    ]);
  });

  it("uczestnik: wolontariuszka ma sekcje, studentka jedną listę (6 wpisów, próg to 7)", () => {
    const wolontariusz = groupMenu(filterMenuByRole(participantMenu, "volunteer"), participantMenuSections);
    const student = groupMenu(filterMenuByRole(participantMenu, "student"), participantMenuSections);

    expect(wolontariusz.map((g) => g.label)).toEqual([undefined, "Program", "Twoje konto"]);
    expect(wolontariusz.flatMap((g) => g.entries)).toHaveLength(10);

    // Studentka nie widzi czterech wpisów wolontariatu, zostaje jej 6 — poniżej
    // progu sekcji, więc menu jest jedną listą bez nagłówków.
    expect(student.map((g) => g.label)).toEqual([undefined]);
    const etykietyStudenta = student.flatMap((g) => g.entries).map((e) => e.label);
    expect(etykietyStudenta).not.toContain("Certyfikat");
    expect(etykietyStudenta).not.toContain("Dziennik stażu");
    expect(etykietyStudenta).not.toContain("Profil psychologa");
    expect(etykietyStudenta).not.toContain("Superwizja");
    expect(etykietyStudenta).toHaveLength(6);
  });

  it("prowadzący: pięć wpisów, jedna lista bez nagłówków", () => {
    const grupy = groupMenu(instructorMenu, instructorMenuSections);

    expect(grupy).toHaveLength(1);
    expect(grupy[0].label).toBeUndefined();
    expect(grupy[0].entries.map((e) => e.label)).toEqual([
      "Start",
      "Kursy",
      "Moja grupa",
      "Wątek grupowy",
      "Pytania",
    ]);
  });
});
