import { expect, test, type Page } from "@playwright/test";

/**
 * Jedno sieciowe `GET /me` na pełne załadowanie strony w nowej ramce.
 *
 * Przed zmianą każdy ekran nowej ramki pytał o `/me` dwa razy: strażnik roli
 * (renderuje dzieci dopiero po odpowiedzi) i potem powłoka albo sam ekran.
 * Pamięć odpowiedzi w kliencie API (`lib/api/pamiec-me.ts`) łączy te
 * wywołania w jedno.
 *
 * Test liczy ŻĄDANIA SIECIOWE `GET /api/v1/me` widziane przez przeglądarkę
 * (`page.on("request")`), nie wywołania funkcji — atrapa API odpowiada przez
 * `page.route`, a każde żądanie, które wyszło z przeglądarki, jest policzone.
 * Zbudowana aplikacja, szerokość 1280 px.
 *
 * Kontrola dodatnia: wyłączenie pamięci (okno 0 ms) daje dwa żądania na
 * trasach nowej ramki i ten plik czerwienieje.
 */

const API = "http://localhost:8000/api/v1";

const ATRAPA_SESJI = {
  accessToken: "atrapa-tokenu-testowego",
  expiresAt: Date.now() + 3_600_000,
};

const META = { current_page: 1, per_page: 25, total: 0, last_page: 1 };

function odpowiedz(dane: unknown, meta?: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(meta === undefined ? { data: dane } : { data: dane, meta }),
  };
}

type Rola = "volunteer" | "project_manager" | "instructor";

const KONTO: Record<Rola, Record<string, unknown>> = {
  volunteer: { id: 17, role: "volunteer", first_name: "Marta", last_name: "Demo", program_completed_at: "2026-09-15T00:00:00Z" },
  project_manager: { id: 1, role: "project_manager", first_name: "Opiekun", last_name: "Demo", program_completed_at: null },
  instructor: { id: 5, role: "instructor", first_name: "Joanna", last_name: "Demo", program_completed_at: null },
};

const WNIOSEK = {
  id: 12,
  user: { id: 18, first_name: "Ola", last_name: "Demo" },
  specializations: ["interwencja kryzysowa"],
  approach: "poznawczo-behawioralne",
  city: "Gdańsk",
  bio: "Pracuję z osobami dorosłymi.",
  publication_consent_granted: true,
  status: "submitted",
  return_reason: null,
  decided_at: null,
  documents: [],
  created_at: "2026-09-10T08:00:00Z",
  updated_at: "2026-09-11T08:00:00Z",
};

/** Atrapy API; ogólna jest rejestrowana PIERWSZA (późniejsza trasa wygrywa). */
async function instalujAtrapy(page: Page, rola: Rola, zadaniaMe: string[]): Promise<void> {
  page.on("request", (zadanie) => {
    if (zadanie.method() === "GET" && new URL(zadanie.url()).pathname === "/api/v1/me") {
      zadaniaMe.push(zadanie.url());
    }
  });

  await page.route(`${API}/**`, (route) => route.fulfill(odpowiedz([], META)));
  await page.route(`${API}/me`, (route) => route.fulfill(odpowiedz(KONTO[rola])));
  await page.route(`${API}/notifications**`, (route) =>
    route.fulfill(odpowiedz([], { ...META, extra: { unread: 0 } })),
  );
  await page.route(`${API}/admin/dashboard`, (route) =>
    route.fulfill(
      odpowiedz({
        counters: { participants: 3, completed: 1, certificates: 1 },
        queues: [{ key: "applications", count: 1, link: "/admin/uczestniczki" }],
      }),
    ),
  );
  await page.route(`${API}/admin/profiles/12`, (route) => route.fulfill(odpowiedz(WNIOSEK)));
  await page.route(`${API}/instructor/group`, (route) => route.fulfill(odpowiedz({ members: [], slots: [] })));
  await page.route(`${API}/courses`, (route) => route.fulfill(odpowiedz([])));
  await page.route(`${API}/certificate/conditions`, (route) => route.fulfill(odpowiedz({ eligible: false, conditions: [] })));
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(odpowiedz({ url: null })));
}

interface Trasa {
  adres: string;
  rola: Rola;
}

/** Trasy nowej ramki ośmiu włączonych grup (`lib/przelaczenie/grupy.ts`). */
const TRASY_NOWEJ_RAMKI: Trasa[] = [
  { adres: "/panel/dalsza-wspolpraca", rola: "volunteer" },
  { adres: "/panel/pulpit", rola: "volunteer" },
  { adres: "/admin/zgloszenia-wspolpracy", rola: "project_manager" },
  { adres: "/admin", rola: "project_manager" },
  { adres: "/admin/formy-stazu", rola: "project_manager" },
  { adres: "/admin/profile/12", rola: "project_manager" },
  { adres: "/admin/wzory-dokumentow", rola: "project_manager" },
  { adres: "/admin/ekran-startowy", rola: "project_manager" },
  { adres: "/prowadzacy", rola: "instructor" },
];

