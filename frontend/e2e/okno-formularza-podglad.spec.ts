import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { asercjaBrakPowaznychNaruszen, uruchomAxe } from "./_axe";

/**
 * Okno formularza (`Dialog`, wariant `formularz`) w prawdziwej przeglądarce,
 * na stronie podglądu `design-system/organizmy/Dialog/podglad/`: axe bez
 * poważnych naruszeń, okno i przycisk główny w całości na ekranie, przewija
 * się wyłącznie środek, strona pod oknem stoi — przy 320 px, 390 px, 390 px
 * z otwartą klawiaturą (widok obniżony do 400 px) i 1280 px przy powiększeniu
 * 200 % (widok 640 × 400 px przy dwukrotnej gęstości pikseli).
 *
 * Podgląd budowany jest przez Vite do katalogu tymczasowego i podawany przez
 * przechwycenie żądań strony — bez serwera i bez sieci. Gotowy build można
 * wskazać zmienną `OKNO_PODGLAD_KATALOG`.
 */

const GOTOWY = process.env.OKNO_PODGLAD_KATALOG;
const KATALOG = normalize(GOTOWY ?? join(tmpdir(), "podglad-okna-formularza"));
const BAZA = "http://podglad-okna.test";
const TYPY: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

test.beforeAll(() => {
  if (GOTOWY !== undefined) return;
  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["vite", "build", "design-system/organizmy/Dialog/podglad", "--outDir", KATALOG, "--emptyOutDir", "--base", "./"],
    { cwd: process.cwd(), stdio: "ignore", shell: process.platform === "win32" },
  );
});

async function podlacz(page: Page): Promise<void> {
  await page.route("**/*", (route) => {
    const adres = new URL(route.request().url());
    if (adres.origin !== BAZA) return route.abort();
    const sciezka = adres.pathname === "/" ? "/index.html" : adres.pathname;
    const plik = normalize(join(KATALOG, decodeURIComponent(sciezka)));
    if (!plik.startsWith(KATALOG) || !existsSync(plik)) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ status: 200, contentType: TYPY[extname(plik)] ?? "application/octet-stream", body: readFileSync(plik) });
  });
}

async function otworzOkno(page: Page, parametry = "") {
  await podlacz(page);
  await page.goto(`${BAZA}/index.html${parametry}`);
  await page.getByRole("button", { name: "Zmień datę" }).click();
  const okno = page.getByRole("dialog", { name: "Zmień datę dostępu: Marta Demo" });
  await expect(okno).toBeVisible();
  return okno;
}

/** Prostokąty okna, przycisku głównego i środka oraz wymiary widoku. */
async function pomiar(page: Page) {
  return page.evaluate(() => {
    const okno = document.querySelector("dialog")!;
    const przycisk = Array.from(okno.querySelectorAll("button")).find((b) => /Zapisz datę|Zapisywanie/.test(b.textContent ?? ""))!;
    const naglowek = okno.querySelector("h2")!;
    const srodek = okno.querySelector("form > div")! as HTMLElement;
    const r = (e: Element) => {
      const p = e.getBoundingClientRect();
      return { top: p.top, bottom: p.bottom, left: p.left, right: p.right, width: p.width, height: p.height };
    };
    return {
      szerokosc: window.innerWidth,
      wysokosc: window.innerHeight,
      modalne: okno.matches(":modal"),
      okno: r(okno),
      przycisk: r(przycisk),
      naglowek: r(naglowek),
      srodek: r(srodek),
      srodekPrzewijany: srodek.scrollHeight > srodek.clientHeight,
      overflowSrodka: getComputedStyle(srodek).overflowY,
      przewijanieWBok: document.documentElement.scrollWidth > window.innerWidth || okno.scrollWidth > okno.clientWidth,
    };
  });
}

const WIDOKI = [
  { nazwa: "320", viewport: { width: 320, height: 568 }, deviceScaleFactor: 1, pelnyEkran: true },
  { nazwa: "390", viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, pelnyEkran: true },
  { nazwa: "390 z klawiaturą", viewport: { width: 390, height: 400 }, deviceScaleFactor: 1, pelnyEkran: true },
  { nazwa: "1280 przy 200 %", viewport: { width: 640, height: 400 }, deviceScaleFactor: 2, pelnyEkran: false },
] as const;

