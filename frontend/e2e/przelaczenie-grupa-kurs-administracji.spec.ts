import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";
import { GRUPY } from "../lib/przelaczenie/grupy";

/**
 * Miara dla tej gałęzi: grupy przełączenia `kursAdministracji`,
 * `publikacjaKursu` i `zaproszeniaNaKurs` (`lib/przelaczenie/grupy.ts`) mają
 * tu `wlaczona: true`.
 *
 * Rodzaj „podmiana treści”: adres `/admin/kursy/{id}` się nie zmienia, pod nim
 * stoi ekran kursu nowego frontu w nowej ramce panelu. Sprawdzane na zbudowanej
 * aplikacji, z atrapą API przez `page.route` i atrapą sesji:
 * - adres, `h1`, jedyny `main` i `#tresc`, nowa ramka, każda sekcja raz;
 * - publikacja z odmową 422 i z sukcesem, cofnięcie publikacji;
 * - temat; lekcja: dodanie, edycja przy wierszu, usunięcie;
 * - dane kursu (ciało zapisu bez pozycji w ścieżce), materiały, zaproszenie,
 *   przypisanie prowadzącego;
 * - bank pytań otwiera się obu rolom administracji (200, nagłówek ekranu);
 * - niezapisany formularz lekcji a tryb kolejności na 390 px — fokus nigdy na
 *   `body`;
 * - usunięcie kursu;
 * - axe (WCAG 2.1 AA i `best-practice`) na 1280 i 390 px w stanach: z tematami,
 *   pusty, z rozwiniętą lekcją, z oknami potwierdzeń.
 * - ekran lekcji `/admin/kursy/{id}/lekcje/{idLekcji}` (grupa `edycjaLekcji`):
 *   próby czytają flagę grupy z rejestru — przy wyłączonej adres odpowiada 404
 *   i ekran kursu nie ma do niego odnośnika; przy włączonej obie role
 *   administracji dochodzą odnośnikiem z ekranu kursu do nagłówka lekcji,
 *   okruszki niosą nazwę kursu, lekcja spoza kursu to „nie znaleziono”,
 *   materiał lekcji da się wgrać i usunąć, odmowa serwera nie pokazuje danych;
 * Zrzuty ekranu powstają tylko przy ustawionej zmiennej `PW_ZRZUTY` (katalog
 * poza repozytorium) — okno przeglądarki po przewinięciu do elementu.
 */

const API = "http://localhost:8000/api/v1";
const ADRES = "/admin/kursy/4";
const GRUPA_LEKCJI = GRUPY.edycjaLekcji.wlaczona;
const ADRES_LEKCJI = "/admin/kursy/4/lekcje/22";

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
    description: null as string | null,
    content: null,
    sequence_order: id - 20,
    topic_id: topicId,
    topic_position: pozycja,
    video_provider_id: `wideo-${id}` as string | null,
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

function temat(id: number, title: string, position: number, lesson_ids: number[]) {
  return { id, course_id: 4, title, position, lesson_ids, created_at: null, updated_at: null };
}

const TEMATY = [temat(7, "Podstawy", 1, [21, 22]), temat(8, "Praktyka", 2, [23])];

const PROWADZACY = [
  { id: 5, first_name: "Joanna", last_name: "Demo" },
  { id: 6, first_name: "Adam", last_name: "Demo" },
];

const OSOBA = {
  id: 17,
  first_name: "Marta",
  last_name: "Demo",
  email: "marta@demo.pl",
  role: "volunteer",
  status: "active",
  product_group: "psychon",
  access_expires_at: "2027-02-01T00:00:00Z",
  program_completed_at: null,
  created_at: "2026-08-01T08:00:00Z",
};

function json(dane: unknown, meta?: unknown, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }),
  };
}

function blad(status: number, code: string, message: string, reszta: Record<string, unknown> = {}) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify({ error: { status, code, message, ...reszta } }),
  };
}

interface Zapis {
  metoda: string;
  sciezka: string;
  cialo: unknown;
}

interface Opcje {
  rola?: "project_manager" | "super_admin";
  tryb?: "tematy" | "pusty";
  /** Pierwsza próba publikacji kończy się odmową 422 z brakami. */
  odmowaPublikacji?: boolean;
  /** Lista lekcji kursu odpowiada 403 — ekran lekcji pokazuje stan odmowy. */
  odmowaLekcji?: boolean;
  /** Lekcja 22 ma gotowe nagranie i dwa zapisane materiały. */
  lekcjaZNagraniem?: boolean;
}

/**
 * Atrapy API ze stanem. Ogólna atrapa (pusta lista) jest rejestrowana PIERWSZA
 * — Playwright wybiera trasę zarejestrowaną PÓŹNIEJ jako pierwszą.
 */
