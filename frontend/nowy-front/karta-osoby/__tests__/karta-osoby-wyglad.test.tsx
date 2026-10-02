import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { kartaPrzykladowa } from "./karta-fixtura";

/**
 * Wygląd i brzmienie karty osoby: zdania pisane po ludzku (bez nazw wewnętrznych
 * części systemu), jedna nazwa dziennika zgodna z menu, czytelne liczby i
 * rozmieszczenie sekcji. Treści i żądania do serwera pozostają bez zmian —
 * tu sprawdzamy wyłącznie to, co widzi osoba przy ekranie.
 */

const pobierzKarteOsoby = vi.fn();
const pobierzRzetelnoscOsoby = vi.fn();
const pobierzRoleZalogowanej = vi.fn();
const fetchAdminUsers = vi.fn();
const blockAdminUser = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("../dane", async () => {
  const rzeczywiste = await vi.importActual<typeof import("../dane")>("../dane");
  return {
    ...rzeczywiste,
    pobierzKarteOsoby: (...args: unknown[]) => pobierzKarteOsoby(...args),
    pobierzRzetelnoscOsoby: (...args: unknown[]) => pobierzRzetelnoscOsoby(...args),
    pobierzRoleZalogowanej: (...args: unknown[]) => pobierzRoleZalogowanej(...args),
  };
});

vi.mock("@/lib/api/h18", async () => {
  const rzeczywiste = await vi.importActual<typeof import("@/lib/api/h18")>("@/lib/api/h18");
  return {
    ...rzeczywiste,
    fetchAdminUsers: (...args: unknown[]) => fetchAdminUsers(...args),
    blockAdminUser: (...args: unknown[]) => blockAdminUser(...args),
  };
});

const { KartaOsoby } = await import("../KartaOsoby");

beforeEach(() => {
  pobierzKarteOsoby.mockReset().mockResolvedValue(kartaPrzykladowa());
  pobierzRzetelnoscOsoby.mockReset().mockResolvedValue({ reliability_percent: "73", below_threshold: false });
  pobierzRoleZalogowanej.mockReset().mockResolvedValue("project_manager");
  fetchAdminUsers.mockReset().mockResolvedValue({ data: [] });
  blockAdminUser.mockReset();
});

async function otworzKarte() {
  render(<KartaOsoby id={17} />);
  await screen.findByRole("heading", { name: "Blokada konta" });
}

function odczytajArkusz(): string {
  return readFileSync(resolve(__dirname, "../KartaOsoby.module.css"), "utf8");
}

/** Treść bloku `@media (max-width: 639px) { … }` — z zagnieżdżonymi nawiasami klamrowymi. */
function blokWaskiegoEkranu(arkusz: string): string {
  const poczatek = arkusz.indexOf("@media (max-width: 639px)");
  if (poczatek < 0) throw new Error("brak bloku @media (max-width: 639px)");
  const otwarcie = arkusz.indexOf("{", poczatek);
  let glebokosc = 0;
  for (let i = otwarcie; i < arkusz.length; i += 1) {
    if (arkusz[i] === "{") glebokosc += 1;
    if (arkusz[i] === "}") glebokosc -= 1;
    if (glebokosc === 0) return arkusz.slice(otwarcie + 1, i);
  }
  throw new Error("niedomknięty blok @media");
}

describe("Karta osoby — zdanie pod liczbami", () => {
  it("mówi, że te same liczby widzi osoba na pulpicie i w raporcie, bez nazwy wewnętrznego składnika", async () => {
    await otworzKarte();

    expect(screen.getByText("Te same liczby widzi osoba na swoim pulpicie i w raporcie.")).toBeInTheDocument();
    expect(screen.queryByText(/ProgressAggregator/)).toBeNull();
  });
});

describe("Karta osoby — zdanie o prowadzącym superwizje", () => {
  it("mówi zwykłym językiem, że poprzednie przypisanie kończy się samo", async () => {
    await otworzKarte();

    expect(
      screen.getByText("Wskazana osoba przejmuje superwizję tej osoby — poprzednie przypisanie kończy się samo."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/serwer zamyka/)).toBeNull();
  });
});

