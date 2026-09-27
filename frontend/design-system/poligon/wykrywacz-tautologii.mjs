#!/usr/bin/env node
// Wcześniejsze wersje mierzyły do
// LICZBY podanych przykładów (dwa świadkowie), nie do ARGUMENTU
// zupełności nad przestrzenią kształtów, jakie dopuszcza gramatyka. Ta wersja
// nie próbuje już wymienić skończonej listy przypadków — poniżej stoi ARGUMENT
// w dwóch wymiarach (A: jak da się zapisać asercję, B: jak plik dochodzi do
// arkusza), przy KAŻDYM kształcie zapisane, czy narzędzie go obejmuje, czy
// jest świadomie wyłączony i dlaczego. Tam, gdzie zamknięcie nie jest możliwe
// (bo wymagałoby ogólnej analizy aliasów/przepływu danych, czyli problemu bez
// górnej granicy złożoności), granica jest napisana wprost, nie ukryta za
// pozorną zielenią.
//
// === WYMIAR A — jak da się zapisać asercję ===
//
// A1. `expect(X).M(Y)` — bezpośrednio, M dowolne. OBJĘTE.
// A2. Łańcuch modyfikatorów dowolnej długości i kolejności: `.not`, `.resolves`,
//     `.rejects`, ich powtórzenia i kombinacje (`expect(X).not.resolves.M(Y)`
//     itd.) — OBJĘTE nie przez wyliczenie nazw modyfikatorów, tylko przez
//     ODWIJANIE łańcucha PropertyAccess/ElementAccess w głąb aż do napotkania
//     wywołania, którego callee rozwiązuje się do `expect` (patrz
//     `rdzenExpect`) — domknięcie KONSTRUKCYJNE, nie lista.
// A3. `expect.soft(X)...` / `expect.poll(fn, opts)...` — rozszerzenia vitest.
//     OBJĘTE tym samym odwijaniem (property access na identyfikatorze
//     `expect` przed wywołaniem jest tylko kolejnym ogniwem łańcucha).
// A4. Dostęp do nazwy matchera/modyfikatora przez nawias zamiast kropki:
//     `expect(X)["not"]["toBe"](Y)`. OBJĘTE (ElementAccessExpression
//     traktowany tak samo jak PropertyAccessExpression przy odwijaniu).
// A5. Aliasowany import `expect` (`import { expect as sprawdz } from
//     "vitest"`) oraz globalny `expect` bez importu (vitest.config.ts ma
//     `globals: true`, więc plik może w ogóle nie importować `expect`).
//     OBJĘTE: zbiór `nazwyExpect` zawiera zawsze "expect" plus każdy lokalny
//     alias znaleziony w `import { expect as X } from "vitest"`.
// A6. Niestandardowy matcher zarejestrowany przez `expect.extend({...})` i
//     użyty jako `expect(X).mojMatcher(Y)`. OBJĘTE — nazwa matchera nigdy nie
//     jest sprawdzana, tylko fakt, że łańcuch wywodzi się z `expect`.
// A7. Cieniowanie nazwy `expect` przez niezwiązaną lokalną zmienną/parametr o
//     tej samej nazwie. NIE OBJĘTE świadomie: to dopasowanie po NAZWIE, nie
//     pełna rezolucja symboli — w praktyce w plikach prób tego repo `expect`
//     zawsze jest tym z vitest, ale narzędzie by się pomyliło, gdyby ktoś
//     napisał lokalną funkcję `function expect() {}`. Granica: brak
//     type-checkera/binder w tym narzędziu, tylko AST + dopasowanie nazw.
// A8. Asercja rozbita na wiele instrukcji przez zmienną pośrednią, np.
//     `const e = expect(X); e.not.toBe(Y);` albo `const not = expect(X).not;
//     not.toBe(Y);`, albo przekazanie połowy łańcucha przez PARAMETR funkcji
//     pomocniczej (`function sprawdz(a, b) { expect(a).toBe(b); }
//     sprawdz(X, Y);`). NIE OBJĘTE — i to jest ŚWIADOMA, NAZWANA granica, nie
//     przeoczenie: zamknięcie tego kształtu wymaga ogólnej analizy
//     alias/points-to (referencja może wędrować przez dowolną liczbę zmiennych,
//     pól obiektu, elementów tablicy, zwrotów z funkcji, domknięć) — to
//     problem bez górnej granicy złożoności, nie skończony zbiór wzorców do
//     dopisania. Żadna liczba dodatkowych `if`-ów tego nie zamknie w całości.
// A9. Asercja wewnątrz callbacku iteracyjnego, gdzie wartości pochodzą z
//     PARAMETRÓW callbacku związanych z jakąś tablicą źródłową (`it.each(T)
//     ((a,b) => expect(a).toBe(b))`, `.forEach`, `.map`, `.filter`, `.find`,
//     `.some`, `.every`, `.flatMap`, w tym z destrukturyzacją parametru).
//     OBJĘTE dla tych ośmiu nazw metod plus `it.each`/`test.each`/
//     `describe.each` — każda nazwana wprost niżej (`zbierzGraf`), bo są
//     skończone i należą do biblioteki prób/JS standardowego, nie do
//     dowolnego kodu użytkownika. Inne, niestandardowe funkcje iterujące
//     (własne `forEachWlasny(tablica, cb)`) NIE SĄ objęte — ta sama granica
//     co A8 (przepływ przez parametr funkcji spoza wymienionej listy).
// A10. Destrukturyzacja w deklaracji zmiennej (`const [a] = css.split(...)`,
//     `const {x} = obiekt`). OBJĘTE: każda nazwa związana wzorcem (zagnieżdżonym
//     dowolnie głęboko, z elementami rest) jest powiązana z CAŁYM wyrażeniem
//     inicjalizującym (nadmiarowe, ale bezpieczne w kierunku "ciszej" — patrz
//     niżej "kierunek błędu").
//
// KIERUNEK BŁĘDU tam, gdzie A8/A9/A10 dają przybliżenie zamiast pewności:
// narzędzie wybiera stronę MILCZENIA (nie oznacza asercji jako tautologicznej), a nie
// FAŁSZYWEGO OSKARŻENIA, wszędzie tam, gdzie samo związanie nazwy z drzewem
// jest niepewne, a NIE tam, gdzie związanie jest pewne, ale sama asercja może
// przez to zostać przeoczona — to jest DRUGA nazwana granica: narzędzie może
// mieć fałszywe NEGATYWY (przeoczyć tautologię) w kształtach A7/A8/A9-poza-listą,
// ale dąży do zera fałszywych POZYTYWÓW (sonda FP3) w
// kształtach, które faktycznie rozpoznaje.
//
// === WYMIAR B — jak plik próby dochodzi do arkusza (tokeny.css) ===
//
// B1. WSPÓŁLOKALIZACJA: plik leży w `design-system/tokeny/__tests__/` — tej
//     samej konwencji co CAŁE to repo (`vitest.config.ts`: `**/__tests__/**/
//     *.test.{ts,tsx}`, katalog `__tests__` zawsze OBOK modułu, który testuje,
//     patrz `atomy/*/​__tests__/*.test.tsx`). To PIERWSZORZĘDNA reguła
//     zakresu: KAŻDY plik w tym katalogu jest w zakresie kontroli tokeny.css,
//     NIEZALEŻNIE od tego, JAK wewnątrz dochodzi do treści pliku (ścieżka
//     dosłowna, składana, odczyt katalogu z filtrem, import, wzorzec —
//     wszystko jedno). To zamyka Wymiar B CAŁKOWICIE dla plików idących za
//     konwencją repozytorium — nie przez zgadywanie kształtu ścieżki, tylko
//     przez umowę o położeniu.
// B2. Plik LEŻY GDZIE INDZIEJ w `design-system`, ale i tak dociera do treści
//     `tokeny.css` (np. przez import pomocniczego modułu, który sam robi
//     odczyt). Tu współlokalizacja (B1) NIE POMAGA — DRUGORZĘDNA, NIEDOMKNIĘTA
//     siatka: plik jest oznaczony jako w zakresie, jeśli (a) wywołuje funkcję
//     nazwaną `readFileSync`/`readFile` (dowolne wiązanie/alias/kwalifikacja
//     przez obiekt, patrz `nazwyOdczytuPliku`) ORAZ (b) gdziekolwiek w pliku
//     istnieje literał tekstowy zawierający podciąg "tokeny". To łapie
//     ścieżki dosłowne i składane z literalnych członów, ale ŚWIADOMIE NIE
//     ZAMYKA: odczyt katalogu z filtrem/wzorcem bez literału "tokeny" (dokładnie
//     świadek zmierzony osobno), import wartości już wczytanej przez
//     INNY moduł (ten plik sam nie wywołuje readFileSync), dynamiczny
//     `import(...)`/zapytanie bundlera (`?raw`, `?url` w Vite), `fs.promises`
//     przez inne nazwy, `require("fs").readFileSync(...)` z dynamicznie
//     obliczaną ścieżką. GRANICA WPROST: pełne zamknięcie tego pod-wymiaru
//     wymagałoby albo (i) uruchomienia pliku i podsłuchania prawdziwych wywołań
//     I/O w czasie działania (analiza dynamiczna — nie ma jej tu), albo (ii)
//     pełnej rezolucji modułów i stałych między plikami (analiza
//     międzyproceduralna bez górnej granicy, ten sam rodzaj problemu co A8).
//     Ta siatka jest NAJLEPSZYM WYSIŁKIEM (best-effort), nie dowodem.
//
// Podsumowanie zupełności: Wymiar A jest zamknięty dla A1-A6, A9 (ośmiu
// nazwanych metod) i A10, z jawnie wypisaną i uzasadnioną granicą przy A7/A8/
// A9-poza-listą. Wymiar B jest zamknięty CAŁKOWICIE dla plików idących za
// konwencją repo (B1) i NIEDOMKNIĘTY poza nią (B2, best-effort). To jest
// argument o miejscu granicy, nie twierdzenie o pełnej zupełności — zgodnie z
// zasadą: "uczciwa granica jest wynikiem, zmyślona zupełność jest wadą".
//
// Narzędzie miało 0 wołających (`grep -rn
// wykrywacz-tautologii` poza samym plikiem). Wołający: `npm run
// sprawdz:tautologie` (patrz frontend/package.json) — patrz koniec pliku.
//
// Użycie: node design-system/poligon/wykrywacz-tautologii.mjs [sciezka...]
// Bez argumentów: skanuje cały zakres (Wymiar B). Z argumentami: skanuje
// tylko podane pliki (do zasadzania świadków bez przeszukiwania całego drzewa).

