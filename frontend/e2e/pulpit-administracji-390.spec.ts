import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Miara dla pulpitu administracji na wąskim ekranie (grupa `pulpitAdministracji`
 * włączona w `lib/przelaczenie/grupy.ts`):
 * - wiersze listy „Co czeka na decyzję” przy 390 px i 1280 px: element tytułu
 *   ma co najmniej 40% szerokości wiersza, mieści się w dwóch liniach, a strona
 *   nie przewija się w poziomie (dawniej długi link akcji ściskał tytuł do
 *   jednej litery w wierszu);
 * - odmiana liczebników przy liczbach 1, 2-4, 5 i więcej (w tym 12-14 i 22):
 *   kafle, liczniki wierszy i suma listy;
 * - plakietka wiersza: pigułka na szerokość treści, w linii tytułu przed nim;
 * - akcja wiersza: rola `link`, pełna nazwa dla czytnika, widoczne „Otwórz”
 *   (1280) albo „Otwórz ›” (390);
 * - brak dubla „Zgłoszenia rekrutacyjne” poza listą;
 * - ten sam wiersz listy na drugim ekranie (formy stażu) przy 390 i 1280 px.
 *
 * Atrapy API jak w `przelaczenie-grupa-administracja-b1.spec.ts`. Zrzuty
 * ekranu powstają tylko wtedy, gdy ustawiono `PW_ZRZUTY` (katalog docelowy).
 */

const ATRAPA_SESJI = { accessToken: "atrapa-tokenu-testowego", expiresAt: Date.now() + 3_600_000 };

const WASKI = { width: 390, height: 844 };
const SZEROKI = { width: 1280, height: 800 };

interface DanePulpitu {
  counters: { participants: number; completed: number; certificates: number };
  queues: { key: string; count: number; link: string }[];
}

/** Małe liczby w trzech formach: 1, 2-4 i 0 (odmienia się jak 5); suma 3. */
const MALE: DanePulpitu = {
  counters: { participants: 3, completed: 1, certificates: 1 },
  queues: [
    { key: "applications", count: 1, link: "/admin/uczestniczki" },
    { key: "internship_entries", count: 2, link: "/admin/staz" },
    { key: "profiles", count: 0, link: "/admin/profile" },
    { key: "questions", count: 0, link: "/prowadzacy/pytania" },
  ],
};

/** Duże liczby: 5, 12 (wyjątek 12-14), 22 (znów „kilka”), 2; suma 41. */
const DUZE: DanePulpitu = {
  counters: { participants: 12, completed: 22, certificates: 25 },
  queues: [
    { key: "applications", count: 5, link: "/admin/uczestniczki" },
    { key: "internship_entries", count: 12, link: "/admin/staz" },
    { key: "profiles", count: 22, link: "/admin/profile" },
    { key: "questions", count: 2, link: "/prowadzacy/pytania" },
  ],
};

/** Same liczby od 5 w górę: stare i nowe brzmienie jednostek jest identyczne, więc zrzuty mierzą wyłącznie układ. */
const PIATKI: DanePulpitu = {
  counters: { participants: 5, completed: 7, certificates: 9 },
  queues: [
    { key: "applications", count: 5, link: "/admin/uczestniczki" },
    { key: "internship_entries", count: 7, link: "/admin/staz" },
    { key: "profiles", count: 0, link: "/admin/profile" },
    { key: "questions", count: 9, link: "/prowadzacy/pytania" },
  ],
};

const NAZWY = [
  "Zgłoszenia rekrutacyjne",
  "Dyżury czekające na decyzję",
  "Profile prowadzących do decyzji",
  "Pytania bez odpowiedzi",
];

const FORMA_DLUGA = {
  id: 7,
  name: "Dyżur telefoniczny w godzinach wieczornych z dodatkowym opisem do pomiaru zawijania",
  description: "Rozmowa z osobą w kryzysie, prowadzona przez wolontariusza pod opieką psychologa.",
  is_active: true,
  sort_order: 1,
  created_at: null,
  updated_at: null,
};

