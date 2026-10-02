/**
 * Zamiana treści lekcji między tekstem (podzbiór Markdown z aneksu kontraktu
 * „treść lekcji”) a dokumentem edytora — w obie strony, bez Reacta i bez
 * kodu silnika (typ węzła jest tu wyłącznie typem).
 *
 * Trzy zasady, których pilnują próby:
 *
 * 1. Miarą jest `parsujTresc` — ten sam parser, którym treść czyta uczestnik.
 *    Dokument edytora powstaje z jego drzewa, a każdy blok zamieniany z
 *    powrotem na tekst jest od razu czytany tym parserem i porównywany z
 *    drzewem, które miał dać. Blok, którego podzbiór nie umie zapisać,
 *    dostaje ustępstwo (zdjęte wyróżnienie), nigdy zgubiony albo dopisany znak.
 * 2. Blok, którego osoba nie zmieniła, wraca do tekstu ZNAK W ZNAK ze źródła
 *    (razem z odstępem po nim) — także wtedy, gdy źródło zawiera zapis spoza
 *    podzbioru (surowy HTML, tabela, obraz, blok kodu).
 * 3. Liczy się tekst wysyłany: licznik znaków pracuje na wyniku tej zamiany.
 */

import type { Node as WezelPM } from "@tiptap/pm/model";
import { bezpiecznyAdres, parsujTresc, type Blok, type Wtracenie } from "../TrescLekcji/parsujTresc";

/** Limit treści lekcji z kontraktu: 20 000 znaków (znaków, nie bajtów). */
export const LIMIT_ZNAKOW = 20000;

/** Liczba znaków (punktów kodowych), tak jak liczy je zaplecze. */
export function liczZnaki(tekst: string): number {
  return Array.from(tekst).length;
}