for (const widok of WIDOKI) {
  test.describe(`okno formularza @${widok.nazwa}`, () => {
    test.use({ viewport: widok.viewport, deviceScaleFactor: widok.deviceScaleFactor });

    test("axe bez poważnych naruszeń: okno otwarte i okno z podsumowaniem błędów", async ({ page }) => {
      const okno = await otworzOkno(page);
      asercjaBrakPowaznychNaruszen(await uruchomAxe(page));

      await okno.getByRole("button", { name: "Zapisz datę" }).click();
      await expect(okno.getByRole("group", { name: "Popraw dane w formularzu" })).toBeFocused();
      asercjaBrakPowaznychNaruszen(await uruchomAxe(page));
    });

    test("okno i przycisk główny w całości na ekranie, przewija się wyłącznie środek, bez przewijania w bok", async ({ page }) => {
      await otworzOkno(page);
      const p = await pomiar(page);
      expect(p.modalne).toBe(true);
      expect(p.okno.top).toBeGreaterThanOrEqual(-0.5);
      expect(p.okno.left).toBeGreaterThanOrEqual(-0.5);
      expect(p.okno.bottom).toBeLessThanOrEqual(p.wysokosc + 0.5);
      expect(p.okno.right).toBeLessThanOrEqual(p.szerokosc + 0.5);
      expect(p.przycisk.top).toBeGreaterThanOrEqual(p.okno.top);
      expect(p.przycisk.bottom).toBeLessThanOrEqual(Math.min(p.okno.bottom, p.wysokosc) + 0.5);
      expect(p.naglowek.top).toBeGreaterThanOrEqual(p.okno.top);
      expect(p.overflowSrodka).toBe("auto");
      expect(p.przewijanieWBok).toBe(false);
      if (widok.pelnyEkran) {
        expect(Math.abs(p.okno.width - p.szerokosc)).toBeLessThanOrEqual(1);
        expect(Math.abs(p.okno.height - p.wysokosc)).toBeLessThanOrEqual(1);
      } else {
        expect(p.okno.width).toBeLessThan(p.szerokosc);
      }
    });

    test("ostatnie pole po fokusie jest widoczne w środku okna, a przycisk główny nadal na ekranie", async ({ page }) => {
      const okno = await otworzOkno(page);
      await okno.getByRole("textbox", { name: "Uwagi dla zespołu" }).focus();
      const wynik = await page.evaluate(() => {
        const pole = document.getElementById("podglad-uwagi")!.getBoundingClientRect();
        const srodek = document.querySelector("dialog form > div")!.getBoundingClientRect();
        return { pole: { top: pole.top, bottom: pole.bottom }, srodek: { top: srodek.top, bottom: srodek.bottom } };
      });
      expect(wynik.pole.top).toBeGreaterThanOrEqual(wynik.srodek.top - 0.5);
      expect(wynik.pole.bottom).toBeLessThanOrEqual(wynik.srodek.bottom + 0.5);
      const p = await pomiar(page);
      expect(p.przycisk.bottom).toBeLessThanOrEqual(p.wysokosc + 0.5);
    });

    test("strona pod otwartym oknem się nie przewija", async ({ page }) => {
      await otworzOkno(page);
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");
      await page.mouse.move(widok.viewport.width / 2, 8);
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(150);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    });
  });
}