/** Trasy dotychczasowej ramki — bez regresji, dalej jedno żądanie. */
const TRASY_STARE: Trasa[] = [
  { adres: "/panel/kursy", rola: "volunteer" },
  { adres: "/admin/kursy", rola: "project_manager" },
];

test.use({ viewport: { width: 1280, height: 900 } });

test.describe("jedno GET /me na pełne załadowanie strony", () => {
  for (const trasa of TRASY_NOWEJ_RAMKI) {
    test(`nowa ramka: ${trasa.adres} — dokładnie jedno GET /me`, async ({ page }) => {
      const zadaniaMe: string[] = [];
      await instalujAtrapy(page, trasa.rola, zadaniaMe);

      await page.goto(trasa.adres, { waitUntil: "networkidle" });
      await expect(page.locator("main#tresc, #tresc").first()).toBeVisible();

      expect(zadaniaMe, `żądania GET /me: ${zadaniaMe.length}`).toHaveLength(1);
    });
  }

  for (const trasa of TRASY_STARE) {
    test(`trasa dotychczasowa: ${trasa.adres} — dalej jedno GET /me`, async ({ page }) => {
      const zadaniaMe: string[] = [];
      await instalujAtrapy(page, trasa.rola, zadaniaMe);

      await page.goto(trasa.adres, { waitUntil: "networkidle" });
      // Strażnik roli pokazuje „Wczytywanie…” bez `main`, dopóki `/me` nie odpowie —
      // czekamy na `main`, żeby nie liczyć żądań przed hydracją strony.
      await expect(page.locator("main").first()).toBeVisible();

      expect(zadaniaMe, `żądania GET /me: ${zadaniaMe.length}`).toHaveLength(1);
    });
  }

  test("nawigacja menu w ramce administracji: każde pełne załadowanie strony to dokładnie jedno GET /me", async ({
    page,
  }) => {
    const zadaniaMe: string[] = [];
    await instalujAtrapy(page, "project_manager", zadaniaMe);

    await page.goto("/admin", { waitUntil: "networkidle" });
    await expect(page.locator("main").first()).toBeVisible();
    expect(zadaniaMe).toHaveLength(1);

    const pelneZaladowanie = await przejdzPrzezMenu(page, "/admin/formy-stazu");

    // Menu może nawigować klientem (0 nowych żądań: pamięć jeszcze ważna) albo
    // pełnym załadowaniem (nowy dokument = dokładnie jedno nowe żądanie).
    const oczekiwane = pelneZaladowanie ? 2 : 1;
    console.log(`POMIAR nawigacja admin: pelneZaladowanie=${pelneZaladowanie} lacznieGetMe=${zadaniaMe.length}`);
    expect(zadaniaMe, `żądania GET /me po nawigacji: ${zadaniaMe.length}`).toHaveLength(oczekiwane);
  });

  test("nawigacja menu w ramce uczestnika: każde pełne załadowanie strony to dokładnie jedno GET /me", async ({
    page,
  }) => {
    const zadaniaMe: string[] = [];
    await instalujAtrapy(page, "volunteer", zadaniaMe);

    await page.goto("/panel/pulpit", { waitUntil: "networkidle" });
    await expect(page.locator("main").first()).toBeVisible();
    expect(zadaniaMe).toHaveLength(1);

    const pelneZaladowanie = await przejdzPrzezMenu(page, "/panel/dalsza-wspolpraca");

    const oczekiwane = pelneZaladowanie ? 2 : 1;
    console.log(`POMIAR nawigacja uczestnik: pelneZaladowanie=${pelneZaladowanie} lacznieGetMe=${zadaniaMe.length}`);
    expect(zadaniaMe, `żądania GET /me po nawigacji: ${zadaniaMe.length}`).toHaveLength(oczekiwane);
  });
});

/**
 * Klika pozycję menu i czeka na nową trasę. Zwraca `true`, gdy zmiana trasy
 * była pełnym załadowaniem dokumentu (znacznik w `window` przepadł).
 */
async function przejdzPrzezMenu(page: Page, adres: string): Promise<boolean> {
  await page.evaluate(() => {
    (window as unknown as { __znacznikDokumentu?: number }).__znacznikDokumentu = 1;
  });
  await page.locator(`nav a[href="${adres}"]`).first().click();
  await page.waitForURL(`**${adres}`);
  await page.waitForLoadState("networkidle");
  const znacznik = await page.evaluate(
    () => (window as unknown as { __znacznikDokumentu?: number }).__znacznikDokumentu,
  );
  return znacznik === undefined;
}
