import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Górny pasek nowej ramki (`PowlokaPanelu`) na wąskim ekranie: przy 320 px
 * i 390 px nic w pasku nie wystaje poza okno, strona nie przewija się
 * w poziomie, a dzwonek powiadomień i przycisk pomocy zostają celami dotyku
 * co najmniej 44 × 44 px w całości w oknie. 1280 px — kontrola, że szeroki
 * układ się nie zmienił.
 *
 * Zbudowana aplikacja, atrapa API przez `page.route` i atrapa sesji (jak
 * w `ramka-uczestnika.spec.ts`). Trzy ramki: uczestnik (`/panel/pulpit`,
 * pasek bez roku programu), prowadzący (`/prowadzacy`) i administracja
 * (`/admin`, pasek z rokiem programu — najdłuższy napis w pasku).
 *
 * Zrzuty ekranu powstają tylko przy ustawionej zmiennej `PW_ZRZUTY_PASKA`:
 * wzór ścieżki z polami `{ekran}` i `{szerokosc}`.
 */

const API = "http://localhost:8000/api/v1";

const ATRAPA_SESJI = {
  accessToken: "atrapa-tokenu-testowego",
  expiresAt: Date.now() + 3_600_000,
};

const META = { current_page: 1, per_page: 25, total: 0, last_page: 1 };

function odpowiedz(dane: unknown, meta?: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }) };
}

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
};

const KURS = {
  id: 2,
  slug: "wywiad-psychologiczny",
  title: "Wywiad psychologiczny",
  sequence_order: 2,
  product_group: "psychon",
  status: "in_progress",
  progress_percent: 40,
};

interface Ekran {
  nazwa: string;
  adres: string;
  konto: Record<string, unknown>;
}

const EKRANY: Ekran[] = [
  {
    nazwa: "pulpit-uczestnika",
    adres: "/panel/pulpit",
    konto: { id: 17, role: "volunteer", first_name: "Marta", last_name: "Demo", program_completed_at: "2026-09-15T00:00:00Z" },
  },
  {
    nazwa: "pulpit-prowadzacego",
    adres: "/prowadzacy",
    konto: { id: 5, role: "instructor", first_name: "Joanna", last_name: "Demo" },
  },
  {
    nazwa: "pulpit-administracji",
    adres: "/admin",
    konto: { id: 1, role: "project_manager", first_name: "Opiekun", last_name: "Demo", program_completed_at: null },
  },
];

const SZEROKOSCI = [320, 390, 1280] as const;

/** Ogólna atrapa jest rejestrowana PIERWSZA — Playwright wybiera trasę zarejestrowaną PÓŹNIEJ jako pierwszą. */
async function instalujAtrapyApi(page: Page, konto: Record<string, unknown>): Promise<void> {
  await page.route(`${API}/**`, (route) => route.fulfill(odpowiedz([], META)));
  await page.route(`${API}/me`, (route) => route.fulfill(odpowiedz(konto)));
  await page.route(`${API}/notifications**`, (route) => route.fulfill(odpowiedz([], { ...META, extra: { unread: 3 } })));
  await page.route(`${API}/admin/edition`, (route) => route.fulfill(odpowiedz(EDYCJA)));
  await page.route(`${API}/admin/dashboard`, (route) =>
    route.fulfill(odpowiedz({ counters: { participants: 0, completed: 0, certificates: 0 }, queues: [] })),
  );
  await page.route(`${API}/instructor/group`, (route) => route.fulfill(odpowiedz({ members: [], slots: [] })));
  await page.route(`${API}/instructor/questions**`, (route) => route.fulfill(odpowiedz([], { ...META, extra: { unanswered: 0 } })));
  // Pulpit uczestnika: te same atrapy co w `ramka-uczestnika.spec.ts`.
  await page.route(`${API}/courses`, (route) => route.fulfill(odpowiedz([KURS])));
  await page.route(`${API}/courses/${KURS.slug}`, (route) =>
    route.fulfill(odpowiedz({ ...KURS, lessons: [{ id: 21, title: "Wprowadzenie do wywiadu", sequence_order: 1, is_completed: false }] })),
  );
  await page.route(`${API}/certificate/conditions`, (route) => route.fulfill(odpowiedz({ eligible: false, conditions: [] })));
  await page.route(`${API}/internship/entries**`, (route) =>
    route.fulfill(odpowiedz([], { ...META, extra: { accepted_hours: "10", required_hours: "72" } })),
  );
  await page.route(`${API}/supervision/slots**`, (route) => route.fulfill(odpowiedz([], META)));
  await page.route(`${API}/cooperation-requests/mine**`, (route) => route.fulfill(odpowiedz([], META)));
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(odpowiedz({ url: null })));
}

