// Pomiar stylu obliczonego wszystkich atomów wobec 06-ATOMY-MOLEKULY-ORGANIZMY.md
// §2, z tolerancją §1.5 — nie jest testem jednostkowym ani e2e MVP.
//
// Cztery odczyty na atom: 412px i 1440px, motyw jasny i ciemny (§0: "Każda
// pozycja w §1–§4 ma jedno mierzalne kryterium... pomiar stylu obliczonego
// na 412px i 1440px, w motywie jasnym i ciemnym").
//
// Kody sterowane — {0, 2, 3, 4}:
//   0 = zgodne (wszystkie odczyty zgodne z §2, w granicach §1.5) I pokrycie
//       mianownika par. 8.2 nie spadło poniżej PROG_POKRYCIA (patrz niżej).
//   2 = NIE DA SIĘ ZMIERZYĆ — selektor nie znalazł elementu, element
//       niewidoczny, albo wyjątek w trakcie odczytu JEDNEGO atomu. Kod 2
//       NIGDY nie jest zielony: jeżeli choćby jeden odczyt ma kod 2 i żaden
//       nie ma kodu 3, całość kończy się kodem 2, nie 0 (patrz `kodCalosci`
//       niżej).
//   3 = rozjazd zmierzony — lista przy atomie, w stdout.
//   4 = POKRYCIE PONIŻEJ PROGU:
//       liczba pozycji z rejestru dopasowanych do POZYCJE_PAR2 spadła poniżej
//       PROG_POKRYCIA. Wcześniej spadek pokrycia kończył się kodem 0 z
//       samą linią "UWAGA" w logu — zerwane dopasowanie jednej pozycji
//       rejestru dawało zielony przebieg.
//   Kolejność sprawdzania:
//       `kodCalosci` to łańcuch `else if` — 3 > 2 > 4 > 0 — nie cztery
//       niezależne bramki. Pokrycie jest MIERZONE i WYPISANE w logu ZAWSZE,
//       niezależnie od kodów 2/3 (patrz linia "PROG_POKRYCIA" niżej, drukowana
//       bez warunku) — ale w SAMYM KODZIE WYJŚCIA kod 4 pojawia się tylko
//       wtedy, gdy nie ma ani rozjazdu (3), ani błędu pomiaru (2). To celowe,
//       nie przeoczenie: rozjazd zmierzony albo niemożność pomiaru JEDNEGO
//       atomu są poważniejsze niż spadek LICZBY mierzonych pozycji, więc mają
//       pierwszeństwo we wspólnym, pojedynczym kodzie wyjścia. Poprzednia
//       wersja tego komentarza twierdziła, że kod 4 jest "sprawdzany
//       niezależnie od kodów 2/3" — nieprawda przy łańcuchu `else if`,
//       poprawione tutaj, nie w kodzie: zmiana kodu na cztery NIEZALEŻNE
//       bramki wymagałaby schematu maski bitowej (wielu jednoczesnych
//       problemów w jednym wyjściu procesu) — większa zmiana niż to, o co
//       proszono; wybrano poprawienie zdania, nie kodu, bo kolejność 3>2>4>0
//       jest sensownym zachowaniem produktu, nie błędem.
// Kod spoza {0,2,3,4} = narzędzie nie doszło do końca (przeglądarka się nie
// uruchomiła itp., ALBO rejestr `cele-atomy-styl.mjs`/`pozycje-warianty-
// stany-par2.mjs` nie dał się wczytać — patrz `wczytajRejestry()` niżej,
// Punkt "usunięty rejestr": zmapowane na kod 2, zgodnie z własną umową
// wołającego, zamiast pozostawione jako nienazwany kod 1 wyjątku modułu).
import { chromium } from "@playwright/test";