export interface ZnakJson {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface WezelJson {
  type: string;
  attrs?: Record<string, unknown>;
  content?: WezelJson[];
  text?: string;
  marks?: ZnakJson[];
}

/** Jeden blok źródła: jego dokładny zapis i odstęp, który po nim stał. */
export interface Segment {
  zrodlo: string;
  odstep: string;
  blok: Blok;
}

export interface Podzial {
  /** Znaki przed pierwszym blokiem (puste wiersze na początku). */
  przed: string;
  segmenty: Segment[];
}

const KONIEC_WIERSZA = /\r\n|\r|\n/g;

type RodzajWiersza = "pusty" | "naglowek" | "punkt" | "numer" | "akapit";

/** Rodzaj wiersza według parsera treści — bez powielania jego wyrażeń. */
function rodzajWiersza(wiersz: string): RodzajWiersza {
  const bloki = parsujTresc(wiersz);
  if (bloki.length === 0) {
    return "pusty";
  }
  const blok = bloki[0];
  if (blok.rodzaj === "naglowek") {
    return "naglowek";
  }
  if (blok.rodzaj === "lista") {
    return blok.uporzadkowana ? "numer" : "punkt";
  }
  return "akapit";
}

/** Kanoniczny odcisk wtrąceń: sąsiednie teksty scalone, kolejność pól stała. */
function odciskWtracen(wtracenia: Wtracenie[]): string {
  const czesci: string[] = [];
  let tekst: string | null = null;
  const zamknijTekst = () => {
    if (tekst !== null) {
      czesci.push(`t${JSON.stringify(tekst)}`);
      tekst = null;
    }
  };
  for (const wtracenie of wtracenia) {
    if (wtracenie.rodzaj === "tekst") {
      tekst = (tekst ?? "") + wtracenie.tekst;
      continue;
    }
    zamknijTekst();
    switch (wtracenie.rodzaj) {
      case "pogrubienie":
        czesci.push(`b(${odciskWtracen(wtracenie.dzieci)})`);
        break;
      case "kursywa":
        czesci.push(`i(${odciskWtracen(wtracenie.dzieci)})`);
        break;
      case "kod":
        czesci.push(`k${JSON.stringify(wtracenie.tekst)}`);
        break;
      case "lamanie":
        czesci.push("br");
        break;
      case "link":
        czesci.push(`a${JSON.stringify(wtracenie.adres)}${wtracenie.zewnetrzny ? "z" : "w"}(${odciskWtracen(wtracenie.dzieci)})`);
        break;
    }
  }
  zamknijTekst();
  return czesci.join(",");
}

/**
 * Kanoniczny odcisk drzewa treści. Dwa teksty o tym samym odcisku uczestnik
 * zobaczy tak samo; sąsiednie węzły tekstu są scalane, bo parser sam dzieli
 * tekst w miejscach bez znaczenia (np. po linku z niedozwolonym adresem).
 */
export function odciskTresci(bloki: Blok[]): string {
  return bloki
    .map((blok) => {
      switch (blok.rodzaj) {
        case "akapit":
          return `p(${odciskWtracen(blok.dzieci)})`;
        case "naglowek":
          return `h${blok.stopien}(${odciskWtracen(blok.dzieci)})`;
        case "lista":
          return `${blok.uporzadkowana ? `ol${blok.start}` : "ul"}[${blok.elementy.map((e) => `(${odciskWtracen(e)})`).join("")}]`;
      }
    })
    .join(";");
}

/**
 * Dzieli tekst na bloki z ich dokładnym zapisem. Suma `przed` i wszystkich
 * par (`zrodlo`, `odstep`) jest równa tekstowi wejściowemu znak w znak.
 */
export function podziel(tresc: string): Podzial {
  const wiersze: { tekst: string; od: number; do: number }[] = [];
  let pozycja = 0;
  KONIEC_WIERSZA.lastIndex = 0;
  for (let trafienie = KONIEC_WIERSZA.exec(tresc); trafienie !== null; trafienie = KONIEC_WIERSZA.exec(tresc)) {
    wiersze.push({ tekst: tresc.slice(pozycja, trafienie.index), od: pozycja, do: trafienie.index });
    pozycja = trafienie.index + trafienie[0].length;
  }
  wiersze.push({ tekst: tresc.slice(pozycja), od: pozycja, do: tresc.length });

  const zakresy: { od: number; do: number }[] = [];
  let biezacy: { rodzaj: RodzajWiersza; od: number; do: number } | null = null;
  const zamknij = () => {
    if (biezacy !== null) {
      zakresy.push({ od: biezacy.od, do: biezacy.do });
      biezacy = null;
    }
  };
  for (const wiersz of wiersze) {
    const rodzaj = rodzajWiersza(wiersz.tekst);
    if (rodzaj === "pusty") {
      zamknij();
    } else if (rodzaj === "naglowek") {
      zamknij();
      zakresy.push({ od: wiersz.od, do: wiersz.do });
    } else if (biezacy !== null && (biezacy as { rodzaj: RodzajWiersza }).rodzaj === rodzaj) {
      (biezacy as { do: number }).do = wiersz.do;
    } else {
      zamknij();
      biezacy = { rodzaj, od: wiersz.od, do: wiersz.do };
    }
  }
  zamknij();

  const segmenty: Segment[] = [];
  for (let i = 0; i < zakresy.length; i += 1) {
    const zrodlo = tresc.slice(zakresy[i].od, zakresy[i].do);
    const bloki = parsujTresc(zrodlo);
    if (bloki.length !== 1) {
      // Podział nie zgadza się z parserem: nie zgadujemy, oddajemy bloki
      // parsera bez zapisu źródłowego (takie bloki są zawsze zapisywane od nowa).
      return { przed: "", segmenty: parsujTresc(tresc).map((blok) => ({ zrodlo: "", odstep: "", blok })) };
    }
    const koniec = i + 1 < zakresy.length ? zakresy[i + 1].od : tresc.length;
    segmenty.push({ zrodlo, odstep: tresc.slice(zakresy[i].do, koniec), blok: bloki[0] });
  }

  const przed = zakresy.length > 0 ? tresc.slice(0, zakresy[0].od) : tresc;
  if (odciskTresci(segmenty.map((s) => s.blok)) !== odciskTresci(parsujTresc(tresc))) {
    return { przed: "", segmenty: parsujTresc(tresc).map((blok) => ({ zrodlo: "", odstep: "", blok })) };
  }
  return { przed, segmenty };
}

function wtraceniaNaJson(wtracenia: Wtracenie[], znaki: ZnakJson[], wynik: WezelJson[]): void {
  const zeZnakiem = (znak: ZnakJson) => (znaki.some((z) => z.type === znak.type) ? znaki : [...znaki, znak]);
  const tekst = (tresc: string, uzyte: ZnakJson[]) => {
    if (tresc !== "") {
      wynik.push(uzyte.length > 0 ? { type: "text", text: tresc, marks: uzyte } : { type: "text", text: tresc });
    }
  };
  for (const wtracenie of wtracenia) {
    switch (wtracenie.rodzaj) {
      case "tekst":
        wtracenie.tekst.split("\n").forEach((czesc, indeks) => {
          if (indeks > 0) {
            wynik.push({ type: "miekkieLamanie" });
          }
          tekst(czesc, znaki);
        });
        break;
      case "kod":
        tekst(wtracenie.tekst, zeZnakiem({ type: "code" }));
        break;
      case "lamanie":
        wynik.push({ type: "hardBreak" });
        break;
      case "pogrubienie":
        wtraceniaNaJson(wtracenie.dzieci, zeZnakiem({ type: "bold" }), wynik);
        break;
      case "kursywa":
        wtraceniaNaJson(wtracenie.dzieci, zeZnakiem({ type: "italic" }), wynik);
        break;
      case "link":
        wtraceniaNaJson(wtracenie.dzieci, zeZnakiem({ type: "link", attrs: { href: wtracenie.adres } }), wynik);
        break;
    }
  }
}

function wierszNaJson(wtracenia: Wtracenie[]): WezelJson[] {
  const wynik: WezelJson[] = [];
  wtraceniaNaJson(wtracenia, [], wynik);
  return wynik;
}

function blokNaJson(blok: Blok, idZrodla: number): WezelJson {
  switch (blok.rodzaj) {
    case "akapit":
      return { type: "paragraph", attrs: { idZrodla }, content: wierszNaJson(blok.dzieci) };
    case "naglowek":
      return { type: "heading", attrs: { level: blok.stopien, idZrodla }, content: wierszNaJson(blok.dzieci) };
    case "lista":
      return {
        type: blok.uporzadkowana ? "orderedList" : "bulletList",
        attrs: blok.uporzadkowana ? { start: blok.start, idZrodla } : { idZrodla },
        content: blok.elementy.map((element) => ({
          type: "listItem",
          content: [{ type: "paragraph", content: wierszNaJson(element) }],
        })),
      };
  }
}

/** Pamięć źródła jednego otwarcia treści: z niej wracają bloki nietknięte. */
export interface PamiecZrodla {
  przed: string;
  /** Koniec wiersza używany w blokach zapisywanych od nowa (taki jak w źródle). */
  nl: string;
  zrodla: { zrodlo: string; odstep: string; wezel: WezelPM | null }[];
}

/** Dokument edytora (JSON) i pamięć źródła dla podanej treści. */
export function dokumentZTresci(tresc: string): { json: WezelJson; pamiec: PamiecZrodla } {
  const podzial = podziel(tresc);
  const zeZrodlem = podzial.segmenty.every((s) => s.zrodlo !== "");
  const content = podzial.segmenty.map((segment, indeks) => blokNaJson(segment.blok, indeks));
  return {
    json: { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] },
    pamiec: {
      przed: podzial.przed,
      nl: tresc.includes("\r\n") ? "\r\n" : "\n",
      zrodla: zeZrodlem ? podzial.segmenty.map((s) => ({ zrodlo: s.zrodlo, odstep: s.odstep, wezel: null })) : [],
    },
  };
}

