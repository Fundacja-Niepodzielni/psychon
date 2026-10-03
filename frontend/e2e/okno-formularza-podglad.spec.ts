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
 * 200 % (widok 640 × 400 px przy dwukrotnej gęstości pikseli). Pełny ekran
 * poniżej 600 px dotyczy WYŁĄCZNIE formularza: krótkie pytanie „Na pewno?”
 * zostaje małym oknem na środku, które mieści się przy 320 px, przy 320 px
 * z obniżonym widokiem (320 × 256 px — 1280 px przy powiększeniu 400 %) i przy
 * powiększeniu 200 % (640 × 400 px), a przewija się w nim wyłącznie środek.
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

/**
 * Pytanie „Porzucić wpisane dane?” przy 390 i 1280 px: „Wróć do formularza” jest
 * przyciskiem głównym (wypełnione tło) z fokusem po otwarciu pytania, „Porzuć” —
 * drugorzędnym w wariancie ostrzegawczym (bez wypełnienia, napis w barwie błędu);
 * czerwony napis na wypełnionym tle nie występuje, a axe nie zgłasza kontrastu.
 */
for (const [nazwa, viewport] of [
  ["390", { width: 390, height: 844 }],
  ["1280", { width: 1280, height: 800 }],
] as const) {
  test.describe(`pytanie „Porzucić wpisane dane?” @${nazwa}`, () => {
    test.use({ viewport });

    test("„Wróć do formularza” główny z fokusem, „Porzuć” drugorzędny ostrzegawczy, axe bez naruszeń kontrastu", async ({ page }) => {
      const okno = await otworzOkno(page);
      await okno.getByRole("textbox", { name: "Powód zmiany" }).fill("Zmiana grupy.");
      await page.keyboard.press("Escape");
      const pytanie = okno.getByRole("group", { name: "Porzucić wpisane dane?" });
      const wroc = pytanie.getByRole("button", { name: "Wróć do formularza" });
      const porzuc = pytanie.getByRole("button", { name: "Porzuć" });
      await expect(wroc).toBeFocused();

      const tlo = (przycisk: typeof wroc) => przycisk.evaluate((el) => getComputedStyle(el).backgroundColor);
      const napis = (przycisk: typeof wroc) => przycisk.evaluate((el) => getComputedStyle(el).color);
      const PRZEZROCZYSTE = ["rgba(0, 0, 0, 0)", "transparent"];
      expect(PRZEZROCZYSTE, "„Wróć do formularza” ma wypełnione tło").not.toContain(await tlo(wroc));
      expect(PRZEZROCZYSTE, "„Porzuć” nie ma wypełnionego tła").toContain(await tlo(porzuc));
      expect(await napis(porzuc), "„Porzuć” ma napis w barwie błędu, inny niż napis przycisku głównego").not.toBe(await napis(wroc));

      const naruszenia = await uruchomAxe(page);
      expect(naruszenia.filter((n) => n.id === "color-contrast")).toEqual([]);
      asercjaBrakPowaznychNaruszen(naruszenia);
    });
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

  test("„Dalej” po „Wstecz” prowadzi na pusty wpis okna: adres ten sam, okno się nie otwiera (decyzja przyjęta)", async ({ page }) => {
    const okno = await otworzOkno(page);
    const adres = page.url();
    await expect.poll(() => page.evaluate(() => (history.state as Record<string, unknown> | null)?.oknoFormularza)).toBeTruthy();
    await page.goBack();
    await expect(okno).toHaveCount(0);
    await page.goForward();
    await page.waitForTimeout(300);
    expect(page.url()).toBe(adres);
    await expect(page.getByRole("dialog")).toHaveCount(0);
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

/**
 * Krótkie pytanie „Na pewno?” (wariant `potwierdzenie`) na tej samej stronie
 * podglądu: poniżej 600 px nie wypełnia ekranu, tylko stoi małym oknem na
 * środku; mieści się w widoku, a przewija się wyłącznie jego środek.
 */
async function otworzPytanie(page: Page, parametry = "") {
  await podlacz(page);
  await page.goto(`${BAZA}/index.html${parametry}`);
  await page.getByRole("button", { name: "Zaznacz warsztat jako zaliczony" }).click();
  const okno = page.getByRole("dialog", { name: "Zaznaczyć warsztat jako zaliczony?" });
  await expect(okno).toBeVisible();
  return okno;
}

async function pomiarPytania(page: Page) {
  return page.evaluate(() => {
    const okno = document.querySelector("dialog")!;
    const ramka = okno.firstElementChild!;
    const srodek = ramka.children[1] as HTMLElement;
    const przyciski = Array.from(okno.querySelectorAll("button"));
    const r = (e: Element) => {
      const p = e.getBoundingClientRect();
      return { top: p.top, bottom: p.bottom, left: p.left, right: p.right, width: p.width, height: p.height };
    };
    return {
      szerokosc: window.innerWidth,
      wysokosc: window.innerHeight,
      modalne: okno.matches(":modal"),
      okno: r(okno),
      przyciski: przyciski.map(r),
      srodek: r(srodek),
      srodekPrzewijany: srodek.scrollHeight > srodek.clientHeight,
      overflowSrodka: getComputedStyle(srodek).overflowY,
      przewijanieWBok: document.documentElement.scrollWidth > window.innerWidth || okno.scrollWidth > okno.clientWidth,
    };
  });
}

const WIDOKI_PYTANIA = [
  { nazwa: "320", viewport: { width: 320, height: 568 }, deviceScaleFactor: 1 },
  { nazwa: "320 przy obniżonym widoku", viewport: { width: 320, height: 284 }, deviceScaleFactor: 1 },
  { nazwa: "320 × 256 (1280 przy powiększeniu 400 %)", viewport: { width: 320, height: 256 }, deviceScaleFactor: 4 },
  { nazwa: "1280 przy powiększeniu 200 %", viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 },
  { nazwa: "599", viewport: { width: 599, height: 800 }, deviceScaleFactor: 1 },
] as const;

for (const widok of WIDOKI_PYTANIA) {
  test.describe(`krótkie pytanie „Na pewno?” @${widok.nazwa}`, () => {
    test.use({ viewport: widok.viewport, deviceScaleFactor: widok.deviceScaleFactor });

    for (const [opis, parametry] of [
      ["krótka treść", ""],
      ["długa treść", "?pytanie=dlugie"],
    ] as const) {
      test(`${opis}: małe okno na środku, w całości w widoku, bez przewijania strony w bok`, async ({ page }) => {
        await otworzPytanie(page, parametry);
        const p = await pomiarPytania(page);
        expect(p.modalne).toBe(true);
        expect(p.okno.top).toBeGreaterThanOrEqual(-0.5);
        expect(p.okno.left).toBeGreaterThanOrEqual(-0.5);
        expect(p.okno.bottom).toBeLessThanOrEqual(p.wysokosc + 0.5);
        expect(p.okno.right).toBeLessThanOrEqual(p.szerokosc + 0.5);
        // Nie pełny ekran: po bokach zostaje margines, okno stoi na środku poziomo.
        expect(p.okno.width).toBeLessThan(p.szerokosc - 1);
        expect(Math.abs(p.okno.left - (p.szerokosc - p.okno.right))).toBeLessThanOrEqual(1);
        expect(Math.abs(p.okno.top - (p.wysokosc - p.okno.bottom))).toBeLessThanOrEqual(1);
        if (parametry === "") expect(p.okno.height).toBeLessThan(p.wysokosc - 1);
        for (const przycisk of p.przyciski) {
          expect(przycisk.top).toBeGreaterThanOrEqual(p.okno.top - 0.5);
          expect(przycisk.bottom).toBeLessThanOrEqual(p.okno.bottom + 0.5);
          expect(przycisk.left).toBeGreaterThanOrEqual(p.okno.left - 0.5);
          expect(przycisk.right).toBeLessThanOrEqual(p.okno.right + 0.5);
        }
        expect(p.overflowSrodka).toBe("auto");
        expect(p.przewijanieWBok).toBe(false);
        if (parametry !== "") expect(p.srodekPrzewijany).toBe(true);
      });
    }

    test("strona pod otwartym pytaniem się nie przewija, a Escape je zamyka", async ({ page }) => {
      const okno = await otworzPytanie(page);
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");
      await page.keyboard.press("Escape");
      await expect(okno).toHaveCount(0);
    });
  });
}

test.describe("granica 600 px: formularz wypełnia ekran poniżej niej, od niej już nie", () => {
  for (const [szerokosc, pelny] of [
    [599, true],
    [600, false],
  ] as const) {
    test(`formularz przy ${szerokosc} px ${pelny ? "wypełnia ekran" : "jest oknem na środku"}`, async ({ page }) => {
      await page.setViewportSize({ width: szerokosc, height: 800 });
      await otworzOkno(page);
      const p = await pomiar(page);
      if (pelny) {
        expect(Math.abs(p.okno.width - p.szerokosc)).toBeLessThanOrEqual(1);
        expect(Math.abs(p.okno.height - p.wysokosc)).toBeLessThanOrEqual(1);
      } else {
        expect(p.okno.width).toBeLessThan(p.szerokosc - 1);
      }
    });
  }
});
