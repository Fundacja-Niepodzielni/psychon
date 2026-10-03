import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Przypisanie jednego prowadzącego wielu osobom z listy „Osoby”
 * (`/admin/uczestniczki`) w prawdziwej przeglądarce, przy 1280, 390 i 320 px:
 * - pasek zaznaczenia: poniżej 640 px najwyżej dwie linie („Wybrano: N”
 *   z przyciskiem głównym, pod nimi „Wyczyść wybór”) i wysokość najwyżej
 *   80 px — także przy „Wybrano: 100”; od 640 px jedna linia;
 * - jedyny zielony przycisk na ekranie to „Przypisz prowadzącego”, a „Dodaj
 *   osobę” stoi w tym samym miejscu jako drugorzędny;
 * - okno „Przypisz prowadzącego” i wynik częściowy (część przypisana, część
 *   z odmową) bez przewijania strony w bok.
 * Zbudowana aplikacja, API i sesja to atrapy z `page.route`. Z `ZRZUTY_DIR`
 * zapisuje zrzuty i wypisuje zmierzone wysokości paska.
 */

const API = "http://localhost:8000/api/v1";
const ATRAPA_SESJI = { accessToken: "atrapa-tokenu-testowego", expiresAt: Date.now() + 3_600_000 };
const META = (total: number) => ({ current_page: 1, per_page: 25, total, last_page: 1 });
const NAJWYZSZY_PASEK = 80;

function json(cialo: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(cialo) };
}

function osoba(id: number, imie: string, nazwisko: string, zmiany: Record<string, unknown> = {}) {
  return {
    id,
    first_name: imie,
    last_name: nazwisko,
    email: `${nazwisko.toLowerCase()}${id}@demo.pl`,
    role: "volunteer",
    status: "active",
    product_group: "psychon",
    access_expires_at: "2027-02-01T00:00:00Z",
    program_completed_at: null,
    created_at: "2026-09-20T10:00:00Z",
    supervisor: null,
    ...zmiany,
  };
}

const JOANNA = { id: 5, name: "Joanna Prowadząca" };
const EWA = { id: 6, name: "Ewa Drugaprowadząca" };

const OSOBY = [
  osoba(17, "Marta", "Demo"),
  osoba(18, "Ola", "Przykładowa", { supervisor: EWA }),
  osoba(19, "Kasia", "Studencka", { role: "student" }),
  osoba(20, "Piotr", "Wolontariusz", { supervisor: JOANNA }),
  osoba(21, "Anna", "Testowa"),
  osoba(22, "Ewa", "Zablokowana", { status: "blocked" }),
];

const PROWADZACY = [
  osoba(5, "Joanna", "Prowadząca", { role: "instructor" }),
  osoba(6, "Ewa", "Drugaprowadząca", { role: "instructor" }),
];

const STO_OSOB = Array.from({ length: 100 }, (_, i) => osoba(100 + i, "Osoba", `Numer${i + 1}`));

const WYNIK_CZESCIOWY = {
  supervisor_id: 5,
  results: [
    { user_id: 17, result: "assigned", reason: null },
    { user_id: 18, result: "refused", reason: "not_assignable" },
    { user_id: 21, result: "assigned", reason: null },
  ],
  summary: { requested: 3, assigned: 2, unchanged: 0, refused: 1, not_found: 0 },
};

/** Ogólna atrapa jest rejestrowana PIERWSZA — Playwright wybiera trasę zarejestrowaną PÓŹNIEJ jako pierwszą. */
async function instalujAtrapy(page: Page, osoby: unknown[]): Promise<void> {
  await page.route(`${API}/**`, (route) => route.fulfill(json({ data: [], meta: META(0) })));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(json({ data: { id: 1, role: "project_manager", first_name: "Anna", program_completed_at: null } })),
  );
  await page.route(`${API}/notifications**`, (route) =>
    route.fulfill(json({ data: [], meta: { ...META(0), extra: { unread: 0 } } })),
  );
  await page.route(
    (url) => url.origin === "http://localhost:8000" && url.pathname === "/api/v1/admin/users",
    (route) => {
      const adres = new URL(route.request().url());
      if (adres.searchParams.get("role") === "instructor") {
        return route.fulfill(json({ data: PROWADZACY, meta: META(PROWADZACY.length) }));
      }
      return route.fulfill(json({ data: osoby, meta: META(osoby.length) }));
    },
  );
  await page.route(`${API}/admin/supervisor-assignments`, (route) => route.fulfill(json({ data: WYNIK_CZESCIOWY })));
  await page.route("**/api/auth/session", (route) => route.fulfill(json(ATRAPA_SESJI)));
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json({ data: { url: null } })));
}

