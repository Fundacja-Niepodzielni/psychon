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
//       liczy macierz), nieznana etykieta przekazana przez `--para`,
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
//   (`WYKLUCZENIA` niżej — np. `Alert` nigdy nie żyje w wierszu tabeli,
//   `TextLink` w całym repo żyje tylko w 3 miejscach, żadne na tle strony/
//   karcie ciepłej/podkładzie najechania na szarym). Strażnikiem nowej pary
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
//     do doraźnego sprawdzenia „co by było, gdyby"). Przy trafionej etykiecie
//     nie wpływa na kod wyjścia (kończy proces naturalnie, kod 0); przy
//     nieznanej etykiecie kończy się kodem 2 = NIE ZMIERZONO.
//
// Umiejscowienie: obok istniejących narzędzi pomiarowych frontu
// (scripts/pomiar-kc.sh, scripts/check-lock-libc.mjs) — ten sam katalog,
// ta sama konwencja nazywania ("pomiar-*").
//
// Stan dzisiejszy, do zapisania wprost: ten przyrząd NIE MA dziś żadnego
// automatycznego wołającego. Sprawdzone poleceniem
// `grep -rn "pomiar-marginesu-kontrastu\|pomiar:kontrast-statusow" .`
// (uruchomionym z korzenia repo) — poza tym plikiem samym w sobie wychodzą
// dokładnie cztery miejsca: `frontend/package.json` (definicja aliasu npm
// `pomiar:kontrast-statusow` → `node scripts/pomiar-marginesu-kontrastu.mjs`),
// `frontend/AUDYT-DOSTEPNOSCI.md:193` (zdanie prozy odsyłające do tego
// polecenia) oraz `frontend/app/globals.css:84` i `frontend/app/globals.css:95`
// (komentarze przy tokenach `--psy-success`/`--psy-info-badge`, też prozą, nie
// kodem). Żadne z tych czterech miejsc nie jest automatycznym wołającym:
// `package.json` tylko DEFINIUJE alias, którego trzeba użyć ręcznie
// (`npm run pomiar:kontrast-statusow`), a pozostałe trzy to tekst dla
// człowieka, nie instrukcja wykonywalna. Ten sam grep na katalogu `.github`
// daje 0 dopasowań — żaden CI, żaden hook, żaden inny skrypt nie uruchamia
// go sam z siebie, więc jego kody sterowane {0,2,3} nie są dziś przez nic
// automatycznie czytane. Ten bieg NIE dodaje wołającego — to jest tylko
// nazwanie zmierzonego stanu, żeby nikt nie zakładał dopełnienia, którego
// nikt nie wyliczył.

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCIEZKA_CSS = fileURLToPath(new URL("../app/globals.css", import.meta.url));

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

function hexNaRgba(hex) {
  let h = hex.replace("#", "");
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
//   - Badge.tsx warianty success/warning/danger/info/accent, wszystkie
//     wewnątrz Table.tsx w co najmniej 9 plikach (zmierzone grepem:
//     admin/emails, admin/kursy, admin/kursy/[id], panel/dokumenty,
//     h03/ApplicationsTab, h09/CourseAssignmentPanel, h12/InstructorGroup,
//     h18/AdminUsersList, h20/ReportView) — stąd kolumna "po najechaniu"
//     dotyczy ich naprawdę, nie hipotetycznie: Table.tsx nakłada
//     `hover:bg-row-hover` na CAŁY wiersz, więc każda komórka (a więc
//     i odznaka w niej) dziedziczy ten podkład. `Badge` jest też
//     komponentem ogólnym (design system), więc traktowany jest jako
//     ważny na KAŻDYM z pięciu teł niżej — potwierdza to m.in.
//     app/(administracja)/admin/emails/page.tsx (odznaka statusu wprost na
//     `bg-card-warm`) i components/organisms/NotificationList.tsx (odznaka
//     "info" na `hover:bg-grey`).
//   - Alert.tsx warianty success/info/error — nie żyją w wierszu tabeli
//     (potwierdzone grepem `<Alert` w całym repo: zawsze w karcie/formularzu
//     albo wprost w treści strony przez `ListTemplate`/`ErrorState`, nigdy
//     w komórce `Table.tsx`) — stąd wykluczenie tła "podkład najechania
//     wiersza tabeli" dla wszystkich trzech par `Alert:*` w `WYKLUCZENIA`.
//   - TextLink.tsx tony primary/muted — w całym repo żyje dokładnie w 3
//     miejscach (grep `TextLink` poza `components/ui/TextLink.tsx` i
//     testami): app/(administracja)/admin/kursy/page.tsx (komórka tabeli),
//     app/(uczestnik)/panel/dokumenty/page.tsx (karta),
//     components/po-programie/ProgramCompletedCard.tsx (karta) — nigdy
//     wprost na tle strony, karcie ciepłej ani podkładzie najechania na
//     szarym, stąd wykluczenie tych trzech teł dla wszystkich par
//     `Łącze:*` w `WYKLUCZENIA`.
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
  'TextLink w całym repo żyje dokładnie w 3 miejscach (grep "TextLink" poza components/ui/TextLink.tsx i testami): app/(administracja)/admin/kursy/page.tsx (komórka tabeli), app/(uczestnik)/panel/dokumenty/page.tsx (karta), components/po-programie/ProgramCompletedCard.tsx (karta) — nigdy wprost na tym tle.';

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
function zbudujPelnaMacierz(pary, tla) {
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

/** Wszystkie wystąpienia `--nadpisz=--psy-token=#hex` (może być kilka naraz). */
function nadpisaniaZArgv() {
  const przedrostek = "--nadpisz=";
  return process.argv
    .filter((a) => a.startsWith(przedrostek))
    .map((a) => a.slice(przedrostek.length))
    .map((para) => {
      const i = para.indexOf("=");
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
  if (paraNazwa && tloParam) {
    // Tryb jednej pary na podanym, realnym tle — nie zastępuje macierzy
    // głównej ani kodu wyjścia (przy trafionej etykiecie), tylko liczy
    // dokładnie to, o co proszono.
    const p = pary.find((x) => x.etykieta === paraNazwa);
    if (!p) {
      console.error(`NIE ZMIERZONO — nie znam pary "${paraNazwa}". Dostępne etykiety:`);
      for (const x of pary) console.error(`  - ${x.etykieta}`);
      process.exit(KOD_NIE_ZMIERZONO);
    }
    const tloRgb = hexNaRgba(tloParam);
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
const tenPlikJestUruchamiany =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (tenPlikJestUruchamiany) {
  main();
}
