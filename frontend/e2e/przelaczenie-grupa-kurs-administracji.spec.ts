import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";
import { GRUPY } from "../lib/przelaczenie/grupy";

/**
 * Miara dla tej gałęzi: grupy przełączenia `kursAdministracji`,
 * `publikacjaKursu`, `zaproszeniaNaKurs` i `edycjaLekcji`
 * (`lib/przelaczenie/grupy.ts`) mają tu `wlaczona: true`.
 *
 * Rodzaj „podmiana treści”: adres `/admin/kursy/{id}` się nie zmienia, pod nim
 * stoi ekran kursu nowego frontu w nowej ramce panelu. Sprawdzane na zbudowanej
 * aplikacji, z atrapą API przez `page.route` i atrapą sesji:
 * - adres, `h1`, jedyny `main` i `#tresc`, nowa ramka, każda karta raz;
 * - publikacja z odmową 422 i z sukcesem, cofnięcie publikacji;
 * - temat; lekcja dodawana samym tytułem (pole zostaje otwarte z fokusem);
 * - dane kursu (ciało zapisu bez pozycji w ścieżce), zaproszenie,
 *   przypisanie prowadzącego — w wierszach „Ustawień kursu”;
 * - bank pytań otwiera się obu rolom administracji (200, nagłówek ekranu);
 * - usunięcie kursu;
 * - axe (WCAG 2.1 AA i `best-practice`) na 1280 i 390 px w stanach: z tematami,
 *   pusty, z oknami potwierdzeń.
 * - ekran lekcji `/admin/kursy/{id}/lekcje/{idLekcji}` (grupa `edycjaLekcji`):
 *   próby czytają flagę grupy z rejestru — przy wyłączonej adres pokazuje
 *   „Nie znaleziono strony” (bez żądań o lekcję) i ekran kursu nie ma do niego
 *   odnośnika; przy włączonej obie role
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
/** Pliki lekcji 22 z odczytu listy, gdy lekcja ma pliki wgrane wcześniej. */
const PLIKI_LEKCJI = [
  { id: 71, name: "porady.pdf", mime: "application/pdf", size: 2048, lesson_id: 22, course_id: null, created_at: null },
  { id: 72, name: "slajdy.pptx", mime: "application/vnd.ms-powerpoint", size: 1048576, lesson_id: 22, course_id: null, created_at: null },
  { id: 73, name: "mapa.png", mime: "image/png", size: 512, lesson_id: 22, course_id: null, created_at: null },
];

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

