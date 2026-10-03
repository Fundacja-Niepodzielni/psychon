// @vitest-environment node

import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { GRUPY, type DefinicjaGrupy, type NazwaPanelu } from "../grupy";

/**
 * Przegląd strażnika ról dla wszystkich włączonych grup przełączenia: każdy
 * ekran włączonej grupy leży w drzewie układów (`layout.tsx`), w którym stoi
 * `RequireRole` z rolami właściwymi dla panelu ekranu. Lista dozwolona, nie lista
 * zakazów: nowa włączona grupa bez strażnika w układzie nie przechodzi.
 *
 * Panel uczestnika nie ma klientowego strażnika ról na poziomie segmentu `/panel`
 * (dostęp mają wszystkie role uczestnika, a zasoby odmawiają po stronie
 * serwera) — `null` w mapie niżej mówi to wprost i jest jedynym wyjątkiem.
 */

const KORZEN_FRONTU = fileURLToPath(new URL("../../../", import.meta.url));
const KATALOG_APP = join(KORZEN_FRONTU, "app");

/** Role wymagane od strażnika w drzewie układów strony ekranu danego panelu. */
export const ROLE_STRAZNIKA_PANELU: Record<NazwaPanelu, readonly string[] | null> = {
  administracja: ["project_manager", "super_admin"],
  prowadzacy: ["instructor"],
  uczestnik: null,
};

function stronyAplikacji(katalog: string): string[] {
  const wynik: string[] = [];
  for (const nazwa of readdirSync(katalog)) {
    if (nazwa === "__tests__" || nazwa === "node_modules") continue;
    const sciezka = join(katalog, nazwa);
    if (statSync(sciezka).isDirectory()) wynik.push(...stronyAplikacji(sciezka));
    else if (nazwa === "page.tsx") wynik.push(sciezka);
  }
  return wynik;
}

/** Adres strony z jej położenia: bez grup tras `(…)`, parametry dynamiczne bez nazwy. */
function adresStrony(plik: string): string {
  const segmenty = relative(KATALOG_APP, dirname(plik))
    .split(sep)
    .filter((segment) => segment !== "" && !/^\(.+\)$/.test(segment))
    .map((segment) => (/^\[[^\]]+\]$/.test(segment) ? "[]" : segment));
  return `/${segmenty.join("/")}`;
}

function wzorzecTrasy(trasa: string): string {
  return trasa
    .split("/")
    .map((segment) => (/^\[[^\]]+\]$/.test(segment) ? "[]" : segment))
    .join("/");
}

const STRONY = stronyAplikacji(KATALOG_APP).map((plik) => ({ plik, adres: adresStrony(plik) }));

