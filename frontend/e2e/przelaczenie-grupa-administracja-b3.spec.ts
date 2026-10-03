import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { ucieknijWyrazenie } from "./_wyrazenie";

/**
 * Miara dla tej gałęzi: grupy przełączenia `decyzjaProfilu`,
 * `wzoryDokumentow` i `ekranStartowy` (`lib/przelaczenie/grupy.ts`) mają tu
 * `wlaczona: true`, grupa `ustawieniaProgramu` — `false`.
 *
 * Rodzaj „podmiana treści”: adres się nie zmienia (brak przekierowania), pod
 * starym adresem stoi nowy ekran w powłoce panelu administracji. Sprawdzane
 * na zbudowanej aplikacji, z atrapą API przez `page.route` i atrapą sesji
 * (jak w `przelaczenie-grupa-wspolpraca.spec.ts`):
 * - adres po wejściu jest ten sam, nagłówek `h1` należy do nowego ekranu;
 * - dokładnie jeden `main` i jeden `#tresc` (powłoka panelu, bez drugiego
 *   z szablonu ekranu);
 * - wpis menu prowadzi na ten sam adres co dotąd (menu bez zmian);
 * - zero odpowiedzi 404 w całym przebiegu;
 * - grupa wyłączona (`/admin/ustawienia`) daje dotychczasową stronę.
 */

const ATRAPA_SESJI = {
  accessToken: "atrapa-tokenu-testowego",
  expiresAt: Date.now() + 3_600_000,
};

const WNIOSEK = {
  id: 12,
  user: { id: 17, first_name: "Ewa", last_name: "Przykładowa" },
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

const EKRAN_STARTOWY = {
  video: { title: "Film powitalny", url: null, caption: null },
  program: { title: "Przebieg programu", body: "Treść o programie." },
  expectations: { title: "Oczekiwania", body: "Treść o oczekiwaniach." },
  updated_at: null,
};

const EDYCJA = {
  id: 1,
  name: "Edycja 2026",
  starts_at: "2026-01-01",
  ends_at: "2026-12-31",
  seats_limit: 30,
  test_pass_threshold: 70,
  test_attempts_limit: 3,
  internship_hours_required: 40,
  supervision_required_count: 5,
  reliability_threshold: 80,
  lesson_completion_percent: 90,
};

function odpowiedz(dane: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify({ data: dane }) };
}

/**
 * Atrapy API roli administracji. Ogólna atrapa (pusta lista) jest
 * rejestrowana PIERWSZA — Playwright wybiera trasę zarejestrowaną PÓŹNIEJ
 * jako pierwszą, więc kolejność rejestracji jest częścią zachowania.
 */
async function instalujAtrapyApi(page: Page): Promise<void> {
  await page.route("http://localhost:8000/api/v1/**", (route) => route.fulfill(odpowiedz([])));
  await page.route("http://localhost:8000/api/v1/me", (route) =>
    route.fulfill(odpowiedz({ id: 1, role: "project_manager", program_completed_at: null })),
  );
  await page.route("http://localhost:8000/api/v1/notifications**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [],
        meta: { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { unread: 0 } },
      }),
    }),
  );
  await page.route("http://localhost:8000/api/v1/admin/dashboard", (route) =>
    route.fulfill(odpowiedz({ counters: { participants: 0, completed: 0, certificates: 0 }, queues: [] })),
  );
  await page.route("http://localhost:8000/api/v1/admin/profiles/12", (route) => route.fulfill(odpowiedz(WNIOSEK)));
  await page.route("http://localhost:8000/api/v1/document-templates/agreement", (route) =>
    route.fulfill(
      odpowiedz({
        type: "agreement",
        content: "<p>Treść porozumienia</p>",
        version: 2,
        updated_at: "2026-09-28T10:00:00Z",
        updated_by: { id: 5, name: "Anna Testowa" },
      }),
    ),
  );
  await page.route("http://localhost:8000/api/v1/document-templates/agreement/versions", (route) =>
    route.fulfill(odpowiedz([{ version: 2, updated_at: "2026-09-28T10:00:00Z", updated_by: { id: 5, name: "Anna Testowa" } }])),
  );
  await page.route("http://localhost:8000/api/v1/onboarding", (route) => route.fulfill(odpowiedz(EKRAN_STARTOWY)));
  await page.route("http://localhost:8000/api/v1/admin/edition", (route) => route.fulfill(odpowiedz(EDYCJA)));

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) =>
    route.fulfill(odpowiedz({ url: null })),
  );
}

function zbierz404(page: Page): string[] {
  const kody404: string[] = [];
  page.on("response", (res) => {
    if (res.status() === 404) kody404.push(res.url());
  });
  return kody404;
}

