import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PanelNav } from "../PanelNav";

/**
 * Grupy bez flagi zwijania rysują się dokładnie tak jak przed wprowadzeniem
 * grup zwijanych: ten sam DOM (znaczniki, atrybuty, kolejność, klasy modułów).
 */

afterEach(cleanup);

function wyrenderuj() {
  const { container } = render(
    <PanelNav
      uzytkownik={{ imie: "Ola", nazwisko: "Demo", rola: "Opiekun Projektu" }}
      etykieta="Menu — Próba"
      grupy={[
        {
          naglowek: "Codziennie",
          pozycje: [
            { ikona: "home", etykieta: "Pulpit", href: "/a", biezaca: true },
            { ikona: "inbox", etykieta: "Sprawy", href: "/b", biezaca: "sekcja", podstrony: [{ etykieta: "Kolejka", href: "/b/k" }] },
            { ikona: "users", etykieta: "Osoby", href: "/c", licznik: { wartosc: 3, etykieta: "nowe" } },
          ],
        },
        {
          naglowek: "Program",
          pozycje: [{ ikona: "book", etykieta: "Kursy", href: "/d" }],
          liniaWPrzygotowaniu: "prowadzący",
        },
      ]}
      konto={<button type="button">Wyloguj</button>}
    />,
  );
  return container.innerHTML;
}

/** Zapis `container.innerHTML` z drzewa bez grup zwijanych (stan sprzed wprowadzenia flagi `zwijana`). */
const DOM_SPRZED_GRUP_ZWIJANYCH = "<nav aria-label=\"Menu — Próba\" class=\"_panel_9ff38e\"><div class=\"_profil_9ff38e\"><span class=\"_awatar_12a0fa\">OD</span><div class=\"_profilTekst_9ff38e\"><p class=\"_tekst_44c6dd\">Ola Demo</p><p class=\"_tekst_44c6dd\">Opiekun Projektu</p></div></div><div class=\"_grupy_9ff38e\"><div class=\"_grupa_9ff38e\"><div class=\"_grupa_ccb783\"><p class=\"_naglowekGrupy_ccb783\">Codziennie</p><ul class=\"_lista_ccb783\"><li><a href=\"/a\" aria-current=\"page\" class=\"_pozycja_ccb783 _biezaca_ccb783\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-house lucide-home\" aria-hidden=\"true\"><path d=\"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8\"></path><path d=\"M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"></path></svg><p class=\"_tekst_44c6dd\">Pulpit</p></a></li><li><a href=\"/b\" aria-current=\"true\" class=\"_pozycja_ccb783 _biezaca_ccb783\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-inbox\" aria-hidden=\"true\"><polyline points=\"22 12 16 12 14 15 10 15 8 12 2 12\"></polyline><path d=\"M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z\"></path></svg><p class=\"_tekst_44c6dd\">Sprawy</p></a></li><li><a href=\"/c\" class=\"_pozycja_ccb783\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-users\" aria-hidden=\"true\"><path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"></path><path d=\"M16 3.128a4 4 0 0 1 0 7.744\"></path><path d=\"M22 21v-2a4 4 0 0 0-3-3.87\"></path><circle cx=\"9\" cy=\"7\" r=\"4\"></circle></svg><p class=\"_tekst_44c6dd\">Osoby</p><span><span class=\"_liczba_05a998\">3</span><span class=\"_etykieta_05a998\">nowe</span></span></a></li></ul></div></div><div class=\"_grupa_9ff38e\"><div class=\"_grupa_ccb783\"><p class=\"_naglowekGrupy_ccb783\">Program</p><ul class=\"_lista_ccb783\"><li><a href=\"/d\" class=\"_pozycja_ccb783\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-book-open\" aria-hidden=\"true\"><path d=\"M12 5v16\"></path><path d=\"M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z\"></path></svg><p class=\"_tekst_44c6dd\">Kursy</p></a></li></ul></div><p class=\"_wPrzygotowaniu_9ff38e\">W przygotowaniu: prowadzący.</p></div><button type=\"button\">Wyloguj</button></div></nav>";

describe("PanelNav — grupy bez flagi zwijania", () => {
  it("DOM zgodny z zapisem sprzed grup zwijanych, bez zwijania w drzewie", () => {
    const html = wyrenderuj();
    expect(html).toBe(DOM_SPRZED_GRUP_ZWIJANYCH);
    expect(html).not.toContain("aria-expanded");
    expect(html).not.toContain(` hidden=""`);
  });
});
