// Skrypt pomiarowy celow dotyku (prog 44px) — nie jest testem jednostkowym ani e2e MVP.
// Otwiera lokalny poligon (statyczny build atomów) i mierzy realne
// prostokąty elementów klikalnych przy 412 i 1440 px, w obu motywach.
//
// Kody sterowane tego pliku: 0 = zaliczony, 2 = NIE ZMIERZONO (z nazwaną
// przyczyną w stderr — albo narzędzie w ogóle nie wystartowało, albo —
// patrz `zmierzStabilnyBox`/`CZAS_STABILIZACJI_MS` niżej — co najmniej
// jeden cel migotał między klatkami, ALBO `boundingBox()` oddał `null` po
// drugiej próbie (element nieobecny w DOM, np. `display: none` — patrz
// `brakElementu` w `zmierzStabilnyBox`) i przyrząd mu nie ufa; TA gałąź
// jest sprawdzana JAKO PIERWSZA, przed 3, bo niezmierzony wymiar unieważnia
// wszystkie pozostałe liczby — pusty pomiar (box null) NIE jest zerem
// naruszeń, jest BRAKIEM pomiaru, więc idzie do DOKŁADNIE tej samej ścieżki
// co cel migoczący, nie do rozjazdu rejestru; wcześniej istniała luka,
// w której `{box: null, niestabilny: false}` mijał tę bramkę jako
// "zmierzone i puste" i bieg zdążał wypisać liczbę naruszeń, zanim doszedł
// do kodu 2), 3 = ZMIERZONY ROZJAZD REJESTRU LUB NARUSZENIE POZA LISTAMI
// ZASTAŁYCH (brakujące/nadmiarowe cele względem cele-oczekiwane.mjs, pomiar,
// który nie znalazł elementu pod selektorem, którakolwiek z dwóch list
// zastałych — okruszki/pozostałe, patrz cele-dotyku-zastane.mjs — dłuższa
// niż jej sufit, LUB co najmniej jedno naruszenie progu, KTÓRE NIE PASUJE
// dokładnie do żadnej z dwóch list). Naruszenia, które pasują dokładnie do
// jednej z dwóch list (i żadna z list nie przekracza sufitu), NIE liczą się
// do kodu 3 (osobny kod 4, "naruszenie progu", został zniesiony): cel
// dwóch list zastałych był, żeby PRZESTAĆ blokować zielony czubek, więc
// czyste drzewo z WYŁĄCZNIE znanymi, zmieszczonymi na listach naruszeniami
// kończy się kodem 0 — obie listy są
// i tak wypisane w stdout PRZY KAŻDYM biegu, niezależnie od kodu wyjścia
// (zieleń, która by je ukrywała, byłaby gorsza od czerwieni). Kod 4 nie jest
// już przez ten skrypt produkowany (patrz komentarz przy `rozjazd` niżej).
// Kod spoza {0,2,3} = narzędzie nie doszło do końca; przyczyna w stderr,
// jeżeli środowisko ją wypisało.
//
// Zmierzona, wciąż otwarta właściwość: te importy (niżej) stoją PRZED
// osłoną try (patrz komentarz tam), więc awaria ładowania modułu (np.
// zniknięcie cele-oczekiwane.mjs) kończy proces nieprzechwyconym wyjątkiem —
// domyślnym kodem Node.js, który leży POZA {0,2,3,4} (zmierzone: kod 1, patrz
// niżej). Od odbioru 2bd5f6b ten kod już NIE koliduje z żadnym kodem
// sterowanym (rozjazd/naruszenie to 3/4, nie 1), więc wołający rozpoznaje go
// po samej przynależności do {0,2,3,4}, bez specjalnego przypadku. Zmierzone
// (odbiór 2bd5f6b, bieg M6, perturbacja: chwilowe ukrycie cele-oczekiwane.mjs):
// `real 0m3.889s`, `KOD_REALNY=1`, `Error [ERR_MODULE_NOT_FOUND]`, zero linii
// „NIE ZMIERZONO”, 0 z 40 oczekiwanych pomiarów. Ten commit przeniesienia
// importów za try nie robi (przebudowałoby plik już zmierzony sześcioma
// scenariuszami osobno) — luka zostaje nazwana tutaj i w
// scripts/uruchom-pomiar-celow-dotyku.mjs.
import { chromium } from "@playwright/test";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OCZEKIWANE_CELE, KOMPONENT_CELU, WYKLUCZENIA, PLIKI_ROZLICZONE } from "./cele-oczekiwane.mjs";
import {
  OKRUSZKI_ELEMENTY,
  PROG_OKRUSZKA_PX,
  ZASTALE_OKRUSZKI,
  MAKSYMALNA_LICZBA_ZASTALYCH_OKRUSZKOW,
  ZASTALE_POZOSTALE,
  MAKSYMALNA_LICZBA_ZASTALYCH_POZOSTALE,
} from "./cele-dotyku-zastane.mjs";