import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative, sep } from "node:path";

const KORZEN = resolve(process.cwd(), "design-system");
const KATALOG_WSPOLOKALIZOWANY = join("tokeny", "__tests__"); // B1

function znajdzPlikiProb(katalog) {
  const wyniki = [];
  for (const wpis of readdirSync(katalog)) {
    if (wpis === "node_modules") continue;
    const sciezka = join(katalog, wpis);
    const st = statSync(sciezka);
    if (st.isDirectory()) {
      wyniki.push(...znajdzPlikiProb(sciezka));
    } else if (/\.test\.(ts|tsx)$/.test(wpis) && sciezka.includes(`${join("__tests__")}`)) {
      wyniki.push(sciezka);
    }
  }
  return wyniki;
}

/** Zbiera wszystkie literały tekstowe (string i template) w pliku. */
function zbierzLiteraly(source) {
  const literaly = [];
  function chodz(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      literaly.push(node.text);
    }
    if (ts.isTemplateExpression(node)) {
      literaly.push(node.head.text);
      for (const span of node.templateSpans) literaly.push(span.literal.text);
    }
    ts.forEachChild(node, chodz);
  }
  chodz(source);
  return literaly;
}

/** Nazwy (lokalne aliasy) zaimportowane z podanych specyfikatorów modułu, dla podanych oryginalnych eksportów. */
function zbierzAliasyImportu(source, specyfikatory, oryginalneNazwy) {
  const aliasy = new Set(oryginalneNazwy); // gołe użycie bez importu (np. globalne `expect`) liczy się domyślnie
  function chodz(node) {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      specyfikatory.includes(node.moduleSpecifier.text) &&
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings)
    ) {
      for (const el of node.importClause.namedBindings.elements) {
        const oryginal = el.propertyName?.text ?? el.name.text;
        if (oryginalneNazwy.includes(oryginal)) aliasy.add(el.name.text);
      }
    }
    ts.forEachChild(node, chodz);
  }
  chodz(source);
  return aliasy;
}

