import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Samodzielny `StatTile` (poligon, `#m10-zwykly` i `#m10-dominujacy`), czyli
 * poza `StatRow`, który na pulpitach sam ustawia kolor etykiety: obliczony
 * `color` etykiety równy obliczonemu `--muted`, `font-weight` 400 i
 * `font-size` równy obliczonemu `--fs-11` (13 px). Wzorzec mierzony na
 * elemencie próbnym obok etykiety, nie literały.
 *
 * Poligon (Vite) budowany jest synchronicznie do katalogu pod `test-results`
 * i podawany przez przechwycenie żądań strony — bez uruchamiania serwera.
 */

const KATALOG = join(process.cwd(), "test-results", "poligon-kafel-etykieta");
const TYPY: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

test.beforeAll(() => {
  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["vite", "build", "--config", "vite.config.poligon.ts", "--outDir", KATALOG, "--emptyOutDir"],
    { cwd: process.cwd(), stdio: "ignore", shell: process.platform === "win32" },
  );
});

for (const id of ["m10-zwykly", "m10-dominujacy"]) {
  test(`samodzielny StatTile ${id}: etykieta w kolorze --muted, waga 400, rozmiar --fs-11`, async ({ page }) => {
    await page.route("http://poligon.test/**", (route) => {
      const sciezka = decodeURIComponent(new URL(route.request().url()).pathname);
      const plik = normalize(join(KATALOG, sciezka === "/" ? "index.html" : sciezka));
      if (!plik.startsWith(KATALOG) || !existsSync(plik)) return route.fulfill({ status: 404, body: "" });
      return route.fulfill({
        status: 200,
        contentType: TYPY[extname(plik)] ?? "application/octet-stream",
        body: readFileSync(plik),
      });
    });
    await page.goto("http://poligon.test/index.html");

    const etykieta = page.locator(`label[for="${id}"]`);
    await expect(etykieta).toHaveCount(1);
    const wynik = await etykieta.evaluate((el) => {
      const s = getComputedStyle(el);
      const probka = document.createElement("span");
      probka.style.cssText = "color:var(--muted);font-size:var(--fs-11);position:absolute;visibility:hidden";
      el.parentElement!.appendChild(probka);
      const wz = getComputedStyle(probka);
      const out = {
        kolor: s.color,
        wzorzecKolor: wz.color,
        grubosc: s.fontWeight,
        rozmiar: s.fontSize,
        wzorzecRozmiar: wz.fontSize,
        stoiWStatRow: el.closest("[class*='komorka']") !== null,
      };
      probka.remove();
      return out;
    });
    const opis = JSON.stringify(wynik);
    expect(wynik.stoiWStatRow, opis).toBe(false);
    expect(wynik.wzorzecKolor, opis).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    expect(wynik.kolor, opis).toBe(wynik.wzorzecKolor);
    expect(wynik.grubosc, opis).toBe("400");
    expect(wynik.rozmiar, opis).toBe(wynik.wzorzecRozmiar);
    expect(wynik.wzorzecRozmiar, opis).toBe("13px");
  });
}
