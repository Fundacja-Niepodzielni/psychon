import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page, type Locator } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";

/**
 * Ekran kursu administracji na trasie poligonu `/nowy-front/admin/kursy/[id]`
 * (A-12 z publikacją A-14), na zbudowanej aplikacji, z atrapą API przez
 * `page.route` i atrapą sesji:
 * - kurs, lekcje i tematy czytane trasami `/admin/…`, ani jednego żądania
 *   `/instructor/…`;
 * - dokładnie jeden `main`, jedno „Opublikuj kurs”, blok zaproszeń pod drzewem
 *   tematów, „Usunięcie kursu” ostatnim blokiem;
 * - „Opublikuj kurs” wysyła `PATCH /admin/courses/{id}` z `is_published: true`,
 *   po czym plakietka mówi „Opublikowany” i zostaje „Cofnij publikację”;
 * - kurs bez lekcji: ten sam ekran w stanie pustym;
 * - „Edytuj” w wierszu lekcji (A-13) otwiera formularz pod wierszem, cel
 *   dotyku przycisku ma co najmniej 44 px, zapis to jedno
 *   `PATCH /admin/lessons/{id}`, „Anuluj” oddaje fokus przyciskowi;
 * - bez przewijania w poziomie i 0 naruszeń axe na 1280 i 390 px.
 * Zrzuty ekranu powstają tylko przy ustawionej zmiennej `PW_ZRZUTY` (katalog
 * poza repozytorium) — okno przeglądarki po przewinięciu do elementu.
 */

const API = "http://localhost:8000/api/v1";
const ADRES = "/nowy-front/admin/kursy/4";

const ATRAPA_SESJI = {
  accessToken: "atrapa-tokenu-testowego",
  expiresAt: Date.now() + 3_600_000,
};

const META_PUSTA = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

const KURS = {
  id: 4,
  title: "Wywiad psychologiczny",
  slug: "wywiad-psychologiczny",
  description: "Jak prowadzić pierwszą rozmowę i o co pytać.",
  type: "webinar",
  product_group: "psychon",
  sequence_order: null,
  edition_id: 1,
  is_published: false,
  lessons_count: 3,
  materials_count: 1,
  created_at: "2026-09-01T08:00:00Z",
  updated_at: "2026-09-01T08:00:00Z",
};

function lekcja(id: number, title: string, topicId: number, pozycja: number) {
  return {
    id,
    course_id: 4,
    title,
    description: null,
    content: null,
    sequence_order: id - 20,
    topic_id: topicId,
    topic_position: pozycja,
    video_provider_id: `wideo-${id}`,
    duration_seconds: 1500,
    materials_count: 0,
    created_at: null,
    updated_at: null,
  };
}

const LEKCJE = [
  lekcja(21, "Wprowadzenie do wywiadu", 7, 1),
  lekcja(22, "Pytania otwarte i zamknięte", 7, 2),
  lekcja(23, "Ćwiczenie w parach", 8, 1),
];

const TEMATY = [
  { id: 7, course_id: 4, title: "Podstawy", position: 1, lesson_ids: [21, 22], created_at: null, updated_at: null },
  { id: 8, course_id: 4, title: "Praktyka", position: 2, lesson_ids: [23], created_at: null, updated_at: null },
];

function json(dane: unknown, meta?: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }),
  };
}

interface Zapis {
  metoda: string;
  sciezka: string;
  cialo: unknown;
}

/**
 * Atrapy API. Ogólna atrapa (pusta lista) jest rejestrowana PIERWSZA —
 * Playwright wybiera trasę zarejestrowaną PÓŹNIEJ jako pierwszą.
 */
async function instalujAtrapy(page: Page, tryb: "tematy" | "pusty"): Promise<{ zapisy: Zapis[]; sciezki: string[] }> {
  const zapisy: Zapis[] = [];
  const sciezki: string[] = [];
  let kurs = tryb === "pusty" ? { ...KURS, lessons_count: 0, materials_count: 0 } : KURS;
  let lekcje = tryb === "pusty" ? [] : LEKCJE;
  const tematy = tryb === "pusty" ? [] : TEMATY;

  page.on("request", (zadanie) => {
    if (zadanie.url().startsWith(API)) sciezki.push(zadanie.url().slice(API.length));
  });

  await page.route(`${API}/**`, (route) => route.fulfill(json([], META_PUSTA)));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(json({ id: 1, role: "project_manager", first_name: "Anna", program_completed_at: null })),
  );
  await page.route(`${API}/notifications**`, (route) =>
    route.fulfill(json([], { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { unread: 0 } })),
  );
  await page.route(`${API}/admin/courses/4`, (route) => {
    const zadanie = route.request();
    if (zadanie.method() === "PATCH") {
      const cialo = zadanie.postDataJSON() as Record<string, unknown>;
      zapisy.push({ metoda: "PATCH", sciezka: "/admin/courses/4", cialo });
      kurs = { ...kurs, ...cialo };
    }
    return route.fulfill(json(kurs));
  });
  await page.route(`${API}/admin/courses/4/lessons`, (route) => route.fulfill(json(lekcje)));
  await page.route(`${API}/admin/courses/4/topics`, (route) => route.fulfill(json(tematy)));
  await page.route(`${API}/admin/lessons/22`, (route) => {
    const cialo = route.request().postDataJSON() as Record<string, unknown>;
    zapisy.push({ metoda: route.request().method(), sciezka: "/admin/lessons/22", cialo });
    lekcje = lekcje.map((wpis) => (wpis.id === 22 ? { ...wpis, ...cialo } : wpis));
    return route.fulfill(json(lekcje.find((wpis) => wpis.id === 22)));
  });

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json({ url: null })));
  return { zapisy, sciezki };
}