/** Czy wywołanie CZYTA plik: nazwa (po aliasie LUB jako `.readFileSync`/`.readFile` na dowolnym obiekcie) pasuje. */
function jestWywolaniemOdczytu(node, nazwyOdczytu) {
  if (!ts.isCallExpression(node)) return false;
  if (ts.isIdentifier(node.expression) && nazwyOdczytu.has(node.expression.text)) return true;
  if (ts.isPropertyAccessExpression(node.expression) && (node.expression.name.text === "readFileSync" || node.expression.name.text === "readFile")) {
    return true; // B2. pokrywa `fs.readFileSync(...)`, `nodeFs.promises.readFile(...)` itd. po samej nazwie właściwości
  }
  return false;
}

function dotykaOdczytuPliku(wezel, nazwyOdczytu) {
  let znaleziono = false;
  (function szukaj(n) {
    if (jestWywolaniemOdczytu(n, nazwyOdczytu)) znaleziono = true;
    ts.forEachChild(n, szukaj);
  })(wezel);
  return znaleziono;
}

/** Identyfikatory użyte jako WARTOŚCI w wyrażeniu (pomija nazwy właściwości). */
function identyfikatoryWartosci(node, zbior) {
  if (!node) return;
  if (ts.isIdentifier(node)) {
    zbior.add(node.text);
    return;
  }
  if (ts.isPropertyAccessExpression(node)) {
    identyfikatoryWartosci(node.expression, zbior); // pomija .name (właściwość)
    return;
  }
  if (ts.isElementAccessExpression(node)) {
    identyfikatoryWartosci(node.expression, zbior);
    identyfikatoryWartosci(node.argumentExpression, zbior);
    return;
  }
  if (ts.isPropertyAssignment(node)) {
    identyfikatoryWartosci(node.initializer, zbior); // klucz obiektu nie jest referencją do zmiennej
    return;
  }
  if (ts.isShorthandPropertyAssignment(node)) {
    zbior.add(node.name.text);
    return;
  }
  ts.forEachChild(node, (dziecko) => identyfikatoryWartosci(dziecko, zbior));
}

