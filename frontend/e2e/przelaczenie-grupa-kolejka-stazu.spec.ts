import { mkdirSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";

/**
 * Miara dla tej gałęzi: grupa przełączenia `kolejkaStazu`
 * (`lib/przelaczenie/grupy.ts`) ma tu `wlaczona: true`.
 *
 * Rodzaj „podmiana treści”: adres `/admin/staz` się nie zmienia (bez
 * przekierowania), pod nim stoi ekran decyzji o dyżurach w nowej ramce panelu
 * administracji. Sprawdzane na zbudowanej aplikacji, z atrapą API przez
 * `page.route` i atrapą sesji (jak w `przelaczenie-grupa-wspolpraca.spec.ts`):
 * - adres po wejściu ten sam, `h1` ekranu, tytuł karty „Akceptacja stażu”,
 *   jedyny `main` i `#tresc`, jedyny link skoku, nowa ramka (przycisk „Menu”
 *   przy 390 px), pozycja menu „Akceptacja stażu” prowadzi na ten sam adres;
 * - trzy decyzje na atrapach: zatwierdzenie, odesłanie i odrzucenie z
 *   komentarzem (ciało żądania), pusty komentarz kończy się błędem pola
 *   (422 z atrapy) i wpis zostaje, rozstrzygnięty wcześniej wpis
 *   (403 `entry_locked`) pokazuje komunikat z koperty;
 * - axe z tagiem `best-practice` (m.in. `heading-order`) na ekranie przed
 *   przełączeniem (poligon `/nowy-front/admin/staz`) i po (`/admin/staz`):
 *   po przełączeniu żadnego naruszenia, którego nie było przed;
 * - zero odpowiedzi 404 w całym przebiegu.
 *
 * Zrzuty ekranu powstają tylko przy ustawionej zmiennej `PW_ZRZUTY_STAZ`
 * (katalog poza repozytorium).
 */

const API = "http://localhost:8000/api/v1";

const ATRAPA_SESJI = {
  accessToken: "atrapa-tokenu-testowego",
  expiresAt: Date.now() + 3_600_000,
};

const EDYCJA = {
  id: 1,
  name: "Edycja 2026",
  starts_at: "2026-10-01",
  ends_at: "2027-03-31",
  seats_limit: 40,
  test_pass_threshold: 80,
  test_attempts_limit: 3,
  internship_hours_required: 72,
  supervision_required_count: 6,
  reliability_threshold: 60,
  lesson_completion_percent: 60,
};

function wpis(id: number, imie: string, nadpisz: Record<string, unknown> = {}) {
  return {
    id,
    date: "2026-08-27",
    hours: "3.5",
    form: "phone_duty",
    consultations_count: 4,
    description: "Dyżur telefoniczny — bez danych osób.",
    status: "submitted",
    review_comment: null,
    decided_at: null,
    created_at: "2026-08-27T18:00:00Z",
    updated_at: "2026-08-27T18:00:00Z",
    user: { id: 10 + id, first_name: imie, last_name: "Demo" },
    ...nadpisz,
  };
}

function trzyWpisy() {
  return [
    wpis(91, "Marta"),
    wpis(92, "Filip", { form: "chat_duty", hours: "2", consultations_count: 0, description: null }),
    wpis(93, "Ola", { form: "other", hours: "1.5", description: "Dyżur w ośrodku.\nDruga linia opisu." }),
  ];
}

function koperta(dane: unknown, meta?: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }) };
}

function metaListy(total: number) {
  return { current_page: 1, per_page: 25, total, last_page: 1 };
}

interface Zapytanie {
  adres: string;
  cialo: unknown;
}

interface Atrapy {
  zapytania: Zapytanie[];
  wpisy: ReturnType<typeof wpis>[];
}

/**
 * Atrapy API roli administracji. Ogólna atrapa jest rejestrowana PIERWSZA —
 * Playwright wybiera trasę zarejestrowaną PÓŹNIEJ jako pierwszą. Kolejka jest
 * stanem w pamięci: decyzja zdejmuje wpis z listy, tak jak serwer.
 */
