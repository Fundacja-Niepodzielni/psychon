import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";
import { POCHODZENIE_ODTWARZACZA } from "../lib/konfiguracja/odtwarzacz-nagran";

/**
 * Stan nagrania na ekranie lekcji uczestnika (`/nowy-front/lekcja/[id]`), na
 * zbudowanej aplikacji, z atrapą API i atrapą sesji (żadne żądanie nie
 * wychodzi poza przeglądarkę). Stany na 1280 i 390 px:
 *  - nagranie gotowe: odtwarzacz;
 *  - nagranie w przygotowaniu (stan z zasobu lekcji albo `video_not_ready`):
 *    jedno zdanie, bez pytania o link;
 *  - nagranie z błędem albo link odmówiony (503): „Tego nagrania nie da się
 *    teraz obejrzeć”, „Napisz do prowadzącego”, lekcji nie da się ukończyć;
 *  - lekcja bez nagrania (stan `none` albo `video_missing`): bez sekcji nagrania.
 * W każdym: jeden `main`, brak przewijania poziomego, cele dotyku co najmniej
 * 44 px, dokładnie jeden zielony przycisk, axe (WCAG 2.1 AA i `best-practice`)
 * = 0. Zrzuty całej strony powstają tylko przy ustawionej zmiennej `PW_ZRZUTY`.
 */

const API = "http://localhost:8000/api/v1";
const META = { current_page: 1, per_page: 100, total: 0, last_page: 1 };
const ATRAPA_SESJI = {
  accessToken: ["atrapa", "tokenu", "testowego"].join("-"),
  expiresAt: Date.now() + 3_600_000,
};