/** Osoby z rolą prowadzącego bez zapisanej wizytówki — dane zmyślone. */
const PROWADZACY_BEZ_WIZYTOWKI = [
  { id: 7, first_name: "Ewa", last_name: "Brzeska" },
  { id: 8, first_name: "Piotr", last_name: "Cichy" },
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
  /** Lekcja 22 ma gotowe nagranie i trzy zapisane materiały. */
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
  // Lista osób serwera: uczestniczka albo — dla `role=instructor` — wszystkie aktywne osoby z rolą prowadzącego.
  await page.route(`${API}/admin/users**`, (route) => {
    const rola = new URL(route.request().url()).searchParams.get("role");
    const osoby =
      rola === "instructor"
        ? [...PROWADZACY, ...PROWADZACY_BEZ_WIZYTOWKI].map((prowadzacy) => ({
            ...OSOBA,
            ...prowadzacy,
            email: `prowadzacy-${prowadzacy.id}@demo.pl`,
            role: "instructor",
          }))
        : [OSOBA];
    return route.fulfill(json(osoby, { ...META_PUSTA, total: osoby.length }));
  });
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
          json(opcje.lekcjaZNagraniem ? lekcje.map((wpis) => (wpis.id === 22 ? { ...wpis, materials_count: 3 } : wpis)) : lekcje),
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
      if (/^\/admin\/lessons\/\d+\/materials$/.test(sciezka) && metoda === "GET") {
        return route.fulfill(json(opcje.lekcjaZNagraniem ? PLIKI_LEKCJI : []));
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
            instructor: [...PROWADZACY, ...PROWADZACY_BEZ_WIZYTOWKI].find((osoba) => osoba.id === cialo.instructor_id)!,
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

    test("kurs z tematami: adres bez zmian, nowa ramka, jeden main, każda karta raz, axe", async ({
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
      for (const id of ["tematy-i-lekcje", "publikacja", "ustawienia-dane", "ustawienia-prowadzacy"]) {
        await expect(page.locator(`#${id}`)).toHaveCount(1);
      }
      await expect(page.locator("#ustawienia-zaproszenia")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Otwórz pytania" })).toHaveAttribute(
        "href",
        "/admin/testy/31/pytania",
      );

      await bezPrzewijaniaPoziomego(page);
      await sprawdzAxe(page, testInfo, `axe-kurs-${szerokosc}-tematy`);
      await zrzut(page, `kurs-${szerokosc}-tematy-gora`);

      expect(sciezki.filter((sciezka) => sciezka.startsWith("/instructor/"))).toEqual([]);
    });

    test("kurs bez tematów: zdanie i „+ Dodaj temat”, axe", async ({ page }, testInfo) => {
      await instalujAtrapy(page, { tryb: "pusty" });
      await otworzKurs(page);

      await expect(page.getByText(/Kurs nie ma jeszcze tematów/)).toBeVisible();
      await expect(page.getByRole("button", { name: "+ Dodaj temat" })).toBeVisible();
      expect(await page.locator("main").count()).toBe(1);
      await bezPrzewijaniaPoziomego(page);
      await sprawdzAxe(page, testInfo, `axe-kurs-${szerokosc}-pusty`);
      await zrzut(page, `kurs-${szerokosc}-pusty`);
    });

    test("okna: nowy temat, usunięcie tematu z lekcjami, usunięcie kursu — axe, zero zapisów", async ({
      page,
    }, testInfo) => {
      const { zapisy } = await instalujAtrapy(page);
      await otworzKurs(page);

      await page.getByRole("button", { name: "+ Dodaj temat" }).click();
      const nowyTemat = page.getByRole("dialog", { name: "Nowy temat" });
      await expect(nowyTemat).toBeVisible();
      await sprawdzAxe(page, testInfo, `axe-kurs-${szerokosc}-okno-nowego-tematu`);
      await zrzut(page, `kurs-${szerokosc}-okno-nowego-tematu`, nowyTemat);
      await nowyTemat.getByRole("button", { name: "Anuluj" }).click();

      await page.getByRole("button", { name: "Więcej działań tematu Podstawy" }).click();
      await sprawdzAxe(page, testInfo, `axe-kurs-${szerokosc}-wiecej-tematu`);
      await page.getByRole("button", { name: "Usuń temat" }).click();
      const usuniecieTematu = page.getByRole("dialog");
      await expect(usuniecieTematu).toContainText("Temat ma 2 lekcje.");
      await sprawdzAxe(page, testInfo, `axe-kurs-${szerokosc}-okno-usuniecia-tematu`);
      await usuniecieTematu.getByRole("button", { name: "Rozumiem" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);

      await page.getByRole("button", { name: "Usunięcie kursu" }).click();
      await page.getByRole("button", { name: "Usuń kurs" }).click();
      const usuniecieKursu = page.getByRole("dialog");
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

  test("publikacja: odmowa 422 pokazuje powody w karcie i nie zmienia stanu; druga próba publikuje; cofnięcie publikacji", async ({
    page,
  }) => {
    const { zapisy } = await instalujAtrapy(page, { odmowaPublikacji: true });
    await otworzKurs(page);
    const karta = page.getByRole("region", { name: "Publikacja" });
    const opublikuj = page.getByRole("button", { name: "Opublikuj kurs" }).locator("visible=true");

    await opublikuj.click();
    await expect(karta.getByRole("heading", { level: 3, name: "Nie udało się opublikować (1)" })).toBeVisible();
    await expect(karta.getByRole("link", { name: "Dodaj co najmniej jedną lekcję." })).toBeVisible();
    await expect(karta.getByRole("group", { name: "Nie udało się opublikować (1)" })).toBeFocused();
    await expect(karta.getByText("Kurs jest szkicem. Uczestnicy go nie widzą.")).toBeVisible();
    await zrzut(page, "kurs-1280-publikacja-odmowa");

    await opublikuj.click();
    await expect(karta.getByText("Kurs jest opublikowany.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Opublikuj kurs" })).toHaveCount(0);
    await zrzut(page, "kurs-1280-opublikowany");

    await page.getByRole("button", { name: "Cofnięcie publikacji i usunięcie kursu" }).click();
    await page.getByRole("button", { name: "Cofnij publikację" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cofnij publikację" }).click();
    await expect(karta.getByText("Kurs jest szkicem. Uczestnicy go nie widzą.")).toBeVisible();
    await expect(opublikuj).toHaveCount(1);

    expect(zapisy).toEqual([
      { metoda: "PATCH", sciezka: "/admin/courses/4", cialo: { is_published: true } },
      { metoda: "PATCH", sciezka: "/admin/courses/4", cialo: { is_published: true } },
      { metoda: "PATCH", sciezka: "/admin/courses/4", cialo: { is_published: false } },
    ]);
  });

  test("temat i lekcja: nowy temat, dodanie lekcji samym tytułem, pole zostaje otwarte z fokusem", async ({ page }) => {
    const { zapisy } = await instalujAtrapy(page);
    await otworzKurs(page);

    await page.getByRole("button", { name: "+ Dodaj temat" }).click();
    const okno = page.getByRole("dialog", { name: "Nowy temat" });
    await okno.getByLabel(/^Nazwa tematu/).fill("Podsumowanie");
    await okno.getByRole("button", { name: "Dodaj temat" }).click();
    await expect(page.getByRole("heading", { level: 3, name: "Podsumowanie" })).toBeVisible();

    await page.getByRole("button", { name: "Dodaj lekcję w temacie Praktyka" }).click();
    const pole = page.getByRole("textbox", { name: "Tytuł nowej lekcji w temacie Praktyka" });
    await expect(pole).toBeFocused();
    await zrzut(page, "kurs-1280-nowa-lekcja", page.getByRole("heading", { level: 3, name: "Praktyka" }));
    await pole.fill("Rozmowa próbna");
    await pole.press("Enter");
    await expect(wiersz(page, 101)).toContainText("Rozmowa próbna");
    await expect(pole).toHaveValue("");
    await expect(pole).toBeFocused();
    await expect(page.locator("[data-ogloszenia]")).toHaveText("Dodano lekcję 4: Rozmowa próbna");
    await expect(wiersz(page, 101).getByRole("link", { name: "Otwórz lekcję 4: Rozmowa próbna" })).toHaveAttribute(
      "href",
      "/admin/kursy/4/lekcje/101",
    );

    expect(zapisy).toEqual([
      { metoda: "POST", sciezka: "/admin/courses/4/topics", cialo: { title: "Podsumowanie" } },
      {
        metoda: "POST",
        sciezka: "/admin/courses/4/lessons",
        cialo: { title: "Rozmowa próbna", description: null, duration_seconds: 0, topic_id: 8 },
      },
    ]);
  });

  test("dane kursu i prowadzący: każda operacja jednym żądaniem; zapis danych bez pozycji w ścieżce; panelu zaproszeń nie ma", async ({
    page,
  }) => {
    const { zapisy } = await instalujAtrapy(page);
    await otworzKurs(page);

    await page.locator("#ustawienia-dane").click();
    const dane = page.locator("#ustawienia-dane-panel");
    await expect(dane.getByLabel(/Pozycja|Miejsce/)).toHaveCount(0);
    // Grupa produktowa jest schowana: w formularzu nie ma pola, a zapis jej nie wysyła.
    await expect(dane.getByLabel(/^Grupa/)).toHaveCount(0);
    await expect(dane).not.toContainText(/slug/i);
    await dane.getByLabel(/^Tytuł kursu/).fill("Wywiad psychologiczny — podstawy");
    await dane.getByLabel(/^Nazwa w adresie strony/).fill("wywiad-podstawy");
    await wybierz(page, /^Rodzaj/, "Kurs");
    await zrzut(page, "kurs-1280-dane-kursu-formularz", dane);
    await dane.getByRole("button", { name: "Zapisz dane kursu" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Wywiad psychologiczny — podstawy" })).toBeVisible();

    // Panel „Zaproszenia” nie jest pokazywany do czasu zaproszeń po MVP: wiersza nie ma, żądania zaproszenia też.
    await expect(page.locator("#ustawienia-zaproszenia, #ustawienia-zaproszenia-panel")).toHaveCount(0);

    await page.locator("#ustawienia-prowadzacy").click();
    await expect(page.locator("#ustawienia-dane")).toHaveAttribute("aria-expanded", "false");
    const prowadzacy = page.locator("#ustawienia-prowadzacy-panel");
    await wybierz(page, /^Prowadzący/, "Joanna Demo");
    await prowadzacy.getByRole("button", { name: "Przypisz prowadzącego" }).click();
    await expect(page.locator("#ustawienia-prowadzacy")).toContainText("Joanna Demo, cały kurs");
    await zrzut(page, "kurs-1280-prowadzacy-przypisany", prowadzacy);
    await prowadzacy.getByRole("button", { name: "Odłącz: Joanna Demo, Cały kurs" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Odłącz prowadzącego" }).click();
    await expect(page.locator("#ustawienia-prowadzacy")).not.toContainText("Joanna Demo");

    const cialoDanych = zapisy[0].cialo as Record<string, unknown>;
    expect(Object.keys(cialoDanych).sort()).toEqual(["description", "slug", "title", "type"]);
    expect(zapisy).toEqual([
      {
        metoda: "PATCH",
        sciezka: "/admin/courses/4",
        cialo: {
          title: "Wywiad psychologiczny — podstawy",
          description: KURS.description,
          slug: "wywiad-podstawy",
          type: "course",
        },
      },
      { metoda: "POST", sciezka: "/admin/courses/4/assignments", cialo: { instructor_id: 5, lesson_id: null } },
      { metoda: "DELETE", sciezka: "/admin/courses/4/assignments", cialo: { assignment_id: 100 } },
    ]);
  });

  test("lista prowadzących z listy osób: jedno żądanie z filtrami, zero żądań na katalog wizytówek, osoba bez wizytówki do przypisania", async ({
    page,
  }) => {
    const { zapisy, sciezki } = await instalujAtrapy(page);
    await otworzKurs(page);

    await page.locator("#ustawienia-prowadzacy").click();
    const prowadzacy = page.locator("#ustawienia-prowadzacy-panel");
    await page.getByRole("combobox", { name: /^Prowadzący/ }).click();
    const opcje = await page.getByRole("option").allTextContents();
    for (const osoba of [...PROWADZACY, ...PROWADZACY_BEZ_WIZYTOWKI]) {
      expect(opcje).toContain(`${osoba.first_name} ${osoba.last_name}`);
    }
    await expect(page.locator("main")).not.toContainText(/prowadzacy-\d+@/);
    await page.getByRole("option", { name: "Ewa Brzeska", exact: true }).click();
    await prowadzacy.getByRole("button", { name: "Przypisz prowadzącego" }).click();
    await expect(page.locator("#ustawienia-prowadzacy")).toContainText("Ewa Brzeska, cały kurs");

    const listy = sciezki.filter((sciezka) => sciezka.startsWith("/admin/users?") && sciezka.includes("role=instructor"));
    expect(listy).toHaveLength(1);
    expect(Object.fromEntries(new URL(listy[0], "http://atrapa.test").searchParams)).toEqual({
      role: "instructor",
      status: "active",
      per_page: "100",
      sort: "last_name",
    });
    expect(sciezki.filter((sciezka) => sciezka.startsWith("/instructors"))).toEqual([]);
    expect(zapisy).toEqual([
      { metoda: "POST", sciezka: "/admin/courses/4/assignments", cialo: { instructor_id: 7, lesson_id: null } },
    ]);
  });

  test("usunięcie kursu: potwierdzenie wysyła DELETE i pokazuje powrót do listy kursów", async ({ page }) => {
    const { zapisy } = await instalujAtrapy(page);
    await otworzKurs(page);

    await page.getByRole("button", { name: "Usunięcie kursu" }).click();
    await page.getByRole("button", { name: "Usuń kurs" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Usuń kurs" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Kurs usunięty" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Wróć do listy kursów" })).toHaveAttribute("href", "/admin/kursy");
    expect(zapisy).toEqual([{ metoda: "DELETE", sciezka: "/admin/courses/4", cialo: null }]);
    await zrzut(page, "kurs-1280-usuniety");
  });
});

for (const rola of ["project_manager", "super_admin"] as const) {
  test.describe(`bank pytań z ekranu kursu — rola ${rola}`, () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test("„Otwórz pytania” prowadzi do ekranu banku pytań: 200 i nagłówek ekranu", async ({ page }) => {
      await instalujAtrapy(page, { rola });
      await otworzKurs(page);

      const odnosnik = page.getByRole("link", { name: "Otwórz pytania" });
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

test.describe("ekran lekcji — grupa wyłączona", () => {
  test.skip(GRUPA_LEKCJI, "grupa ekranu lekcji jest włączona");
  test.use({ viewport: { width: 1280, height: 800 } });

  test("adres ekranu lekcji pokazuje „Nie znaleziono strony”, a ekran kursu nie ma do niego odnośnika", async ({ page }) => {
    const { sciezki } = await instalujAtrapy(page);
    await page.goto(ADRES_LEKCJI);
    await expect(page.getByRole("heading", { level: 1, name: "Nie znaleziono strony" })).toBeVisible();
    await expect(page.getByLabel(/^Tytuł lekcji/)).toHaveCount(0);
    expect(sciezki.filter((wpis) => wpis.includes("/lessons"))).toEqual([]);

    await otworzKurs(page);
    await expect(wiersz(page, 22)).toBeVisible();
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

    test("„Otwórz” w wierszu lekcji prowadzi do ekranu lekcji: adres z kursem, nagłówek lekcji, okruszki z nazwą kursu, nowa ramka", async ({
      page,
    }) => {
      await instalujAtrapy(page, { rola });
      await otworzKurs(page);

      const odnosnik = wiersz(page, 22).getByRole("link", { name: "Otwórz lekcję 2: Pytania otwarte i zamknięte" });
      await expect(odnosnik).toHaveAttribute("href", ADRES_LEKCJI);
      await odnosnik.click();

      await expect(page).toHaveURL(new RegExp(`${ADRES_LEKCJI}$`));
      await expect(page.getByRole("heading", { level: 1, name: "Pytania otwarte i zamknięte" })).toBeVisible();
      const okruszki = page.getByRole("navigation", { name: "Okruszki" });
      await expect(okruszki.getByRole("link", { name: "Kursy" })).toHaveAttribute("href", "/admin/kursy");
      await expect(okruszki.getByRole("link", { name: KURS.title })).toHaveAttribute("href", ADRES);
      await expect(page.getByRole("heading", { level: 2, name: "Pliki do tej lekcji" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: "Nagranie" })).toBeVisible();
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("[data-powloka-panelu]")).toHaveCount(1);
      await expect(page.getByText(/Brak dostępu|Nie masz uprawnień/)).toHaveCount(0);

      // Sekcja nagrania: wgrywać może opiekun projektu i Super Admin — obszar wgrania jest czynny, zdania o powodzie nie ma.
      const wgrywanie = page.getByText("Upuść tutaj nagranie albo wybierz je z dysku.");
      const powod = page.getByText("Nagranie może wgrać opiekun projektu albo Super Admin.");
      await expect(wgrywanie).toHaveCount(1);
      await expect(powod).toHaveCount(0);
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
      await expect(page.getByText("Ta lekcja nie ma jeszcze plików.")).toBeVisible();
      await expect(page.getByRole("list", { name: "Pliki lekcji" })).toHaveCount(0);
      await expect(page.getByText("Ta lekcja nie ma jeszcze nagrania.")).toBeVisible();
      await expect(page.getByLabel(/^Czas trwania w minutach/)).toHaveValue("25");
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("#tresc")).toHaveCount(1);
      await bezPrzewijaniaPoziomego(page);
      await sprawdzAxe(page, testInfo, `axe-lekcja-${szerokosc}-pusta`);
      await zrzut(page, `lekcja-${szerokosc}-stan-pusty-gora`);
      await zrzut(page, `lekcja-${szerokosc}-stan-pusty-materialy-i-nagranie`, page.getByRole("heading", { level: 2, name: "Pliki do tej lekcji" }));
    });

    test("nagranie gotowe i materiały: wgranie materiału, usunięcie z potwierdzeniem — po jednym żądaniu; axe", async ({
      page,
    }, testInfo) => {
      const { zapisy } = await instalujAtrapy(page, { rola: "super_admin", lekcjaZNagraniem: true });
      await otworzLekcje(page);

      const wierszePlikow = page.getByRole("list", { name: "Pliki lekcji" }).getByRole("listitem");
      await expect(page.getByText("Ta lekcja ma 3 pliki.")).toBeVisible();
      await expect(wierszePlikow).toHaveCount(3);
      await expect(wierszePlikow.first()).toContainText("porady.pdf");
      await expect(page.getByText("Ta lekcja nie ma jeszcze plików.")).toHaveCount(0);
      await zrzut(page, `lekcja-${szerokosc}-materialy-licznik-3`, page.getByRole("heading", { level: 2, name: "Pliki do tej lekcji" }));
      await expect(page.getByText("Nagranie jest gotowe. Czas trwania:", { exact: false })).toBeVisible();
      await zrzut(page, `lekcja-${szerokosc}-nagranie-gotowe`, page.getByRole("heading", { level: 2, name: "Nagranie" }));

      await page
        .locator("section", { has: page.getByRole("heading", { level: 2, name: "Pliki do tej lekcji" }) })
        .locator('input[type="file"]')
        .setInputFiles({ name: "karta-pracy.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-") });
      await expect(page.getByRole("status").filter({ hasText: "Wgrano plik „karta-pracy.pdf”." })).toHaveCount(1);
      await expect(page.getByText("Ta lekcja ma 4 pliki.")).toBeVisible();
      await expect(wierszePlikow).toHaveCount(4);
      await expect(page.getByText("karta-pracy.pdf", { exact: true })).toHaveCount(1);
      const usun = page.getByRole("button", { name: "Usuń plik karta-pracy.pdf" });
      await expect(usun).toBeVisible();
      await bezPrzewijaniaPoziomego(page);
      await sprawdzAxe(page, testInfo, `axe-lekcja-${szerokosc}-materialy`);
      await zrzut(page, `lekcja-${szerokosc}-materialy-wgrany-plik`, page.getByRole("heading", { level: 2, name: "Pliki do tej lekcji" }));

      await usun.click();
      const okno = page.getByRole("dialog", { name: "Usunąć plik „karta-pracy.pdf”?" });
      await expect(okno).toBeVisible();
      await sprawdzAxe(page, testInfo, `axe-lekcja-${szerokosc}-okno-usuniecia-materialu`);
      await okno.getByRole("button", { name: "Usuń plik" }).click();

      await expect(page.getByText("Ta lekcja ma 3 pliki.")).toBeVisible();
      await expect(wierszePlikow).toHaveCount(3);
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