async function instalujAtrapyApi(
  page: Page,
  opcje: { wpisy?: ReturnType<typeof wpis>[]; zablokowany?: number } = {},
): Promise<Atrapy> {
  const stan: Atrapy = { zapytania: [], wpisy: opcje.wpisy ?? trzyWpisy() };

  await page.route(`${API}/**`, (route) => route.fulfill(koperta([], metaListy(0))));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(koperta({ id: 1, role: "project_manager", first_name: "Opiekun", last_name: "Demo", program_completed_at: null })),
  );
  await page.route(`${API}/notifications**`, (route) =>
    route.fulfill(koperta([], { ...metaListy(0), extra: { unread: 0 } })),
  );
  await page.route(`${API}/admin/dashboard`, (route) =>
    route.fulfill(koperta({ counters: { participants: 3, completed: 1, certificates: 1 }, queues: [] })),
  );
  await page.route(`${API}/admin/edition`, (route) => route.fulfill(koperta(EDYCJA)));
  await page.route(`${API}/admin/internship/pending**`, (route) =>
    route.fulfill(koperta(stan.wpisy, metaListy(stan.wpisy.length))),
  );
  await page.route(`${API}/admin/internship/*/*`, async (route) => {
    const adres = new URL(route.request().url());
    const [, , , idTekst, decyzja] = adres.pathname.split("/").slice(2);
    const id = Number(idTekst);
    const cialo = route.request().postDataJSON() as { comment?: string } | null;
    stan.zapytania.push({ adres: `${route.request().method()} ${adres.pathname.replace("/api/v1", "")}`, cialo });

    if (opcje.zablokowany === id) {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          error: { status: 403, code: "entry_locked", message: "Ten wpis został już rozstrzygnięty." },
        }),
      });
      stan.wpisy = stan.wpisy.filter((w) => w.id !== id);
      return;
    }
    if (decyzja !== "accept" && !(cialo?.comment ?? "").trim()) {
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            status: 422,
            code: "validation_failed",
            message: "Popraw zaznaczone pola.",
            errors: {
              comment: [decyzja === "reject" ? "Dodaj powód przed odrzuceniem wpisu." : "Dodaj komentarz przed odesłaniem wpisu."],
            },
          },
        }),
      });
      return;
    }
    const zmieniony = stan.wpisy.find((w) => w.id === id);
    stan.wpisy = stan.wpisy.filter((w) => w.id !== id);
    await route.fulfill(koperta({ ...zmieniony, status: decyzja === "accept" ? "accepted" : decyzja === "return" ? "returned" : "rejected" }));
  });

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(koperta({ url: null })));
  return stan;
}

function zbierz404(page: Page): string[] {
  const kody404: string[] = [];
  page.on("response", (res) => {
    if (res.status() === 404) kody404.push(res.url());
  });
  return kody404;
}

function katalogZrzutow(): string | null {
  const katalog = process.env.PW_ZRZUTY_STAZ;
  if (!katalog) return null;
  mkdirSync(katalog, { recursive: true });
  return katalog;
}

async function licznikiTresci(page: Page) {
  return {
    main: await page.locator("main").count(),
    cele: await page.locator("#tresc").count(),
  };
}

/** Naruszenia axe z regułami WCAG 2.1 AA oraz `best-practice` (m.in. `heading-order`). */
async function naruszeniaZBestPractice(page: Page): Promise<{ id: string; impact: string; wezly: string[] }[]> {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.constructor?.name !== "CSSTransition" || a.playState !== "running"),
  );
  const wynik = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "best-practice"]).analyze();
  return wynik.violations.map((v) => ({
    id: v.id,
    impact: String(v.impact),
    wezly: v.nodes.map((n) => n.target.map(String).join(" ")),
  }));
}

const SZEROKOSCI = [1280, 390] as const;

