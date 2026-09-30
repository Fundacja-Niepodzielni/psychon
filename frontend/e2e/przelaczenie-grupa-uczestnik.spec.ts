import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Miara dla grup przełączenia `pulpitUczestnika` (`wlaczona: true`) i `lekcja`
 * (`wlaczona: false`) z `lib/przelaczenie/grupy.ts`. Adres obu tras się nie
 * zmienia — zmienia się treść strony — więc sprawdzane jest to, co widzi
 * osoba w przeglądarce:
 * - wpis „Pulpit” w menu uczestnika prowadzi na `/panel/pulpit`, a tam stoi
 *   ekran nowego frontu (lista „Twoja ścieżka”), nie stary „Mapa rozwoju”;
 * - `/panel/lekcje/[id]` pokazuje STARĄ stronę lekcji (grupa `lekcja` jest
 *   wyłączona): `h1` „Lekcja”, odnośnik „Wróć do listy kursów” i „Aktywny
 *   czas:” — a nie ekran lekcji nowego frontu (`h1` z tytułem lekcji, przycisk
 *   „Oznacz jako ukończoną”);
 * - obie trasy odpowiadają 200 (bez przekierowania), a w całym przebiegu nie
 *   ma odpowiedzi 404 poza celowym niepoprawnym identyfikatorem lekcji;
 * - na każdej trasie dokładnie jeden `main` i jeden `#tresc`.
 *
 * API jest atrapą (`page.route`), sesja Auth.js też — bez prawdziwego IdP
 * (`getToken()` w `lib/api/klient.ts` czyta `/api/auth/session`).
 */

const ATRAPA_SESJI = {
  accessToken: "atrapa-tokenu-testowego",
  expiresAt: Date.now() + 3_600_000,
};

const STRONA = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

const KURS = {
  id: 2,
  slug: "wywiad-psychologiczny",
  title: "Wywiad psychologiczny",
  sequence_order: 2,
  product_group: "psychon",
  status: "in_progress",
  progress_percent: 40,
};

const LEKCJA = {
  id: 21,
  title: "Wprowadzenie do wywiadu",
  description: "Opis lekcji z atrapy",
  content: null,
  topic: null,
  duration_seconds: 1800,
  position_seconds: 0,
  watched_seconds: 812,
  active_seconds: 700,
  is_completed: false,
  completable: false,
  completable_at_percent: 60,
};

async function odpowiedz(page: Page, wzorzec: string, cialo: unknown, status = 200): Promise<void> {
  await page.route(wzorzec, (route) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(cialo) }),
  );
}

/**
 * Atrapy API wolontariuszki. Ogólna atrapa jest rejestrowana PRZED trasami
 * szczegółowymi — Playwright wybiera trasę zarejestrowaną PÓŹNIEJ jako
 * pierwszą, więc kolejność rejestracji jest częścią zachowania.
 */
async function instalujAtrapyApi(page: Page): Promise<void> {
  const api = "http://localhost:8000/api/v1";
  await odpowiedz(page, `${api}/**`, { data: [], meta: STRONA });
  await odpowiedz(page, `${api}/me`, {
    data: { id: 1, role: "volunteer", first_name: "Marta", program_completed_at: null },
  });
  await odpowiedz(page, `${api}/courses`, { data: [KURS] });
  await odpowiedz(page, `${api}/courses/${KURS.slug}`, {
    data: { ...KURS, lessons: [{ id: 21, title: LEKCJA.title, sequence_order: 1, is_completed: false }] },
  });
  await odpowiedz(page, `${api}/certificate/conditions`, { data: { eligible: false, conditions: [] } });
  await odpowiedz(page, `${api}/internship/entries**`, {
    data: [],
    meta: { ...STRONA, extra: { accepted_hours: "10", required_hours: "72" } },
  });
  await odpowiedz(page, `${api}/supervision/slots**`, { data: [], meta: STRONA });
  await odpowiedz(page, `${api}/notifications**`, { data: [], meta: { ...STRONA, extra: { unread: 0 } } });
  await odpowiedz(page, `${api}/lessons/21`, { data: LEKCJA });
  await odpowiedz(page, `${api}/lessons/21/video-link`, { data: { url: "https://example.test/nagranie" } });
  await odpowiedz(page, `${api}/onboarding`, {
    data: {
      video: { title: "", url: null, caption: null },
      program: { title: "", body: "" },
      expectations: { title: "", body: "" },
      updated_at: null,
    },
  });
  await odpowiedz(page, "**/api/auth/session", ATRAPA_SESJI);
  await odpowiedz(page, "**/api/auth/end-session-url", { data: { url: null } });
}

