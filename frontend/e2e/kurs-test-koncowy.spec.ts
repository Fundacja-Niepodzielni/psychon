import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";

/**
 * Wiersz testu końcowego na ekranie kursu w obu rolach, na zbudowanej
 * aplikacji, z atrapą API przez `page.route` i atrapą sesji. Administracja —
 * adres produktu `/admin/kursy/4`; prowadzący — trasa robocza
 * `/nowy-front/kurs/4` (grupa `kurs` jest wyłączona). Na 1280, 390 i 320 px:
 * „Dodaj test końcowy” wysyła jedno `POST …/courses/4/tests` z pustym ciałem
 * i prowadzi do pytań testu; „Zmień próg i podejścia” wysyła jedno
 * `PATCH …/tests/31` z progiem i limitem; bez przewijania w poziomie, 0 naruszeń axe.
 */

const SZEROKOSCI = [1280, 390, 320] as const;

const ATRAPA_SESJI = {
  accessToken: ["atrapa", "tokenu", "testowego"].join("-"),
  expiresAt: Date.now() + 3_600_000,
};

const META_PUSTA = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

const KURS = {
  id: 4,
  title: "Wywiad psychologiczny",
  slug: "wywiad-psychologiczny",
  description: "Jak prowadzić pierwszą rozmowę i o co pytać.",
  type: "course",
  product_group: "psychon",
  sequence_order: 2,
  edition_id: 1,
  is_published: false,
  lessons_count: 1,
  materials_count: 0,
  created_at: "2026-09-01T08:00:00Z",
  updated_at: "2026-09-01T08:00:00Z",
  publication_gaps: { blocking: [], waiting: [] },
};

const LEKCJE = [
  {
    id: 21,
    course_id: 4,
    title: "Wprowadzenie do wywiadu",
    description: "Krótki opis lekcji.",
    content: "Pierwszy akapit treści lekcji.",
    sequence_order: 1,
    topic_id: 7,
    topic_position: 1,
    video_provider_id: "wideo-21",
    duration_seconds: 1500,
    materials_count: 0,
    created_at: "2026-09-01T08:00:00Z",
    updated_at: "2026-09-01T08:00:00Z",
    video_status: "ready",
    video_status_at: "2026-10-01T12:00:00Z",
    video_ready: true,
    video_pending: false,
  },
];

const TEMATY = [{ id: 7, course_id: 4, title: "Podstawy", position: 1, lesson_ids: [21], created_at: null, updated_at: null }];

type Rola = "instructor" | "admin";

const ADRES_KURSU: Record<Rola, string> = { admin: "/admin/kursy/4", instructor: "/nowy-front/kurs/4" };
const ADRES_PYTAN: Record<Rola, string> = {
  admin: "/admin/testy/31/pytania?kurs=4",
  instructor: "/prowadzacy/testy/31/pytania?kurs=4",
};

interface Zapis {
  metoda: string;
  sciezka: string;
  cialo: unknown;
}

function json(dane: unknown, status = 200, meta?: unknown) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }),
  };
}

function zasobTestu(progi: { pass_threshold: number | null; attempts_limit: number | null }) {
  return {
    id: 31,
    course_id: 4,
    ...progi,
    question_count: 10,
    effective_pass_threshold: progi.pass_threshold ?? 80,
    effective_attempts_limit: progi.attempts_limit ?? 3,
  };
}

/** Atrapa API ze stanem testu kursu; zwraca listę żądań zapisu (wszystko poza GET). */
async function przygotuj(page: Page, rola: Rola, maTest: boolean): Promise<{ zapisy: Zapis[]; sciezki: string[] }> {
  const zapisy: Zapis[] = [];
  const sciezki: string[] = [];
  let progi: { pass_threshold: number | null; attempts_limit: number | null } | null = maTest
    ? { pass_threshold: null, attempts_limit: null }
    : null;

  await page.route(
    (adres) => adres.pathname.startsWith("/api/v1/"),
    async (route) => {
      const zadanie = route.request();
      const sciezka = new URL(zadanie.url()).pathname.replace("/api/v1", "");
      const metoda = zadanie.method();
      sciezki.push(sciezka);
      if (metoda !== "GET") zapisy.push({ metoda, sciezka, cialo: zadanie.postDataJSON() });
      if (sciezka === "/me") {
        return route.fulfill(
          json({
            id: rola === "instructor" ? 5 : 1,
            role: rola === "instructor" ? "instructor" : "project_manager",
            first_name: rola === "instructor" ? "Joanna" : "Anna",
            program_completed_at: null,
          }),
        );
      }
      if (sciezka.startsWith("/notifications")) {
        return route.fulfill(json([], 200, { ...META_PUSTA, per_page: 25, extra: { unread: 0 } }));
      }
      const grupa = /^\/(admin|instructor)\//.exec(sciezka)?.[1];
      if (grupa === rola) {
        const wGrupie = sciezka.replace(`/${grupa}`, "");
        if (wGrupie === "/courses/4") return route.fulfill(json(KURS));
        if (wGrupie === "/courses/4/lessons") return route.fulfill(json(LEKCJE));
        if (wGrupie === "/courses/4/topics") return route.fulfill(json(TEMATY));
        if (wGrupie === "/courses/4/tests" && metoda === "GET") {
          return route.fulfill(json(progi === null ? null : zasobTestu(progi)));
        }
        if (wGrupie === "/courses/4/tests" && metoda === "POST") {
          progi = { pass_threshold: null, attempts_limit: null };
          return route.fulfill(json(zasobTestu(progi), 201));
        }
        if (wGrupie === "/tests/31" && metoda === "PATCH" && progi !== null) {
          progi = { ...progi, ...(zadanie.postDataJSON() as typeof progi) };
          return route.fulfill(json(zasobTestu(progi)));
        }
        if (wGrupie === "/courses/4/assignments") return route.fulfill(json([]));
        if (/^\/lessons\/\d+\/video-status$/.test(wGrupie)) {
          return route.fulfill(
            json({
              status: "finished",
              duration_seconds: 1500,
              preview_embed_url: null,
              video_status: "ready",
              video_status_at: "2026-10-01T12:00:00Z",
              video_ready: true,
              video_pending: false,
            }),
          );
        }
      }
      return route.fulfill(json([], 200, META_PUSTA));
    },
  );

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json({ url: null })));
  return { zapisy, sciezki };
}

