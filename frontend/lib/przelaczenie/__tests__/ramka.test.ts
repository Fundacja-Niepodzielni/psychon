import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GRUPY, type DefinicjaGrupy, type KluczGrupy } from "@/lib/przelaczenie/grupy";
import { czyTrasaWNowejRamce, pasujeDoWzorca } from "@/lib/przelaczenie/ramka";

/**
 * Wybór ramki dla stron starej grupy tras administracji: nowa ramka tylko
 * dla strony, która przy włączonej grupie zamienia treść pod tym samym
 * adresem. Ścieżki do sprawdzenia pochodzą z drzewa `app/(administracja)/admin`
 * (każdy `page.tsx`, `[param]` zamienione na liczbę) — nowa strona w drzewie
 * trafia do testu sama.
 */

const KORZEN = path.join(process.cwd(), "app", "(administracja)");

function sciezkiStron(katalog: string): string[] {
  return readdirSync(katalog).flatMap((nazwa) => {
    const pelna = path.join(katalog, nazwa);
    if (statSync(pelna).isDirectory()) return nazwa === "__tests__" ? [] : sciezkiStron(pelna);
    if (nazwa !== "page.tsx") return [];
    const wzgledna = path.relative(KORZEN, path.dirname(pelna)).split(path.sep).join("/");
    return [`/${wzgledna}`.replace(/\[[^\]]+\]/g, "12")];
  });
}

const STRONY_ADMIN = sciezkiStron(path.join(KORZEN, "admin"));

function zFlagami(flagi: Partial<Record<KluczGrupy, boolean>>): Record<string, DefinicjaGrupy> {
  return Object.fromEntries(
    Object.entries(GRUPY).map(([klucz, grupa]) => [klucz, { ...grupa, wlaczona: flagi[klucz as KluczGrupy] ?? false }]),
  );
}

const WSZYSTKIE_WYLACZONE = zFlagami({});

describe("czyTrasaWNowejRamce — wszystkie grupy wyłączone", () => {
  it("drzewo stron administracji jest niepuste i obejmuje strony A.2", () => {
    expect(STRONY_ADMIN.length).toBeGreaterThanOrEqual(15);
    expect(STRONY_ADMIN).toEqual(
      expect.arrayContaining(["/admin", "/admin/profile/12", "/admin/staz", "/admin/wzory-dokumentow", "/admin/ekran-startowy", "/admin/uczestniczki"]),
    );
  });

  it("żadna ścieżka /admin/** nie dostaje nowej ramki", () => {
    for (const sciezka of STRONY_ADMIN) {
      expect(czyTrasaWNowejRamce(sciezka, "administracja", WSZYSTKIE_WYLACZONE), sciezka).toBe(false);
    }
  });

  it("kontrola dodatnia: włączona grupa pulpitu daje nową ramkę dokładnie dla /admin", () => {
    const grupy = zFlagami({ pulpitAdministracji: true });
    const wNowej = STRONY_ADMIN.filter((s) => czyTrasaWNowejRamce(s, "administracja", grupy));
    expect(wNowej).toEqual(["/admin"]);
  });
});

describe("czyTrasaWNowejRamce — stan rejestru na dziś", () => {
  it("nową ramkę dostają dokładnie strony włączonych grup administracji", () => {
    const wNowej = STRONY_ADMIN.filter((s) => czyTrasaWNowejRamce(s, "administracja")).sort();
    const oczekiwane = [
      GRUPY.pulpitAdministracji.wlaczona && "/admin",
      GRUPY.decyzjaProfilu.wlaczona && "/admin/profile/12",
      GRUPY.wzoryDokumentow.wlaczona && "/admin/wzory-dokumentow",
      GRUPY.ekranStartowy.wlaczona && "/admin/ekran-startowy",
      GRUPY.sprawy.wlaczona && "/admin/sprawy",
      GRUPY.kolejkaStazu.wlaczona && "/admin/staz",
      GRUPY.listaOsob.wlaczona && "/admin/uczestniczki",
      GRUPY.kartaOsoby.wlaczona && "/admin/uczestniczki/12",
      GRUPY.kursyAdministracji.wlaczona && "/admin/kursy",
      GRUPY.kursAdministracji.wlaczona && "/admin/kursy/12",
      GRUPY.powiadomienia.wlaczona && "/admin/emails",
    ].filter((s): s is string => typeof s === "string");
    expect(wNowej).toEqual(oczekiwane.sort());
  });

  it("adres pasujący do dwóch wzorców należy do dokładniejszego: /admin/uczestniczki/nowa nie wpada w ramkę karty osoby", () => {
    const grupy = zFlagami({ kartaOsoby: true });
    expect(czyTrasaWNowejRamce("/admin/uczestniczki/12", "administracja", grupy)).toBe(true);
    expect(czyTrasaWNowejRamce("/admin/uczestniczki/nowa", "administracja", grupy)).toBe(false);
  });

  it("włączone konto zakładane ręcznie bierze własny adres, a karta osoby pozostałe", () => {
    const grupy = zFlagami({ noweKonto: true });
    expect(czyTrasaWNowejRamce("/admin/uczestniczki/nowa", "administracja", grupy)).toBe(true);
    expect(czyTrasaWNowejRamce("/admin/uczestniczki/12", "administracja", grupy)).toBe(false);
  });

  it("nowe trasy z innym adresem niż stara (grupa tras przełączenia) nie są tu rozpoznawane", () => {
    expect(czyTrasaWNowejRamce("/admin/formy-stazu", "administracja")).toBe(false);
    expect(czyTrasaWNowejRamce("/admin/zgloszenia-wspolpracy", "administracja")).toBe(false);
  });

  it("inny panel tej samej ścieżki nie dostaje ramki administracji", () => {
    expect(czyTrasaWNowejRamce("/panel/pulpit", "administracja")).toBe(false);
  });
});

describe("pasujeDoWzorca", () => {
  it("parametr pasuje do jednego niepustego segmentu, ukośnik i zapytanie na końcu nie mają znaczenia", () => {
    expect(pasujeDoWzorca("/admin/profile/12", "/admin/profile/[id]")).toBe(true);
    expect(pasujeDoWzorca("/admin/profile/12/", "/admin/profile/[id]")).toBe(true);
    expect(pasujeDoWzorca("/admin/profile/12?x=1", "/admin/profile/[id]")).toBe(true);
    expect(pasujeDoWzorca("/admin/profile", "/admin/profile/[id]")).toBe(false);
    expect(pasujeDoWzorca("/admin/profile/12/pliki", "/admin/profile/[id]")).toBe(false);
    expect(pasujeDoWzorca("/admin", "/admin")).toBe(true);
    expect(pasujeDoWzorca("/admin/", "/admin")).toBe(true);
    expect(pasujeDoWzorca("/administracja", "/admin")).toBe(false);
  });
});