/** A10. wszystkie nazwy związane wzorcem wiązania (Identifier | ArrayBindingPattern | ObjectBindingPattern), dowolnie zagnieżdżonym. */
function nazwyWzorca(nazwaWiazania, zbior) {
  if (!nazwaWiazania) return;
  if (ts.isIdentifier(nazwaWiazania)) {
    zbior.add(nazwaWiazania.text);
    return;
  }
  if (ts.isArrayBindingPattern(nazwaWiazania)) {
    for (const el of nazwaWiazania.elements) {
      if (ts.isBindingElement(el)) nazwyWzorca(el.name, zbior);
    }
    return;
  }
  if (ts.isObjectBindingPattern(nazwaWiazania)) {
    for (const el of nazwaWiazania.elements) {
      nazwyWzorca(el.name, zbior);
    }
    return;
  }
}

// A9. nazwy metod iteracyjnych standardu JS których PARAMETRY callbacku
// wiążemy ze źródłową tablicą (patrz komentarz nagłówka, punkt A9).
const METODY_ITERACYJNE = new Set(["forEach", "map", "filter", "find", "some", "every", "flatMap"]);

/**
 * Buduje graf wiązań nazwa -> węzeł-źródło dla CAŁEGO pliku: deklaracje
 * zmiennych (w tym destrukturyzacja, A10), zmienne pętli for-of/for-in,
 * parametry callbacków metod iteracyjnych i `.each(...)( callback )` (A9),
 * funkcje zwracające/dotykające danych z drzewa, aliasy importów względnych,
 * oraz listę wywołań asercji odwiniętych przez łańcuch modyfikatorów (A1-A6).
 */
