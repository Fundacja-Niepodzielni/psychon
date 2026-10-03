import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";

/**
 * Wspólne atrapy i miary dwóch scenariuszy webinaru (ekran webinaru pod
 * `/panel/kursy/[slug]` i karta webinaru na pulpicie `/panel/pulpit`): atrapa
 * sesji Auth.js, atrapy API w kształcie kontraktu, stały zegar przeglądarki,
 * brak przewijania w poziomie, cele dotyku i axe. Dane przykładowe, bez
 * prawdziwych osób; adres transmisji z domeny zastrzeżonej dla przykładów.
 */

export const API = "http://localhost:8000/api/v1";
export const SLUG_WEBINARU = "webinar-o-kryzysie";
export const ADRES_TRANSMISJI = "https://transmisja.example.org/webinar/42";
const STRONA = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

/** Początek i koniec okna obecności: czwartek 5.11.2026, 18:00 w Warszawie, północ po nim. */
export const POCZATEK = "2026-11-05T17:00:00Z";
export const KONIEC_OKNA = "2026-11-05T23:00:00Z";

/** Chwile, w których przeglądarka „jest” w danym oknie. */
export const CZAS = {
  przed: "2026-11-05T12:00:00Z",
  otwarte: "2026-11-05T17:30:00Z",
  zamkniete: "2026-11-06T09:00:00Z",
} as const;

export const OKNA = [
  { szerokosc: 1280, wysokosc: 800 },
  { szerokosc: 390, wysokosc: 844 },
  { szerokosc: 320, wysokosc: 700 },
];

export function json(dane: unknown, status = 200, meta?: unknown) {
  return { status, contentType: "application/json", body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }) };
}

export function blad(status: number, code: string, message: string, reason?: unknown) {
  return { status, contentType: "application/json", body: JSON.stringify({ error: { status, code, message, ...(reason ? { reason } : {}) } }) };
}

type Okno = "before" | "open" | "closed";

export interface OpcjeOdczytu {
  okno: Okno;
  attendedAt?: string | null;
  recordingLessonId?: number | null;
  ukonczony?: boolean;
  streamUrl?: string | null;
  tytul?: string;
}

/** Odczyt webinaru `GET /courses/{slug}` w kształcie kontraktu. */
export function odczytWebinaru({ okno, attendedAt = null, recordingLessonId = null, ukonczony = false, streamUrl = ADRES_TRANSMISJI, tytul = "Webinar: rozmowa w kryzysie" }: OpcjeOdczytu) {
  return {
    id: 12,
    slug: SLUG_WEBINARU,
    title: tytul,
    description: "Spotkanie na żywo z prowadzącą o tym, jak rozmawiać z osobą w kryzysie.",
    sequence_order: 2,
    product_group: "psychon",
    type: "webinar",
    status: ukonczony ? "completed" : "in_progress",
    progress_percent: ukonczony ? 100 : 0,
    instructor: null,
    starts_at: POCZATEK,
    stream_url: streamUrl,
    attendance_window: okno,
    attendance_closes_at: KONIEC_OKNA,
    attended_at: attendedAt,
    recording_lesson_id: recordingLessonId,
    topics: [],
    lessons:
      recordingLessonId === null
        ? []
        : [
            {
              id: recordingLessonId,
              title: "Nagranie webinaru",
              sequence_order: 1,
              duration_seconds: 3600,
              is_completed: ukonczony,
              topic_id: null,
              locked: false,
              active_seconds: 0,
              required_active_seconds: 2880,
              has_recording: true,
            },
          ],
    materials: [],
    has_test: false,
    test_locked: false,
    test_passed: false,
  };
}

export async function odpowiedz(page: Page, wzorzec: string, cialo: unknown): Promise<void> {
  await page.route(wzorzec, (route) => route.fulfill(json(cialo)));
}