// Pytanie ("usunięty rejestr ma dawać
// kod 1?"): statyczny `import` jest hoistowany i niełapliwy w try/catch —
// usunięcie pliku rejestru dawało nienazwany `ERR_MODULE_NOT_FOUND` i kod 1,
// spoza zadeklarowanego zbioru {0,2,3,4}. Rozstrzygnięcie: kod 1 NIE ma
// zostać — rejestr jest tej samej rangi co selektor/port/build (kod 2, "NIE
// DA SIĘ ZMIERZYĆ"), więc import zamieniony na dynamiczny i owinięty w
// try/catch, zgodnie z własną umową wołającego (`scripts/uruchom-pomiar-
// stylu-atomow.mjs`: "wg własnej umowy wołającego powinno być 2").
let OCZEKIWANE_ATOMY_STYL, REGULY_FOKUSU, POZYCJE_PAR2, GAPY_JAWNE, nazwyKoncepcjiStanu;
try {
  ({ OCZEKIWANE_ATOMY_STYL, REGULY_FOKUSU } = await import("./cele-atomy-styl.mjs"));
  ({ POZYCJE_PAR2, GAPY_JAWNE, nazwyKoncepcjiStanu } = await import("./pozycje-warianty-stany-par2.mjs"));
} catch (blad) {
  console.error(`POMIAR STYLU ATOMÓW: NIE ZMIERZONO — rejestr nie wczytał się: ${blad.message}`);
  process.exit(2);
}

const PORT = process.env.PORT_POLIGONU || "4173";
const URL = `http://127.0.0.1:${PORT}/`;
const VIEWPORTY = [
  { nazwa: "412", width: 412, height: 900 },
  { nazwa: "1440", width: 1440, height: 900 },
];
const MOTYWY = ["light", "dark"];

/** Odczytuje właściwość CSS obliczoną dla PIERWSZEGO elementu pasującego do selektora. */
async function odczytajWlasciwoscElementu(page, selektor, wlasciwosc) {
  return page.evaluate(
    ([sel, prop]) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      return getComputedStyle(el).getPropertyValue(prop);
    },
    [selektor, wlasciwosc],
  );
}

/**
 * Odczytuje, na CO przeglądarka rozwiązuje wyrażenie tokenu (np. "var(--primary)")
 * dla DANEJ właściwości, w BIEŻĄCYM dokumencie (a więc w bieżącym motywie).
 * Porównanie z wynikiem `odczytajWlasciwoscElementu` jest więc porównaniem
 * dwóch wartości znormalizowanych przez tę samą przeglądarkę (np. obie w
 * postaci rgb(...)) — nie wymaga trzymania w tym repo osobnej tabeli
 * hex→rgb, która mogłaby się rozjechać z tokeny.css.
 */
async function odczytajTokenJakoWlasciwosc(page, wlasciwosc, wyrazenie) {
  return page.evaluate(
    ([prop, expr]) => {
      const tymczasowy = document.createElement("div");
      tymczasowy.style.setProperty(prop, expr);
      document.body.appendChild(tymczasowy);
      const wartosc = getComputedStyle(tymczasowy).getPropertyValue(prop);
      tymczasowy.remove();
      return wartosc;
    },
    [wlasciwosc, wyrazenie],
  );
}

function jestWyrazeniemTokenu(wartosc) {
  return typeof wartosc === "string" && wartosc.trim().startsWith("var(--");
}

/**
 * Wykonuje kroki `atom.akcje` PRZED odczytem — jedyne miejsce, które zmienia
 * stan strony (hover/klik/otwórz/zamknij), zamiast tylko czytać to, co
 * `main.tsx` już wyrenderował. Idempotentne z rozmysłem (`*-jesli-*`
 * sprawdzają obecny `aria-expanded` przed ruchem) — kolejność wpisów w
 * rejestrze NIE MA znaczenia dla wyniku (patrz cele-atomy-styl.mjs, komentarz
 * przy A5 Select).
 */
async function wykonajAkcje(page, akcje, domyslnySelektor) {
  if (!akcje) return;
  for (const krok of akcje) {
    const cel = page.locator(krok.cel ?? domyslnySelektor).first();
    switch (krok.typ) {
      case "hover":
        await cel.hover();
        break;
      case "klik":
        await cel.click();
        break;
      case "otworz-jesli-zamknieta": {
        const rozwinieta = await cel.getAttribute("aria-expanded");
        if (rozwinieta !== "true") await cel.click();
        break;
      }
      case "zamknij-jesli-otwarta": {
        const rozwinieta = await cel.getAttribute("aria-expanded");
        if (rozwinieta === "true") await cel.press("Escape");
        break;
      }
      default:
        throw new Error(`nieznana akcja "${krok.typ}"`);
    }
  }
}

