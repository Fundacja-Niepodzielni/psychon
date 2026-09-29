// Pomiar pomocnika logowania na ZYWO dzialajacym froncie (Next.js dev,
// prawdziwy `/logowanie` -> prawdziwy ekran logowania IdP -> powrot przez
// Auth.js), BEZ zaplecza Laravel (zaplecze zostaje niedostepne w tym pomiarze:
// jego uruchomienie wymaga pliku zmiennych srodowiskowych backendu, ktorego
// ten bieg celowo nie dotyka). Mierzy noge
// "przegladarka -> IdP -> front": front dostaje sesje z rola DOKLADNIE z
// tokenu (Auth.js `session.user.roles`, zobacz `auth.ts`), nie z zadnej bazy
// (frontu w tym pomiarze nie ma z czym sprawdzic w bazie - zaplecza nie ma).
//
// Nie czeka na przekierowanie z `/logowanie` na strone wg roli
// (`homeForRole`): TA konkretna decyzja frontu (dokad wyslac po zalogowaniu)
// odpytuje zaplecze (`NEXT_PUBLIC_API_URL`), ktorego tu nie ma - front zostaje
// na `/logowanie`, i to jest oczekiwane w tym pomiarze, nie usterka.
import { chromium } from "playwright";

const OCZEKIWANA_ROLA_REALMU = {
  super_admin: "admin-fundacja",
  project_manager: "koordynator",
  instructor: "prowadzacy",
  volunteer: "wolontariusz",
  student: "pacjent",
};

const USERNAME = {
  super_admin: "e2e-admin-fundacja",
  project_manager: "e2e-koordynator",
  instructor: "e2e-prowadzacy",
  volunteer: "e2e-wolontariusz",
  student: "e2e-pacjent",
};

async function zalogujNaZywymFroncie(page, rola) {
  const haslo = process.env.PSYCHON_E2E_HASLO;
  await page.goto("/logowanie");
  await page.waitForURL(/\/realms\/[^/]+\/protocol\/openid-connect\/auth/, { timeout: 15_000 });
  await page.locator("#username").fill(USERNAME[rola]);
  await page.locator("#password").fill(haslo);
  await page.locator("#kc-login").click();
  // Front→zaplecze (przekierowanie wg roli) wymaga zaplecza, ktorego tu nie ma;
  // czekamy wylacznie na opuszczenie samego IdP - dowod, ze token wrocil i
  // sesja Auth.js powstala.
  await page.waitForURL((url) => !url.pathname.startsWith("/realms/"), { timeout: 15_000 });
  const sesja = await page.evaluate(() => fetch("/api/auth/session").then((r) => r.json()));
  return sesja;
}

const role = Object.keys(OCZEKIWANA_ROLA_REALMU);
const browser = await chromium.launch({ headless: true });
let ok = 0;
for (const rola of role) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, baseURL: "http://localhost:3000" });
  const page = await context.newPage();
  try {
    const sesja = await zalogujNaZywymFroncie(page, rola);
    const roleWSesji = sesja?.user?.roles ?? [];
    const maRole = roleWSesji.includes(OCZEKIWANA_ROLA_REALMU[rola]);
    console.log(`[front] ${rola} -> sesja.user.roles=${JSON.stringify(roleWSesji)} oczekiwana=${OCZEKIWANA_ROLA_REALMU[rola]} obecna=${maRole}`);
    if (maRole) ok++;
  } catch (e) {
    console.log(`[front] ${rola} -> BLAD: ${e.message}`);
  }
  await context.close();
}
console.log(`[front-podsumowanie] ${ok}/${role.length} rol z poprawna rola widoczna w sesji frontu (przegladarka->IdP->front)`);
await browser.close();
process.exitCode = ok === role.length ? 0 : 1;