describe("Karta osoby — nazwa dziennika", () => {
  it("podpowiedzi przy powodzie resetu i blokady nazywają dziennik tak jak menu: Dziennik działań", async () => {
    await otworzKarte();

    expect(screen.getByText("Trafia do Dziennika działań.")).toBeInTheDocument();
    expect(screen.getByText(/^Powód trafia do Dziennika działań\. Zablokowana osoba przy logowaniu/)).toBeInTheDocument();
    expect(
      screen.getByText(/nowe podejście zaczyna numerację od 1\. Powód trafia do Dziennika działań\.$/),
    ).toBeInTheDocument();
  });

  it("na całym ekranie nie ma słowa „audytu” ani „audyt”", async () => {
    await otworzKarte();

    expect(document.body.textContent ?? "").not.toMatch(/audyt/i);
  });
});

describe("Karta osoby — dane osoby na wąskim ekranie (390 px)", () => {
  it("tabela danych stoi w obudowie, a każdy wiersz ma nazwę pola i wartość jako dwie komórki", async () => {
    await otworzKarte();

    const tabela = screen.getByRole("table", { name: "Dane osoby" });
    const obudowa = tabela.closest('[class*="daneOsoby"]');
    expect(obudowa).not.toBeNull();

    const wiersze = within(tabela).getAllByRole("row").filter((w) => within(w).queryAllByRole("cell").length > 0);
    expect(wiersze.length).toBeGreaterThan(0);
    const pierwszy = within(wiersze[0]).getAllByRole("cell");
    expect(pierwszy.map((k) => k.textContent)).toEqual(["Imię i nazwisko", "Marta Demo"]);
  });

  it("na komputerze nagłówek „Pole / Wartość” zostaje w tabeli", async () => {
    await otworzKarte();

    const tabela = screen.getByRole("table", { name: "Dane osoby" });
    expect(within(tabela).getByRole("columnheader", { name: "Pole" })).toBeInTheDocument();
    expect(within(tabela).getByRole("columnheader", { name: "Wartość" })).toBeInTheDocument();
  });

  it("poniżej 640 px zdejmuje powtarzane słowa „Pole” i „Wartość”, wyrównuje do lewej i robi z nazwy pola małą etykietę nad wartością", () => {
    const wasko = blokWaskiegoEkranu(odczytajArkusz());

    expect(wasko).toMatch(/\.daneOsoby \[role="row"\] \[role="cell"\]::before\s*\{[^}]*content:\s*none/);
    expect(wasko).toMatch(/\.daneOsoby \[role="row"\] \[role="cell"\]\s*\{[^}]*display:\s*block[^}]*text-align:\s*left/);
    expect(wasko).toMatch(/\.daneOsoby \[role="row"\]\s*\{[^}]*align-items:\s*stretch[^}]*text-align:\s*left/);
    expect(wasko).toMatch(/\[role="cell"\]:first-child\s*\{[^}]*color:\s*var\(--muted\)[^}]*font-size:\s*var\(--fs-10\)/);
  });

  it("układ wąski nie rusza tabeli na komputerze: reguły obudowy są tylko w bloku poniżej 640 px", () => {
    const arkusz = odczytajArkusz();
    const wasko = blokWaskiegoEkranu(arkusz);

    expect(arkusz.replace(wasko, "")).not.toMatch(/\.daneOsoby/);
  });
});

