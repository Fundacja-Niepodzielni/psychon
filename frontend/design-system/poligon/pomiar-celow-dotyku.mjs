// Skrypt pomiarowy celow dotyku (prog 44px) — nie jest testem jednostkowym ani e2e MVP.
// Otwiera lokalny poligon (statyczny build atomów) i mierzy realne
// prostokąty elementów klikalnych przy 412 i 1440 px, w obu motywach.
//
// Kody sterowane tego pliku, dokładnie trzy: 0 = zaliczony, 2 = NIE
// ZMIERZONO (z nazwaną przyczyną w stderr), 3 = ZMIERZONE NARUSZENIE (lista
// celów poniżej progu w stdout). Kod spoza {0,2,3} = narzędzie nie doszło do
// końca; przyczyna w stderr, jeżeli środowisko ją wypisało.
//
// Zmierzona, wciąż otwarta właściwość: te dwa importy (niżej) stoją PRZED
// osłoną try (patrz komentarz tam), więc awaria ładowania modułu (np.
// zniknięcie cele-oczekiwane.mjs) kończy proces nieprzechwyconym wyjątkiem —
// domyślnym kodem Node.js, który leży POZA {0,2,3} (zmierzone: kod 1, patrz
// niżej). Od tego commitu ten kod już NIE koliduje z żadnym kodem sterowanym
// (naruszenie to teraz 3, nie 1), więc wołający rozpoznaje go po samej
// przynależności do {0,2,3}, bez specjalnego przypadku. Zmierzone (odbiór
// 2bd5f6b, bieg M6, perturbacja: chwilowe ukrycie cele-oczekiwane.mjs):
// `real 0m3.889s`, `KOD_REALNY=1`, `Error [ERR_MODULE_NOT_FOUND]`, zero linii
// „NIE ZMIERZONO”, 0 z 40 oczekiwanych pomiarów. Ten commit przeniesienia
// importów za try nie robi (przebudowałoby plik już zmierzony sześcioma
// scenariuszami osobno) — luka zostaje nazwana tutaj i w
// scripts/uruchom-pomiar-celow-dotyku.mjs.
import { chromium } from "@playwright/test";
import { OCZEKIWANE_CELE } from "./cele-oczekiwane.mjs";

// Port z PORT_POLIGONU (domyślnie 4173) — ta sama zmienna i ta sama wartość
// domyślna, jaką ustawia scripts/uruchom-pomiar-celow-dotyku.mjs, zanim uruchomi ten
// plik jako dziecko. Jedno źródło prawdy: gdyby oba pliki miały własną
// domyślną wartość portu, rozjazd między nimi nie dawałby żadnego błędu, tylko
// cichy ECONNREFUSED albo pomiar pustego adresu.
const PORT = process.env.PORT_POLIGONU || "4173";
const URL = `http://127.0.0.1:${PORT}/`;
const PROG_PX = 44; // obie strony prostokąta — patrz filtr `ponizejProgu` niżej
const VIEWPORTY = [
  { nazwa: "412", width: 412, height: 900 },
  { nazwa: "1440", width: 1440, height: 900 },
];
const MOTYWY = ["light", "dark"];

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
];

// Wszystko od uruchomienia przeglądarki aż po ostatnie zamknięcie strony jest
// w try/catch z JEDNEGO powodu: kod 3 poniżej ma znaczyć WYŁĄCZNIE "pomiar się
// odbył i wykrył naruszenia". Brak przeglądarki (np. zła ścieżka w
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
  for (const motyw of MOTYWY) {
    for (const viewport of VIEWPORTY) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      await page.goto(`${URL}?theme=${motyw}`);
      await page.waitForSelector('[data-testid="button-primary"]');
      for (const cel of CELE) {
        const box = await page.locator(cel.selektor).boundingBox();
        wyniki.push({
          motyw,
          viewport: viewport.nazwa,
          element: cel.nazwa,
          szerokosc: box ? Math.round(box.width * 100) / 100 : null,
          wysokosc: box ? Math.round(box.height * 100) / 100 : null,
        });
      }
      await page.close();
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

// Bramka 44px porównuje OBA wymiary, nie tylko wysokość — cel wąski (np.
// 20px szerokości) przy poprawnej wysokości jest tak samo niedotykalny jak
// cel niski. Wcześniej skrypt zbierał `szerokosc`, drukował ją w JSON i nigdy
// z niczym nie porównywał — 20px szerokości przy 44px wysokości dawało exit 0.
const ponizejProgu = wyniki.filter(
  (w) => (w.wysokosc !== null && w.wysokosc < PROG_PX) || (w.szerokosc !== null && w.szerokosc < PROG_PX),
);

console.log(`\nOCZEKIWANE POMIAROW: ${oczekiwanePomiarow}`);
console.log(`WYKONANE POMIAROW: ${wykonanePomiarow}`);
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
console.log(`PONIZEJ ${PROG_PX}px (WYSOKOSC LUB SZEROKOSC): ${ponizejProgu.length}`);
if (ponizejProgu.length > 0) {
  console.log(JSON.stringify(ponizejProgu, null, 2));
}

const zawiodl =
  ponizejProgu.length > 0 ||
  brakujace.length > 0 ||
  wykonanePomiarow !== oczekiwanePomiarow ||
  brakujaceWCELE.length > 0 ||
  nadmiaroweWCELE.length > 0;
if (zawiodl) {
  console.error(
    `POMIAR CELOW DOTYKU NIEUDANY: ${ponizejProgu.length} ponizej ${PROG_PX}px, ${brakujace.length} brakujacych pomiarow z ${oczekiwanePomiarow} oczekiwanych, ${brakujaceWCELE.length} celow brakujacych w CELE, ${nadmiaroweWCELE.length} celow nadmiarowych w CELE`,
  );
}
process.exit(zawiodl ? 3 : 0);
