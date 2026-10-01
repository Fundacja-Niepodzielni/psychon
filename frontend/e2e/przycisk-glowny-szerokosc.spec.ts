import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Miara przycisku głównego w nagłówku ekranów (makieta 2.0.4, `.head .acts`):
 * - 1280 px: przycisk stoi w nagłówku na wysokości h1 (różnica top ≤ 12 px),
 *   jego prawa krawędź jest ≤ 2 px od prawej krawędzi nagłówka, a szerokość
 *   wynika z treści (tyle, ile zajmie sama etykieta z paddingiem, najwyżej
 *   320 px) — nie jest stałą;
 * - 390 px: przycisk ma szerokość nagłówka (±2 px) i stoi pod opisem;
 * - na ekranie jest dokładnie jeden przycisk w kolorze;
 * - szerokość zależy od etykiety: dwie etykiety różnej długości na tym samym
 *   ekranie dają dwie różne szerokości (1280 px);
 * - kolejność nagłówków na pulpitach: axe `heading-order` daje 0 naruszeń.
 *
 * Atrapy API i sesji jak w `pulpity-slownik-390.spec.ts` (grupy przełączenia
 * włączone w `lib/przelaczenie/grupy.ts`). Zrzuty ekranu powstają tylko, gdy
 * ustawiono `PW_ZRZUTY` (katalog docelowy) — wyłącznie do oglądania.
 */

const ATRAPA_SESJI = { accessToken: "atrapa-tokenu-testowego", expiresAt: Date.now() + 3_600_000 };
const API = "http://localhost:8000/api/v1";
const STRONA = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

const SZEROKI = { width: 1280, height: 800 };
const WASKI = { width: 390, height: 844 };

const KURSY = [
  {
    id: 1,
    slug: "podstawy-pomocy",
    title: "Podstawy pomocy psychologicznej",
    sequence_order: 1,
    product_group: "psychon",
    status: "completed",
    progress_percent: 100,
  },
  {
    id: 2,
    slug: "wywiad-psychologiczny",
    title: "Wywiad psychologiczny",
    sequence_order: 2,
    product_group: "psychon",
    status: "in_progress",
    progress_percent: 40,
  },
];

async function odpowiedz(page: Page, wzorzec: string, cialo: unknown): Promise<void> {
  await page.route(wzorzec, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cialo) }),
  );
}

async function instalujSesje(page: Page): Promise<void> {
  await odpowiedz(page, "**/api/auth/session", ATRAPA_SESJI);
  await odpowiedz(page, "**/api/auth/end-session-url", { data: { url: null } });
}

type Wariant = "domyslny" | "po-programie" | "bez-lekcji";

/** Ogólna atrapa jest rejestrowana PRZED szczegółowymi (późniejsza trasa wygrywa). */
async function atrapyUczestnika(page: Page, rola: "volunteer" | "student", wariant: Wariant): Promise<void> {
  const ukonczone = wariant === "bez-lekcji";
  await odpowiedz(page, `${API}/**`, { data: [], meta: STRONA });
  await odpowiedz(page, `${API}/me`, {
    data: {
      id: 1,
      role: rola,
      first_name: "Marta",
      program_completed_at: wariant === "po-programie" ? "2026-09-01T00:00:00Z" : null,
    },
  });
  await odpowiedz(page, `${API}/courses`, { data: KURSY });
  await odpowiedz(page, `${API}/courses/wywiad-psychologiczny`, {
    data: {
      ...KURSY[1],
      lessons: [{ id: 21, title: "Wprowadzenie do wywiadu", sequence_order: 1, is_completed: ukonczone }],
    },
  });
  await odpowiedz(page, `${API}/certificate/conditions`, {
    data: {
      eligible: false,
      conditions: [{ key: "supervision", label: "Obecności na superwizjach", done: 2, required: 6, met: false }],
    },
  });
  await odpowiedz(page, `${API}/internship/entries**`, {
    data: [],
    meta: { ...STRONA, extra: { accepted_hours: "41.5", required_hours: "72.5" } },
  });
  await instalujSesje(page);
}