// K3, noga trzecia (odbiór): drzewo komponentów przejrzane RĘCZNIE dla K0 nie
// ma innego strażnika niż to porównanie — bez niego dopisanie NOWEGO pliku
// `*.tsx` (komponent interaktywny, którego autor zapomniał dopisać do
// rejestru) przechodzi bramkę po cichu, dokładnie problem nazwany w tytule
// tego odbioru ("rejestr ma opisywać drzewo, nie czyjąś pamięć"). Ten skan
// NIE ocenia, czy plik ma WŁASNY cel (to osąd z lektury, w cele-oczekiwane.mjs)
// — pyta wyłącznie "czy KTOŚ już go rozliczył, celem albo wykluczeniem z
// powodem". Plik spoza obu list jest ROZJAZDEM (kod 3), nazwany z pełnej
// ścieżki względem design-system/.
const KATALOG_DESIGN_SYSTEM = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function znajdzKomponentyTsx(katalogWzgledny) {
  const pelny = path.join(KATALOG_DESIGN_SYSTEM, katalogWzgledny);
  const wynik = [];
  for (const wpis of readdirSync(pelny, { withFileTypes: true })) {
    if (wpis.name === "__tests__") continue;
    const wzgledna = `${katalogWzgledny}/${wpis.name}`;
    if (wpis.isDirectory()) {
      wynik.push(...znajdzKomponentyTsx(wzgledna));
    } else if (wpis.isFile() && wpis.name.endsWith(".tsx")) {
      wynik.push(wzgledna.replace(/^\.\//, ""));
    }
  }
  return wynik;
}
const plikiWDrzewie = ["atomy", "molekuly", "organizmy"].flatMap((katalog) => znajdzKomponentyTsx(katalog));
const zbiorRozliczonych = new Set(PLIKI_ROZLICZONE);
const plikiNierozliczone = plikiWDrzewie.filter((plik) => !zbiorRozliczonych.has(plik));
// Odwrotność (pozycja w rejestrze, której pliku już nie ma w drzewie) —
// nazwana osobno, bo to INNY rodzaj rozjazdu (rejestr mówi o czymś, co
// zniknęło, nie o czymś nowym, czego rejestr nie widzi).
const zbiorWDrzewie = new Set(plikiWDrzewie);
const rejestrOsieroconyWzgledemDrzewa = PLIKI_ROZLICZONE.filter((plik) => !zbiorWDrzewie.has(plik));

// Port z PORT_POLIGONU (domyślnie 4173) — ta sama zmienna i ta sama wartość
// domyślna, jaką ustawia scripts/uruchom-pomiar-celow-dotyku.mjs, zanim uruchomi ten
// plik jako dziecko. Jedno źródło prawdy: gdyby oba pliki miały własną
// domyślną wartość portu, rozjazd między nimi nie dawałby żadnego błędu, tylko
// cichy ECONNREFUSED albo pomiar pustego adresu.
const PORT = process.env.PORT_POLIGONU || "4173";
const URL = `http://127.0.0.1:${PORT}/`;
// Próg DOMYŚLNY tu jest 44px (AAA, WCAG 2.5.5 "Target Size (Enhanced)") —
// wyższy od minimum AA (WCAG 2.5.8 "Target Size (Minimum)", 24px). Token
// --hit-min w design-system/tokeny/tokeny.css niesie tę samą wartość (44px);
// ten skrypt nie czyta CSS-u, więc liczba jest zapisana tu wprost i osobno —
// rozjazd między nimi nie dałby żadnego błędu, gdyby był tylko jeden zapis.
// Próg AA (24px, `PROG_OKRUSZKA_PX`, importowany z cele-dotyku-zastane.mjs)
// JEST egzekwowany, ale WYŁĄCZNIE dla elementów śladu okruszków — patrz
// `progDlaCelu` niżej.
const PROG_PX = 44; // obie strony prostokąta — patrz filtr `ponizejProgu` niżej

// Chwiejność zmierzona osobnym odbiorem (20 biegów na nietkniętym drzewie:
// jeden rozkład wyjść na 20 — patrz komentarz commita), a mimo to NIE
// odtworzona celowo na tej maszynie ani sekwencyjnie, ani pod sztucznym
// obciążeniem procesora (6 procesów w pętli zajętej, 8 biegów, ten sam
// wynik). Poligon nie ładuje żadnej czcionki przez `@font-face` ani żadnego
// obrazu (zmierzone: `grep -rn "@font-face|<img|background-image"
// design-system` — 0 trafień), więc hipoteza czcionek/obrazów z tego
// odbioru jest wątpliwa DLA TEGO poligonu — patrz K2 w komunikacie commita.
// Przyczyna źródłowa zostaje NIEUSTALONA. Ta stała i funkcja niżej NIE
// naprawiają przyczyny (nieznanej) — wprowadzają regułę: gdy dwa
// kolejne odczyty tego samego selektora (rozdzielone dwiema klatkami
// `requestAnimationFrame`, nie sztywnym `sleep`) różnią się, przyrząd
// odpytuje dalej, aż się zgodzą albo upłynie ten limit — i wtedy ODMAWIA
// (kod 2), zamiast wydrukować wymiar, któremu nie ufa.
const CZAS_STABILIZACJI_MS = 2000;

async function zmierzStabilnyBox(page, selektor) {
  const poczatek = Date.now();
  const poczekajNaKlatke = () =>
    page.evaluate(() => new Promise((zakoncz) => requestAnimationFrame(() => requestAnimationFrame(zakoncz))));

  let poprzedni = await page.locator(selektor).boundingBox();
  if (poprzedni === null) {
    // Element nieobecny w DOM (zły selektor / się nie wyrenderował / cel
    // UKRYTY np. `display:none`) — jedno dodatkowe sprawdzenie po klatce,
    // żeby odróżnić "jeszcze nie zamontowany" od "konsekwentnie go nie ma".
    // To drugie NIE jest "zmierzone i puste" (pusty wynik to NIE zero) —
    // jest BRAKIEM pomiaru, dokładnie jak migotanie: `brakElementu: true`
    // trafia do TEJ SAMEJ bramki NIEZMIERZONY (kod 2) co `niestabilny`,
    // sprawdzanej PRZED jakąkolwiek liczbą naruszeń. Wcześniej
    // ta gałąź oddawała `{ box: null, niestabilny: false }`, co mijało bramkę
    // migotania i pozwalało reszcie biegu policzyć "PONIZEJ 44px" z pominięciem
    // tego celu, zanim proces w ogóle doszedł do kodu 2 — pusty pomiar udawał
    // pomiar zerowy.
    await poczekajNaKlatke();
    const drugi = await page.locator(selektor).boundingBox();
    if (drugi === null) return { box: null, niestabilny: false, brakElementu: true };
    poprzedni = drugi;
  }
  while (Date.now() - poczatek < CZAS_STABILIZACJI_MS) {
    await poczekajNaKlatke();
    const nastepny = await page.locator(selektor).boundingBox();
    const takieSame =
      nastepny !== null &&
      Math.abs(poprzedni.width - nastepny.width) < 0.5 &&
      Math.abs(poprzedni.height - nastepny.height) < 0.5;
    if (takieSame) return { box: nastepny, niestabilny: false, brakElementu: false };
    poprzedni = nastepny ?? poprzedni;
  }
  return { box: poprzedni, niestabilny: true, brakElementu: false };
}

const VIEWPORTY = [
  { nazwa: "412", width: 412, height: 900 },
  { nazwa: "1440", width: 1440, height: 900 },
];
const MOTYWY = ["light", "dark"];

// Strona wejścia poligonu, na której stoi cel. Cel bez pola `strona` stoi na
// `index.html` — to wartość domyślna, więc wpisy sprzed tej zmiany mierzą się
// dokładnie tak samo jak wcześniej (ten sam adres, ten sam znacznik gotowości).
// Każda strona ma własny znacznik gotowości: element, na który przyrząd czeka
// po wejściu, zanim zacznie mierzyć. Strona bez znacznika w tej mapie to błąd
// narzędzia (wyjątek w try niżej, kod 2), nie cichy pomiar pustej strony.
const STRONA_DOMYSLNA = "index.html";
const ZNACZNIK_GOTOWOSCI = {
  "index.html": '[data-testid="button-primary"]',
  "lekcja.html": '[data-style-id="o12-coursetree-rozwiniete"]',
};
function adresStrony(strona, motyw) {
  const sciezka = strona === STRONA_DOMYSLNA ? "" : strona;
  return `${URL}${sciezka}?theme=${motyw}`;
}

const CELE = [
  { nazwa: "Button primary", selektor: '[data-testid="button-primary"]' },
  { nazwa: "Button outline", selektor: '[data-testid="button-outline"]' },
  { nazwa: "Button quiet", selektor: '[data-testid="button-quiet"]' },
  { nazwa: "Button sm", selektor: '[data-testid="button-sm"]' },
  { nazwa: "Icon jako przycisk", selektor: '[data-testid="icon-button"]' },
  { nazwa: "Link (pole klikalne)", selektor: '[data-testid="link"]' },
  { nazwa: "Link wariant okruszek", selektor: '[data-testid="link-okruszek"]' },
  { nazwa: "Checkbox (etykieta = pole dotyku)", selektor: 'label[for="pol-zgoda"]' },
  { nazwa: "Input", selektor: '[data-testid="input"]' },
  { nazwa: "Textarea", selektor: '[data-testid="textarea"]' },
  // Poniżej: 17 celów dopisanych przy odbiorze K1 (rejestr rozszerzony na
  // WSZYSTKIE 22 pozycje specyfikacji z własnym elementem interaktywnym —
  // patrz uzasadnienie w cele-oczekiwane.mjs). Selektory celują w atrybuty
  // JUŻ obecne w main.tsx (data-style-id, id, aria-label, data-testid) albo
  // w DOM komponentu (role) — main.tsx i komponenty NIE są tym odbiorem
  // zmienione.
  { nazwa: "Select (przycisk combobox)", selektor: '[aria-label="Wybór wariantu"]' },
  { nazwa: "Breadcrumbs (pozycja z odnośnikiem)", selektor: '[data-style-id="molekula-breadcrumbs-pelne"] li:nth-of-type(1) a' },
  { nazwa: "CollapsibleSection (nagłówek rozwijający)", selektor: '[data-style-id="m16-collapsible"] button' },
  { nazwa: "DialogActions (wycofanie)", selektor: '[data-style-id="m12-dialogactions"] button:nth-of-type(1)' },
  { nazwa: "EmptyState (przycisk)", selektor: '[data-style-id="m17-pusto"] button' },
  { nazwa: "Field (kontrolka tekstowa)", selektor: "#m1-tekst" },
  { nazwa: "FileDropZone (obszar upuszczania)", selektor: '[data-style-id="m5-filedropzone"] [role="button"]' },
  { nazwa: "KeyValueRow (pokaż/ukryj)", selektor: '[data-style-id="molekula-keyvaluerow-zamaskowana"] button' },
  { nazwa: "ListRow (akcja wiersza)", selektor: '[data-style-id="molekula-listrow-prosty"] a' },
  { nazwa: "MenuItem/MenuGroup (pozycja menu)", selektor: '[data-style-id="molekula-menugroup"] li:nth-of-type(1) a' },
  { nazwa: "Pagination (poprzednia)", selektor: '[data-style-id="m14-pagination"] button:nth-of-type(1)' },
  { nazwa: "RichTextEditor (przycisk paska)", selektor: '[data-style-id="m18-richtext"] [role="toolbar"] > span:nth-of-type(1) button' },
  { nazwa: "SaveBar (cofnij)", selektor: '[data-style-id="m13-savebar-widoczny"] button:nth-of-type(1)' },
  { nazwa: "SearchBox (pole wyszukiwania)", selektor: "#m2-a" },
  { nazwa: "Tabs (zakładka)", selektor: '[data-style-id="molekula-tabs"] button:nth-of-type(1)' },
  { nazwa: "Toast (zamknij)", selektor: '[data-style-id="m15-toast-bez-akcji"] [data-testid="toast-zamknij"]' },
  { nazwa: "PublishChecklist (odnośnik braku)", selektor: '[data-style-id="organizm-o7-z-brakami"] li:nth-of-type(1) a' },
  // Organizmy kursu, wykresu i lekcji — montowane w `lekcja.html`, nie w main.tsx.
  { nazwa: "TimeChart (rozwinięcie tabeli)", strona: "lekcja.html", selektor: '[data-style-id="o13-timechart-z-danymi"] button' },
  { nazwa: "CourseTree (strzałka przeniesienia)", strona: "lekcja.html", selektor: '[data-style-id="o12-coursetree-kolejnosc"] [aria-label="Przenieś „Zasady programu” niżej"]' },
  { nazwa: "CourseTree (zmiana nazwy)", strona: "lekcja.html", selektor: '[data-style-id="o12-coursetree-rozwiniete"] [data-testid="ct-edytuj-l1"]' },
  { nazwa: "CourseTree (dodanie lekcji)", strona: "lekcja.html", selektor: '[data-style-id="o12-coursetree-rozwiniete"] [data-testid="ct-dodaj-temat-1"]' },
  { nazwa: "LessonPlayer (odtwarzanie)", strona: "lekcja.html", selektor: '[data-style-id="o6-lessonplayer-niespelniony"] button[aria-label="Odtwórz"]' },
  { nazwa: "LessonPlayer (powiększenie)", strona: "lekcja.html", selektor: '[data-style-id="o6-lessonplayer-niespelniony"] button[aria-label="Powiększ"]' },
  { nazwa: "LessonPlayer (odnośnik braku)", strona: "lekcja.html", selektor: '[data-style-id="o6-lessonplayer-niespelniony"] [role="status"] li:nth-of-type(1) a' },
];

// Wszystko od uruchomienia przeglądarki aż po ostatnie zamknięcie strony jest
// w try/catch z JEDNEGO powodu: kody 3/4 poniżej mają znaczyć WYŁĄCZNIE "pomiar
// się odbył i wykrył rozjazd/naruszenie". Brak przeglądarki (np. zła ścieżka w
// PLAYWRIGHT_BROWSERS_PATH), padnięcie nawigacji czy inny wyjątek w trakcie
// pomiaru to NIE naruszenie — to brak pomiaru, kod 2 (NIE ZMIERZONO). Bez tego
// rozdziału nieprzechwycony wyjątek kończyłby proces domyślnym kodem Node.js,
// nieodróżnialnym od realnie wykrytych naruszeń, i wołający zamelduje fałszywą
// czerwień z nazwanym, ale nieprawdziwym powodem — gorszą niż brak pomiaru, bo
// następny czytający zacznie szukać celów dotykowych, których nikt nie
// zmierzył.
let wyniki;
try {
  const browser = await chromium.launch();
  wyniki = [];
  const strony = [...new Set(CELE.map((cel) => cel.strona ?? STRONA_DOMYSLNA))];
  for (const motyw of MOTYWY) {
    for (const viewport of VIEWPORTY) {
      for (const strona of strony) {
        const znacznik = ZNACZNIK_GOTOWOSCI[strona];
        if (!znacznik) throw new Error(`strona ${strona} nie ma znacznika gotowosci w ZNACZNIK_GOTOWOSCI`);
        const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
        await page.goto(adresStrony(strona, motyw));
        await page.waitForSelector(znacznik);
        for (const cel of CELE.filter((c) => (c.strona ?? STRONA_DOMYSLNA) === strona)) {
          const { box, niestabilny, brakElementu } = await zmierzStabilnyBox(page, cel.selektor);
          wyniki.push({
            motyw,
            viewport: viewport.nazwa,
            element: cel.nazwa,
            szerokosc: box ? Math.round(box.width * 100) / 100 : null,
            wysokosc: box ? Math.round(box.height * 100) / 100 : null,
            niestabilny,
            brakElementu,
          });
        }
        await page.close();
      }
    }
  }
  await browser.close();
} catch (blad) {
  console.error(`POMIAR CELOW DOTYKU: NARZEDZIE NIE URUCHOMIONE — ${blad.message}`);
  // Kod 2 = NIE ZMIERZONO: to jedyna gałąź tego pliku, w której pomiar w
  // ogóle się nie odbył — przyczyna jest w stderr wyżej, niezależnie od jej
  // treści.
  process.exit(2);
}

// Priorytet NAJWYŻSZY, sprawdzony PRZED jakąkolwiek liczbą: cel, który
// migotał między dwoma odczytami przez cały CZAS_STABILIZACJI_MS, JEST TĄ
// SAMĄ ścieżką co cel, którego `boundingBox()` oddał `null` (element
// nieobecny w DOM — np. UKRYTY `display:none` — po dwóch próbach). Oba są
// stanem "NIE ZMIERZONO", nie "zero naruszeń" ani zmierzonym naruszeniem —
// nawet gdy wśród POZOSTAŁYCH 107 pomiarów nie ma ani jednego takiego.
// Przed poprawką `brakElementu` nie istniało, `box:
// null` szedł dalej jako "zmierzone i puste" i dopiero PÓŹNIEJSZY blok
// rozjazdu (kod 3) go łapał — ZA PÓŹNO, bo `PONIZEJ 44px` już zdążyło paść w
// stdout z pominięciem tego celu. Dlatego ten blok kończy proces (kod 2)
// ZANIM padnie choćby jeden console.log z liczbą, i liczy OBA warunki razem.
const niezmierzone = wyniki.filter((w) => w.niestabilny || w.brakElementu);
if (niezmierzone.length > 0) {
  const iloscNiestabilnych = niezmierzone.filter((w) => w.niestabilny).length;
  const iloscBrakElementu = niezmierzone.filter((w) => w.brakElementu).length;
  console.error(
    `POMIAR CELOW DOTYKU: NIE ZMIERZONO (kod 2) — ${niezmierzone.length} z ${wyniki.length} pomiarow bez zaufanego wymiaru (${iloscNiestabilnych} migoczacych, ${iloscBrakElementu} bez elementu w DOM):`,
  );
  for (const n of niezmierzone) {
    const przyczyna = n.brakElementu
      ? "boundingBox() zwrocil null po dwoch probach — element nieobecny w DOM (np. ukryty display:none)"
      : `wymiar migotal miedzy kolejnymi klatkami (requestAnimationFrame) przez ${CZAS_STABILIZACJI_MS}ms i przyrzad mu nie ufa`;
    console.error(`  NIEZMIERZONY: ${n.element} (${n.motyw}, ${n.viewport}px) — ${przyczyna}`);
  }
  process.exit(2);
}

console.log(JSON.stringify(wyniki, null, 2));

// Pomiar OCZEKIWANY liczy się z rejestru NIEZALEŻNEGO (cele-oczekiwane.mjs),
// nie z `CELE.length` tego pliku — inaczej usunięcie wpisu z `CELE` obniża
// oczekiwaną liczbę razem z wykonaną i próba wychodzi zielona mimo skróconego
// pokrycia (zmierzone: `OCZEKIWANE 36 / WYKONANE 36` po usunięciu wpisu, gdy
// liczono z tej samej tablicy). Element, który w ogóle się nie renderuje
// (display:none, zły selektor), nadal ma po prostu zniknąć z `wyniki`, więc
// `wykonanePomiarow` porównujemy z tym niezależnym rejestrem, nie z `CELE`.
const oczekiwanePomiarow = OCZEKIWANE_CELE.length * MOTYWY.length * VIEWPORTY.length;
const brakujace = wyniki.filter((w) => w.wysokosc === null || w.szerokosc === null);
const wykonanePomiarow = wyniki.length - brakujace.length;

// Rozjazd między rejestrem niezależnym i tablicą `CELE` samego tego pliku —
// nazwany, nie tylko policzony, żeby dało się od razu wiedzieć, czego brakuje
// i w którym pliku to dopisać.
const nazwyWCELE = new Set(CELE.map((cel) => cel.nazwa));
const nazwyWRejestrze = new Set(OCZEKIWANE_CELE);
const brakujaceWCELE = OCZEKIWANE_CELE.filter((nazwa) => !nazwyWCELE.has(nazwa));
const nadmiaroweWCELE = [...nazwyWCELE].filter((nazwa) => !nazwyWRejestrze.has(nazwa));

// Próg NIE jest już jeden płaski
// PROG_PX dla wszystkich celów — elementy śladu okruszków
// (OKRUSZKI_ELEMENTY) mają własny, niższy próg AA (PROG_OKRUSZKA_PX, 24px),
// bo są nawigacją ZAPASOWĄ z równoważnym pełnowymiarowym przyciskiem
// powrotu gdzie indziej na ekranie (wyjątek WCAG 2.5.5). "Krok bramki 44px
// bez zmian" dla WSZYSTKIEGO poza tym jednym typem elementu — stąd próg per
// cel, nie globalna zmiana PROG_PX.
function progDlaCelu(nazwaElementu) {
  return OKRUSZKI_ELEMENTY.has(nazwaElementu) ? PROG_OKRUSZKA_PX : PROG_PX;
}

// Bramka porównuje OBA wymiary, nie tylko wysokość — cel wąski (np.
// 20px szerokości) przy poprawnej wysokości jest tak samo niedotykalny jak
// cel niski. Wcześniej skrypt zbierał `szerokosc`, drukował ją w JSON i nigdy
// z niczym nie porównywał — 20px szerokości przy 44px wysokości dawało exit 0.
const ponizejProgu = wyniki.filter((w) => {
  const prog = progDlaCelu(w.element);
  return (w.wysokosc !== null && w.wysokosc < prog) || (w.szerokosc !== null && w.szerokosc < prog);
});

// Naruszenia zastałe nie mogą
// same z siebie zapalić kodu 4 na całym zespole na każdym biegu — ale
// DWIE różne kategorie (okruszki próg 24px, pozostałe próg 44px) mają
// DWIE niezależne listy i DWA niezależne sufity, każdy pilnowany osobno
// (dopisanie do KTÓREJKOLWIEK z dwóch list ponad jej sufit jest samo w
// sobie rozjazdem). Dopasowanie po WSZYSTKICH polach — element + motyw +
// viewport + oba wymiary — samo dopasowanie nazwy przepuściłoby np.
// pogorszenie 42.77px -> 30px po cichu.
function pasujeDoListy(cel, lista) {
  return lista.some(
    (z) =>
      z.element === cel.element &&
      z.motyw === cel.motyw &&
      z.viewport === cel.viewport &&
      z.szerokosc === cel.szerokosc &&
      z.wysokosc === cel.wysokosc,
  );
}
const naruszeniaOkruszkow = ponizejProgu.filter((cel) => OKRUSZKI_ELEMENTY.has(cel.element));
const naruszeniaPozostalych = ponizejProgu.filter((cel) => !OKRUSZKI_ELEMENTY.has(cel.element));
const zastaleOkruszki = naruszeniaOkruszkow.filter((cel) => pasujeDoListy(cel, ZASTALE_OKRUSZKI));
const noweOkruszki = naruszeniaOkruszkow.filter((cel) => !pasujeDoListy(cel, ZASTALE_OKRUSZKI));
const zastalePozostale = naruszeniaPozostalych.filter((cel) => pasujeDoListy(cel, ZASTALE_POZOSTALE));
const nowePozostale = naruszeniaPozostalych.filter((cel) => !pasujeDoListy(cel, ZASTALE_POZOSTALE));
const noweNaruszenia = [...noweOkruszki, ...nowePozostale];
// Sufity pilnowane TU, niezależnie od tego, czy DOM w ogóle ma tyle
// naruszeń — obie listy rosną wyłącznie decyzją architektury poza tym
// skryptem (patrz komentarz w cele-dotyku-zastane.mjs), nigdy samym PR-em
// dopisującym pozycję. Sprawdzane OSOBNO, żeby dopisanie do jednej listy
// nie mogło się schować za sufitem drugiej.
const listaOkruszkowZaDuza = ZASTALE_OKRUSZKI.length > MAKSYMALNA_LICZBA_ZASTALYCH_OKRUSZKOW;
const listaPozostalychZaDuza = ZASTALE_POZOSTALE.length > MAKSYMALNA_LICZBA_ZASTALYCH_POZOSTALE;
const listaZastanychZaDuza = listaOkruszkowZaDuza || listaPozostalychZaDuza;

// Dwa mianowniki, nie jeden: ile CELOW (wpisów w OCZEKIWANE_CELE, jeden
// komponent może nieść kilka wariantów) i z ilu KOMPONENTOW (Set na wartościach
// KOMPONENT_CELU — Button niesie 4 cele, ale to JEDEN komponent). Trzeci
// mianownik: ile komponentów ma JAWNE wykluczenie (WYKLUCZENIA), żeby brak
// celu nigdy nie był cichy.
const komponentyZCelem = new Set(OCZEKIWANE_CELE.map((nazwa) => KOMPONENT_CELU[nazwa] ?? `(BRAK MAPOWANIA: ${nazwa})`));
const komponentyBezMapowania = OCZEKIWANE_CELE.filter((nazwa) => !(nazwa in KOMPONENT_CELU));

console.log(
  `\nPROG EGZEKWOWANY: ${PROG_PX}px (AAA, WCAG 2.5.5) domyslnie; ${PROG_OKRUSZKA_PX}px (AA, WCAG 2.5.8) WYLACZNIE dla sladu okruszkow (${[...OKRUSZKI_ELEMENTY].join(", ")}) — wyjatek: rownowazny przycisk powrotu >=44px na tym samym ekranie.`,
);
console.log(`\nOCZEKIWANE POMIAROW: ${oczekiwanePomiarow}`);
console.log(`WYKONANE POMIAROW: ${wykonanePomiarow}`);
console.log(`CELOW W REJESTRZE: ${OCZEKIWANE_CELE.length}, Z KOMPONENTOW: ${komponentyZCelem.size}`);
console.log(`KOMPONENTOW WYKLUCZONYCH (bez wlasnego celu, z powodem): ${WYKLUCZENIA.length}`);
if (komponentyBezMapowania.length > 0) {
  console.log(`CELE BEZ MAPOWANIA NA KOMPONENT W KOMPONENT_CELU: ${komponentyBezMapowania.length}`);
  for (const nazwa of komponentyBezMapowania) {
    console.log(`  BRAK MAPOWANIA: "${nazwa}"`);
  }
}
if (brakujace.length > 0) {
  console.log(`BRAKUJACE POMIARY: ${brakujace.length}`);
  for (const b of brakujace) {
    console.log(`  BRAK: ${b.element} (${b.motyw}, ${b.viewport}px) — boundingBox() zwrocil null`);
  }
}
if (brakujaceWCELE.length > 0) {
  console.log(`CELE BRAKUJACE WZGLEDEM REJESTRU NIEZALEZNEGO (cele-oczekiwane.mjs): ${brakujaceWCELE.length}`);
  for (const nazwa of brakujaceWCELE) {
    console.log(`  BRAK W CELE: "${nazwa}" jest w cele-oczekiwane.mjs, nie ma go w tablicy CELE tego pliku.`);
  }
}
if (nadmiaroweWCELE.length > 0) {
  console.log(`CELE NADMIAROWE WZGLEDEM REJESTRU NIEZALEZNEGO: ${nadmiaroweWCELE.length}`);
  for (const nazwa of nadmiaroweWCELE) {
    console.log(`  BRAK W REJESTRZE: "${nazwa}" jest w tablicy CELE, nie ma go w cele-oczekiwane.mjs.`);
  }
}
// K3, noga trzecia: plik `*.tsx` w drzewie, którego NIE MA ani w celach, ani
// w wykluczeniach (PLIKI_ROZLICZONE) — dokładnie scenariusz "komponent
// dopisany do drzewa, nie dopisany do rejestru", zmierzony osobno od
// pomiaru Playwright (fs, nie DOM).
console.log(`PLIKOW *.TSX W DRZEWIE (poza __tests__): ${plikiWDrzewie.length}, ROZLICZONYCH: ${PLIKI_ROZLICZONE.length}`);
if (plikiNierozliczone.length > 0) {
  console.log(`PLIKI NIEROZLICZONE (nowy komponent, brak w cele-oczekiwane.mjs i w WYKLUCZENIA): ${plikiNierozliczone.length}`);
  for (const plik of plikiNierozliczone) {
    console.log(`  NIEROZLICZONY: ${plik}`);
  }
}
if (rejestrOsieroconyWzgledemDrzewa.length > 0) {
  console.log(`POZYCJE REJESTRU BEZ PLIKU W DRZEWIE (plik usuniety/przeniesiony): ${rejestrOsieroconyWzgledemDrzewa.length}`);
  for (const plik of rejestrOsieroconyWzgledemDrzewa) {
    console.log(`  OSIEROCONY WPIS: ${plik}`);
  }
}
console.log(
  `PONIZEJ PROGU (${PROG_PX}px domyslnie, ${PROG_OKRUSZKA_PX}px dla okruszkow — wyjatek): ${ponizejProgu.length} (OKRUSZKI: ${naruszeniaOkruszkow.length} [zastale ${zastaleOkruszki.length}, nowe ${noweOkruszki.length}], POZOSTALE: ${naruszeniaPozostalych.length} [zastale ${zastalePozostale.length}, nowe ${nowePozostale.length}])`,
);
if (zastaleOkruszki.length > 0) {
  console.log(`ZASTALE OKRUSZKI (na liscie ZASTALE_OKRUSZKI, prog ${PROG_OKRUSZKA_PX}px, nie blokuja kodu 0): ${zastaleOkruszki.length}`);
  for (const cel of zastaleOkruszki) {
    console.log(`  ZASTALY OKRUSZEK: ${cel.element} (${cel.motyw}, ${cel.viewport}px) — ${cel.szerokosc}x${cel.wysokosc}px`);
  }
}
if (zastalePozostale.length > 0) {
  console.log(`ZASTALE POZOSTALE (na liscie ZASTALE_POZOSTALE, prog ${PROG_PX}px, nie blokuja kodu 0): ${zastalePozostale.length}`);
  for (const cel of zastalePozostale) {
    console.log(`  ZASTALE: ${cel.element} (${cel.motyw}, ${cel.viewport}px) — ${cel.szerokosc}x${cel.wysokosc}px`);
  }
}
if (noweNaruszenia.length > 0) {
  console.log("NOWE (poza obiema listami zastalych) - NAZWY:");
  for (const cel of noweNaruszenia) {
    const kategoria = OKRUSZKI_ELEMENTY.has(cel.element) ? "okruszek" : "pozostale";
    console.log(`  NARUSZENIE (${kategoria}): ${cel.element} (${cel.motyw}, ${cel.viewport}px) — ${cel.szerokosc}x${cel.wysokosc}px`);
  }
  console.log(JSON.stringify(noweNaruszenia, null, 2));
}
if (listaOkruszkowZaDuza) {
  console.log(`LISTA ZASTALYCH OKRUSZKOW PRZEKRACZA SUFIT: ${ZASTALE_OKRUSZKI.length} pozycji > ${MAKSYMALNA_LICZBA_ZASTALYCH_OKRUSZKOW} dozwolonych — lista moze sie tylko skracac.`);
}
if (listaPozostalychZaDuza) {
  console.log(`LISTA ZASTALYCH POZOSTALYCH PRZEKRACZA SUFIT: ${ZASTALE_POZOSTALE.length} pozycji > ${MAKSYMALNA_LICZBA_ZASTALYCH_POZOSTALE} dozwolonych — lista moze sie tylko skracac.`);
}

// Cel dwoch list zastalych byl, zeby PRZESTAC
// blokowac czubek — lista, po ktorej bieg i tak jest czerwony na czystym
// drzewie, niczego nie zalatwia (nie da sie jej "doczekac do zera", bo do
// czasu zera bramka stoi czerwona wszystkim). Kod 4 PRZESTAJE byc
// produkowany: gdy WSZYSTKIE naruszenia sa na swoich listach i ZADNA lista
// nie przekracza sufitu, bieg jest ZIELONY (kod 0) — obie listy (zastale
// okruszki, zastale pozostale) sa i tak wypisane w logu WYZEJ,
// niezaleznie od tego, ktory kod wygra (ta sama zasada jak przy brakujacym
// pomiarze: widoczny w stdout niezaleznie od kodu — tu zielen, ktora
// ukrywalaby znane naruszenia, bylaby gorsza od czerwieni; nie chodzi o to,
// zeby przestac je POKAZYWAC, tylko zeby przestaly BLOKOWAC). NOWE
// naruszenie (niepasujace do zadnej listy) i lista dluzsza niz jej sufit
// nadal koncza bieg czerwono — ale TERAZ jednym kodem 3 ("rozjazd" obejmuje
// odtad TAKZE "naruszenie, ktorego rejestr jeszcze nie zna"), nie osobnym
// kodem 4. Kod 4 zostaje nazwany w naglowku pliku jako HISTORYCZNA
// rezerwa numeru — byl martwy, zawsze wygrywal, potem usunieto potrzebe
// jego istnienia: ten skrypt JUZ GO NIE PRODUKUJE).
const rozjazd =
  brakujace.length > 0 ||
  wykonanePomiarow !== oczekiwanePomiarow ||
  brakujaceWCELE.length > 0 ||
  nadmiaroweWCELE.length > 0 ||
  plikiNierozliczone.length > 0 ||
  rejestrOsieroconyWzgledemDrzewa.length > 0 ||
  listaZastanychZaDuza ||
  noweNaruszenia.length > 0;

if (rozjazd) {
  const powody = [];
  if (brakujace.length > 0) powody.push(`${brakujace.length} brakujacych pomiarow z ${oczekiwanePomiarow} oczekiwanych`);
  if (brakujaceWCELE.length > 0) powody.push(`${brakujaceWCELE.length} celow brakujacych w CELE`);
  if (nadmiaroweWCELE.length > 0) powody.push(`${nadmiaroweWCELE.length} celow nadmiarowych w CELE`);
  if (plikiNierozliczone.length > 0) powody.push(`${plikiNierozliczone.length} plikow nierozliczonych w drzewie`);
  if (rejestrOsieroconyWzgledemDrzewa.length > 0) powody.push(`${rejestrOsieroconyWzgledemDrzewa.length} osieroconych wpisow rejestru`);
  if (listaOkruszkowZaDuza) powody.push(`lista zastalych okruszkow ma ${ZASTALE_OKRUSZKI.length} pozycji > ${MAKSYMALNA_LICZBA_ZASTALYCH_OKRUSZKOW} dozwolonych`);
  if (listaPozostalychZaDuza) powody.push(`lista zastalych pozostalych ma ${ZASTALE_POZOSTALE.length} pozycji > ${MAKSYMALNA_LICZBA_ZASTALYCH_POZOSTALE} dozwolonych`);
  if (noweNaruszenia.length > 0) {
    powody.push(
      `${noweNaruszenia.length} NOWE naruszenie(a) poza obiema listami zastalych: ${noweNaruszenia.map((c) => `${c.element} (${c.motyw}, ${c.viewport}px, prog ${progDlaCelu(c.element)}px)`).join("; ")}`,
    );
  }
  console.error(`POMIAR CELOW DOTYKU NIEUDANY (kod 3): ${powody.join(", ")}`);
  process.exit(3);
}
process.exit(0);
