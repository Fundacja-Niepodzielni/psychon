#!/usr/bin/env node
// Przyrząd pomiarowy: margines kontrastu kolorów stanu (sukces/ostrzeżenie/
// błąd/informacja) i koloru głównego, na wszystkich realnych tłach, na
// jakich te pary naprawdę żyją w interfejsie — kontynuacja wcześniejszego
// śledztwa w sprawie kontrastu kolorów stanu.
//
// TO JEST TERAZ NAPRAWDĘ KONTROLA, NIE TYLKO POMIAR:
//   - Kończy się kodem 3 (ZMIERZONE NARUSZENIE), gdy którakolwiek para/tło
//     poniżej progu nie jest jawnie zarejestrowana w ZASTANE_ODSTĘPSTWA ani
//     w ODKRYTE_POMIAREM_TYMCZASOWE niżej.
//   - Kończy się kodem 3 też wtedy, gdy wpis w którymkolwiek z tych dwóch
//     rejestrów jest już NIEPRAWDZIWY (para się poprawiła powyżej progu) —
//     rejestr, którego nikt nie musi utrzymywać w prawdzie, gnije w tydzień.
//   - Kończy się kodem 0 tylko wtedy, gdy pomiar się odbył I każda zmierzona
//     para/tło jest powyżej progu ALBO jest świeżym, prawdziwym wpisem w
//     jednym z rejestrów.
//   - Dwa rejestry, nie jeden, i to naumyślnie: ZASTANE_ODSTĘPSTWA to
//     świadomie zaakceptowane odstępstwa; ODKRYTE_POMIAREM_TYMCZASOWE to
//     świeże odkrycia samego rozszerzenia pomiaru (para × tło, o której
//     wcześniej nikt nie wiedział, bo nikt jej nie mierzył) — stan
//     tymczasowy, nie zaakceptowany, czekający na decyzję o odcieniu.
//
// KODY STEROWANE TEGO PRZYRZĄDU, DOKŁADNIE TRZY — {0, 2, 3}:
//   0 = zaliczony: pomiar się odbył i nie ma naruszeń (patrz punkty wyżej).
//   2 = NIE ZMIERZONO, z nazwaną przyczyną w stderr. Zmierzone dziś kształty,
//       każdy odtwarzalny osobnym, konkretnym poleceniem uruchomienia:
//       plik CSS nieodczytany (`readFileSync` rzuca), blok tokenów
//       `--psy-*` nieznaleziony w tym pliku (zero dopasowań wzorca), zbiór
//       par do pomiaru pusty, pojedynczy token wymagany do zbudowania pary
//       albo tła brakujący (`brak tokenu --X w globals.css`), zbiór par/teł
//       faktycznie zwróconych przez `zbudujPary`/`zbudujTla` nie zgadza się
//       z jawnie zadeklarowaną, osobną listą znaną (`ETYKIETY_PAR_ZNANE` /
//       `NAZWY_TEL_ZNANE`, sprawdzane przez `sprawdzWzgledemZnanejListy` —
//       patrz komentarz tam: to jest źródło INNE niż pętla, która potem
//       liczy macierz), tylko jeden z `--para`/`--tlo` podany zamiast obu
//       naraz, nieznana etykieta przekazana przez `--para`, niepoprawny
//       zapis koloru hex w `--tlo`,
//       nieznaleziony token do podmiany przez `--nadpisz` (włącznie z
//       nazwą zawierającą metaznak RegExp — taka nazwa jest dziś szukana
//       DOSŁOWNIE, patrz `escapujMetaznakiRegex`, więc po prostu nie
//       zostaje znaleziona, nie wywraca procesu), oraz (tylko przy
//       `--self-test`) kontrola niezależna, która nie przeszła — w każdym
//       z tych przypadków rzetelny pomiar SIĘ NIE ODBYŁ, więc nawet
//       gdyby jakaś liczba wypadła, nie ma jej czym podeprzeć. Nieobjęte:
//       każdy inny sposób, w jaki wejście może być zepsute (np. wartość w
//       `--nadpisz=--token=WARTOŚĆ` niebędąca poprawnym zapisem koloru hex),
//       jest nienazwany tutaj dopóki nie zostanie zmierzony i dopisany do
//       tej listy.
//   3 = ZMIERZONE NARUSZENIE — pomiar się odbył w całości i albo znalazł
//       parę/tło poniżej progu spoza obu rejestrów, albo wpis w którymś z
//       rejestrów jest już nieprawdziwy; lista jest w stderr poniżej.
// Kod spoza {0,2,3} = narzędzie nie doszło do końca; przyczyna w stderr,
// jeżeli środowisko ją wypisało. Ten zbiór należy do środowiska
// uruchomieniowego (sygnał, nieobsłużony wyjątek, ubicie procesu) — nie
// jest tu wyliczany, bo żadna lista nie byłaby zupełna. Jedyna dotąd
// zmierzona droga, którą ten plik SAM potrafił wywołać taki kod (metaznak w
// nazwie tokenu `--nadpisz` wywalał `new RegExp` wyjątkiem SyntaxError, co
// dawało kod 1 z Node) jest dziś zamknięta — patrz kod 2 wyżej. To nie jest
// obietnica, że kod 1 (ani inny) nie pojawi się z jakiejś jeszcze
// niezmierzonej ścieżki w tym pliku albo z samego środowiska.
//
// Skąd biorą się liczby:
//   - Kolory NIE są tu wpisane na sztywno — skrypt czyta je z app/globals.css
//     (blok `--psy-*`) w chwili uruchomienia. Zmiana tokenu w CSS od razu
//     zmienia wynik następnego uruchomienia.
//   - Wzór kontrastu WCAG (jasność względna sRGB -> liniowe, (L1+.05)/(L2+.05))
//     i składanie kolorów półprzezroczystych (`#rrggbbaa`) nad tłem to ten
//     sam kod, który był ręcznie zweryfikowany względem axe-core
//     (zgodność do 3 miejsc po przecinku).
//   - `--self-test` (patrz niżej) NIE porównuje już dwóch wywołań tej samej
//     funkcji z tego samego pliku (to było sprawdzanie, czy 2×2=2×2) —
//     porównuje wynik `kontrast()` z tego pliku z wartościami wyliczonymi
//     NIEZALEŻNIE (osobnym narzędziem, poza tym kodem), wpisanymi na sztywno
//     jako `KONTROLA_NIEZALEZNA` niżej, z komentarzem skąd każda pochodzi.
//
// Pełny iloczyn par × teł:
//   Jest 11 par i 5 teł, na jakich te pary naprawdę żyją w interfejsie
//   (patrz `zbudujTla` — każde tło ma cytat z konkretnego pliku/linii) —
//   czyli 55 możliwych pomiarów. Ten skrypt liczy WSZYSTKIE 55: albo
//   drukuje wynik, albo wyklucza kombinację JAWNIE z podanym powodem
//   (`WYKLUCZENIA` niżej, z powodem przy każdym wpisie — patrz
//   `POWOD_ALERT_KONTENERY` i `POWOD_TEXTLINK_WASKI_ZAKRES` tam). Strażnikiem nowej pary
//   albo nowego tła bez decyzji NIE jest suma zmierzone+wykluczone==iloczyn
//   w `zbudujPelnaMacierz` — ta suma z definicji tej samej pętli nie może
//   się nie zgadzać (każda kombinacja trafia do dokładnie jednej z dwóch
//   list), więc to była tożsamość arytmetyczna, nie kontrola. Strażnikiem
//   jest `sprawdzWzgledemZnanejListy`: porównuje etykiety/nazwy faktycznie
//   zwrócone przez `zbudujPary`/`zbudujTla` z listą zadeklarowaną ręcznie i
//   OSOBNO (`ETYKIETY_PAR_ZNANE`, `NAZWY_TEL_ZNANE`) — dopisanie tła w
//   `zbudujTla` bez dopisania go też tam (i decyzji zmierz/wyklucz w
//   `WYKLUCZENIA`) daje dziś kod 2, nie ciche zmierzenie.
//
// Dodatkowe tło, wcześniej pominięte: `--psy-bg-grey` (#f5f5f5), podkład
// najechania, płaski (bez przezroczystości) — inny niż podkład najechania
// wiersza tabeli (`--psy-row-hover`, półprzezroczysty fiolet na bieli).
// Potwierdzone w kodzie: components/organisms/NotificationList.tsx
// (`hover:bg-grey` na przycisku, w środku odznaka informacyjna),
// components/molecules/QueueRow.tsx (`hover:bg-grey`, prop `meta` przyjmuje
// `Badge`). Wcześniej przyrząd o tym tle nie wiedział — teraz jest w
// `zbudujTla` na równi z resztą.
//
// Użycie:
//   node scripts/pomiar-marginesu-kontrastu.mjs
//     — pełna macierz par × teł, ocena wobec progu i rejestru zastanych
//     odstępstw, kod wyjścia 0 albo 3 jak opisano wyżej (2, jeśli pomiar
//     się nie odbył — patrz „KODY STEROWANE" wyżej).
//   node scripts/pomiar-marginesu-kontrastu.mjs --self-test
//     — jak wyżej, plus kontrola niezależna (patrz `KONTROLA_NIEZALEZNA`):
//     kończy się kodem 2 = NIE ZMIERZONO, jeśli rachunek w tym pliku
//     odbiega od wartości znanych z góry (obliczonych innym narzędziem) —
//     wtedy zmierzonym marginesom nie ma czego wierzyć.
//   node scripts/pomiar-marginesu-kontrastu.mjs --para="Odznaka: sukces" --tlo=#f9f8f6
//     — jedna, konkretna para na PODANYM realnym tle (poza macierzą główną,
//     do doraźnego sprawdzenia „co by było, gdyby"). Oba argumenty wymagane
//     RAZEM — podanie tylko `--para` albo tylko `--tlo` kończy się kodem 2 =
//     NIE ZMIERZONO (niepełne polecenie, nie spada cicho do pełnej macierzy).
//     Przy obu podanych i trafionej etykiecie nie wpływa na kod wyjścia
//     (kończy proces naturalnie, kod 0); przy nieznanej etykiecie albo
//     niepoprawnym zapisie `--tlo` kończy się kodem 2 = NIE ZMIERZONO.
//
// Umiejscowienie: obok istniejących narzędzi pomiarowych frontu
// (scripts/pomiar-kc.sh, scripts/check-lock-libc.mjs) — ten sam katalog,
// ta sama konwencja nazywania ("pomiar-*").
//
// Ten nagłówek celowo NIE liczy dziś miejsc/odwołań/wołających w drzewie
// (np. "ile plików wspomina ten skrypt") prozą: taka liczba się starzeje i
// nic w bramce jej nie odświeża ani nie pilnuje. Kto potrzebuje aktualnej
// liczby, niech uruchomi polecenie sam, z korzenia repo, np.:
// `grep -rln "pomiar-marginesu-kontrastu\|pomiar:kontrast-statusow" .`

// ---------------------------------------------------------------------------
// DODATEK: tekst treści na tłach powierzchni, strumień NOWEGO FRONTU
// (design-system/tokeny/tokeny.css: --ink/--text/--muted/--subtle na
// --bg/--card/--card-warm/--grey, oba motywy) — używany realnie w
// design-system/atomy/molekuly, mimo komentarza w tamtym pliku ("osobny
// strumień") sugerującego, że jeszcze nie jest podpięty. STARY front
// (app/globals.css, --psy-*) jest świadomie POZA zakresem tego dodatku —
// decyzja właściciela (D-64 p.3, D-91): drzewo zastępowane ekranami T1–T3,
// nie mierzone i nie naprawiane tutaj.
// Kod 4 (KOD_NARUSZENIE_TEKSTU niżej), gdy choć jedna zmierzona para tego
// strumienia jest poniżej progu 4,5:1. Implementacja i uzasadnienia niżej
// (szukaj "nowy front"). Ta część NIE zmienia ani nie zastępuje niczego z
// części statusowej wyżej (11 par, 5 teł, kody 0/2/3) — tylko dodaje kroki do
// main() i nowe funkcje.
// ---------------------------------------------------------------------------

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SCIEZKA_CSS = fileURLToPath(new URL("../app/globals.css", import.meta.url));
const SCIEZKA_TEGO_PLIKU = fileURLToPath(import.meta.url);