async function atrapyProwadzacego(page: Page): Promise<void> {
  await odpowiedz(page, `${API}/**`, { data: [], meta: STRONA });
  await odpowiedz(page, `${API}/me`, { data: { id: 1, role: "instructor" } });
  await odpowiedz(page, `${API}/instructor/group`, {
    data: {
      members: [
        {
          id: 100,
          first_name: "Osoba",
          last_name: "Demo",
          progress: { courses_done: 2, courses_total: 10, hours_accepted: "41.5", supervision_present: 5, workshop_done: false },
        },
      ],
      slots: [],
    },
  });
  await odpowiedz(page, `${API}/instructor/questions**`, {
    data: [
      {
        id: 1,
        lesson_id: 21,
        question: "Jak zacząć rozmowę z osobą w kryzysie?",
        answer: null,
        answered_by: null,
        answered_by_name: null,
        answered_at: null,
        created_at: "2026-09-30T08:00:00Z",
        updated_at: "2026-09-30T08:00:00Z",
        user: { id: 17, first_name: "Marta", last_name: "Demo" },
        lesson: { id: 21, title: "Wprowadzenie do wywiadu", course: { id: 2, slug: "wywiad", title: "Wywiad psychologiczny" } },
      },
    ],
    meta: { ...STRONA, extra: { unanswered: 1 } },
  });
  await odpowiedz(page, `${API}/instructor/courses`, {
    data: [{ id: 5, slug: "wywiad", title: "Wywiad psychologiczny", sequence_order: 2 }],
  });
  await instalujSesje(page);
}

async function atrapyAdministracji(page: Page, bezSpraw = false): Promise<void> {
  await odpowiedz(page, `${API}/**`, { data: [], meta: STRONA });
  await odpowiedz(page, `${API}/me`, { data: { id: 1, role: "project_manager", first_name: "Anna" } });
  await odpowiedz(page, `${API}/admin/dashboard`, {
    data: {
      counters: { participants: 137, completed: 29, certificates: 23 },
      queues: bezSpraw
        ? [{ key: "applications", count: 0, link: "/admin/uczestniczki" }]
        : [
            { key: "applications", count: 4, link: "/admin/uczestniczki" },
            { key: "internship_entries", count: 7, link: "/admin/staz" },
          ],
    },
  });
  await instalujSesje(page);
}

const ZGLOSZENIE = {
  id: 11,
  edition_id: 1,
  first_name: "Kamil",
  last_name: "Demo",
  email: "kandydat11@demo.pl",
  phone: null,
  source: null,
  role: "volunteer",
  payload: null,
  university: null,
  graduation_year: null,
  status: "new",
  rejection_reason: null,
  decided_by: null,
  decided_at: null,
  user_id: null,
  has_diploma_scan: false,
  diploma_scan_url: null,
  created_at: "2026-09-20T10:00:00Z",
  updated_at: "2026-09-20T10:00:00Z",
};

/** Ekrany poligonu (`/nowy-front/admin/...`): grupy przełączenia tych ekranów są wyłączone, więc pod adresem poligonu. */
async function atrapySpraw(page: Page): Promise<void> {
  await odpowiedz(page, `${API}/**`, { data: [], meta: STRONA });
  await odpowiedz(page, `${API}/me`, { data: { id: 1, role: "project_manager", first_name: "Anna" } });
  await odpowiedz(page, `${API}/admin/applications**`, {
    data: [ZGLOSZENIE],
    meta: { current_page: 1, per_page: 100, total: 1, last_page: 1 },
  });
  await odpowiedz(page, `${API}/admin/internship/pending**`, {
    data: [{ id: 5, created_at: "2026-09-22T10:00:00Z", user: { id: 18, first_name: "Ola", last_name: "Demo" } }],
    meta: { current_page: 1, per_page: 100, total: 1, last_page: 1 },
  });
  await instalujSesje(page);
}

