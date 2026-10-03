import { expect, test, type Page } from "@playwright/test";
import { asercjaBrakPowaznychNaruszen, uruchomAxe } from "./_axe";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { ucieknijWyrazenie } from "./_wyrazenie";

/**
 * „Zmień datę” na karcie osoby pod zwykłym adresem `/admin/uczestniczki/<id>`
 * w prawdziwej przeglądarce (rola: opiekun projektu, dane przykładowe, API
 * podstawione w próbie): okno formularza nad kartą bez poważnych naruszeń axe,
 * zapis jednym żądaniem z samym `until`, nowa data w nagłówku, zdanie w stałym
 * obszarze ogłoszeń i fokus z powrotem na „Zmień datę”; oba dawne adresy
 * ekranu przedłużenia przekierowują na kartę; po zaliczeniu warsztatu fokus
 * stoi na nagłówku bloku warsztatu — przy 390 i 1280 px.
 */

const ATRAPA_SESJI = { accessToken: "atrapa-tokenu-testowego", expiresAt: Date.now() + 3_600_000 };
const API = "http://localhost:8000/api/v1";
const STRONA = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

function karta(dataDostepu: string, warsztat: boolean) {
  return {
    data: {
      profile: {
        id: 17,
        first_name: "Marta",
        last_name: "Demo",
        email: "marta@demo.pl",
        role: "volunteer",
        phone: "+48 600 100 200",
        pesel: null,
        address: { street: "Polna 1", city: "Warszawa", zip: "00-001" },
        access_expires_at: dataDostepu,
        program_completed_at: null,
        product_group: "psychon",
      },
      progress: {
        courses_done: 8,
        courses_total: 10,
        hours_accepted: "41.5",
        supervision_present: 5,
        workshop_done: warsztat,
        path_tests_passed: 3,
        path_tests_total: 4,
      },
      documents: [],
      recent_notifications: [],
      audit_entries: [],
    },
  };
}

interface Stan {
  dataDostepu: string;
  warsztat: boolean;
  zapisy: { adres: string; cialo: unknown }[];
}

/** Północ UTC podanego dnia `YYYY-MM-DD` jako znacznik ISO, składana z `Date.UTC`. */
function polnocUTC(dzien: string): string {
  const [rok, miesiac, dzienMiesiaca] = dzien.split("-").map(Number);
  return new Date(Date.UTC(rok, miesiac - 1, dzienMiesiaca)).toISOString();
}

async function odpowiedz(page: Page, wzorzec: string | RegExp, cialo: () => unknown): Promise<void> {
  await page.route(wzorzec, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cialo()) }),
  );
}

async function atrapy(page: Page): Promise<Stan> {
  const stan: Stan = { dataDostepu: "2027-02-01T00:00:00Z", warsztat: false, zapisy: [] };
  await odpowiedz(page, `${API}/**`, () => ({ data: [], meta: STRONA }));
  await odpowiedz(page, `${API}/me`, () => ({ data: { id: 1, role: "project_manager", first_name: "Anna" } }));
  await page.route(`${API}/admin/users/17`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(karta(stan.dataDostepu, stan.warsztat)) }),
  );
  await odpowiedz(page, `${API}/admin/reliability/17`, () => ({ data: { reliability_percent: "40", below_threshold: false } }));
  await page.route(`${API}/admin/users/17/extend-access`, async (route) => {
    const cialo = route.request().postDataJSON() as { until: string; reason: string };
    stan.zapisy.push({ adres: route.request().url(), cialo });
    stan.dataDostepu = polnocUTC(cialo.until);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          id: 17,
          first_name: "Marta",
          last_name: "Demo",
          email: "marta@demo.pl",
          role: "volunteer",
          roles: ["volunteer"],
          access_expires_at: stan.dataDostepu,
          program_completed_at: null,
        },
      }),
    });
  });
  await page.route(`${API}/admin/workshop/17/complete`, async (route) => {
    stan.zapisy.push({ adres: route.request().url(), cialo: null });
    stan.warsztat = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { user_id: 17, edition_id: 1, completed_at: "2026-10-02T12:00:00Z", workshop_done: true } }),
    });
  });
  await odpowiedz(page, "**/api/auth/session", () => ATRAPA_SESJI);
  await odpowiedz(page, "**/api/auth/end-session-url", () => ({ data: { url: null } }));
  return stan;
}