/** Atrapa strony odtwarzacza w ramce: odpowiada „gotowe” na prośbę o nasłuch i nic więcej nie robi. */
const ATRAPA_RAMKI = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Atrapa odtwarzacza</title></head>
<body><p>Atrapa odtwarzacza</p>
<script>
addEventListener("message", (z) => {
  let t; try { t = JSON.parse(z.data); } catch { return; }
  if (t.method === "addEventListener" && t.value === "ready")
    parent.postMessage(JSON.stringify({ context: "player.js", version: "0.0.11", event: "ready" }), "*");
});
</script></body></html>`;

// Przeglądarka nie rozwiązuje żadnej nazwy poza lokalną: ramka z hosta odtwarzacza dostaje wyłącznie atrapę.
test.use({ launchOptions: { args: ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1"] } });

const ZDANIE = "Nagranie jest w przygotowaniu.";
const ZDANIE_BLEDU = "Tego nagrania nie da się teraz obejrzeć.";
const SLUG = "wywiad-psychologiczny";
const DLUGIE_SLOWO = "Psychologicznodiagnostycznoterapeutycznointerwencyjnokryzysowe";
const DLUGI_TYTUL = `Wprowadzenie do wywiadu ${DLUGIE_SLOWO} — część druga, rozszerzona`;

const LEKCJA = {
  id: 21,
  title: "Wprowadzenie do wywiadu",
  description: "Kiedy pytać otwarcie, a kiedy zamknąć pytanie.",
  content: "## Cel lekcji\n\nPo tej lekcji rozróżniasz pytania otwarte i zamknięte.",
  topic: { id: 7, title: "Rozmowa", position: 1 },
  course: { id: 2, slug: SLUG, title: "Wywiad psychologiczny" },
  question_addressee: { name: "Marta Zielińska" },
  required_active_seconds: 1080,
  duration_seconds: 1800,
  position_seconds: 0,
  watched_seconds: 812,
  active_seconds: 700,
  is_completed: false,
  completable: false,
  completable_at_percent: 60,
};

type Link = "wydany" | "video_not_ready" | "video_missing" | "niedostepny";

interface Opcje {
  video_status: "none" | "uploading" | "processing" | "ready" | "error";
  /** Kolejne odpowiedzi trasy linku; ostatnia powtarza się. */
  link?: Link[];
  tytul?: string;
}

interface Atrapa {
  pytaniaOLink: () => number;
  ramki: () => number;
}

function json(dane: unknown, status = 200, meta?: unknown) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }),
  };
}

function odmowa(status: number, code: string, message: string) {
  return { status, contentType: "application/json", body: JSON.stringify({ error: { status, code, message } }) };
}

async function instalujAtrapy(page: Page, opcje: Opcje): Promise<Atrapa> {
  let pytania = 0;
  let ramki = 0;
  const kolejka = [...(opcje.link ?? ["wydany"])];

  await page.route(`${API}/**`, (route) => route.fulfill(json([], 200, META)));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(json({ id: 1, role: "volunteer", first_name: "Marta", program_completed_at: null })),
  );
  await page.route(`${API}/notifications**`, (route) =>
    route.fulfill(json([], 200, { ...META, extra: { unread: 0 } })),
  );
  await page.route(`${API}/lessons/21`, (route) =>
    route.fulfill(json({ ...LEKCJA, title: opcje.tytul ?? LEKCJA.title, video_status: opcje.video_status })),
  );
  await page.route(`${API}/lessons/21/progress`, (route) =>
    route.fulfill(
      json({ watched_seconds: 812, active_seconds: 700, completable: false, completable_at_percent: 60, required_active_seconds: 1080 }),
    ),
  );
  await page.route(`${API}/courses/**`, (route) =>
    route.fulfill(
      json({
        id: 2,
        slug: SLUG,
        title: "Wywiad psychologiczny",
        status: "in_progress",
        progress_percent: 40,
        has_test: true,
        topics: [{ id: 7, title: "Rozmowa", position: 1 }],
        lessons: [
          { id: 21, title: LEKCJA.title, sequence_order: 1, duration_seconds: 1800, is_completed: false, topic_id: 7 },
          { id: 22, title: "Pytania otwarte i zamknięte", sequence_order: 2, duration_seconds: 1500, is_completed: false, topic_id: 7 },
        ],
        materials: [],
      }),
    ),
  );
  await page.route(`${API}/lessons/21/video-link`, (route) => {
    pytania += 1;
    const odpowiedz = kolejka.length > 1 ? kolejka.shift() : kolejka[0];
    if (odpowiedz === "wydany") {
      return route.fulfill(
        json({ url: "https://nagrania.atrapa.test/lista.m3u8", embed_url: `${POCHODZENIE_ODTWARZACZA}/embed/1/lekcja-21?token=atrapa`, embed_expires_at: 4_070_908_800 }),
      );
    }
    if (odpowiedz === "video_not_ready") return route.fulfill(odmowa(404, "video_not_ready", "Nagranie w przygotowaniu."));
    if (odpowiedz === "video_missing") return route.fulfill(odmowa(404, "video_missing", "Brak nagrania."));
    return route.fulfill(odmowa(503, "video_not_configured", "Nagrania chwilowo niedostępne."));
  });
  await page.route("https://nagrania.atrapa.test/**", (route) => route.abort());
  // Adres ramki ma dozwolony host, ale odpowiada mu atrapa strony: nic nie wychodzi poza przeglądarkę.
  await page.route(`${POCHODZENIE_ODTWARZACZA}/**`, (route) => {
    ramki += 1;
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: ATRAPA_RAMKI });
  });
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json({ url: null })));
  return { pytaniaOLink: () => pytania, ramki: () => ramki };
}

async function otworzLekcje(page: Page, tytul = LEKCJA.title): Promise<void> {
  const odpowiedz = await page.goto("/nowy-front/lekcja/21");
  expect(odpowiedz?.status()).toBe(200);
  await zabezpieczeniePrzedEkranemDostepu(page);
  await expect(page.getByRole("heading", { level: 1, name: tytul })).toBeVisible();
}

async function zrzut(page: Page, nazwa: string): Promise<void> {
  const katalog = process.env.PW_ZRZUTY;
  if (!katalog) return;
  mkdirSync(katalog, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(katalog, `${nazwa}.png`), fullPage: true, animations: "disabled" });
}

/** Jeden `main`, brak przewijania poziomego, cele dotyku, co najwyżej jeden zielony przycisk, axe, zrzut. */
async function zmierzStan(page: Page, testInfo: TestInfo, nazwa: string): Promise<void> {
  await expect(page.locator("main")).toHaveCount(1);

  const przewijanie = await page.evaluate(() => {
    const szerokoscOkna = document.documentElement.clientWidth;
    const wystajace = Array.from(document.querySelectorAll<HTMLElement>("main *"))
      .filter((element) => element.getBoundingClientRect().right > szerokoscOkna + 1)
      .slice(0, 8)
      .map((element) => `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 40)}`);
    return { nadmiar: document.documentElement.scrollWidth - szerokoscOkna, wystajace };
  });
  expect(przewijanie.nadmiar, `przewijanie poziome: ${przewijanie.wystajace.join(", ")}`).toBeLessThanOrEqual(0);

  const zaMale = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("main a[href], main button, main [role='button']"))
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const ramka = element.getBoundingClientRect();
        return {
          nazwa: (element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 60),
          wysokosc: Math.round(ramka.height * 10) / 10,
          szerokosc: Math.round(ramka.width * 10) / 10,
          odnosnik: element.tagName === "A",
        };
      })
      .filter((cel) => cel.wysokosc < 44 || (!cel.odnosnik && cel.szerokosc < 44)),
  );
  expect(zaMale, "cele dotyku poniżej 44 px").toEqual([]);

  const zielone = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("main button"))
      .filter((przycisk) => /primary/.test(przycisk.className) && przycisk.getClientRects().length > 0)
      .map((przycisk) => (przycisk.textContent ?? "").trim()),
  );
  await testInfo.attach(`zielone-${nazwa}`, { body: JSON.stringify(zielone), contentType: "application/json" });
  expect(zielone.length, `zielone przyciski: ${zielone.join(", ")}`).toBe(1);

  const naruszenia = await uruchomAxe(page);
  await dolaczNaruszeniaDoRaportu(testInfo, `axe-${nazwa}`, naruszenia);
  expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);
  const pelny = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "best-practice"]).analyze();
  expect(
    pelny.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.map(String).join(" ")).join(" | ")}`),
    `axe z best-practice: ${nazwa}`,
  ).toEqual([]);
  await zrzut(page, nazwa);
}

const OKNA = [
  { szerokosc: 1280, wysokosc: 800 },
  { szerokosc: 390, wysokosc: 844 },
];

const BRAK_ODTWARZACZA = /^Odtwórz/;
const OZNACZ = "Oznacz lekcję jako ukończoną";

/** Przycisk ukończenia wygląda na nieczynny (`aria-disabled`), ale zostaje w kolejności fokusu. */
async function oczekujNieczynnegoPrzycisku(page: Page): Promise<void> {
  const przyciski = page.getByRole("button", { name: OZNACZ });
  await expect(przyciski.first()).toHaveAttribute("aria-disabled", "true");
}

for (const { szerokosc, wysokosc } of OKNA) {
  test.describe(`lekcja uczestnika: stan nagrania — ${szerokosc} px`, () => {
    test.use({ viewport: { width: szerokosc, height: wysokosc } });

    test("nagranie gotowe: odtwarzacz, bez zdania o przygotowaniu", async ({ page }, testInfo) => {
      const atrapa = await instalujAtrapy(page, { video_status: "ready" });
      await otworzLekcje(page);

      await expect(page.locator("main iframe")).toHaveCount(1);
      await expect(page.locator("main iframe")).toHaveAttribute("src", `${POCHODZENIE_ODTWARZACZA}/embed/1/lekcja-21?token=atrapa`);
      await expect(page.getByRole("button", { name: "Odtwórz nagranie" })).toHaveCount(0);
      await expect(page.getByText(ZDANIE)).toHaveCount(0);
      await expect(page.getByText(ZDANIE_BLEDU)).toHaveCount(0);
      await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
      await oczekujNieczynnegoPrzycisku(page);
      expect(atrapa.pytaniaOLink()).toBe(1);
      expect(atrapa.ramki(), "ramka dostała atrapę strony, nie prawdziwy odtwarzacz").toBeGreaterThan(0);

      await zmierzStan(page, testInfo, `uczestnik-gotowe-${szerokosc}`);
    });

    test("nagranie w przygotowaniu, długi tytuł: jedno zdanie, bez odtwarzacza i bez pytania o link", async ({ page }, testInfo) => {
      const atrapa = await instalujAtrapy(page, { video_status: "processing", tytul: DLUGI_TYTUL });
      await otworzLekcje(page, DLUGI_TYTUL);

      await expect(page.getByText(ZDANIE, { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: BRAK_ODTWARZACZA })).toHaveCount(0);
      await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
      await expect(page.getByText("Po tej lekcji rozróżniasz pytania otwarte i zamknięte.")).toBeVisible();
      await expect(page.locator("main")).not.toContainText(/przetwarza|wysyła|dostawc/i);
      expect(atrapa.pytaniaOLink()).toBe(0);

      await zmierzStan(page, testInfo, `uczestnik-w-przygotowaniu-${szerokosc}`);
    });

    test("stan `uploading`: to samo zdanie co przy przetwarzaniu", async ({ page }) => {
      const atrapa = await instalujAtrapy(page, { video_status: "uploading" });
      await otworzLekcje(page);

      await expect(page.getByText(ZDANIE, { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: BRAK_ODTWARZACZA })).toHaveCount(0);
      await expect(page.locator("main")).not.toContainText(/przetwarza|wysyła|dostawc/i);
      expect(atrapa.pytaniaOLink()).toBe(0);
    });

    test("stan `error`: komunikat, „Napisz do prowadzącego”, lekcji nie da się ukończyć", async ({ page }, testInfo) => {
      const atrapa = await instalujAtrapy(page, { video_status: "error" });
      await otworzLekcje(page);

      await expect(page.getByText(ZDANIE_BLEDU, { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Napisz do prowadzącego" })).toBeVisible();
      await expect(page.getByRole("button", { name: BRAK_ODTWARZACZA })).toHaveCount(0);
      await expect(page.getByText(ZDANIE)).toHaveCount(0);
      await oczekujNieczynnegoPrzycisku(page);
      expect(atrapa.pytaniaOLink()).toBe(0);

      await zmierzStan(page, testInfo, `uczestnik-nagranie-nie-dziala-${szerokosc}`);
    });

    test("odmowa linku `video_not_ready`: to samo zdanie", async ({ page }) => {
      await instalujAtrapy(page, { video_status: "ready", link: ["video_not_ready"] });
      await otworzLekcje(page);

      await expect(page.getByText(ZDANIE, { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: BRAK_ODTWARZACZA })).toHaveCount(0);
      await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    });

    test("link niedostępny (503): nagranie nie działa, bez cichego braku nagrania", async ({ page }) => {
      await instalujAtrapy(page, { video_status: "ready", link: ["niedostepny"] });
      await otworzLekcje(page);

      await expect(page.getByText(ZDANIE_BLEDU, { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Napisz do prowadzącego" })).toBeVisible();
      await expect(page.getByText(ZDANIE)).toHaveCount(0);
      await oczekujNieczynnegoPrzycisku(page);
    });

    test("lekcja bez nagrania: bez odtwarzacza, bez zdań o nagraniu", async ({ page }, testInfo) => {
      const atrapa = await instalujAtrapy(page, { video_status: "none" });
      await otworzLekcje(page);

      await expect(page.getByText("Po tej lekcji rozróżniasz pytania otwarte i zamknięte.")).toBeVisible();
      await expect(page.getByText(ZDANIE)).toHaveCount(0);
      await expect(page.getByText(ZDANIE_BLEDU)).toHaveCount(0);
      await expect(page.getByRole("button", { name: BRAK_ODTWARZACZA })).toHaveCount(0);
      await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
      expect(atrapa.pytaniaOLink()).toBe(0);

      await zmierzStan(page, testInfo, `uczestnik-bez-nagrania-${szerokosc}`);
    });

    test("odmowa linku `video_missing`: lekcja bez nagrania", async ({ page }) => {
      await instalujAtrapy(page, { video_status: "ready", link: ["video_missing"] });
      await otworzLekcje(page);

      await expect(page.getByText("Po tej lekcji rozróżniasz pytania otwarte i zamknięte.")).toBeVisible();
      await expect(page.getByText(ZDANIE)).toHaveCount(0);
      await expect(page.getByText(ZDANIE_BLEDU)).toHaveCount(0);
      await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    });
  });
}
