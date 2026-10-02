import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { expect, test, type Frame, type Page } from "@playwright/test";
import { dyrektywaRamek } from "../lib/konfiguracja/odtwarzacz-nagran";
import { asercjaBrakPowaznychNaruszen, uruchomAxe } from "./_axe";

/**
 * Odtwarzacz nagrania w ramce na stronie pokazowej
 * (`design-system/poligon/odtwarzacz.html`) w prawdziwej przeglądarce: ramka
 * z innego pochodzenia mówiąca protokołem odtwarzacza, kontrola pochodzenia
 * i okna nadawcy na prawdziwych komunikatach między ramkami, fokus klawiaturą
 * do ramki i z ramki, axe oraz dyrektywa ramek na stronie z takim nagłówkiem.
 *
 * Żadne żądanie nie wychodzi poza przeglądarkę: wszystkie adresy podaje
 * przechwycenie żądań, a pochodzenia ramek to domena zastrzeżona dla prób.
 * Przeglądarka dodatkowo nie rozwiązuje żadnej nazwy hosta. Prawdziwy
 * odtwarzacz nie jest tu dotykany — atrapa ramki jest w tym pliku.
 *
 * Poligon (Vite) budowany jest do katalogu tymczasowego systemu; gotowy build
 * można wskazać zmienną `ODTWARZACZ_POLIGON_KATALOG`.
 */

const GOTOWY = process.env.ODTWARZACZ_POLIGON_KATALOG;
const KATALOG = normalize(GOTOWY ?? join(tmpdir(), "poligon-odtwarzacz-nagrania"));
const BAZA = "http://poligon.test";
const ODTWARZACZ = "https://odtwarzacz.atrapa.test";
const OBCY = "https://obcy.atrapa.test";
const FILMY = ["https://www.youtube.com", "https://www.youtube-nocookie.com", "https://player.vimeo.com"];
const TYPY: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

test.use({ launchOptions: { args: ["--host-resolver-rules=MAP * ~NOTFOUND"] } });

test.beforeAll(() => {
  if (GOTOWY !== undefined) {
    return;
  }
  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["vite", "build", "--config", "vite.config.poligon.ts", "--outDir", KATALOG, "--emptyOutDir"],
    {
      cwd: process.cwd(),
      stdio: "ignore",
      shell: process.platform === "win32",
      env: { ...process.env, NEXT_PUBLIC_VIDEO_PLAYER_ORIGIN: ODTWARZACZ },
    },
  );
});

/** Atrapa odtwarzacza w ramce: dwa przyciski i protokół komunikatów; zapamiętuje, co i skąd dostała. */
const ATRAPA_ODTWARZACZA = `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><title>Atrapa odtwarzacza</title></head>
<body>
<button id="odtworz" type="button">Odtwórz</button>
<button id="pauza" type="button">Pauza</button>
<script>
  const odebrane = [];
  let pozycja = 0;
  let zegar = null;
  window.odebrane = odebrane;
  function wyslij(event, value) {
    parent.postMessage(JSON.stringify({ context: "player.js", version: "0.0.11", event, value }), "*");
  }
  addEventListener("message", (zdarzenie) => {
    let tresc;
    try { tresc = JSON.parse(zdarzenie.data); } catch { return; }
    odebrane.push({ origin: zdarzenie.origin, zOknaNadrzednego: zdarzenie.source === parent, tresc });
    if (tresc.method === "addEventListener" && tresc.value === "ready") wyslij("ready");
    if (tresc.method === "setCurrentTime") { pozycja = tresc.value; wyslij("seeked"); }
  });
  document.getElementById("odtworz").addEventListener("click", () => {
    if (zegar !== null) return;
    wyslij("play");
    wyslij("timeupdate", { seconds: pozycja, duration: 1800 });
    zegar = setInterval(() => {
      pozycja += 0.25;
      wyslij("timeupdate", { seconds: pozycja, duration: 1800 });
    }, 250);
  });
  document.getElementById("pauza").addEventListener("click", () => {
    clearInterval(zegar);
    zegar = null;
    wyslij("pause");
  });
  wyslij("ready");
</script>
</body></html>`;