async function instalujAtrapy(page: Page, pulpit: DanePulpitu): Promise<void> {
  // Ogólna atrapa pierwsza: Playwright bierze trasę zarejestrowaną PÓŹNIEJ jako pierwszą.
  await page.route("http://localhost:8000/api/v1/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [], meta: { current_page: 1, per_page: 25, total: 0, last_page: 1 } }),
    }),
  );
  await page.route("http://localhost:8000/api/v1/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { id: 1, role: "project_manager", program_completed_at: null } }),
    }),
  );
  await page.route("http://localhost:8000/api/v1/admin/dashboard", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: pulpit }) }),
  );
  await page.route("http://localhost:8000/api/v1/admin/internship/forms", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [FORMA_DLUGA] }) }),
  );
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { url: null } }) }),
  );
}

async function zrzut(page: Page, nazwa: string): Promise<void> {
  const katalog = process.env.PW_ZRZUTY;
  if (!katalog) return;
  mkdirSync(katalog, { recursive: true });
  await page.screenshot({ path: join(katalog, `${nazwa}.png`), fullPage: true });
}

/** Liczba linii tekstu elementu: wysokość pudełka / obliczona wysokość linii. */
async function liczbaLinii(element: Locator): Promise<number> {
  return element.evaluate((el) => {
    const styl = getComputedStyle(el);
    const linia = parseFloat(styl.lineHeight) || parseFloat(styl.fontSize) * 1.5;
    return Math.round(el.getBoundingClientRect().height / linia);
  });
}

