import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { odslonBiezacaPozycje, PowlokaPanelu } from "../PowlokaPanelu/PowlokaPanelu";
import { DetailTemplate } from "../DetailTemplate/DetailTemplate";
import { PageHeader } from "../../organizmy/PageHeader/PageHeader";
import { PanelNav } from "../../organizmy/PanelNav/PanelNav";
import { DostawcaPowloki } from "../KontekstPowloki";
import { DostawcaRamki } from "../KontekstRamki";

const sciezkaTestu = vi.hoisted(() => ({ wartosc: "" }));
vi.mock("next/navigation", () => ({ usePathname: () => sciezkaTestu.wartosc }));

/**
 * Szablon powłoki panelu (ramka z makiety 2.0.4) i nagłówek ekranu w tej
 * powłoce: jeden `main` pod `id="tresc"`, jeden link skoku, menu w `nav`
 * „Menu główne” z linią „W przygotowaniu”, grupa „Konto” z wylogowaniem,
 * rok programu tylko wtedy, gdy jest; nagłówek ekranu w nowej ramce
 * (`DostawcaRamki` z menu, wstawiany przez powłokę) bez „Wstecz”, z okruszkiem
 * liczonym regułą z `OkruszekRamki.ts` z menu i ścieżki (korzeń „Administracja”,
 * pozycja menu, bieżąca) — w starej powłoce (sam `DostawcaPowloki`) i bez
 * dostawców bez zmian.
 */

const GRUPY = [
  {
    naglowek: "Codziennie",
    pozycje: [
      { ikona: "home" as const, etykieta: "Pulpit", href: "/admin", biezaca: true },
      { ikona: "inbox" as const, etykieta: "Sprawy", href: "/admin/sprawy" },
    ],
  },
  {
    naglowek: "Program",
    pozycje: [{ ikona: "book" as const, etykieta: "Kursy", href: "/admin/kursy" }],
    liniaWPrzygotowaniu: "prowadzący · staż i superwizja",
  },
];

function wyrenderuj(wlasciwosci: Partial<Parameters<typeof PowlokaPanelu>[0]> = {}) {
  const onWyloguj = vi.fn();
  const wynik = render(
    <PowlokaPanelu
      uzytkownik={{ imie: "Ewa", nazwisko: "Demo", rola: "administracja Fundacji" }}
      grupy={GRUPY}
      onWyloguj={onWyloguj}
      {...wlasciwosci}
    >
      <DetailTemplate
        naglowek={{ okruszki: [{ etykieta: "Ekran" }], tytul: "Ekran próbny", onPowrot: () => {} }}
        glowna={<p>Treść</p>}
        wspierajaca={<p>Obok</p>}
      />
    </PowlokaPanelu>,
  );
  return { ...wynik, onWyloguj };
}

afterEach(() => {
  cleanup();
  sciezkaTestu.wartosc = "";
});