/** Wroga ramka: udaje odtwarzacz i zasypuje stronę zdarzeniami odtwarzania. */
const WROGA_RAMKA = `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><title>Wroga ramka</title></head>
<body><p>Ramka spoza odtwarzacza</p>
<script>
  let pozycja = 0;
  window.wyslane = 0;
  function wyslij(event, value) {
    parent.postMessage(JSON.stringify({ context: "player.js", version: "0.0.11", event, value }), "*");
    window.wyslane += 1;
  }
  wyslij("ready");
  wyslij("play");
  setInterval(() => {
    pozycja += 0.1;
    wyslij("ready");
    wyslij("play");
    wyslij("timeupdate", { seconds: pozycja, duration: 1800 });
    wyslij("ended");
    wyslij("error");
  }, 100);
</script>
</body></html>`;

/** Ramka zgłaszająca stronie, że się wczytała. */
const RAMKA_ZGLASZAJACA = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Ramka</title></head>
<body><script>parent.postMessage("wczytana:" + location.origin, "*");</script></body></html>`;

/** Lista adresów do wstawienia w skrypt strony: znacznik zamykający w adresie nie może zakończyć skryptu. */
function listaWSkrypcie(adresy: string[]): string {
  return JSON.stringify(adresy).replace(/<\//g, "<\\/");
}

interface Podlaczenie {
  /** Każde żądanie strony i jej ramek, także to, które nie wyszło poza przeglądarkę. */
  zadania: string[];
}

async function podlacz(page: Page, dodatkowe: Record<string, { tresc: string; naglowki?: Record<string, string> }> = {}): Promise<Podlaczenie> {
  const zadania: string[] = [];
  page.on("request", (zadanie) => zadania.push(zadanie.url()));
  await page.route("**/*", (route) => {
    const adres = new URL(route.request().url());
    const dodatkowa = dodatkowe[`${adres.origin}${adres.pathname}`];
    if (dodatkowa !== undefined) {
      return route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        headers: dodatkowa.naglowki,
        body: dodatkowa.tresc,
      });
    }
    if (adres.origin === ODTWARZACZ && adres.pathname.startsWith("/embed/")) {
      const tresc = adres.pathname.startsWith("/embed/wroga") ? WROGA_RAMKA : ATRAPA_ODTWARZACZA;
      return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: tresc });
    }
    if (adres.origin === OBCY) {
      return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: WROGA_RAMKA });
    }
    if (adres.origin !== BAZA) {
      return route.abort();
    }
    const plik = normalize(join(KATALOG, decodeURIComponent(adres.pathname)));
    if (!plik.startsWith(KATALOG) || !existsSync(plik)) {
      return route.fulfill({ status: 404, body: "" });
    }
    return route.fulfill({
      status: 200,
      contentType: TYPY[extname(plik)] ?? "application/octet-stream",
      body: readFileSync(plik),
    });
  });
  return { zadania };
}

interface Zgloszenia {
  gotowa: number;
  obejrzane: number;
  aktywne: number;
  pozycja: number | null;
  zmiany: boolean[];
  konce: number;
  bledy: string[];
  prosbyOAdres: number;
}

async function zgloszenia(page: Page): Promise<Zgloszenia> {
  return JSON.parse((await page.getByTestId("zgloszenia").textContent()) ?? "{}") as Zgloszenia;
}

function ramkaOdtwarzacza(page: Page) {
  return page.locator('iframe[title="Nagranie lekcji: Wprowadzenie do wywiadu"]');
}

async function oknoOdtwarzacza(page: Page): Promise<Frame> {
  const uchwyt = await ramkaOdtwarzacza(page).elementHandle();
  const okno = await uchwyt?.contentFrame();
  if (!okno) throw new Error("brak ramki odtwarzacza");
  return okno;
}

async function otworz(page: Page, zapytanie = "") {
  await page.goto(`${BAZA}/odtwarzacz.html${zapytanie}`);
  await expect(ramkaOdtwarzacza(page)).toBeVisible();
  await expect.poll(async () => (await zgloszenia(page)).gotowa).toBe(1);
}

function tylkoAdresyProb(zadania: string[]) {
  const dozwolone = [BAZA, ODTWARZACZ, OBCY];
  const inne = zadania.filter((adres) => !dozwolone.includes(new URL(adres).origin));
  expect(inne, `żądania poza adresy prób: ${inne.join(", ")}`).toEqual([]);
  expect(zadania.length).toBeGreaterThan(1);
}

test("prawdziwa ramka z innego pochodzenia: gotowość, start od pozycji, czas z odtwarzania", async ({ page }) => {
  const { zadania } = await podlacz(page);
  await otworz(page, "?start=125");
  const okno = await oknoOdtwarzacza(page);

  // Polecenia dotarły do ramki z pochodzenia strony i od jej okna nadrzędnego.
  const odebrane = await okno.evaluate(
    () => (window as unknown as { odebrane: { origin: string; zOknaNadrzednego: boolean; tresc: { method: string; value: unknown } }[] }).odebrane,
  );
  expect(odebrane.length).toBeGreaterThanOrEqual(7);
  for (const komunikat of odebrane) {
    expect(komunikat.origin).toBe(BAZA);
    expect(komunikat.zOknaNadrzednego).toBe(true);
  }
  expect(odebrane.filter((k) => k.tresc.method === "setCurrentTime").map((k) => k.tresc.value)).toEqual([125]);

  const startZegara = Date.now();
  await okno.locator("#odtworz").click();
  await page.waitForTimeout(3300);
  await okno.locator("#pauza").click();
  const zegar = (Date.now() - startZegara) / 1000;
  await expect.poll(async () => (await zgloszenia(page)).zmiany).toEqual([true, false]);
  const poPauzie = await zgloszenia(page);

  expect(poPauzie.obejrzane).toBeGreaterThanOrEqual(2);
  expect(poPauzie.obejrzane).toBeLessThanOrEqual(zegar);
  expect(poPauzie.aktywne).toBe(poPauzie.obejrzane);
  expect(poPauzie.pozycja).toBeGreaterThan(125);
  expect(poPauzie.pozycja).toBeLessThanOrEqual(125 + zegar);
  expect(poPauzie.zmiany).toEqual([true, false]);
  expect(poPauzie.bledy).toEqual([]);

  // Po pauzie nic nie rośnie.
  await page.waitForTimeout(1500);
  expect(await zgloszenia(page)).toEqual(poPauzie);
  tylkoAdresyProb(zadania);
});

for (const [opis, adres] of [
  ["z obcego pochodzenia", `${OBCY}/ramka.html`],
  ["z dozwolonego pochodzenia, ale z innego okna", `${ODTWARZACZ}/embed/wroga`],
] as const) {
  test(`komunikaty wrogiej ramki ${opis} są odrzucane`, async ({ page }) => {
    const { zadania } = await podlacz(page);
    await otworz(page, `?obca=${encodeURIComponent(adres)}`);
    const wroga = await (await page.getByTestId("obca-ramka").elementHandle())?.contentFrame();
    await expect.poll(() => wroga?.evaluate(() => (window as unknown as { wyslane: number }).wyslane)).toBeGreaterThan(60);

    const stan = await zgloszenia(page);
    expect(stan).toEqual({ gotowa: 1, obejrzane: 0, aktywne: 0, pozycja: null, zmiany: [], konce: 0, bledy: [], prosbyOAdres: 0 });
    tylkoAdresyProb(zadania);
  });
}

test("adres ramki spoza dozwolonego pochodzenia: ramka nie powstaje, błąd zgłoszony", async ({ page }) => {
  const { zadania } = await podlacz(page);
  await page.goto(`${BAZA}/odtwarzacz.html?adres=${encodeURIComponent(`${OBCY}/embed/nagranie`)}`);
  await expect.poll(async () => (await zgloszenia(page)).bledy).toEqual(["adres-niedozwolony"]);

  expect(await page.locator("iframe").count()).toBe(0);
  expect(zadania.filter((adres) => adres.startsWith(OBCY))).toEqual([]);
});

test("atrybuty ramki w przeglądarce i axe bez naruszeń", async ({ page }) => {
  await podlacz(page);
  await otworz(page);
  const ramka = ramkaOdtwarzacza(page);

  await expect(ramka).toHaveAttribute("title", "Nagranie lekcji: Wprowadzenie do wywiadu");
  await expect(ramka).toHaveAttribute("sandbox", "allow-scripts allow-same-origin");
  await expect(ramka).toHaveAttribute("allow", "fullscreen; encrypted-media");
  await expect(ramka).toHaveAttribute("referrerpolicy", "strict-origin");
  await expect(ramka).toHaveAttribute("loading", "eager");
  expect(new URL((await ramka.getAttribute("src")) ?? "").origin).toBe(ODTWARZACZ);

  const naruszenia = await uruchomAxe(page);
  asercjaBrakPowaznychNaruszen(naruszenia);
  expect(naruszenia, JSON.stringify(naruszenia)).toEqual([]);
});

test("axe bez naruszeń także w stanie wczytywania (ramka bez gotowości)", async ({ page }) => {
  await podlacz(page, {
    [`${ODTWARZACZ}/embed/niema`]: { tresc: "<!doctype html><html lang=\"pl\"><head><title>Cisza</title></head><body><p>Cisza</p></body></html>" },
  });
  await page.goto(`${BAZA}/odtwarzacz.html?adres=${encodeURIComponent(`${ODTWARZACZ}/embed/niema`)}`);
  await expect(page.getByRole("status")).toHaveText("Wczytywanie nagrania…");

  const naruszenia = await uruchomAxe(page);
  expect(naruszenia, JSON.stringify(naruszenia)).toEqual([]);
  expect((await zgloszenia(page)).gotowa).toBe(0);
});

test("fokus klawiaturą: do ramki, przez jej kontrolki i z ramki — w obie strony", async ({ page }) => {
  await podlacz(page);
  await otworz(page);
  const okno = await oknoOdtwarzacza(page);
  const naStronie = () => page.evaluate(() => `${document.activeElement?.tagName}:${document.activeElement?.textContent?.trim() ?? ""}`);
  const wRamce = () => okno.evaluate(() => (document.hasFocus() ? (document.activeElement?.id ?? "") : "bez-fokusu"));

  await page.getByRole("button", { name: "Wyzeruj liczniki" }).focus();
  expect(await naStronie()).toBe("BUTTON:Wyzeruj liczniki");

  await page.keyboard.press("Tab");
  expect((await naStronie()).startsWith("IFRAME:")).toBe(true);
  expect(await wRamce()).toBe("odtworz");

  // Klawiatura w ramce działa: odtwarzanie rusza klawiszem.
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await zgloszenia(page)).zmiany).toEqual([true]);

  await page.keyboard.press("Tab");
  expect(await wRamce()).toBe("pauza");
  await page.keyboard.press("Tab");
  expect(await naStronie()).toBe("BUTTON:Kontrolka za odtwarzaczem");
  expect(await wRamce()).toBe("bez-fokusu");

  await page.keyboard.press("Shift+Tab");
  expect((await naStronie()).startsWith("IFRAME:")).toBe(true);
  expect(await wRamce()).toBe("pauza");
  await page.keyboard.press("Shift+Tab");
  expect(await wRamce()).toBe("odtworz");
  await page.keyboard.press("Shift+Tab");
  expect(await naStronie()).toBe("BUTTON:Wyzeruj liczniki");
});

test("dyrektywa ramek: własne, odtwarzacz i film powitalny działają; obce, data i blob są blokowane", async ({ page }) => {
  const dyrektywa = dyrektywaRamek(ODTWARZACZ);
  expect(dyrektywa).toBe(`frame-src 'self' ${ODTWARZACZ} ${FILMY.join(" ")}`);

  const dozwolone = [`${BAZA}/ramka-wlasna.html`, `${ODTWARZACZ}/embed/nagranie`, ...FILMY.map((film) => `${film}/embed/atrapa`)];
  const blokowane = [`${OBCY}/ramka.html`, "https://vimeo.com/123", "data:text/html,<script>parent.postMessage('wczytana:data','*')</script>"];
  const strona = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Dyrektywa ramek</title></head><body>
<script>
  window.wczytane = [];
  window.naruszenia = [];
  addEventListener("message", (z) => { if (typeof z.data === "string" && z.data.startsWith("wczytana:")) window.wczytane.push(z.data.slice(9)); });
  document.addEventListener("securitypolicyviolation", (z) => window.naruszenia.push(z.effectiveDirective + " " + z.blockedURI));
  for (const adres of ${listaWSkrypcie([...dozwolone, ...blokowane])}) {
    const ramka = document.createElement("iframe");
    ramka.src = adres;
    document.body.appendChild(ramka);
  }
  const zBloba = document.createElement("iframe");
  zBloba.src = URL.createObjectURL(new Blob(["<script>parent.postMessage('wczytana:blob','*')</" + "script>"], { type: "text/html" }));
  document.body.appendChild(zBloba);
</script></body></html>`;
  const zgloszenie = { tresc: RAMKA_ZGLASZAJACA };
  const { zadania } = await podlacz(page, {
    [`${BAZA}/dyrektywa.html`]: { tresc: strona, naglowki: { "Content-Security-Policy": dyrektywa } },
    [`${BAZA}/ramka-wlasna.html`]: zgloszenie,
    [`${ODTWARZACZ}/embed/nagranie`]: zgloszenie,
    ...Object.fromEntries(FILMY.map((film) => [`${film}/embed/atrapa`, zgloszenie])),
    "https://vimeo.com/123": zgloszenie,
    [`${OBCY}/ramka.html`]: zgloszenie,
  });
  await page.goto(`${BAZA}/dyrektywa.html`);

  await expect.poll(() => page.evaluate(() => (window as unknown as { wczytane: string[] }).wczytane.length)).toBe(5);
  await expect.poll(() => page.evaluate(() => (window as unknown as { naruszenia: string[] }).naruszenia.length)).toBe(4);
  await page.waitForTimeout(500);
  const wczytane = await page.evaluate(() => (window as unknown as { wczytane: string[] }).wczytane);
  const naruszenia = await page.evaluate(() => (window as unknown as { naruszenia: string[] }).naruszenia);

  expect([...wczytane].sort()).toEqual([BAZA, ODTWARZACZ, ...FILMY].sort());
  expect(naruszenia).toHaveLength(4);
  for (const naruszenie of naruszenia) expect(naruszenie.startsWith("frame-src ")).toBe(true);
  // Dla ramki z adresu `data:` przeglądarka zgłasza zablokowany adres jako pusty albo jako sam schemat.
  expect(naruszenia.map((n) => n.slice(10) || "data").sort()).toEqual(
    ["blob", "data", "https://obcy.atrapa.test", "https://vimeo.com"].sort(),
  );
  // Zablokowana ramka nie wysyła żądania wcale.
  expect(zadania.filter((adres) => adres.startsWith(OBCY) || adres.startsWith("https://vimeo.com"))).toEqual([]);
});