/** Zapamiętuje węzły świeżo otwartego dokumentu jako stan „nietknięty”. */
export function przypnijWezly(pamiec: PamiecZrodla, dokument: WezelPM): void {
  dokument.forEach((wezel) => {
    const id: unknown = wezel.attrs.idZrodla;
    if (typeof id === "number" && pamiec.zrodla[id] !== undefined) {
      pamiec.zrodla[id].wezel = wezel;
    }
  });
}

interface Kawalek {
  tekst: string;
  b: boolean;
  i: boolean;
  kod: boolean;
  adres: string | null;
}

interface Wiersz {
  kawalki: Kawalek[];
  /** Co stoi po wierszu: twarde łamanie, zwykły koniec wiersza albo nic (ostatni). */
  koniec: "lamanie" | "miekkie" | null;
}

/**
 * Ustępstwo: które wyróżnienia zdjąć, żeby blok dał się zapisać w podzbiorze.
 * `kursywaWPogrubieniu` zdejmuje kursywę tylko tam, gdzie tekst jest też
 * pogrubiony (parser treści nie zna pogrubionej kursywy na końcu pogrubienia).
 */
export interface Ustepstwo {
  kursywaWPogrubieniu: boolean;
  wyroznienia: boolean;
  link: boolean;
  kod: boolean;
}