async function atrapyListyZgloszen(page: Page): Promise<void> {
  await odpowiedz(page, `${API}/**`, { data: [], meta: STRONA });
  await odpowiedz(page, `${API}/me`, { data: { id: 1, role: "project_manager", first_name: "Anna" } });
  await odpowiedz(page, `${API}/admin/applications**`, {
    data: [ZGLOSZENIE],
    meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 },
  });
  await instalujSesje(page);
}

async function atrapyKartyOsoby(page: Page): Promise<void> {
  await odpowiedz(page, `${API}/**`, { data: [], meta: STRONA });
  await odpowiedz(page, `${API}/me`, { data: { id: 1, role: "project_manager", first_name: "Anna" } });
  await odpowiedz(page, `${API}/admin/users/17`, {
    data: {
      profile: {
        id: 17,
        first_name: "Marta",
        last_name: "Demo",
        email: "marta@demo.pl",
        role: "volunteer",
        phone: "+48 600 100 200",
        pesel: "90010112345",
        address: { street: "Polna 1", city: "Warszawa", zip: "00-001" },
        access_expires_at: "2027-02-01T00:00:00Z",
        program_completed_at: null,
        product_group: "psychon",
      },
      progress: {
        courses_done: 8,
        courses_total: 10,
        hours_accepted: "41.5",
        supervision_present: 5,
        workshop_done: true,
        path_tests_passed: 3,
        path_tests_total: 4,
      },
      recent_notifications: [],
      audit_entries: [],
    },
  });
  await odpowiedz(page, `${API}/admin/reliability/17`, { data: { reliability_percent: "40", below_threshold: true } });
  await instalujSesje(page);
}

interface Ekran {
  nazwa: string;
  url: string;
  etykieta: string;
  instaluj: (page: Page) => Promise<void>;
  /** Pulpit: kolejność nagłówków mierzona axe `heading-order`. */
  pulpit?: boolean;
  /** Drugi wariant danych z inną (dłuższą) etykietą tego samego przycisku. */
  drugi?: { etykieta: string; instaluj: (page: Page) => Promise<void> };
}

const EKRANY: Ekran[] = [
  {
    nazwa: "sprawy",
    url: "/nowy-front/admin/sprawy",
    etykieta: "Otwórz najstarszą sprawę",
    instaluj: (page) => atrapySpraw(page),
  },
  {
    nazwa: "zgloszenia-lista",
    url: "/nowy-front/admin/zgloszenia",
    etykieta: "Dodaj zgłoszenie",
    instaluj: (page) => atrapyListyZgloszen(page),
  },
  {
    nazwa: "karta-osoby",
    url: "/nowy-front/admin/uczestniczki/17",
    etykieta: "Zmień dane",
    instaluj: (page) => atrapyKartyOsoby(page),
  },
  {
    nazwa: "pulpit-administracji",
    url: "/admin",
    etykieta: "Otwórz sprawy",
    instaluj: (page) => atrapyAdministracji(page),
    pulpit: true,
  },
  {
    nazwa: "pulpit-uczestnika",
    url: "/panel/pulpit",
    etykieta: "Wróć do lekcji",
    instaluj: (page) => atrapyUczestnika(page, "volunteer", "domyslny"),
    pulpit: true,
    drugi: {
      etykieta: "Przejdź do dalszej współpracy",
      instaluj: (page) => atrapyUczestnika(page, "volunteer", "po-programie"),
    },
  },
  {
    nazwa: "pulpit-studenta",
    url: "/panel/pulpit",
    etykieta: "Wznów lekcję",
    instaluj: (page) => atrapyUczestnika(page, "student", "domyslny"),
    pulpit: true,
    drugi: {
      etykieta: "Otwórz kurs",
      instaluj: (page) => atrapyUczestnika(page, "student", "bez-lekcji"),
    },
  },
  {
    nazwa: "pulpit-prowadzacego",
    url: "/prowadzacy",
    etykieta: "Odpowiedz na pytania",
    instaluj: (page) => atrapyProwadzacego(page),
    pulpit: true,
  },
];

