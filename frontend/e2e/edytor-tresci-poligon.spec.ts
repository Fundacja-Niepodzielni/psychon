import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { TRESC_PRZYKLADOWA, TRESC_SPOZA_PODZBIORU } from "../design-system/poligon/edytor-przyklady";
import { asercjaBrakPowaznychNaruszen, uruchomAxe } from "./_axe";

/**
 * Edytor treści lekcji na stronie pokazowej (`design-system/poligon/edytor.html`)
 * w prawdziwej przeglądarce: lista żądań sieciowych przy pisaniu i wklejaniu,
 * axe w czterech stanach, cele dotyku przy 1280 i 390, tekst wysyłany bajt w
 * bajt bez edycji i znak w znak po edycji, skróty i jeden przystanek Tab.
 *
 * Poligon (Vite) budowany jest do katalogu tymczasowego systemu i podawany
 * przez przechwycenie żądań strony — bez uruchamiania serwera. Gotowy build
 * można wskazać zmienną `EDYTOR_POLIGON_KATALOG`; `EDYTOR_ZRZUTY` włącza zapis
 * zrzutów ekranu do podanego katalogu.
 */

const GOTOWY = process.env.EDYTOR_POLIGON_KATALOG;
const KATALOG = normalize(GOTOWY ?? join(tmpdir(), "poligon-edytor-tresci"));
const ZRZUTY = process.env.EDYTOR_ZRZUTY;
const BAZA = "http://poligon.test";
// Adres, pod którym nic nie może zostać pobrane: obraz i skrypt z wklejki.
const OBCY = "http://127.0.0.1:9931";
const SZEROKOSCI = [1280, 390] as const;
const TYPY: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

test.beforeAll(() => {
  if (GOTOWY !== undefined) {
    return;
  }
  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["vite", "build", "--config", "vite.config.poligon.ts", "--outDir", KATALOG, "--emptyOutDir"],
    { cwd: process.cwd(), stdio: "ignore", shell: process.platform === "win32" },
  );
});

/** Podaje pliki buildu i zapisuje KAŻDE żądanie strony, także to, które nie wyszło poza przeglądarkę. */
async function podlacz(page: Page): Promise<string[]> {
  const zadania: string[] = [];
  page.on("request", (zadanie) => zadania.push(zadanie.url()));
  await page.route("**/*", (route) => {
    const adres = new URL(route.request().url());
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
  return zadania;
}

function sekcja(page: Page, stan: string) {
  return page.locator(`[data-style-id="edytor-${stan}"]`);
}

function obszar(page: Page, stan: string) {
  return sekcja(page, stan).getByRole("textbox", { name: "Treść lekcji" });
}

async function otworz(page: Page, stan: string, dodatek = "") {
  await page.goto(`${BAZA}/edytor.html?stan=${stan}${dodatek}`);
  await expect(obszar(page, stan)).toBeVisible();
}

async function tekstWysylany(page: Page, stan: string): Promise<string> {
  const zapis = await page.getByTestId(`tekst-${stan}`).textContent();
  return JSON.parse(zapis ?? '""') as string;
}

async function wklejHtml(page: Page, stan: string, html: string) {
  await obszar(page, stan).evaluate((element, tresc) => {
    const dane = new DataTransfer();
    dane.setData("text/html", tresc);
    dane.setData("text/plain", "tekst zwykły wklejki");
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dane, bubbles: true, cancelable: true }));
  }, html);
}

