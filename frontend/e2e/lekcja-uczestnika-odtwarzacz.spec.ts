import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { POCHODZENIE_ODTWARZACZA } from "../lib/konfiguracja/odtwarzacz-nagran";

/**
 * Ekran lekcji uczestnika z prawdziwym odtwarzaczem w ramce, pod adresem panelu (`/panel/lekcje/[id]`),
 * na zbudowanej aplikacji. Żadne żądanie nie wychodzi poza przeglądarkę: adres ramki to host dozwolony
 * w konfiguracji, ale odpowiada mu atrapa strony z przechwycenia żądań, a przeglądarka dodatkowo nie
 * rozwiązuje żadnej nazwy poza lokalną (próba zlicza odpowiedzi atrapy i nieudane żądania do tego hosta).
 * Zrzuty powstają tylko przy ustawionej zmiennej `PW_ZRZUTY`.
 */

const API = "http://localhost:8000/api/v1";
const SLUG = "wywiad-psychologiczny";
const META = { current_page: 1, per_page: 100, total: 0, last_page: 1 };
const ATRAPA_SESJI = { accessToken: ["atrapa", "tokenu", "testowego"].join("-"), expiresAt: Date.now() + 3_600_000 };
const ADRES_RAMKI = `${POCHODZENIE_ODTWARZACZA}/embed/1/lekcja-21?token=atrapa`;
const WYGASA = 4_070_908_800;
const TRESC = "## Cel lekcji\n\nPo tej lekcji rozróżniasz pytania otwarte i zamknięte.\n\n### Na co patrzeć\n\n- pytanie otwarte zaprasza do opowieści\n- pytanie zamknięte porządkuje fakty\n\n## Przebieg rozmowy\n\nRozmowa z osobą w kryzysie wymaga uważności, spokoju i jasnych pytań.";

const ATRAPA_RAMKI = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Atrapa odtwarzacza</title>
<style>html,body{margin:0;height:100%;background:#1f2937;color:#e5e7eb;font:16px/1.4 system-ui,sans-serif;display:flex;align-items:center;justify-content:center}</style></head>
<body><p>Atrapa odtwarzacza w ramce (żadne nagranie nie jest pobierane)</p>
<script>
addEventListener("message", (z) => {
  let t; try { t = JSON.parse(z.data); } catch { return; }
  if (t.method === "addEventListener" && t.value === "ready")
    parent.postMessage(JSON.stringify({ context: "player.js", version: "0.0.11", event: "ready" }), "*");
});
</script></body></html>`;

test.use({ launchOptions: { args: ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1"] } });

function json(dane: unknown, status = 200, meta?: unknown) {
  return { status, contentType: "application/json", body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }) };
}

function odmowa(status: number, code: string, message: string, reason?: Record<string, unknown>) {
  return { status, contentType: "application/json", body: JSON.stringify({ error: { status, code, message, ...(reason ? { reason } : {}) } }) };
}

interface Licznik {
  atrapa: number;
  nieudane: number;
  postep: number;
  ukonczenie: number;
}

interface Opcje {
  id?: number;
  video_status?: "none" | "processing" | "ready";
  odpowiedzLekcji?: ReturnType<typeof odmowa>;
  linkNagrania?: "jest" | "w-przygotowaniu";
  content?: string | null;
}

async function instalujAtrapy(page: Page, opcje: Opcje = {}): Promise<Licznik> {
  const id = opcje.id ?? 21;
  const licznik: Licznik = { atrapa: 0, nieudane: 0, postep: 0, ukonczenie: 0 };
  const lekcja = {
    id,
    title: "Wprowadzenie do wywiadu",
    description: "Kiedy pytać otwarcie, a kiedy zamknąć pytanie.",
    content: opcje.content === undefined ? TRESC : opcje.content,
    topic: { id: 7, title: "Rozmowa", position: 1 },
    course: { id: 2, slug: SLUG, title: "Wywiad psychologiczny" },
    question_addressee: { name: "Marta Zielińska" },
    required_active_seconds: 1080,
    duration_seconds: 1800,
    position_seconds: 0,
    watched_seconds: 800,
    active_seconds: 700,
    is_completed: false,
    completable: false,
    completable_at_percent: 60,
    video_status: opcje.video_status ?? "ready",
  };
  const kurs = {
    id: 2,
    slug: SLUG,
    title: "Wywiad psychologiczny",
    status: "in_progress",
    progress_percent: 40,
    has_test: true,
    topics: [{ id: 7, title: "Rozmowa", position: 1 }],
    lessons: [19, 20, 21, 22, 23].map((numer, indeks) => ({
      id: numer,
      title: numer === id ? lekcja.title : `Lekcja ${indeks + 1} tematu`,
      sequence_order: indeks + 1,
      duration_seconds: 1500,
      is_completed: numer < 21,
      topic_id: 7,
    })),
    materials: [],
  };
  await page.route(`${API}/**`, (route) => route.fulfill(json([], 200, META)));
  await page.route(`${API}/me`, (route) => route.fulfill(json({ id: 1, role: "volunteer", first_name: "Marta", program_completed_at: null })));
  await page.route(`${API}/courses`, (route) =>
    route.fulfill(json([{ id: 2, slug: SLUG, title: kurs.title, sequence_order: 1, product_group: "psychon", status: "in_progress", progress_percent: 40 }])),
  );
  await page.route(`${API}/courses/${SLUG}`, (route) => route.fulfill(json(kurs)));
  await page.route(`${API}/notifications**`, (route) => route.fulfill(json([], 200, { ...META, extra: { unread: 0 } })));
  await page.route(`${API}/lessons/${id}`, (route) => route.fulfill(opcje.odpowiedzLekcji ?? json(lekcja)));
  await page.route(`${API}/lessons/${id}/questions`, (route) => route.fulfill(json([], 200, META)));
  await page.route(`${API}/lessons/${id}/progress`, (route) => {
    licznik.postep += 1;
    return route.fulfill(json({ watched_seconds: 800, active_seconds: 700, completable: false, completable_at_percent: 60, required_active_seconds: 1080 }));
  });
  await page.route(`${API}/lessons/${id}/complete`, (route) => {
    licznik.ukonczenie += 1;
    return route.fulfill(json({ is_completed: true, completed_at: "2026-10-02T08:00:00Z" }));
  });
  await page.route(`${API}/lessons/${id}/video-link`, (route) =>
    route.fulfill(
      opcje.linkNagrania === "w-przygotowaniu"
        ? odmowa(404, "video_not_ready", "Nagranie w przygotowaniu.")
        : json({ url: "https://nagrania.atrapa.test/lista.m3u8", embed_url: ADRES_RAMKI, embed_expires_at: WYGASA }),
    ),
  );
  await page.route(`${POCHODZENIE_ODTWARZACZA}/**`, (route) => {
    licznik.atrapa += 1;
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: ATRAPA_RAMKI });
  });
  page.on("requestfailed", (zadanie) => {
    if (zadanie.url().startsWith(POCHODZENIE_ODTWARZACZA)) licznik.nieudane += 1;
  });
  await page.route("**/api/auth/session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }));
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json({ url: null })));
  return licznik;
}

