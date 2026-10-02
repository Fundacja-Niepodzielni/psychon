import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
  };
});

const { KartaOsoby } = await import("../KartaOsoby");

beforeEach(() => {
  pobierzKarteOsoby.mockReset().mockResolvedValue(kartaPrzykladowa());
  pobierzRzetelnoscOsoby.mockReset().mockResolvedValue({ reliability_percent: "73", below_threshold: false });
  pobierzRoleZalogowanej.mockReset().mockResolvedValue("project_manager");
  fetchAdminUsers.mockReset().mockResolvedValue({ data: [] });
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