const BEZ_USTEPSTW: Ustepstwo = { kursywaWPogrubieniu: false, wyroznienia: false, link: false, kod: false };

const DRABINA: Ustepstwo[] = [
  BEZ_USTEPSTW,
  { ...BEZ_USTEPSTW, kursywaWPogrubieniu: true },
  { ...BEZ_USTEPSTW, wyroznienia: true },
  { ...BEZ_USTEPSTW, link: true },
  { ...BEZ_USTEPSTW, link: true, kursywaWPogrubieniu: true },
  { ...BEZ_USTEPSTW, link: true, wyroznienia: true },
  { ...BEZ_USTEPSTW, kod: true },
  { ...BEZ_USTEPSTW, kod: true, kursywaWPogrubieniu: true },
  { ...BEZ_USTEPSTW, kod: true, wyroznienia: true },
  { ...BEZ_USTEPSTW, kod: true, link: true },
  { kursywaWPogrubieniu: false, wyroznienia: true, link: true, kod: true },
];

export function jestUstepstwem(u: Ustepstwo): boolean {
  return u.kursywaWPogrubieniu || u.wyroznienia || u.link || u.kod;
}

function maZnak(wezel: WezelPM, nazwa: string): boolean {
  return wezel.marks.some((znak) => znak.type.name === nazwa);
}

/** Wiersze bloku tekstowego: tekst z wyróżnieniami, rozdzielony łamaniami. */
function wierszeBloku(blok: WezelPM): Wiersz[] {
  const wiersze: Wiersz[] = [{ kawalki: [], koniec: null }];
  const nowyWiersz = (koniec: "lamanie" | "miekkie") => {
    wiersze[wiersze.length - 1].koniec = koniec;
    wiersze.push({ kawalki: [], koniec: null });
  };
  blok.forEach((dziecko) => {
    if (dziecko.isText) {
      const znakLinku = dziecko.marks.find((znak) => znak.type.name === "link");
      const surowy: unknown = znakLinku?.attrs.href;
      const sprawdzony = typeof surowy === "string" ? bezpiecznyAdres(surowy) : null;
      const wzor = {
        b: maZnak(dziecko, "bold"),
        i: maZnak(dziecko, "italic"),
        kod: maZnak(dziecko, "code"),
        adres: sprawdzony === null ? null : sprawdzony.adres,
      };
      (dziecko.text ?? "").split(/\r\n|\r|\n/).forEach((czesc, indeks) => {
        if (indeks > 0) {
          nowyWiersz("miekkie");
        }
        if (czesc !== "") {
          wiersze[wiersze.length - 1].kawalki.push({ tekst: czesc, ...wzor });
        }
      });
    } else if (dziecko.type.name === "hardBreak") {
      nowyWiersz("lamanie");
    } else if (dziecko.type.name === "miekkieLamanie") {
      nowyWiersz("miekkie");
    }
  });
  return wiersze;
}

function zwykly(k: Kawalek): boolean {
  return !k.b && !k.i && !k.kod && k.adres === null;
}

function teSameZnaki(a: Kawalek, b: Kawalek): boolean {
  return a.b === b.b && a.i === b.i && a.kod === b.kod && a.adres === b.adres;
}

/** Zdejmuje wyróżnienia według ustępstwa, scala sąsiadów i przycina brzegi wiersza. */
function przygotujWiersz(kawalki: Kawalek[], u: Ustepstwo): Kawalek[] {
  const wynik: Kawalek[] = [];
  for (const kawalek of kawalki) {
    const k: Kawalek = { ...kawalek };
    if (u.kod) k.kod = false;
    if (u.link) k.adres = null;
    if (u.wyroznienia) {
      k.b = false;
      k.i = false;
    } else if (u.kursywaWPogrubieniu && k.b) {
      k.i = false;
    }
    const poprzedni = wynik[wynik.length - 1];
    if (poprzedni !== undefined && teSameZnaki(poprzedni, k)) {
      poprzedni.tekst += k.tekst;
    } else {
      wynik.push(k);
    }
  }
  // Parser przycina białe znaki na brzegach wiersza; tekst w wyróżnieniu ich
  // nie traci, bo wiersz zaczyna się wtedy znakiem wyróżnienia.
  if (wynik.length > 0 && zwykly(wynik[0])) {
    wynik[0].tekst = wynik[0].tekst.trimStart();
    if (wynik[0].tekst === "") wynik.shift();
  }
  const ostatni = wynik[wynik.length - 1];
  if (ostatni !== undefined && zwykly(ostatni)) {
    ostatni.tekst = ostatni.tekst.trimEnd();
    if (ostatni.tekst === "") wynik.pop();
  }
  return wynik;
}