async function licznikiTresci(page: Page) {
  return {
    main: await page.locator("main").count(),
    cele: await page.locator("#tresc").count(),
  };
}

const TRASY_PODMIANY = [
  {
    adres: "/admin/profile/12",
    naglowek: /^Wniosek o profil: Ewa Przykładowa/,
    tytulKarty: null,
    wpisMenu: { nazwa: "Profile psychologa", href: "/admin/profile" },
  },
  {
    adres: "/admin/wzory-dokumentow",
    naglowek: /^Wzory dokumentów$/,
    tytulKarty: "Wzory dokumentów — Niepodzielni",
    wpisMenu: { nazwa: "Wzory dokumentów", href: "/admin/wzory-dokumentow" },
  },
  {
    adres: "/admin/ekran-startowy",
    naglowek: /^Treść ekranu „Zacznij tutaj”$/,
    tytulKarty: null,
    wpisMenu: { nazwa: "Treść ekranu „Zacznij tutaj”", href: "/admin/ekran-startowy" },
  },
] as const;

test.describe("grupy przełączenia administracji (podmiana treści) — nowy ekran pod starym adresem", () => {
  for (const trasa of TRASY_PODMIANY) {
    test(`${trasa.adres}: adres bez zmian, nowy ekran, jeden main, menu bez zmian, 0 odpowiedzi 404`, async ({ page }) => {
      const kody404 = zbierz404(page);
      await instalujAtrapyApi(page);

      const odpowiedzStrony = await page.goto(trasa.adres);
      await zabezpieczeniePrzedEkranemDostepu(page);

      expect(odpowiedzStrony?.status()).toBe(200);
      await expect(page).toHaveURL(new RegExp(`${ucieknijWyrazenie(trasa.adres)}$`));
      await expect(page.getByRole("heading", { level: 1, name: trasa.naglowek })).toBeVisible();

      expect(await licznikiTresci(page)).toEqual({ main: 1, cele: 1 });
      await expect(page.locator('a[href="#tresc"]')).toHaveCount(1);

      if (trasa.tytulKarty) await expect(page).toHaveTitle(trasa.tytulKarty);

      const menu = page.getByRole("navigation", { name: "Menu — Administracja" }).first();
      await expect(menu.getByRole("link", { name: trasa.wpisMenu.nazwa })).toHaveAttribute("href", trasa.wpisMenu.href);

      expect(kody404, `odpowiedzi 404: ${kody404.join(", ")}`).toEqual([]);
    });
  }

  test("/admin/wzory-dokumentow: wejście z wpisu menu nie zmienia adresu i nie przekierowuje", async ({ page }) => {
    const kody404 = zbierz404(page);
    await instalujAtrapyApi(page);

    await page.goto("/admin");
    await zabezpieczeniePrzedEkranemDostepu(page);
    const menu = page.getByRole("navigation", { name: "Menu — Administracja" }).first();
    // „Wzory dokumentów” stoją w zwijanej grupie „Ustawienia” (na /admin zwiniętej): rozwijamy ją przed wejściem w pozycję.
    await menu.getByRole("button", { name: "Ustawienia (4)" }).click();
    await menu.getByRole("link", { name: "Wzory dokumentów" }).click();

    await expect(page).toHaveURL(/\/admin\/wzory-dokumentow$/);
    await expect(page.getByRole("heading", { level: 1, name: "Wzory dokumentów" })).toBeVisible();
    expect(await licznikiTresci(page)).toEqual({ main: 1, cele: 1 });
    expect(kody404, `odpowiedzi 404: ${kody404.join(", ")}`).toEqual([]);
  });

  test("/admin/ustawienia (grupa wyłączona): dotychczasowa strona, jeden main, pola edycji obecne", async ({ page }) => {
    const kody404 = zbierz404(page);
    await instalujAtrapyApi(page);

    await page.goto("/admin/ustawienia");
    await zabezpieczeniePrzedEkranemDostepu(page);

    await expect(page.getByRole("heading", { level: 1, name: "Ustawienia edycji" })).toBeVisible();
    await expect(page.getByLabel("Nazwa edycji")).toHaveValue("Edycja 2026");
    expect(await licznikiTresci(page)).toEqual({ main: 1, cele: 1 });
    expect(kody404, `odpowiedzi 404: ${kody404.join(", ")}`).toEqual([]);
  });

  test("nowe trasy poligonu zostają na miejscu: /nowy-front/admin/ekran-startowy odpowiada 200", async ({ page }) => {
    await instalujAtrapyApi(page);
    const odpowiedzStrony = await page.goto("/nowy-front/admin/ekran-startowy");
    expect(odpowiedzStrony?.status()).toBe(200);
  });
});