describe("Karta osoby — kafle z paskiem postępu", () => {
  function kafel(etykieta: string): HTMLElement {
    const znalezione = screen.getByText(etykieta).closest('[role="listitem"]');
    if (!(znalezione instanceof HTMLElement)) throw new Error(`brak kafla ${etykieta}`);
    return znalezione;
  }

  it("kafle Kursy i Rzetelność nauki mają układ pulpitu, kafle bez paska go nie mają", async () => {
    await otworzKarte();

    expect(kafel("Kursy")).toHaveAttribute("data-uklad", "pulpit");
    expect(kafel("Rzetelność nauki")).toHaveAttribute("data-uklad", "pulpit");
    for (const etykieta of ["Godziny stażu", "Obecności na superwizjach", "Warsztat stacjonarny"]) {
      expect(kafel(etykieta)).not.toHaveAttribute("data-uklad");
    }
  });

  it("liczba stoi raz: „z 10” i „%” zostają przy liczbie, a pasek niesie je tylko jako nazwę dostępną", async () => {
    await otworzKarte();

    expect(within(kafel("Kursy")).getByRole("progressbar", { name: "z 10" })).toBeInTheDocument();
    expect(within(kafel("Rzetelność nauki")).getByRole("progressbar", { name: "%" })).toBeInTheDocument();
    expect(kafel("Kursy").querySelector("#filar-kursy")).toHaveTextContent("1z 10");
    expect(kafel("Rzetelność nauki").querySelector("#filar-rzetelnosc")).toHaveTextContent("73%");
  });

  it("drugi napis obok paska to dokładnie ten, który reguła układu pulpitu chowa: po jednym na kafel", async () => {
    await otworzKarte();

    const poPasku = [...document.querySelectorAll('[data-uklad="pulpit"] [role="progressbar"] + span')];
    expect(poPasku.map((napis) => napis.textContent)).toEqual(["z 10", "%"]);

    const arkusz = readFileSync(
      resolve(__dirname, "../../../design-system/organizmy/StatRow/StatRow.module.css"),
      "utf8",
    );
    expect(arkusz).toMatch(/\[data-uklad="pulpit"\] \[role="progressbar"\] \+ span\s*\{[^}]*display:\s*none/);
  });
});

const NAZWY_KART_CZYNNOSCI = ["Prowadzący superwizje", "Rola konta", "Reset limitu podejść", "Blokada konta"];

function przyciskiKolorowe(korzen: ParentNode): HTMLButtonElement[] {
  return Array.from(korzen.querySelectorAll("button")).filter((b) =>
    b.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)),
  );
}

