import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Ekran „Powiadomienia” pod `/admin/emails` (grupa włączona) w ramce panelu
 * administracji, na zbudowanej aplikacji, z atrapą API i sesji przez
 * `page.route` (żadne żądanie nie wychodzi poza przeglądarkę).
 *
 * Dla szerokości 390 i 1280 px: zakładka „Ustawienia” (przełączniki rodzajów,
 * blok przypomnienia o superwizji) oraz zakładka „Wysłane” ze stanem z danymi
 * (lista z oknem „Podgląd”, treść w ramce z pustym sandbox) i ze stanem pustym
 * („Brak wiadomości.”). Dla 320, 390 i 1280 px strona nie jest szersza od okna.
 *
 * Zrzuty całej strony powstają tylko przy ustawionej zmiennej `PW_ZRZUTY`
 * (katalog poza repozytorium).
 */

const API = "http://localhost:8000/api/v1";
const ATRAPA_SESJI = {
  accessToken: ["atrapa", "tokenu", "testowego"].join("-"),
  expiresAt: Date.now() + 3_600_000,
};

const RODZAJE_USTAWIEN = [
  { type: "application.accepted", enabled: true },
  { type: "application.rejected", enabled: true },
  { type: "assignment.created", enabled: true },
  { type: "assignment.removed", enabled: false },
  { type: "course.invited", enabled: true },
  { type: "course.unlocked", enabled: true },
  { type: "internship.accepted", enabled: true },
  { type: "internship.returned", enabled: false },
  { type: "question.asked", enabled: true },
  { type: "question.answered", enabled: true },
];

const WIADOMOSCI = [
  {
    id: 1,
    to_email: "marta@demo.pl",
    subject: "Twój wpis stażu został zaakceptowany",
    body_html: '<p>Cześć Marto,</p><p>Twój wpis stażu z 27 sierpnia został <strong>zaakceptowany</strong>.</p><script>window.__wykonano = true;</script>',
    status: "simulated",
    sent_at: "2026-09-25T15:05:00Z",
    created_at: "2026-09-25T15:00:00Z",
  },
  {
    id: 2,
    to_email: "filip@demo.pl",
    subject: "Odblokowano kolejny etap",
    body_html: "<p>Cześć Filipie, etap 3 jest już dostępny.</p>",
    status: "queued",
    sent_at: null,
    created_at: "2026-09-26T09:30:00Z",
  },
  {
    id: 3,
    to_email: "ola@demo.pl",
    subject: "Zaproszenie do programu",
    body_html: "",
    status: "failed",
    sent_at: null,
    created_at: "2026-09-27T10:00:00Z",
  },
];

function koperta(dane: unknown, meta?: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }) };
}

async function instalujAtrapy(page: Page, wiadomosci: unknown[]): Promise<void> {
  await page.route(`${API}/**`, (route) => {
    const sciezka = new URL(route.request().url()).pathname.replace("/api/v1", "");
    if (sciezka === "/me") {
      return route.fulfill(koperta({ id: 1, role: "project_manager", first_name: "Anna", last_name: "Demo", program_completed_at: null }));
    }
    if (sciezka.startsWith("/notifications")) {
      return route.fulfill(koperta([], { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { unread: 0 } }));
    }
    if (sciezka === "/admin/notification-settings") {
      return route.fulfill(koperta({ types: RODZAJE_USTAWIEN, supervision_reminder: { enabled: true, send_at: "08:00" } }));
    }
    if (sciezka === "/admin/emails") {
      return route.fulfill(
        koperta(wiadomosci, {
          current_page: 1,
          per_page: 25,
          total: wiadomosci.length,
          last_page: 1,
          extra: { from: { address: "powiadomienia@niepodzielni.test", name: "Fundacja Niepodzielni" } },
        }),
      );
    }
    return route.fulfill(koperta([], { current_page: 1, per_page: 25, total: 0, last_page: 1 }));
  });
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(koperta({ url: null })));
}

