import { describe, expect, it } from "vitest";
import {
  KORZEN_ADMINISTRACJI,
  okruszekRamki,
  type GrupaMenuOkruszka,
} from "@/design-system/szablony/OkruszekRamki";
import { GRUPY, type DefinicjaGrupy } from "@/lib/przelaczenie/grupy";
import { menuRamkiAdministracji } from "../administracja";
import { menuRamkiProwadzacego } from "../prowadzacy";
import { menuRamkiUczestnika } from "../uczestnik";
import { ukladMenuRamki } from "../uklad";

/**
 * Reguła okruszka nowej ramki (`szablony/OkruszekRamki.ts`) czytana z
 * rejestru menu ramki: dla każdej pozycji każdej roli, przy obu stanach
 * rejestru przełączenia (domyślnym i z wszystkimi grupami włączonymi).
 * Test czyta rejestr, nie zmienia jego zawartości.
 */

const WSZYSTKIE_WLACZONE: Record<string, DefinicjaGrupy> = Object.fromEntries(
  Object.entries(GRUPY).map(([klucz, grupa]) => [klucz, { ...grupa, wlaczona: true }]),
);

const ROLE = [
  ["administracja", "domyślny rejestr", () => menuRamkiAdministracji()],
  ["administracja", "wszystkie grupy włączone", () => menuRamkiAdministracji(WSZYSTKIE_WLACZONE)],
  ["wolontariusz", "domyślny rejestr", () => menuRamkiUczestnika("volunteer")],
  ["wolontariusz", "wszystkie grupy włączone", () => menuRamkiUczestnika("volunteer", WSZYSTKIE_WLACZONE)],
  ["prowadzący", "domyślny rejestr", () => menuRamkiProwadzacego()],
  ["prowadzący", "wszystkie grupy włączone", () => menuRamkiProwadzacego(WSZYSTKIE_WLACZONE)],
] as const;

/** Menu roli z pozycją bieżącą dla ścieżki — dokładnie to, co dostaje `DostawcaRamki`. */
function menuDlaSciezki(menu: ReturnType<(typeof ROLE)[number][2]>, sciezka: string): GrupaMenuOkruszka[] {
  const { grupy, grupaZwinieta } = ukladMenuRamki(menu, sciezka);
  return [...grupy, ...(grupaZwinieta ? [grupaZwinieta] : [])];
}

function etykiety(okruszek: { etykieta: string }[]): string[] {
  return okruszek.map((p) => p.etykieta);
}

