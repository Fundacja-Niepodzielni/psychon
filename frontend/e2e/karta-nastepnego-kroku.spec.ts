import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Karta następnego kroku na trzech pulpitach (makieta 2.0.4, blok „Następny
 * krok” / „Do zrobienia dziś”), w szerokościach 1280 i 390 px:
 * - w obszarze następnego kroku stoi dokładnie jedna karta z jednym `h2`;
 * - etykieta karty jest zdaniem w DOM, a wielkie litery daje wyłącznie CSS
 *   (`text-transform: uppercase`);
 * - karta ma cień (`box-shadow` różny od `none`);
 * - na 390 px karta zajmuje całą szerokość obszaru (±1 px);
 * - pulpit prowadzącego: tytuł wiersza pytania to treść pytania, pod nim osoba
 *   i lekcja, a żaden nagłówek kart nie kończy się liczbą po dwukropku.
 * Atrapy API i sesji jak w `przycisk-glowny-szerokosc.spec.ts`.
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


const EKRANY = [
  { nazwa: "pulpit-uczestnika", url: "/panel/pulpit", etykieta: "Następny krok", instaluj: (p: Page) => atrapyUczestnika(p, "volunteer", "domyslny") },
  { nazwa: "pulpit-studenta", url: "/panel/pulpit", etykieta: "Następny krok", instaluj: (p: Page) => atrapyUczestnika(p, "student", "domyslny") },
  { nazwa: "pulpit-prowadzacego", url: "/prowadzacy", etykieta: "Do zrobienia dziś", instaluj: (p: Page) => atrapyProwadzacego(p) },
] as const;

for (const rozmiar of [
  { nazwa: "1280", viewport: SZEROKI },
  { nazwa: "390", viewport: WASKI },
]) {
  for (const ekran of EKRANY) {
    test(`${ekran.nazwa} ${rozmiar.nazwa}: jedna karta kroku, jeden h2, etykieta zdaniem w DOM, cień`, async ({ page }) => {
      await page.setViewportSize(rozmiar.viewport);
      await ekran.instaluj(page);
      await page.goto(ekran.url);
      await zabezpieczeniePrzedEkranemDostepu(page);

      const obszar = page.locator('[data-obszar="nastepny-krok"]');
      await expect(obszar).toBeVisible();
      const karta = obszar.locator('[data-karta="nastepny-krok"]');
      await expect(karta).toHaveCount(1);
      await expect(karta.locator("h2")).toHaveCount(1);
      await expect(karta.locator("button")).toHaveCount(0);

      const etykieta = karta.locator("p").first();
      expect(await etykieta.textContent()).toBe(ekran.etykieta);
      expect(await etykieta.evaluate((el) => getComputedStyle(el).textTransform)).toBe("uppercase");
      expect(await karta.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");

      if (rozmiar.nazwa === "390") {
        const [a, b] = await Promise.all([karta.boundingBox(), obszar.boundingBox()]);
        expect(Math.abs(a!.x - b!.x), "lewa krawędź karty").toBeLessThanOrEqual(1);
        expect(Math.abs(a!.width - b!.width), "szerokość karty").toBeLessThanOrEqual(1);
      }

      // Układ telefonu i układ szeroki różnią się zaokrągleniem i bocznymi ramkami.
      const obrys = await karta.evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          lewyGorny: s.borderTopLeftRadius,
          prawyGorny: s.borderTopRightRadius,
          lewa: s.borderLeftWidth,
          prawa: s.borderRightWidth,
          gora: s.borderTopWidth,
        };
      });
      const opis = JSON.stringify(obrys);
      if (rozmiar.nazwa === "390") {
        expect(obrys.lewyGorny, opis).toBe("0px");
        expect(obrys.prawyGorny, opis).toBe("0px");
        expect(obrys.lewa, opis).toBe("0px");
        expect(obrys.prawa, opis).toBe("0px");
      } else {
        expect(obrys.lewyGorny, opis).not.toBe("0px");
        expect(obrys.prawyGorny, opis).not.toBe("0px");
        expect(obrys.lewa, opis).toBe("1px");
        expect(obrys.prawa, opis).toBe("1px");
        expect(obrys.gora, opis).toBe("1px");
      }
    });
  }
}

for (const rozmiar of [
  { nazwa: "1280", viewport: SZEROKI },
  { nazwa: "390", viewport: WASKI },
]) {
  test(`pulpit prowadzącego ${rozmiar.nazwa}: wiersz pytania ma treść w tytule, osobę i lekcję pod spodem, nagłówki kart bez „: n”`, async ({ page }) => {
    await page.setViewportSize(rozmiar.viewport);
    await atrapyProwadzacego(page);
    await page.goto("/prowadzacy");
    await zabezpieczeniePrzedEkranemDostepu(page);

    const tytul = page.locator("main").getByText("Jak zacząć rozmowę z osobą w kryzysie?", { exact: true });
    const podpis = page.locator("main").getByText("Marta Demo · lekcja „Wprowadzenie do wywiadu”", { exact: true });
    await expect(tytul).toHaveCount(1);
    await expect(podpis).toHaveCount(1);
    const [t, p] = await Promise.all([tytul.boundingBox(), podpis.boundingBox()]);
    expect(t!.y).toBeLessThan(p!.y);

    const naglowki = await page.locator("main h2, main h3").allTextContents();
    expect(naglowki.length).toBeGreaterThan(2);
    for (const tekst of naglowki) expect(tekst).not.toMatch(/: \d/);
    expect(naglowki).toEqual(expect.arrayContaining(["Pytania bez odpowiedzi", "Moja grupa", "Moje kursy"]));
  });
}
