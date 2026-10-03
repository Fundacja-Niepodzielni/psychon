import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Formularz „Nowa osoba” (`/nowy-front/admin/osoby/nowa`, dane przykładowe): pole „Rola”
 * oferuje tylko role nadawane w PsychON — Wolontariusz, Student, Psycholog prowadzący —
 * także dla Super Admina; strona nie przewija się w bok przy 1280 i 390 px.
 * Zrzut całej strony z otwartą listą ról powstaje tylko, gdy ustawiono `PW_ZRZUTY`.
 */

const API = "http://localhost:8000/api/v1";
const ATRAPA_SESJI = {
  accessToken: ["atrapa", "tokenu", "testowego"].join("-"),
  expiresAt: Date.now() + 3_600_000,
};

async function atrapy(page: Page): Promise<void> {
  await page.route(`${API}/**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) }),
  );
  await page.route(`${API}/me`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { id: 1, role: "super_admin", roles: ["super_admin"], first_name: "Anna" } }),
    }),
  );
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { url: null } }) }),
  );
}

for (const [nazwa, wymiary] of [
  ["1280", { width: 1280, height: 800 }],
  ["390", { width: 390, height: 844 }],
] as const) {
  test(`nowa osoba @${nazwa}: pole „Rola” ma tylko role nadawane w PsychON`, async ({ page }) => {
    await page.setViewportSize(wymiary);
    await atrapy(page);
    await page.goto("/nowy-front/admin/osoby/nowa");

    await page.getByLabel(/^Imię/).fill("Marta");
    await page.getByLabel(/^Nazwisko/).fill("Demo");
    await page.getByLabel(/^Adres e-mail/).fill("marta@demo.pl");
    await page.getByRole("combobox", { name: /^Rola/ }).click();

    await expect(page.getByRole("option")).toHaveText(["Wybierz rolę", "Wolontariusz", "Student", "Psycholog prowadzący"]);
    await expect(page.getByRole("option", { name: "Super Admin" })).toHaveCount(0);
    await expect(page.getByRole("option", { name: "Opiekun Projektu" })).toHaveCount(0);

    const katalog = process.env.PW_ZRZUTY;
    if (katalog) {
      mkdirSync(katalog, { recursive: true });
      await page.screenshot({ path: join(katalog, `administracja--nowa-osoba--${nazwa}.png`), fullPage: true });
    }

    const przewijanieWBok = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(przewijanieWBok, "strona nie przewija się w bok").toBe(false);
  });
}