for (const [nazwa, wymiary] of [
  ["390", { width: 390, height: 844 }],
  ["1280", { width: 1280, height: 800 }],
] as const) {
  test.describe(`karta osoby — zmiana daty @${nazwa}`, () => {
    test.use({ viewport: wymiary });

    test("okno formularza nad kartą: axe, zapis samego until, nowa data w nagłówku, ogłoszenie i fokus na „Zmień datę”", async ({ page }) => {
      const stan = await atrapy(page);
      await page.goto("/admin/uczestniczki/17");
      await zabezpieczeniePrzedEkranemDostepu(page);

      const naglowek = page.locator("[data-obszar='data-dostepu']");
      await expect(naglowek).toContainText("Dostęp do materiałów do 1 lutego 2027");
      const przycisk = naglowek.getByRole("button", { name: "Zmień datę" });
      await przycisk.click();

      const okno = page.getByRole("dialog", { name: "Zmień datę dostępu: Marta Demo" });
      await expect(okno).toBeVisible();
      expect(await okno.evaluate((element) => element.matches(":modal"))).toBe(true);
      await expect(okno.getByLabel("Nowa data dostępu")).toBeFocused();
      asercjaBrakPowaznychNaruszen(await uruchomAxe(page));

      const pomiar = await okno.evaluate((element) => {
        const r = element.getBoundingClientRect();
        const glowny = Array.from(element.querySelectorAll("button")).find((b) => b.textContent === "Zapisz datę")!.getBoundingClientRect();
        return { okno: { top: r.top, bottom: r.bottom, left: r.left, right: r.right }, glowny: glowny.bottom, wysokosc: innerHeight, szerokosc: innerWidth };
      });
      expect(pomiar.okno.left).toBeGreaterThanOrEqual(-0.5);
      expect(pomiar.okno.right).toBeLessThanOrEqual(pomiar.szerokosc + 0.5);
      expect(pomiar.okno.bottom).toBeLessThanOrEqual(pomiar.wysokosc + 0.5);
      expect(pomiar.glowny).toBeLessThanOrEqual(pomiar.wysokosc + 0.5);

      await okno.getByRole("button", { name: "Zapisz datę" }).click();
      await expect(okno.getByRole("group", { name: "Data dostępu nie została zmieniona" })).toBeFocused();
      expect(stan.zapisy).toEqual([]);

      await okno.getByLabel("Nowa data dostępu").fill("2027-03-31");
      await okno.getByRole("textbox", { name: "Powód zmiany" }).fill("Zmiana terminu stażu w grupie wsparcia.");
      await okno.getByRole("button", { name: "Zapisz datę" }).click();

      await expect(okno).toHaveCount(0);
      expect(stan.zapisy).toEqual([{ adres: `${API}/admin/users/17/extend-access`, cialo: { until: "2027-03-31", reason: "Zmiana terminu stażu w grupie wsparcia." } }]);
      await expect(naglowek).toContainText("Dostęp do materiałów do 31 marca 2027");
      await expect(page.locator("[data-obszar-ogloszen-panelu]")).toHaveText("Data dostępu zmieniona na 31 marca 2027.");
      await expect(przycisk).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
    });

    test("przycisk „Wstecz” przeglądarki zamyka samo okno, karta zostaje pod tym samym adresem", async ({ page }) => {
      const stan = await atrapy(page);
      await page.goto("/admin/uczestniczki/17");
      await zabezpieczeniePrzedEkranemDostepu(page);
      const adres = page.url();
      await page.locator("[data-obszar='data-dostepu']").getByRole("button", { name: "Zmień datę" }).click();
      const okno = page.getByRole("dialog", { name: "Zmień datę dostępu: Marta Demo" });
      await expect(okno).toBeVisible();
      await expect.poll(() => page.evaluate(() => (history.state as Record<string, unknown> | null)?.oknoFormularza)).toBeTruthy();

      await page.goBack();
      await expect(okno).toHaveCount(0);
      expect(page.url()).toBe(adres);
      await expect(page.getByRole("heading", { level: 1, name: "Marta Demo" })).toBeVisible();
      expect(stan.zapisy).toEqual([]);
    });

    test("po zaliczeniu warsztatu fokus stoi na nagłówku bloku warsztatu", async ({ page }) => {
      await atrapy(page);
      await page.goto("/admin/uczestniczki/17");
      await zabezpieczeniePrzedEkranemDostepu(page);
      await page.getByRole("button", { name: "Zaznacz warsztat jako zaliczony" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Zaznacz jako zaliczony" }).click();
      await expect(page.getByRole("button", { name: "Zaznacz warsztat jako zaliczony" })).toHaveCount(0);
      await expect(page.getByRole("heading", { level: 2, name: "Warsztat stacjonarny" })).toBeFocused();
    });
  });
}

test.describe("dawne adresy ekranu przedłużenia dostępu", () => {
  for (const [stary, nowy] of [
    ["/admin/uczestniczki/17/przedluzenie", "/admin/uczestniczki/17"],
    ["/nowy-front/admin/uczestniczki/17/przedluzenie", "/nowy-front/admin/uczestniczki/17"],
    ["/admin/uczestniczki/abc/przedluzenie", "/admin/uczestniczki"],
  ] as const) {
    test(`${stary} przekierowuje na ${nowy}, nie na stronę „nie znaleziono”`, async ({ page }) => {
      await atrapy(page);
      const odpowiedzStrony = await page.goto(stary);
      expect(odpowiedzStrony?.status()).not.toBe(404);
      await expect(page).toHaveURL(new RegExp(`${ucieknijWyrazenie(nowy)}$`));
    });
  }
});

test.describe("dawne adresy ekranu przedłużenia dostępu — rodzaj przekierowania", () => {
  // Pod segmentem nowego frontu odpowiedź to prawdziwy HTTP 307 z nagłówkiem
  // `location`. Pod adresem produktu układ grupy tras strumieniuje stronę, więc
  // odpowiedź ma kod 200, a przekierowanie typu 307 niesie jej strumień
  // (`NEXT_REDIRECT;replace;<adres>;307`) i wykonuje je przeglądarka.
  test("/nowy-front/admin/uczestniczki/17/przedluzenie odpowiada HTTP 307 z adresem karty", async ({ request }) => {
    const odpowiedz = await request.get("/nowy-front/admin/uczestniczki/17/przedluzenie", { maxRedirects: 0 });
    expect(odpowiedz.status()).toBe(307);
    expect(new URL(odpowiedz.headers().location, "http://127.0.0.1").pathname).toBe("/nowy-front/admin/uczestniczki/17");
  });

  for (const [stary, nowy] of [
    ["/admin/uczestniczki/17/przedluzenie", "/admin/uczestniczki/17"],
    ["/admin/uczestniczki/abc/przedluzenie", "/admin/uczestniczki"],
  ] as const) {
    test(`${stary} niesie przekierowanie tymczasowe (307) na ${nowy}, nie 404`, async ({ request }) => {
      const odpowiedz = await request.get(stary, { maxRedirects: 0 });
      expect(odpowiedz.status()).toBe(200);
      expect(await odpowiedz.text()).toContain(`NEXT_REDIRECT;replace;${nowy};307;`);
    });
  }
});
