import { expect, test, type Page } from "@playwright/test";

/**
 * Strona kursu uczestnika (dotychczasowa, spoza włączonych grup) otwiera się
 * pod adresem z parametrem podglądu tak samo jak bez niego: status 200, bez
 * błędów konsoli i bez nieobsłużonych wyjątków strony. Zbudowana aplikacja,
 * atrapa API przez `page.route`.
 */

const API = "http://localhost:8000/api/v1";
const SLUG = "wywiad-psychologiczny";

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

const KURS = {
  id: 2,
  slug: SLUG,
  title: "Wywiad psychologiczny",
  status: "in_progress",
  progress_percent: 40,
  instructor: { id: 5, name: "Joanna Demo" },
  lessons: [{ id: 21, title: "Wprowadzenie do wywiadu", sequence_order: 1, duration_seconds: 1800, is_completed: false }],
  materials: [],
};

async function instalujAtrapy(page: Page): Promise<void> {
  await page.route(`${API}/**`, (route) => route.fulfill(odpowiedz([], META)));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(odpowiedz({ id: 17, role: "volunteer", first_name: "Marta", last_name: "Demo", program_completed_at: null })),
  );
  await page.route(`${API}/notifications**`, (route) => route.fulfill(odpowiedz([], { ...META, extra: { unread: 0 } })));
  await page.route(`${API}/courses`, (route) => route.fulfill(odpowiedz([{ ...KURS, sequence_order: 1 }])));
  await page.route(`${API}/courses/${SLUG}`, (route) => route.fulfill(odpowiedz(KURS)));
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(odpowiedz({ url: null })));
}

test.use({ viewport: { width: 1280, height: 900 } });

for (const [opis, adres] of [
  ["z parametrem podglądu", `/panel/kursy/${SLUG}?podglad=1`],
  ["bez parametru (porównanie)", `/panel/kursy/${SLUG}`],
] as const) {
  test(`strona kursu uczestnika ${opis}: status 200, kurs się rysuje, 0 błędów konsoli`, async ({ page }) => {
    const bledyKonsoli: string[] = [];
    const wyjatkiStrony: string[] = [];
    page.on("console", (wpis) => {
      if (wpis.type() === "error") bledyKonsoli.push(wpis.text());
    });
    page.on("pageerror", (blad) => wyjatkiStrony.push(blad.message));
    await instalujAtrapy(page);

    const odpowiedzStrony = await page.goto(adres, { waitUntil: "networkidle" });
    expect(odpowiedzStrony?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Wywiad psychologiczny" }).first()).toBeVisible();
    await expect(page.getByText("Wprowadzenie do wywiadu").first()).toBeVisible();
    expect(new URL(page.url()).searchParams.get("podglad")).toBe(adres.includes("podglad=1") ? "1" : null);

    expect(bledyKonsoli, `błędy konsoli: ${bledyKonsoli.length}`).toEqual([]);
    expect(wyjatkiStrony, `wyjątki strony: ${wyjatkiStrony.length}`).toEqual([]);
  });
}
