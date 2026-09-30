import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { PowlokaPanelu } from "../PowlokaPanelu/PowlokaPanelu";
import { DetailTemplate } from "../DetailTemplate/DetailTemplate";
import { PageHeader } from "../../organizmy/PageHeader/PageHeader";
import { PanelNav } from "../../organizmy/PanelNav/PanelNav";
import { DostawcaPowloki } from "../KontekstPowloki";

/**
 * Szablon powłoki panelu (ramka z makiety 2.0.4) i nagłówek ekranu w tej
 * powłoce: jeden `main` pod `id="tresc"`, jeden link skoku, menu w `nav`
 * „Menu główne” z linią „W przygotowaniu”, grupa „Konto” z wylogowaniem,
 * rok programu tylko wtedy, gdy jest; nagłówek ekranu w powłoce bez
 * „Wstecz”, okruszki tylko z łączami — poza powłoką bez zmian.
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

afterEach(cleanup);

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

  it("rok programu w pasku tylko, gdy jest; bez roku brak napisu i brak komunikatu", () => {
    wyrenderuj({ rokProgramu: "2026/27" });
    expect(screen.getByText("2026/27")).toBeTruthy();
    expect(screen.getByText(/Rok programu/)).toBeTruthy();
    cleanup();

    wyrenderuj({ rokProgramu: null });
    expect(screen.queryByText(/Rok programu/)).toBeNull();
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

describe("PageHeader w powłoce i poza nią", () => {
  const okruszkiListy = [{ etykieta: "Słownik form stażu" }];
  const okruszkiSzczegolu = [
    { etykieta: "Pulpit", href: "/admin" },
    { etykieta: "Profile psychologa", href: "/admin/profile" },
    { etykieta: "Profil 12" },
  ];

  it("poza powłoką: przycisk „Wstecz” i pełne okruszki, także bez łączy (bez zmian)", () => {
    const onPowrot = vi.fn();
    render(<PageHeader okruszki={okruszkiListy} tytul="Słownik form stażu" onPowrot={onPowrot} />);
    fireEvent.click(screen.getByTestId("pageheader-powrot"));
    expect(onPowrot).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("navigation", { name: "Okruszki" }).textContent).toContain("Słownik form stażu");
  });

  it("w powłoce, ekran bez łączy w okruszkach: bez „Wstecz” i bez okruszków, tytuł zostaje", () => {
    render(
      <DostawcaPowloki>
        <PageHeader okruszki={okruszkiListy} tytul="Słownik form stażu" onPowrot={() => {}} />
      </DostawcaPowloki>,
    );
    expect(screen.queryByTestId("pageheader-powrot")).toBeNull();
    expect(screen.queryByRole("button", { name: "Wstecz" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Okruszki" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Słownik form stażu" })).toBeTruthy();
  });

  it.each([
    ["jeden okruszek bez łącza", [{ etykieta: "Po programie" }]],
    ["dwa okruszki bez łącza", [{ etykieta: "Po programie" }, { etykieta: "Dalsza współpraca" }]],
  ])("w powłoce, ekran „Po programie” (%s, z obsługą powrotu): bez „Wstecz”, bez okruszków, bez błędu", (_opis, okruszki) => {
    render(
      <DostawcaPowloki>
        <PageHeader okruszki={okruszki} tytul="Po programie" onPowrot={() => {}} />
      </DostawcaPowloki>,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Okruszki" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Po programie" })).toBeTruthy();
  });

  it("poza powłoką ten sam ekran „Po programie”: „Wstecz” i okruszki jak dotąd", () => {
    render(<PageHeader okruszki={[{ etykieta: "Po programie" }]} tytul="Po programie" onPowrot={() => {}} />);
    expect(screen.getByRole("button", { name: "Wstecz" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Okruszki" }).textContent).toContain("Po programie");
  });

  it("w powłoce, ekran szczegółu: okruszki z łączami i bieżącą pozycją, bez „Wstecz”", () => {
    render(
      <DostawcaPowloki>
        <PageHeader okruszki={okruszkiSzczegolu} tytul="Profil 12" onPowrot={() => {}} />
      </DostawcaPowloki>,
    );
    expect(screen.queryByTestId("pageheader-powrot")).toBeNull();
    const okruszki = screen.getByRole("navigation", { name: "Okruszki" });
    expect(within(okruszki).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/admin", "/admin/profile"]);
    expect(okruszki.textContent).toContain("Profil 12");
  });

  it("w powłoce: pozycje bez łącza w środku śladu odpadają, ostatnia zostaje", () => {
    render(
      <DostawcaPowloki>
        <PageHeader
          okruszki={[{ etykieta: "Pulpit", href: "/admin" }, { etykieta: "Grupa bez adresu" }, { etykieta: "Profil 12" }]}
          tytul="Profil 12"
          onPowrot={() => {}}
        />
      </DostawcaPowloki>,
    );
    const okruszki = screen.getByRole("navigation", { name: "Okruszki" });
    expect(okruszki.textContent).not.toContain("Grupa bez adresu");
    expect(okruszki.textContent).toContain("Profil 12");
  });
});