test.describe("okno formularza — zachowanie @390", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("fokus startuje na pierwszym polu; błąd pola prowadzi do pola", async ({ page }) => {
    const okno = await otworzOkno(page);
    await expect(okno.getByLabel("Nowa data dostępu")).toBeFocused();
    await okno.getByRole("button", { name: "Zapisz datę" }).click();
    const podsumowanie = okno.getByRole("group", { name: "Popraw dane w formularzu" });
    await expect(podsumowanie).toBeFocused();
    await podsumowanie.getByRole("link", { name: "Wpisz powód zmiany." }).click();
    await expect(okno.getByRole("textbox", { name: "Powód zmiany" })).toBeFocused();
  });

  test("zapis: „Zapisywanie…”, drugie wysłanie nie wychodzi, po sukcesie nowa data, ogłoszenie i fokus na „Zmień datę”", async ({ page }) => {
    const okno = await otworzOkno(page, "?serwer=wolny");
    await okno.getByLabel("Nowa data dostępu").fill("2027-03-01");
    await okno.getByRole("textbox", { name: "Powód zmiany" }).fill("Przedłużony staż w grupie.");
    await okno.getByLabel("Nowa data dostępu").press("Enter");
    const zapisywanie = okno.getByRole("button", { name: "Zapisywanie…" });
    await expect(zapisywanie).toHaveAttribute("aria-disabled", "true");
    await okno.getByLabel("Nowa data dostępu").press("Enter");
    await zapisywanie.click({ force: true });
    await page.keyboard.press("Escape");
    await expect(okno).toBeVisible();
    await expect(page.getByTestId("liczba-wyslan")).toHaveText("1");

    await expect(okno).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByTestId("data-dostepu")).toHaveText("1 marca 2027");
    await expect(page.locator("[data-obszar-ogloszen-panelu]")).toHaveText("Data dostępu zmieniona na 1 marca 2027.");
    await expect(page.getByRole("button", { name: "Zmień datę" })).toBeFocused();
  });

  test("odmowa serwera: okno zostaje z danymi, zdanie błędu na górze z fokusem", async ({ page }) => {
    const okno = await otworzOkno(page, "?serwer=blad");
    await okno.getByLabel("Nowa data dostępu").fill("2027-03-01");
    await okno.getByRole("textbox", { name: "Powód zmiany" }).fill("Przedłużony staż w grupie.");
    await okno.getByRole("button", { name: "Zapisz datę" }).click();
    const podsumowanie = okno.getByRole("group", { name: "Popraw dane w formularzu" });
    await expect(podsumowanie).toBeFocused();
    await expect(podsumowanie).toContainText("Data dostępu nie została zmieniona");
    await expect(okno.getByRole("textbox", { name: "Powód zmiany" })).toHaveValue("Przedłużony staż w grupie.");
  });

  test("Escape z wpisanymi danymi pyta w tym samym oknie; „Wróć do formularza” zachowuje dane", async ({ page }) => {
    const okno = await otworzOkno(page);
    await okno.getByRole("textbox", { name: "Powód zmiany" }).fill("Zmiana grupy.");
    await page.keyboard.press("Escape");
    const pytanie = okno.getByRole("group", { name: "Porzucić wpisane dane?" });
    await expect(pytanie).toBeVisible();
    await expect(pytanie.getByRole("button", { name: "Wróć do formularza" })).toBeFocused();
    await pytanie.getByRole("button", { name: "Wróć do formularza" }).click();
    await expect(okno.getByRole("textbox", { name: "Powód zmiany" })).toHaveValue("Zmiana grupy.");
    await expect(okno.getByRole("textbox", { name: "Powód zmiany" })).toBeFocused();
    await page.keyboard.press("Escape");
    await okno.getByRole("button", { name: "Porzuć" }).click();
    await expect(okno).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Zmień datę" })).toBeFocused();
  });

  test("Escape na otwartej liście pola wyboru zamyka tylko listę", async ({ page }) => {
    const okno = await otworzOkno(page);
    const wybor = okno.getByRole("combobox", { name: "Grupa produktowa" });
    await wybor.focus();
    await page.keyboard.press("ArrowDown");
    await expect(wybor).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(wybor).toHaveAttribute("aria-expanded", "false");
    await expect(okno).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(okno).toHaveCount(0);
  });

  test("przycisk „Wstecz” przeglądarki zamyka samo okno, strona zostaje pod tym samym adresem", async ({ page }) => {
    const okno = await otworzOkno(page);
    const adres = page.url();
    await expect.poll(() => page.evaluate(() => (history.state as Record<string, unknown> | null)?.oknoFormularza)).toBeTruthy();
    await page.goBack();
    await expect(okno).toHaveCount(0);
    expect(page.url()).toBe(adres);
    await expect(page.getByRole("heading", { name: "Podgląd okna formularza" })).toBeVisible();
  });
});

test.describe("okno formularza — przesłona @1280", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("klik w przesłonę nie zamyka formularza", async ({ page }) => {
    const okno = await otworzOkno(page);
    await page.mouse.click(20, 20);
    await expect(okno).toBeVisible();
  });
});