async function otworz(page: Page, adres: string): Promise<void> {
  const odpowiedz = await page.goto(adres);
  expect(odpowiedz?.status()).toBe(200);
  await zabezpieczeniePrzedEkranemDostepu(page);
  await expect(page.getByRole("heading", { level: 2, name: "Tematy i lekcje" })).toBeVisible();
}

async function bezPrzewijaniaPoziomego(page: Page): Promise<void> {
  const nadwyzka = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(nadwyzka).toBeLessThanOrEqual(0);
}

async function bezNaruszenAxe(page: Page, nazwa: string, testInfo: TestInfo) {
  const naruszenia = await uruchomAxe(page);
  await dolaczNaruszeniaDoRaportu(testInfo, nazwa, naruszenia);
  expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);
}

for (const szerokosc of SZEROKOSCI) {
  test.describe(`${szerokosc} px`, () => {
    test.use({ viewport: { width: szerokosc, height: 900 } });

    for (const rola of ["admin", "instructor"] as const) {
      test(`${rola} — kurs bez testu: „Dodaj test końcowy” zakłada test i prowadzi do pytań`, async ({ page }, testInfo) => {
        const { zapisy, sciezki } = await przygotuj(page, rola, false);
        await otworz(page, ADRES_KURSU[rola]);

        const wiersz = page.getByRole("group", { name: "Test na koniec kursu" });
        await expect(wiersz.getByText("Kurs nie ma jeszcze testu końcowego.")).toBeVisible();
        const dodaj = wiersz.getByRole("button", { name: "Dodaj test końcowy" });
        await expect(dodaj).toBeVisible();
        const ramka = await dodaj.boundingBox();
        expect(ramka?.height ?? 0).toBeGreaterThanOrEqual(44);
        await expect(page.getByText(/Liczba pytań/)).toHaveCount(0);
        await bezPrzewijaniaPoziomego(page);
        await bezNaruszenAxe(page, `axe-test-koncowy-brak-${rola}-${szerokosc}`, testInfo);

        await dodaj.click();
        await page.waitForURL((adres) => `${adres.pathname}${adres.search}` === ADRES_PYTAN[rola]);
        expect(zapisy).toEqual([{ metoda: "POST", sciezka: `/${rola}/courses/4/tests`, cialo: {} }]);
        const obca = rola === "admin" ? "/instructor/" : "/admin/";
        expect(sciezki.filter((sciezka) => sciezka.startsWith(obca))).toEqual([]);
      });

      test(`${rola} — kurs z testem: próg i podejścia zmienia się w wierszu testu`, async ({ page }, testInfo) => {
        const { zapisy } = await przygotuj(page, rola, true);
        await otworz(page, ADRES_KURSU[rola]);

        const wiersz = page.getByRole("group", { name: "Test na koniec kursu" });
        await expect(wiersz.getByText("Próg zaliczenia 80 % · 3 podejścia")).toBeVisible();
        await expect(wiersz.getByRole("link", { name: "Otwórz pytania" })).toHaveAttribute("href", ADRES_PYTAN[rola]);

        await wiersz.getByRole("button", { name: "Zmień próg i podejścia" }).click();
        await expect(page.getByLabel("Próg zaliczenia (%)")).toBeFocused();
        await expect(page.getByText(/Liczba pytań/)).toHaveCount(0);
        await bezPrzewijaniaPoziomego(page);
        await bezNaruszenAxe(page, `axe-test-koncowy-progi-${rola}-${szerokosc}`, testInfo);

        await page.getByLabel("Próg zaliczenia (%)").fill("70");
        await page.getByLabel("Liczba podejść").fill("2");
        await wiersz.getByRole("button", { name: "Zapisz próg i podejścia" }).click();

        await expect(wiersz.getByText("Próg zaliczenia 70 % · 2 podejścia")).toBeVisible();
        await expect(page.getByLabel("Próg zaliczenia (%)")).toHaveCount(0);
        expect(zapisy).toEqual([
          { metoda: "PATCH", sciezka: `/${rola}/tests/31`, cialo: { pass_threshold: 70, attempts_limit: 2 } },
        ]);
      });
    }
  });
}
