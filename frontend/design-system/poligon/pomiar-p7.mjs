// Skrypt pomiarowy P-7 — nie jest testem jednostkowym ani e2e MVP.
// Otwiera lokalny poligon (statyczny build atomów) i mierzy realne
// prostokąty elementów klikalnych przy 412 i 1440 px, w obu motywach.
import { chromium } from "@playwright/test";
import { OCZEKIWANE_CELE } from "./cele-oczekiwane.mjs";

const URL = "http://127.0.0.1:4173/";
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

const browser = await chromium.launch();
const wyniki = [];

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
    `POMIAR P-7 NIEUDANY: ${ponizejProgu.length} ponizej ${PROG_PX}px, ${brakujace.length} brakujacych pomiarow z ${oczekiwanePomiarow} oczekiwanych, ${brakujaceWCELE.length} celow brakujacych w CELE, ${nadmiaroweWCELE.length} celow nadmiarowych w CELE`,
  );
}
process.exit(zawiodl ? 1 : 0);