/** Atrapa sesji Auth.js; ogólna atrapa API idzie PRZED szczegółowymi (późniejsza trasa wygrywa). */
export async function instalujOgolne(page: Page, rola = "volunteer"): Promise<void> {
  await page.route(`${API}/**`, (route) => route.fulfill(json([], 200, STRONA)));
  await page.route(`${API}/me`, (route) => route.fulfill(json({ id: 17, role: rola, first_name: "Anna", last_name: "Kowalczyk", program_completed_at: null })));
  await page.route(`${API}/notifications**`, (route) => route.fulfill(json([], 200, { ...STRONA, extra: { unread: 0 } })));
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ accessToken: "atrapa-tokenu-testowego", expiresAt: Date.now() + 3_600_000 }) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json({ url: null })));
}

/** Stały zegar przeglądarki: okno obecności zależy od bieżącej chwili. */
export async function ustawZegar(page: Page, iso: string): Promise<void> {
  await page.clock.setFixedTime(new Date(iso));
}

export async function otworz(page: Page, adres: string): Promise<void> {
  const odpowiedzSerwera = await page.goto(adres);
  expect(odpowiedzSerwera?.status()).toBe(200);
  await zabezpieczeniePrzedEkranemDostepu(page);
}

/** Brak przewijania w poziomie; przy błędzie komunikat wskazuje elementy wystające poza okno. */
export async function sprawdzPrzewijanie(page: Page): Promise<void> {
  const przewijanie = await page.evaluate(() => {
    const szerokoscOkna = document.documentElement.clientWidth;
    const wystajace = Array.from(document.querySelectorAll<HTMLElement>("main *"))
      .filter((element) => element.getBoundingClientRect().right > szerokoscOkna + 1)
      .slice(0, 8)
      .map((element) => `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 40)}`);
    return { nadmiar: document.documentElement.scrollWidth - szerokoscOkna, wystajace };
  });
  expect(przewijanie.nadmiar, `przewijanie poziome: ${przewijanie.wystajace.join(", ")}`).toBeLessThanOrEqual(0);
}

/** Cele dotyku: każdy widoczny element czynny w treści ma co najmniej 44 x 44 px. */
export async function celeDotyku(page: Page): Promise<{ zmierzone: number; zaMale: { nazwa: string; wysokosc: number; szerokosc: number }[] }> {
  return page.evaluate(() => {
    const cele = Array.from(document.querySelectorAll<HTMLElement>("main a[href], main button, main [role='button']")).filter(
      (element) => element.getClientRects().length > 0,
    );
    const zaMale = cele
      .map((element) => {
        const ramka = element.getBoundingClientRect();
        return {
          nazwa: (element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 60),
          wysokosc: Math.round(ramka.height * 10) / 10,
          szerokosc: Math.round(ramka.width * 10) / 10,
        };
      })
      .filter((cel) => cel.wysokosc < 44 || cel.szerokosc < 44);
    return { zmierzone: cele.length, zaMale };
  });
}

export async function sprawdzAxe(page: Page, testInfo: TestInfo, nazwa: string): Promise<void> {
  const naruszenia = await uruchomAxe(page);
  await dolaczNaruszeniaDoRaportu(testInfo, nazwa, naruszenia);
  expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);
  const pelny = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "best-practice"]).analyze();
  expect(
    pelny.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.map(String).join(" ")).join(" | ")}`),
    `axe z best-practice: ${nazwa}`,
  ).toEqual([]);
}

/** Wspólne miary strony: jeden `main`, jeden `h1`, brak przewijania w bok, cele dotyku, axe. */
export async function sprawdzMiaryStrony(page: Page, testInfo: TestInfo, nazwa: string): Promise<void> {
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCount(1);
  await sprawdzPrzewijanie(page);
  const cele = await celeDotyku(page);
  expect(cele.zmierzone).toBeGreaterThanOrEqual(1);
  expect(cele.zaMale, "cele dotyku poniżej 44 px").toEqual([]);
  await sprawdzAxe(page, testInfo, nazwa);
}