// Patrz "KODY STEROWANE TEGO PRZYRZĄDU" w nagłówku wyżej — te dwie stałe są
// jedynymi miejscami, w których ten plik ŚWIADOMIE wybiera kod niezerowy,
// przez `process.exit(...)` (patrz wykaz wywołań w main() niżej). Każdy inny
// kod (patrz akapit o kodzie spoza {0,2,3} w nagłówku) pochodzi z
// nieobsłużonego błędu w środowisku uruchomieniowym — plik go nie
// "decyduje", tylko mu się przydarza.
const KOD_NIE_ZMIERZONO = 2;
const KOD_NARUSZENIE = 3;

// ---------------------------------------------------------------------------
// Matematyka WCAG — identyczna z ręcznie zweryfikowanym przelicznikiem
// (zgodność z axe-core do 3 miejsc po przecinku).
// ---------------------------------------------------------------------------

function srgbToLin(c) {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function relLum([r, g, b]) {
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}

function kontrast(rgb1, rgb2) {
  const l1 = relLum(rgb1);
  const l2 = relLum(rgb2);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Escapuje znaki specjalne RegExp w tekście z argv, zanim ten tekst wejdzie
 * do `new RegExp(...)`. Bez tego metaznak w nazwie tokenu podanej przez
 * `--nadpisz` (np. `(`, `*`, `[`) wywraca proces wyjątkiem SyntaxError
 * zamiast dać kod 2 z nazwaną przyczyną — patrz `main()`, jedyne miejsce
 * w tym pliku, gdzie wartość z argv trafia do konstrukcji wzorca.
 */
function escapujMetaznakiRegex(tekst) {
  return tekst.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rozkłada zapis hex (`#rgb`, `#rgba`, `#rrggbb` albo `#rrggbbaa`, `#`
 * opcjonalny) na `{r,g,b,a}`. Rzuca dla wszystkiego innego — bez tej
 * kontroli `parseInt` na śmieciu (np. `"zzz"`) cicho daje `NaN`, a `NaN >>
 * 16 & 255` cicho daje `0`: wynik (czarny, bez podstawy) wygląda jak
 * prawdziwy pomiar, tylko nim nie jest.
 */
function hexNaRgba(hex) {
  const bezKrzyzyka = hex.startsWith("#") ? hex.slice(1) : hex;
  if (![3, 4, 6, 8].includes(bezKrzyzyka.length) || !/^[0-9a-fA-F]+$/.test(bezKrzyzyka)) {
    throw new Error(
      `"${hex}" nie jest poprawnym zapisem koloru hex (oczekiwano 3, 4, 6 albo 8 cyfr szesnastkowych, z opcjonalnym "#" na początku)`,
    );
  }
  let h = bezKrzyzyka;
  if (h.length === 3 || h.length === 4) {
    h = h.split("").map((c) => c + c).join("");
  }
  const num = parseInt(h.slice(0, 6), 16);
  const alpha = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255, a: alpha };
}

/** Składa kolor (ewentualnie półprzezroczysty) `fgHex` na nieprzezroczystym tle `bgRgb`. */
function zloz(fgHex, bgRgb) {
  const fg = hexNaRgba(fgHex);
  const a = fg.a;
  return [
    fg.r * a + bgRgb[0] * (1 - a),
    fg.g * a + bgRgb[1] * (1 - a),
    fg.b * a + bgRgb[2] * (1 - a),
  ];
}

// Reguła WCAG "duży tekst": pogrubiony od 18,66px albo dowolny od 24px -> próg 3:1, inaczej 4,5:1.
function prog(rozmiarPx, pogrubiony) {
  const duzy = (pogrubiony && rozmiarPx >= 18.66) || (!pogrubiony && rozmiarPx >= 24);
  return duzy ? 3.0 : 4.5;
}

// ---------------------------------------------------------------------------
// Czytanie tokenów z globals.css (bez wartości na sztywno w tym pliku).
// ---------------------------------------------------------------------------

function wczytajTokeny(tekstCss) {
  const tokeny = {};
  const rx = /--(psy-[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g;
  let m;
  while ((m = rx.exec(tekstCss))) {
    tokeny[m[1]] = m[2];
  }
  // rozmiary tekstu (px) — potrzebne do reguły "duży tekst" wyżej.
  const rxPx = /--(psy-(?:body|small|caption))\s*:\s*(\d+(?:\.\d+)?)px/g;
  const rozmiary = {};
  while ((m = rxPx.exec(tekstCss))) {
    rozmiary[m[1]] = parseFloat(m[2]);
  }
  return { tokeny, rozmiary };
}

function poznajRowHoverNaBieli(tokeny) {
  const biel = [255, 255, 255];
  const rowHoverHex = tokeny["psy-row-hover"] ?? tokeny["psy-violet-dark-06"];
  return zloz(rowHoverHex, biel);
}

// ---------------------------------------------------------------------------
// Definicje par (token tekstu / tło / kontekst) — realne użycia w kodzie:
//   - Badge.tsx warianty success/warning/danger/info/accent są używane
//     wewnątrz Table.tsx — stąd kolumna "po najechaniu" dotyczy ich
//     naprawdę, nie hipotetycznie: Table.tsx nakłada `hover:bg-row-hover`
//     na CAŁY wiersz, więc każda komórka (a więc i odznaka w niej)
//     dziedziczy ten podkład. `Badge` jest też komponentem ogólnym (design
//     system), więc traktowany jest jako ważny na KAŻDYM z pięciu teł
//     niżej — przykładowo (nie wyczerpująco) potwierdzają to
//     app/(administracja)/admin/emails/page.tsx (odznaka statusu wprost na
//     `bg-card-warm`) i components/organisms/NotificationList.tsx (odznaka
//     "info" na `hover:bg-grey`). Kryterium, nie liczba: dopóki `Badge` jest
//     komponentem design-systemu bez własnej listy dozwolonych teł, jest
//     mierzony na wszystkich pięciu; ograniczenie go do podzbioru wymagałoby
//     najpierw takiej listy, nie zliczenia dzisiejszych wystąpień.
//   - Alert.tsx warianty success/info/error — nie żyją w wierszu tabeli
//     (potwierdzone grepem `<Alert` w całym repo: zawsze w karcie/formularzu
//     albo wprost w treści strony przez `ListTemplate`/`ErrorState`, nigdy
//     w komórce `Table.tsx`) — stąd wykluczenie tła "podkład najechania
//     wiersza tabeli" dla wszystkich trzech par `Alert:*` w `WYKLUCZENIA`.
//   - TextLink.tsx tony primary/muted — używany w komórce tabeli i w
//     kartach (patrz `POWOD_TEXTLINK_WASKI_ZAKRES` niżej dla kryterium
//     wykluczenia i polecenia, którym je sprawdzić), nigdy wprost na tle
//     strony, karcie ciepłej ani podkładzie najechania na szarym — stąd
//     wykluczenie tych trzech teł dla wszystkich par `Łącze:*` w
//     `WYKLUCZENIA`.
// ---------------------------------------------------------------------------

function zbudujPary(tokeny, rozmiary, rowHoverNaBieli) {
  const biel = [255, 255, 255];

  const CAPTION = rozmiary["psy-caption"] ?? 13;
  const SMALL = rozmiary["psy-small"] ?? 15;

  const t = (nazwa) => {
    const v = tokeny[nazwa];
    if (!v) throw new Error(`brak tokenu --${nazwa} w globals.css`);
    return v;
  };

  // opis: etykieta / tekst(hex) / tło(hex lub null=karta biała-wprost) / rozmiarPx / pogrubiony / czyWTabeli
  const definicje = [
    ["Odznaka: sukces", t("psy-success"), t("psy-success-bg"), CAPTION, true, true],
    ["Odznaka: ostrzeżenie", t("psy-warning-dark"), t("psy-warning-bg"), CAPTION, true, true],
    ["Odznaka: błąd", t("psy-error"), t("psy-error-bg"), CAPTION, true, true],
    ["Odznaka: informacja", t("psy-info-badge"), t("psy-info-bg"), CAPTION, true, true],
    ["Odznaka: akcent", t("psy-violet-dark"), t("psy-violet-15"), CAPTION, true, true],
    ["Alert: sukces", t("psy-success"), t("psy-success-bg"), SMALL, false, false],
    ["Alert: informacja", t("psy-info-dark"), t("psy-info-bg"), SMALL, false, false],
    ["Alert: błąd", t("psy-error"), t("psy-error-bg"), SMALL, false, false],
    ["Łącze: główny (tone=primary)", t("psy-green-dark"), null, SMALL, false, true],
    ["Łącze: główny po najechaniu na sam link", t("psy-green-deep"), null, SMALL, false, true],
    ["Łącze: przygaszony (tone=muted)", t("psy-text-muted"), null, SMALL, false, true],
  ];

  return definicje.map(([etykieta, textHex, bgHexLubNull, rozmiarPx, pogrubiony, czyWTabeli]) => {
    const tloSpoczynek = bgHexLubNull === null ? biel : zloz(bgHexLubNull, biel);
    const tloNajechanie = !czyWTabeli
      ? tloSpoczynek
      : bgHexLubNull === null
        ? rowHoverNaBieli
        : zloz(bgHexLubNull, rowHoverNaBieli);

    const textRgb = (() => {
      const c = hexNaRgba(textHex);
      return [c.r, c.g, c.b];
    })();

    const kSpoczynek = kontrast(textRgb, tloSpoczynek);
    const kNajechanie = kontrast(textRgb, tloNajechanie);
    const progT = prog(rozmiarPx, pogrubiony);
    const gorszy = Math.min(kSpoczynek, kNajechanie);

    // Surowy kolor tekstu na czystej bieli, BEZ własnego (półprzezroczystego)
    // tła odznaki/alertu — inna liczba niż `kSpoczynek` dla par z własnym
    // tłem (tam tło odznaki jest już wmieszane w białą kartę). Dla par bez
    // własnego tła (łącza) to ta sama wartość co `kSpoczynek`.
    const kSurowyNaBieli = kontrast(textRgb, biel);

    return {
      etykieta,
      textHex,
      textRgb,
      bgHexLubNull,
      tloOpis: bgHexLubNull === null ? "karta biała (bez własnego tła)" : bgHexLubNull,
      czyWTabeli,
      kSpoczynek,
      kNajechanie,
      kSurowyNaBieli,
      prog: progT,
      margines: gorszy - progT,
    };
  });
}

// ---------------------------------------------------------------------------
// Tła — pięć realnych teł, na jakich powyższe pary naprawdę żyją
// w interfejsie. Każde ma cytat z konkretnego pliku, nie zgadywanie.
// ---------------------------------------------------------------------------

function zbudujTla(tokeny, rowHoverNaBieli) {
  const biel = [255, 255, 255];
  const zlozoneNaBieli = (nazwaTokenu) => {
    const hex = tokeny[nazwaTokenu];
    if (!hex) throw new Error(`brak tokenu --${nazwaTokenu} w globals.css (potrzebny do tła pomiaru)`);
    return zloz(hex, biel);
  };

  return [
    {
      nazwa: "Karta biała",
      rgb: biel,
      opis: "bg-card — domyślne tło Card/Table/dialogów, np. components/ui/Card.tsx, components/ui/Table.tsx.",
    },
    {
      nazwa: "Tło strony",
      rgb: zlozoneNaBieli("psy-bg-page"),
      opis: "bg-page — odznaka POZA kartą, wprost na tle strony: components/h07/AdminReliability.tsx (`<li className=\"...bg-page...\">` z odznaką w środku).",
    },
    {
      nazwa: "Podkład najechania wiersza tabeli",
      rgb: rowHoverNaBieli,
      opis: "hover:bg-row-hover na wierszu tabeli, złożony na bieli: components/ui/Table.tsx (`<tr className=\"...hover:bg-row-hover\">`).",
    },
    {
      nazwa: "Karta ciepła",
      rgb: zlozoneNaBieli("psy-bg-card-warm"),
      opis: 'bg-card-warm — nagłówek podglądu e-maila z odznaką statusu: app/(administracja)/admin/emails/page.tsx (`<div className="...bg-card-warm...">` zawiera `<Badge variant={STATUS_VARIANT[...]}>`).',
    },
    {
      nazwa: "Podkład najechania (szary, płaski)",
      rgb: zlozoneNaBieli("psy-bg-grey"),
      opis: "hover:bg-grey — dodane po przeglądzie interfejsu (wcześniej pominięte): components/organisms/NotificationList.tsx (`hover:bg-grey` na przycisku z odznaką informacyjną), components/molecules/QueueRow.tsx (`hover:bg-grey`, prop `meta` przyjmuje `Badge`).",
    },
  ];
}

// ---------------------------------------------------------------------------
// Wykluczenia jawne — kombinacje para × tło, które nie występują
// w interfejsie i których mierzenie nie ma sensu. Każde z konkretnym
// powodem, sprawdzalnym grepem.
// ---------------------------------------------------------------------------

const POWOD_ALERT_KONTENERY =
  "Alert.tsx renderuje się wyłącznie w kartach/formularzach (bg-card) albo wprost w treści strony przez ListTemplate/ErrorState (bg-page) — potwierdzone grepem `<Alert` w całym repo, sprawdzone też pod kątem sąsiedztwa z `bg-grey`/`bg-card-warm`/`hover:bg-row-hover` w tych samych plikach (żadne wystąpienie nie jest w środku takiego kontenera). Nigdy w komórce/wierszu Table.tsx, nigdy w nagłówku podglądu e-maila (bg-card-warm), nigdy w przycisku z hover:bg-grey.";

const POWOD_TEXTLINK_WASKI_ZAKRES =
  'TextLink.tsx renderuje się w komórce tabeli i w karcie (bg-card) — kontekstach z własnym, znanym tłem — nigdy wprost na tle strony, karcie ciepłej ani podkładzie najechania (szary, płaski). Kryterium wykluczenia (nie liczba): zasadne dopóki żadne użycie <TextLink poza components/ui/TextLink.tsx i katalogiem testów nie renderuje się na jednym z tych trzech teł. Sprawdź poleceniem z korzenia repo: `grep -rn "<TextLink" --include=*.tsx . | grep -v components/ui/TextLink.tsx | grep -v __tests__` i porównaj kontekst (tło) każdego trafienia z tłem strony/kartą ciepłą/podkładem najechania na szarym — trafienie w jednym z nich unieważnia to wykluczenie.';

const ETYKIETY_LACZY = [
  "Łącze: główny (tone=primary)",
  "Łącze: główny po najechaniu na sam link",
  "Łącze: przygaszony (tone=muted)",
];

const ETYKIETY_ALERT = ["Alert: sukces", "Alert: informacja", "Alert: błąd"];

const WYKLUCZENIA = [
  ...ETYKIETY_ALERT.flatMap((etykieta) => [
    { etykieta, tlo: "Podkład najechania wiersza tabeli", powod: POWOD_ALERT_KONTENERY },
    { etykieta, tlo: "Karta ciepła", powod: POWOD_ALERT_KONTENERY },
    { etykieta, tlo: "Podkład najechania (szary, płaski)", powod: POWOD_ALERT_KONTENERY },
  ]),
  ...ETYKIETY_LACZY.flatMap((etykieta) => [
    { etykieta, tlo: "Tło strony", powod: POWOD_TEXTLINK_WASKI_ZAKRES },
    { etykieta, tlo: "Karta ciepła", powod: POWOD_TEXTLINK_WASKI_ZAKRES },
    { etykieta, tlo: "Podkład najechania (szary, płaski)", powod: POWOD_TEXTLINK_WASKI_ZAKRES },
  ]),
];

// ---------------------------------------------------------------------------
// Listy ZNANE — zadeklarowane tu, ręcznie, NIEZALEŻNIE od pętli w
// `zbudujPary`/`zbudujTla` niżej. To jest źródło prawdy, wobec którego
// `sprawdzWzgledemZnanejListy` wykrywa nadmiar: jeżeli `zbudujPary` albo
// `zbudujTla` zaczną zwracać etykietę/nazwę, której nie ma na tej liście
// (np. ktoś dopisze szóste tło w `zbudujTla` bez decyzji), to jest dokładnie
// to zdarzenie, które ma dać kod 2 — NIE arytmetyczna zgodność sum (patrz
// historia tego pliku: `zmierzone.length + wykluczone.length === iloczyn`
// jest tożsamością matematyczną, bo pętla wkłada każdą parę do dokładnie
// jednej z dwóch list — nie może zawieść, więc nic nie sprawdzała).
// ---------------------------------------------------------------------------

export const ETYKIETY_PAR_ZNANE = [
  "Odznaka: sukces",
  "Odznaka: ostrzeżenie",
  "Odznaka: błąd",
  "Odznaka: informacja",
  "Odznaka: akcent",
  "Alert: sukces",
  "Alert: informacja",
  "Alert: błąd",
  "Łącze: główny (tone=primary)",
  "Łącze: główny po najechaniu na sam link",
  "Łącze: przygaszony (tone=muted)",
];

export const NAZWY_TEL_ZNANE = [
  "Karta biała",
  "Tło strony",
  "Podkład najechania wiersza tabeli",
  "Karta ciepła",
  "Podkład najechania (szary, płaski)",
];

/**
 * Porównuje etykiety par i nazwy teł faktycznie zwrócone przez
 * `zbudujPary`/`zbudujTla` z listami zadeklarowanymi wyżej — źródłem
 * INNYM niż pętla, która później liczy macierz. Nowa para/tło (nadmiar
 * względem znanej listy) albo zniknięcie znanej pary/tła (niedomiar) —
 * oba rzuca jako błąd, bo oba oznaczają brak jawnej decyzji.
 */
export function sprawdzWzgledemZnanejListy(pary, tla) {
  const etykietyFaktyczne = pary.map((p) => p.etykieta);
  const nazwyTelFaktyczne = tla.map((t) => t.nazwa);

  const nadmiaroweParyPar = etykietyFaktyczne.filter((e) => !ETYKIETY_PAR_ZNANE.includes(e));
  const brakujacePary = ETYKIETY_PAR_ZNANE.filter((e) => !etykietyFaktyczne.includes(e));
  const nadmiaroweTla = nazwyTelFaktyczne.filter((n) => !NAZWY_TEL_ZNANE.includes(n));
  const brakujaceTla = NAZWY_TEL_ZNANE.filter((n) => !nazwyTelFaktyczne.includes(n));

  if (
    nadmiaroweParyPar.length > 0 ||
    brakujacePary.length > 0 ||
    nadmiaroweTla.length > 0 ||
    brakujaceTla.length > 0
  ) {
    const czesci = [];
    if (nadmiaroweParyPar.length > 0) czesci.push(`nowa(e) para(y) spoza ETYKIETY_PAR_ZNANE: ${nadmiaroweParyPar.join(", ")}`);
    if (brakujacePary.length > 0) czesci.push(`znana(e) para(y) z ETYKIETY_PAR_ZNANE już nie istnieje(ą): ${brakujacePary.join(", ")}`);
    if (nadmiaroweTla.length > 0) czesci.push(`nowe tło(a) spoza NAZWY_TEL_ZNANE: ${nadmiaroweTla.join(", ")}`);
    if (brakujaceTla.length > 0) czesci.push(`znane tło(a) z NAZWY_TEL_ZNANE już nie istnieje(ą): ${brakujaceTla.join(", ")}`);
    throw new Error(
      `zbiór par/teł nie zgadza się z jawnie zadeklarowaną listą znaną (ETYKIETY_PAR_ZNANE / NAZWY_TEL_ZNANE): ${czesci.join("; ")}. Dopisz etykietę/nazwę do właściwej listy ZNANE (z decyzją zmierz/wyklucz w WYKLUCZENIA), zanim to tło/para wejdzie do pomiaru.`,
    );
  }
}

/**
 * Pełny iloczyn par × teł: dla każdej kombinacji albo liczy kontrast, albo
 * bierze wykluczenie z `WYKLUCZENIA`. Zanim to policzy, `sprawdzWzgledemZnanejListy`
 * porównuje faktyczne pary/tła z listą zadeklarowaną NIEZALEŻNIE od tej
 * pętli (`ETYKIETY_PAR_ZNANE`, `NAZWY_TEL_ZNANE`) — nowa para albo nowe tło
 * bez jawnej decyzji rzuca błąd tam, nie ginie w ciszy. Suma zmierzonych i
 * wykluczonych poniżej zawsze równa się pełnemu iloczynowi z definicji tej
 * pętli (każda kombinacja trafia do dokładnie jednej z dwóch list) — to
 * liczba do raportu, nie kontrola.
 */
export function zbudujPelnaMacierz(pary, tla) {
  sprawdzWzgledemZnanejListy(pary, tla);

  const wynik = [];
  const wykluczone = [];

  for (const p of pary) {
    for (const t of tla) {
      const wykluczenie = WYKLUCZENIA.find((w) => w.etykieta === p.etykieta && w.tlo === t.nazwa);
      if (wykluczenie) {
        wykluczone.push({ etykieta: p.etykieta, tlo: t.nazwa, powod: wykluczenie.powod });
        continue;
      }
      const tloZlozone = p.bgHexLubNull === null ? t.rgb : zloz(p.bgHexLubNull, t.rgb);
      const k = kontrast(p.textRgb, tloZlozone);
      wynik.push({
        etykieta: p.etykieta,
        tlo: t.nazwa,
        kontrast: k,
        prog: p.prog,
        margines: k - p.prog,
      });
    }
  }

  const oczekiwane = pary.length * tla.length;

  return { wynik, wykluczone, oczekiwane };
}

/**
 * Buduje pary i tła PRAWDZIWĄ ścieżką produkcyjną: czyta `app/globals.css`
 * z dysku i przepuszcza go przez te same `wczytajTokeny` / `zbudujPary` /
 * `zbudujTla`, których używa `main()`. Dla próby w drzewie: pozwala
 * sprawdzić `sprawdzWzgledemZnanejListy`/`zbudujPelnaMacierz` na WYNIKU
 * realnych `zbudujPary`/`zbudujTla`, nie na literałach przepisanych ręcznie
 * do pliku testowego — dopisanie tu (w tym pliku) nowej pary albo nowego
 * tła bez wpisania go do `ETYKIETY_PAR_ZNANE`/`NAZWY_TEL_ZNANE` psuje ten
 * import, nie tylko uruchomienie CLI.
 */
export function wczytajProdukcyjneParyITla() {
  const tekstCss = readFileSync(SCIEZKA_CSS, "utf8");
  const { tokeny, rozmiary } = wczytajTokeny(tekstCss);
  const rowHoverNaBieli = poznajRowHoverNaBieli(tokeny);
  const pary = zbudujPary(tokeny, rozmiary, rowHoverNaBieli);
  const tla = zbudujTla(tokeny, rowHoverNaBieli);
  return { pary, tla };
}

// ---------------------------------------------------------------------------
// CZĘŚĆ DRUGA: TEKST TREŚCI NA TLE POWIERZCHNI
// ---------------------------------------------------------------------------

const KOD_NARUSZENIE_TEKSTU = 4;

// Próg 4,5:1 dla WSZYSTKICH tokenów tekstu obu strumieni — NIE zakładane,
// sprawdzone (28.09.2026) poleceniem
// `grep -rn "var(--ink)\|var(--text)\|var(--muted)\|var(--subtle)" design-system --include=*.module.css`
// dla nowego frontu:
//   - --text/--muted/--subtle: wyłącznie konteksty <18,66px pogrubiony i
//     <24px niepogrubiony (np. Text.module.css var(--fs-8)=16px zwykły,
//     Hint/Breadcrumbs var(--fs-11)=13px, Badge var(--fs-11)=13px
//     pogrubiony) — zawsze "tekst zwykły" wg `prog()` wyżej.
//   - --ink: W WIĘKSZOŚCI mały/średni tekst (Button.outline 15px medium,
//     Label 14px medium, Breadcrumbs 13px, CollapsibleSection 15px medium,
//     Notice 14px) ale TEŻ Heading.module.css .stopien1/.stopien2 (30/23/22px,
//     zawsze pogrubiony) — kwalifikuje się tam jako "duży tekst" (próg 3,0).
//     Token barwy nie niesie kontekstu rozmiaru (jedna barwa, wiele użyć) —
//     próg 4,5 przyjęty tu dla WSZYSTKICH użyć --ink jest świadomie
//     surowszy niż wymaga WCAG dla nagłówków, ale jedyny bezpieczny dla
//     pozostałych, mniejszych użyć. Para przechodząca 4,5 przechodzi 3,0 z
//     definicji (4,5>3,0) — nie ma przypadku fałszywego odrzucenia.
// Dla starego frontu (--psy-text-strong/--psy-heading używany w text-h1..h4,
// prawdopodobnie pogrubionych nagłówkach) NIE zgrepowano wyczerpująco każdego
// miejsca użycia (ograniczony budżet czasu) — przyjęto TĘ SAMĄ, surowszą
// regułę 4,5 jako bezpieczny domyślny wybór z tego samego powodu jak wyżej
// (4,5>3,0, nigdy fałszywego odrzucenia), NIE jako potwierdzony pomiarem
// rozmiaru każdego użycia — zgłoszone jawnie jako otwarta luka, nie
// ukryte.
const PROG_TEKSTU_TRESCI = 4.5;

// Zakres zawężony do JEDNEGO strumienia (decyzja właściciela D-64 p.3 i D-91,
// zawężenie utrzymane w kolejnych zmianach tego pliku): stary front
// (app/globals.css, --psy-*) jest zastępowany ekranami T1–T3 i świadomie NIE
// jest tu mierzony ani naprawiany. Ten plik ma dziś TYLKO jeden dodatkowy
// strumień pomiaru tekstu treści — nowy front, design-system/tokeny/tokeny.css
// — poniżej. Nazwa strumienia ("nowy front") zostaje w każdym wierszu wyjścia
// mimo że jest dziś jedynym strumieniem, żeby dopisanie drugiego (gdyby
// decyzja właściciela się zmieniła) nie wymagało przepisywania formatu.

// ---------------------------------------------------------------------------
// nowy front (design-system/tokeny/tokeny.css)
// ---------------------------------------------------------------------------
//
// Wcześniejsza klasyfikacja sprawdzała nazwy odkryte WZGLĘDEM
// listy, ale same PARY budowała z listy — nowy token w tokeny.css (np.
// `--text-probny`) nigdy nie wchodził do mianownika, tylko wywoływał kod 2.
// Poprawka: klasyfikacja jest teraz REGUŁĄ PO PRZEDROSTKU (KORZENIE_* niżej),
// a `zbudujParyTekstuNaPowierzchni` buduje pary z NAZW FAKTYCZNIE ODKRYTYCH i
// zaklasyfikowanych tą regułą — nie z `KORZENIE_*` wprost. Token, którego
// nazwa równa się korzeniowi albo zaczyna się od `${korzeń}-` (np.
// `card-warm` od korzenia `card`, albo `text-probny` od korzenia `text`),
// wchodzi do pomiaru automatycznie, bez zmiany kodu. Wartości (kolory hex)
// NIGDY nie są tu wpisane wprost — czytane z pliku przy każdym uruchomieniu.
//
// Token spoza wszystkich korzeni I spoza `TOKENY_POZA_ZAKRESEM` (z powodem)
// nadal kończy pomiar kodem 2 — to jest dobre i zostaje: odmowa dla NAPRAWDĘ
// niesklasyfikowanej nazwy, nie dla każdej nowej.
//
// `--nadpisz` (patrz `nadpisaniaZArgv` wyżej) NIE działa na ten strumień:
// dotyka wyłącznie app/globals.css (nie czytanego przez tę część —
// zakres zawężony do nowego frontu, patrz komentarz wyżej) — rozszerzenie
// `--nadpisz` na tokeny.css ruszałoby wspólną pętlę w main(), którą może
// dziś równolegle zmieniać inna gałąź (część NIETEKSTOWA, próg 3,0, obrysy).
// Świadek kod 4 dla tego strumienia (opisany niżej) używa zamiast
// tego bezpośredniej, tymczasowej edycji tokeny.css na dysku, cofniętej
// `git checkout` po pomiarze.

const SCIEZKA_TOKENY_CSS = fileURLToPath(
  new URL("../design-system/tokeny/tokeny.css", import.meta.url),
);

// Korzenie nazw — token pasuje, gdy jego nazwa RÓWNA SIĘ korzeniowi albo
// ZACZYNA SIĘ od `${korzeń}-`. `--grey` dołączony do powierzchni, bo zmierzono, że
// Badge.module.css `.neutral`/`.pending` dają
// `background: var(--grey)` z `color: var(--muted)` w środku — realnie
// hostuje tekst treści, potwierdzone grepem
// `grep -n "background: var(--grey)" design-system/atomy/Badge/Badge.module.css`.
const KORZENIE_TEKSTU_NOWY = ["ink", "text", "muted", "subtle"];
const KORZENIE_POWIERZCHNI_NOWY = ["bg", "card", "grey"];

/** `nazwa` pasuje do `korzenie[i]`, gdy jest mu równa albo zaczyna się od
 * `${korzenie[i]}-` — np. "card-warm" pasuje do korzenia "card", "text-probny"
 * (świadek K1/R1) pasuje do korzenia "text". */
function pasujeDoKorzenia(nazwa, korzenie) {
  return korzenie.some((k) => nazwa === k || nazwa.startsWith(`${k}-`));
}

// Powody "poza zakresem" dla nazw, które NIE pasują do żadnego korzenia
// wyżej — każdy sprawdzalny grepem po `var(--<nazwa>)` w
// design-system/**/*.module.css (28.09.2026). `grey` USUNIĘTE stąd i
// przeniesione do KORZENIE_POWIERZCHNI_NOWY (patrz wyżej).
export const TOKENY_POZA_ZAKRESEM = [
  { nazwa: "border", powod: "Obrys, nie barwa tekstu ani tło — zakres równoległej gałęzi (próg 3,0, obrysy)." },
  { nazwa: "border-strong", powod: "Jak wyżej — obrys, zakres równoległej gałęzi." },
  { nazwa: "control", powod: "Obrys kontrolki (np. Input.module.css border) — zakres równoległej gałęzi." },
  {
    nazwa: "invert-bg",
    powod: "Tło odwróconego kontrastu — nie jedna z mierzonych tu powierzchni; brak potwierdzonego grepem użycia tekstu treści na tym tle.",
  },
  { nazwa: "invert-ink", powod: "Barwa tekstu WYŁĄCZNIE na --invert-bg — para własna, poza tym pomiarem." },
  { nazwa: "invert-link", powod: "Łącze na --invert-bg — rola linku, nie tekstu treści." },
  { nazwa: "brand", powod: "Barwa marki/fokusu (outline), nie tekst treści ani tło powierzchni." },
  { nazwa: "brand-tint", powod: "Tło akcentu (np. Notice.module.css .info), nie jedna z powierzchni w zakresie." },
  { nazwa: "link", powod: "Barwa łącza — poza zakresem (tekst treści, nie łącza; łącza mierzy część statusowa)." },
  { nazwa: "primary", powod: "Barwa akcji/przycisku głównego, nie tekst treści na tle powierzchni." },
  { nazwa: "primary-hover", powod: "Jak wyżej, stan najechania przycisku głównego." },
  { nazwa: "green", powod: "Barwa akcentu (np. pasek postępu), nie tekst treści." },
  { nazwa: "green-tint", powod: "Tło akcentu (np. MenuItem.module.css .biezaca), nie jedna z powierzchni w zakresie." },
  { nazwa: "success", powod: "Barwa stanu — pokryta częścią statusową wyżej." },
  { nazwa: "success-bg", powod: "Tło stanu — pokryte częścią statusową." },
  { nazwa: "warn", powod: "Barwa stanu — jak success wyżej." },
  { nazwa: "warn-bg", powod: "Tło stanu — jak success-bg wyżej." },
  { nazwa: "error", powod: "Barwa stanu — jak success wyżej." },
  { nazwa: "error-bg", powod: "Tło stanu — jak success-bg wyżej." },
  { nazwa: "on-primary", powod: "Barwa tekstu WYŁĄCZNIE na --primary — para własna, nie jedna z powierzchni w zakresie." },
];

/** Wycina treść PIERWSZEGO bloku `[data-theme] { ... }` (motyw jasny, domyślny —
 * wartości identyczne z `[data-theme][data-theme="light"]` dziś). Bez zagnieżdżonych
 * `{}` w wartościach tokenów (sprawdzone: żadna wartość w tokeny.css nie
 * zawiera `{`/`}`), więc dopasowanie niezachłanne do pierwszego `}` jest
 * bezpieczne. */
function wytnijBlokJasny(tekstTokenyCss) {
  const m = /\[data-theme\]\s*\{([\s\S]*?)\}/.exec(tekstTokenyCss);
  if (!m) {
    throw new Error(`nie znalazłem bloku "[data-theme] { ... }" (motyw jasny) w ${SCIEZKA_TOKENY_CSS}`);
  }
  return m[1];
}

/** Jak wyżej, dla `@media (prefers-color-scheme: dark) { [data-theme] { ... } }`
 * (motyw ciemny domyślny — wartości identyczne z `[data-theme="dark"]`
 * dziś). */
function wytnijBlokCiemny(tekstTokenyCss) {
  const m =
    /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*\[data-theme\]\s*\{([\s\S]*?)\}\s*\}/.exec(tekstTokenyCss);
  if (!m) {
    throw new Error(
      `nie znalazłem bloku "@media (prefers-color-scheme: dark) { [data-theme] { ... } }" (motyw ciemny) w ${SCIEZKA_TOKENY_CSS}`,
    );
  }
  return m[1];
}

/** Czyta WSZYSTKIE tokeny barw (dowolna nazwa) z podanego fragmentu CSS —
 * źródło nazw: lista par nie jest wpisana ręką, wyprowadzona z tego,
 * co faktycznie stoi w bloku. */
function wczytajTokenyBarwZBloku(blokCss) {
  const tokeny = {};
  const rx = /--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g;
  let m;
  while ((m = rx.exec(blokCss))) {
    tokeny[m[1]] = m[2];
  }
  return tokeny;
}

/** Klasyfikuje KAŻDĄ nazwę z `nazwyOdkryte` (faktycznie odczytane z pliku, nie
 * lista pisana ręką) w dokładnie jedną z trzech ról: tekst / powierzchnia /
 * poza zakresem — regułą po korzeniu nazwy (`pasujeDoKorzenia`) dla dwóch
 * pierwszych, jawnym wpisem z powodem (`rejestrPozaZakresem`) dla trzeciej.
 * Nazwa spoza wszystkich trzech (albo pasująca do korzenia OBU ról naraz —
 * sprzeczność) kończy pomiar kodem 2 w wołającym (`main()`), nie wchodzi do
 * pomiaru po cichu. Zwraca same LISTY NAZW ODKRYTYCH w każdej roli — to z
 * nich (nie z `KORZENIE_*` wprost) buduje pary `zbudujParyTekstuNaPowierzchni`
 * niżej, więc nowy token pasujący do korzenia automatycznie rusza mianownik,
 * bez zmiany kodu.
 *
 * `rejestrPozaZakresem` (domyślnie `TOKENY_POZA_ZAKRESEM`, PEŁNY rejestr) jest
 * drugim, JAWNYM parametrem — nie warunkiem wewnątrz tej funkcji. Produkcja
 * (`zbudujParyTekstuNaPowierzchni` wołane z `main()`) nie podaje go, więc
 * dostaje PEŁNY rejestr i sprawdza go BEZWARUNKOWO, dla KAŻDEJ liczby nazw w
 * `nazwyOdkryte` — 0 obecnych z 20 wpisów rejestru kończy się tak samo jak 19
 * obecnych z 20: rzutem, z nazwami WSZYSTKICH brakujących. Zero progu, zero
 * wyjątku od reguły (poprzedni próg "> połowy rejestru
 * obecna" dawał ciszę przy 10 z 20 i mniej, WŁĄCZNIE z 0 z 20, czyli gdy CAŁY
 * rejestr jest nieaktualny; to była odwrotność celu tej kontroli).
 *
 * Wołający z MAŁYM, SYNTETYCZNYM `nazwyOdkryte` (próba izolowanego bilansu,
 * nie realny arkusz z tokeny.css) podaje WŁASNY, jawnie zadeklarowany
 * `rejestrPozaZakresem` — podzbiór (albo pustą listę), o którym TEN wołający
 * twierdzi, że jest dla niego kompletny. Niepełność danych syntetycznych jest
 * więc biorą na siebie WOŁAJĄCY, nie ukrywa jej cichy próg w produkcji. */
export function wyklasyfikujTokenyTresci(nazwyOdkryte, rejestrPozaZakresem = TOKENY_POZA_ZAKRESEM) {
  const poza = new Set(rejestrPozaZakresem.map((t) => t.nazwa));
  const teksty = [];
  const powierzchnie = [];
  const pozaZakresu = [];
  const sprzeczne = [];
  const niezaklasyfikowane = [];

  for (const nazwa of nazwyOdkryte) {
    const jestTekstem = pasujeDoKorzenia(nazwa, KORZENIE_TEKSTU_NOWY);
    const jestPowierzchnia = pasujeDoKorzenia(nazwa, KORZENIE_POWIERZCHNI_NOWY);
    if (jestTekstem && jestPowierzchnia) {
      sprzeczne.push(nazwa);
    } else if (jestTekstem) {
      teksty.push(nazwa);
    } else if (jestPowierzchnia) {
      powierzchnie.push(nazwa);
    } else if (poza.has(nazwa)) {
      pozaZakresu.push(nazwa);
    } else {
      niezaklasyfikowane.push(nazwa);
    }
  }

  // Wpis w `rejestrPozaZakresem`, którego nazwa zniknęła z `nazwyOdkryte`
  // (token USUNIĘTY z tokeny.css, wpis w rejestrze pozostał) — odpowiednik,
  // dla tego rejestru, tego co część STATUSOWA tego pliku już robi dla
  // ETYKIETY_PAR_ZNANE/NAZWY_TEL_ZNANE w `sprawdzWzgledemZnanejListy`
  // (gałąź "już nie istnieje", patrz tam). Bez tej kontroli taki wpis nie
  // zostawiał dziś ŻADNEGO śladu — ani w wyniku, ani w kodzie wyjścia.
  //
  // BEZWARUNKOWO, bez progu: KAŻDY wpis `rejestrPozaZakresem` bez odpowiednika
  // w `nazwyOdkryte` trafia tu, niezależnie od tego, ile innych wpisów TEGO
  // SAMEGO rejestru jest obecnych — przy rejestrze pełnym (20 wpisów, domyślny
  // parametr, ścieżka produkcyjna) i 0 obecnych to 20 nazw w komunikacie, nie
  // cisza. Zestaw syntetyczny, dla którego pełny 20-wpisowy rejestr NIE jest
  // właściwym punktem odniesienia (próba bilansu, dane budowane w izolacji),
  // podaje WŁASNY `rejestrPozaZakresem` w drugim argumencie (patrz JSDoc
  // funkcji wyżej i próba K3/K1, dane syntetyczne, w pliku
  // __tests__/pomiar-marginesu-kontrastu-nowy-front-swiadek.test.ts) — to ten
  // wołający deklaruje, jakiego podzbioru rejestru oczekuje, i bierze na
  // siebie odpowiedzialność za jego kompletność względem własnych danych.
  const brakujaceWRejestrzePozaZakresem = rejestrPozaZakresem.filter((t) => !nazwyOdkryte.includes(t.nazwa));

  if (sprzeczne.length > 0 || niezaklasyfikowane.length > 0 || brakujaceWRejestrzePozaZakresem.length > 0) {
    const czesci = [];
    if (sprzeczne.length > 0)
      czesci.push(
        `token(y) pasujące jednocześnie do korzenia tekstu I powierzchni (sprzeczna klasyfikacja): ${sprzeczne.join(", ")}`,
      );
    if (niezaklasyfikowane.length > 0)
      czesci.push(
        `token(y) barwy spoza znanych korzeni (KORZENIE_TEKSTU_NOWY / KORZENIE_POWIERZCHNI_NOWY) i spoza TOKENY_POZA_ZAKRESEM: ${niezaklasyfikowane.join(", ")}`,
      );
    if (brakujaceWRejestrzePozaZakresem.length > 0)
      czesci.push(
        `wpis(y) TOKENY_POZA_ZAKRESEM bez odpowiednika w arkuszu (token usunięty z tokeny.css, wpis w rejestrze pozostał — usuń wpis albo przywróć token, zanim to wejdzie do pomiaru): ${brakujaceWRejestrzePozaZakresem.map((t) => `--${t.nazwa}`).join(", ")}`,
      );
    throw new Error(
      `zbiór tokenów barw w tokeny.css nie da się jednoznacznie zaklasyfikować: ${czesci.join("; ")}. Dopisz nazwę do właściwego korzenia (jeśli to wariant tekstu/powierzchni) albo do TOKENY_POZA_ZAKRESEM z powodem, zanim ten token wejdzie do pomiaru.`,
    );
  }

  return { teksty, powierzchnie, pozaZakresu };
}

/** Pełny iloczyn: token tekstu × token powierzchni × motyw (jasny/ciemny),
 * nowy front — z NAZW FAKTYCZNIE ODKRYTYCH w tokeny.css i zaklasyfikowanych
 * przez `wyklasyfikujTokenyTresci` wyżej (nie z listy pisanej ręką). Bez
 * osobnego mechanizmu wykluczeń par: wcześniejsza wersja miała `WYKLUCZENIA_TEKSTU_NOWY`
 * zawsze pustą — martwą gałąź, której klucze (tekst/powierzchnia/motyw) nie
 * pasowały nawet do kształtu użytego w części statusowej (etykieta/tlo) i
 * której nikt nigdy nie wykonał — usunięta, nie
 * "naprawiona bez użycia": jeśli realna potrzeba wykluczenia pary nowego
 * frontu się pojawi, wraca razem z pierwszym prawdziwym wpisem i świadkiem,
 * nie jako pusty rusztunek.
 *
 * `rejestrPozaZakresem` (domyślnie `TOKENY_POZA_ZAKRESEM`, PEŁNY) przechodzi
 * WPROST do `wyklasyfikujTokenyTresci` niżej — patrz JSDoc tam. Produkcja
 * (wołanie z `main()`) nie podaje go: dostaje pełny rejestr, sprawdzany
 * bezwarunkowo. Próba z syntetycznym `tokenyMotywow` podaje własny. */
export function zbudujParyTekstuNaPowierzchni(tokenyMotywow, rejestrPozaZakresem = TOKENY_POZA_ZAKRESEM) {
  const nazwyJasny = Object.keys(tokenyMotywow.jasny);
  const nazwyCiemny = Object.keys(tokenyMotywow.ciemny);
  if (nazwyJasny.length !== nazwyCiemny.length || nazwyJasny.some((n) => !nazwyCiemny.includes(n))) {
    throw new Error(
      `zestaw tokenów barw motywu ciemnego różni się od jasnego w tokeny.css: jasny ma ${nazwyJasny.length} (${nazwyJasny.join(", ")}), ciemny ma ${nazwyCiemny.length} (${nazwyCiemny.join(", ")}).`,
    );
  }

  const {
    teksty: nazwyTekstu,
    powierzchnie: nazwyPowierzchni,
    pozaZakresu,
  } = wyklasyfikujTokenyTresci(nazwyJasny, rejestrPozaZakresem);

  if (nazwyTekstu.length === 0) {
    throw new Error(
      `0 tokenów pasujących do korzeni ${KORZENIE_TEKSTU_NOWY.join("/")} znaleziono w tokeny.css (nowy front, tekst)`,
    );
  }
  if (nazwyPowierzchni.length === 0) {
    throw new Error(
      `0 tokenów pasujących do korzeni ${KORZENIE_POWIERZCHNI_NOWY.join("/")} znaleziono w tokeny.css (nowy front, powierzchnia)`,
    );
  }

  const wynik = [];
  for (const [motyw, tokeny] of [
    ["jasny", tokenyMotywow.jasny],
    ["ciemny", tokenyMotywow.ciemny],
  ]) {
    for (const tekstNazwa of nazwyTekstu) {
      for (const powierzchniaNazwa of nazwyPowierzchni) {
        const etykieta = `--${tekstNazwa} na --${powierzchniaNazwa} (${motyw}, nowy front)`;
        const tekstHex = tokeny[tekstNazwa];
        const powierzchniaHex = tokeny[powierzchniaNazwa];
        if (!tekstHex) throw new Error(`brak tokenu --${tekstNazwa} w tokeny.css (motyw ${motyw})`);
        if (!powierzchniaHex) throw new Error(`brak tokenu --${powierzchniaNazwa} w tokeny.css (motyw ${motyw})`);
        const tekstRgb = (() => {
          const c = hexNaRgba(tekstHex);
          return [c.r, c.g, c.b];
        })();
        const powierzchniaRgb = (() => {
          const c = hexNaRgba(powierzchniaHex);
          return [c.r, c.g, c.b];
        })();
        const k = kontrast(tekstRgb, powierzchniaRgb);
        wynik.push({
          etykieta,
          kontrast: k,
          prog: PROG_TEKSTU_TRESCI,
          margines: k - PROG_TEKSTU_TRESCI,
        });
      }
    }
  }

  const oczekiwanePary = nazwyTekstu.length * nazwyPowierzchni.length * 2;
  return {
    wynik,
    oczekiwanePary,
    liczbaTokenowOdkrytych: nazwyJasny.length,
    liczbaTokenowTekstu: nazwyTekstu.length,
    liczbaTokenowPowierzchni: nazwyPowierzchni.length,
    liczbaTokenowPozaZakresem: pozaZakresu.length,
    nazwyPozaZakresem: pozaZakresu,
  };
}

/** Buduje tokeny motywów PRAWDZIWĄ ścieżką produkcyjną — czyta tokeny.css z
 * dysku (mirror `wczytajProdukcyjneParyITla` wyżej, część statusowa). */
export function wczytajProdukcyjneTokenyTresci() {
  const tekstTokenyCss = readFileSync(SCIEZKA_TOKENY_CSS, "utf8");
  const jasny = wczytajTokenyBarwZBloku(wytnijBlokJasny(tekstTokenyCss));
  const ciemny = wczytajTokenyBarwZBloku(wytnijBlokCiemny(tekstTokenyCss));
  return { jasny, ciemny };
}

// ---------------------------------------------------------------------------
// Pary dodatkowe, nowy front — dwie konkretne, nazwane pary zostawione jako
// otwarty kod 2 przy przeglądzie paska postępu, domykane tu pomiarem (decyzja
// właściciela, ustalona przy przeglądzie paska postępu):
//   - `--border-strong` na `--grey` (ciemny), próg 3,0 — to OBRYS, nie tekst
//     treści (`--border-strong` zostaje w TOKENY_POZA_ZAKRESEM, zakres
//     równoległej gałęzi). Wpis niżej jest ŚWIADOMIE WĄSKIM, NAZWANYM
//     wyjątkiem dla tej jednej pary — NIE przenosi `border-strong` do
//     KORZENIE_TEKSTU_NOWY/KORZENIE_POWIERZCHNI_NOWY i nie zmienia żadnej
//     klasyfikacji wyżej.
//   - `--subtle` na `--card-warm` (ciemny), próg 4,5 — już policzona w
//     iloczynie tekst×powierzchnia wyżej (KORZENIE_TEKSTU_NOWY ×
//     KORZENIE_POWIERZCHNI_NOWY); wypisana tu PONOWNIE pod jawną,
//     wyszukiwalną nazwą, żeby obie ciasne pary z paska postępu były widoczne
//     w jednym miejscu wyniku bez przeszukiwania macierzy 4×4×2.
// Liczone TĄ SAMĄ matematyką (`kontrast()`/`hexNaRgba`) z TYCH SAMYCH
// tokenów, czytanych raz przez `wczytajProdukcyjneTokenyTresci` — żadna
// wartość koloru nie jest tu wpisana na sztywno. Barwy NIE są tu poprawiane:
// margines/próg poniżej to znalezisko dla osobnego strumienia wyglądu.
const PARY_DODATKOWE_NOWY_FRONT = [
  {
    tekst: "border-strong",
    powierzchnia: "grey",
    motyw: "ciemny",
    prog: 3.0,
    opis: "obrys, nie tekst treści — próg 3,0, wyjątek nazwany, nie reguła",
  },
  {
    tekst: "subtle",
    powierzchnia: "card-warm",
    motyw: "ciemny",
    prog: PROG_TEKSTU_TRESCI,
    opis: "już w iloczynie tekst×powierzchnia wyżej, wypisana tu ponownie pod jawną nazwą",
  },
];

/** Mierzy `PARY_DODATKOWE_NOWY_FRONT` z tokenów faktycznie wczytanych z
 * tokeny.css (`tokenyMotywow`, ten sam obiekt co iloczyn tekst×powierzchnia
 * wyżej) — rzuca (kod 2 w main()) gdy któryś z dwóch tokenów pary nie
 * istnieje w danym motywie. */
export function zbudujParyDodatkoweNowegoFrontu(tokenyMotywow) {
  return PARY_DODATKOWE_NOWY_FRONT.map(({ tekst, powierzchnia, motyw, prog: progPary, opis }) => {
    const tokeny = motyw === "jasny" ? tokenyMotywow.jasny : tokenyMotywow.ciemny;
    const tekstHex = tokeny[tekst];
    const powierzchniaHex = tokeny[powierzchnia];
    if (!tekstHex) {
      throw new Error(`brak tokenu --${tekst} w tokeny.css (motyw ${motyw}, para dodatkowa)`);
    }
    if (!powierzchniaHex) {
      throw new Error(`brak tokenu --${powierzchnia} w tokeny.css (motyw ${motyw}, para dodatkowa)`);
    }
    const a = hexNaRgba(tekstHex);
    const b = hexNaRgba(powierzchniaHex);
    const k = kontrast([a.r, a.g, a.b], [b.r, b.g, b.b]);
    return {
      etykieta: `--${tekst} na --${powierzchnia} (${motyw}, nowy front, para dodatkowa: ${opis})`,
      kontrast: k,
      prog: progPary,
      margines: k - progPary,
    };
  });
}

// ---------------------------------------------------------------------------
// Rejestr zastanych odstępstw — pary/tła, które SĄ dziś poniżej progu,
// o których wiemy i które ŚWIADOMIE przepuszczamy. Para spoza tego rejestru
// (i spoza rejestru tymczasowego niżej) poniżej progu = kod niezerowy.
// Wpis, którego para poprawiła się powyżej progu, też daje sygnał (kod
// niezerowy) — jest już nieprawdziwy i trzeba go usunąć.
// ---------------------------------------------------------------------------

const ZASTANE_ODSTEPSTWA = [
  {
    etykieta: "Łącze: główny (tone=primary)",
    tlo: "Podkład najechania wiersza tabeli",
    powod:
      "green-dark na podkładzie najechania wiersza tabeli (link bez własnego tła, w komórce tabeli, wiersz najechany): margines dziś ok. -0,015. Wymaga zmiany odcienia --psy-green-dark albo --psy-row-hover — osobna zmiana, nie zmiana kodu pomiaru.",
  },
];

// ---------------------------------------------------------------------------
// Odkryte pomiarem z 17.09.2026, czekały na decyzję o odcieniu — TYMCZASOWY
// rejestr, celowo osobny od `ZASTANE_ODSTEPSTWA` powyżej. Obie pozycje
// dotyczyły wyłącznie pary "Odznaka: informacja" i zniknęły stąd razem
// z wydzieleniem osobnego tokenu odznaki (--psy-info-badge) i jego
// przyciemnieniem — dokładnie tak, jak zapowiadał komentarz przy każdym
// wpisie. Rejestr zostaje pusty, nie usunięty, żeby ślad decyzji (skąd się
// wzięła pusta lista) był widoczny w historii tego pliku.
// ---------------------------------------------------------------------------

const ODKRYTE_POMIAREM_TYMCZASOWE = [];

/**
 * Ocenia macierz wobec progu i rejestru (zastane odstępstwa + odkryte
 * tymczasowe razem — obie listy pokrywają dziś znany stan). Zwraca dwie
 * listy — obie muszą być puste, żeby przyrząd zakończył się kodem 0.
 */
function ocenProgi(macierz, rejestr) {
  const naruszeniaNiepokryte = [];
  for (const wiersz of macierz) {
    if (wiersz.margines < 0) {
      const wpis = rejestr.find((r) => r.etykieta === wiersz.etykieta && r.tlo === wiersz.tlo);
      if (!wpis) naruszeniaNiepokryte.push(wiersz);
    }
  }

  const nieaktualneWpisyRejestru = [];
  for (const wpis of rejestr) {
    const wiersz = macierz.find((w) => w.etykieta === wpis.etykieta && w.tlo === wpis.tlo);
    if (!wiersz) {
      nieaktualneWpisyRejestru.push({
        ...wpis,
        stan: "para/tło z rejestru nie istnieje już w macierzy pomiaru (zmieniona etykieta, zmienione tło, albo teraz wykluczona) — usuń wpis albo popraw nazwy.",
      });
    } else if (wiersz.margines >= 0) {
      nieaktualneWpisyRejestru.push({
        ...wpis,
        stan: `margines poprawił się do ${wiersz.margines.toFixed(3)} — wpis w rejestrze jest już NIEPRAWDZIWY, usuń go.`,
      });
    }
  }

  return { naruszeniaNiepokryte, nieaktualneWpisyRejestru };
}

// ---------------------------------------------------------------------------
// Kontrola niezależna — ZASTĘPUJE dawny "self-test", który porównywał
// dwa wyniki tej samej funkcji z tego samego pliku (sprawdzanie, czy 2×2 =
// 2×2). Wartości niżej są wyliczone NIEZALEŻNIE od kodu tego pliku — patrz
// komentarz `zrodlo` przy każdej — i wpisane na sztywno jako stałe. Jeśli
// `kontrast()` w tym pliku zacznie liczyć inaczej, ta kontrola ma UPAŚĆ.
// ---------------------------------------------------------------------------

const KONTROLA_NIEZALEZNA = [
  {
    nazwa: "czarny (#000000) na białym (#ffffff)",
    fg: [0, 0, 0],
    bg: [255, 255, 255],
    oczekiwany: 21.0,
    zrodlo:
      "pewność matematyczna z definicji WCAG, nie wymaga narzędzia: L(czarny)=0, L(biel)=1 -> (1+0,05)/(0+0,05) = 21 dokładnie.",
  },
  {
    nazwa: "#767676 na białym (#ffffff)",
    fg: [0x76, 0x76, 0x76],
    bg: [255, 255, 255],
    oczekiwany: 4.542225,
    zrodlo:
      "wyliczone niezależnie od tego pliku: osobny skrypt Python (ten sam wzór WCAG, inna implementacja, uruchomiony raz przy audycie S3, nie w tym repo) — nie wywołanie kontrast() z tego pliku.",
  },
  {
    nazwa: "czerwony (#ff0000) na białym (#ffffff)",
    fg: [255, 0, 0],
    bg: [255, 255, 255],
    oczekiwany: 3.998477,
    zrodlo: "jak wyżej — osobny skrypt Python, niezależny od kodu tego pliku.",
  },
];

function uruchomKontroleNiezalezna() {
  console.log(
    "\n=== --self-test: kontrola wobec wartości wyliczonych NIEZALEŻNIE od kodu przyrządu ===",
  );
  let ok = true;
  for (const przypadek of KONTROLA_NIEZALEZNA) {
    const wynik = kontrast(przypadek.fg, przypadek.bg);
    const roznica = Math.abs(wynik - przypadek.oczekiwany);
    const przeszedl = roznica < 0.005;
    if (!przeszedl) ok = false;
    console.log(
      `${przeszedl ? "OK  " : "BŁĄD"} ${przypadek.nazwa}: przyrząd=${formatuj(wynik)} oczekiwano=${formatuj(przypadek.oczekiwany)} (źródło: ${przypadek.zrodlo})`,
    );
  }
  if (!ok) {
    console.error(
      "\nKONTROLA NIEZALEŻNA NIE PRZESZŁA — rachunek w przyrządzie odbiega od wartości znanych z góry, niezależnie wyliczonych.",
    );
    // Kod wyjścia NIE jest ustawiany tutaj — decyduje o nim main() na końcu,
    // razem z resztą wyniku (patrz `selfTestOk` tam), żeby był dokładnie
    // jeden punkt w tym pliku, który wybiera kod procesu.
    return false;
  }
  console.log(
    "\nKONTROLA NIEZALEŻNA: przeszła — rachunek przyrządu zgadza się z wartościami znanymi z góry.",
  );
  return true;
}

function formatuj(x) {
  return x.toFixed(3);
}

function wypiszMacierz(macierz, wykluczone, oczekiwane) {
  const posortowane = [...macierz].sort((a, b) => a.margines - b.margines);
  console.log(
    "\n=== Margines kontrastu — pełna macierz par × teł (posortowane rosnąco wg marginesu) ===",
  );
  console.log(
    "margines".padEnd(9) + "kontrast".padEnd(10) + "próg".padEnd(7) + "tło".padEnd(38) + "para",
  );
  for (const w of posortowane) {
    console.log(
      formatuj(w.margines).padEnd(9) +
        formatuj(w.kontrast).padEnd(10) +
        w.prog.toFixed(1).padEnd(7) +
        w.tlo.padEnd(38) +
        w.etykieta,
    );
  }

  console.log(`\nWykluczone jawnie (${wykluczone.length}):`);
  for (const w of wykluczone) {
    console.log(`  - ${w.etykieta} × ${w.tlo}\n    powód: ${w.powod}`);
  }

  console.log(
    `\nZmierzone: ${macierz.length} + wykluczone: ${wykluczone.length} = ${macierz.length + wykluczone.length} (pełny iloczyn par × teł: ${oczekiwane}).`,
  );

  const ponizejProgu = macierz.filter((w) => w.margines < 0).length;
  console.log(`Par/teł dziś PONIŻEJ progu (margines < 0): ${ponizejProgu} z ${macierz.length}.`);
  return posortowane;
}

// ---------------------------------------------------------------------------
// Główne wykonanie.
// ---------------------------------------------------------------------------

/** Wyciąga wartość z argv w postaci `--klucz=wartość`. */
function argWartosc(klucz) {
  const przedrostek = `--${klucz}=`;
  const arg = process.argv.find((a) => a.startsWith(przedrostek));
  return arg ? arg.slice(przedrostek.length) : null;
}

/**
 * Wszystkie wystąpienia `--nadpisz=--psy-token=#hex` (może być kilka naraz).
 * Wymaga zapisu w JEDNYM argumencie argv, ze znakiem "=" oddzielającym
 * `--nadpisz` od reszty. `--nadpisz --psy-x=#eee` (spacja zamiast "=") to
 * DWA osobne argumenty argv — pierwszy ("--nadpisz") nie zaczyna się od
 * `--nadpisz=`, więc bez tej kontroli filtr niżej po prostu go pomija: zero
 * nadpisań, pełny, NIENADPISANY pomiar kończy się cicho kodem 0, jakby
 * `--nadpisz` w ogóle nie było na linii poleceń.
 */
function nadpisaniaZArgv() {
  const przedrostek = "--nadpisz=";
  const podobneDoNadpisz = process.argv.filter((a) => a === "--nadpisz" || a.startsWith("--nadpisz"));
  for (const a of podobneDoNadpisz) {
    if (!a.startsWith(przedrostek)) {
      console.error(
        `NIE ZMIERZONO — --nadpisz wymaga zapisu "--nadpisz=--<token>=<wartość>" w JEDNYM argumencie (ze znakiem "="); otrzymano "${a}".`,
      );
      process.exit(KOD_NIE_ZMIERZONO);
    }
  }
  return podobneDoNadpisz
    .map((a) => a.slice(przedrostek.length))
    .map((para) => {
      const i = para.indexOf("=");
      if (i === -1) {
        console.error(
          `NIE ZMIERZONO — --nadpisz=${para}: brak drugiego "=" oddzielającego nazwę tokenu od wartości.`,
        );
        process.exit(KOD_NIE_ZMIERZONO);
      }
      return [para.slice(0, i).replace(/^--/, ""), para.slice(i + 1)];
    });
}

function main() {
  let tekstCssZDysku;
  try {
    tekstCssZDysku = readFileSync(SCIEZKA_CSS, "utf8");
  } catch (err) {
    console.error(`NIE ZMIERZONO — nie udało się odczytać pliku CSS ${SCIEZKA_CSS}: ${err.message}.`);
    process.exit(KOD_NIE_ZMIERZONO);
  }

  // `--nadpisz=--psy-token=#hex` (powtarzalne) — podmiana W PAMIĘCI: liczenie
  // „co by było, gdyby" (np. inny podkład najechania wiersza) PRZEZ TEN SAM
  // przyrząd, zamiast drugą, osobną ścieżką liczenia. Plik na dysku nigdy
  // nie jest dotykany.
  const nadpisania = nadpisaniaZArgv();
  let tekstCss = tekstCssZDysku;
  for (const [nazwa, wartosc] of nadpisania) {
    // Nazwa tokenu pochodzi z argv (`--nadpisz=--<nazwa>=<wartość>`) i może
    // zawierać dowolny tekst, w tym metaznaki RegExp — `escapujMetaznakiRegex`
    // sprawia, że taki tekst jest szukany DOSŁOWNIE, nigdy jako wzorzec.
    // Efekt metaznaku w nazwie: token dosłownie z nawiasem/gwiazdką itd. nie
    // istnieje w CSS, więc trafiamy w gałąź "nie znalazłem" niżej (kod 2),
    // nie w wyjątek.
    const wzorzec = new RegExp(`--${escapujMetaznakiRegex(nazwa)}:\\s*#[0-9a-fA-F]{3,8}\\s*;`);
    if (!wzorzec.test(tekstCss)) {
      console.error(`NIE ZMIERZONO — --nadpisz: nie znalazłem --${nazwa} do podmiany.`);
      process.exit(KOD_NIE_ZMIERZONO);
    }
    // Replacer jako funkcja, nie string: unika interpretacji `$&`/`$1` itd.
    // na wypadek, gdyby `nazwa` albo `wartosc` zawierały znak `$`.
    tekstCss = tekstCss.replace(wzorzec, () => `--${nazwa}: ${wartosc};`);
  }
  if (nadpisania.length > 0) {
    console.log(
      `Uwaga: ${nadpisania.length} token(ów) podmienione W PAMIĘCI na potrzeby tego uruchomienia (${nadpisania.map(([n, w]) => `--${n}=${w}`).join(", ")}). Plik na dysku nietknięty.`,
    );
  }

  const { tokeny, rozmiary } = wczytajTokeny(tekstCss);
  if (Object.keys(tokeny).length === 0) {
    console.error(
      `NIE ZMIERZONO — blok tokenów --psy-* nie został znaleziony w ${SCIEZKA_CSS} (0 dopasowań wzorca --psy-<nazwa>: #hex).`,
    );
    process.exit(KOD_NIE_ZMIERZONO);
  }

  let rowHoverNaBieli;
  let pary;
  try {
    rowHoverNaBieli = poznajRowHoverNaBieli(tokeny);
    pary = zbudujPary(tokeny, rozmiary, rowHoverNaBieli);
  } catch (err) {
    console.error(`NIE ZMIERZONO — ${err.message}.`);
    process.exit(KOD_NIE_ZMIERZONO);
  }
  if (pary.length === 0) {
    console.error("NIE ZMIERZONO — zbiór par do pomiaru jest pusty.");
    process.exit(KOD_NIE_ZMIERZONO);
  }

  const paraNazwa = argWartosc("para");
  const tloParam = argWartosc("tlo");
  if (paraNazwa || tloParam) {
    // Tryb jednej pary na podanym, realnym tle wymaga OBU argumentów naraz —
    // `--para` i `--tlo` razem. Podanie tylko jednego z nich NIE jest błąd
    // walidacji hex (ten jest niżej, na wartości `--tlo`), tylko niepełne
    // polecenie: bez tej kontroli brakująca druga połowa cicho spadała do
    // pełnej macierzy głównej, więc np. literówka w nazwie `--para` (przy
    // podanym `--tlo`) dawała pełny, poprawnie wyglądający raport kodem 0
    // zamiast sygnału, że o cokolwiek proszono, nie zostało to policzone.
    if (!paraNazwa || !tloParam) {
      console.error(
        `NIE ZMIERZONO — tryb jednej pary na podanym tle wymaga OBU argumentów naraz: --para=<etykieta> i --tlo=<hex>. Otrzymano ${paraNazwa ? `--para=${paraNazwa}` : "brak --para"}, ${tloParam ? `--tlo=${tloParam}` : "brak --tlo"}.`,
      );
      process.exit(KOD_NIE_ZMIERZONO);
    }
    const p = pary.find((x) => x.etykieta === paraNazwa);
    if (!p) {
      console.error(`NIE ZMIERZONO — nie znam pary "${paraNazwa}". Dostępne etykiety:`);
      for (const x of pary) console.error(`  - ${x.etykieta}`);
      process.exit(KOD_NIE_ZMIERZONO);
    }
    let tloRgb;
    try {
      tloRgb = hexNaRgba(tloParam);
    } catch (err) {
      console.error(`NIE ZMIERZONO — --tlo: ${err.message}.`);
      process.exit(KOD_NIE_ZMIERZONO);
    }
    const tloOpaczne = [tloRgb.r, tloRgb.g, tloRgb.b];
    const tloZlozone =
      p.bgHexLubNull === null ? tloOpaczne : zloz(p.bgHexLubNull, tloOpaczne);
    const k = kontrast(p.textRgb, tloZlozone);
    console.log(`Para: ${p.etykieta}`);
    console.log(`Podane tło: ${tloParam}`);
    console.log(`Tło złożone (jeśli token miał alfę): rgb(${tloZlozone.map(Math.round).join(", ")})`);
    console.log(`Kontrast na tym tle: ${formatuj(k)}`);
    console.log(`Próg: ${p.prog.toFixed(1)}, margines: ${formatuj(k - p.prog)}`);
    console.log(`Dla porównania: spoczynek=${formatuj(p.kSpoczynek)}, najechanie=${formatuj(p.kNajechanie)}, surowy na bieli=${formatuj(p.kSurowyNaBieli)}`);
    return;
  }

  console.log(`Źródło tokenów: ${SCIEZKA_CSS}`);
  console.log(`Odczytano ${Object.keys(tokeny).length} tokenów --psy-* z globals.css.`);

  let tla;
  let macierz;
  let wykluczone;
  let oczekiwane;
  try {
    tla = zbudujTla(tokeny, rowHoverNaBieli);
    ({ wynik: macierz, wykluczone, oczekiwane } = zbudujPelnaMacierz(pary, tla));
  } catch (err) {
    console.error(`NIE ZMIERZONO — ${err.message}.`);
    process.exit(KOD_NIE_ZMIERZONO);
  }

  console.log(`\nTła w zestawie (${tla.length}):`);
  for (const t of tla) {
    console.log(`  - ${t.nazwa}: ${t.opis}`);
  }

  wypiszMacierz(macierz, wykluczone, oczekiwane);

  // ===========================================================================
  // CZĘŚĆ DRUGA: tekst treści na tłach powierzchni — strumień NOWEGO FRONTU
  // (zakres zawężony, patrz komentarz przy definicjach wyżej: stary front,
  // app/globals.css, jest świadomie poza zakresem tego dodatku — decyzja
  // właściciela D-64 p.3 / D-91). Nazwa strumienia zostaje w każdym wierszu
  // wyjścia mimo że jest dziś jedynym strumieniem.
  // `--nadpisz` NIE działa tutaj (patrz uzasadnienie przy SCIEZKA_TOKENY_CSS
  // wyżej).
  // ===========================================================================

  let tokenyMotywowTresci;
  try {
    tokenyMotywowTresci = wczytajProdukcyjneTokenyTresci();
  } catch (err) {
    console.error(`NIE ZMIERZONO (tekst treści, nowy front) — ${err.message}.`);
    process.exit(KOD_NIE_ZMIERZONO);
  }
  let macierzTekstuNowy,
    oczekiwaneParyNowy,
    liczbaOdkrytychNowy,
    liczbaTekstuNowy,
    liczbaPowierzchniNowy,
    liczbaPozaZakresemNowy,
    nazwyPozaZakresemNowy;
  try {
    ({
      wynik: macierzTekstuNowy,
      oczekiwanePary: oczekiwaneParyNowy,
      liczbaTokenowOdkrytych: liczbaOdkrytychNowy,
      liczbaTokenowTekstu: liczbaTekstuNowy,
      liczbaTokenowPowierzchni: liczbaPowierzchniNowy,
      liczbaTokenowPozaZakresem: liczbaPozaZakresemNowy,
      nazwyPozaZakresem: nazwyPozaZakresemNowy,
    } = zbudujParyTekstuNaPowierzchni(tokenyMotywowTresci));
  } catch (err) {
    console.error(`NIE ZMIERZONO (tekst treści, nowy front) — ${err.message}.`);
    process.exit(KOD_NIE_ZMIERZONO);
  }
  console.log(
    `\n=== Margines kontrastu — tekst treści na tłach powierzchni, nowy front (design-system/tokeny/tokeny.css) ===`,
  );
  console.log(
    `Tokeny barw odkryte w [data-theme] (motyw jasny): ${liczbaOdkrytychNowy}. Tekst: ${liczbaTekstuNowy}. Powierzchnia: ${liczbaPowierzchniNowy}. Poza zakresem: ${liczbaPozaZakresemNowy}. Suma: ${liczbaTekstuNowy}+${liczbaPowierzchniNowy}+${liczbaPozaZakresemNowy}=${liczbaTekstuNowy + liczbaPowierzchniNowy + liczbaPozaZakresemNowy} (odkrytych: ${liczbaOdkrytychNowy}).`,
  );
  console.log(`Poza zakresem, z powodem (${nazwyPozaZakresemNowy.length}):`);
  for (const nazwa of nazwyPozaZakresemNowy) {
    const wpis = TOKENY_POZA_ZAKRESEM.find((t) => t.nazwa === nazwa);
    console.log(
      `  - --${nazwa}\n    powód: ${wpis ? wpis.powod : "(BŁĄD WEWNĘTRZNY: brak wpisu z powodem — guard powinien to złapać wcześniej)"}`,
    );
  }
  const posortNowy = [...macierzTekstuNowy].sort((a, b) => a.margines - b.margines);
  console.log("\nmargines".padEnd(9) + "kontrast".padEnd(10) + "próg".padEnd(7) + "para");
  for (const w of posortNowy) {
    console.log(
      formatuj(w.margines).padEnd(9) + formatuj(w.kontrast).padEnd(10) + w.prog.toFixed(1).padEnd(7) + w.etykieta,
    );
  }
  console.log(
    `\nZmierzone pary (tekst treści, nowy front): ${macierzTekstuNowy.length} (tekst ${liczbaTekstuNowy} × powierzchnia ${liczbaPowierzchniNowy} × motywy 2 = ${oczekiwaneParyNowy}).`,
  );
  const ponizejNowy = macierzTekstuNowy.filter((w) => w.margines < 0);
  console.log(
    `\ntekst-tlo (nowy front): ${ponizejNowy.length} z ${macierzTekstuNowy.length} ponizej progu, ${liczbaPozaZakresemNowy} tokenow poza zakresem`,
  );

  let paryDodatkoweNowy;
  try {
    paryDodatkoweNowy = zbudujParyDodatkoweNowegoFrontu(tokenyMotywowTresci);
  } catch (err) {
    console.error(`NIE ZMIERZONO (tekst treści, nowy front, pary dodatkowe) — ${err.message}.`);
    process.exit(KOD_NIE_ZMIERZONO);
  }
  console.log(
    `\n=== Pary dodatkowe, nowy front (znaleziska z przeglądu paska postępu, domknięte pomiarem) ===`,
  );
  console.log("\nmargines".padEnd(9) + "kontrast".padEnd(10) + "próg".padEnd(7) + "para");
  for (const w of paryDodatkoweNowy) {
    console.log(
      formatuj(w.margines).padEnd(9) + formatuj(w.kontrast).padEnd(10) + w.prog.toFixed(1).padEnd(7) + w.etykieta,
    );
  }
  const ponizejDodatkoweNowy = paryDodatkoweNowy.filter((w) => w.margines < 0);
  console.log(
    `\npary dodatkowe (nowy front): ${ponizejDodatkoweNowy.length} z ${paryDodatkoweNowy.length} ponizej progu`,
  );

  const ponizejNowyRazem = [...ponizejNowy, ...ponizejDodatkoweNowy];

  const pelnyRejestr = [...ZASTANE_ODSTEPSTWA, ...ODKRYTE_POMIAREM_TYMCZASOWE];
  const { naruszeniaNiepokryte, nieaktualneWpisyRejestru } = ocenProgi(macierz, pelnyRejestr);

  console.log(`\n=== Rejestr zastanych odstępstw (${ZASTANE_ODSTEPSTWA.length} wpisów) ===`);
  for (const wpis of ZASTANE_ODSTEPSTWA) {
    console.log(`  - ${wpis.etykieta} × ${wpis.tlo}\n    powód: ${wpis.powod}`);
  }

  console.log(
    `\n=== Odkryte pomiarem z 17.09.2026, czekają na decyzję o odcieniu — TYMCZASOWE, nie stan zaakceptowany (${ODKRYTE_POMIAREM_TYMCZASOWE.length} wpisów) ===`,
  );
  for (const wpis of ODKRYTE_POMIAREM_TYMCZASOWE) {
    console.log(`  - [${wpis.data}] ${wpis.etykieta} × ${wpis.tlo}\n    powód: ${wpis.powod}`);
  }

  let selfTestOk = true;
  if (process.argv.includes("--self-test")) {
    selfTestOk = uruchomKontroleNiezalezna();
  }

  // Wiersz podsumowania dla wolajacego, ktory czyta tylko jeden wiersz, nie
  // cala macierz: licznik I mianownik, oba z pomiaru (macierz.length NIE jest
  // wpisany na sztywno - to dlugosc tablicy faktycznie zmierzonych par/tel w
  // tym biegu). "w rejestrze" pojawia sie TYLKO gdy kazde odstepstwo ponizej
  // progu jest pokryte swiezym wpisem w ZASTANE_ODSTEPSTWA/ODKRYTE_POMIAREM_TYMCZASOWE
  // (naruszeniaNiepokryte.length === 0 w tym miejscu) - to jest gwarantowane
  // przez ocenProgi() wyzej, nie zgadywane tutaj.
  const ponizejProguLiczba = macierz.filter((w) => w.margines < 0).length;
  if (ponizejProguLiczba === 0) {
    console.log(`\nkontrast: ${ponizejProguLiczba} z ${macierz.length} ponizej progu`);
  } else if (naruszeniaNiepokryte.length === 0) {
    console.log(`\nkontrast: ${ponizejProguLiczba} z ${macierz.length} ponizej progu, w rejestrze`);
  } else {
    const pokryte = ponizejProguLiczba - naruszeniaNiepokryte.length;
    console.log(
      `\nkontrast: ${ponizejProguLiczba} z ${macierz.length} ponizej progu, ${pokryte} w rejestrze, ${naruszeniaNiepokryte.length} NIEPOKRYTE`,
    );
  }

  if (naruszeniaNiepokryte.length > 0) {
    console.error(`\nNIEPOKRYTE NARUSZENIA PROGU (${naruszeniaNiepokryte.length}) — poniżej progu i spoza obu rejestrów:`);
    for (const w of naruszeniaNiepokryte) {
      console.error(`  - ${w.etykieta} × ${w.tlo}: margines=${formatuj(w.margines)}`);
    }
  }
  if (nieaktualneWpisyRejestru.length > 0) {
    console.error(`\nWPISY REJESTRU JUŻ NIEPRAWDZIWE (${nieaktualneWpisyRejestru.length}) — usuń je z ZASTANE_ODSTEPSTWA albo z ODKRYTE_POMIAREM_TYMCZASOWE:`);
    for (const w of nieaktualneWpisyRejestru) {
      console.error(`  - ${w.etykieta} × ${w.tlo}: ${w.stan}`);
    }
  }

  if (ponizejNowyRazem.length > 0) {
    console.error(`\nNARUSZENIE PROGU TEKSTU TREŚCI — nowy front (${ponizejNowyRazem.length}):`);
    for (const w of ponizejNowyRazem) console.error(`  - ${w.etykieta}: margines=${formatuj(w.margines)}`);
  }

  // Kontrola niezależna sprawdza samą matematykę (`kontrast()`), nie
  // konkretne pary — jeśli nie przeszła, żadnemu marginesowi zmierzonemu
  // wyżej (w tym naruszeniom) nie ma czego wierzyć. Dlatego ten sprawdzian
  // ma pierwszeństwo przed listą naruszeń: NIE ZMIERZONO, nie ZMIERZONE
  // NARUSZENIE.
  if (!selfTestOk) {
    console.error(
      "\nWYNIK: NIE ZMIERZONO — kontrola niezależna (--self-test) nie przeszła (patrz BŁĄD wyżej); rachunek przyrządu odbiega od wartości znanych z góry, więc zmierzonym marginesom nie ma czego wierzyć.",
    );
    process.exit(KOD_NIE_ZMIERZONO);
  }

  if (naruszeniaNiepokryte.length > 0 || nieaktualneWpisyRejestru.length > 0) {
    console.error("\nWYNIK: ZMIERZONE NARUSZENIE.");
    process.exit(KOD_NARUSZENIE);
  }

  if (ponizejNowyRazem.length > 0) {
    console.error("\nWYNIK: ZMIERZONE NARUSZENIE (tekst treści).");
    process.exit(KOD_NARUSZENIE_TEKSTU);
  }

  console.log("\nWYNIK: wszystkie pary/tła powyżej progu albo pokryte świeżym wpisem rejestru.");
}

// Wywołanie main() tylko wtedy, gdy ten plik jest URUCHAMIANY (node
// scripts/pomiar-marginesu-kontrastu.mjs), NIE gdy jest IMPORTOWANY (np. z
// testu w __tests__/, patrz tam) — standardowy wzorzec Node na "entry point"
// modułu ESM. Bez tej straży `import` samego `sprawdzWzgledemZnanejListy` do
// testu odpalałby całą macierz na prawdziwym globals.css przy każdym imporcie
// (i wołał `process.exit` przy naruszeniu), co ubijałoby proces testowy
// zamiast dać czysty wynik jednej funkcji. CLI (npm run
// pomiar:kontrast-statusow) ma `process.argv[1]` równe temu plikowi, więc tam
// main() rusza dokładnie jak dotąd — ta straż nie zmienia zachowania CLI.
//
// Rozstrzyga PO `fs.realpathSync` OBU stron (własnej ścieżki i
// `process.argv[1]`), nie po porównaniu surowego `import.meta.url` z
// `pathToFileURL(process.argv[1])`: Node rozwiązuje dowiązania/symlinki przy
// budowaniu `import.meta.url`, ale NIE przy pozostawianiu `process.argv[1]`
// takim, jak podano w powłoce — uruchomienie przez złącze katalogowe (np.
// `mklink /J`) sprawiało, że te dwie wartości się różniły, `tenPlikJestUruchamiany`
// wychodziło `false`, `main()` milczał, a proces oddawał kod 0 z zerem bajtów
// wyjścia. Pusty pomiar to NIE jest zero, więc trzy stany, nie dwa:
//   - realpath(argv[1]) === realpath(tego pliku) -> uruchomiony wprost, licz.
//   - realpath(argv[1]) rozwiązuje się na INNY istniejący plik -> import
//     (np. z testu), main() się nie odpala, ale to nie jest błąd.
//   - realpath którejkolwiek strony nie da się ustalić (argv[1] brak, ścieżka
//     nie istnieje, itp.) -> NIE ZMIERZONO, kod 2 z nazwaną przyczyną —
//     nigdy ciche 0.
function ustalTrybUruchomienia() {
  if (process.argv[1] === undefined) {
    return {
      stan: "nierozstrzygalne",
      powod: "process.argv[1] nie jest ustawiony (brak ścieżki wołającego procesu).",
    };
  }
  let realTegoPliku;
  try {
    realTegoPliku = realpathSync(SCIEZKA_TEGO_PLIKU);
  } catch (err) {
    return {
      stan: "nierozstrzygalne",
      powod: `nie udało się rozwiązać realpath własnej ścieżki (${SCIEZKA_TEGO_PLIKU}): ${err.message}.`,
    };
  }
  let realWolajacego;
  try {
    realWolajacego = realpathSync(process.argv[1]);
  } catch (err) {
    return {
      stan: "nierozstrzygalne",
      powod: `nie udało się rozwiązać realpath wołającego (process.argv[1]="${process.argv[1]}"): ${err.message}.`,
    };
  }
  if (realWolajacego === realTegoPliku) {
    return { stan: "ten-plik" };
  }
  return { stan: "inny-plik" };
}

const TRYB_URUCHOMIENIA = ustalTrybUruchomienia();
if (TRYB_URUCHOMIENIA.stan === "nierozstrzygalne") {
  console.error(
    `NIE ZMIERZONO — nie udało się rozstrzygnąć, czy ten plik jest uruchamiany bezpośrednio, czy importowany: ${TRYB_URUCHOMIENIA.powod}`,
  );
  process.exit(KOD_NIE_ZMIERZONO);
}
if (TRYB_URUCHOMIENIA.stan === "ten-plik") {
  main();
}