/** Zmierz JEDEN atom w JEDNYM warunku (motyw × viewport). Zwraca { kod, ... }. */
async function zmierzAtom(page, atom, nazwaViewportu) {
  try {
    await wykonajAkcje(page, atom.akcje, atom.selektor);

    const liczbaDopasowan = await page.locator(atom.selektor).count();
    if (liczbaDopasowan === 0) {
      return { kod: 2, powod: `selektor "${atom.selektor}" nie zwrócił żadnego elementu` };
    }
    const box = await page.locator(atom.selektor).first().boundingBox();
    if (!box) {
      return { kod: 2, powod: "element niewidoczny (boundingBox() zwrócił null)" };
    }

    const rozjazdy = [];
    if (atom.atrybut) {
      const rzeczywistyAtrybut = await page.locator(atom.selektor).first().getAttribute(atom.atrybut.nazwa);
      if (rzeczywistyAtrybut !== atom.atrybut.oczekiwana) {
        rozjazdy.push(
          `atrybut ${atom.atrybut.nazwa}: obliczone "${rzeczywistyAtrybut}" != oczekiwane "${atom.atrybut.oczekiwana}"`,
        );
      }
    }
    const szer = Math.round(box.width * 100) / 100;
    const wys = Math.round(box.height * 100) / 100;
    const tol = atom.tolerancjaPx ?? 2;

    if (atom.minWysokosc !== undefined && wys < atom.minWysokosc) {
      rozjazdy.push(`wysokość ${wys}px < min ${atom.minWysokosc}px (bez tolerancji w dół, §1.5)`);
    }
    if (atom.minSzerokosc !== undefined && szer < atom.minSzerokosc) {
      rozjazdy.push(`szerokość ${szer}px < min ${atom.minSzerokosc}px (bez tolerancji w dół, §1.5)`);
    }
    if (atom.wysokoscDokladna !== undefined && Math.abs(wys - atom.wysokoscDokladna) > tol) {
      rozjazdy.push(`wysokość ${wys}px != ${atom.wysokoscDokladna}px (±${tol}px)`);
    }
    if (atom.szerokoscDokladna !== undefined && Math.abs(szer - atom.szerokoscDokladna) > tol) {
      rozjazdy.push(`szerokość ${szer}px != ${atom.szerokoscDokladna}px (±${tol}px)`);
    }
    if (atom.szerokoscMax !== undefined && szer > atom.szerokoscMax + tol) {
      rozjazdy.push(`szerokość ${szer}px > max ${atom.szerokoscMax}px (±${tol}px)`);
    }

    if (atom.wlasciwosci) {
      for (const [wlasciwosc, oczekiwanaSurowa] of Object.entries(atom.wlasciwosci)) {
        const oczekiwanaWartoscZrodlowa =
          oczekiwanaSurowa !== null && typeof oczekiwanaSurowa === "object"
            ? oczekiwanaSurowa[nazwaViewportu]
            : oczekiwanaSurowa;
        if (oczekiwanaWartoscZrodlowa === undefined) {
          rozjazdy.push(`brak oczekiwanej wartości "${wlasciwosc}" dla viewportu ${nazwaViewportu}px w rejestrze`);
          continue;
        }
        const rzeczywista = await odczytajWlasciwoscElementu(page, atom.selektor, wlasciwosc);
        const oczekiwana = jestWyrazeniemTokenu(oczekiwanaWartoscZrodlowa)
          ? await odczytajTokenJakoWlasciwosc(page, wlasciwosc, oczekiwanaWartoscZrodlowa)
          : oczekiwanaWartoscZrodlowa;
        if (rzeczywista !== oczekiwana) {
          rozjazdy.push(`${wlasciwosc}: obliczone "${rzeczywista}" != oczekiwane "${oczekiwana}" (z ${oczekiwanaWartoscZrodlowa})`);
        }
      }
    }

    return rozjazdy.length > 0 ? { kod: 3, rozjazdy, szer, wys } : { kod: 0, szer, wys };
  } catch (blad) {
    return { kod: 2, powod: `wyjątek podczas pomiaru: ${blad.message}` };
  }
}