test("ta sama strona bez nagłówka wczytuje wszystkie ramki — blokada pochodzi z dyrektywy, nie z próby", async ({ page }) => {
  const strona = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Bez dyrektywy</title></head><body>
<script>
  window.wczytane = [];
  addEventListener("message", (z) => { if (typeof z.data === "string" && z.data.startsWith("wczytana:")) window.wczytane.push(z.data.slice(9)); });
  for (const adres of ${listaWSkrypcie([`${OBCY}/ramka.html`, "data:text/html,<script>parent.postMessage('wczytana:data','*')</script>"])}) {
    const ramka = document.createElement("iframe");
    ramka.src = adres;
    document.body.appendChild(ramka);
  }
</script></body></html>`;
  await podlacz(page, {
    [`${BAZA}/bez-dyrektywy.html`]: { tresc: strona },
    [`${OBCY}/ramka.html`]: { tresc: RAMKA_ZGLASZAJACA },
  });
  await page.goto(`${BAZA}/bez-dyrektywy.html`);

  await expect.poll(() => page.evaluate(() => (window as unknown as { wczytane: string[] }).wczytane.length)).toBe(2);
  expect((await page.evaluate(() => (window as unknown as { wczytane: string[] }).wczytane)).sort()).toEqual([OBCY, "data"].sort());
});
