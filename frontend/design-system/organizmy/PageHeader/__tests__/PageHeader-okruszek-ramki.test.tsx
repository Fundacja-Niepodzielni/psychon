import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { PageHeader } from "../PageHeader";
import { DostawcaPowloki } from "../../../szablony/KontekstPowloki";
import { DostawcaRamki } from "../../../szablony/KontekstRamki";
import type { GrupaMenuOkruszka } from "../../../szablony/OkruszekRamki";

/**
 * Okruszek w nagłówku ekranu nowej ramki: jedna reguła liczona z menu ramki
 * i bieżącej ścieżki (`szablony/OkruszekRamki.ts`), bez zmian w ekranach.
 * Pięć przypadków z reguły: „Codziennie” bez okruszka, „Rozliczenie” z
 * korzeniem, szczegół z pełnym łańcuchem, jedna pozycja nigdy, uczestnik od
 * sekcji — oraz poza nową ramką bez zmian.
 */

const ramka = vi.hoisted(() => ({ sciezka: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => ramka.sciezka }));

/** Menu administracji w układzie ramki; pozycja bieżąca wynika ze ścieżki testu. */
function menuAdministracji(sciezka: string): GrupaMenuOkruszka[] {
  const biezaca = (href: string, dokladna = false) =>
    dokladna ? sciezka === href : sciezka === href || sciezka.startsWith(`${href}/`);
  return [
    {
      naglowek: "Codziennie",
      pozycje: [
        { etykieta: "Pulpit", href: "/admin", biezaca: biezaca("/admin", true) },
        { etykieta: "Sprawy", href: "/admin/sprawy", biezaca: biezaca("/admin/sprawy") },
        { etykieta: "Dyżury do decyzji", href: "/admin/staz", biezaca: biezaca("/admin/staz") },
        { etykieta: "Uczestnicy", href: "/admin/uczestniczki", biezaca: biezaca("/admin/uczestniczki") },
      ],
    },
    {
      naglowek: "Program",
      pozycje: [{ etykieta: "Słownik form stażu", href: "/admin/formy-stazu", biezaca: biezaca("/admin/formy-stazu") }],
    },
    {
      naglowek: "Rozliczenie",
      pozycje: [{ etykieta: "Dziennik działań", href: "/admin/dziennik", biezaca: biezaca("/admin/dziennik") }],
    },
  ];
}

/** Menu uczestnika: bez grupy „Codziennie” i bez korzenia roli. */
function menuUczestnika(sciezka: string): GrupaMenuOkruszka[] {
  return [
    {
      naglowek: "Program",
      pozycje: [
        { etykieta: "Pulpit", href: "/panel", biezaca: sciezka === "/panel" },
        { etykieta: "Kursy", href: "/panel/kursy", biezaca: sciezka === "/panel/kursy" || sciezka.startsWith("/panel/kursy/") },
      ],
    },
  ];
}

interface Ekran {
  sciezka: string;
  menu: (sciezka: string) => GrupaMenuOkruszka[];
  okruszki: { etykieta: string; href?: string }[];
  tytul: string;
}

function wyrenderuj({ sciezka, menu, okruszki, tytul }: Ekran) {
  ramka.sciezka = sciezka;
  return render(
    <DostawcaRamki menu={menu(sciezka)}>
      <PageHeader okruszki={okruszki} tytul={tytul} onPowrot={() => {}} />
    </DostawcaRamki>,
  );
}

/** Okruszek jako [[tekst, href|null], …] albo `null`, gdy go nie ma. */
function okruszek(): [string, string | null][] | null {
  const nav = screen.queryByRole("navigation", { name: "Okruszki" });
  if (!nav) return null;
  return within(nav)
    .getAllByRole("listitem")
    .map((li) => [li.textContent?.replace("›", "").trim() ?? "", li.querySelector("a")?.getAttribute("href") ?? null]);
}

afterEach(cleanup);