type RodzajZnaku = "link" | "b" | "i";

function niesie(k: Kawalek, rodzaj: RodzajZnaku, adres: string | null): boolean {
  if (rodzaj === "link") return k.adres !== null && k.adres === adres;
  return rodzaj === "b" ? k.b : k.i;
}

/**
 * Drzewo wtrąceń z płaskiej listy kawałków. Zewnętrzne zostaje to wyróżnienie,
 * które sięga najdalej — dzięki temu `**a *b* c**` wraca jako pogrubienie
 * z kursywą w środku, a nie trzy osobne pogrubienia.
 */
function zbudujDrzewo(kawalki: Kawalek[], aktywne: ReadonlySet<RodzajZnaku>): Wtracenie[] {
  const wynik: Wtracenie[] = [];
  let i = 0;
  while (i < kawalki.length) {
    const k = kawalki[i];
    const kandydaci: RodzajZnaku[] = [];
    if (k.adres !== null && !aktywne.has("link")) kandydaci.push("link");
    if (k.b && !aktywne.has("b")) kandydaci.push("b");
    if (k.i && !aktywne.has("i")) kandydaci.push("i");

    if (kandydaci.length === 0) {
      wynik.push(k.kod ? { rodzaj: "kod", tekst: k.tekst } : { rodzaj: "tekst", tekst: k.tekst });
      i += 1;
      continue;
    }

    let wybrany = kandydaci[0];
    let zasieg = i;
    for (const kandydat of kandydaci) {
      let j = i;
      while (j < kawalki.length && niesie(kawalki[j], kandydat, k.adres)) j += 1;
      if (j > zasieg) {
        zasieg = j;
        wybrany = kandydat;
      }
    }
    const dzieci = zbudujDrzewo(kawalki.slice(i, zasieg), new Set([...aktywne, wybrany]));
    if (wybrany === "link") {
      const sprawdzony = bezpiecznyAdres(k.adres as string);
      wynik.push({ rodzaj: "link", adres: k.adres as string, zewnetrzny: sprawdzony !== null && sprawdzony.zewnetrzny, dzieci });
    } else {
      wynik.push({ rodzaj: wybrany === "b" ? "pogrubienie" : "kursywa", dzieci });
    }
    i = zasieg;
  }
  return wynik;
}

/** Znaki, które w tekście muszą dostać `\`, żeby parser nie wziął ich za zapis. */
function zabezpiecz(tekst: string): string {
  return tekst.replace(/[\\`*[]/g, "\\$&");
}

function wtraceniaNaTekst(wtracenia: Wtracenie[]): string {
  return wtracenia
    .map((w) => {
      switch (w.rodzaj) {
        case "tekst":
          return zabezpiecz(w.tekst);
        case "pogrubienie":
          return `**${wtraceniaNaTekst(w.dzieci)}**`;
        case "kursywa":
          return `*${wtraceniaNaTekst(w.dzieci)}*`;
        case "kod":
          return `\`${w.tekst}\``;
        case "lamanie":
          return "\\";
        case "link":
          return `[${wtraceniaNaTekst(w.dzieci)}](${w.adres})`;
      }
    })
    .join("");
}

/** Wiersz akapitu nie może zacząć się jak nagłówek ani pozycja listy. */
function wierszAkapitu(drzewo: Wtracenie[]): string {
  const tekst = wtraceniaNaTekst(drzewo);
  if (rodzajWiersza(tekst) === "akapit" || tekst === "") {
    return tekst;
  }
  if (tekst.startsWith("#")) {
    return `\\${tekst}`;
  }
  if (tekst.startsWith("-")) {
    return `\\${tekst}`;
  }
  return tekst.replace(/^(\d{1,9})\./, "$1\\.");
}

interface ProbaBloku {
  tekst: string;
  oczekiwany: Blok | null;
}

/** Jeden wiersz bez łamań (nagłówek, pozycja listy): łamania stają się odstępem. */
function jedenWiersz(wiersze: Wiersz[], u: Ustepstwo): Kawalek[] {
  const razem: Kawalek[] = [];
  wiersze.forEach((wiersz, indeks) => {
    if (indeks > 0) {
      razem.push({ tekst: " ", b: false, i: false, kod: false, adres: null });
    }
    razem.push(...wiersz.kawalki);
  });
  return przygotujWiersz(razem, u);
}

