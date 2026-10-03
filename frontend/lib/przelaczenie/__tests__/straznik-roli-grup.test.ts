// @vitest-environment node

import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ROLE_UCZESTNIKA } from "@/nowy-front/wspolne/straznik-uczestnika/straznik-uczestnika";
import { GRUPY, type DefinicjaGrupy, type NazwaPanelu } from "../grupy";

/**
 * Przegląd strażnika ról dla wszystkich włączonych grup przełączenia: każdy
 * ekran włączonej grupy leży w drzewie układów (`layout.tsx`), w którym stoi
 * strażnik (`RequireRole` albo `StraznikUczestnika`) z rolami właściwymi dla
 * panelu ekranu. Lista dozwolona, nie lista zakazów: nowa włączona grupa bez
 * strażnika w układzie nie przechodzi.
 *
 * Panel uczestnika ma `StraznikUczestnika` w układzie każdego segmentu pod
 * `/panel` (grupy `(uczestnik)` i `(przelaczenie)`), nie w układzie całego
 * `/panel`: odpowiedzi serwera segmentu (404, przekierowanie) zapadają w jego
 * układzie przed strażnikiem. Jego role przegląd czyta z modułu strażnika
 * (`ROLE_UCZESTNIKA`), a mapa niżej wpisuje oczekiwane role wprost — zmiana ról
 * strażnika nie przechodzi bez zmiany mapy. Trzeci przegląd (na końcu pliku)
 * obejmuje każdą stronę pod `/panel`, także spoza rejestru przełączenia.
 * Jedynym wyjątkiem są strony publiczne (`publiczny`: logowanie, konto, publiczny
 * certyfikat, dokumenty) — `null` w mapie niżej, z definicji bez strażnika ról,
 * bo otwiera je także osoba niezalogowana.
 *
 * Drugi przegląd obejmuje każdą stronę pod `/nowy-front` (podgląd administracji
 * i pozostałe): strona leży pod strażnikiem, którego role są równe rolom
 * strażnika jej trasy produktu (nowej trasy ekranu w rejestrze), czytanym z
 * drzewa układów strony produktu. Strona bez strażnika przechodzi tylko wtedy,
 * gdy stoi z powodem na liście podglądów bez strażnika, a jej trasa produktu
 * też strażnika nie ma — albo gdy jest stroną podglądu grupy publicznej (każdy
 * ekran rejestru, który ją wskazuje, stoi w panelu `publiczny`), bo jej trasa
 * produktu jest publiczna z definicji.
 */

const KORZEN_FRONTU = fileURLToPath(new URL("../../../", import.meta.url));
const KATALOG_APP = join(KORZEN_FRONTU, "app");

