import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Miara dla grup przełączenia panelu prowadzącego (`lib/przelaczenie/grupy.ts`):
 * - `pulpitProwadzacego` ma `wlaczona: true` — pod tym samym adresem
 *   `/prowadzacy` stoi ekran „Pulpit prowadzącego” nowego frontu, w powłoce
 *   starego układu prowadzącego (jeden `main#tresc`, jeden link skoku),
 *   z tytułem karty jak na starej stronie, wpis menu „Start” bez zmiany adresu;
 * - `kurs` ma `wlaczona: false` — `/prowadzacy/kursy/[id]` dalej pokazuje
 *   dotychczasową kartę kursu (treść kursu, lekcje, materiały, test wiedzy).
 *
 * Bez backendu i bez IdP: `page.route` podstawia `/api/v1/*` i sesję Auth.js
 * (`getToken()` w `lib/api/klient.ts` czyta `/api/auth/session`). Zero
 * odpowiedzi 404 w całym przebiegu każdego scenariusza.
 */

const ATRAPA_SESJI = {
  accessToken: "atrapa-tokenu-testowego",
  expiresAt: Date.now() + 3_600_000,
};

const API = "http://localhost:8000/api/v1";

function odpowiedz(dane: unknown, meta?: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(meta === undefined ? { data: dane } : { data: dane, meta }),
  };
}

const STRONA_PUSTA = { current_page: 1, per_page: 25, total: 0, last_page: 1 };

const KURS = {
  id: 5,
  slug: "wywiad",
  title: "Wywiad psychologiczny",
  description: "Opis kursu",
  type: "course",
  product_group: "psychon",
  sequence_order: 2,
  is_published: false,
  lessons_count: 0,
  materials_count: 0,
};

async function instalujAtrapyApi(page: Page): Promise<void> {
  // Ogólna atrapa rejestrowana PRZED szczegółowymi (Playwright wybiera trasę
  // zarejestrowaną później jako pierwszą).
  await page.route(`${API}/**`, (route) => route.fulfill(odpowiedz([], STRONA_PUSTA)));
  await page.route(`${API}/me`, (route) => route.fulfill(odpowiedz({ id: 1, role: "instructor" })));
  await page.route(`${API}/instructor/group`, (route) =>
    route.fulfill(
      odpowiedz({
        members: [
          {
            id: 100,
            first_name: "Osoba",
            last_name: "Demo",
            progress: {
              courses_done: 2,
              courses_total: 10,
              hours_accepted: "41.5",
              supervision_present: 5,
              workshop_done: false,
            },
          },
        ],
        slots: [],
      }),
    ),
  );
  await page.route(`${API}/instructor/questions**`, (route) =>
    route.fulfill(odpowiedz([], { ...STRONA_PUSTA, extra: { unanswered: 0 } })),
  );
  await page.route(`${API}/instructor/courses`, (route) =>
    route.fulfill(odpowiedz([{ id: 5, slug: "wywiad", title: "Wywiad psychologiczny", sequence_order: 2 }])),
  );
  await page.route(`${API}/instructor/courses/5`, (route) => route.fulfill(odpowiedz(KURS)));
  await page.route(`${API}/instructor/courses/5/lessons`, (route) => route.fulfill(odpowiedz([])));
  await page.route(`${API}/instructor/courses/5/test`, (route) => route.fulfill(odpowiedz(null)));
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(odpowiedz({ url: null })));
}

async function zliczPunktyOrientacyjne(page: Page) {
  return page.evaluate(() => ({
    main: document.querySelectorAll("main").length,
    cele: document.querySelectorAll("#tresc").length,
    odnosniki: document.querySelectorAll('a[href="#tresc"]').length,
  }));
}

test.describe("panel prowadzącego — pulpit przełączony, kurs bez zmian", () => {
  test("pulpit: pod adresem /prowadzacy stoi nowy ekran, jeden main#tresc, tytuł karty jak dotąd, 0 odpowiedzi 404", async ({
    page,
  }) => {
    const kody404: string[] = [];
    page.on("response", (res) => {
      if (res.status() === 404) kody404.push(res.url());
    });
    await instalujAtrapyApi(page);

    await page.goto("/prowadzacy");
    await zabezpieczeniePrzedEkranemDostepu(page);

    await expect(page.getByRole("heading", { level: 1, name: "Pulpit prowadzącego" })).toBeVisible();
    await expect(page.getByText("Moja grupa: 1 osoba")).toBeVisible();
    await expect(page).toHaveURL(/\/prowadzacy$/);
    await expect(page).toHaveTitle("Panel prowadzącego — Niepodzielni");
    expect(await zliczPunktyOrientacyjne(page)).toEqual({ main: 1, cele: 1, odnosniki: 1 });

    const menu = page.getByRole("navigation", { name: "Menu — Panel prowadzącego" }).first();
    await expect(menu.getByRole("link", { name: "Start" })).toHaveAttribute("href", "/prowadzacy");

    expect(kody404, `odpowiedzi 404: ${kody404.join(", ")}`).toEqual([]);
  });

  test("kurs: grupa wyłączona — /prowadzacy/kursy/5 pokazuje dotychczasową kartę kursu, bez przekierowania, jeden main", async ({
    page,
  }) => {
    const kody404: string[] = [];
    page.on("response", (res) => {
      if (res.status() === 404) kody404.push(res.url());
    });
    await instalujAtrapyApi(page);

    const odpowiedzStrony = await page.goto("/prowadzacy/kursy/5");
    await zabezpieczeniePrzedEkranemDostepu(page);

    expect(odpowiedzStrony?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Treść kursu" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Test wiedzy" })).toBeVisible();
    await expect(page).toHaveURL(/\/prowadzacy\/kursy\/5$/);
    await expect(page.getByRole("heading", { name: "Dane kursu" })).toHaveCount(0);
    expect(await zliczPunktyOrientacyjne(page)).toEqual({ main: 1, cele: 1, odnosniki: 1 });

    expect(kody404, `odpowiedzi 404: ${kody404.join(", ")}`).toEqual([]);
  });
});