/** Zrzut okna przeglądarki po przewinięciu do elementu — nie całej strony. */
async function zrzut(page: Page, nazwa: string, element?: Locator): Promise<void> {
  const katalog = process.env.PW_ZRZUTY;
  if (!katalog) return;
  mkdirSync(katalog, { recursive: true });
  if (element) await element.evaluate((wezel) => wezel.scrollIntoView({ block: "start" }));
  else await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(katalog, `${nazwa}.png`), fullPage: false, animations: "disabled" });
}

async function bezPrzewijaniaPoziomego(page: Page): Promise<void> {
  const przewijanie = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(przewijanie, "przewijanie poziome").toBeLessThanOrEqual(0);
}

const OKNA = [
  { szerokosc: 1280, wysokosc: 800 },
  { szerokosc: 390, wysokosc: 844 },
];

for (const { szerokosc, wysokosc } of OKNA) {
  test.describe(`ekran kursu administracji — ${szerokosc} px`, () => {
    test.use({ viewport: { width: szerokosc, height: wysokosc } });

    test("kurs z tematami: dane z tras administracji, każda akcja raz, publikacja zmienia stan", async ({
      page,
    }, testInfo) => {
      const { zapisy, sciezki } = await instalujAtrapy(page, "tematy");
      await page.goto(ADRES);
      await zabezpieczeniePrzedEkranemDostepu(page);

      await expect(page.getByRole("heading", { level: 1, name: KURS.title })).toBeVisible();
      await expect(page.getByRole("heading", { level: 3, name: "Podstawy" })).toBeVisible();
      await expect(page.locator("#lekcje").getByText("Pytania otwarte i zamknięte")).toBeVisible();
      expect(await page.locator("main").count()).toBe(1);
      expect(await page.locator("#tresc").count()).toBe(1);

      await expect(page.getByRole("button", { name: "Opublikuj kurs" })).toHaveCount(1);
      await expect(page.getByRole("button", { name: "Cofnij publikację" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Usuń kurs" })).toHaveCount(0);

      // Zaproszenia stoją pod drzewem tematów, usunięcie kursu — pod wszystkim.
      const drzewo = await page.locator("#lekcje").boundingBox();
      const zaproszenia = await page.locator("#zaproszenia").boundingBox();
      const usuniecie = page.getByRole("button", { name: "Usunięcie kursu (1)" });
      const ramkaUsuniecia = await usuniecie.boundingBox();
      expect(zaproszenia!.y).toBeGreaterThanOrEqual(drzewo!.y + drzewo!.height);
      if (szerokosc < 900) expect(ramkaUsuniecia!.y).toBeGreaterThanOrEqual(zaproszenia!.y + zaproszenia!.height);

      await bezPrzewijaniaPoziomego(page);
      const naruszenia = await uruchomAxe(page);
      await dolaczNaruszeniaDoRaportu(testInfo, `axe-kurs-administracji-${szerokosc}`, naruszenia);
      expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);

      await zrzut(page, `kurs-admin-${szerokosc}-tematy-gora`);
      await zrzut(page, `kurs-admin-${szerokosc}-tematy-zaproszenia`, page.locator("#zaproszenia"));
      await usuniecie.click();
      await expect(page.getByRole("button", { name: "Usuń kurs" })).toHaveCount(1);
      await zrzut(page, `kurs-admin-${szerokosc}-tematy-usuniecie`, page.getByRole("button", { name: "Usuń kurs" }));

      await page.getByRole("button", { name: "Opublikuj kurs" }).click();
      await expect(page.getByText("Opublikowany", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Opublikuj kurs" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Cofnij publikację" })).toHaveCount(1);
      expect(zapisy).toEqual([{ metoda: "PATCH", sciezka: "/admin/courses/4", cialo: { is_published: true } }]);
      await zrzut(page, `kurs-admin-${szerokosc}-tematy-opublikowany`);

      expect(sciezki.filter((sciezka) => sciezka.startsWith("/instructor/"))).toEqual([]);
      expect(sciezki).toEqual(
        expect.arrayContaining(["/admin/courses/4", "/admin/courses/4/lessons", "/admin/courses/4/topics"]),
      );
    });

    test("edycja lekcji pod wierszem: formularz w elemencie listy, zapis jednym żądaniem, fokus wraca", async ({
      page,
    }, testInfo) => {
      const { zapisy, sciezki } = await instalujAtrapy(page, "tematy");
      await page.goto(ADRES);
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.getByRole("heading", { level: 3, name: "Podstawy" })).toBeVisible();

      await expect(page.getByRole("button", { name: "Zmień nazwę", exact: true })).toHaveCount(0);
      const edytuj = page.getByRole("button", { name: "Edytuj lekcję „Pytania otwarte i zamknięte”" });
      const ramkaPrzycisku = await edytuj.boundingBox();
      expect(ramkaPrzycisku!.height, "wysokość celu dotyku „Edytuj”").toBeGreaterThanOrEqual(44);
      expect(ramkaPrzycisku!.width, "szerokość celu dotyku „Edytuj”").toBeGreaterThanOrEqual(44);

      await edytuj.click();
      const wiersz = page.locator("li[data-lekcja='22']");
      const formularz = wiersz.getByRole("form", { name: "Edycja lekcji" });
      await expect(formularz).toBeVisible();
      await expect(edytuj).toHaveAttribute("aria-expanded", "true");
      const tytul = formularz.getByLabel(/^Tytuł lekcji/);
      await expect(tytul).toBeFocused();

      // Formularz stoi pod wierszem i na jego szerokość, następna lekcja pod formularzem.
      const ramkaWiersza = await wiersz.boundingBox();
      const ramkaFormularza = await wiersz.locator("[data-rozwiniecie-lekcji='22']").boundingBox();
      const ramkaPoEdycji = await edytuj.boundingBox();
      expect(ramkaFormularza!.y).toBeGreaterThanOrEqual(ramkaPoEdycji!.y + ramkaPoEdycji!.height - 1);
      expect(ramkaFormularza!.width).toBeGreaterThan(ramkaWiersza!.width * 0.9);

      await bezPrzewijaniaPoziomego(page);
      const naruszenia = await uruchomAxe(page);
      await dolaczNaruszeniaDoRaportu(testInfo, `axe-kurs-administracji-edycja-lekcji-${szerokosc}`, naruszenia);
      expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);
      await zrzut(page, `kurs-admin-${szerokosc}-edycja-lekcji`, wiersz);

      await tytul.fill("Pytania otwarte");
      await formularz.getByRole("button", { name: "Zapisz lekcję" }).click();
      await expect(wiersz.getByText("Pytania otwarte · 25 min")).toBeVisible();
      expect(zapisy).toEqual([
        {
          metoda: "PATCH",
          sciezka: "/admin/lessons/22",
          cialo: { title: "Pytania otwarte", description: null, content: "", duration_seconds: 1500 },
        },
      ]);
      await zrzut(page, `kurs-admin-${szerokosc}-edycja-lekcji-zapisana`, wiersz);

      await formularz.getByRole("button", { name: "Anuluj" }).click();
      await expect(wiersz.locator("[data-rozwiniecie-lekcji]")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Edytuj lekcję „Pytania otwarte”" })).toBeFocused();
      expect(sciezki.filter((sciezka) => sciezka.startsWith("/instructor/"))).toEqual([]);
    });

    test("kurs bez lekcji: stan pusty w tym samym ekranie", async ({ page }, testInfo) => {
      const { zapisy, sciezki } = await instalujAtrapy(page, "pusty");
      await page.goto(ADRES);
      await zabezpieczeniePrzedEkranemDostepu(page);

      await expect(page.getByRole("heading", { level: 1, name: KURS.title })).toBeVisible();
      await expect(page.locator("#zaproszenia")).toBeVisible();
      expect(await page.locator("main").count()).toBe(1);
      await expect(page.getByRole("button", { name: "Opublikuj kurs" })).toHaveCount(1);

      await bezPrzewijaniaPoziomego(page);
      const naruszenia = await uruchomAxe(page);
      await dolaczNaruszeniaDoRaportu(testInfo, `axe-kurs-administracji-pusty-${szerokosc}`, naruszenia);
      expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);

      await zrzut(page, `kurs-admin-${szerokosc}-pusty-gora`);
      await zrzut(page, `kurs-admin-${szerokosc}-pusty-zaproszenia`, page.locator("#zaproszenia"));
      expect(zapisy).toEqual([]);
      expect(sciezki.filter((sciezka) => sciezka.startsWith("/instructor/"))).toEqual([]);
    });
  });
}