async function zrzut(page: Page, nazwa: string): Promise<void> {
  const katalog = process.env.PW_ZRZUTY;
  if (!katalog) return;
  mkdirSync(katalog, { recursive: true });
  await page.screenshot({ path: join(katalog, `${nazwa}.png`), fullPage: true });
}

async function otworz(
  page: Page,
  ekran: { url: string; etykieta: string; instaluj: (p: Page) => Promise<void> },
  nazwaZrzutu?: string,
) {
  await ekran.instaluj(page);
  await page.goto(ekran.url);
  await zabezpieczeniePrzedEkranemDostepu(page);
  // Zrzut przed miarą nagłówka: ekran z przyciskiem poza nagłówkiem też da się obejrzeć.
  await expect(page.getByRole("button", { name: ekran.etykieta, exact: true }).first()).toBeVisible();
  if (nazwaZrzutu) await zrzut(page, nazwaZrzutu);
  const naglowek = page.locator("main header").first();
  const przycisk = naglowek.getByRole("button", { name: ekran.etykieta, exact: true });
  await expect(przycisk).toBeVisible();
  return { naglowek, przycisk, h1: naglowek.getByRole("heading", { level: 1 }) };
}

/** Szerokość, jaką przycisk zająłby przy szerokości z treści (klon w tym samym rodzicu, `max-content`). */
async function szerokoscZTresci(przycisk: Locator): Promise<number> {
  return przycisk.evaluate((el) => {
    const klon = el.cloneNode(true) as HTMLElement;
    klon.style.position = "absolute";
    klon.style.visibility = "hidden";
    klon.style.inlineSize = "max-content";
    el.parentElement!.appendChild(klon);
    const szerokosc = klon.getBoundingClientRect().width;
    klon.remove();
    return szerokosc;
  });
}

async function kolorowe(page: Page): Promise<number> {
  return page.locator("main button[class*='primary']").count();
}