async function otworz(page: Page, osoby: unknown[]): Promise<void> {
  await instalujAtrapy(page, osoby);
  await page.goto("/admin/uczestniczki");
  await zabezpieczeniePrzedEkranemDostepu(page);
  await expect(page.getByRole("heading", { level: 1, name: "Osoby" })).toBeVisible();
  await page.waitForLoadState("networkidle");
}

async function przewijanieWBok(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** Zrzut widoku do katalogu z `ZRZUTY_DIR`; bez zmiennej nic nie robi. */
async function zrzut(page: Page, nazwa: string): Promise<void> {
  const katalog = process.env.ZRZUTY_DIR;
  if (!katalog) return;
  await page.screenshot({ path: `${katalog}/${nazwa}.png` });
}

interface PomiarPaska {
  wysokosc: number;
  /** Linie paska: rzędy, w których stoją napisy „Wybrano: N”, przycisku głównego i „Wyczyść wybór”. */
  linie: number;
  /** Linie samego napisu „Wybrano: N” (1 = napis się nie łamie). */
  linieOpisu: number;
}

/**
 * Wysokość paska i liczba jego linii. Liczone są prostokąty linii tekstu (nie
 * pola klikalne — pole „Wyczyść wybór” celowo zachodzi pod pierwszą linię):
 * napisy, których środki leżą w tym samym pasie wysokości, stoją w jednej linii.
 */
async function zmierzPasek(page: Page): Promise<PomiarPaska> {
  const pasek = page.getByRole("region", { name: "Wybrane osoby" });
  const ramka = await pasek.boundingBox();
  const { linie, linieOpisu } = await pasek.evaluate((element) => {
    const linieTekstu = (wezel: Element): DOMRect[] => {
      const prostokaty: DOMRect[] = [];
      const przejscie = document.createTreeWalker(wezel, NodeFilter.SHOW_TEXT);
      for (let tekst = przejscie.nextNode(); tekst !== null; tekst = przejscie.nextNode()) {
        if (!tekst.textContent?.trim()) continue;
        const zakres = document.createRange();
        zakres.selectNodeContents(tekst);
        prostokaty.push(...Array.from(zakres.getClientRects()).filter((p) => p.width > 0 && p.height > 0));
      }
      return prostokaty;
    };
    const opis = linieTekstu(element.querySelector("[role='status']")!);
    const [glowny, wyczysc] = Array.from(element.querySelectorAll("button"));
    const srodki: number[] = [];
    for (const p of [...opis, ...linieTekstu(glowny), ...linieTekstu(wyczysc)]) {
      const srodek = (p.top + p.bottom) / 2;
      if (!srodki.some((inny) => Math.abs(inny - srodek) < p.height / 2)) srodki.push(srodek);
    }
    return { linie: srodki.length, linieOpisu: new Set(opis.map((p) => Math.round(p.top))).size };
  });
  return { wysokosc: Math.round((ramka?.height ?? 0) * 10) / 10, linie, linieOpisu };
}

async function zaznacz(page: Page, ...nazwy: string[]): Promise<void> {
  for (const nazwa of nazwy) {
    await page.getByRole("checkbox", { name: nazwa, exact: true }).check();
  }
}

for (const okno of [
  { szerokosc: 1280, wysokosc: 900 },
  { szerokosc: 390, wysokosc: 844 },
  { szerokosc: 320, wysokosc: 720 },
]) {
  test.describe(`przypisanie prowadzącego wielu osobom, ${okno.szerokosc} px`, () => {
    test.use({ viewport: { width: okno.szerokosc, height: okno.wysokosc } });

    test("pasek zaznaczenia, okno i wynik częściowy", async ({ page }) => {
      await otworz(page, OSOBY);
      await expect(page.getByRole("checkbox", { name: "Ewa Zablokowana", exact: true })).toHaveCount(0);
      await expect(page.getByRole("checkbox", { name: "Kasia Studencka", exact: true })).toHaveCount(0);

      await zaznacz(page, "Marta Demo", "Ola Przykładowa", "Anna Testowa");
      const pasek = page.getByRole("region", { name: "Wybrane osoby" });
      await expect(pasek.getByRole("status")).toHaveText("Wybrano: 3");

      const zielone = page.locator("main button[class*='primary']");
      await expect(zielone).toHaveCount(1);
      await expect(zielone).toHaveText("Przypisz prowadzącego");
      // „Dodaj osobę” stoi na ekranie tylko przy włączonym zakładaniu konta; gdy jest — jako drugorzędny.
      const dodaj = page.getByTestId("pageheader-przycisk-glowny").getByRole("button", { name: "Dodaj osobę" });
      if ((await dodaj.count()) > 0) await expect(dodaj).toHaveClass(/outline/);

      const pomiar = await zmierzPasek(page);
      if (process.env.ZRZUTY_DIR) {
        console.log(`[pasek ${okno.szerokosc} px, Wybrano: 3] wysokość ${pomiar.wysokosc} px, linie ${pomiar.linie}, linie opisu ${pomiar.linieOpisu}`);
      }
      if (okno.szerokosc < 640) {
        expect(pomiar.wysokosc, "wysokość paska (px)").toBeLessThanOrEqual(NAJWYZSZY_PASEK);
        expect(pomiar.linie, "linie paska").toBe(2);
        expect(pomiar.linieOpisu, "napis „Wybrano: N” w jednej linii").toBe(1);
      } else {
        expect(pomiar.linie, "linie paska").toBe(1);
      }
      const wyczysc = await pasek.getByRole("button", { name: "Wyczyść wybór" }).boundingBox();
      expect(wyczysc?.height ?? 0, "pole klikalne „Wyczyść wybór” (px)").toBeGreaterThanOrEqual(44);
      expect(await przewijanieWBok(page), "pasek nie przewija strony w bok").toBeLessThanOrEqual(0);
      await zrzut(page, `przypisanie-wielu-pasek-${okno.szerokosc}`);

      await pasek.getByRole("button", { name: "Przypisz prowadzącego" }).click();
      const dialog = page.getByRole("dialog", { name: "Przypisz prowadzącego" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("combobox", { name: /^Prowadzący/ }).click();
      await page.getByRole("option", { name: "Joanna Prowadząca", exact: true }).click();
      await expect(dialog.getByText(/U 1 osoby zmieni się prowadzący/)).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Przypisz (3)" })).toBeVisible();
      expect(await przewijanieWBok(page), "okno nie przewija strony w bok").toBeLessThanOrEqual(0);
      await zrzut(page, `przypisanie-wielu-okno-${okno.szerokosc}`);

      await dialog.getByRole("button", { name: "Przypisz (3)" }).click();
      const wynik = page.getByRole("region", { name: "Wynik przypisania" });
      await expect(wynik.getByRole("heading", { name: "Przypisano 2 z 3 osób." })).toBeVisible();
      await expect(wynik.getByRole("listitem")).toHaveText([
        "Ola Przykładowa: prowadzącego można przypisać tylko aktywnemu kontu z rolą „Wolontariusz”.",
      ]);
      await expect(pasek.getByRole("status")).toHaveText("Wybrano: 1");
      expect(await przewijanieWBok(page), "wynik nie przewija strony w bok").toBeLessThanOrEqual(0);
      await page.waitForLoadState("networkidle");
      await zrzut(page, `przypisanie-wielu-wynik-${okno.szerokosc}`);
    });

    if (okno.szerokosc < 640) {
      test("„Wybrano: 100” — najszerszy opis paska mieści się w dwóch liniach i 80 px", async ({ page }) => {
        await otworz(page, STO_OSOB);
        await page.getByRole("checkbox", { name: "Zaznacz wszystkie na tej stronie" }).check();
        await expect(page.getByRole("region", { name: "Wybrane osoby" }).getByRole("status")).toHaveText("Wybrano: 100");

        const pomiar = await zmierzPasek(page);
        if (process.env.ZRZUTY_DIR) {
          console.log(`[pasek ${okno.szerokosc} px, Wybrano: 100] wysokość ${pomiar.wysokosc} px, linie ${pomiar.linie}, linie opisu ${pomiar.linieOpisu}`);
        }
        expect(pomiar.wysokosc, "wysokość paska (px)").toBeLessThanOrEqual(NAJWYZSZY_PASEK);
        expect(pomiar.linie, "linie paska").toBe(2);
        expect(pomiar.linieOpisu, "napis „Wybrano: N” w jednej linii").toBe(1);
        expect(await przewijanieWBok(page), "pasek nie przewija strony w bok").toBeLessThanOrEqual(0);
        await zrzut(page, `przypisanie-wielu-pasek-100-${okno.szerokosc}`);
      });
    }
  });
}