function probaAkapitu(blok: WezelPM, u: Ustepstwo, nl: string): ProbaBloku {
  let wiersze = wierszeBloku(blok).map((w) => ({ kawalki: przygotujWiersz(w.kawalki, u), koniec: w.koniec }));
  // Pusty wiersz przed zwykłym końcem wiersza byłby pustym wierszem źródła,
  // czyli końcem akapitu; pusty wiersz na końcu zostawiłby wiszący znak łamania.
  wiersze = wiersze.filter((w) => !(w.kawalki.length === 0 && w.koniec === "miekkie"));
  while (wiersze.length > 0 && wiersze[wiersze.length - 1].kawalki.length === 0) {
    wiersze.pop();
  }
  if (wiersze.length === 0) {
    return { tekst: "", oczekiwany: null };
  }
  wiersze[wiersze.length - 1].koniec = null;

  const dzieci: Wtracenie[] = [];
  const zapis: string[] = [];
  wiersze.forEach((wiersz) => {
    const drzewo = zbudujDrzewo(wiersz.kawalki, new Set());
    dzieci.push(...drzewo);
    let tekst = wierszAkapitu(drzewo);
    if (wiersz.koniec === "lamanie") {
      dzieci.push({ rodzaj: "lamanie" });
      tekst += "\\";
    } else if (wiersz.koniec === "miekkie") {
      dzieci.push({ rodzaj: "tekst", tekst: "\n" });
    }
    zapis.push(tekst);
  });
  return { tekst: zapis.join(nl), oczekiwany: { rodzaj: "akapit", dzieci } };
}

function probaNaglowka(blok: WezelPM, u: Ustepstwo): ProbaBloku {
  const drzewo = zbudujDrzewo(jedenWiersz(wierszeBloku(blok), u), new Set());
  if (drzewo.length === 0) {
    return { tekst: "", oczekiwany: null };
  }
  const stopien = blok.attrs.level === 2 ? 2 : 3;
  return {
    tekst: `${"#".repeat(stopien)} ${wtraceniaNaTekst(drzewo)}`,
    oczekiwany: { rodzaj: "naglowek", stopien, dzieci: drzewo },
  };
}

function probaListy(blok: WezelPM, u: Ustepstwo, nl: string): ProbaBloku {
  const uporzadkowana = blok.type.name === "orderedList";
  const surowyStart: unknown = blok.attrs.start;
  const start =
    uporzadkowana && typeof surowyStart === "number" && Number.isInteger(surowyStart) && surowyStart >= 0 && surowyStart < 999999000
      ? surowyStart
      : 1;
  const elementy: Wtracenie[][] = [];
  const zapis: string[] = [];
  blok.forEach((pozycja) => {
    const kawalki: Wiersz[] = [];
    pozycja.forEach((dziecko) => {
      if (dziecko.isTextblock) {
        kawalki.push(...wierszeBloku(dziecko));
      }
    });
    const drzewo = zbudujDrzewo(jedenWiersz(kawalki, u), new Set());
    if (drzewo.length === 0) {
      return;
    }
    const znacznik = uporzadkowana ? `${start + elementy.length}.` : "-";
    elementy.push(drzewo);
    zapis.push(`${znacznik} ${wtraceniaNaTekst(drzewo)}`);
  });
  if (elementy.length === 0) {
    return { tekst: "", oczekiwany: null };
  }
  return { tekst: zapis.join(nl), oczekiwany: { rodzaj: "lista", uporzadkowana, start, elementy } };
}

function probaBloku(blok: WezelPM, u: Ustepstwo, nl: string): ProbaBloku {
  switch (blok.type.name) {
    case "heading":
      return probaNaglowka(blok, u);
    case "bulletList":
    case "orderedList":
      return probaListy(blok, u, nl);
    default:
      return probaAkapitu(blok, u, nl);
  }
}

export interface ZapisBloku {
  /** Tekst bloku w podzbiorze; pusty, gdy blok nie ma treści. */
  tekst: string;
  /** Ustępstwo, którego wymagał zapis (wszystko `false`, gdy żadnego). */
  ustepstwo: Ustepstwo;
  /** `true`, gdy parser treści czyta `tekst` dokładnie jako ten blok. */
  sprawdzony: boolean;
}