describe("PageHeader w nowej ramce: okruszek liczony z menu", () => {
  it.each([
    ["Pulpit", "/admin", [{ etykieta: "Administracja" }, { etykieta: "Pulpit administracji" }]],
    ["Sprawy", "/admin/sprawy", [{ etykieta: "Administracja" }, { etykieta: "Sprawy" }]],
    ["Dyżury do decyzji", "/admin/staz", [{ etykieta: "Administracja" }, { etykieta: "Dyżury do decyzji" }]],
    ["Uczestnicy", "/admin/uczestniczki", [{ etykieta: "Administracja" }, { etykieta: "Osoby" }]],
  ])("„Codziennie”, ekran listy %s: bez okruszka, tytuł zostaje", (_nazwa, sciezka, okruszki) => {
    wyrenderuj({ sciezka, menu: menuAdministracji, okruszki, tytul: "Tytuł ekranu" });
    expect(okruszek()).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Tytuł ekranu" })).toBeTruthy();
    expect(screen.queryByTestId("pageheader-powrot")).toBeNull();
  });

  it("„Rozliczenie”: korzeń „Administracja” (łącze do /admin) i bieżąca z nazwą pozycji menu", () => {
    wyrenderuj({
      sciezka: "/admin/dziennik",
      menu: menuAdministracji,
      okruszki: [{ etykieta: "Administracja" }, { etykieta: "Dziennik" }],
      tytul: "Dziennik działań",
    });
    expect(okruszek()).toEqual([
      ["Administracja", "/admin"],
      ["Dziennik działań", null],
    ]);
  });

  it("„Program”: korzeń i bieżąca także na ekranie bez okruszków podanych przez ekran", () => {
    wyrenderuj({ sciezka: "/admin/formy-stazu", menu: menuAdministracji, okruszki: [], tytul: "Słownik form stażu" });
    expect(okruszek()).toEqual([
      ["Administracja", "/admin"],
      ["Słownik form stażu", null],
    ]);
  });

  it("szczegół z listy „Codziennie”: pełny łańcuch korzeń › pozycja menu › bieżąca, nazwa pozycji z menu", () => {
    wyrenderuj({
      sciezka: "/admin/uczestniczki/17",
      menu: menuAdministracji,
      okruszki: [{ etykieta: "Administracja" }, { etykieta: "Osoby" }, { etykieta: "Marta Demo" }],
      tytul: "Karta osoby",
    });
    expect(okruszek()).toEqual([
      ["Administracja", "/admin"],
      ["Uczestnicy", "/admin/uczestniczki"],
      ["Marta Demo", null],
    ]);
  });

  it("szczegół bez okruszków ekranu: bieżąca to tytuł", () => {
    wyrenderuj({ sciezka: "/admin/staz/4", menu: menuAdministracji, okruszki: [], tytul: "Dyżur z 27 sierpnia" });
    expect(okruszek()).toEqual([
      ["Administracja", "/admin"],
      ["Dyżury do decyzji", "/admin/staz"],
      ["Dyżur z 27 sierpnia", null],
    ]);
  });

  it("szczegół: łącza pośrednie ekranu zostają w kolejności, bez powtórzeń korzenia i pozycji menu", () => {
    wyrenderuj({
      sciezka: "/admin/formy-stazu/3/historia",
      menu: menuAdministracji,
      okruszki: [
        { etykieta: "Administracja", href: "/admin" },
        { etykieta: "Słownik form stażu", href: "/admin/formy-stazu" },
        { etykieta: "Forma bez adresu" },
        { etykieta: "Dyżur telefoniczny", href: "/admin/formy-stazu/3" },
        { etykieta: "Historia zmian" },
      ],
      tytul: "Historia zmian",
    });
    expect(okruszek()).toEqual([
      ["Administracja", "/admin"],
      ["Słownik form stażu", "/admin/formy-stazu"],
      ["Dyżur telefoniczny", "/admin/formy-stazu/3"],
      ["Historia zmian", null],
    ]);
  });

  it("okruszek z jedną pozycją nie powstaje: uczestnik, lista „Kursy” (jedna pozycja menu)", () => {
    wyrenderuj({ sciezka: "/panel/kursy", menu: menuUczestnika, okruszki: [{ etykieta: "Kursy" }], tytul: "Kursy" });
    expect(okruszek()).toBeNull();
  });

  it("okruszek z jedną pozycją nie powstaje: pulpit uczestnika stoi w „Program”, ale łańcuch ma jedną pozycję", () => {
    wyrenderuj({ sciezka: "/panel", menu: menuUczestnika, okruszki: [{ etykieta: "Pulpit" }], tytul: "Pulpit" });
    expect(okruszek()).toBeNull();
  });

  it("uczestnik: okruszek od sekcji, bez korzenia roli i bez „Administracja”", () => {
    wyrenderuj({
      sciezka: "/panel/kursy/wywiad",
      menu: menuUczestnika,
      okruszki: [{ etykieta: "Kursy" }, { etykieta: "Wywiad psychologiczny" }],
      tytul: "Wywiad psychologiczny",
    });
    expect(okruszek()).toEqual([
      ["Kursy", "/panel/kursy"],
      ["Wywiad psychologiczny", null],
    ]);
  });

  it("uczestnik, ekran poza menu (lekcja): okruszek z łączy ekranu, bez korzenia roli", () => {
    wyrenderuj({
      sciezka: "/panel/lekcje/21",
      menu: menuUczestnika,
      okruszki: [
        { etykieta: "Kursy", href: "/panel/kursy" },
        { etykieta: "Wywiad psychologiczny", href: "/panel/kursy/wywiad" },
        { etykieta: "Wprowadzenie do wywiadu" },
      ],
      tytul: "Wprowadzenie do wywiadu",
    });
    expect(okruszek()).toEqual([
      ["Kursy", "/panel/kursy"],
      ["Wywiad psychologiczny", "/panel/kursy/wywiad"],
      ["Wprowadzenie do wywiadu", null],
    ]);
  });

  it("administracja, ekran poza menu: korzeń przed okruszkami ekranu", () => {
    wyrenderuj({
      sciezka: "/admin/powiadomienia",
      menu: menuAdministracji,
      okruszki: [{ etykieta: "Administracja" }, { etykieta: "Powiadomienia" }],
      tytul: "Powiadomienia",
    });
    expect(okruszek()).toEqual([
      ["Administracja", "/admin"],
      ["Powiadomienia", null],
    ]);
  });

  it("bieżąca pozycja ma aria-current=\"page\" i jest tekstem, nie łączem", () => {
    wyrenderuj({
      sciezka: "/admin/dziennik",
      menu: menuAdministracji,
      okruszki: [{ etykieta: "Dziennik" }],
      tytul: "Dziennik działań",
    });
    const biezace = screen.getByRole("navigation", { name: "Okruszki" }).querySelectorAll('[aria-current="page"]');
    expect(biezace).toHaveLength(1);
    expect(biezace[0].textContent).toBe("Dziennik działań");
    expect(biezace[0].querySelector("a")).toBeNull();
  });

  it("ścieżka z ukośnikiem na końcu to ta sama pozycja", () => {
    wyrenderuj({ sciezka: "/admin/sprawy/", menu: (s) => menuAdministracji(s.replace(/\/$/, "")), okruszki: [], tytul: "Sprawy" });
    expect(okruszek()).toBeNull();
  });

  it("sama ramka bez menu (bez pozycji menu i bez korzenia): łącza ekranu plus bieżąca, jedna pozycja nigdy", () => {
    ramka.sciezka = "";
    render(
      <DostawcaRamki>
        <PageHeader okruszki={[{ etykieta: "Słownik form stażu" }]} tytul="Słownik form stażu" onPowrot={() => {}} />
      </DostawcaRamki>,
    );
    expect(okruszek()).toBeNull();
    cleanup();
    render(
      <DostawcaRamki>
        <PageHeader
          okruszki={[{ etykieta: "Profile psychologa", href: "/admin/profile" }, { etykieta: "Wniosek o profil" }]}
          tytul="Wniosek o profil"
          onPowrot={() => {}}
        />
      </DostawcaRamki>,
    );
    expect(okruszek()).toEqual([
      ["Profile psychologa", "/admin/profile"],
      ["Wniosek o profil", null],
    ]);
  });
});

describe("PageHeader poza nową ramką: bez zmian", () => {
  it("stara powłoka (sam DostawcaPowloki): „Wstecz” i pełne okruszki, także bez łączy, bez aria-current", () => {
    ramka.sciezka = "/admin/sprawy";
    const onPowrot = vi.fn();
    render(
      <DostawcaPowloki>
        <PageHeader okruszki={[{ etykieta: "Administracja" }, { etykieta: "Sprawy" }]} tytul="Sprawy" onPowrot={onPowrot} />
      </DostawcaPowloki>,
    );
    expect(screen.getByTestId("pageheader-powrot")).toBeTruthy();
    expect(okruszek()).toEqual([
      ["Administracja", null],
      ["Sprawy", null],
    ]);
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
  });

  it("bez dostawców: „Wstecz” i pełne okruszki także z jedną pozycją", () => {
    render(<PageHeader okruszki={[{ etykieta: "Sprawy" }]} tytul="Sprawy" onPowrot={() => {}} />);
    expect(screen.getByTestId("pageheader-powrot")).toBeTruthy();
    expect(okruszek()).toEqual([["Sprawy", null]]);
  });
});