/** Role wymagane od strażnika w drzewie układów strony ekranu danego panelu. */
export const ROLE_STRAZNIKA_PANELU: Record<NazwaPanelu, readonly string[] | null> = {
  administracja: ["project_manager", "super_admin"],
  prowadzacy: ["instructor"],
  uczestnik: ["student", "volunteer"],
  publiczny: null,
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

/** Role `StraznikUczestnika` z modułu strażnika (posortowane). */
const ROLE_STRAZNIKA_UCZESTNIKA: string[] = [...ROLE_UCZESTNIKA].sort();

/**
 * Zbiory ról wszystkich strażników w układach nad stroną (od strony do korzenia `app`):
 * `RequireRole` z rolami z `allowedRoles` i `StraznikUczestnika` z rolami uczestnika.
 */
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
      if (/<StraznikUczestnika\b/.test(zrodlo)) zbiory.push(ROLE_STRAZNIKA_UCZESTNIKA);
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

  it("kontrola dodatnia: ekran uczestnika w segmentach /panel obu grup i pod układem z węższą rolą przechodzi", () => {
    expect(naruszeniaStraznika(grupaProbna("uczestnik", "/panel/pulpit"))).toEqual([]);
    expect(naruszeniaStraznika(grupaProbna("uczestnik", "/panel/dalsza-wspolpraca"))).toEqual([]);
    expect(naruszeniaStraznika(grupaProbna("uczestnik", "/panel/staz"))).toEqual([]);
  });

  it("mutant: ekran uczestnika w układzie administracji (role inne niż uczestnika) jest naruszeniem", () => {
    const naruszenia = naruszeniaStraznika(grupaProbna("uczestnik", "/admin/emails"));
    expect(naruszenia).toHaveLength(1);
    expect(naruszenia[0]).toContain("student, volunteer");
  });

  it("role StraznikUczestnika z modułu strażnika są równe rolom panelu uczestnika w mapie", () => {
    expect(ROLE_STRAZNIKA_UCZESTNIKA).toEqual([...(ROLE_STRAZNIKA_PANELU.uczestnik ?? [])].sort());
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

/** Prefiks adresów stron podglądu nowego frontu. */
const PREFIKS_PODGLADU = "/nowy-front/";

/** Panele, których trasy produktu są publiczne z definicji (otwiera je także osoba niezalogowana). */
const PANELE_PUBLICZNE: readonly NazwaPanelu[] = ["publiczny"];

/**
 * Strony podglądu, których trasa produktu nie ma strażnika ról w drzewie układów: ekran trasy
 * produktu otwiera każda zalogowana rola, a dane zwraca serwer według roli. Strona podglądu stoi
 * wtedy bez strażnika, tak samo jak jej trasa produktu. Klucz: adres strony podglądu, wartość:
 * powód. Przegląd sprawdza w obie strony — strona z listy istnieje i jej trasa produktu dalej nie ma
 * strażnika; gdy trasa produktu dostanie strażnika, pozycja przestaje przechodzić, a strona
 * podglądu ma dostać strażnika z tymi samymi rolami.
 *
 * Lista jest pusta: każda strona podglądu poza stronami grup publicznych ma trasę produktu ze
 * strażnikiem (ekrany uczestnika — `StraznikUczestnika` w układach segmentów `/panel`), więc każda
 * stoi pod strażnikiem z tymi samymi rolami. Strony podglądu grup publicznych przechodzą bez listy
 * (wyjątek w przeglądzie niżej).
 */
export const PODGLADY_BEZ_STRAZNIKA: Record<string, string> = {};

/** Strony podglądu ekranów uczestnika, które leżą pod `StraznikUczestnika` tak jak ich trasy produktu. */
const PODGLADY_EKRANOW_UCZESTNIKA = [
  "/nowy-front/pulpit",
  "/nowy-front/dokumenty",
  "/nowy-front/lekcja/[id]",
  "/nowy-front/kurs-uczestnika/[slug]",
  "/nowy-front/kurs-uczestnika/[slug]/test",
  "/nowy-front/po-programie",
  "/nowy-front/publiczne/panel/start",
];

/**
 * Strony pod `/nowy-front`, których nie ma w rejestrze przełączenia: adres trasy produktu, której
 * role ma mieć strażnik nad stroną, i powód, dla którego strona stoi poza rejestrem.
 */
export const PODGLADY_POZA_REJESTREM: Record<string, { trasaProduktu: string; powod: string }> = {
  "/nowy-front/admin/uczestniczki/[id]/przedluzenie": {
    trasaProduktu: "/admin/uczestniczki/[id]",
    powod: "dawny adres osobnego ekranu przedłużenia dostępu tylko przekierowuje na podgląd karty osoby",
  },
};

/** Role, które przepuszczają wszystkie strażniki nad stroną naraz (część wspólna), albo `null`, gdy strażnika nie ma. */
function roleDopuszczone(plikStrony: string): string[] | null {
  const zbiory = zbioryRolStraznikow(plikStrony);
  if (zbiory.length === 0) return null;
  return zbiory.reduce((wspolne, role) => wspolne.filter((rola) => role.includes(rola))).sort();
}

function opisRol(role: string[] | null): string {
  return role === null ? "bez strażnika" : role.join(", ");
}

function naLiscie(lista: Record<string, unknown>, adres: string): boolean {
  return Object.keys(lista).some((wpis) => wzorzecTrasy(wpis) === adres);
}

/**
 * Opisy stron pod `/nowy-front` (podgląd administracji i pozostałe), które nie leżą pod strażnikiem
 * z rolami swojej trasy produktu. Trasa produktu strony to nowa trasa każdego ekranu rejestru, który
 * wskazuje tę stronę (albo wpis listy stron spoza rejestru); jej role to role strażników w drzewie
 * układów strony produktu pod tym adresem. Strona bez strażnika przechodzi tylko z listy podglądów
 * bez strażnika, i tylko wtedy, gdy jej trasa produktu też strażnika nie ma. Wyjątek bez listy:
 * strona podglądu grupy publicznej (każdy ekran rejestru, który ją wskazuje, stoi w panelu
 * publicznym, a listy stron spoza rejestru jej nie wskazują) stoi bez strażnika, tak jak jej
 * publiczna trasa produktu; pod strażnikiem, na liście albo przy trasie produktu ze strażnikiem
 * jest naruszeniem.
 */
export function naruszeniaPodgladu(
  grupy: Record<string, DefinicjaGrupy>,
  bezStraznika: Record<string, string>,
  pozaRejestrem: Record<string, { trasaProduktu: string; powod: string }>,
): string[] {
  const naruszenia: string[] = [];
  const ekrany = Object.values(grupy).flatMap((grupa) => grupa.ekrany);
  const stronyProduktu = STRONY.filter((strona) => !strona.adres.startsWith(PREFIKS_PODGLADU));
  const stronyPodgladu = STRONY.filter((strona) => strona.adres.startsWith(PREFIKS_PODGLADU));

  for (const podglad of stronyPodgladu) {
    const plik = relative(KORZEN_FRONTU, podglad.plik);
    const trasyProduktu = new Set([
      ...ekrany.filter((ekran) => wzorzecTrasy(ekran.trasaPoligonu) === podglad.adres).map((ekran) => ekran.nowaTrasa),
      ...Object.entries(pozaRejestrem)
        .filter(([adres]) => wzorzecTrasy(adres) === podglad.adres)
        .map(([, wpis]) => wpis.trasaProduktu),
    ]);
    if (trasyProduktu.size === 0) {
      naruszenia.push(`${plik} — strona podglądu bez trasy produktu w rejestrze ani na liście stron spoza rejestru`);
      continue;
    }

    const roleProduktu = new Map<string, string[] | null>();
    for (const trasa of trasyProduktu) {
      const strony = stronyProduktu.filter((strona) => strona.adres === wzorzecTrasy(trasa));
      if (strony.length === 0) naruszenia.push(`${plik} — brak strony trasy produktu ${trasa}`);
      for (const strona of strony) {
        const role = roleDopuszczone(strona.plik);
        roleProduktu.set(JSON.stringify(role), role);
      }
    }
    if (roleProduktu.size === 0) continue;
    if (roleProduktu.size > 1) {
      const warianty = [...roleProduktu.values()].map(opisRol).join(" | ");
      naruszenia.push(`${plik} — trasy produktu tej strony (${[...trasyProduktu].join(", ")}) mają różne role: ${warianty}`);
      continue;
    }

    const [oczekiwane] = [...roleProduktu.values()];
    const role = roleDopuszczone(podglad.plik);
    const zListyBezStraznika = naLiscie(bezStraznika, podglad.adres);
    const paneleStrony = ekrany
      .filter((ekran) => wzorzecTrasy(ekran.trasaPoligonu) === podglad.adres)
      .map((ekran) => ekran.panel);
    const stronaGrupyPublicznej =
      paneleStrony.length > 0 &&
      paneleStrony.every((panel) => PANELE_PUBLICZNE.includes(panel)) &&
      !naLiscie(pozaRejestrem, podglad.adres);

    if (stronaGrupyPublicznej) {
      if (oczekiwane !== null) {
        naruszenia.push(`${plik} — strona podglądu grupy publicznej, a trasa produktu wymaga ról ${opisRol(oczekiwane)}`);
      }
      if (role !== null) {
        naruszenia.push(`${plik} — strona podglądu grupy publicznej leży pod strażnikiem z rolami ${opisRol(role)}`);
      }
      if (zListyBezStraznika) {
        naruszenia.push(`${plik} — strona podglądu grupy publicznej nie potrzebuje pozycji na liście podglądów bez strażnika`);
      }
      continue;
    }

    if (oczekiwane === null) {
      if (!zListyBezStraznika) {
        naruszenia.push(
          `${plik} nie leży pod RequireRole, a jego trasa produktu (${[...trasyProduktu].join(", ")}) też strażnika nie ma — strona wymaga pozycji z powodem na liście podglądów bez strażnika`,
        );
      } else if (role !== null) {
        naruszenia.push(`${plik} — strona z listy podglądów bez strażnika leży pod RequireRole z rolami ${opisRol(role)}`);
      }
      continue;
    }

    if (zListyBezStraznika) {
      naruszenia.push(`${plik} — strona z listy podglądów bez strażnika, a trasa produktu wymaga ról ${opisRol(oczekiwane)}`);
    }
    if (JSON.stringify(role) !== JSON.stringify(oczekiwane)) {
      naruszenia.push(
        `${plik} nie leży pod RequireRole z rolami trasy produktu (${opisRol(oczekiwane)}); role strażnika nad stroną: ${opisRol(role)}`,
      );
    }
  }

  for (const adres of Object.keys(bezStraznika)) {
    if (!stronyPodgladu.some((strona) => strona.adres === wzorzecTrasy(adres))) {
      naruszenia.push(`lista podglądów bez strażnika: ${adres} — brak strony pod tym adresem`);
    }
  }
  for (const adres of Object.keys(pozaRejestrem)) {
    if (!stronyPodgladu.some((strona) => strona.adres === wzorzecTrasy(adres))) {
      naruszenia.push(`lista stron spoza rejestru: ${adres} — brak strony pod tym adresem`);
    }
    if (ekrany.some((ekran) => wzorzecTrasy(ekran.trasaPoligonu) === wzorzecTrasy(adres))) {
      naruszenia.push(`lista stron spoza rejestru: ${adres} — strona jest w rejestrze przełączenia`);
    }
  }
  return naruszenia;
}

/** Rejestr z jednym ekranem podmienionym: ta sama strona podglądu, inna trasa produktu. */
function zPodmienionaTrasaProduktu(trasaPoligonu: string, nowaTrasa: string): Record<string, DefinicjaGrupy> {
  return Object.fromEntries(
    Object.entries(GRUPY).map(([klucz, grupa]) => [
      klucz,
      {
        ...grupa,
        ekrany: grupa.ekrany.map((ekran) => (ekran.trasaPoligonu === trasaPoligonu ? { ...ekran, nowaTrasa } : ekran)),
      },
    ]),
  );
}

/** Rejestr z jednym ekranem przeniesionym do innego panelu: ta sama strona podglądu i trasa produktu. */
function zPodmienionymPanelem(trasaPoligonu: string, panel: NazwaPanelu): Record<string, DefinicjaGrupy> {
  return Object.fromEntries(
    Object.entries(GRUPY).map(([klucz, grupa]) => [
      klucz,
      {
        ...grupa,
        ekrany: grupa.ekrany.map((ekran) => (ekran.trasaPoligonu === trasaPoligonu ? { ...ekran, panel } : ekran)),
      },
    ]),
  );
}

function bez<T>(lista: Record<string, T>, adres: string): Record<string, T> {
  return Object.fromEntries(Object.entries(lista).filter(([klucz]) => klucz !== adres));
}

describe("strażnik roli dla każdej strony podglądu pod /nowy-front", () => {
  it("każda strona pod /nowy-front leży pod strażnikiem z rolami swojej trasy produktu albo stoi z powodem na liście podglądów bez strażnika", () => {
    expect(naruszeniaPodgladu(GRUPY, PODGLADY_BEZ_STRAZNIKA, PODGLADY_POZA_REJESTREM)).toEqual([]);
  });

  it("przegląd obejmuje strony podglądu administracji i pozostałe", () => {
    const adresy = STRONY.map((strona) => strona.adres).filter((adres) => adres.startsWith(PREFIKS_PODGLADU));
    expect(adresy.some((adres) => adres.startsWith("/nowy-front/admin/"))).toBe(true);
    expect(adresy.filter((adres) => !adres.startsWith("/nowy-front/admin/")).length).toBeGreaterThan(0);
  });

  it("każda pozycja list ma powód", () => {
    for (const powod of Object.values(PODGLADY_BEZ_STRAZNIKA)) expect(powod.trim()).not.toBe("");
    for (const { powod, trasaProduktu } of Object.values(PODGLADY_POZA_REJESTREM)) {
      expect(powod.trim()).not.toBe("");
      expect(trasaProduktu.startsWith(PREFIKS_PODGLADU)).toBe(false);
    }
  });

  it("lista podglądów bez strażnika jest pusta", () => {
    expect(PODGLADY_BEZ_STRAZNIKA).toEqual({});
  });

  it.each(PODGLADY_EKRANOW_UCZESTNIKA)("strona %s leży pod strażnikiem z rolami uczestnika (student, volunteer)", (adres) => {
    const strony = STRONY.filter((strona) => strona.adres === wzorzecTrasy(adres));
    expect(strony).toHaveLength(1);
    expect(roleDopuszczone(strony[0].plik)).toEqual(["student", "volunteer"]);
  });

  it("strony podglądu grup publicznych wskazują tylko ekrany panelu publicznego, a podgląd ekranu startowego panelu uczestnika nie jest wśród nich", () => {
    const grupy: Record<string, DefinicjaGrupy> = GRUPY;
    const panele = (adres: string) =>
      Object.values(grupy)
        .flatMap((grupa) => grupa.ekrany)
        .filter((ekran) => wzorzecTrasy(ekran.trasaPoligonu) === adres)
        .map((ekran) => ekran.panel);
    const publiczne = STRONY.map((strona) => strona.adres).filter((adres) => adres.startsWith("/nowy-front/publiczne/"));
    expect(publiczne).toContain("/nowy-front/publiczne/konto");
    expect(publiczne).toContain("/nowy-front/publiczne/panel/start");
    expect(panele("/nowy-front/publiczne/panel/start")).toEqual(["uczestnik"]);
    for (const adres of publiczne.filter((adres) => adres !== "/nowy-front/publiczne/panel/start")) {
      expect(panele(adres).length, adres).toBeGreaterThan(0);
      expect(panele(adres).every((panel) => panel === "publiczny"), adres).toBe(true);
    }
  });

  it("mutant: strona podglądu grupy publicznej przeniesiona do panelu uczestnika traci wyjątek", () => {
    const naruszenia = naruszeniaPodgladu(
      zPodmienionymPanelem("/nowy-front/publiczne/konto", "uczestnik"),
      PODGLADY_BEZ_STRAZNIKA,
      PODGLADY_POZA_REJESTREM,
    );
    expect(naruszenia).toHaveLength(1);
    expect(naruszenia[0]).toContain(join("app", "nowy-front", "publiczne", "konto", "page.tsx"));
    expect(naruszenia[0]).toContain("nie leży pod RequireRole");
  });

  it("mutant: strona podglądu grupy publicznej, której trasa produktu ma strażnika, jest naruszeniem", () => {
    const naruszenia = naruszeniaPodgladu(
      zPodmienionaTrasaProduktu("/nowy-front/publiczne/konto", "/admin/emails"),
      PODGLADY_BEZ_STRAZNIKA,
      PODGLADY_POZA_REJESTREM,
    );
    expect(naruszenia).toHaveLength(1);
    expect(naruszenia[0]).toContain("strona podglądu grupy publicznej, a trasa produktu wymaga ról project_manager, super_admin");
  });

  it("mutant: strona podglądu grupy publicznej na liście podglądów bez strażnika jest naruszeniem", () => {
    const naruszenia = naruszeniaPodgladu(
      GRUPY,
      { ...PODGLADY_BEZ_STRAZNIKA, "/nowy-front/publiczne/konto": "powód" },
      PODGLADY_POZA_REJESTREM,
    );
    expect(naruszenia).toHaveLength(1);
    expect(naruszenia[0]).toContain("nie potrzebuje pozycji na liście podglądów bez strażnika");
  });

  it("mutant: strona, której trasa produktu nie ma strażnika, spoza listy podglądów bez strażnika jest naruszeniem", () => {
    const naruszenia = naruszeniaPodgladu(
      zPodmienionaTrasaProduktu("/nowy-front/pulpit", "/konto"),
      PODGLADY_BEZ_STRAZNIKA,
      PODGLADY_POZA_REJESTREM,
    );
    expect(naruszenia).toHaveLength(1);
    expect(naruszenia[0]).toContain(join("app", "nowy-front", "pulpit", "page.tsx"));
    expect(naruszenia[0]).toContain("wymaga pozycji z powodem na liście podglądów bez strażnika");
  });

  it("mutant: strona z listy podglądów bez strażnika, której trasa produktu ma strażnika, jest naruszeniem", () => {
    const naruszenia = naruszeniaPodgladu(GRUPY, { "/nowy-front/pulpit": "powód" }, PODGLADY_POZA_REJESTREM);
    expect(naruszenia).toEqual([
      `${join("app", "nowy-front", "pulpit", "page.tsx")} — strona z listy podglądów bez strażnika, a trasa produktu wymaga ról student, volunteer`,
    ]);
  });

  it("mutant: strona podglądu ekranu uczestnika pod trasą produktu z węższą rolą jest naruszeniem", () => {
    const naruszenia = naruszeniaPodgladu(
      zPodmienionaTrasaProduktu("/nowy-front/pulpit", "/panel/staz"),
      PODGLADY_BEZ_STRAZNIKA,
      PODGLADY_POZA_REJESTREM,
    );
    expect(naruszenia).toEqual([
      `${join("app", "nowy-front", "pulpit", "page.tsx")} nie leży pod RequireRole z rolami trasy produktu (volunteer); role strażnika nad stroną: student, volunteer`,
    ]);
  });

  it("mutant: strażnik z rolami innymi niż trasa produktu jest naruszeniem", () => {
    const naruszenia = naruszeniaPodgladu(
      zPodmienionaTrasaProduktu("/nowy-front/certyfikat", "/admin/kursy"),
      PODGLADY_BEZ_STRAZNIKA,
      PODGLADY_POZA_REJESTREM,
    );
    expect(naruszenia).toHaveLength(1);
    expect(naruszenia[0]).toContain("project_manager, super_admin");
    expect(naruszenia[0]).toContain("volunteer");
  });

  it("mutant: strona podglądu poza rejestrem i poza listą stron spoza rejestru jest naruszeniem", () => {
    const { wspolpraca: _pominieta, ...bezWspolpracy } = GRUPY;
    void _pominieta;
    const naruszenia = naruszeniaPodgladu(bezWspolpracy, PODGLADY_BEZ_STRAZNIKA, PODGLADY_POZA_REJESTREM);
    expect(naruszenia.filter((opis) => opis.includes("bez trasy produktu"))).toHaveLength(2);
  });

  it("mutant: trasa produktu bez strony jest naruszeniem", () => {
    const naruszenia = naruszeniaPodgladu(
      zPodmienionaTrasaProduktu("/nowy-front/staz", "/panel/nie-ma-takiej-trasy"),
      PODGLADY_BEZ_STRAZNIKA,
      PODGLADY_POZA_REJESTREM,
    );
    expect(naruszenia).toEqual([`${join("app", "nowy-front", "staz", "page.tsx")} — brak strony trasy produktu /panel/nie-ma-takiej-trasy`]);
  });

  it("mutant: pozycja listy podglądów bez strażnika bez strony jest naruszeniem", () => {
    const naruszenia = naruszeniaPodgladu(
      GRUPY,
      { ...PODGLADY_BEZ_STRAZNIKA, "/nowy-front/nie-ma-takiej-strony": "powód" },
      PODGLADY_POZA_REJESTREM,
    );
    expect(naruszenia).toEqual(["lista podglądów bez strażnika: /nowy-front/nie-ma-takiej-strony — brak strony pod tym adresem"]);
  });

  it("mutant: przekierowanie spoza rejestru bez pozycji na liście jest naruszeniem", () => {
    const naruszenia = naruszeniaPodgladu(
      GRUPY,
      PODGLADY_BEZ_STRAZNIKA,
      bez(PODGLADY_POZA_REJESTREM, "/nowy-front/admin/uczestniczki/[id]/przedluzenie"),
    );
    expect(naruszenia).toHaveLength(1);
    expect(naruszenia[0]).toContain("przedluzenie");
  });
});

/** Katalogi segmentu `/panel` obu grup tras z ekranami uczestnika. */
const KATALOGI_PANELU = [join(KATALOG_APP, "(uczestnik)", "panel"), join(KATALOG_APP, "(przelaczenie)", "panel")];

/**
 * Strony pod `/panel` bez strażnika nad nimi: strona, która wyłącznie przekierowuje (nie ma treści).
 * Klucz: plik względem `app`, wartość: powód.
 */
const STRONY_PANELU_BEZ_STRAZNIKA: Record<string, string> = {
  [join("(uczestnik)", "panel", "page.tsx")]: "samo przekierowanie /panel na start panelu, bez treści",
};

/** Odpowiedź serwera wywołana w źródle: `notFound()`, `redirect(…)` albo `permanentRedirect(…)`. */
const WZORZEC_ODPOWIEDZI_SERWERA = /\b(?:notFound|redirect|permanentRedirect)\(/;

interface UkladNadStrona {
  plik: string;
  zrodlo: string;
}

/** Układy od katalogu strony w górę do katalogu `/panel` włącznie (od najbliższego). */
function ukladyDoPanelu(plikStrony: string, katalogPanelu: string): UkladNadStrona[] {
  const uklady: UkladNadStrona[] = [];
  let katalog = dirname(plikStrony);
  for (;;) {
    const plik = join(katalog, "layout.tsx");
    if (existsSync(plik)) uklady.push({ plik, zrodlo: readFileSync(plik, "utf8") });
    if (katalog === katalogPanelu) break;
    katalog = dirname(katalog);
  }
  return uklady;
}

/** Strażnik w źródle układu: element `StraznikUczestnika` (nie sam import ani komentarz). */
function maStraznikaUczestnika(zrodlo: string): boolean {
  return /<StraznikUczestnika\b/.test(zrodlo);
}

/**
 * Naruszenia ułożenia strażnika pod `/panel`:
 * - układ całego `/panel` nie ma strażnika (odpowiedzi serwera segmentów zapadałyby w przeglądarce);
 * - każda strona (poza listą stron bez strażnika) leży pod układem segmentu ze strażnikiem;
 * - strona, która wywołuje odpowiedź serwera, ma tę samą decyzję w układzie segmentu przed strażnikiem.
 */
export function naruszeniaUlozeniaStraznika(
  katalogi: readonly string[] = KATALOGI_PANELU,
  bezStraznika: Record<string, string> = STRONY_PANELU_BEZ_STRAZNIKA,
): string[] {
  const naruszenia: string[] = [];
  for (const katalogPanelu of katalogi) {
    const ukladPanelu = join(katalogPanelu, "layout.tsx");
    if (existsSync(ukladPanelu) && maStraznikaUczestnika(readFileSync(ukladPanelu, "utf8"))) {
      naruszenia.push(`${relative(KATALOG_APP, ukladPanelu)} — strażnik w układzie całego /panel`);
    }
    for (const plikStrony of stronyAplikacji(katalogPanelu)) {
      const opis = relative(KATALOG_APP, plikStrony);
      const zrodloStrony = readFileSync(plikStrony, "utf8");
      const ukladySegmentu = ukladyDoPanelu(plikStrony, katalogPanelu).filter((uklad) => uklad.plik !== ukladPanelu);
      const zeStraznikiem = ukladySegmentu.filter((uklad) => maStraznikaUczestnika(uklad.zrodlo));
      if (opis in bezStraznika) {
        if (zeStraznikiem.length > 0) naruszenia.push(`${opis} — strona z listy bez strażnika leży pod strażnikiem`);
        if (/<[A-Za-z]/.test(zrodloStrony)) naruszenia.push(`${opis} — strona z listy bez strażnika ma treść`);
        continue;
      }
      if (zeStraznikiem.length === 0) {
        naruszenia.push(`${opis} — strona nie leży pod układem segmentu ze StraznikUczestnika`);
        continue;
      }
      if (!WZORZEC_ODPOWIEDZI_SERWERA.test(zrodloStrony)) continue;
      const decyzjaPrzedStraznikiem = ukladySegmentu.some((uklad) => {
        const odpowiedz = uklad.zrodlo.search(WZORZEC_ODPOWIEDZI_SERWERA);
        const straznik = uklad.zrodlo.search(/<StraznikUczestnika\b/);
        return odpowiedz !== -1 && (straznik === -1 || odpowiedz < straznik);
      });
      if (!decyzjaPrzedStraznikiem) {
        naruszenia.push(`${opis} — odpowiedź serwera strony nie ma tej samej decyzji w układzie segmentu przed strażnikiem`);
      }
    }
  }
  return naruszenia;
}

describe("ułożenie StraznikUczestnika pod /panel", () => {
  it("strażnik stoi w układach segmentów, a odpowiedzi serwera zapadają przed nim", () => {
    expect(naruszeniaUlozeniaStraznika()).toEqual([]);
  });

  it("kontrola: przegląd widzi strony obu grup /panel", () => {
    const strony = KATALOGI_PANELU.flatMap((katalog) => stronyAplikacji(katalog)).map((plik) => adresStrony(plik));
    expect(strony).toEqual(
      expect.arrayContaining(["/panel/pulpit", "/panel/lekcje/[]", "/panel/po-programie", "/panel/dalsza-wspolpraca"]),
    );
  });

  it("mutant: strona /panel bez pozycji na liście bez strażnika jest naruszeniem", () => {
    expect(naruszeniaUlozeniaStraznika(KATALOGI_PANELU, {})).toEqual([
      `${join("(uczestnik)", "panel", "page.tsx")} — strona nie leży pod układem segmentu ze StraznikUczestnika`,
    ]);
  });

  it("mutant: pozycja listy bez strażnika na stronie z treścią pod strażnikiem jest naruszeniem", () => {
    const opis = join("(uczestnik)", "panel", "pulpit", "page.tsx");
    const naruszenia = naruszeniaUlozeniaStraznika(KATALOGI_PANELU, { ...STRONY_PANELU_BEZ_STRAZNIKA, [opis]: "próba" });
    expect(naruszenia).toContain(`${opis} — strona z listy bez strażnika leży pod strażnikiem`);
  });
});
