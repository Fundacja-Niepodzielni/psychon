import { expect, test, type Page } from "@playwright/test";

/**
 * Miara wycieku arkusza tokenów nowego frontu na stare strony.
 *
 * Next.js zostawia arkusz w dokumencie po nawigacji klienckiej. Gdyby reguły
 * `tokeny.css` działały na elemencie głównym dokumentu albo na `body`, stara
 * strona otwarta z menu po nowym ekranie dostałaby obrys fokusu nowego frontu,
 * `color-scheme` (w ciemnym trybie systemu — paski przewijania i pola
 * przeglądarki), tokeny i czcionkę `--font`. Świadek: ta sama stara strona
 * (`/panel/profil`) zmierzona na zimno (wejście adresem, arkusz tokenów nie
 * był w ogóle załadowany) i po nawigacji klienckiej z nowego ekranu
 * (`/panel/dalsza-wspolpraca`) musi mieć identyczne wartości.
 *
 * Backend nie jest stawiany: każde żądanie `/api/v1/*` i sesja Auth.js dostają
 * atrapę (wzór: `przelaczenie-grupa-wspolpraca.spec.ts`).
 */

test.use({ colorScheme: "dark" });

const PROFIL = {
  id: 1,
  first_name: "Marta",
  last_name: "Demo",
  email: "marta@demo.pl",
  role: "volunteer",
  phone: null,
  pesel: null,
  address: { street: null, city: null, zip: null },
  access_expires_at: null,
  program_completed_at: "2026-01-15T00:00:00Z",
  product_group: "psychon",
  consents: [],
};

const PUSTA_LISTA_STRONICOWANA = {
  data: [],
  meta: { current_page: 1, per_page: 25, total: 0, last_page: 1 },
};

async function instalujAtrapy(page: Page): Promise<void> {
  // Ogólna atrapa rejestrowana PIERWSZA — Playwright wybiera trasę
  // zarejestrowaną później jako pierwszą.
  await page.route("http://localhost:8000/api/v1/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    }),
  );
  await page.route("http://localhost:8000/api/v1/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: PROFIL }),
    }),
  );
  await page.route("http://localhost:8000/api/v1/cooperation-requests/mine**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(PUSTA_LISTA_STRONICOWANA),
    }),
  );
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        accessToken: "atrapa-tokenu-testowego",
        expiresAt: Date.now() + 3_600_000,
      }),
    }),
  );
  await page.route("**/api/auth/end-session-url", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { url: null } }),
    }),
  );
}

type Pomiar = {
  colorScheme: string;
  bg: string;
  brand: string;
  fontBody: string;
  outlineWidth: string;
  outlineOffset: string;
  outlineStyle: string;
  borderRadius: string;
};

/**
 * Stan starej strony: `html` (color-scheme i tokeny), czcionka `body` oraz
 * obrys fokusu PRZYCISKU STAREJ STRONY po prawdziwym klawiszu Tab (nie
 * `focus()` z kodu — `:focus-visible` ma się włączyć tak jak u osoby
 * nawigującej klawiaturą).
 */
async function zmierzStaraStrone(page: Page): Promise<Pomiar> {
  const przycisk = page.getByRole("button", { name: "Zapisz zmiany" });
  await expect(przycisk).toBeVisible();

  let wFokusie = false;
  for (let i = 0; i < 120 && !wFokusie; i += 1) {
    await page.keyboard.press("Tab");
    wFokusie = await przycisk.evaluate((el) => el === document.activeElement);
  }
  expect(wFokusie, "Tab nie dotarł do przycisku starej strony").toBe(true);

  return page.evaluate(() => {
    const html = getComputedStyle(document.documentElement);
    const przycisk = document.activeElement as HTMLElement;
    const fokus = getComputedStyle(przycisk);
    return {
      colorScheme: html.colorScheme,
      bg: html.getPropertyValue("--bg").trim(),
      brand: html.getPropertyValue("--brand").trim(),
      fontBody: getComputedStyle(document.body).fontFamily,
      outlineWidth: fokus.outlineWidth,
      outlineOffset: fokus.outlineOffset,
      outlineStyle: fokus.outlineStyle,
      borderRadius: fokus.borderRadius,
    };
  });
}