async function przewijanieWBok(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** Elementy wystające poza okno (do komunikatu błędu, gdy strona przewija się w bok). */
async function wystajace(page: Page): Promise<string> {
  return page.evaluate(() => {
    const okno = document.documentElement.clientWidth;
    const wynik: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > okno + 0.5 || r.left < -0.5) {
        const klasa = typeof el.className === "string" ? el.className.split(/\s+/)[0] : "";
        wynik.push(`${el.tagName.toLowerCase()}${klasa ? `.${klasa}` : ""} [${Math.round(r.left)}..${Math.round(r.right)}]`);
      }
    }
    return wynik.slice(0, 10).join("; ");
  });
}

async function zrzut(page: Page, nazwa: string): Promise<void> {
  const katalog = process.env.PW_ZRZUTY;
  if (!katalog) return;
  mkdirSync(katalog, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(katalog, `${nazwa}.png`), fullPage: true, animations: "disabled" });
}

for (const okno of [
  { nazwa: "390", width: 390, height: 844 },
  { nazwa: "1280", width: 1280, height: 800 },
]) {
  test.describe(`ekran „Powiadomienia” @${okno.nazwa}`, () => {
    test.use({ viewport: { width: okno.width, height: okno.height } });

    test("ustawienia: przełączniki rodzajów i blok przypomnienia, bez przewijania w bok", async ({ page }) => {
      await instalujAtrapy(page, WIADOMOSCI);
      await page.goto("/admin/emails");
      await expect(page.getByRole("heading", { level: 1, name: "Powiadomienia" })).toBeVisible();
      await expect(page.getByRole("switch").first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      expect(await przewijanieWBok(page)).toBeLessThanOrEqual(0);
      await zrzut(page, `powiadomienia--ustawienia--${okno.nazwa}`);
    });

    test("wysłane z danymi: licznik, lista i okno podglądu w ramce z pustym sandbox", async ({ page }) => {
      await instalujAtrapy(page, WIADOMOSCI);
      await page.goto("/admin/emails");
      await page.getByRole("button", { name: "Wysłane", exact: true }).click();
      await expect(page.getByText("3 łącznie")).toBeVisible();
      await expect(page.getByText("marta@demo.pl")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      expect(await przewijanieWBok(page)).toBeLessThanOrEqual(0);
      await zrzut(page, `powiadomienia--wyslane-dane--${okno.nazwa}`);

      await page.getByRole("button", { name: "Podgląd: Twój wpis stażu został zaakceptowany" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const ramka = dialog.locator("iframe");
      await expect(ramka).toHaveAttribute("sandbox", "");
      await expect(ramka.contentFrame().getByText("Cześć Marto,")).toBeVisible();
      expect(await page.evaluate(() => (window as unknown as { __wykonano?: boolean }).__wykonano)).toBeUndefined();
      expect(await przewijanieWBok(page)).toBeLessThanOrEqual(0);
      await zrzut(page, `powiadomienia--wyslane-podglad--${okno.nazwa}`);

      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    });

    test("wysłane bez wiadomości: stan pusty", async ({ page }) => {
      await instalujAtrapy(page, []);
      await page.goto("/admin/emails");
      await page.getByRole("button", { name: "Wysłane", exact: true }).click();
      await expect(page.getByText("Brak wiadomości.").first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      expect(await przewijanieWBok(page)).toBeLessThanOrEqual(0);
      await zrzut(page, `powiadomienia--wyslane-puste--${okno.nazwa}`);
    });
  });
}

for (const okno of [
  { nazwa: "320", width: 320, height: 640 },
  { nazwa: "390", width: 390, height: 844 },
]) {
  test(`ekran „Powiadomienia” @${okno.nazwa}: żadna zakładka ani okno podglądu nie przewija strony w bok`, async ({ page }) => {
    await page.setViewportSize({ width: okno.width, height: okno.height });
    await instalujAtrapy(page, WIADOMOSCI);
    await page.goto("/admin/emails");
    await expect(page.getByRole("switch").first()).toBeVisible();
    expect(await przewijanieWBok(page), "ustawienia").toBeLessThanOrEqual(0);

    await page.getByRole("button", { name: "Wysłane", exact: true }).click();
    await expect(page.getByText("marta@demo.pl")).toBeVisible();
    expect(await przewijanieWBok(page), `wysłane; wystają: ${await wystajace(page)}`).toBeLessThanOrEqual(0);

    await page.getByRole("button", { name: "Podgląd: Twój wpis stażu został zaakceptowany" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await przewijanieWBok(page), "okno podglądu").toBeLessThanOrEqual(0);
  });
}