/**
 * Woła REGUŁĘ, nie sam token. tokeny.test.ts (jsdom) nie umie
 * rozwiązać `var()` w getComputedStyle (zmierzone sondą: jsdom zwraca
 * dosłowne "var(--r-xs)", nie "8px") — to jedyne miejsce w tym repo, które
 * naprawdę FOKUSUJE element w prawdziwej przeglądarce i czyta wyliczony
 * border-radius reguły `:focus-visible`, zamiast czytać wartość tokenu z
 * pliku CSS.
 *
 * `wymusFokusowalnosc`: gdy `true`, dokłada `tabindex="0"` PRZEZ SONDĘ
 * (page.evaluate), nie przez zmianę produktu — tak samo jak zrobił to
 * odrębny pomiar (§4: "zmierzyłem nadając jej
 * tabindex z poziomu sondy, nie z produktu"). Element bez tego atrybutu
 * (np. `Badge`, span bez roli interaktywnej) nie wchodzi do kolejki Tab i
 * `.focus()` z Playwrighta by go pominął.
 *
 * `wlasciwoscDoSprawdzenia`/`oczekiwanaWartoscTokenu`: domyślnie border-radius
 * / `var(--r-2xs)` — ale dla natywnego `<input type="checkbox">` (A6) to ZŁY
 * pomiar: zmierzone bezpośrednią sondą (`node.matches(':focus-visible')` ===
 * `true`, `outline-width` poprawne "3px", a mimo to `border-radius` == "0px")
 * — natywny widżet checkboksa IGNORUJE author `border-radius` dla własnego
 * kształtu niezależnie od reguły CSS (charakterystyka renderowania kontrolki
 * natywnej, nie wada reguły fokusu). Obrys (`outline`) rysuje się NA ZEWNĄTRZ
 * widżetu i honoruje regułę poprawnie — to jest właściwy pomiar dla A6.
 */
async function zmierzPromienFokusu(
  page,
  selektor,
  wymusFokusowalnosc = false,
  wlasciwoscDoSprawdzenia = "border-radius",
  oczekiwanaWartoscTokenu = "var(--r-2xs)",
) {
  try {
    const el = page.locator(selektor).first();
    if (wymusFokusowalnosc) {
      await el.evaluate((node) => node.setAttribute("tabindex", "0"));
    }
    // Odkryte TĄ rozbudową rejestru: jeśli wcześniej na tej samej
    // stronie padł klik albo hover (np. akcje A5 Select), Chromium przełącza
    // wewnętrzną heurystykę "ostatni tryb wejścia" na mysz, i programowe
    // `.focus()` na przycisku/linku/liście/nagłówku PRZESTAJE uruchamiać
    // `:focus-visible` (dla pól tekstowych — Input/Textarea — heurystyka nie
    // obowiązuje, dlatego te dwa NIE ujawniły tego problemu). Naciśnięcie
    // klawisza bez efektu tuż przed `.focus()` przełącza heurystykę z
    // powrotem na "klawiatura" — to jest to, co naprawdę robi użytkownik
    // klawiaturowy (Tab), nie efekt uboczny tej sondy.
    await page.keyboard.press("Shift");
    await el.focus();
    const rzeczywisty = await el.evaluate(
      (node, wlasciwosc) => getComputedStyle(node).getPropertyValue(wlasciwosc),
      wlasciwoscDoSprawdzenia,
    );
    await el.evaluate((node) => node.blur());
    if (wymusFokusowalnosc) {
      await el.evaluate((node) => node.removeAttribute("tabindex"));
    }
    const oczekiwany = await odczytajTokenJakoWlasciwosc(page, wlasciwoscDoSprawdzenia, oczekiwanaWartoscTokenu);
    if (rzeczywisty !== oczekiwany) {
      return {
        kod: 3,
        rozjazdy: [
          `${wlasciwoscDoSprawdzenia} w fokusie: obliczone "${rzeczywisty}" != oczekiwane "${oczekiwany}" (${oczekiwanaWartoscTokenu})`,
        ],
      };
    }
    return { kod: 0 };
  } catch (blad) {
    return { kod: 2, powod: `wyjątek podczas pomiaru fokusu: ${blad.message}` };
  }
}