async function bezPrzewijaniaPoziomego(page: Page): Promise<void> {
  const miary = await page.evaluate(() => ({
    dokument: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
  expect(miary, "przewijanie poziome strony (px ponad szerokość okna)").toEqual({ dokument: 0, body: 0 });
}

function listaSpraw(page: Page): Locator {
  return page.getByRole("region", { name: "Co czeka na decyzję" });
}

/** Tekst plakietki wiersza: element obok tytułu z jednym z dwóch napisów stanu. */
async function tekstPlakietki(wiersz: Locator): Promise<string> {
  const napis = wiersz.getByText(/^(czeka na decyzję|brak spraw)$/);
  await expect(napis).toHaveCount(1);
  return (await napis.textContent())!;
}

async function sprawdzWiersze(page: Page): Promise<void> {
  const wiersze = listaSpraw(page).locator('[data-wariant="z-licznikiem"]');
  await expect(wiersze).toHaveCount(NAZWY.length);
  for (const [i, nazwa] of NAZWY.entries()) {
    const wiersz = wiersze.nth(i);
    const tytul = wiersz.getByText(nazwa, { exact: true });
    const pudelkoWiersza = await wiersz.boundingBox();
    const pudelkoTytulu = await tytul.boundingBox();
    expect(pudelkoWiersza, `wiersz „${nazwa}”`).not.toBeNull();
    expect(pudelkoTytulu, `tytuł „${nazwa}”`).not.toBeNull();
    const udzial = pudelkoTytulu!.width / pudelkoWiersza!.width;
    expect(
      udzial,
      `„${nazwa}”: szerokość tytułu ${pudelkoTytulu!.width} px z ${pudelkoWiersza!.width} px wiersza`,
    ).toBeGreaterThanOrEqual(0.4);
    const linie = await liczbaLinii(tytul);
    expect(linie, `„${nazwa}”: liczba linii tytułu`).toBeLessThanOrEqual(2);
    const wuski = (page.viewportSize()?.width ?? 0) < 640;
    await sprawdzPlakietke(wiersz, tytul, await tekstPlakietki(wiersz), wuski);
    await sprawdzAkcje(page, wiersz, nazwa, wuski);
  }
  await bezPrzewijaniaPoziomego(page);
}

/** Tekst widoczny elementu (bez ukrytych fragmentów, w odróżnieniu od textContent). */
async function widocznyTekst(element: Locator): Promise<string> {
  return element.evaluate((el) => (el as HTMLElement).innerText.replace(/\s+/g, " ").trim());
}

/**
 * Plakietka wiersza: węższa niż połowa wiersza, jej lewa krawędź przed tytułem,
 * obie w tej samej linii (środek plakietki w pionie mieści się w pudełku tytułu).
 * Przy 390 px tytuł może zawinąć się pod plakietkę — wtedy sprawdzana jest tylko szerokość.
 */
async function sprawdzPlakietke(wiersz: Locator, tytul: Locator, tekst: string, wuskiEkran: boolean): Promise<void> {
  const plakietka = wiersz.getByText(tekst, { exact: true });
  const pWiersza = (await wiersz.boundingBox())!;
  const pPlakietki = (await plakietka.boundingBox())!;
  const pTytulu = (await tytul.boundingBox())!;
  expect(pPlakietki.width / pWiersza.width, `plakietka „${tekst}”: szerokość względem wiersza`).toBeLessThan(0.5);
  if (wuskiEkran) return;
  expect(pPlakietki.x, `plakietka „${tekst}” przed tytułem`).toBeLessThan(pTytulu.x);
  const srodek = pPlakietki.y + pPlakietki.height / 2;
  expect(srodek, `plakietka „${tekst}” w linii tytułu`).toBeGreaterThanOrEqual(pTytulu.y);
  expect(srodek).toBeLessThanOrEqual(pTytulu.y + pTytulu.height);
}

/** Akcja wiersza: rola `link`, nazwa dostępna = pełna nazwa, widoczny krótki napis. */
async function sprawdzAkcje(page: Page, wiersz: Locator, nazwa: string, wuskiEkran: boolean): Promise<void> {
  const odnosnik = wiersz.getByRole("link", { name: `Otwórz: ${nazwa}`, exact: true });
  await expect(odnosnik, `akcja wiersza „${nazwa}”`).toHaveCount(1);
  const widoczny = await widocznyTekst(odnosnik);
  expect(widoczny, `widoczny napis akcji „${nazwa}”`).toBe(wuskiEkran ? "Otwórz ›" : "Otwórz");
}

/** Licznik wiersza: liczba i jednostka stoją w osobnych elementach (margines, nie spacja). */
function licznikWiersza(page: Page, nazwa: string, liczba: string, jednostka: string): Locator {
  const wiersz = listaSpraw(page).locator('[data-wariant="z-licznikiem"]').filter({ hasText: nazwa });
  return wiersz.getByText(new RegExp(`^${liczba}\\s*${jednostka}$`));
}

for (const [nazwaWidoku, okno] of [
  ["390", WASKI],
  ["1280", SZEROKI],
] as const) {
  test.describe(`pulpit administracji ${nazwaWidoku} px`, () => {
    test.use({ viewport: okno });

    test("małe liczby: czytelne tytuły, „1 sprawa”, „2 sprawy”, suma „3 sprawy”, „3 osoby”, „1 osoba”, „1 certyfikat”", async ({
      page,
    }) => {
      await instalujAtrapy(page, MALE);
      await page.goto("/admin");
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.getByRole("heading", { level: 1, name: "Pulpit administracji" })).toBeVisible();
      await expect(listaSpraw(page)).toBeVisible();
      await zrzut(page, `pulpit-${nazwaWidoku}-male`);

      await sprawdzWiersze(page);

      await expect(licznikWiersza(page, NAZWY[0], "1", "sprawa")).toBeVisible();
      await expect(licznikWiersza(page, NAZWY[1], "2", "sprawy")).toBeVisible();
      await expect(licznikWiersza(page, NAZWY[2], "0", "spraw")).toBeVisible();
      await expect(listaSpraw(page).getByText(/^Razem\s*3\s*sprawy$/)).toBeVisible();
      // Dolna karta-dubel „Zgłoszenia rekrutacyjne / Stan / … zgłoszeń” nie istnieje:
      // ten napis występuje tylko jako nazwa wiersza listy.
      await expect(page.getByText("Zgłoszenia rekrutacyjne")).toHaveCount(1);
      await expect(listaSpraw(page).getByText("Zgłoszenia rekrutacyjne")).toHaveCount(1);
      await expect(page.getByRole("article")).toHaveCount(0);

      await expect(page.locator("#pulpit-uczestnicy")).toHaveText(/3\s*osoby/);
      await expect(page.locator("#pulpit-ukonczenia")).toHaveText(/1\s*osoba/);
      await expect(page.locator("#pulpit-certyfikaty")).toHaveText(/1\s*certyfikat(?!y)/);
    });

    test("duże liczby: „5 spraw”, „12 spraw”, „22 sprawy”, „12 osób”, „22 osoby”, „25 certyfikatów”, suma „41 spraw”", async ({
      page,
    }) => {
      await instalujAtrapy(page, DUZE);
      await page.goto("/admin");
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(listaSpraw(page)).toBeVisible();
      await zrzut(page, `pulpit-${nazwaWidoku}-duze`);

      await sprawdzWiersze(page);

      await expect(licznikWiersza(page, NAZWY[0], "5", "spraw")).toBeVisible();
      await expect(licznikWiersza(page, NAZWY[1], "12", "spraw")).toBeVisible();
      await expect(licznikWiersza(page, NAZWY[2], "22", "sprawy")).toBeVisible();
      await expect(licznikWiersza(page, NAZWY[3], "2", "sprawy")).toBeVisible();
      await expect(listaSpraw(page).getByText(/^Razem\s*41\s*spraw$/)).toBeVisible();

      await expect(page.locator("#pulpit-uczestnicy")).toHaveText(/12\s*osób/);
      await expect(page.locator("#pulpit-ukonczenia")).toHaveText(/22\s*osoby/);
      await expect(page.locator("#pulpit-certyfikaty")).toHaveText(/25\s*certyfikatów/);
    });

    test("liczby od 5 w górę: „5 spraw”, „0 spraw”, suma „21 spraw”, „5 osób”, „9 certyfikatów”", async ({
      page,
    }) => {
      await instalujAtrapy(page, PIATKI);
      await page.goto("/admin");
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(listaSpraw(page)).toBeVisible();
      await zrzut(page, `pulpit-${nazwaWidoku}-rowne`);

      await sprawdzWiersze(page);

      await expect(licznikWiersza(page, NAZWY[0], "5", "spraw")).toBeVisible();
      await expect(licznikWiersza(page, NAZWY[2], "0", "spraw")).toBeVisible();
      await expect(licznikWiersza(page, NAZWY[3], "9", "spraw")).toBeVisible();
      await expect(listaSpraw(page).getByText(/^Razem\s*21\s*spraw$/)).toBeVisible();
      await expect(page.locator("#pulpit-uczestnicy")).toHaveText(/5\s*osób/);
      await expect(page.locator("#pulpit-certyfikaty")).toHaveText(/9\s*certyfikatów/);
    });

    test("ten sam wiersz listy na innym ekranie (formy stażu): co najmniej 40% wiersza, bez przewijania poziomego", async ({
      page,
    }) => {
      await instalujAtrapy(page, MALE);
      await page.goto("/admin/formy-stazu");
      await zabezpieczeniePrzedEkranemDostepu(page);
      const wiersz = page.locator('[data-wariant="z-licznikiem"]').first();
      await expect(wiersz).toBeVisible();
      await zrzut(page, `formy-stazu-${nazwaWidoku}`);
      const pudelkoWiersza = await wiersz.boundingBox();
      const pudelkoTytulu = await wiersz.getByText(FORMA_DLUGA.name, { exact: true }).boundingBox();
      expect(pudelkoTytulu!.width / pudelkoWiersza!.width).toBeGreaterThanOrEqual(0.4);
      const pudelkoPlakietki = await wiersz.getByText("Aktywna", { exact: true }).boundingBox();
      expect(pudelkoPlakietki!.width / pudelkoWiersza!.width).toBeLessThan(0.5);
      await bezPrzewijaniaPoziomego(page);
    });
  });
}