async function otworz(page: Page, id = 21, zapytanie = ""): Promise<void> {
  const odpowiedz = await page.goto(`/panel/lekcje/${id}${zapytanie}`);
  expect(odpowiedz?.status()).toBe(200);
  await zabezpieczeniePrzedEkranemDostepu(page);
  await expect(page.getByRole("heading", { level: 1, name: "Wprowadzenie do wywiadu" })).toBeVisible();
}

async function zrzut(page: Page, nazwa: string, szerokosc: number): Promise<void> {
  const katalog = process.env.PW_ZRZUTY;
  if (!katalog) return;
  mkdirSync(katalog, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: join(katalog, `uczestnik--lekcja-szkic--odtwarzacz--${nazwa}--${szerokosc}.png`),
    fullPage: true,
    animations: "disabled",
  });
}

const OKNA = [
  { szerokosc: 1280, wysokosc: 800 },
  { szerokosc: 390, wysokosc: 844 },
];

for (const { szerokosc, wysokosc } of OKNA) {
  test.describe(`ekran lekcji z odtwarzaczem w ramce — ${szerokosc} px`, () => {
    test.use({ viewport: { width: szerokosc, height: wysokosc } });

    test("z nagraniem: jedna ramka z dozwolonym adresem, zero żądań poza atrapę, zero zapisów po samym wejściu", async ({ page }) => {
      const licznik = await instalujAtrapy(page);
      await otworz(page);

      const ramka = page.locator("iframe");
      await expect(ramka).toHaveCount(1);
      await expect(ramka).toHaveAttribute("src", ADRES_RAMKI);
      await expect(ramka).toBeVisible();
      await expect.poll(() => licznik.atrapa).toBeGreaterThan(0);
      await page.waitForTimeout(500);
      expect(licznik.nieudane, "żądania do hosta ramki, które przeszły poza atrapę").toBe(0);
      expect(licznik.ukonczenie, "zapisy ukończenia po samym wejściu").toBe(0);
      await zrzut(page, "z-nagraniem", szerokosc);
    });

    test("podtytuły treści: wielkość akapitu i pogrubienie, tytuł karty większy, poziomy h2 i h3 bez zmiany", async ({ page }) => {
      await instalujAtrapy(page);
      await otworz(page);

      const tresc = page.getByRole("region", { name: "Treść lekcji" });
      const pomiar = await tresc.evaluate((sekcja) => {
        const styl = (element: Element) => {
          const s = getComputedStyle(element);
          return { rozmiar: parseFloat(s.fontSize), waga: Number(s.fontWeight) };
        };
        const tytulKarty = sekcja.querySelector(":scope > h2") as HTMLElement;
        const wTresci = Array.from(sekcja.querySelectorAll("h2, h3")).filter((h) => h !== tytulKarty);
        const akapit = Array.from(sekcja.querySelectorAll("p")).find((p) => (p.textContent ?? "").startsWith("Po tej lekcji"))!;
        return {
          tytulKarty: styl(tytulKarty),
          akapit: styl(akapit),
          podtytuly: wTresci.map((h) => ({ znacznik: h.tagName, ...styl(h) })),
        };
      });
      expect(pomiar.podtytuly.map((p) => p.znacznik)).toEqual(["H2", "H3", "H2"]);
      for (const podtytul of pomiar.podtytuly) {
        expect(podtytul.rozmiar).toBe(pomiar.akapit.rozmiar);
        expect(podtytul.waga).toBeGreaterThanOrEqual(700);
      }
      expect(pomiar.tytulKarty.rozmiar).toBeGreaterThan(pomiar.akapit.rozmiar);
      await zrzut(page, "tresc-podtytuly", szerokosc);
    });

    test("nagranie w przygotowaniu: komunikat, bez ramki, zero żądań do hosta ramki", async ({ page }) => {
      const licznik = await instalujAtrapy(page, { video_status: "processing", linkNagrania: "w-przygotowaniu" });
      await otworz(page);

      await expect(page.getByText("Nagranie jest w przygotowaniu.", { exact: true })).toBeVisible();
      await expect(page.locator("iframe")).toHaveCount(0);
      expect(licznik.atrapa, "żądania do hosta ramki").toBe(0);
      expect(licznik.nieudane).toBe(0);
      await zrzut(page, "w-przygotowaniu", szerokosc);
    });

    test("menu: na adresie lekcji pozycja „Kursy” jest bieżąca, na zwykłym ekranie, karcie „lekcja zamknięta” i „dostęp wygasł”", async ({ page }) => {
      // Na wąskim ekranie menu jest w szufladzie: przed odczytem pozycji bieżącej szuflada się otwiera, po odczycie zamyka.
      const biezace = async () => {
        const waski = (page.viewportSize()?.width ?? 1280) < 1024;
        if (waski) await page.getByRole("button", { name: "Menu", exact: true }).click();
        const nav = (waski ? page.getByRole("dialog", { name: "Menu i konto" }) : page).getByRole("navigation", { name: "Menu — Panel uczestnika" });
        const wynik = await nav.locator("a[aria-current]").allTextContents();
        if (waski) await page.keyboard.press("Escape");
        return wynik;
      };

      await instalujAtrapy(page);
      await otworz(page);
      expect(await biezace()).toEqual(["Kursy"]);

      await page.unroute(`${API}/lessons/21`);
      await page.route(`${API}/lessons/21`, (route) =>
        route.fulfill(odmowa(403, "lesson_locked", "Ukończ najpierw poprzednią lekcję.", { required_lesson_id: 20 })),
      );
      await page.goto("/panel/lekcje/21");
      await expect(page.getByRole("heading", { level: 1, name: /Najpierw ukończ lekcję|jeszcze zamknięta/ })).toBeVisible();
      expect(await biezace()).toEqual(["Kursy"]);

      await page.unroute(`${API}/lessons/21`);
      await page.route(`${API}/lessons/21`, (route) => route.fulfill(odmowa(403, "access_expired", "Twój dostęp do platformy wygasł.")));
      await page.addInitScript(() => {
        const nawigacja = (window as unknown as { navigation?: EventTarget }).navigation;
        nawigacja?.addEventListener("navigate", (zdarzenie) => {
          const cel = (zdarzenie as unknown as { destination: { url: string } }).destination.url;
          if (cel.includes("/dostep-wygasl")) zdarzenie.preventDefault();
        });
      });
      await page.goto("/panel/lekcje/21");
      await expect(page.getByRole("heading", { level: 1, name: "Twój dostęp wygasł." })).toBeVisible();
      expect(await biezace()).toEqual(["Kursy"]);
    });
  });
}