let wyniki = [];
try {
  const browser = await chromium.launch();
  for (const motyw of MOTYWY) {
    for (const viewport of VIEWPORTY) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      await page.goto(`${URL}?theme=${motyw}`);
      await page.waitForSelector('[data-testid="button-primary"]');
      for (const atom of OCZEKIWANE_ATOMY_STYL) {
        const wynik = await zmierzAtom(page, atom, viewport.nazwa);
        wyniki.push({ atom: atom.nazwa, grupa: atom.grupa, pozycja: atom.pozycja, motyw, viewport: viewport.nazwa, ...wynik });
      }
      // Reguła WSPÓLNA `:root :focus-visible` — wołana REGUŁA, nie
      // sam token (patrz komentarz przy zmierzPromienFokusu). Jedna pętla dla
      // wszystkich atomów interaktywnych, zamiast osobnych wywołań na sztywno.
      for (const regula of REGULY_FOKUSU) {
        wyniki.push({
          atom: regula.nazwa,
          grupa: regula.grupa,
          pozycja: regula.pozycja,
          motyw,
          viewport: viewport.nazwa,
          ...(await zmierzPromienFokusu(
            page,
            regula.selektor,
            regula.wymusFokusowalnosc,
            regula.wlasciwosc ?? "border-radius",
            regula.oczekiwanaWartoscTokenu ?? "var(--r-2xs)",
          )),
        });
      }
      await page.close();
    }
  }
  await browser.close();
} catch (blad) {
  console.error(`POMIAR STYLU ATOMOW: NARZEDZIE NIE URUCHOMIONE — ${blad.message}`);
  process.exit(2);
}

const NAZWY_REGUL_FOKUSU = REGULY_FOKUSU.map((r) => r.nazwa);
const oczekiwaneOdczytow = (OCZEKIWANE_ATOMY_STYL.length + REGULY_FOKUSU.length) * MOTYWY.length * VIEWPORTY.length;
const zgodne = wyniki.filter((w) => w.kod === 0);
const nieZmierzone = wyniki.filter((w) => w.kod === 2);
const rozjezdzajaceSie = wyniki.filter((w) => w.kod === 3);

console.log(
  `ODCZYTY OCZEKIWANE: ${oczekiwaneOdczytow} ((${OCZEKIWANE_ATOMY_STYL.length} pozycji rejestru + ${REGULY_FOKUSU.length} reguł fokusu) x 2 motywy x 2 viewporty; A7 Radio nie istnieje — spec §2)`,
);
console.log(`ODCZYTY WYKONANE: ${wyniki.length}`);
console.log(`kod 0 (zgodne): ${zgodne.length}`);
console.log(`kod 2 (nie da się zmierzyć): ${nieZmierzone.length}`);
console.log(`kod 3 (rozjazd): ${rozjezdzajaceSie.length}`);

if (nieZmierzone.length > 0) {
  console.log("\n--- kod 2: NIE DA SIĘ ZMIERZYĆ ---");
  for (const w of nieZmierzone) {
    console.log(`  ${w.atom} (${w.motyw}, ${w.viewport}px): ${w.powod}`);
  }
}
if (rozjezdzajaceSie.length > 0) {
  console.log("\n--- kod 3: ROZJAZD ZMIERZONY ---");
  for (const w of rozjezdzajaceSie) {
    console.log(`  ${w.atom} (${w.motyw}, ${w.viewport}px):`);
    for (const r of w.rozjazdy) console.log(`    - ${r}`);
  }
}

