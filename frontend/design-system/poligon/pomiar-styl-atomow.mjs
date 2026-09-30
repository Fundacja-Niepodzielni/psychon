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
      // Reguła WSPÓLNA `[data-theme] :focus-visible` — wołana REGUŁA, nie
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
// mount w main.tsx — `npm run pomiar:styl-atomow` mierzył wtedy "68 z 69"
// (jedyna pozostała pozycja poza pokryciem to A14 „przerywana”, luka
// specyfikacji w GAPY_JAWNE, nie wada wykonania — nie ma tu wpisu do
// zbudowania). 68 było wartością ZMIERZONĄ tym poleceniem, nie założoną.
//
// Podniesiony z 68 na 92: siedem
// molekuł warstwy 3, grupa A (M1 Field, M2 SearchBox, M3 ListRow, M4
// KeyValueRow, M7 Breadcrumbs, M8 Tabs, M9 MenuItem) dostały mount w
// main.tsx i wpis w cele-atomy-styl.mjs/pozycje-warianty-stany-par2.mjs, tym
// samym przyrządem co atomy §2 — żaden nowy przyrząd nie powstał. Mianownik
// urósł z 69 do 95 (26 nowych nazwanych pozycji z §3), z czego 2 zostały
// GAPAMI JAWNYMI (M7 „skrócone”, M8 „zwinięta poniżej 639” — obie wady
// wykonania, nie zbudowane wcześniej). `npm run pomiar:styl-atomow`
// mierzy teraz „92 z 95”. 92 jest wartością ZMIERZONĄ tym poleceniem, nie
// założoną — jeżeli spadnie (zerwane dopasowanie albo usunięty wpis), kod
// wyjścia ma być 4, nie 0.
//
// Podniesiony z 92 na 105 (warstwa 3, grupa C): mianownik
// POZYCJE_PAR2 urósł z 95 do 108 (dopisane M14-M19, §3), a
// `npm run pomiar:styl-atomow` po dopisaniu mountów molekuł w main.tsx i
// celów w cele-atomy-styl.mjs mierzy "105 z 108 pozycji" — jedyna pozostała
// pozycja poza pokryciem sprzed tej zmiany jest wciąż TA SAMA: A14
// „przerywana” (luka specyfikacji w GAPY_JAWNE, nie wada wykonania). M14
// Pagination wnosi 0 do obu liczników (mianownik i licznik), zgodnie z
// komentarzem przy jego wpisie w pozycje-warianty-stany-par2.mjs — nie jest
// to więc "nowa luka", tylko istniejące zero z innego powodu niż A14.
// 105 jest wartością ZMIERZONĄ tym poleceniem (patrz linia "zmierzonych X z
// Y pozycji" w logu), nie założoną.
//
// Podniesiony z 105 na 110: organizm O7 `PublishChecklist`
// dopisany do POZYCJE_PAR2 (5 nowych pozycji: 2 warianty + 3 stany, mianownik
// 108 -> 113) i w całości okablowany w cele-atomy-styl.mjs + REGULY_FOKUSU +
// main.tsx (dwa mounty, z brakami / bez braków) — `npm run pomiar:styl-atomow`
// mierzy teraz "110 z 113" (jedyna pozostała pozycja poza pokryciem nadal A14
// „przerywana”, ta sama luka specyfikacji sprzed tej zmiany, bez zmian). 110
// jest wartością ZMIERZONĄ tym poleceniem, nie założoną.
//
// Pozycje poza progiem, kazda z powodem i wlascicielem, pelna lista w
// GAPY_JAWNE (pozycje-warianty-stany-par2.mjs):
//   (A14 "przerywana" NIE JEST tu wymieniona: zrodlo zdjelo ja z mianownika,
//    patrz cytat w. 124 przy tej pozycji w pozycje-warianty-stany-par2.mjs)
//   M5  "nad obszarem"                   - ograniczenie silnika: brak akcji
//                                          "dragover" w zestawie;
//   M12 "fokus poczatkowy na wycofaniu"  - ograniczenie silnika: fokus DOM
//                                          jest stanem globalnym strony,
//                                          wynik zalezalby od kolejnosci;
//   M13 "ukryty"                         - ograniczenie silnika: 0 dopasowan
//                                          selektora zawsze daje kod 2, brak
//                                          rozroznienia "ma nie istniec".
// Wszystkie trzy to ograniczenia PRZYRZADU: produkt je realizuje, tylko pomiar
// dzis nie siega, i kazda ma plik, wlasciciela naprawy oraz termin powrotu.
// Zadna nie jest brakiem produktu - taki wpis konczylby bieg kodem 4.
//
// Podniesiony z 110 na 123 (molekuły warstwy 3, grupa B): mianownik
// POZYCJE_PAR2 urósł z 113 do 129 (dopisanych 16 pozycji M5/M6/M10-M13),
// pokrycie ze 110 do 123 (13 nowych pozycji zmierzonych, 3 zostały GAPAMI
// JAWNYMI — patrz GAPY_JAWNE w pozycje-warianty-stany-par2.mjs: M5 „nad
// obszarem”, M12 „fokus poczatkowy na wycofaniu”, M13 „ukryty”). Próg NIE
// zostaje na poprzedniej wartości: gdyby ktoś później usunął jeden z 13
// nowych wpisów, pokrycie spadłoby o jeden, a stary próg by tego nie złapał.
// 123 jest wartością ZMIERZONĄ poleceniem `npm run pomiar:styl-atomow` na
// tej zmianie, nie założoną z ręki.
//
// Stosunek próg/N:
//   przed:        110 / 113 = 0,97345
//   po:           123 / 129 = 0,95349
// Stosunek PO jest niższy niż PRZED. Napisane wprost, nie ukryte: to
// MAKSIMUM matematycznie osiągalne, nie niedopatrzenie. 129 − 123 = 6 pozycji
// dziś niemierzalnych, wszystkie nazwane w GAPY_JAWNE z powodem i właścicielem:
//   A14 „przerywana”, M7 „skrócone”, M8 „zwinięta poniżej 639” (luki
//     specyfikacji/wady wykonania zastane — nie z tej zmiany);
//   M5 „nad obszarem” (wada wykonania — silnik nie ma akcji „dragover”);
//   M12 „fokus poczatkowy na wycofaniu” (wada wykonania — fokus DOM globalny
//     dla całej strony poligonu, wynik zależałby od kolejności wpisów);
//   M13 „ukryty” (wada wykonania — silnik traktuje 0 dopasowań selektora
//     zawsze jako kod 2, nie rozróżnia „nie powinien istnieć” od błędu).
// 123 = 129 − 6: próg równy dokładnie liczbie pozycji dziś mierzalnych, czyli
// najsilniejszy próg możliwy bez rozszerzania silnika (osobne zmiany, poza
// zakresem tej zmiany).
//
// Zdjęte z mianownika (commit "Zdejmij pozycje bez pomiaru z mianownika za
// zrodlem"): A14 „przerywana” w ogóle przestaje być pozycją POZYCJE_PAR2, nie
// tylko GAPĄ JAWNĄ — źródło (06-ATOMY-MOLEKULY-ORGANIZMY.md w. 124, cytat przy
// wpisie A14 w pozycje-warianty-stany-par2.mjs) mówi wprost „bez pozycji
// pomiaru”, więc mianownika w ogóle nie dotyczy. Mianownik: 129 -> 128. Próg
// tym pojedynczym krokiem BEZ ZMIANY: A14 nigdy nie była pozycją POKRYTĄ,
// więc jej zdjęcie z mianownika samo z siebie nie zmienia liczby pozycji
// zmierzonych, tylko zmniejsza listę nazwanych luk o jeden.
//
// Podniesiony ze 123 na 125 (commit "Zbuduj warianty Breadcrumbs
// skrocone i Tabs zwinieta ponizej 639"): M7 „skrócone” i M8 „zwinięta
// poniżej 639” dostały własny mount w main.tsx i cel pomiaru w
// cele-atomy-styl.mjs — wyszły z GAPY_JAWNE, są teraz pozycjami MIERZONYMI,
// nie nazwanymi lukami. Mianownik bez zmiany (128, obie pozycje już w nim
// były liczone jako nieosiągnięte), lista luk: 5 -> 3 (M5, M12, M13). 125 =
// 128 − 3: próg równy dokładnie liczbie pozycji dziś mierzalnych, ten sam
// dowód „najsilniejszy możliwy bez rozszerzania silnika” jak wyżej.
const PROG_POKRYCIA = 125;