test("stara strona po nowym ekranie nie dostaje tokenów ani fokusu nowego frontu", async ({
  context,
  page: strona,
}) => {
  const kontekst = context;

  // 1. Stara strona na zimno: wejście adresem, arkusz tokenów niezaładowany.
  const zimna = await kontekst.newPage();
  await instalujAtrapy(zimna);
  await zimna.goto("/panel/profil");
  expect(await zimna.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches)).toBe(true);
  const naZimno = await zmierzStaraStrone(zimna);
  // Kontrola pomiaru: na zimno tokenów nowego frontu nie ma w ogóle.
  expect(naZimno.bg).toBe("");
  expect(naZimno.brand).toBe("");
  await zimna.close();

  // 2. Nowy ekran, potem nawigacja kliencka z menu powłoki na starą stronę.
  await instalujAtrapy(strona);
  await strona.goto("/panel/dalsza-wspolpraca");

  const korzenNowego = strona.locator('[data-theme="light"]').first();
  await expect(korzenNowego).toBeAttached();
  const nowyEkran = await korzenNowego.evaluate((el) => {
    const styl = getComputedStyle(el);
    return {
      primary: styl.getPropertyValue("--primary").trim().toLowerCase(),
      bg: styl.getPropertyValue("--bg").trim().toLowerCase(),
      schemat: styl.colorScheme,
    };
  });
  expect(nowyEkran).toEqual({ primary: "#00803a", bg: "#f3f1ed", schemat: "light" });

  // Znacznik przeżyje wyłącznie nawigację kliencką (pełne przeładowanie go kasuje).
  await strona.evaluate(() => {
    (window as unknown as { __znacznikNawigacji: number }).__znacznikNawigacji = 1;
  });

  const nav = strona.getByRole("navigation", { name: "Menu — Panel uczestnika" }).first();
  // „Profil” stoi w grupie „Dotychczasowy panel”, zwiniętej na tym ekranie (brak w niej bieżącej pozycji).
  const dotychczasowy = nav.getByRole("button", { name: /^Dotychczasowy panel \(\d+\)$/ });
  await expect(dotychczasowy).toHaveAttribute("aria-expanded", "false");
  await dotychczasowy.click();
  await expect(dotychczasowy).toHaveAttribute("aria-expanded", "true");
  await nav.getByRole("link", { name: "Profil", exact: true }).click();
  await expect(strona).toHaveURL(/\/panel\/profil$/);
  expect(
    await strona.evaluate(
      () => (window as unknown as { __znacznikNawigacji?: number }).__znacznikNawigacji,
    ),
    "nawigacja nie była kliencka — pomiar nie dotyka ścieżki wycieku",
  ).toBe(1);

  // Arkusz tokenów nadal jest w dokumencie (zostaje po nawigacji klienckiej).
  expect(
    await strona.evaluate(() => document.querySelectorAll('link[rel="stylesheet"], style').length),
  ).toBeGreaterThan(0);

  const poNawigacji = await zmierzStaraStrone(strona);

  expect(poNawigacji).toEqual(naZimno);
  expect(poNawigacji.colorScheme).toBe(naZimno.colorScheme);
  expect(poNawigacji.bg).toBe("");
  expect(poNawigacji.brand).toBe("");
  expect(poNawigacji.fontBody).toBe(naZimno.fontBody);
  expect(poNawigacji.outlineWidth).toBe(naZimno.outlineWidth);
  expect(poNawigacji.outlineOffset).toBe(naZimno.outlineOffset);
  expect(poNawigacji.borderRadius).toBe(naZimno.borderRadius);
});
