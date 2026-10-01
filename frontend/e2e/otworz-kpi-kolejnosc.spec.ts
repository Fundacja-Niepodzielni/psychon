import { expect, test, type Locator, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Etykiety kafli liczb, akcja „Otwórz” w wierszach i podlinia form stażu
 * (makieta 2.0.4: `.pil .l` — 13 px, kolor wyciszony, zwykła grubość), w
 * szerokościach 1280 i 390 px:
 * - etykieta kafla na trzech pulpitach ma `font-weight` 400, kolor równy
 *   obliczonemu `--muted` i rozmiar równy obliczonemu `--fs-11` (13 px),
 *   mierzonym na elemencie próbnym w tym samym drzewie (nie literały);
 * - liczba w kaflu zostaje 24 px / 700, a dominująca 44 px / 900;
 * - w wierszu kursu prowadzącego widoczne jest „Otwórz”, a pełna nazwa
 *   „Otwórz kurs: …” jest tylko dla czytnika;
 * - pod nazwą formy stażu stoi jej opis, a miejsce na liście we własnej kolumnie.
 * Atrapy API i sesji jak w `przycisk-glowny-szerokosc.spec.ts`.
 */

const ATRAPA_SESJI = { accessToken: "atrapa-tokenu-testowego", expiresAt: Date.now() + 3_600_000 };
const API = "http://localhost:8000/api/v1";
const STRONA = { current_page: 1, per_page: 100, total: 0, last_page: 1 };


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

const FORMY = [
  { id: 7, name: "Dyżur telefoniczny", description: "Rozmowa z osobą w kryzysie.", is_active: true, sort_order: 1, created_at: null, updated_at: null },
  { id: 8, name: "Dyżur na czacie", description: null, is_active: false, sort_order: 2, created_at: null, updated_at: null },
  { id: 9, name: "Inna forma", description: "  ", is_active: true, sort_order: 3, created_at: null, updated_at: null },
];

async function atrapyFormStazu(page: Page): Promise<void> {
  await odpowiedz(page, `${API}/**`, { data: [], meta: STRONA });
  await odpowiedz(page, `${API}/me`, { data: { id: 1, role: "project_manager", first_name: "Anna" } });
  await odpowiedz(page, `${API}/admin/internship/forms`, { data: FORMY });
  await instalujSesje(page);
}

/** Obliczona wartość wzorca z tokenów, mierzona na elemencie próbnym obok mierzonego. */
async function wzorzec(el: Locator): Promise<{ kolor: string; rozmiar: string }> {
  return el.evaluate((cel) => {
    const probka = document.createElement("span");
    probka.style.cssText = "color:var(--muted);font-size:var(--fs-11);position:absolute;visibility:hidden";
    cel.parentElement!.appendChild(probka);
    const s = getComputedStyle(probka);
    const wynik = { kolor: s.color, rozmiar: s.fontSize };
    probka.remove();
    return wynik;
  });
}

const EKRANY = [
  { nazwa: "pulpit uczestnika", url: "/panel/pulpit", instaluj: (p: Page) => atrapyUczestnika(p, "volunteer", "domyslny") },
  { nazwa: "pulpit prowadzącego", url: "/prowadzacy", instaluj: (p: Page) => atrapyProwadzacego(p) },
  { nazwa: "pulpit administracji", url: "/admin", instaluj: (p: Page) => atrapyAdministracji(p) },
] as const;

for (const rozmiar of [
  { nazwa: "1280 px", viewport: { width: 1280, height: 800 } },
  { nazwa: "390 px", viewport: { width: 390, height: 844 } },
]) {
  test.describe(`etykiety kafli, akcja wiersza i podlinia form, ${rozmiar.nazwa}`, () => {
    test.use({ viewport: rozmiar.viewport });

    for (const ekran of EKRANY) {
      test(`${ekran.nazwa}: etykieta kafla mała, zwykła, wyciszona; liczba bez zmian`, async ({ page }) => {
        await ekran.instaluj(page);
        await page.goto(ekran.url);
        await zabezpieczeniePrzedEkranemDostepu(page);

        const etykiety = page.locator("main label");
        await etykiety.first().waitFor();
        const liczba = await etykiety.count();
        expect(liczba, "kafle liczb na pulpicie").toBeGreaterThan(1);
        for (let i = 0; i < liczba; i++) {
          const etykieta = etykiety.nth(i);
          const [styl, wz] = await Promise.all([
            etykieta.evaluate((el) => {
              const s = getComputedStyle(el);
              return { grubosc: s.fontWeight, kolor: s.color, rozmiar: s.fontSize };
            }),
            wzorzec(etykieta),
          ]);
          const opis = JSON.stringify({ i, styl, wz });
          expect(styl.grubosc, opis).toBe("400");
          expect(styl.kolor, opis).toBe(wz.kolor);
          expect(styl.rozmiar, opis).toBe(wz.rozmiar);
          expect(wz.rozmiar, opis).toBe("13px");

          const wartosc = await etykieta.evaluate((el) => {
            const s = getComputedStyle(el.nextElementSibling!);
            return { rozmiar: s.fontSize, grubosc: s.fontWeight };
          });
          expect([
            { rozmiar: "24px", grubosc: "700" },
            { rozmiar: "44px", grubosc: "900" },
          ], JSON.stringify(wartosc)).toContainEqual(wartosc);
        }
      });
    }

    test("pulpit prowadzącego: wiersz kursu ma widoczne „Otwórz”, pełna nazwa tylko dla czytnika", async ({ page }) => {
      await atrapyProwadzacego(page);
      await page.goto("/prowadzacy");
      await zabezpieczeniePrzedEkranemDostepu(page);

      const odnosnik = page.getByRole("link", { name: "Otwórz kurs: Wywiad psychologiczny" });
      await expect(odnosnik).toHaveCount(1);
      await expect(odnosnik).toHaveAttribute("aria-label", "Otwórz kurs: Wywiad psychologiczny");
      const widoczny = (await odnosnik.innerText()).replace("›", "").trim();
      expect(widoczny).toBe("Otwórz");
    });

    test("pulpit uczestnika: wiersz kursu w toku ma widoczne „Otwórz”, pełna nazwa z tytułem tylko dla czytnika", async ({ page }) => {
      await atrapyUczestnika(page, "volunteer", "domyslny");
      await page.goto("/panel/pulpit");
      await zabezpieczeniePrzedEkranemDostepu(page);

      const odnosnik = page.locator('[data-kurs-stan="in_progress"]').getByRole("link", { name: "Otwórz kurs: Wywiad psychologiczny" });
      await expect(odnosnik).toHaveCount(1);
      expect((await odnosnik.innerText()).replace("›", "").trim()).toBe("Otwórz");
    });

    test("słownik form stażu: opis pod nazwą, miejsce na liście we własnej kolumnie", async ({ page }) => {
      await atrapyFormStazu(page);
      await page.goto("/admin/formy-stazu");
      await zabezpieczeniePrzedEkranemDostepu(page);

      const wiersze = page.getByRole("table", { name: "Formy stażu" }).locator('[role="row"][data-wiersz]');
      await expect(wiersze).toHaveCount(3);
      await expect(page.getByText("Rozmowa z osobą w kryzysie.", { exact: true })).toHaveCount(1);
      await expect(page.getByText("Bez opisu.", { exact: true })).toHaveCount(2);
      for (const [indeks, miejsce] of [1, 2, 3].entries()) {
        const komorki = wiersze.nth(indeks).getByRole("cell");
        await expect(komorki.nth(2)).toHaveText(new RegExp(`^Miejsce na liście\\s*${miejsce}\\s*na liście$`));
      }
      await expect(wiersze.nth(0).getByRole("cell").nth(0)).toContainText("Rozmowa z osobą w kryzysie.");
      await expect(page.getByText(/Kolejność:? /)).toHaveCount(0);
    });
  });
}