function zbierz404(page: Page): string[] {
  const kody404: string[] = [];
  page.on("response", (res) => {
    if (res.status() === 404) kody404.push(res.url());
  });
  return kody404;
}

test.describe("grupy przełączenia: pulpitUczestnika włączona (treść nowego frontu), lekcja wyłączona (stara strona) — ten sam adres", () => {
  test("pulpit: wpis „Pulpit” w menu prowadzi na /panel/pulpit, tam stoi ekran nowego frontu, jeden main; 0 odpowiedzi 404", async ({
    page,
  }) => {
    const kody404 = zbierz404(page);
    await instalujAtrapyApi(page);

    await page.goto("/panel/start");
    await zabezpieczeniePrzedEkranemDostepu(page);

    const nav = page.getByRole("navigation", { name: "Menu — Panel uczestnika" }).first();
    const link = nav.getByRole("link", { name: "Pulpit" });
    await expect(link).toHaveAttribute("href", "/panel/pulpit");

    await link.click();
    await expect(page).toHaveURL(/\/panel\/pulpit$/);
    await expect(page.getByText("Twoja ścieżka").first()).toBeVisible();
    await expect(page.getByText("Wywiad psychologiczny").first()).toBeVisible();
    await expect(page.getByText("Mapa rozwoju")).toHaveCount(0);

    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("#tresc")).toHaveCount(1);

    expect(kody404, `odpowiedzi 404: ${kody404.join(", ")}`).toEqual([]);
  });

  test("lekcja: /panel/lekcje/21 pokazuje starą stronę lekcji (grupa wyłączona), bez elementów nowego ekranu, jeden main; 0 odpowiedzi 404", async ({
    page,
  }) => {
    const kody404 = zbierz404(page);
    await instalujAtrapyApi(page);

    await page.goto("/panel/lekcje/21");
    await zabezpieczeniePrzedEkranemDostepu(page);

    // Stara strona: `h1` „Lekcja” i odnośnik powrotu (`StaraTresc.tsx`),
    // „Aktywny czas:” (`components/lesson/LessonPlayer.tsx`).
    await expect(page.getByRole("heading", { level: 1, name: "Lekcja", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Wróć do listy kursów" })).toBeVisible();
    await expect(page.getByText("Aktywny czas:")).toBeVisible();

    // Nowy ekran: `h1` z tytułem lekcji i przycisk „Oznacz jako ukończoną”
    // (`nowy-front/lekcja/Lekcja.tsx`) — przy wyłączonej grupie ich nie ma.
    await expect(page.getByRole("heading", { level: 1, name: LEKCJA.title })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Oznacz jako ukończoną" })).toHaveCount(0);

    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("#tresc")).toHaveCount(1);

    expect(kody404, `odpowiedzi 404: ${kody404.join(", ")}`).toEqual([]);
  });

  test("adres się nie zmienia: obie trasy odpowiadają 200 bez przekierowania, niepoprawny identyfikator lekcji daje 404", async ({
    page,
  }) => {
    const pulpit = await page.request.get("/panel/pulpit", { maxRedirects: 0 });
    expect(pulpit.status()).toBe(200);

    const lekcja = await page.request.get("/panel/lekcje/21", { maxRedirects: 0 });
    expect(lekcja.status()).toBe(200);

    const niepoprawna = await page.request.get("/panel/lekcje/abc", { maxRedirects: 0 });
    expect(niepoprawna.status()).toBe(404);
  });
});
