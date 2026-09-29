// Kryterium 6, pelna sciezka: prawdziwy `zaloguj(page, rola)` (kompilowany z
// `_logowanie.ts` przez tsx) na ZYWO dzialajacym stosie front+zaplecze+IdP,
// dla project_manager i super_admin (minimum wymagane listem).
import { chromium } from "playwright";
process.env.PSYCHON_E2E_HASLO = process.argv[2];
const { zaloguj } = await import("../_logowanie.ts");

const browser = await chromium.launch({ headless: true, ignoreHTTPSErrors: true });
let ok = 0;
for (const rola of ["project_manager", "super_admin"]) {
  const context = await browser.newContext({ baseURL: "http://localhost:3000", ignoreHTTPSErrors: true });
  const page = await context.newPage();
  try {
    await zaloguj(page, rola);
    const url = page.url();
    console.log(`[admin-front] ${rola} -> zaloguj() OK, wyladowano na ${url}`);
    ok++;
  } catch (e) {
    console.log(`[admin-front] ${rola} -> BLAD: ${e.message}`);
  }
  await context.close();
}
await browser.close();
console.log(`[admin-front-podsumowanie] ${ok}/2`);
process.exitCode = ok === 2 ? 0 : 1;