async function instalujAtrapy(page: Page, opcje: Opcje = {}): Promise<{ zapisy: Zapis[]; sciezki: string[] }> {
  const zapisy: Zapis[] = [];
  const sciezki: string[] = [];
  const pusty = opcje.tryb === "pusty";
  let kurs: Record<string, unknown> = pusty ? { ...KURS, lessons_count: 0, materials_count: 0 } : KURS;
  let lekcje = pusty ? [] : LEKCJE;
  let tematy = pusty ? [] : TEMATY;
  let przypisania: { id: number; course_id: number; lesson_id: number | null; instructor: (typeof PROWADZACY)[number] }[] = [];
  let nastepnyId = 100;
  let odmowaPublikacji = opcje.odmowaPublikacji === true;

  page.on("request", (zadanie) => {
    if (zadanie.url().startsWith(API)) sciezki.push(zadanie.url().slice(API.length));
  });

  await page.route(`${API}/**`, (route) => route.fulfill(json([], META_PUSTA)));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(
      json({ id: 1, role: opcje.rola ?? "project_manager", first_name: "Anna", program_completed_at: null }),
    ),
  );
  await page.route(`${API}/notifications**`, (route) =>
    route.fulfill(json([], { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { unread: 0 } })),
  );
  await page.route(`${API}/admin/users**`, (route) => route.fulfill(json([OSOBA], { ...META_PUSTA, total: 1 })));
  await page.route(`${API}/instructors**`, (route) => route.fulfill(json(PROWADZACY, { ...META_PUSTA, total: 2 })));
  await page.route(
    (adres) => adres.pathname.startsWith("/api/v1/admin/"),
    async (route) => {
      const zadanie = route.request();
      const sciezka = new URL(zadanie.url()).pathname.replace("/api/v1", "");
      const metoda = zadanie.method();
      const zapisz = (cialo: unknown) => zapisy.push({ metoda, sciezka, cialo });
      const cialoJson = () => zadanie.postDataJSON() as Record<string, unknown>;

      if (sciezka === "/admin/courses/4") {
        if (metoda === "PATCH") {
          const cialo = cialoJson();
          zapisz(cialo);
          if (cialo.is_published === true && odmowaPublikacji) {
            odmowaPublikacji = false;
            return route.fulfill(
              blad(422, "conditions_not_met", "Kurs nie spełnia warunków publikacji.", {
                reason: { missing: ["lessons"] },
              }),
            );
          }
          kurs = { ...kurs, ...cialo };
        }
        if (metoda === "DELETE") {
          zapisz(null);
          return route.fulfill(json({ id: 4, deleted: true }));
        }
        return route.fulfill(json(kurs));
      }
      if (sciezka === "/admin/courses/4/lessons") {
        if (opcje.odmowaLekcji) return route.fulfill(blad(403, "forbidden", "Brak uprawnień."));
        if (metoda === "POST") {
          const cialo = cialoJson();
          zapisz(cialo);
          const nowa = {
            ...lekcja(nastepnyId++, String(cialo.title), Number(cialo.topic_id), 9),
            description: (cialo.description as string | null) ?? null,
            duration_seconds: Number(cialo.duration_seconds),
            video_provider_id: null,
          };
          lekcje = [...lekcje, nowa];
          tematy = tematy.map((wpis) =>
            wpis.id === nowa.topic_id ? { ...wpis, lesson_ids: [...wpis.lesson_ids, nowa.id] } : wpis,
          );
          return route.fulfill(json(nowa, undefined, 201));
        }
        return route.fulfill(
          json(opcje.lekcjaZNagraniem ? lekcje.map((wpis) => (wpis.id === 22 ? { ...wpis, materials_count: 2 } : wpis)) : lekcje),
        );
      }
      if (/^\/admin\/lessons\/\d+\/video-status$/.test(sciezka)) {
        return route.fulfill(
          json(
            opcje.lekcjaZNagraniem
              ? { status: "finished", duration_seconds: 1500, preview_embed_url: null }
              : { status: "no_video" },
          ),
        );
      }
      if (/^\/admin\/lessons\/\d+\/materials$/.test(sciezka) && metoda === "POST") {
        zapisz("plik");
        return route.fulfill(
          json(
            { id: nastepnyId++, name: "karta-pracy.pdf", mime: "application/pdf", size: 5, lesson_id: 22, course_id: null, created_at: null },
            undefined,
            201,
          ),
        );
      }
      const jednaLekcja = /^\/admin\/lessons\/(\d+)$/.exec(sciezka);
      if (jednaLekcja) {
        const id = Number(jednaLekcja[1]);
        if (metoda === "DELETE") {
          zapisz(null);
          lekcje = lekcje.filter((wpis) => wpis.id !== id);
          return route.fulfill(json({ id, deleted: true }));
        }
        const cialo = cialoJson();
        zapisz(cialo);
        lekcje = lekcje.map((wpis) => (wpis.id === id ? { ...wpis, ...cialo } : wpis));
        return route.fulfill(json(lekcje.find((wpis) => wpis.id === id)));
      }
      if (sciezka === "/admin/courses/4/topics") {
        if (metoda === "POST") {
          const cialo = cialoJson();
          zapisz(cialo);
          const nowy = temat(nastepnyId++, String(cialo.title), tematy.length + 1, []);
          tematy = [...tematy, nowy];
          return route.fulfill(json(nowy, undefined, 201));
        }
        return route.fulfill(json(tematy));
      }
      if (sciezka === "/admin/courses/4/materials" && metoda === "POST") {
        zapisz("plik");
        return route.fulfill(
          json(
            { id: nastepnyId++, name: "karta-pracy.pdf", mime: "application/pdf", size: 5, lesson_id: null, course_id: 4, created_at: null },
            undefined,
            201,
          ),
        );
      }
      if (/^\/admin\/materials\/\d+$/.test(sciezka) && metoda === "DELETE") {
        zapisz(null);
        return route.fulfill(json({ id: Number(sciezka.split("/").pop()), deleted: true }));
      }
      if (sciezka === "/admin/courses/4/assignments") {
        if (metoda === "POST") {
          const cialo = cialoJson();
          zapisz(cialo);
          const nowe = {
            id: nastepnyId++,
            course_id: 4,
            lesson_id: (cialo.lesson_id as number | null) ?? null,
            instructor: PROWADZACY.find((osoba) => osoba.id === cialo.instructor_id)!,
          };
          przypisania = [...przypisania, nowe];
          return route.fulfill(json(nowe, undefined, 201));
        }
        if (metoda === "DELETE") {
          const cialo = cialoJson();
          zapisz(cialo);
          przypisania = przypisania.filter((wpis) => wpis.id !== cialo.assignment_id);
          return route.fulfill(json({ id: cialo.assignment_id, deleted: true }));
        }
        return route.fulfill(json(przypisania));
      }
      if (sciezka === "/admin/courses/4/tests") {
        return route.fulfill(json({ id: 31, course_id: 4, pass_threshold: 80, attempts_limit: 3, question_count: 2 }));
      }
      if (sciezka === "/admin/courses/4/invite" && metoda === "POST") {
        const cialo = cialoJson();
        zapisz(cialo);
        return route.fulfill(json({ invited: (cialo.user_ids as number[]).length }));
      }
      return route.fallback();
    },
  );

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