// Nagłówek celowo NIE mówi już tylko "par. 2": od warstwy 3 mianownik
// obejmuje par. 2 (atomy, kolumna "Warianty i stany") ORAZ par. 3 (molekuły
// M14-M19, kolumna "Z czego, warianty, stany") — sprostowanie koordynatora,
// 27.09: nazwa PLIKU `pozycje-warianty-stany-par2.mjs` jest artefaktem
// warstwy 2 i myliła, treść już nie jest wyłącznie par. 2.
console.log("\n--- MIANOWNIK PAR. 8.2 (par. 2 atomy + par. 3 molekuły, kolumny \"Warianty i stany\" / \"Z czego, warianty, stany\") ---");
console.log(
  `zmierzonych ${pozycjeZmierzone.size} z ${POZYCJE_PAR2.length} pozycji, w tym ${stanyZmierzoneWystapienia.length} z ${stanyOgolem.length} stanow-wystapien`,
);
console.log(
  `  (podzial: ${wariantyZmierzone.length} z ${wariantyOgolem.length} wariantow + ${stanyZmierzoneWystapienia.length} z ${stanyOgolem.length} stanow-wystapien = ${pozycjeZmierzone.size} z ${POZYCJE_PAR2.length}; koncepcji stanu zdeduplikowanych: ${koncepcjeStanuZmierzone.size} z ${koncepcjeStanuWszystkie.length})`,
);
console.log(`  PROG_POKRYCIA = ${PROG_POKRYCIA}; pokrycie ${pozycjeZmierzone.size >= PROG_POKRYCIA ? "NA PROGU LUB WYŻEJ" : "PONIŻEJ PROGU"}`);
// Trzy klasy luk liczone OSOBNO. Suma po klasach nie wystarcza:
// klasa "niezbudowane" nie jest luka, tylko czerwona pozycja zakresu, a klasa
// "przyrzad" jest dozwolona tylko z plikiem, wlascicielem i terminem powrotu.
const KLASY_LUK = ["spec", "przyrzad", "niezbudowane"];
const wadyRejestruLuk = [];
const licznikKlas = new Map(KLASY_LUK.map((k) => [k, 0]));
for (const gap of GAPY_JAWNE) {
  const gdzie = `${gap.grupa} "${gap.pozycja}"`;
  if (!KLASY_LUK.includes(gap.klasa)) {
    wadyRejestruLuk.push(`${gdzie}: klasa "${gap.klasa ?? "BRAK"}" spoza zbioru ${KLASY_LUK.join("/")}`);
    continue;
  }
  licznikKlas.set(gap.klasa, licznikKlas.get(gap.klasa) + 1);
  if (gap.klasa === "niezbudowane") {
    wadyRejestruLuk.push(`${gdzie}: klasa "niezbudowane" - produktu nie ma, to czerwona pozycja zakresu, nie luka`);
  }
  if (gap.klasa === "przyrzad") {
    for (const pole of ["plik", "wlasciciel", "termin"]) {
      if (!gap[pole]) wadyRejestruLuk.push(`${gdzie}: klasa "przyrzad" bez pola ${pole}`);
    }
  }
}