test.describe("grupa przełączenia kolejki stażu — ekran decyzji pod adresem /admin/staz", () => {
  for (const szerokosc of SZEROKOSCI) {
    test(`/admin/staz @${szerokosc}: adres bez zmian, h1, tytuł, jeden main, nowa ramka, menu, axe, 0 odpowiedzi 404`, async ({
      page,
    }, testInfo) => {
      const kody404 = zbierz404(page);
      await page.setViewportSize({ width: szerokosc, height: szerokosc >= 1024 ? 900 : 844 });
      await instalujAtrapyApi(page);

      const odpowiedzStrony = await page.goto("/admin/staz");
      await zabezpieczeniePrzedEkranemDostepu(page);

      expect(odpowiedzStrony?.status()).toBe(200);
      await expect(page).toHaveURL(/\/admin\/staz$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1, name: "Dyżury do decyzji" })).toBeVisible();
      await expect(page).toHaveTitle("Akceptacja stażu — Niepodzielni");

      // Dane z atrapy: trzy wiersze z osobą, datą, godzinami, formą i trzema przyciskami.
      const wiersze = page.getByRole("list", { name: "Dyżury do decyzji" }).getByRole("listitem");
      await expect(wiersze).toHaveCount(3);
      await expect(wiersze.first()).toContainText("Marta Demo");
      await expect(wiersze.first()).toContainText("Dyżur z 27 sierpnia 2026 · 3.5 h · dyżur telefoniczny · konsultacje: 4");
      for (let i = 0; i < 3; i += 1) {
        await expect(wiersze.nth(i).getByRole("button")).toHaveText(["Zatwierdź", "Poproś o poprawkę", "Odrzuć dyżur"]);
      }

      // Jeden main i jeden #tresc (powłoka panelu), jeden link skoku.
      expect(await licznikiTresci(page)).toEqual({ main: 1, cele: 1 });
      await expect(page.locator('a[href="#tresc"]')).toHaveCount(1);

      // Nowa ramka: znacznik powłoki panelu, przycisk „Menu” tylko przy 390 px.
      await expect(page.locator("[data-powloka-panelu]")).toHaveCount(1);
      const przyciskMenu = page.getByRole("button", { name: "Menu", exact: true });
      if (szerokosc >= 1024) {
        await expect(przyciskMenu).toBeHidden();
        const nav = page.getByRole("complementary", { name: "Menu i konto" }).getByRole("navigation", { name: "Menu — Administracja" });
        await expect(nav.getByRole("link", { name: "Akceptacja stażu" })).toHaveAttribute("href", "/admin/staz");
        await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
      } else {
        await expect(przyciskMenu).toBeVisible();
        await przyciskMenu.click();
        const okno = page.getByRole("dialog", { name: "Menu i konto" });
        await expect(okno).toBeVisible();
        const nav = okno.getByRole("navigation", { name: "Menu — Administracja" });
        await expect(nav.getByRole("link", { name: "Akceptacja stażu" })).toHaveAttribute("href", "/admin/staz");
        await okno.getByRole("button", { name: "Zamknij" }).click();
        await expect(page.getByRole("dialog", { name: "Menu i konto" })).toHaveCount(0);
      }

      // Bez przewijania w poziomie.
      const przewijanie = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(przewijanie, "przewijanie w poziomie").toBe(false);

      const naruszenia = await uruchomAxe(page);
      await dolaczNaruszeniaDoRaportu(testInfo, `axe-staz-${szerokosc}`, naruszenia);
      expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);

      const zrzuty = katalogZrzutow();
      if (zrzuty) await page.screenshot({ path: path.join(zrzuty, `staz-kolejka-${szerokosc}-dane.png`), fullPage: true });

      expect(kody404, `odpowiedzi 404: ${kody404.join(", ")}`).toEqual([]);
    });
  }

  test("axe z tagiem best-practice: po przełączeniu (/admin/staz) żadnego naruszenia, którego nie było przed (poligon)", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await instalujAtrapyApi(page);

    await page.goto("/nowy-front/admin/staz");
    await zabezpieczeniePrzedEkranemDostepu(page);
    await expect(page.getByRole("list", { name: "Dyżury do decyzji" }).getByRole("listitem")).toHaveCount(3);
    const przed = await naruszeniaZBestPractice(page);

    await page.goto("/admin/staz");
    await expect(page.getByRole("list", { name: "Dyżury do decyzji" }).getByRole("listitem")).toHaveCount(3);
    const po = await naruszeniaZBestPractice(page);

    await testInfo.attach("axe-best-practice-przed-poligon", { body: JSON.stringify(przed, null, 2), contentType: "application/json" });
    await testInfo.attach("axe-best-practice-po-admin-staz", { body: JSON.stringify(po, null, 2), contentType: "application/json" });
    testInfo.annotations.push({ type: "axe best-practice przed (poligon)", description: przed.map((n) => `${n.id}×${n.wezly.length}`).join(", ") || "0" });
    testInfo.annotations.push({ type: "axe best-practice po (/admin/staz)", description: po.map((n) => `${n.id}×${n.wezly.length}`).join(", ") || "0" });

    const znaneId = new Set(przed.map((n) => n.id));
    const nowe = po.filter((n) => !znaneId.has(n.id));
    expect(nowe, `nowe naruszenia: ${JSON.stringify(nowe)}`).toEqual([]);
    expect(po.filter((n) => n.id === "heading-order"), "heading-order po przełączeniu").toEqual([]);
  });

  test("kontrola dodatnia przyrządu: nagłówek h4 wstrzyknięty pod h1 daje naruszenie heading-order z tagiem best-practice", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await instalujAtrapyApi(page);
    await page.goto("/admin/staz");
    await zabezpieczeniePrzedEkranemDostepu(page);
    await expect(page.getByRole("list", { name: "Dyżury do decyzji" }).getByRole("listitem")).toHaveCount(3);
    expect((await naruszeniaZBestPractice(page)).map((n) => n.id)).not.toContain("heading-order");

    await page.evaluate(() => {
      const h4 = document.createElement("h4");
      h4.textContent = "Wstrzyknięty nagłówek";
      document.querySelector("main")?.appendChild(h4);
    });
    expect((await naruszeniaZBestPractice(page)).map((n) => n.id)).toContain("heading-order");
  });

  test("zatwierdzenie: POST na accept bez ciała, wpis znika, potwierdzenie widoczne", async ({ page }) => {
    const atrapy = await instalujAtrapyApi(page);
    await page.goto("/admin/staz");
    await zabezpieczeniePrzedEkranemDostepu(page);

    const wiersze = page.getByRole("list", { name: "Dyżury do decyzji" }).getByRole("listitem");
    await expect(wiersze).toHaveCount(3);
    await wiersze.filter({ hasText: "Marta Demo" }).getByRole("button", { name: "Zatwierdź" }).click();

    await expect(page.getByRole("status")).toContainText("Dyżur zatwierdzony: Marta Demo.");
    await expect(wiersze).toHaveCount(2);
    await expect(wiersze.filter({ hasText: "Marta Demo" })).toHaveCount(0);
    expect(atrapy.zapytania).toEqual([{ adres: "POST /admin/internship/91/accept", cialo: null }]);
  });

  test("odesłanie z komentarzem: formularz w treści, POST na return z komentarzem, wpis znika", async ({ page }) => {
    const atrapy = await instalujAtrapyApi(page);
    await page.goto("/admin/staz");
    await zabezpieczeniePrzedEkranemDostepu(page);

    const wiersze = page.getByRole("list", { name: "Dyżury do decyzji" }).getByRole("listitem");
    const filip = wiersze.filter({ hasText: "Filip Demo" });
    await filip.getByRole("button", { name: "Poproś o poprawkę" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const formularz = page.getByRole("form", { name: /Poproś o poprawkę: Filip Demo/ });
    await expect(formularz).toBeVisible();
    await formularz.getByRole("textbox", { name: /Co trzeba poprawić/ }).fill("Uzupełnij opis dyżuru.");
    await formularz.getByRole("button", { name: "Poproś o poprawkę" }).click();

    await expect(page.getByRole("status")).toContainText("Dyżur odesłany do poprawy. Filip Demo.");
    await expect(wiersze).toHaveCount(2);
    expect(atrapy.zapytania).toEqual([
      { adres: "POST /admin/internship/92/return", cialo: { comment: "Uzupełnij opis dyżuru." } },
    ]);
  });

  test("odrzucenie z powodem: POST na reject z komentarzem, wpis znika", async ({ page }) => {
    const atrapy = await instalujAtrapyApi(page);
    await page.goto("/admin/staz");
    await zabezpieczeniePrzedEkranemDostepu(page);

    const wiersze = page.getByRole("list", { name: "Dyżury do decyzji" }).getByRole("listitem");
    await wiersze.filter({ hasText: "Ola Demo" }).getByRole("button", { name: "Odrzuć dyżur" }).click();
    const formularz = page.getByRole("form", { name: /Odrzuć dyżur: Ola Demo/ });
    await formularz.getByRole("textbox", { name: /Powód odrzucenia/ }).fill("Dyżur nie odbył się.");
    await formularz.getByRole("button", { name: "Odrzuć dyżur" }).click();

    await expect(page.getByRole("status")).toContainText("Dyżur odrzucony. Ola Demo.");
    await expect(wiersze).toHaveCount(2);
    expect(atrapy.zapytania).toEqual([
      { adres: "POST /admin/internship/93/reject", cialo: { comment: "Dyżur nie odbył się." } },
    ]);
  });

  test("pusty komentarz nie zamyka sprawy: błąd przy polu, wpis zostaje, brak potwierdzenia", async ({ page }) => {
    const atrapy = await instalujAtrapyApi(page);
    await page.goto("/admin/staz");
    await zabezpieczeniePrzedEkranemDostepu(page);

    const wiersze = page.getByRole("list", { name: "Dyżury do decyzji" }).getByRole("listitem");
    for (const [przycisk, komunikat] of [
      ["Poproś o poprawkę", "Dodaj komentarz przed odesłaniem wpisu."],
      ["Odrzuć dyżur", "Dodaj powód przed odrzuceniem wpisu."],
    ] as const) {
      await wiersze.filter({ hasText: "Marta Demo" }).getByRole("button", { name: przycisk }).click();
      const formularz = page.getByRole("form", { name: new RegExp(`${przycisk}: Marta Demo`) });
      await formularz.getByRole("textbox").fill("   ");
      await formularz.getByRole("button", { name: przycisk }).click();
      await expect(formularz.getByText(komunikat).first()).toBeVisible();
      await formularz.getByRole("button", { name: "Wróć do listy" }).click();
    }

    await expect(wiersze).toHaveCount(3);
    await expect(page.getByRole("status")).toHaveCount(0);
    expect(atrapy.zapytania.map((z) => z.adres)).toEqual([
      "POST /admin/internship/91/return",
      "POST /admin/internship/91/reject",
    ]);
    expect(atrapy.zapytania.map((z) => z.cialo)).toEqual([{ comment: "" }, { comment: "" }]);
  });

  test("wpis rozstrzygnięty wcześniej (403 entry_locked): komunikat z koperty i odświeżona lista", async ({ page }) => {
    await instalujAtrapyApi(page, { zablokowany: 91 });
    await page.goto("/admin/staz");
    await zabezpieczeniePrzedEkranemDostepu(page);

    const wiersze = page.getByRole("list", { name: "Dyżury do decyzji" }).getByRole("listitem");
    await expect(wiersze).toHaveCount(3);
    await wiersze.filter({ hasText: "Marta Demo" }).getByRole("button", { name: "Zatwierdź" }).click();

    await expect(page.getByText("Ten wpis został już rozstrzygnięty.")).toBeVisible();
    await expect(wiersze).toHaveCount(2);
    await expect(wiersze.filter({ hasText: "Marta Demo" })).toHaveCount(0);
  });

  test("pusta kolejka: stan pusty zamiast listy", async ({ page }) => {
    await instalujAtrapyApi(page, { wpisy: [] });
    await page.goto("/admin/staz");
    await zabezpieczeniePrzedEkranemDostepu(page);

    await expect(page.getByRole("heading", { name: "Brak wpisów do decyzji" })).toBeVisible();
    expect(await licznikiTresci(page)).toEqual({ main: 1, cele: 1 });
  });

  test("nowe trasy poligonu zostają na miejscu: /nowy-front/admin/staz odpowiada 200", async ({ page }) => {
    await instalujAtrapyApi(page);
    const odpowiedzStrony = await page.goto("/nowy-front/admin/staz");
    expect(odpowiedzStrony?.status()).toBe(200);
  });
});