function zbierzGraf(source, nazwyExpect) {
  const inicjalizatory = new Map(); // nazwa -> Node (wyrażenie źródłowe)
  const funkcje = new Map(); // nazwa funkcji -> Node (ciało)
  const importyWzgledne = new Set();
  const wywolaniaExpect = []; // { node, xNode, yNodes }

  function powiazParametryZCallbackiem(zrodloExpr, callback) {
    if (!callback || !(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) return;
    for (const param of callback.parameters) {
      const zbior = new Set();
      nazwyWzorca(param.name, zbior);
      for (const nazwa of zbior) inicjalizatory.set(nazwa, zrodloExpr);
    }
  }

  function rdzenExpect(node) {
    // A2-A4. odwija PropertyAccess/ElementAccess w głąb, niezależnie od nazw
    // i długości łańcucha, aż trafi na wywołanie, którego callee to `expect`
    // (ew. po jednym property-access, jak `expect.soft`/`expect.poll`).
    if (ts.isCallExpression(node)) {
      if (jestNazwaExpect(node.expression)) return node;
      return rdzenExpect(node.expression);
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      return rdzenExpect(node.expression);
    }
    return null;
  }
  function jestNazwaExpect(node) {
    if (ts.isIdentifier(node)) return nazwyExpect.has(node.text);
    if (ts.isPropertyAccessExpression(node)) return jestNazwaExpect(node.expression); // expect.soft / expect.poll
    return false;
  }

  function chodz(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const zbior = new Set();
      nazwyWzorca(node.name, zbior); // A10. obejmuje zwykły Identifier i destrukturyzację
      for (const nazwa of zbior) inicjalizatory.set(nazwa, node.initializer);
    }
    if ((ts.isForOfStatement(node) || ts.isForInStatement(node)) && node.initializer) {
      const decl = node.initializer;
      if (ts.isVariableDeclarationList(decl)) {
        for (const d of decl.declarations) {
          const zbior = new Set();
          nazwyWzorca(d.name, zbior);
          for (const nazwa of zbior) inicjalizatory.set(nazwa, node.expression);
        }
      }
    }
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      funkcje.set(node.name.text, node.body);
    }
    // A9. `.each(TABLICA)(callback)` — it.each/test.each/describe.each, oraz
    // `TABLICA.forEach/map/filter/find/some/every/flatMap(callback)`.
    if (ts.isCallExpression(node)) {
      if (
        ts.isCallExpression(node.expression) &&
        ts.isPropertyAccessExpression(node.expression.expression) &&
        node.expression.expression.name.text === "each"
      ) {
        const tablicaZrodlowa = node.expression.arguments[0];
        const callback = node.arguments.find((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
        if (tablicaZrodlowa) powiazParametryZCallbackiem(tablicaZrodlowa, callback);
      } else if (ts.isPropertyAccessExpression(node.expression) && METODY_ITERACYJNE.has(node.expression.name.text)) {
        const tablicaZrodlowa = node.expression.expression;
        const callback = node.arguments.find((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
        powiazParametryZCallbackiem(tablicaZrodlowa, callback);
      }
    }
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      /^\.{1,2}\//.test(node.moduleSpecifier.text) &&
      node.importClause
    ) {
      const klauzula = node.importClause;
      if (klauzula.name) importyWzgledne.add(klauzula.name.text);
      if (klauzula.namedBindings) {
        if (ts.isNamedImports(klauzula.namedBindings)) {
          for (const el of klauzula.namedBindings.elements) importyWzgledne.add(el.name.text);
        } else if (ts.isNamespaceImport(klauzula.namedBindings)) {
          importyWzgledne.add(klauzula.namedBindings.name.text);
        }
      }
    }
    // A1-A6. każde CallExpression sprawdzane jako POTENCJALNY koniec łańcucha
    // asercji — rdzenExpect(node.expression) inny niż null i różny od samego
    // node oznacza, że node JEST wywołaniem matchera na końcu łańcucha.
    if (ts.isCallExpression(node)) {
      const rdzen = rdzenExpect(node.expression);
      if (rdzen && rdzen !== node) {
        wywolaniaExpect.push({ node, xNode: rdzen.arguments[0], yNodes: [...node.arguments] });
      }
    }
    ts.forEachChild(node, chodz);
  }
  chodz(source);
  return { inicjalizatory, funkcje, importyWzgledne, wywolaniaExpect };
}

/**
 * Domknięcie do punktu stałego: które nazwy (zmienne I funkcje) są "z drzewa"
 * — ich wartość zależy od realnej treści plików w repo, nie tylko od
 * literałów napisanych w tym pliku próby.
 */
function wyliczZDrzewa(inicjalizatory, funkcje, importyWzgledne, nazwyOdczytu) {
  const zDrzewa = new Set(importyWzgledne); // import z innego pliku = z drzewa od razu
  const funkcjeZDrzewa = new Set();

  for (const [nazwa, wezel] of inicjalizatory) {
    if (dotykaOdczytuPliku(wezel, nazwyOdczytu)) zDrzewa.add(nazwa);
  }
  for (const [nazwa, cialo] of funkcje) {
    if (dotykaOdczytuPliku(cialo, nazwyOdczytu)) funkcjeZDrzewa.add(nazwa);
  }

  let zmiana = true;
  let iteracje = 0;
  while (zmiana && iteracje < 25) {
    zmiana = false;
    iteracje++;
    for (const [nazwa, wezel] of inicjalizatory) {
      if (zDrzewa.has(nazwa)) continue;
      const uzyte = new Set();
      identyfikatoryWartosci(wezel, uzyte);
      for (const u of uzyte) {
        if (zDrzewa.has(u) || funkcjeZDrzewa.has(u)) {
          zDrzewa.add(nazwa);
          zmiana = true;
          break;
        }
      }
    }
    for (const [nazwa, cialo] of funkcje) {
      if (funkcjeZDrzewa.has(nazwa)) continue;
      const uzyte = new Set();
      identyfikatoryWartosci(cialo, uzyte);
      for (const u of uzyte) {
        if (zDrzewa.has(u) || funkcjeZDrzewa.has(u)) {
          funkcjeZDrzewa.add(nazwa);
          zmiana = true;
          break;
        }
      }
    }
  }
  for (const f of funkcjeZDrzewa) zDrzewa.add(f);
  return zDrzewa;
}

function jestWspolokalizowany(sciezka) {
  return sciezka.split(sep).join("/").includes(KATALOG_WSPOLOKALIZOWANY.split(sep).join("/"));
}

function przeanalizujPlik(sciezka) {
  const tekst = readFileSync(sciezka, "utf-8");
  const source = ts.createSourceFile(sciezka, tekst, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const nazwyExpect = zbierzAliasyImportu(source, ["vitest"], ["expect"]); // A5
  const nazwyOdczytu = zbierzAliasyImportu(source, ["node:fs", "fs"], ["readFileSync", "readFile"]); // B2 alias

  // Wymiar B: B1 (współlokalizacja) domyka CAŁKOWICIE; B2 (heurystyka) jest
  // siatką najlepszego wysiłku dla plików leżących gdzie indziej.
  const wspolokalizowany = jestWspolokalizowany(sciezka);
  let wZakresie;
  let powodZakresu;
  if (wspolokalizowany) {
    wZakresie = true;
    powodZakresu = "B1. współlokalizowany z tokeny.css (design-system/tokeny/__tests__/)";
  } else {
    const literaly = zbierzLiteraly(source);
    const czytaPlik = dotykaOdczytuPliku(source, nazwyOdczytu);
    const wskazujeTokeny = literaly.some((l) => l.includes("tokeny"));
    wZakresie = czytaPlik && wskazujeTokeny;
    powodZakresu = wZakresie ? 'B2. czyta plik + literał "tokeny" (siatka najlepszego wysiłku, patrz nagłówek)' : null;
  }

  if (!wZakresie) {
    return { sciezka, wZakresie: false, asercjeTautologiczne: [] };
  }

  const { inicjalizatory, funkcje, importyWzgledne, wywolaniaExpect } = zbierzGraf(source, nazwyExpect);
  const zDrzewa = wyliczZDrzewa(inicjalizatory, funkcje, importyWzgledne, nazwyOdczytu);

  const asercjeTautologiczne = [];
  for (const { node, xNode, yNodes } of wywolaniaExpect) {
    const uzyte = new Set();
    identyfikatoryWartosci(xNode, uzyte);
    for (const y of yNodes) identyfikatoryWartosci(y, uzyte);
    const dotykaDrzewa = [...uzyte].some((nazwa) => zDrzewa.has(nazwa));
    if (!dotykaDrzewa) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());
      asercjeTautologiczne.push({ linia: line + 1, tekst: node.getText().slice(0, 120) });
    }
  }

  return { sciezka, wZakresie: true, powodZakresu, asercjeTautologiczne };
}

function main() {
  const argi = process.argv.slice(2);
  const pliki = argi.length > 0 ? argi.map((p) => resolve(p)) : znajdzPlikiProb(KORZEN);

  console.log(`Plikow przeszukanych: ${pliki.length}`);
  let wZakresieLiczba = 0;
  let lacznaLiczbaAsercjiTautologicznych = 0;
  for (const plik of pliki) {
    const wynik = przeanalizujPlik(plik);
    const wzgledna = relative(process.cwd(), wynik.sciezka);
    if (!wynik.wZakresie) {
      console.log(`  POZA ZAKRESEM: ${wzgledna}`);
      continue;
    }
    wZakresieLiczba++;
    console.log(`  W ZAKRESIE (${wynik.powodZakresu}): ${wzgledna}`);
    if (wynik.asercjeTautologiczne.length === 0) {
      console.log(`    asercji tautologicznych: 0`);
    } else {
      for (const a of wynik.asercjeTautologiczne) {
        console.log(`    tautologia, linia ${a.linia}: ${a.tekst}`);
        lacznaLiczbaAsercjiTautologicznych++;
      }
    }
  }
  console.log(`\nPlikow w zakresie: ${wZakresieLiczba}`);
  console.log(`LACZNIE asercji tautologicznych: ${lacznaLiczbaAsercjiTautologicznych}`);
  process.exit(lacznaLiczbaAsercjiTautologicznych > 0 ? 1 : 0);
}

main();