test("sieć: pisanie i wklejanie obcego HTML nie wysyła żadnego żądania poza pliki własnego buildu", async ({ page }) => {
  const zadania = await podlacz(page);
  await otworz(page, "pusty");
  await obszar(page, "pusty").click();
  await page.keyboard.type("Pierwszy akapit z **gwiazdkami** i linkiem https://example.org/ wpisanym ręcznie.");
  await page.keyboard.press("Enter");
  await wklejHtml(
    page,
    "pusty",
    [
      `<h1 style="color:red;text-align:center">Tytuł</h1>`,
      `<p>Akapit <u>podkreślony</u> <span style="color:#f00">kolorowy</span> <b>gruby</b>`,
      `<img src="${OBCY}/zdalny.png" onerror="window.wykonano = true">`,
      `<a href="java` + `script:window.wykonano = true">zły link</a>`,
      `<a href="https://example.org/dobry">dobry link</a></p>`,
      `<script src="${OBCY}/zdalny.js"></script><script>window.wykonano = true</script>`,
      `<iframe src="${OBCY}/ramka.html"></iframe><link rel="stylesheet" href="${OBCY}/styl.css">`,
      `<table><tr><td>komórka</td></tr></table><blockquote>cytat</blockquote><pre>blok kodu</pre>`,
    ].join(""),
  );
  await page.keyboard.type(" dopisek");
  await page.waitForTimeout(1500);

  const tekst = await tekstWysylany(page, "pusty");
  expect(tekst).toContain("[dobry link](https://example.org/dobry)");
  expect(tekst).toContain("zły link");
  expect(tekst).toContain("**gruby**");
  expect(tekst).not.toMatch(/<|script:|zdalny|!\[/);
  expect(await page.evaluate(() => (window as unknown as { wykonano?: boolean }).wykonano)).toBeUndefined();
  const wObszarze = await obszar(page, "pusty").evaluate((element) =>
    [...new Set([...element.querySelectorAll("*")].map((wezel) => wezel.tagName.toLowerCase()))].sort(),
  );
  for (const znacznik of wObszarze) {
    expect(["p", "h2", "h3", "strong", "em", "code", "ul", "ol", "li", "a", "br", "span"], `<${znacznik}> w obszarze edycji`).toContain(
      znacznik,
    );
  }

  const obce = zadania.filter((adres) => !adres.startsWith(`${BAZA}/`));
  expect(obce, `żądania poza własny build: ${obce.join(", ")}`).toEqual([]);
  const bezPliku = zadania.filter((adres) => !existsSync(normalize(join(KATALOG, decodeURIComponent(new URL(adres).pathname)))));
  expect(bezPliku, `żądania o coś spoza plików buildu: ${bezPliku.join(", ")}`).toEqual([]);
  expect(zadania.length).toBeGreaterThan(1);
});

for (const stan of ["pusty", "tresc", "limit"] as const) {
  test(`axe: stan „${stan}” bez naruszeń`, async ({ page }) => {
    await podlacz(page);
    await otworz(page, stan);
    const naruszenia = await uruchomAxe(page);
    asercjaBrakPowaznychNaruszen(naruszenia);
    expect(naruszenia, JSON.stringify(naruszenia)).toEqual([]);
  });
}

test("axe: otwarte pole linku, także z odmową adresu, bez naruszeń", async ({ page }) => {
  await podlacz(page);
  await otworz(page, "tresc");
  await obszar(page, "tresc").click();
  await sekcja(page, "tresc").getByRole("button", { name: "Link", exact: true }).click();
  const adres = sekcja(page, "tresc").getByLabel("Adres linku");
  await expect(adres).toBeFocused();
  let naruszenia = await uruchomAxe(page);
  expect(naruszenia, JSON.stringify(naruszenia)).toEqual([]);

  await adres.fill(" JaVa" + "ScRiPt:alert(1)");
  await page.keyboard.press("Enter");
  await expect(sekcja(page, "tresc").getByText("Ten adres nie może być linkiem.", { exact: false })).toBeVisible();
  naruszenia = await uruchomAxe(page);
  expect(naruszenia, JSON.stringify(naruszenia)).toEqual([]);
  expect(await page.getByTestId("zmiany-tresc").textContent()).toBe("0");
});

for (const szerokosc of SZEROKOSCI) {
  test(`cele dotyku: każda kontrolka paska i pola linku ma co najmniej 44 px przy ${szerokosc}`, async ({ page }) => {
    await page.setViewportSize({ width: szerokosc, height: 900 });
    await podlacz(page);
    await otworz(page, "tresc");
    await obszar(page, "tresc").click();
    await sekcja(page, "tresc").getByRole("button", { name: "Link", exact: true }).click();
    await expect(sekcja(page, "tresc").getByLabel("Adres linku")).toBeVisible();

    const pomiary = await sekcja(page, "tresc").evaluate((element) => {
      const ramka = element.querySelector('[role="toolbar"]')!.parentElement!;
      const cele = [...ramka.querySelectorAll('[role="toolbar"] button, [role="group"] button, [role="group"] input')];
      return cele.map((cel) => {
        const pole = cel.getBoundingClientRect();
        return {
          nazwa: cel.getAttribute("aria-label") ?? cel.textContent ?? cel.id,
          szerokosc: Math.round(pole.width * 100) / 100,
          wysokosc: Math.round(pole.height * 100) / 100,
        };
      });
    });
    expect(pomiary.length).toBeGreaterThanOrEqual(11);
    for (const pomiar of pomiary) {
      expect(pomiar.szerokosc, `szerokość: ${JSON.stringify(pomiar)}`).toBeGreaterThanOrEqual(44);
      expect(pomiar.wysokosc, `wysokość: ${JSON.stringify(pomiar)}`).toBeGreaterThanOrEqual(44);
    }
    // Strona nie przewija się w poziomie: pasek łamie się na wiersze, nie wychodzi poza ekran.
    const przewijanie = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(przewijanie).toBeLessThanOrEqual(0);
  });
}

test("bez edycji tekst wysyłany jest bajt w bajt ten sam i żadna zmiana nie jest zgłaszana", async ({ page }) => {
  await podlacz(page);
  await otworz(page, "spoza");
  await obszar(page, "spoza").click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Control+a");
  await sekcja(page, "spoza").getByRole("button", { name: "Link", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  expect(await page.getByTestId("zmiany-spoza").textContent()).toBe("0");
  expect(await tekstWysylany(page, "spoza")).toBe(TRESC_SPOZA_PODZBIORU);
  expect(await page.evaluate(() => (window as unknown as { wykonano?: boolean }).wykonano)).toBeUndefined();
});

test("treść spoza podzbioru zostaje znak w znak po dopisaniu litery w innym akapicie", async ({ page }) => {
  await podlacz(page);
  await otworz(page, "spoza");
  await obszar(page, "spoza").click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.type("X");
  await expect(page.getByTestId("zmiany-spoza")).toHaveText("1");
  expect(await tekstWysylany(page, "spoza")).toBe(`X${TRESC_SPOZA_PODZBIORU}`);
  await expect(obszar(page, "spoza")).toContainText('<script>window.wykonano = true</script>');
  expect(await obszar(page, "spoza").locator("script, img, table, div, pre").count()).toBe(0);
});

test("skróty klawiszowe: pogrubienie, kursywa, cofnij i ponów; licznik liczy tekst wysyłany", async ({ page }) => {
  await podlacz(page);
  await otworz(page, "pusty");
  const pasek = sekcja(page, "pusty").getByRole("toolbar", { name: "Formatowanie treści" });
  const pogrubienie = pasek.getByRole("button", { name: "Pogrubienie" });
  const kursywa = pasek.getByRole("button", { name: "Kursywa" });
  await expect(pasek.getByRole("button", { name: "Cofnij" })).toBeDisabled();
  await expect(pogrubienie).toHaveAttribute("aria-pressed", "false");

  await obszar(page, "pusty").click();
  await page.keyboard.type("żółw");
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+b");
  await expect(pogrubienie).toHaveAttribute("aria-pressed", "true");
  expect(await tekstWysylany(page, "pusty")).toBe("**żółw**");
  await expect(sekcja(page, "pusty").getByText("8 z 20 000 znaków")).toBeVisible();

  await page.keyboard.press("Control+b");
  await expect(pogrubienie).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Control+i");
  await expect(kursywa).toHaveAttribute("aria-pressed", "true");
  expect(await tekstWysylany(page, "pusty")).toBe("*żółw*");

  await page.keyboard.press("Control+z");
  expect(await tekstWysylany(page, "pusty")).toBe("żółw");
  await expect(pasek.getByRole("button", { name: "Ponów" })).toBeEnabled();
  await page.keyboard.press("Control+Shift+z");
  expect(await tekstWysylany(page, "pusty")).toBe("*żółw*");
});

test("istniejący link: pole pokazuje jego adres, adres da się zmienić, a link usunąć", async ({ page }) => {
  await podlacz(page);
  await otworz(page, "tresc");
  const link = obszar(page, "tresc").getByRole("link", { name: "zasadach programu" });
  const przyciskLinku = sekcja(page, "tresc").getByRole("button", { name: "Link", exact: true });
  const adres = sekcja(page, "tresc").getByLabel("Adres linku");

  await link.click();
  expect(page.url()).toContain("/edytor.html");
  await przyciskLinku.click();
  await expect(adres, `zaznaczenie: ${await page.evaluate(() => String(window.getSelection()))}`).toHaveValue("/panel/kursy");
  await adres.fill("https://example.org/zasady");
  await sekcja(page, "tresc").getByRole("button", { name: "Zmień link" }).click();
  expect(await tekstWysylany(page, "tresc")).toContain("[zasadach programu](https://example.org/zasady)");
  await expect(obszar(page, "tresc")).toBeFocused();

  await link.dblclick();
  await przyciskLinku.click();
  await expect(adres).toHaveValue("https://example.org/zasady");
  await sekcja(page, "tresc").getByRole("button", { name: "Usuń link" }).click();
  const tekst = await tekstWysylany(page, "tresc");
  expect(tekst).toContain("Więcej w zasadach programu i na [stronie fundacji](https://example.org/).");
  // Reszta treści zostaje znak w znak: zmienił się tylko akapit z linkiem.
  expect(tekst.split(String.fromCharCode(10)).slice(0, 13)).toEqual(TRESC_PRZYKLADOWA.split(String.fromCharCode(10)).slice(0, 13));
});

test("pasek jest jednym przystankiem Tab, a strzałki chodzą po jego kontrolkach", async ({ page }) => {
  await podlacz(page);
  await otworz(page, "tresc");
  const pasek = sekcja(page, "tresc").getByRole("toolbar", { name: "Formatowanie treści" });
  await obszar(page, "tresc").click();
  await page.keyboard.press("Shift+Tab");
  const wPasku = () => pasek.evaluate((element) => element.contains(document.activeElement));
  expect(await wPasku()).toBe(true);
  await expect(pasek.getByRole("combobox", { name: "Styl tekstu" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(pasek.getByRole("button", { name: "Pogrubienie" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(pasek.getByRole("button", { name: "Kursywa" })).toBeFocused();
  await page.keyboard.press("End");
  expect(await wPasku()).toBe(true);
  await page.keyboard.press("Home");
  await expect(pasek.getByRole("combobox", { name: "Styl tekstu" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(obszar(page, "tresc")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  expect(await wPasku()).toBe(false);
});

test("silnik edycji przychodzi osobnym plikiem, pobieranym dopiero przez stronę edytora", async ({ page }) => {
  const zadania = await podlacz(page);
  await page.goto(`${BAZA}/index.html`);
  await page.waitForLoadState("networkidle");
  const naStronieGlownej = zadania.filter((adres) => /silnik/i.test(adres));
  expect(naStronieGlownej, naStronieGlownej.join(", ")).toEqual([]);
  await otworz(page, "pusty");
  expect(zadania.filter((adres) => /silnik/i.test(adres)).length).toBeGreaterThanOrEqual(1);
});

test.describe("zrzuty ekranu", () => {
  test.skip(ZRZUTY === undefined, "zapis zrzutów tylko na żądanie (EDYTOR_ZRZUTY)");

  for (const szerokosc of SZEROKOSCI) {
    test(`osiem stanów przy ${szerokosc}`, async ({ page }) => {
      const katalog = ZRZUTY as string;
      mkdirSync(katalog, { recursive: true });
      await page.setViewportSize({ width: szerokosc, height: 900 });
      await podlacz(page);
      const zapisz = async (stan: string, nazwa: string) => {
        await page.waitForTimeout(250);
        await sekcja(page, stan).screenshot({ path: join(katalog, `${nazwa}-${szerokosc}.png`) });
      };

      await otworz(page, "pusty", "&zrzut=1");
      await zapisz("pusty", "1-pusty");

      await otworz(page, "tresc", "&zrzut=1");
      await zapisz("tresc", "2-z-trescia");

      await obszar(page, "tresc").locator("strong").first().dblclick();
      await expect(sekcja(page, "tresc").getByRole("button", { name: "Pogrubienie" })).toHaveAttribute("aria-pressed", "true");
      await zapisz("tresc", "3-zaznaczenie-pogrubienie-wcisniete");

      await sekcja(page, "tresc").getByRole("combobox", { name: "Styl tekstu" }).click();
      await expect(sekcja(page, "tresc").getByRole("listbox")).toBeVisible();
      await zapisz("tresc", "4-lista-stylu-rozwinieta");
      await page.keyboard.press("Escape");

      await obszar(page, "tresc").getByRole("link", { name: "zasadach programu" }).click();
      await expect(sekcja(page, "tresc").getByRole("button", { name: "Pogrubienie" })).toHaveAttribute("aria-pressed", "false");
      await sekcja(page, "tresc").getByRole("button", { name: "Link", exact: true }).click();
      await expect(sekcja(page, "tresc").getByLabel("Adres linku")).toBeVisible();
      await zapisz("tresc", "5-pole-linku");
      await sekcja(page, "tresc").getByLabel("Adres linku").fill("java" + "script:alert(1)");
      await page.keyboard.press("Enter");
      await zapisz("tresc", "5b-pole-linku-odmowa");
      await page.keyboard.press("Escape");

      // Treść ponad limit jest dłuższa niż ekran: zrzut pokazuje sam dół z komunikatem i licznikiem.
      await otworz(page, "limit", "&zrzut=1");
      await sekcja(page, "limit").getByText("Przekroczono limit", { exact: false }).scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      await page.screenshot({ path: join(katalog, `6-blad-limitu-${szerokosc}.png`) });

      await otworz(page, "tresc", "&zrzut=1");
      await obszar(page, "tresc").click();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("ArrowRight");
      await zapisz("tresc", "7-fokus-na-pasku");

      await otworz(page, "spoza", "&zrzut=1");
      await zapisz("spoza", "8-tresc-spoza-podzbioru");
    });
  }
});