describe("PowlokaPanelu", () => {
  it("jeden main pod #tresc, jeden link skoku na #tresc, szablon ekranu bez drugiego main", () => {
    const { container } = wyrenderuj();
    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(container.querySelectorAll("#tresc")).toHaveLength(1);
    expect(container.querySelector("main")?.id).toBe("tresc");
    const skoki = screen.getAllByRole("link", { name: "Przejdź do treści" });
    expect(skoki).toHaveLength(1);
    expect(skoki[0].getAttribute("href")).toBe("#tresc");
    expect(container.querySelector("[data-powloka-panelu]")).not.toBeNull();
  });

  it("menu: nav „Menu główne”, pozycje w kolejności, bieżąca oznaczona, linia „W przygotowaniu” dosłownie", () => {
    wyrenderuj();
    const nav = screen.getByRole("navigation", { name: "Menu główne" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual(["Pulpit", "Sprawy", "Kursy"]);
    expect(within(nav).getByRole("link", { name: "Pulpit" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByText("W przygotowaniu: prowadzący · staż i superwizja.")).toBeTruthy();
    expect(within(nav).queryAllByRole("link", { name: /W przygotowaniu/ })).toHaveLength(0);
  });

  it("grupa „Konto”: przycisk „Wyloguj” woła przekazaną obsługę, w trakcie jest wyłączony", () => {
    const { onWyloguj } = wyrenderuj();
    const nav = screen.getByRole("navigation", { name: "Menu główne" });
    expect(within(nav).getByText("Konto")).toBeTruthy();
    fireEvent.click(within(nav).getByRole("button", { name: "Wyloguj" }));
    expect(onWyloguj).toHaveBeenCalledTimes(1);
    cleanup();

    wyrenderuj({ wylogowywanie: true });
    expect((screen.getByRole("button", { name: "Wylogowywanie…" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("pasek: „PsychON · rok programu 2026/27” z rokiem, samo „PsychON” bez roku, bez komunikatu", () => {
    const { container } = wyrenderuj({ rokProgramu: "2026/27" });
    const pasek = () => container.querySelector("[data-pasek-programu]");
    expect(pasek()?.textContent?.replace(/\s+/g, " ").trim()).toBe("PsychON · rok programu 2026/27");
    expect(screen.getByText("2026/27")).toBeTruthy();
    expect(container.textContent).not.toContain("Rok programu:");
    cleanup();

    const bezRoku = wyrenderuj({ rokProgramu: null });
    expect(bezRoku.container.querySelector("[data-pasek-programu]")?.textContent?.trim()).toBe("PsychON");
    expect(bezRoku.container.textContent).not.toMatch(/rok programu/i);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("przycisk „Menu” otwiera okno menu z przyciskiem „Zamknij”, zamknięcie je usuwa", () => {
    const { container } = wyrenderuj();
    const menu = screen.getByRole("button", { name: "Menu" });
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    expect(menu.getAttribute("aria-controls")).toBe("menu-panelu");
    expect(container.querySelector("dialog")).toBeNull();

    fireEvent.click(menu);
    const okno = container.querySelector("dialog#menu-panelu");
    expect(okno).not.toBeNull();
    expect(screen.getByRole("button", { name: "Menu" }).getAttribute("aria-expanded")).toBe("true");
    expect(within(okno as HTMLElement).getByRole("navigation", { name: "Menu główne" })).toBeTruthy();

    fireEvent.click(within(okno as HTMLElement).getByRole("button", { name: "Zamknij" }));
    fireEvent(okno as HTMLElement, new Event("close"));
    expect(container.querySelector("dialog")).toBeNull();
  });

  it("narzędzia paska i stopka menu trafiają na swoje miejsca", () => {
    wyrenderuj({ narzedziaPaska: <button type="button">Pomoc</button>, stopka: <a href="/deklaracja-dostepnosci">Deklaracja dostępności</a> });
    expect(screen.getByRole("button", { name: "Menu" }).closest("header")?.textContent).toContain("Pomoc");
    expect(screen.getByRole("complementary", { name: "Menu i konto" }).textContent).toContain("Deklaracja dostępności");
  });
});

describe("PanelNav poza powłoką", () => {
  it("bez nowych właściwości: nazwa „Nawigacja panelu”, bez linii „W przygotowaniu” i bez bloku konta", () => {
    render(<PanelNav uzytkownik={{ imie: "Ewa", rola: "Wolontariusz" }} grupy={[GRUPY[0]]} />);
    const nav = screen.getByRole("navigation", { name: "Nawigacja panelu" });
    expect(nav.textContent).not.toContain("W przygotowaniu");
    expect(within(nav).queryByRole("button")).toBeNull();
  });
});

describe("PageHeader w nowej ramce i poza nią", () => {
  const okruszkiListy = [{ etykieta: "Słownik form stażu" }];
  const okruszkiSzczegolu = [
    { etykieta: "Pulpit", href: "/admin" },
    { etykieta: "Profile psychologa", href: "/admin/profile" },
    { etykieta: "Profil 12" },
  ];

  it("bez dostawców: przycisk „Wstecz” i pełne okruszki, także bez łączy (bez zmian)", () => {
    const onPowrot = vi.fn();
    render(<PageHeader okruszki={okruszkiListy} tytul="Słownik form stażu" onPowrot={onPowrot} />);
    fireEvent.click(screen.getByTestId("pageheader-powrot"));
    expect(onPowrot).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("navigation", { name: "Okruszki" }).textContent).toContain("Słownik form stażu");
  });

  it("w nowej ramce, ekran bez łączy w okruszkach: bez „Wstecz” i bez okruszków, tytuł zostaje", () => {
    render(
      <DostawcaRamki>
        <PageHeader okruszki={okruszkiListy} tytul="Słownik form stażu" onPowrot={() => {}} />
      </DostawcaRamki>,
    );
    expect(screen.queryByTestId("pageheader-powrot")).toBeNull();
    expect(screen.queryByRole("button", { name: "Wstecz" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Okruszki" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Słownik form stażu" })).toBeTruthy();
  });

  it.each([
    ["jeden okruszek bez łącza", [{ etykieta: "Po programie" }]],
    ["dwa okruszki bez łącza", [{ etykieta: "Po programie" }, { etykieta: "Dalsza współpraca" }]],
  ])("w nowej ramce, ekran „Po programie” (%s, z obsługą powrotu): bez „Wstecz”, bez okruszków, bez błędu", (_opis, okruszki) => {
    render(
      <DostawcaRamki>
        <PageHeader okruszki={okruszki} tytul="Po programie" onPowrot={() => {}} />
      </DostawcaRamki>,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Okruszki" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Po programie" })).toBeTruthy();
  });

  it("bez dostawców ten sam ekran „Po programie”: „Wstecz” i okruszki jak dotąd", () => {
    render(<PageHeader okruszki={[{ etykieta: "Po programie" }]} tytul="Po programie" onPowrot={() => {}} />);
    expect(screen.getByRole("button", { name: "Wstecz" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Okruszki" }).textContent).toContain("Po programie");
  });

  it("w nowej ramce, ekran szczegółu: okruszki z łączami i bieżącą pozycją, bez „Wstecz”", () => {
    render(
      <DostawcaRamki>
        <PageHeader okruszki={okruszkiSzczegolu} tytul="Profil 12" onPowrot={() => {}} />
      </DostawcaRamki>,
    );
    expect(screen.queryByTestId("pageheader-powrot")).toBeNull();
    const okruszki = screen.getByRole("navigation", { name: "Okruszki" });
    expect(within(okruszki).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/admin", "/admin/profile"]);
    expect(okruszki.textContent).toContain("Profil 12");
  });

  it("w nowej ramce: pozycje bez łącza w środku śladu odpadają, ostatnia zostaje", () => {
    render(
      <DostawcaRamki>
        <PageHeader
          okruszki={[{ etykieta: "Pulpit", href: "/admin" }, { etykieta: "Grupa bez adresu" }, { etykieta: "Profil 12" }]}
          tytul="Profil 12"
          onPowrot={() => {}}
        />
      </DostawcaRamki>,
    );
    const okruszki = screen.getByRole("navigation", { name: "Okruszki" });
    expect(okruszki.textContent).not.toContain("Grupa bez adresu");
    expect(okruszki.textContent).toContain("Profil 12");
  });

  /**
   * Stara powłoka (`PanelShell`) wstawia sam `DostawcaPowloki` („`main` niesie
   * powłoka”). To nie jest nowa ramka: nagłówek zostaje jak przed nową ramką —
   * „Wstecz” i pełne okruszki, także pozycje bez łącza.
   */
  it("sam DostawcaPowloki (stara powłoka), ekran listy: „Wstecz” działa i pełne okruszki bez łączy", () => {
    const onPowrot = vi.fn();
    render(
      <DostawcaPowloki>
        <PageHeader okruszki={okruszkiListy} tytul="Słownik form stażu" onPowrot={onPowrot} />
      </DostawcaPowloki>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Wstecz" }));
    expect(onPowrot).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("navigation", { name: "Okruszki" }).textContent).toContain("Słownik form stażu");
  });

  it("sam DostawcaPowloki (stara powłoka), ekran szczegółu: „Wstecz” i wszystkie okruszki, także bez łącza", () => {
    render(
      <DostawcaPowloki>
        <PageHeader
          okruszki={[{ etykieta: "Pulpit", href: "/admin" }, { etykieta: "Grupa bez adresu" }, { etykieta: "Profil 12" }]}
          tytul="Profil 12"
          onPowrot={() => {}}
        />
      </DostawcaPowloki>,
    );
    expect(screen.getByTestId("pageheader-powrot")).toBeTruthy();
    const okruszki = screen.getByRole("navigation", { name: "Okruszki" });
    expect(okruszki.textContent).toContain("Pulpit");
    expect(okruszki.textContent).toContain("Grupa bez adresu");
    expect(okruszki.textContent).toContain("Profil 12");
  });

  it("sam DostawcaPowloki, ekran „Po programie”: „Wstecz” i okruszki jak bez dostawców", () => {
    render(
      <DostawcaPowloki>
        <PageHeader okruszki={[{ etykieta: "Po programie" }]} tytul="Po programie" onPowrot={() => {}} />
      </DostawcaPowloki>,
    );
    expect(screen.getByRole("button", { name: "Wstecz" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Okruszki" }).textContent).toContain("Po programie");
  });

  it("PowlokaPanelu wstawia dostawcę nowej ramki z menu: nagłówek ekranu bez „Wstecz”, okruszek korzeń › pozycja menu › bieżąca", () => {
    sciezkaTestu.wartosc = "/admin/profile/12";
    const grupy = [
      ...GRUPY.map((grupa) => ({ ...grupa, pozycje: grupa.pozycje.map((pozycja) => ({ ikona: pozycja.ikona, etykieta: pozycja.etykieta, href: pozycja.href })) })),
      {
        naglowek: "Rozliczenie",
        pozycje: [{ ikona: "user" as const, etykieta: "Profile psychologa", href: "/admin/profile", biezaca: true }],
      },
    ];
    render(
      <PowlokaPanelu uzytkownik={{ imie: "Ewa", nazwisko: "Demo", rola: "administracja Fundacji" }} grupy={grupy} onWyloguj={() => {}}>
        <PageHeader
          okruszki={[{ etykieta: "Profile psychologa", href: "/admin/profile" }, { etykieta: "Wniosek o profil" }]}
          tytul="Wniosek o profil: Ola Demo"
          onPowrot={() => {}}
        />
      </PowlokaPanelu>,
    );
    expect(screen.queryByTestId("pageheader-powrot")).toBeNull();
    const okruszki = screen.getByRole("navigation", { name: "Okruszki" });
    expect(within(okruszki).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/admin", "/admin/profile"]);
    expect(okruszki.textContent).toContain("Wniosek o profil");
  });

  it("podstrona rodzica: menu oznacza rodzica aria-current=\"true\" (nie „page”), a okruszek idzie przez rodzica", () => {
    sciezkaTestu.wartosc = "/admin/nabor";
    const podstrony = [{ etykieta: "Zgłoszenia rekrutacyjne", href: "/admin/nabor" }];
    const grupy = [
      {
        naglowek: "Codziennie",
        pozycje: [
          { ikona: "home" as const, etykieta: "Pulpit", href: "/admin" },
          { ikona: "inbox" as const, etykieta: "Sprawy", href: "/admin/sprawy", biezaca: "sekcja" as const, podstrony },
        ],
      },
    ];
    render(
      <PowlokaPanelu uzytkownik={{ imie: "Ewa", nazwisko: "Demo", rola: "administracja Fundacji" }} grupy={grupy} onWyloguj={() => {}}>
        <PageHeader
          okruszki={[{ etykieta: "Administracja" }, { etykieta: "Sprawy" }, { etykieta: "Zgłoszenia rekrutacyjne" }]}
          tytul="Zgłoszenia rekrutacyjne"
          onPowrot={() => {}}
        />
      </PowlokaPanelu>,
    );
    const menu = within(screen.getByRole("navigation", { name: "Menu główne" }));
    expect(menu.getByRole("link", { name: "Sprawy" }).getAttribute("aria-current")).toBe("true");
    expect(menu.getByRole("link", { name: "Pulpit" }).hasAttribute("aria-current")).toBe(false);
    expect(menu.queryAllByRole("link", { name: "Zgłoszenia rekrutacyjne" })).toHaveLength(0);
    const okruszki = screen.getByRole("navigation", { name: "Okruszki" });
    expect(within(okruszki).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/admin", "/admin/sprawy"]);
    expect(okruszki.textContent).toContain("Zgłoszenia rekrutacyjne");
  });
});

/**
 * Nawigacja kliencka menu (`onNawigacja`): zwykły klik łącza wewnętrznego idzie
 * przez wywołującego (np. `router.push`) i nie przeładowuje strony; klik
 * z Ctrl/Meta/Shift, środkowym przyciskiem i łącze zewnętrzne działają
 * domyślnie. Bez propu (administracja) każdy klik działa domyślnie.
 * `fireEvent.click` zwraca `false`, gdy domyślna akcja została zatrzymana.
 */
describe("PowlokaPanelu — nawigacja kliencka menu", () => {
  const Z_ZEWNETRZNYM = [
    ...GRUPY,
    { naglowek: "Pomoc", pozycje: [{ ikona: "help" as const, etykieta: "Strona Fundacji", href: "https://niepodzielni.example" }] },
  ];

  function menuBoczne() {
    return within(screen.getByRole("complementary", { name: "Menu i konto" }));
  }

  it("zwykły klik pozycji wewnętrznej: onNawigacja(href) i zatrzymana domyślna akcja", () => {
    const onNawigacja = vi.fn();
    wyrenderuj({ onNawigacja });
    const domyslna = fireEvent.click(menuBoczne().getByRole("link", { name: "Sprawy" }));
    expect(onNawigacja).toHaveBeenCalledTimes(1);
    expect(onNawigacja).toHaveBeenCalledWith("/admin/sprawy");
    expect(domyslna).toBe(false);
  });

  it.each([
    ["Ctrl", { ctrlKey: true }],
    ["Meta", { metaKey: true }],
    ["Shift", { shiftKey: true }],
    ["środkowy przycisk", { button: 1 }],
  ])("klik z modyfikatorem (%s): bez onNawigacja, domyślna akcja", (_nazwa, opcje) => {
    const onNawigacja = vi.fn();
    wyrenderuj({ onNawigacja });
    const domyslna = fireEvent.click(menuBoczne().getByRole("link", { name: "Sprawy" }), opcje);
    expect(onNawigacja).not.toHaveBeenCalled();
    expect(domyslna).toBe(true);
  });

  it("łącze zewnętrzne: bez onNawigacja, domyślna akcja", () => {
    const onNawigacja = vi.fn();
    wyrenderuj({ onNawigacja, grupy: Z_ZEWNETRZNYM });
    const domyslna = fireEvent.click(menuBoczne().getByRole("link", { name: "Strona Fundacji" }));
    expect(onNawigacja).not.toHaveBeenCalled();
    expect(domyslna).toBe(true);
  });

  it("bez propu (administracja): zwykły klik działa domyślnie", () => {
    wyrenderuj();
    expect(fireEvent.click(menuBoczne().getByRole("link", { name: "Sprawy" }))).toBe(true);
  });

  it("linia konta: „W przygotowaniu: …” pod wylogowaniem tylko z propem liniaKonta", () => {
    wyrenderuj({ liniaKonta: "profil · pomoc" });
    expect(screen.getAllByText("W przygotowaniu: profil · pomoc.")).toHaveLength(1);
    cleanup();
    wyrenderuj();
    expect(screen.queryByText(/W przygotowaniu: profil/)).toBeNull();
  });
});

/**
 * Grupa zwinięta („Dotychczasowy panel (n)”) przed grupą „Konto”: na wejściu
 * zwinięta, przycisk z `aria-expanded` i `aria-controls`, po kliknięciu
 * pozycje widoczne. Przycisk „Zamknij” okna menu ze znakiem „×” (ukrytym dla
 * czytnika, nazwa przycisku zostaje „Zamknij”).
 */
describe("PowlokaPanelu — grupa zwinięta i zamknięcie okna", () => {
  const ZWINIETA = {
    naglowek: "Dotychczasowy panel",
    pozycje: [
      { ikona: "clock" as const, etykieta: "Dziennik stażu", href: "/panel/staz" },
      { ikona: "file" as const, etykieta: "Dokumenty", href: "/panel/dokumenty" },
    ],
  };

  it("na wejściu zwinięta: przycisk „Dotychczasowy panel (2)”, aria-expanded=false, lista ukryta", () => {
    wyrenderuj({ grupaZwinieta: ZWINIETA });
    const bok = screen.getByRole("complementary", { name: "Menu i konto" });
    const przycisk = within(bok).getByRole("button", { name: "Dotychczasowy panel (2)" });
    expect(przycisk.getAttribute("aria-expanded")).toBe("false");
    const lista = document.getElementById(przycisk.getAttribute("aria-controls") ?? "");
    expect(lista).not.toBeNull();
    expect(lista?.hidden).toBe(true);
    expect(within(bok).queryByRole("link", { name: "Dziennik stażu" })).toBeNull();
  });

  it("kliknięcie rozwija: aria-expanded=true i pozycje jako łącza; drugie zwija", () => {
    wyrenderuj({ grupaZwinieta: ZWINIETA });
    const bok = screen.getByRole("complementary", { name: "Menu i konto" });
    const przycisk = within(bok).getByRole("button", { name: "Dotychczasowy panel (2)" });
    fireEvent.click(przycisk);
    expect(przycisk.getAttribute("aria-expanded")).toBe("true");
    expect(within(bok).getByRole("link", { name: "Dziennik stażu" }).getAttribute("href")).toBe("/panel/staz");
    expect(within(bok).getByRole("link", { name: "Dokumenty" }).getAttribute("href")).toBe("/panel/dokumenty");
    fireEvent.click(przycisk);
    expect(przycisk.getAttribute("aria-expanded")).toBe("false");
  });

  it("stoi przed grupą „Konto” i przed „Wyloguj”", () => {
    wyrenderuj({ grupaZwinieta: ZWINIETA });
    const bok = screen.getByRole("complementary", { name: "Menu i konto" });
    const przycisk = within(bok).getByRole("button", { name: "Dotychczasowy panel (2)" });
    const konto = within(bok).getByText("Konto");
    const wyloguj = within(bok).getByRole("button", { name: "Wyloguj" });
    expect(przycisk.compareDocumentPosition(konto) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(przycisk.compareDocumentPosition(wyloguj) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("grupa z bieżącą pozycją (ekran szczegółu pod jej adresem) na wejściu rozwinięta", () => {
    wyrenderuj({
      grupaZwinieta: { ...ZWINIETA, pozycje: [ZWINIETA.pozycje[0], { ...ZWINIETA.pozycje[1], biezaca: true }] },
    });
    const bok = screen.getByRole("complementary", { name: "Menu i konto" });
    expect(within(bok).getByRole("button", { name: "Dotychczasowy panel (2)" }).getAttribute("aria-expanded")).toBe("true");
    expect(within(bok).getByRole("link", { name: "Dokumenty" }).getAttribute("aria-current")).toBe("page");
  });

  it("bez grupy zwiniętej: brak przycisku grupy", () => {
    wyrenderuj();
    expect(screen.queryByRole("button", { name: /Dotychczasowy panel/ })).toBeNull();
  });

  it("okno menu: „Zamknij” ze znakiem „×” ukrytym dla czytnika", () => {
    wyrenderuj();
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const okno = document.querySelector("dialog#menu-panelu") as HTMLElement;
    const zamknij = within(okno).getByRole("button", { name: "Zamknij" });
    const znak = zamknij.querySelector("[data-znak-zamknij]");
    expect(znak?.textContent?.trim()).toBe("×");
    expect(znak?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("odslonBiezacaPozycje — przewija tylko kontener menu", () => {
  afterEach(cleanup);

  function prostokat(top: number, height: number) {
    return { top, bottom: top + height, height, left: 0, right: 200, width: 200, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  }

  /** Kontener 0–800, „Konto” od `goraKonta`; pozycja w treści na `yWTresci` (wysokość 40). */
  function zbuduj(yWTresci: number, goraKonta = 640) {
    const kontener = document.createElement("aside");
    kontener.innerHTML = '<a href="/x" aria-current="page">X</a><div data-konto-menu=""></div>';
    const pozycja = kontener.querySelector("a")!;
    const konto = kontener.querySelector("div")!;
    let przewiniecie = 0;
    const zachowania: (ScrollBehavior | undefined)[] = [];
    Object.defineProperty(kontener, "scrollTop", {
      get: () => przewiniecie,
      set: (v: number) => {
        przewiniecie = v;
      },
    });
    kontener.scrollTo = ((opcje: ScrollToOptions) => {
      zachowania.push(opcje.behavior);
      przewiniecie = opcje.top ?? przewiniecie;
    }) as typeof kontener.scrollTo;
    kontener.getBoundingClientRect = () => prostokat(0, 800);
    konto.getBoundingClientRect = () => prostokat(goraKonta, 800 - goraKonta);
    pozycja.getBoundingClientRect = () => prostokat(yWTresci - przewiniecie, 40);
    return { kontener, scrollTop: () => przewiniecie, zachowania, dolPozycji: () => pozycja.getBoundingClientRect().bottom };
  }

  it("pozycja pod blokiem „Konto” — przewija, aż dół pozycji stanie nad „Konto”", () => {
    const { kontener, scrollTop } = zbuduj(994);
    odslonBiezacaPozycje(kontener);
    expect(scrollTop()).toBe(994 + 40 - 640);
  });

  it("przewinięcie bez animacji — każde wywołanie z `behavior: \"instant\"`", () => {
    const { kontener, zachowania } = zbuduj(994);
    odslonBiezacaPozycje(kontener);
    expect(zachowania.length).toBeGreaterThan(0);
    expect(zachowania.every((z) => z === "instant")).toBe(true);
  });

  it("pozycja wystaje o ułamek piksela — po przewinięciu dół pozycji <= góra „Konto” bez zaokrąglania", () => {
    // Pozycja wystaje pod górę „Konto” o ułamek piksela.
    const { kontener, scrollTop, dolPozycji } = zbuduj(658.17, 697.95);
    odslonBiezacaPozycje(kontener);
    expect(scrollTop()).toBeGreaterThan(0);
    expect(dolPozycji()).toBeLessThanOrEqual(697.95);
  });

  it("rodzic podstrony (aria-current=\"true\") też jest odsłaniany jak strona bieżąca", () => {
    const { kontener, scrollTop } = zbuduj(994);
    kontener.querySelector("a")!.setAttribute("aria-current", "true");
    odslonBiezacaPozycje(kontener);
    expect(scrollTop()).toBe(994 + 40 - 640);
  });

  it("pozycja już widoczna — scrollTop bez zmian", () => {
    const { kontener, scrollTop } = zbuduj(200);
    odslonBiezacaPozycje(kontener);
    expect(scrollTop()).toBe(0);
  });

  it("bez pozycji bieżącej — scrollTop bez zmian", () => {
    const kontener = document.createElement("aside");
    kontener.scrollTop = 0;
    odslonBiezacaPozycje(kontener);
    expect(kontener.scrollTop).toBe(0);
  });
});