describe("Karta osoby — czynności administracji w osobnych kartach", () => {
  it("każda z czterech czynności to osobna biała karta z własnym nagłówkiem, w stałej kolejności", async () => {
    await otworzKarte();

    const karty = NAZWY_KART_CZYNNOSCI.map((nazwa) => screen.getByRole("region", { name: nazwa }));
    for (const karta of karty) {
      expect(karta).toHaveAttribute("data-karta", "stala");
      expect(karta.className).toMatch(/karta/);
    }
    for (let i = 1; i < karty.length; i += 1) {
      expect(karty[i - 1].compareDocumentPosition(karty[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(karty[i - 1].contains(karty[i])).toBe(false);
    }
  });

  it("karty stoją w jednym bloku czynności, a przycisk każdej czynności jest w jej własnej karcie", async () => {
    await otworzKarte();

    const blok = document.querySelector('[data-obszar="czynnosci-administracji"]');
    expect(blok).not.toBeNull();
    const przyciski: Record<string, string> = {
      "Prowadzący superwizje": "Nadaj prowadzącego",
      "Rola konta": "Zapisz rolę",
      "Reset limitu podejść": "Zresetuj limit podejść",
      "Blokada konta": "Zablokuj konto",
    };
    for (const [nazwa, przycisk] of Object.entries(przyciski)) {
      const karta = screen.getByRole("region", { name: nazwa });
      expect(blok).toContainElement(karta);
      expect(within(karta).getByRole("button", { name: przycisk })).toBeInTheDocument();
    }
  });

  it("blokada konta jest ostatnia i jako jedyna ma wygląd działania niebezpiecznego: czerwony nagłówek karty i przycisk", async () => {
    await otworzKarte();

    const blokada = screen.getByRole("region", { name: "Blokada konta" });
    expect(blokada.className).toMatch(/niebezpieczna/);
    expect(within(blokada).getByRole("button", { name: "Zablokuj konto" }).className).toMatch(/niebezpieczny/);

    for (const nazwa of NAZWY_KART_CZYNNOSCI.slice(0, 3)) {
      const karta = screen.getByRole("region", { name: nazwa });
      expect(karta.className).not.toMatch(/niebezpieczna/);
      for (const przycisk of within(karta).getAllByRole("button")) {
        expect(przycisk.className).not.toMatch(/niebezpieczny/);
      }
    }

    const wszystkieKarty = Array.from(
      document.querySelectorAll('[data-obszar="czynnosci-administracji"] > section'),
    );
    expect(wszystkieKarty[wszystkieKarty.length - 1]).toBe(blokada);
  });

  it("na ekranie jest dokładnie jeden przycisk kolorowy — „Zmień dane”; przyciski czynności mają sam obrys", async () => {
    await otworzKarte();

    const kolorowe = przyciskiKolorowe(document.body);
    expect(kolorowe.map((b) => b.textContent)).toEqual(["Zmień dane"]);

    for (const nazwa of NAZWY_KART_CZYNNOSCI) {
      const karta = screen.getByRole("region", { name: nazwa });
      for (const przycisk of within(karta).getAllByRole("button")) {
        expect(przycisk.className).toMatch(/(^|_)outline(_|$)/);
      }
    }
  });

  it("karty czynności mają ten sam odstęp co kolumna boczna układu edycji, a treść karty — odstęp jak karty ekranu kursu", () => {
    const arkusz = odczytajArkusz();

    expect(arkusz).toMatch(/\.czynnosci\s*\{[^}]*gap:\s*var\(--space-20\)/);
    expect(arkusz).toMatch(/\.czynnosc\s*\{[^}]*gap:\s*var\(--space-12\)[^}]*min-width:\s*0/);
  });
});

describe("Karta osoby — nieaktywny przycisk mówi, dlaczego", () => {
  const PROWADZACY = { id: 5, first_name: "Joanna", last_name: "Prowadząca", email: "joanna@demo.pl", role: "instructor" };

  function przycisk(nazwa: string): HTMLElement {
    return screen.getByRole("button", { name: nazwa });
  }

  it("na początku cztery przyciski czynności są nieaktywne, a pod każdym stoi widoczne zdanie z powodem, wskazane jako jego opis", async () => {
    await otworzKarte();

    const oczekiwane: Record<string, string> = {
      "Nadaj prowadzącego": "Wybierz osobę z listy, żeby nadać prowadzącego.",
      "Zapisz rolę": "Wybierz inną rolę niż obecna, żeby ją zapisać.",
      "Zresetuj limit podejść": "Podaj identyfikator testu i wpisz powód, żeby zresetować limit.",
      "Zablokuj konto": "Wpisz powód blokady, żeby zablokować konto.",
    };
    for (const [nazwa, powod] of Object.entries(oczekiwane)) {
      expect(przycisk(nazwa)).toBeDisabled();
      expect(przycisk(nazwa)).toHaveAccessibleDescription(powod);
      expect(screen.getByText(powod)).toBeVisible();
    }
  });

  it("blokada: same spacje nie wystarczają, a po wpisaniu powodu zdanie znika i przycisk działa", async () => {
    await otworzKarte();

    await userEvent.type(screen.getByLabelText(/Powód blokady/), "   ");
    expect(przycisk("Zablokuj konto")).toBeDisabled();
    expect(screen.getByText("Wpisz powód blokady, żeby zablokować konto.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/Powód blokady/), "Konto używane przez inną osobę");
    expect(przycisk("Zablokuj konto")).toBeEnabled();
    expect(przycisk("Zablokuj konto")).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByText("Wpisz powód blokady, żeby zablokować konto.")).toBeNull();
  });

  it("reset: zdanie mówi, którego pola brakuje, i znika dopiero, gdy oba są wypełnione", async () => {
    await otworzKarte();

    await userEvent.type(screen.getByLabelText(/Powód resetu/), "Awaria platformy podczas testu");
    expect(przycisk("Zresetuj limit podejść")).toHaveAccessibleDescription("Podaj identyfikator testu, żeby zresetować limit.");

    await userEvent.clear(screen.getByLabelText(/Powód resetu/));
    await userEvent.type(screen.getByLabelText(/Identyfikator testu/), "4");
    expect(przycisk("Zresetuj limit podejść")).toHaveAccessibleDescription("Wpisz powód, żeby zresetować limit.");

    await userEvent.type(screen.getByLabelText(/Powód resetu/), "Awaria platformy podczas testu");
    expect(przycisk("Zresetuj limit podejść")).toBeEnabled();
    expect(przycisk("Zresetuj limit podejść")).not.toHaveAttribute("aria-describedby");
  });

  it("rola: po wyborze innej roli zdanie znika, po powrocie do obecnej wraca", async () => {
    await otworzKarte();

    await userEvent.click(screen.getByRole("combobox", { name: /^Rola/ }));
    await userEvent.click(screen.getByRole("option", { name: "Student" }));
    expect(przycisk("Zapisz rolę")).toBeEnabled();
    expect(screen.queryByText("Wybierz inną rolę niż obecna, żeby ją zapisać.")).toBeNull();

    await userEvent.click(screen.getByRole("combobox", { name: /^Rola/ }));
    await userEvent.click(screen.getByRole("option", { name: "Wolontariusz" }));
    expect(przycisk("Zapisz rolę")).toHaveAccessibleDescription("Wybierz inną rolę niż obecna, żeby ją zapisać.");
  });

  it("prowadzący: po wskazaniu osoby zdanie znika i przycisk działa", async () => {
    fetchAdminUsers.mockResolvedValue({ data: [PROWADZACY] });
    await otworzKarte();

    await userEvent.click(await screen.findByRole("combobox", { name: /^Prowadzący/ }));
    await userEvent.click(await screen.findByRole("option", { name: /Joanna Prowadząca/ }));

    expect(przycisk("Nadaj prowadzącego")).toBeEnabled();
    expect(screen.queryByText("Wybierz osobę z listy, żeby nadać prowadzącego.")).toBeNull();
  });

  it("w trakcie zapisu przycisk jest nieaktywny i mówi „Trwa zapisywanie.”", async () => {
    let zakoncz: (wartosc: unknown) => void = () => undefined;
    blockAdminUser.mockReturnValue(new Promise((resolve) => (zakoncz = resolve)));
    await otworzKarte();
    await userEvent.type(screen.getByLabelText(/Powód blokady/), "Konto używane przez inną osobę");

    await userEvent.click(przycisk("Zablokuj konto"));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Zablokuj konto" }));

    await waitFor(() => expect(przycisk("Zablokuj konto")).toBeDisabled());
    expect(przycisk("Zablokuj konto")).toHaveAccessibleDescription("Trwa zapisywanie.");
    expect(blockAdminUser).toHaveBeenCalledTimes(1);

    zakoncz({});
    await waitFor(() => expect(przycisk("Zablokuj konto")).toHaveAccessibleDescription("Wpisz powód blokady, żeby zablokować konto."));
  });
});

describe("Karta osoby — pola dotykowe i brak przewijania w poziomie na 390 px", () => {
  function arkuszDesignSystemu(sciezka: string): string {
    return readFileSync(resolve(__dirname, "../../../design-system", sciezka), "utf8");
  }

  it("przycisk ma co najmniej 44 px wysokości: min-height z tokenu pola dotykowego, a token to 44 px", () => {
    expect(arkuszDesignSystemu("atomy/Button/Button.module.css")).toMatch(/\.przycisk\s*\{[^}]*min-height:\s*var\(--hit-min\)/);
    expect(arkuszDesignSystemu("tokeny/tokeny.css")).toMatch(/--hit-min:\s*44px/);
  });

  it("wiersze danych na telefonie mają co najmniej 44 px, a przełączniki sekcji zwijanych i kart — więcej niż pole dotykowe", () => {
    expect(arkuszDesignSystemu("organizmy/DataTable/DataTable.module.css")).toMatch(/\.wiersz\s*\{[^}]*min-height:\s*var\(--hit-min\)/);
    expect(arkuszDesignSystemu("szablony/UkladEdycji/KartaBoczna.module.css")).toMatch(
      /\.przelacznik\s*\{[^}]*min-height:\s*calc\(var\(--hit-min\) \+ var\(--space-8\)\)/,
    );
  });

  it("przycisk i zdanie z powodem stoją jedno pod drugim i mogą się zwężać, więc nie wypychają karty poza ekran", () => {
    expect(odczytajArkusz()).toMatch(
      /\.przyciskCzynnosci\s*\{[^}]*flex-direction:\s*column[^}]*align-items:\s*flex-start[^}]*min-width:\s*0/,
    );
  });
});