/** axe: WCAG 2.0 A/AA, 2.1 AA (wspólny skan) i dodatkowo zestaw `best-practice` — zero naruszeń. */
async function sprawdzAxe(page: Page, testInfo: TestInfo, nazwa: string): Promise<void> {
  const naruszenia = await uruchomAxe(page);
  await dolaczNaruszeniaDoRaportu(testInfo, nazwa, naruszenia);
  expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);
  const pelny = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "best-practice"]).analyze();
  expect(
    pelny.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.map(String).join(" ")).join(" | ")}`),
    `axe z best-practice: ${nazwa}`,
  ).toEqual([]);
}

async function otworzKurs(page: Page): Promise<void> {
  const odpowiedz = await page.goto(ADRES);
  expect(odpowiedz?.status()).toBe(200);
  await zabezpieczeniePrzedEkranemDostepu(page);
  await expect(page.getByRole("heading", { level: 1, name: KURS.title })).toBeVisible();
}

function wiersz(page: Page, id: number): Locator {
  return page.locator(`li[data-lekcja='${id}']`);
}

async function wybierz(page: Page, pole: RegExp, opcja: string): Promise<void> {
  await page.getByRole("combobox", { name: pole }).click();
  await page.getByRole("option", { name: opcja, exact: true }).click();
}

const OKNA = [
  { szerokosc: 1280, wysokosc: 800 },
  { szerokosc: 390, wysokosc: 844 },
];

for (const { szerokosc, wysokosc } of OKNA) {
  test.describe(`kurs administracji pod adresem /admin/kursy/{id} — ${szerokosc} px`, () => {
    test.use({ viewport: { width: szerokosc, height: wysokosc } });

    test("kurs z tematami: adres bez zmian, nowa ramka, jeden main, każda sekcja raz, axe", async ({
      page,
    }, testInfo) => {
      const { sciezki } = await instalujAtrapy(page);
      await otworzKurs(page);

      await expect(page).toHaveURL(/\/admin\/kursy\/4$/);
      await expect(page).toHaveTitle("Kurs — Niepodzielni");
      await expect(page.locator("[data-powloka-panelu]")).toHaveCount(1);
      expect(await page.locator("main").count()).toBe(1);
      expect(await page.locator("#tresc").count()).toBe(1);
      await expect(page.getByRole("heading", { level: 3, name: "Podstawy" })).toBeVisible();
      for (const id of ["lekcje", "opis", "zaproszenia", "materialy", "prowadzacy", "test"]) {
        await expect(page.locator(`#${id}`)).toHaveCount(1);
      }
      await expect(page.getByRole("link", { name: "Otwórz bank pytań" })).toHaveAttribute(
        "href",
        "/admin/testy/31/pytania",
      );
      await expect(page.getByText("Cały kurs: brak prowadzącego")).toBeVisible();

      await bezPrzewijaniaPoziomego(page);
      await sprawdzAxe(page, testInfo, `axe-kurs-${szerokosc}-tematy`);
      await zrzut(page, `kurs-${szerokosc}-tematy-gora`);
      await zrzut(page, `kurs-${szerokosc}-dane-kursu`, page.locator("#opis"));
      await zrzut(page, `kurs-${szerokosc}-materialy`, page.locator("#materialy"));
      await zrzut(page, `kurs-${szerokosc}-prowadzacy`, page.locator("#prowadzacy"));
      await zrzut(page, `kurs-${szerokosc}-test`, page.locator("#test"));

      expect(sciezki.filter((sciezka) => sciezka.startsWith("/instructor/"))).toEqual([]);
    });

    test("kurs bez tematów: „Dodaj pierwszy temat”, axe", async ({ page }, testInfo) => {
      await instalujAtrapy(page, { tryb: "pusty" });
      await otworzKurs(page);

      await expect(page.getByRole("button", { name: "Dodaj pierwszy temat" })).toBeVisible();
      expect(await page.locator("main").count()).toBe(1);
      await bezPrzewijaniaPoziomego(page);
      await sprawdzAxe(page, testInfo, `axe-kurs-${szerokosc}-pusty`);
      await zrzut(page, `kurs-${szerokosc}-pusty`);
    });

    test("rozwinięta lekcja: formularz czterech pól, odnośnik do ekranu lekcji tylko przy włączonej grupie, powiadomienie o zapisie pod formularzem, axe", async ({
      page,
    }, testInfo) => {
      const { zapisy } = await instalujAtrapy(page);
      await otworzKurs(page);

      await page.getByRole("button", { name: "Edytuj lekcję „Pytania otwarte i zamknięte”" }).click();
      const li = wiersz(page, 22);
      const formularz = li.getByRole("form", { name: "Edycja lekcji" });
      await expect(formularz).toBeVisible();
      await expect(formularz.locator("input, textarea")).toHaveCount(4);
      await expect(li.getByRole("link")).toHaveCount(GRUPA_LEKCJI ? 1 : 0);
      if (GRUPA_LEKCJI) {
        await expect(li.getByRole("link", { name: "Materiały i nagranie" })).toHaveAttribute("href", ADRES_LEKCJI);
      }
      await expect(li.getByRole("button", { name: "Usuń lekcję „Pytania otwarte i zamknięte”" })).toBeVisible();

      await bezPrzewijaniaPoziomego(page);
      await sprawdzAxe(page, testInfo, `axe-kurs-${szerokosc}-lekcja-rozwinieta`);
      await zrzut(page, `kurs-${szerokosc}-lekcja-rozwinieta`, li);

      await formularz.getByLabel(/^Tytuł lekcji/).fill("Pytania otwarte");
      await formularz.getByRole("button", { name: "Zapisz lekcję" }).click();
      const powiadomienie = li.getByRole("status").filter({ hasText: "Lekcja została zapisana." });
      await expect(powiadomienie).toBeVisible();
      expect(zapisy.map((zapis) => `${zapis.metoda} ${zapis.sciezka}`)).toEqual(["PATCH /admin/lessons/22"]);

      // Powiadomienie stoi w rozwinięciu wiersza, pod formularzem — nie zasłania
      // nagłówka następnego tematu ani żadnego wiersza lekcji.
      const ramka = (await powiadomienie.boundingBox())!;
      const rozwiniecie = (await li.locator("[data-rozwiniecie-lekcji]").boundingBox())!;
      const formularzRamka = (await formularz.boundingBox())!;
      const nastepnyTemat = (await page.getByRole("heading", { level: 3, name: "Praktyka" }).boundingBox())!;
      expect(await powiadomienie.evaluate((wezel) => getComputedStyle(wezel).position)).toBe("static");
      expect(ramka.y).toBeGreaterThanOrEqual(formularzRamka.y + formularzRamka.height - 1);
      expect(ramka.y + ramka.height).toBeLessThanOrEqual(rozwiniecie.y + rozwiniecie.height + 1);
      expect(ramka.y + ramka.height).toBeLessThanOrEqual(nastepnyTemat.y + 1);
      await zrzut(page, `kurs-${szerokosc}-lekcja-zapisana-powiadomienie`, formularz.getByRole("button", { name: "Zapisz lekcję" }));
    });

    test("okna potwierdzeń: porzucenie zmian w lekcji, usunięcie lekcji, nowy temat, usunięcie kursu — axe", async ({
      page,
    }, testInfo) => {
      const { zapisy } = await instalujAtrapy(page);
      await otworzKurs(page);

      await page.getByRole("button", { name: "Edytuj lekcję „Wprowadzenie do wywiadu”" }).click();
      const formularz = wiersz(page, 21).getByRole("form", { name: "Edycja lekcji" });
      const tytul = formularz.getByLabel(/^Tytuł lekcji/);
      await tytul.fill("Niezapisany tytuł");
      await page.getByRole("button", { name: "Edytuj lekcję „Ćwiczenie w parach”" }).click();
      const pytanie = page.getByRole("dialog", { name: "Porzucić niezapisane zmiany w lekcji?" });
      await expect(pytanie.getByRole("button", { name: "Zostań" })).toBeFocused();
      await sprawdzAxe(page, testInfo, `axe-kurs-${szerokosc}-okno-porzucenia`);
      await zrzut(page, `kurs-${szerokosc}-okno-porzucenia`, pytanie);
      await pytanie.getByRole("button", { name: "Zostań" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(tytul).toHaveValue("Niezapisany tytuł");
      await expect(tytul).toBeFocused();
      await expect(page.locator("[data-rozwiniecie-lekcji]")).toHaveCount(1);

      await page.getByRole("button", { name: "Edytuj lekcję „Ćwiczenie w parach”" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Porzuć zmiany" }).click();
      await expect(wiersz(page, 23).getByRole("form", { name: "Edycja lekcji" })).toBeVisible();
      await expect(page.locator("[data-rozwiniecie-lekcji]")).toHaveCount(1);

      await wiersz(page, 23).getByRole("button", { name: "Usuń lekcję „Ćwiczenie w parach”" }).click();
      const usuniecie = page.getByRole("dialog", { name: "Usunąć lekcję „Ćwiczenie w parach”?" });
      await expect(usuniecie).toBeVisible();
      await sprawdzAxe(page, testInfo, `axe-kurs-${szerokosc}-okno-usuniecia-lekcji`);
      await zrzut(page, `kurs-${szerokosc}-okno-usuniecia-lekcji`, usuniecie);
      await usuniecie.getByRole("button", { name: "Anuluj" }).click();
      await wiersz(page, 23).getByRole("form").getByRole("button", { name: "Anuluj" }).click();

      await page.getByRole("button", { name: "Dodaj temat", exact: true }).click();
      const nowyTemat = page.getByRole("dialog", { name: "Nowy temat" });
      await expect(nowyTemat).toBeVisible();
      await sprawdzAxe(page, testInfo, `axe-kurs-${szerokosc}-okno-nowego-tematu`);
      await zrzut(page, `kurs-${szerokosc}-okno-nowego-tematu`, nowyTemat);
      await nowyTemat.getByRole("button", { name: "Anuluj" }).click();

      await page.getByRole("button", { name: "Usunięcie kursu (1)" }).click();
      await page.getByRole("button", { name: "Usuń kurs" }).click();
      const usuniecieKursu = page.getByRole("dialog", { name: "Usunąć kurs?" });
      await expect(usuniecieKursu).toBeVisible();
      await sprawdzAxe(page, testInfo, `axe-kurs-${szerokosc}-okno-usuniecia-kursu`);
      await zrzut(page, `kurs-${szerokosc}-okno-usuniecia-kursu`, usuniecieKursu);
      await usuniecieKursu.getByRole("button", { name: "Anuluj" }).click();

      expect(zapisy).toEqual([]);
    });
  });
}

test.describe("kurs administracji — operacje (1280 px)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("publikacja: odmowa 422 pokazuje braki i nie zmienia stanu; druga próba publikuje; cofnięcie publikacji", async ({
    page,
  }) => {
    const { zapisy } = await instalujAtrapy(page, { odmowaPublikacji: true });
    await otworzKurs(page);

    await page.getByRole("button", { name: "Opublikuj kurs" }).click();
    await expect(page.getByText("Braki przed publikacją")).toBeVisible();
    await expect(page.getByText("Dodaj co najmniej jedną lekcję")).toBeVisible();
    await expect(page.getByText("Opublikowany", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cofnij publikację" })).toHaveCount(0);
    await zrzut(page, "kurs-1280-publikacja-odmowa");

    await page.getByRole("button", { name: "Opublikuj kurs" }).first().click();
    await expect(page.getByText("Opublikowany", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Opublikuj kurs" })).toHaveCount(0);
    await zrzut(page, "kurs-1280-opublikowany");

    await page.getByRole("button", { name: "Cofnij publikację" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cofnij publikację" }).click();
    await expect(page.getByRole("button", { name: "Opublikuj kurs" })).toHaveCount(1);
    await expect(page.getByText("Opublikowany", { exact: true })).toHaveCount(0);

    expect(zapisy).toEqual([
      { metoda: "PATCH", sciezka: "/admin/courses/4", cialo: { is_published: true } },
      { metoda: "PATCH", sciezka: "/admin/courses/4", cialo: { is_published: true } },
      { metoda: "PATCH", sciezka: "/admin/courses/4", cialo: { is_published: false } },
    ]);
  });

  test("temat i lekcja: nowy temat, dodanie lekcji w temacie, edycja przy wierszu, usunięcie z potwierdzeniem", async ({
    page,
  }) => {
    const { zapisy } = await instalujAtrapy(page);
    await otworzKurs(page);

    await page.getByRole("button", { name: "Dodaj temat", exact: true }).click();
    const okno = page.getByRole("dialog", { name: "Nowy temat" });
    await okno.getByLabel(/^Nazwa tematu/).fill("Podsumowanie");
    await okno.getByRole("button", { name: "Dodaj temat" }).click();
    await expect(page.getByRole("heading", { level: 3, name: "Podsumowanie" })).toBeVisible();

    await page.getByTestId("ct-dodaj-8").click();
    const nowa = page.locator("[data-pod-tematem='8']").getByRole("form", { name: "Nowa lekcja" });
    await expect(nowa.getByLabel(/^Tytuł lekcji/)).toBeFocused();
    await zrzut(page, "kurs-1280-nowa-lekcja", page.getByRole("heading", { level: 3, name: "Praktyka" }));
    await nowa.getByLabel(/^Tytuł lekcji/).fill("Rozmowa próbna");
    await nowa.getByLabel(/^Czas trwania w minutach/).fill("10");
    await nowa.getByRole("button", { name: "Dodaj lekcję" }).click();
    const edytujNowa = page.getByRole("button", { name: "Edytuj lekcję „Rozmowa próbna”" });
    await expect(edytujNowa).toBeFocused();
    await expect(page.locator("[data-pod-tematem]")).toHaveCount(0);

    await edytujNowa.click();
    const li = wiersz(page, 101);
    const formularz = li.getByRole("form", { name: "Edycja lekcji" });
    await formularz.getByLabel(/^Tytuł lekcji/).fill("Rozmowa próbna w parach");
    await formularz.getByRole("button", { name: "Zapisz lekcję" }).click();
    await expect(li.getByText("Rozmowa próbna w parach · 10 min")).toBeVisible();

    await li.getByRole("button", { name: "Usuń lekcję „Rozmowa próbna w parach”" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Usuń lekcję" }).click();
    await expect(wiersz(page, 101)).toHaveCount(0);
    await expect(page.getByTestId("ct-dodaj-8")).toBeFocused();
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");

    expect(zapisy).toEqual([
      { metoda: "POST", sciezka: "/admin/courses/4/topics", cialo: { title: "Podsumowanie" } },
      {
        metoda: "POST",
        sciezka: "/admin/courses/4/lessons",
        cialo: { title: "Rozmowa próbna", description: null, duration_seconds: 600, topic_id: 8 },
      },
      {
        metoda: "PATCH",
        sciezka: "/admin/lessons/101",
        cialo: { title: "Rozmowa próbna w parach", description: null, content: "", duration_seconds: 600 },
      },
      { metoda: "DELETE", sciezka: "/admin/lessons/101", cialo: null },
    ]);
  });

  test("dane kursu, materiały, zaproszenie, prowadzący: każda operacja jednym żądaniem; zapis danych bez pozycji w ścieżce", async ({
    page,
  }) => {
    const { zapisy } = await instalujAtrapy(page);
    await otworzKurs(page);

    await page.getByRole("button", { name: "Zmień dane kursu" }).click();
    const dane = page.getByRole("form", { name: "Dane kursu" });
    await expect(dane.getByLabel(/Pozycja/)).toHaveCount(0);
    await expect(dane).not.toContainText(/slug/i);
    await dane.getByLabel(/^Tytuł kursu/).fill("Wywiad psychologiczny — podstawy");
    await dane.getByLabel(/^Identyfikator/).fill("wywiad-podstawy");
    await wybierz(page, /^Typ/, "Kurs");
    await zrzut(page, "kurs-1280-dane-kursu-formularz", dane);
    await dane.getByRole("button", { name: "Zapisz zmiany" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Wywiad psychologiczny — podstawy" })).toBeVisible();
    await expect(page.getByRole("form", { name: "Dane kursu" })).toHaveCount(0);

    const materialy = page.locator("#materialy");
    await materialy
      .locator("input[type='file']")
      .setInputFiles({ name: "karta-pracy.pdf", mimeType: "application/pdf", buffer: Buffer.from("tresc") });
    await expect(materialy.getByText(/bez lekcji: 2\./)).toBeVisible();
    await materialy.getByRole("button", { name: "Usuń materiał „karta-pracy.pdf”" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Usuń materiał" }).click();
    await expect(materialy.getByText(/bez lekcji: 1\./)).toBeVisible();

    const zaproszenia = page.locator("#zaproszenia");
    await zaproszenia.getByRole("button", { name: "Zaproś osoby" }).click();
    await zaproszenia.getByLabel("Marta Demo · marta@demo.pl").check();
    await zaproszenia.getByRole("button", { name: "Wyślij zaproszenia" }).click();
    await expect(page.getByText("Zaproszono 1 osobę.")).toBeVisible();

    const prowadzacy = page.locator("#prowadzacy");
    await wybierz(page, /^Prowadzący/, "Joanna Demo");
    await prowadzacy.getByRole("button", { name: "Przypisz prowadzącego" }).click();
    await expect(prowadzacy.getByText("Cały kurs: Joanna Demo")).toBeVisible();
    await zrzut(page, "kurs-1280-prowadzacy-przypisany", prowadzacy);
    await prowadzacy.getByRole("button", { name: "Odłącz: Joanna Demo, Cały kurs" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Odłącz prowadzącego" }).click();
    await expect(prowadzacy.getByText("Cały kurs: brak prowadzącego")).toBeVisible();

    const cialoDanych = zapisy[0].cialo as Record<string, unknown>;
    expect(Object.keys(cialoDanych).sort()).toEqual(["description", "product_group", "slug", "title", "type"]);
    expect(Object.keys(cialoDanych)).not.toContain("sequence_order");
    expect(zapisy).toEqual([
      {
        metoda: "PATCH",
        sciezka: "/admin/courses/4",
        cialo: {
          title: "Wywiad psychologiczny — podstawy",
          description: KURS.description,
          slug: "wywiad-podstawy",
          type: "course",
          product_group: "psychon",
        },
      },
      { metoda: "POST", sciezka: "/admin/courses/4/materials", cialo: "plik" },
      { metoda: "DELETE", sciezka: "/admin/materials/100", cialo: null },
      { metoda: "POST", sciezka: "/admin/courses/4/invite", cialo: { user_ids: [17] } },
      { metoda: "POST", sciezka: "/admin/courses/4/assignments", cialo: { instructor_id: 5, lesson_id: null } },
      { metoda: "DELETE", sciezka: "/admin/courses/4/assignments", cialo: { assignment_id: 101 } },
    ]);
  });

  test("usunięcie kursu: potwierdzenie wysyła DELETE i pokazuje powrót do listy kursów", async ({ page }) => {
    const { zapisy } = await instalujAtrapy(page);
    await otworzKurs(page);

    await page.getByRole("button", { name: "Usunięcie kursu (1)" }).click();
    await page.getByRole("button", { name: "Usuń kurs" }).click();
    await page.getByRole("dialog", { name: "Usunąć kurs?" }).getByRole("button", { name: "Usuń kurs" }).click();

    await expect(page.getByText("Kurs został usunięty")).toBeVisible();
    await expect(page.getByRole("link", { name: "Wróć do listy kursów" })).toHaveAttribute("href", "/admin/kursy");
    expect(zapisy).toEqual([{ metoda: "DELETE", sciezka: "/admin/courses/4", cialo: null }]);
    await zrzut(page, "kurs-1280-usuniety");
  });
});

for (const rola of ["project_manager", "super_admin"] as const) {
  test.describe(`bank pytań z ekranu kursu — rola ${rola}`, () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test("„Otwórz bank pytań” prowadzi do ekranu banku pytań: 200 i nagłówek ekranu", async ({ page }) => {
      await instalujAtrapy(page, { rola });
      await otworzKurs(page);

      const odnosnik = page.getByRole("link", { name: "Otwórz bank pytań" });
      const adres = await odnosnik.getAttribute("href");
      expect(adres).toBe("/admin/testy/31/pytania");
      const odpowiedz = await page.goto(adres!);
      expect(odpowiedz?.status()).toBe(200);
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.getByRole("heading", { level: 1, name: "Bank pytań" })).toBeVisible();
      await expect(page.getByText(/Brak dostępu|Nie masz uprawnień/)).toHaveCount(0);
    });
  });
}

test.describe("formularz lekcji a tryb kolejności — 390 px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  async function aktywny(page: Page) {
    return page.evaluate(() => ({
      znacznik: document.activeElement?.tagName ?? null,
      wcisniety: document.activeElement?.getAttribute("aria-pressed") ?? null,
      tekst: document.activeElement?.textContent?.trim() ?? null,
    }));
  }

  test("formularz bez zmian: wejście w tryb kolejności zamyka go, fokus stoi na przełączniku „Kolejność”", async ({
    page,
  }) => {
    await instalujAtrapy(page);
    await otworzKurs(page);

    await page.getByRole("button", { name: "Edytuj lekcję „Pytania otwarte i zamknięte”" }).click();
    await expect(wiersz(page, 22).getByRole("form", { name: "Edycja lekcji" })).toBeVisible();
    await page.getByRole("button", { name: "Kolejność" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("[data-rozwiniecie-lekcji]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Kolejność" })).toHaveAttribute("aria-pressed", "true");
    expect(await aktywny(page)).toEqual({ znacznik: "BUTTON", wcisniety: "true", tekst: "Kolejność" });
    await zrzut(page, "kurs-390-tryb-kolejnosci-po-zamknieciu", page.locator("#lekcje"));
  });

  test("formularz ze zmianami: tryb kolejności pyta; „Zostań” wraca do pola, „Porzuć zmiany” zamyka formularz i zostawia fokus na przełączniku", async ({
    page,
  }) => {
    const { zapisy } = await instalujAtrapy(page);
    await otworzKurs(page);

    await page.getByRole("button", { name: "Edytuj lekcję „Wprowadzenie do wywiadu”" }).click();
    const tytul = wiersz(page, 21).getByRole("form", { name: "Edycja lekcji" }).getByLabel(/^Tytuł lekcji/);
    await tytul.fill("Niezapisany tytuł");

    await page.getByRole("button", { name: "Kolejność" }).click();
    const pytanie = page.getByRole("dialog", { name: "Porzucić niezapisane zmiany w lekcji?" });
    await expect(pytanie.getByRole("button", { name: "Zostań" })).toBeFocused();
    await zrzut(page, "kurs-390-tryb-kolejnosci-pytanie", pytanie);
    await pytanie.getByRole("button", { name: "Zostań" }).click();
    await expect(tytul).toBeFocused();
    await expect(tytul).toHaveValue("Niezapisany tytuł");
    await expect(page.getByRole("button", { name: "Kolejność" })).toHaveAttribute("aria-pressed", "false");
    expect((await aktywny(page)).znacznik).toBe("INPUT");

    await page.getByRole("button", { name: "Kolejność" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Porzuć zmiany" }).click();
    await expect(page.locator("[data-rozwiniecie-lekcji]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Kolejność" })).toHaveAttribute("aria-pressed", "true");
    expect(await aktywny(page)).toEqual({ znacznik: "BUTTON", wcisniety: "true", tekst: "Kolejność" });
    expect(zapisy).toEqual([]);
  });
});

test.describe("ekran lekcji — grupa wyłączona", () => {
  test.skip(GRUPA_LEKCJI, "grupa ekranu lekcji jest włączona");
  test.use({ viewport: { width: 1280, height: 800 } });

  test("adres ekranu lekcji odpowiada 404, a ekran kursu nie ma do niego odnośnika", async ({ page }) => {
    await instalujAtrapy(page);
    const odpowiedz = await page.goto(ADRES_LEKCJI);
    expect(odpowiedz?.status()).toBe(404);

    await otworzKurs(page);
    await page.getByRole("button", { name: "Edytuj lekcję „Pytania otwarte i zamknięte”" }).click();
    await expect(wiersz(page, 22).getByRole("form", { name: "Edycja lekcji" })).toBeVisible();
    await expect(page.locator("a[href*='/lekcje/']")).toHaveCount(0);
  });
});

async function otworzLekcje(page: Page, adres = ADRES_LEKCJI): Promise<void> {
  const odpowiedz = await page.goto(adres);
  expect(odpowiedz?.status()).toBe(200);
  await zabezpieczeniePrzedEkranemDostepu(page);
}

for (const rola of ["project_manager", "super_admin"] as const) {
  test.describe(`ekran lekcji z ekranu kursu — rola ${rola}`, () => {
    test.skip(!GRUPA_LEKCJI, "grupa ekranu lekcji jest wyłączona");
    test.use({ viewport: { width: 1280, height: 800 } });

    test("„Materiały i nagranie” prowadzi do ekranu lekcji: adres z kursem, nagłówek lekcji, okruszki z nazwą kursu, nowa ramka", async ({
      page,
    }) => {
      await instalujAtrapy(page, { rola });
      await otworzKurs(page);

      await page.getByRole("button", { name: "Edytuj lekcję „Pytania otwarte i zamknięte”" }).click();
      const odnosnik = wiersz(page, 22).getByRole("link", { name: "Materiały i nagranie" });
      await expect(odnosnik).toHaveAttribute("href", ADRES_LEKCJI);
      await odnosnik.click();

      await expect(page).toHaveURL(new RegExp(`${ADRES_LEKCJI}$`));
      await expect(page.getByRole("heading", { level: 1, name: "Pytania otwarte i zamknięte" })).toBeVisible();
      const okruszki = page.getByRole("navigation", { name: "Okruszki" });
      await expect(okruszki.getByRole("link", { name: "Kursy" })).toHaveAttribute("href", "/admin/kursy");
      await expect(okruszki.getByRole("link", { name: KURS.title })).toHaveAttribute("href", ADRES);
      await expect(page.getByRole("heading", { level: 2, name: "Materiały" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: "Nagranie" })).toBeVisible();
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("[data-powloka-panelu]")).toHaveCount(1);
      await expect(page.getByText(/Brak dostępu|Nie masz uprawnień/)).toHaveCount(0);

      // Sekcja nagrania: wgrywa tylko Super Admin, opiekun projektu widzi stan i powód.
      const wgrywanie = page.getByText("Upuść tutaj nagranie albo wybierz je z dysku.");
      const powod = page.getByText("Nagranie może wgrać tylko Super Admin. Stan nagrania widzisz, ale go nie zmienisz.");
      await expect(wgrywanie).toHaveCount(rola === "super_admin" ? 1 : 0);
      await expect(powod).toHaveCount(rola === "super_admin" ? 0 : 1);
    });
  });
}

for (const { szerokosc, wysokosc } of OKNA) {
  test.describe(`ekran lekcji pod adresem /admin/kursy/{id}/lekcje/{idLekcji} — ${szerokosc} px`, () => {
    test.skip(!GRUPA_LEKCJI, "grupa ekranu lekcji jest wyłączona");
    test.use({ viewport: { width: szerokosc, height: wysokosc } });

    test("stan pusty: lekcja bez nagrania i bez materiałów; jeden main, bez przewijania poziomego, axe", async ({
      page,
    }, testInfo) => {
      await instalujAtrapy(page, { rola: "super_admin" });
      await otworzLekcje(page);

      await expect(page.getByRole("heading", { level: 1, name: "Pytania otwarte i zamknięte" })).toBeVisible();
      await expect(page.getByText("Materiały przy tej lekcji: 0.")).toBeVisible();
      await expect(page.getByText("Ta lekcja nie ma jeszcze nagrania.")).toBeVisible();
      await expect(page.getByLabel(/^Czas trwania w minutach/)).toHaveValue("25");
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("#tresc")).toHaveCount(1);
      await bezPrzewijaniaPoziomego(page);
      await sprawdzAxe(page, testInfo, `axe-lekcja-${szerokosc}-pusta`);
      await zrzut(page, `lekcja-${szerokosc}-stan-pusty-gora`);
      await zrzut(page, `lekcja-${szerokosc}-stan-pusty-materialy-i-nagranie`, page.getByRole("heading", { level: 2, name: "Materiały" }));
    });

    test("nagranie gotowe i materiały: wgranie materiału, usunięcie z potwierdzeniem — po jednym żądaniu; axe", async ({
      page,
    }, testInfo) => {
      const { zapisy } = await instalujAtrapy(page, { rola: "super_admin", lekcjaZNagraniem: true });
      await otworzLekcje(page);

      await expect(page.getByText("Materiały przy tej lekcji: 2.")).toBeVisible();
      await expect(page.getByText("Nagranie jest gotowe. Czas trwania:", { exact: false })).toBeVisible();
      await zrzut(page, `lekcja-${szerokosc}-nagranie-gotowe`, page.getByRole("heading", { level: 2, name: "Nagranie" }));

      await page
        .locator("section", { has: page.getByRole("heading", { level: 2, name: "Materiały" }) })
        .locator('input[type="file"]')
        .setInputFiles({ name: "karta-pracy.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-") });
      await expect(page.getByText("Wgrano materiał.")).toBeVisible();
      await expect(page.getByText("Materiały przy tej lekcji: 3.")).toBeVisible();
      const usun = page.getByRole("button", { name: "Usuń materiał „karta-pracy.pdf”" });
      await expect(usun).toBeVisible();
      await bezPrzewijaniaPoziomego(page);
      await sprawdzAxe(page, testInfo, `axe-lekcja-${szerokosc}-materialy`);
      await zrzut(page, `lekcja-${szerokosc}-materialy-wgrany-plik`, page.getByRole("heading", { level: 2, name: "Materiały" }));

      await usun.click();
      const okno = page.getByRole("dialog", { name: "Usunąć materiał „karta-pracy.pdf”?" });
      await expect(okno).toBeVisible();
      await sprawdzAxe(page, testInfo, `axe-lekcja-${szerokosc}-okno-usuniecia-materialu`);
      await okno.getByRole("button", { name: "Usuń materiał" }).click();

      await expect(page.getByText("Materiały przy tej lekcji: 2.")).toBeVisible();
      await expect(usun).toHaveCount(0);
      expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
      expect(zapisy.map((zapis) => `${zapis.metoda} ${zapis.sciezka}`)).toEqual([
        "POST /admin/lessons/22/materials",
        "DELETE /admin/materials/100",
      ]);
    });

    test("odmowa serwera 403: stan odmowy bez danych lekcji, okruszki z nazwą kursu, axe", async ({ page }, testInfo) => {
      await instalujAtrapy(page, { odmowaLekcji: true });
      await otworzLekcje(page);

      await expect(page.getByRole("heading", { level: 1, name: "Lekcja" })).toBeVisible();
      await expect(page.getByText("Pytania otwarte i zamknięte")).toHaveCount(0);
      await expect(page.getByLabel(/^Tytuł lekcji/)).toHaveCount(0);
      await expect(page.getByRole("navigation", { name: "Okruszki" }).getByRole("link", { name: KURS.title })).toBeVisible();
      await expect(page.locator("main")).toHaveCount(1);
      await bezPrzewijaniaPoziomego(page);
      await sprawdzAxe(page, testInfo, `axe-lekcja-${szerokosc}-odmowa`);
      await zrzut(page, `lekcja-${szerokosc}-odmowa-serwera-403`);
    });

    test("lekcja spoza kursu z adresu: „Nie znaleziono lekcji”, zero żądań o tę lekcję", async ({ page }) => {
      const { sciezki } = await instalujAtrapy(page);
      await otworzLekcje(page, "/admin/kursy/4/lekcje/999");

      await expect(page.getByRole("heading", { name: "Nie znaleziono lekcji" })).toBeVisible();
      await expect(page.getByLabel(/^Tytuł lekcji/)).toHaveCount(0);
      expect(sciezki.filter((sciezka) => sciezka.includes("/lessons/999"))).toEqual([]);
      await zrzut(page, `lekcja-${szerokosc}-nie-znaleziono`);
    });
  });
}