if (GAPY_JAWNE.length > 0) {
  console.log("Gapy jawne (nie zmierzone, z powodem i klasa):");
  console.log(`  podzial klas: ${KLASY_LUK.map((k) => `${k}=${licznikKlas.get(k)}`).join(", ")}`);
  for (const gap of GAPY_JAWNE) {
    const ogon = gap.klasa === "przyrzad" ? ` | plik: ${gap.plik} | wlasciciel: ${gap.wlasciciel} | termin: ${gap.termin}` : "";
    console.log(`  ${gap.grupa} "${gap.pozycja}" [${gap.klasa ?? "BRAK KLASY"}]: ${gap.powod}${ogon}`);
  }
}
if (wadyRejestruLuk.length > 0) {
  console.log("WADA REJESTRU LUK - bieg konczy sie kodem 4:");
  for (const w of wadyRejestruLuk) console.log(`  ${w}`);
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
} else if (wadyRejestruLuk.length > 0) {
  // Rejestr luk jest czescia bramki, nie notatka obok niej: wpis klasy
  // "niezbudowane" albo klasa "przyrzad" bez pliku/wlasciciela/terminu
  // konczy bieg czerwono nawet przy pelnym pokryciu.
  kodCalosci = 4;
  console.log(`
kod 4: WADA REJESTRU LUK - ${wadyRejestruLuk.length} wpis(ow) nie spelnia zasad rejestru luk`);
} else {
  kodCalosci = 0;
}
console.log(`\nKOD WYJŚCIA: ${kodCalosci}`);
process.exit(kodCalosci);