/** Zbiory ról wszystkich `RequireRole` w układach nad stroną (od strony do korzenia `app`). */
function zbioryRolStraznikow(plikStrony: string): string[][] {
  const zbiory: string[][] = [];
  let katalog = dirname(plikStrony);
  for (;;) {
    const uklad = join(katalog, "layout.tsx");
    if (existsSync(uklad)) {
      const zrodlo = readFileSync(uklad, "utf8");
      const wpis = /<RequireRole\b[^>]*?allowedRoles=\{\[([^\]]*)\]\}/.exec(zrodlo);
      if (wpis) {
        zbiory.push(
          wpis[1]
            .split(",")
            .map((rola) => rola.trim().replace(/^["']|["']$/g, ""))
            .filter((rola) => rola !== "")
            .sort(),
        );
      }
    }
    if (katalog === KATALOG_APP) break;
    katalog = dirname(katalog);
  }
  return zbiory;
}

/** Opisy ekranów włączonych grup, których strona nie leży pod właściwym strażnikiem ról. */
export function naruszeniaStraznika(grupy: Record<string, DefinicjaGrupy>): string[] {
  const naruszenia: string[] = [];
  for (const grupa of Object.values(grupy)) {
    if (!grupa.wlaczona) continue;
    for (const ekran of grupa.ekrany) {
      const opis = `${grupa.klucz}: ${ekran.nowaTrasa}`;
      const strony = STRONY.filter((strona) => strona.adres === wzorzecTrasy(ekran.nowaTrasa));
      if (strony.length === 0) {
        naruszenia.push(`${opis} — brak pliku strony pod tym adresem`);
        continue;
      }
      const wymagane = ROLE_STRAZNIKA_PANELU[ekran.panel];
      if (wymagane === null) continue;
      const oczekiwane = [...wymagane].sort();
      for (const strona of strony) {
        const zbiory = zbioryRolStraznikow(strona.plik);
        if (!zbiory.some((role) => JSON.stringify(role) === JSON.stringify(oczekiwane))) {
          naruszenia.push(`${opis} — plik ${relative(KORZEN_FRONTU, strona.plik)} nie leży pod RequireRole z rolami ${oczekiwane.join(", ")}`);
        }
      }
    }
  }
  return naruszenia;
}

function grupaProbna(panel: NazwaPanelu, nowaTrasa: string, wlaczona = true): Record<string, DefinicjaGrupy> {
  return {
    probna: {
      klucz: "probna",
      wlaczona,
      ekrany: [{ panel, staraTrasa: nowaTrasa, nowaTrasa, trasaPoligonu: nowaTrasa }],
    },
  };
}

describe("strażnik ról nad ekranami włączonych grup przełączenia", () => {
  it("każdy ekran każdej włączonej grupy leży pod RequireRole z rolami swojego panelu", () => {
    expect(naruszeniaStraznika(GRUPY)).toEqual([]);
  });

  it("rejestr ma wpis w mapie ról dla każdego panelu, w którym stoi ekran", () => {
    const panele = new Set(Object.values(GRUPY).flatMap((grupa) => grupa.ekrany.map((ekran) => ekran.panel)));
    for (const panel of panele) expect(Object.keys(ROLE_STRAZNIKA_PANELU)).toContain(panel);
  });

  it("kontrola dodatnia: ekran administracji w układzie administracji przechodzi", () => {
    expect(naruszeniaStraznika(grupaProbna("administracja", "/admin/emails"))).toEqual([]);
  });

  it("mutant: ekran administracji pod adresem bez strażnika (/nowy-front/pulpit) jest naruszeniem", () => {
    const naruszenia = naruszeniaStraznika(grupaProbna("administracja", "/nowy-front/pulpit"));
    expect(naruszenia).toHaveLength(1);
    expect(naruszenia[0]).toContain("nie leży pod RequireRole");
  });

  it("mutant: ekran prowadzącego w układzie administracji (role inne niż prowadzącego) jest naruszeniem", () => {
    expect(naruszeniaStraznika(grupaProbna("prowadzacy", "/admin/emails"))).toHaveLength(1);
  });

  it("mutant: trasa bez pliku strony jest naruszeniem", () => {
    expect(naruszeniaStraznika(grupaProbna("administracja", "/admin/nie-ma-takiej-trasy"))).toHaveLength(1);
  });

  it("grupa wyłączona nie jest przeglądana", () => {
    expect(naruszeniaStraznika(grupaProbna("administracja", "/nowy-front/pulpit", false))).toEqual([]);
  });
});

describe("strażnik roli dla stron podglądu administracji pod /nowy-front/admin", () => {
  const stronyPodgladu = STRONY.filter((strona) => strona.adres.startsWith("/nowy-front/admin/"));

  it("strony podglądu administracji istnieją w drzewie aplikacji", () => {
    expect(stronyPodgladu.length).toBeGreaterThan(0);
  });

  it("każda z nich leży pod RequireRole z rolami administracji (project_manager, super_admin)", () => {
    const oczekiwane = JSON.stringify([...(ROLE_STRAZNIKA_PANELU.administracja ?? [])].sort());
    const bezStraznika = stronyPodgladu
      .filter((strona) => !zbioryRolStraznikow(strona.plik).some((role) => JSON.stringify(role) === oczekiwane))
      .map((strona) => relative(KORZEN_FRONTU, strona.plik));
    expect(bezStraznika).toEqual([]);
  });
});