describe("okruszek ramki z rejestru menu", () => {
  it.each(ROLE)("%s (%s): każda pozycja menu daje okruszek wg reguły", (rola, _stan, menuRoli) => {
    const menu = menuRoli();
    const administracja = rola === "administracja";
    for (const grupa of menu) {
      for (const pozycja of grupa.pozycje) {
        const okruszek = okruszekRamki({
          menu: menuDlaSciezki(menu, pozycja.href),
          sciezka: pozycja.href,
          okruszki: [],
          tytul: "Tytuł ekranu",
        });
        const opis = `${grupa.naglowek} › ${pozycja.etykieta} (${pozycja.href})`;
        if (grupa.naglowek === "Codziennie" || !administracja) {
          // „Codziennie” (nazwa wpisana literalnie, nie ze stałej reguły) bez okruszka; uczestnik i prowadzący bez korzenia roli: jedna pozycja nigdy.
          expect(okruszek, opis).toEqual([]);
        } else {
          expect(etykiety(okruszek), opis).toEqual([KORZEN_ADMINISTRACJI.etykieta, pozycja.etykieta]);
          expect(okruszek[0].href, opis).toBe(KORZEN_ADMINISTRACJI.href);
        }
      }
    }
  });

  it.each(ROLE)("%s (%s): szczegół każdej pozycji ma łańcuch od pozycji menu, także w „Codziennie”", (rola, _stan, menuRoli) => {
    const menu = menuRoli();
    const administracja = rola === "administracja";
    for (const grupa of menu) {
      for (const pozycja of grupa.pozycje) {
        const sciezka = `${pozycja.href}/17`;
        const okruszek = okruszekRamki({
          menu: menuDlaSciezki(menu, sciezka),
          sciezka,
          okruszki: [{ etykieta: "Nazwa z ekranu" }, { etykieta: "Bieżąca z ekranu" }],
          tytul: "Tytuł ekranu",
        });
        const opis = `${grupa.naglowek} › ${pozycja.etykieta} (${sciezka})`;
        // Pulpit stoi na korzeniu sekcji: ścieżka pod nim nie należy do niego (pozycja „dokładna”).
        if (pozycja.dokladna) continue;
        expect(etykiety(okruszek), opis).toEqual([
          ...(administracja ? [KORZEN_ADMINISTRACJI.etykieta] : []),
          pozycja.etykieta,
          "Bieżąca z ekranu",
        ]);
        expect(okruszek.at(-1)?.href, opis).toBeUndefined();
        expect(okruszek.slice(0, -1).every((p) => p.href), opis).toBe(true);
      }
    }
  });

  it("administracja: ścieżka pod pulpitem, której nie ma w menu, ma okruszek od korzenia (pulpit jest pozycją dokładną)", () => {
    const menu = menuRamkiAdministracji(WSZYSTKIE_WLACZONE);
    const sciezka = "/admin/powiadomienia";
    const okruszek = okruszekRamki({
      menu: menuDlaSciezki(menu, sciezka),
      sciezka,
      okruszki: [{ etykieta: "Administracja" }, { etykieta: "Powiadomienia" }],
      tytul: "Powiadomienia",
    });
    expect(okruszek).toEqual([{ etykieta: "Administracja", href: "/admin" }, { etykieta: "Powiadomienia" }]);
  });

  it("korzeń administracji stoi pod adresem pulpitu administracji, a adresy trzech ról nie mieszają się", () => {
    const admin = menuRamkiAdministracji(WSZYSTKIE_WLACZONE).flatMap((g) => g.pozycje);
    const inni = [...menuRamkiUczestnika("volunteer", WSZYSTKIE_WLACZONE), ...menuRamkiProwadzacego(WSZYSTKIE_WLACZONE)].flatMap(
      (g) => g.pozycje,
    );
    const pulpit = menuRamkiAdministracji(WSZYSTKIE_WLACZONE)[0].pozycje[0];
    expect(pulpit.etykieta).toBe("Pulpit");
    expect(pulpit.href).toBe(KORZEN_ADMINISTRACJI.href);
    // Korzeń roli wynika ze ścieżki: wszystkie adresy administracji pod /admin, żadnego innej roli.
    const podAdmin = (href: string) => href === "/admin" || href.startsWith("/admin/");
    expect(admin.filter((p) => !podAdmin(p.href))).toEqual([]);
    expect(inni.filter((p) => podAdmin(p.href))).toEqual([]);
  });
});

describe("okruszek ramki: ekrany bez własnej pozycji w menu (podstrony „Spraw”)", () => {
  const menu = menuRamkiAdministracji(WSZYSTKIE_WLACZONE);

  it.each([
    ["/admin/staz", "Dyżury do decyzji"],
    ["/admin/nabor", "Zgłoszenia rekrutacyjne"],
  ])("%s: Administracja › Sprawy › %s, korzeń i rodzic jako łącza", (sciezka, nazwa) => {
    const okruszek = okruszekRamki({
      menu: menuDlaSciezki(menu, sciezka),
      sciezka,
      okruszki: [{ etykieta: "Administracja" }, { etykieta: "Nazwa z ekranu" }],
      tytul: nazwa,
    });
    expect(okruszek).toEqual([
      { etykieta: "Administracja", href: "/admin" },
      { etykieta: "Sprawy", href: "/admin/sprawy" },
      { etykieta: nazwa },
    ]);
  });

  it("szczegół zgłoszenia: Administracja › Sprawy › Zgłoszenia rekrutacyjne › osoba, ostatnia bez łącza", () => {
    const sciezka = "/admin/nabor/31";
    const okruszek = okruszekRamki({
      menu: menuDlaSciezki(menu, sciezka),
      sciezka,
      okruszki: [
        { etykieta: "Administracja" },
        { etykieta: "Sprawy" },
        { etykieta: "Zgłoszenia rekrutacyjne", href: "/admin/nabor" },
        { etykieta: "Marta Demo" },
      ],
      tytul: "Zgłoszenie: Marta Demo",
    });
    expect(okruszek).toEqual([
      { etykieta: "Administracja", href: "/admin" },
      { etykieta: "Sprawy", href: "/admin/sprawy" },
      { etykieta: "Zgłoszenia rekrutacyjne", href: "/admin/nabor" },
      { etykieta: "Marta Demo" },
    ]);
  });

  it("lista Spraw nie ma okruszka, a „Osoby” (pozycja Codziennie) też nie", () => {
    for (const sciezka of ["/admin/sprawy", "/admin/uczestniczki"]) {
      expect(
        okruszekRamki({ menu: menuDlaSciezki(menu, sciezka), sciezka, okruszki: [], tytul: "Tytuł" }),
        sciezka,
      ).toEqual([]);
    }
  });
});