interface Prostokat {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

async function zmierzPasek(page: Page) {
  return page.evaluate(() => {
    const prostokat = (el: Element | null): Prostokat | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    // Górny pasek ramki: nagłówek z napisem programu (ekran pod ramką może mieć własny `header`).
    const pasek = document.querySelector("[data-powloka-panelu] [data-pasek-programu]")?.closest("header") ?? null;
    const okno = window.innerWidth;
    // Każdy widoczny element paska, który wychodzi poza okno w poziomie (z tolerancją pół piksela).
    const wystajace = Array.from(pasek?.querySelectorAll("*") ?? [])
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0 && (r.left < -0.5 || r.right > okno + 0.5))
      .map(({ el, r }) => `${el.tagName.toLowerCase()}[${el.getAttribute("aria-label") ?? el.className}] ${Math.round(r.left)}..${Math.round(r.right)}`);
    // Prawa krawędź treści elementu (napis może wyjść poza własne pudełko, gdy pudełko się skurczy).
    const prawaTresci = (el: Element | null): number => {
      if (!el) return 0;
      const zakres = document.createRange();
      zakres.selectNodeContents(el);
      return Math.max(el.getBoundingClientRect().right, ...Array.from(zakres.getClientRects()).map((r) => r.right));
    };
    const dzieci = Array.from(pasek?.children ?? []).filter((el) => el.getBoundingClientRect().width > 0);
    const narzedzia = pasek?.querySelector('button[aria-label="Pomoc"]')?.closest("header > *") ?? null;
    // Kolejne widoczne elementy paska (menu, napis programu, narzędzia) nie nachodzą na siebie.
    const nachodzace: string[] = [];
    for (let i = 0; i + 1 < dzieci.length; i += 1) {
      const prawa = prawaTresci(dzieci[i]);
      const lewaNastepnego = dzieci[i + 1].getBoundingClientRect().left;
      if (prawa > lewaNastepnego + 0.5) nachodzace.push(`${i}: ${Math.round(prawa)} > ${Math.round(lewaNastepnego)}`);
    }
    return {
      okno,
      scrollWidth: document.documentElement.scrollWidth,
      nachodzace,
      narzedzia: prostokat(narzedzia),
      dzwonek: prostokat(pasek?.querySelector('button[aria-label^="Powiadomienia"]') ?? null),
      pomoc: prostokat(pasek?.querySelector('button[aria-label="Pomoc"]') ?? null),
      wystajace,
    };
  });
}

function wOknie(r: Prostokat | null, okno: number): boolean {
  return r !== null && r.left >= 0 && r.right <= okno && r.top >= 0;
}

test.describe("górny pasek nowej ramki na wąskim ekranie — dzwonek w oknie, bez przewijania w poziomie", () => {
  for (const ekran of EKRANY) {
    for (const szerokosc of SZEROKOSCI) {
      test(`${ekran.adres} @${szerokosc}: dzwonek i pomoc w oknie, cele >= 44 px, scrollWidth <= innerWidth`, async ({ page }) => {
        await page.setViewportSize({ width: szerokosc, height: szerokosc >= 1024 ? 900 : 844 });
        await instalujAtrapyApi(page, ekran.konto);

        const odpowiedzStrony = await page.goto(ekran.adres);
        await zabezpieczeniePrzedEkranemDostepu(page);
        expect(odpowiedzStrony?.status()).toBe(200);
        await expect(page.locator("[data-powloka-panelu]")).toHaveCount(1);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const dzwonek = page.locator("[data-powloka-panelu] header", { has: page.locator("[data-pasek-programu]") }).getByRole("button", { name: "Powiadomienia, 3 nieprzeczytanych" });
        await expect(dzwonek).toBeVisible();
        // Ekran wczytany bez błędu aplikacji (pomiar paska tylko na żywej ramce).
        await page.waitForLoadState("networkidle");
        await expect(page.getByRole("heading", { name: "Coś poszło nie tak" })).toHaveCount(0);

        const pomiar = await zmierzPasek(page);
        console.log(`POMIAR-PASKA ${ekran.adres} @${szerokosc} ${JSON.stringify(pomiar)}`);

        const wzor = process.env.PW_ZRZUTY_PASKA;
        if (wzor) {
          await page.screenshot({ path: wzor.replace("{ekran}", ekran.nazwa).replace("{szerokosc}", String(szerokosc)) });
        }

        expect(pomiar.scrollWidth, "scrollWidth <= innerWidth").toBeLessThanOrEqual(pomiar.okno);
        expect(pomiar.wystajace, "elementy paska poza oknem").toEqual([]);
        expect(pomiar.nachodzace, "elementy paska nachodzą na siebie").toEqual([]);
        expect(wOknie(pomiar.dzwonek, pomiar.okno), `dzwonek w oknie: ${JSON.stringify(pomiar.dzwonek)}`).toBe(true);
        expect(wOknie(pomiar.pomoc, pomiar.okno), `pomoc w oknie: ${JSON.stringify(pomiar.pomoc)}`).toBe(true);
        expect(pomiar.dzwonek?.width ?? 0, "szerokość dzwonka").toBeGreaterThanOrEqual(44);
        expect(pomiar.dzwonek?.height ?? 0, "wysokość dzwonka").toBeGreaterThanOrEqual(44);
        expect(pomiar.pomoc?.width ?? 0, "szerokość przycisku pomocy").toBeGreaterThanOrEqual(44);
        expect(pomiar.pomoc?.height ?? 0, "wysokość przycisku pomocy").toBeGreaterThanOrEqual(44);
      });
    }
  }
});
