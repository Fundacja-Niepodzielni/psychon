import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Miara dla gałęzi świadka: grupa przełączenia `wspolpraca`
 * (`lib/przelaczenie/grupy.ts`) ma tu `wlaczona: true`.
 *
 * Sprawdzane w jednym pliku:
 * - nowa trasa produktu grupy jest osiągalna z menu roli (uczestnik i
 *   administracja), z atrapą API przez `page.route` i atrapą sesji (bez
 *   prawdziwego IdP — `getToken()` w `lib/api/klient.ts` czyta
 *   `/api/auth/session`, którą tu podstawiamy);
 * - stara trasa uczestnika (`/panel/po-programie`) odpowiada
 *   przekierowaniem (kod HTTP 307/308 i nagłówek `Location`) — mierzone
 *   bez sesji, bo strażnik przełączenia w Server Component
 *   (`app/(uczestnik)/panel/po-programie/page.tsx`) działa niezależnie od
 *   roli/tokenu;
 * - zero odpowiedzi 404 w całym przebiegu każdego scenariusza.
 *
 * Backend nie jest tu stawiany — `NEXT_PUBLIC_API_URL` w tej zbudowanej
 * aplikacji wskazuje domyślnie `http://localhost:8000` (patrz `baseUrl()`
 * w `lib/api/klient.ts`), więc każde żądanie `/api/v1/*` musi mieć atrapę,
 * inaczej kończy się błędem połączenia (nie 404) i zawiesza test.
 */

const ATRAPA_SESJI = {
  accessToken: "atrapa-tokenu-testowego",
  expiresAt: Date.now() + 3_600_000,
};

const PUSTA_LISTA_STRONICOWANA = {
  data: [],
  meta: { current_page: 1, per_page: 25, total: 0, last_page: 1 },
};

/**
 * Atrapy API dla jednej roli: sesja Auth.js, `/me` (rola gałęzi
 * `lib/przelaczenie/grupy.ts`) i dwie listy zgłoszeń współpracy — reszta
 * `/api/v1/*` dostaje ogólną atrapę (rejestrowaną PRZED trasami
 * szczegółowymi — Playwright wybiera trasę zarejestrowaną PÓŹNIEJ jako
 * pierwszą, więc kolejność rejestracji niżej jest częścią zachowania, nie
 * tylko porządkiem czytania).
 */
async function instalujAtrapyApi(page: Page, rola: string): Promise<void> {
  await page.route("http://localhost:8000/api/v1/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    }),
  );

  await page.route("http://localhost:8000/api/v1/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: { id: 1, role: rola, program_completed_at: "2026-01-15T00:00:00Z" },
      }),
    }),
  );

  await page.route("http://localhost:8000/api/v1/cooperation-requests/mine**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(PUSTA_LISTA_STRONICOWANA),
    }),
  );

  await page.route("http://localhost:8000/api/v1/admin/cooperation-requests**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(PUSTA_LISTA_STRONICOWANA),
    }),
  );

  // Ekran startowy uczestnika (`/panel/start`) i pulpit administracji
  // (`/admin`) — trasy, przez które przechodzimy do menu — wołają też te
  // dwie: bez atrapy o poprawnym kształcie obiektu (nie listy z ogólnej
  // atrapy niżej) render rzuca wyjątek i cała strona (łącznie z nawigacją)
  // znika pod granicą błędu w `app/error.tsx`.
  await page.route("http://localhost:8000/api/v1/onboarding", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          video: { title: "", url: null, caption: null },
          program: { title: "", body: "" },
          expectations: { title: "", body: "" },
          updated_at: null,
        },
      }),
    }),
  );

  await page.route("http://localhost:8000/api/v1/admin/dashboard", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          counters: { participants: 0, completed: 0, certificates: 0 },
          queues: [],
        },
      }),
    }),
  );

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(ATRAPA_SESJI),
    }),
  );

  await page.route("**/api/auth/end-session-url", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { url: null } }),
    }),
  );
}

test.describe("grupa przełączenia wspolpraca — nowa trasa osiągalna z menu, stara przekierowuje", () => {
  test("uczestnik (wolontariuszka): wpis „Po programie” prowadzi na nową trasę; stara trasa przekierowuje; 0 odpowiedzi 404", async ({
    page,
  }) => {
    const kody404: string[] = [];
    page.on("response", (res) => {
      if (res.status() === 404) kody404.push(res.url());
    });

    await instalujAtrapyApi(page, "volunteer");

    await page.goto("/panel/start");
    await zabezpieczeniePrzedEkranemDostepu(page);

    const nav = page.getByRole("navigation", { name: "Menu — Panel uczestnika" }).first();
    const link = nav.getByRole("link", { name: "Po programie" });
    await expect(link).toHaveAttribute("href", "/panel/dalsza-wspolpraca");

    await link.click();
    await expect(page).toHaveURL(/\/panel\/dalsza-wspolpraca$/);
    await expect(page.getByText("Dalsza współpraca").first()).toBeVisible();

    // Stara trasa: bezpośrednie żądanie HTTP (bez sesji — strażnik
    // przełączenia w page.tsx nie sprawdza roli/tokenu, tylko stan grupy).
    const staraTrasa = await page.request.get("/panel/po-programie", { maxRedirects: 0 });
    expect([307, 308]).toContain(staraTrasa.status());
    expect(staraTrasa.headers()["location"] ?? "").toContain("/panel/dalsza-wspolpraca");

    expect(kody404, `odpowiedzi 404: ${kody404.join(", ")}`).toEqual([]);
  });

  test("administracja (opiekun projektu): wpis „Zgłoszenia współpracy” prowadzi na nową trasę; 0 odpowiedzi 404", async ({
    page,
  }) => {
    const kody404: string[] = [];
    page.on("response", (res) => {
      if (res.status() === 404) kody404.push(res.url());
    });

    await instalujAtrapyApi(page, "project_manager");

    await page.goto("/admin");
    await zabezpieczeniePrzedEkranemDostepu(page);

    const nav = page.getByRole("navigation", { name: "Menu — Administracja" }).first();
    const link = nav.getByRole("link", { name: "Zgłoszenia współpracy" });
    await expect(link).toHaveAttribute("href", "/admin/zgloszenia-wspolpracy");

    await link.click();
    await expect(page).toHaveURL(/\/admin\/zgloszenia-wspolpracy$/);
    await expect(page.getByText("Zgłoszenia dalszej współpracy").first()).toBeVisible();

    expect(kody404, `odpowiedzi 404: ${kody404.join(", ")}`).toEqual([]);
  });
});