// Tabela per atom x warunek — pełny pomiar końcowy.
console.log("\n--- TABELA PEŁNA: atom x motyw x viewport -> kod ---");
for (const nazwa of [...OCZEKIWANE_ATOMY_STYL.map((a) => a.nazwa), ...NAZWY_REGUL_FOKUSU]) {
  const wierszeAtomu = wyniki.filter((w) => w.atom === nazwa);
  const kody = wierszeAtomu.map((w) => `${w.motyw}/${w.viewport}px=${w.kod}`).join(", ");
  console.log(`  ${nazwa}: ${kody}`);
}

// Mianownik par. 8.2: policzony przez PRZECIĘCIE tego, co
// naprawdę ma wpis w rejestrze (OCZEKIWANE_ATOMY_STYL + REGULY_FOKUSU, po
// polach grupa/pozycja), z autorytatywną listą POZYCJE_PAR2 — nie liczba
// wpisana z ręki. Wpisy bez dopasowania w POZYCJE_PAR2 (np. pomocnicze
// sprawdzenie wymiaru dotyku albo próba Badge dla samej reguły fokusu) NIE wchodzą
// do licznika — to są DODATKI, nie pozycje z par. 2.
const wszystkieWpisyZRejestru = [...OCZEKIWANE_ATOMY_STYL, ...REGULY_FOKUSU];
const pozycjeZmierzone = new Set();
for (const wpis of wszystkieWpisyZRejestru) {
  if (!wpis.grupa || !wpis.pozycja) continue;
  const dopasowanie = POZYCJE_PAR2.find((p) => p.grupa === wpis.grupa && p.pozycja === wpis.pozycja);
  if (dopasowanie) pozycjeZmierzone.add(`${dopasowanie.grupa}::${dopasowanie.pozycja}`);
}
const wariantyOgolem = POZYCJE_PAR2.filter((p) => p.rodzaj === "wariant");
const stanyOgolem = POZYCJE_PAR2.filter((p) => p.rodzaj === "stan");
const wariantyZmierzone = wariantyOgolem.filter((p) => pozycjeZmierzone.has(`${p.grupa}::${p.pozycja}`));
const koncepcjeStanuWszystkie = nazwyKoncepcjiStanu();
const koncepcjeStanuZmierzone = new Set(
  stanyOgolem.filter((p) => pozycjeZmierzone.has(`${p.grupa}::${p.pozycja}`)).map((p) => p.koncepcjaStanu),
);

// Poprawka mianownika:
// "X z 44 wariantow, Y z 15 stanow" liczyło 15 KONCEPCJI stanu (zdeduplikowanych
// nazw), a POZYCJE_PAR2 ma 25 WYSTĄPIEŃ stanu (raz na atom, zgodnie z regułą
// liczenia z rachunku par. 2) — 44 warianty + 25 wystąpień stanu = 69, podział
// zupełny. Mieszanie "koncepcji" (15) z "wystąpieniami" (44/25) zaniżało
// własny wynik (41/44 = 93%) względem tego, co rejestr NAPRAWDĘ pokrywa
// (66/69 = 96%, w tym KAŻDE z 25 wystąpień stanu). Poprawka podniesiona przez
// odrębny pomiar, zastosowana tu — pełny rachunek stoi wyżej
// w tym samym komentarzu.
const stanyZmierzoneWystapienia = stanyOgolem.filter((p) => pozycjeZmierzone.has(`${p.grupa}::${p.pozycja}`));

// Wcześniej liczba
// pokrycia była raportem bez bramki — zerwanie dopasowania JEDNEJ pozycji
// rejestru (świadek: A9 Label — zwykła, grupa/pozycja na null)
// dawało "zmierzonych 65 z 69", linię "UWAGA", i mimo to kod wyjścia 0,
// bo kodCalosci zależał wyłącznie od rozjezdzajaceSie/nieZmierzone. PROG
// nazwany wprost i uzasadniony: nie mniej niż POKRYCIE OSIĄGNIĘTE, a KAŻDY
// spadek poniżej — czy to przez zerwane dopasowanie, czy przez usunięcie
// wpisu z rejestru — jest regresją i ma kod niezerowy (4), O ILE żaden atom
// nie ma jednocześnie kodu 2 albo 3 (patrz kolejność `else if` i umowa kodów w
// nagłówku pliku — pomiar i log pokrycia dzieją się zawsze, kod wyjścia ma
// pierwszeństwo 3>2>4>0).
//
// Podniesiony z 66 na 68: A2 „tło odwrócone” i A13 „wys. przycisku 34px”
// (dwie wady wykonania z GAPY_JAWNE) dostały wpis w cele-atomy-styl.mjs i
// mount w main.tsx — `npm run pomiar:styl-atomow` mierzy teraz "68 z 69"
// (jedyna pozostała pozycja poza pokryciem to A14 „przerywana”, luka
// specyfikacji w GAPY_JAWNE, nie wada wykonania — nie ma tu wpisu do
// zbudowania). 68 jest wartością ZMIERZONĄ tym poleceniem, nie założoną.
const PROG_POKRYCIA = 68;

