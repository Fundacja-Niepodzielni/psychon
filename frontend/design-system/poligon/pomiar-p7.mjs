// Skrypt pomiarowy P-7 — nie jest testem jednostkowym ani e2e MVP.
// Otwiera lokalny poligon (statyczny build atomów) i mierzy realne
// prostokąty elementów klikalnych przy 412 i 1440 px, w obu motywach.
import { chromium } from "@playwright/test";

const URL = "http://127.0.0.1:4173/";
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

const ponizej44 = wyniki.filter((w) => w.wysokosc !== null && w.wysokosc < 44);
console.log(`\nRAZEM POMIAROW: ${wyniki.length}`);
console.log(`PONIZEJ 44px WYSOKOSCI: ${ponizej44.length}`);
if (ponizej44.length > 0) {
  console.log(JSON.stringify(ponizej44, null, 2));
}