for (const ekran of EKRANY) {
  test.describe(`przycisk główny: ${ekran.nazwa}`, () => {
    test.describe("1280 px", () => {
      test.use({ viewport: SZEROKI });

      test("w nagłówku na wysokości h1, przy prawej krawędzi, szerokość z treści, jeden kolorowy", async ({ page }) => {
        const { naglowek, przycisk, h1 } = await otworz(page, ekran, `${ekran.nazwa}-1280`);

        const bNaglowek = (await naglowek.boundingBox())!;
        const bPrzycisk = (await przycisk.boundingBox())!;
        const bH1 = (await h1.boundingBox())!;
        expect(Math.abs(bPrzycisk.y - bH1.y), `top przycisku ${bPrzycisk.y}, top h1 ${bH1.y}`).toBeLessThanOrEqual(12);
        const prawa = bPrzycisk.x + bPrzycisk.width;
        expect(Math.abs(prawa - (bNaglowek.x + bNaglowek.width)), `prawa krawędź ${prawa}`).toBeLessThanOrEqual(2);

        const zTresci = Math.min(await szerokoscZTresci(przycisk), 320);
        expect(Math.abs(bPrzycisk.width - zTresci), `szerokość ${bPrzycisk.width}, z treści ${zTresci}`).toBeLessThanOrEqual(2);
        expect(bPrzycisk.width, "nie na całą szerokość").toBeLessThanOrEqual(320);
        expect(await kolorowe(page), "przyciski w kolorze na ekranie").toBe(1);
      });
    });

    test.describe("390 px", () => {
      test.use({ viewport: WASKI });

      test("pełna szerokość nagłówka pod opisem, jeden kolorowy, bez przewijania poziomego", async ({ page }) => {
        const { naglowek, przycisk, h1 } = await otworz(page, ekran, `${ekran.nazwa}-390`);

        const bNaglowek = (await naglowek.boundingBox())!;
        const bPrzycisk = (await przycisk.boundingBox())!;
        const bH1 = (await h1.boundingBox())!;
        expect(Math.abs(bPrzycisk.width - bNaglowek.width), `przycisk ${bPrzycisk.width}, nagłówek ${bNaglowek.width}`).toBeLessThanOrEqual(2);
        expect(bPrzycisk.y).toBeGreaterThanOrEqual(bH1.y + bH1.height - 1);
        const opis = naglowek.locator("p").first();
        if ((await opis.count()) > 0) {
          const bOpis = (await opis.boundingBox())!;
          expect(bPrzycisk.y).toBeGreaterThanOrEqual(bOpis.y + bOpis.height - 1);
        }
        expect(await kolorowe(page), "przyciski w kolorze na ekranie").toBe(1);
        const miary = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(miary, "przewijanie poziome strony").toBeLessThanOrEqual(0);
      });
    });

    if (ekran.pulpit) {
      test.describe("kolejność nagłówków", () => {
        test.use({ viewport: SZEROKI });

        test("axe heading-order: 0 naruszeń", async ({ page }) => {
          await otworz(page, ekran);
          const wynik = await new AxeBuilder({ page }).withRules(["heading-order"]).analyze();
          const opis = wynik.violations.map((w) => `${w.id}: ${w.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
          expect(opis, "naruszenia heading-order").toEqual([]);
        });
      });
    }

    if (ekran.drugi) {
      const drugi = ekran.drugi;
      test.describe("etykiety różnej długości", () => {
        test.use({ viewport: SZEROKI });

        test(`szerokość zależy od etykiety: „${ekran.etykieta}” i „${drugi.etykieta}” dają różne szerokości`, async ({
          page,
          browser,
        }) => {
          const a = await otworz(page, ekran);
          const szerokoscA = (await a.przycisk.boundingBox())!.width;

          const kontekst = await browser.newContext({ viewport: SZEROKI });
          const druga = await kontekst.newPage();
          const b = await otworz(
            druga,
            { url: ekran.url, etykieta: drugi.etykieta, instaluj: drugi.instaluj },
            `${ekran.nazwa}-1280-druga-etykieta`,
          );
          const szerokoscB = (await b.przycisk.boundingBox())!.width;
          await kontekst.close();

          expect(
            Math.abs(szerokoscA - szerokoscB),
            `„${ekran.etykieta}” ${szerokoscA} px, „${drugi.etykieta}” ${szerokoscB} px`,
          ).toBeGreaterThan(8);
        });
      });
    }
  });
}

test.describe("pulpit administracji bez celu: przycisk niedostępny z powodem pod nagłówkiem", () => {
  test.use({ viewport: SZEROKI });

  test("aria-disabled + aria-describedby na podpowiedź w nagłówku, nadal jeden kolorowy", async ({ page }) => {
    await atrapyAdministracji(page, true);
    await page.goto("/admin");
    await zabezpieczeniePrzedEkranemDostepu(page);
    const naglowek = page.locator("main header").first();
    const przycisk = naglowek.getByRole("button", { name: "Otwórz sprawy", exact: true });
    await expect(przycisk).toBeVisible();
    await expect(przycisk).toHaveAttribute("aria-disabled", "true");
    await expect(przycisk).toHaveAccessibleDescription("Brak zgłoszeń rekrutacyjnych do decyzji.");
    await expect(naglowek.getByText("Brak zgłoszeń rekrutacyjnych do decyzji.")).toBeVisible();
    expect(await kolorowe(page)).toBe(1);
    await zrzut(page, "pulpit-administracji-1280-bez-celu");
  });
});