const pamiecBlokow = new WeakMap<WezelPM, { nl: string; zapis: ZapisBloku }>();

/**
 * Zapis jednego bloku dokumentu w podzbiorze. Każda próba jest czytana
 * parserem treści; pierwsza, która daje dokładnie zamierzone drzewo, wygrywa.
 */
export function zapiszBlok(blok: WezelPM, nl = "\n"): ZapisBloku {
  const zapamietany = pamiecBlokow.get(blok);
  if (zapamietany !== undefined && zapamietany.nl === nl) {
    return zapamietany.zapis;
  }
  let zapis: ZapisBloku | null = null;
  let ostatnia: ProbaBloku = { tekst: "", oczekiwany: null };
  for (const ustepstwo of DRABINA) {
    ostatnia = probaBloku(blok, ustepstwo, nl);
    if (ostatnia.oczekiwany === null) {
      zapis = { tekst: "", ustepstwo: BEZ_USTEPSTW, sprawdzony: true };
      break;
    }
    if (odciskTresci(parsujTresc(ostatnia.tekst)) === odciskTresci([ostatnia.oczekiwany])) {
      zapis = { tekst: ostatnia.tekst, ustepstwo, sprawdzony: true };
      break;
    }
  }
  if (zapis === null) {
    zapis = { tekst: ostatnia.tekst, ustepstwo: BEZ_USTEPSTW, sprawdzony: false };
  }
  pamiecBlokow.set(blok, { nl, zapis });
  return zapis;
}

function liczbaKoncowWiersza(tekst: string): number {
  return (tekst.match(KONIEC_WIERSZA) ?? []).length;
}

/**
 * Tekst wysyłany dla dokumentu edytora. Bloki nietknięte od otwarcia wracają
 * ze źródła znak w znak; pozostałe są zapisywane w podzbiorze. `wymus` pomija
 * pamięć źródła (każdy blok zapisany od nowa) — używają tego próby obiegu.
 */
export function zapiszDokument(dokument: WezelPM, pamiec: PamiecZrodla | null, opcje: { wymus?: boolean } = {}): string {
  const nl = pamiec?.nl ?? "\n";
  const czesci: { tekst: string; id: number | null }[] = [];
  dokument.forEach((wezel) => {
    const id: unknown = wezel.attrs.idZrodla;
    const zrodlo = !opcje.wymus && pamiec !== null && typeof id === "number" ? pamiec.zrodla[id] : undefined;
    if (zrodlo !== undefined && zrodlo.wezel !== null && (zrodlo.wezel === wezel || zrodlo.wezel.eq(wezel))) {
      czesci.push({ tekst: zrodlo.zrodlo, id: id as number });
      return;
    }
    const zapis = zapiszBlok(wezel, nl);
    if (zapis.tekst !== "") {
      czesci.push({ tekst: zapis.tekst, id: null });
    }
  });
  if (pamiec === null) {
    return czesci.map((c) => c.tekst).join(nl + nl);
  }
  if (czesci.length === 0) {
    // Źródło bez żadnego bloku (same białe znaki) wraca bez zmian; dokument,
    // z którego osoba usunęła całą treść, jest pusty.
    return pamiec.zrodla.length === 0 ? pamiec.przed : "";
  }

  let wynik = czesci[0].id === 0 ? pamiec.przed : "";
  czesci.forEach((czesc, indeks) => {
    wynik += czesc.tekst;
    const nastepna = czesci[indeks + 1];
    const odstep = czesc.id === null ? null : pamiec.zrodla[czesc.id].odstep;
    if (nastepna === undefined) {
      // Końcowe białe znaki źródła zostają tylko za blokiem, który je miał.
      if (odstep !== null && czesc.id === pamiec.zrodla.length - 1) {
        wynik += odstep;
      }
      return;
    }
    // Odstęp ze źródła jest pewny, gdy zawiera pusty wiersz albo gdy za blokiem
    // nadal stoi jego dawny sąsiad; w każdym innym układzie staje pusty wiersz.
    const sasiad = czesc.id !== null && nastepna.id === czesc.id + 1;
    if (odstep !== null && liczbaKoncowWiersza(odstep) >= (sasiad ? 1 : 2)) {
      wynik += odstep;
    } else {
      wynik += nl + nl;
    }
  });
  return wynik;
}