console.log("\n--- MIANOWNIK PAR. 8.2 (par. 2, kolumna \"Warianty i stany\") ---");
console.log(
  `zmierzonych ${pozycjeZmierzone.size} z ${POZYCJE_PAR2.length} pozycji, w tym ${stanyZmierzoneWystapienia.length} z ${stanyOgolem.length} stanow-wystapien`,
);
console.log(
  `  (podzial: ${wariantyZmierzone.length} z ${wariantyOgolem.length} wariantow + ${stanyZmierzoneWystapienia.length} z ${stanyOgolem.length} stanow-wystapien = ${pozycjeZmierzone.size} z ${POZYCJE_PAR2.length}; koncepcji stanu zdeduplikowanych: ${koncepcjeStanuZmierzone.size} z ${koncepcjeStanuWszystkie.length})`,
);
console.log(`  PROG_POKRYCIA = ${PROG_POKRYCIA}; pokrycie ${pozycjeZmierzone.size >= PROG_POKRYCIA ? "NA PROGU LUB WYŻEJ" : "PONIŻEJ PROGU"}`);
if (GAPY_JAWNE.length > 0) {
  console.log("Gapy jawne (nie zmierzone, z powodem i klasyfikacja):");
  for (const gap of GAPY_JAWNE) {
    console.log(`  ${gap.grupa} "${gap.pozycja}" [${gap.klasyfikacja ?? "BRAK KLASYFIKACJI"}]: ${gap.powod}`);
  }
}
const niepokryte = POZYCJE_PAR2.filter((p) => !pozycjeZmierzone.has(`${p.grupa}::${p.pozycja}`));
const niepokryteBezGapow = niepokryte.filter(
  (p) => !GAPY_JAWNE.some((g) => g.grupa === p.grupa && g.pozycja === p.pozycja),
);
if (niepokryteBezGapow.length > 0) {
  console.log("UWAGA — niepokryte BEZ podanego powodu (rozjazd rachunku, nie ukrywać):");
  for (const p of niepokryteBezGapow) {
    console.log(`  ${p.grupa} "${p.pozycja}" (${p.rodzaj})`);
  }
}

// Kod 2 NIGDY nie jest zielony: obecność choćby jednego kodu 2 wyklucza 0,
// nawet gdy zero atomów ma kod 3. Kod 4 (pokrycie poniżej progu)
// też nigdy nie jest zielony, ale NIE jest sprawdzany
// niezależnie od 2/3 — to łańcuch `else if`, pierwszeństwo 3 > 2 > 4 > 0,
// patrz uzasadnienie w nagłówku pliku.
let kodCalosci;
if (rozjezdzajaceSie.length > 0) {
  kodCalosci = 3;
} else if (nieZmierzone.length > 0) {
  kodCalosci = 2;
} else if (pozycjeZmierzone.size < PROG_POKRYCIA) {
  kodCalosci = 4;
  console.log(
    `\nKOD 4: POKRYCIE PONIŻEJ PROGU — zmierzonych ${pozycjeZmierzone.size} z ${POZYCJE_PAR2.length}, próg ${PROG_POKRYCIA}`,
  );
} else {
  kodCalosci = 0;
}
console.log(`\nKOD WYJŚCIA: ${kodCalosci}`);
process.exit(kodCalosci);
