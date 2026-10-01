import path from "node:path";
import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Lista kursów uczestnika (wolontariusz) i studenta na regule `ListRow`:
 * - 390 px: tytuł w pierwszej linii, plakietka pod nim; akcja („Otwórz ›” albo
 *   „Zamknięty” z kłódką) z prawej, w tym samym pasie co tekst, nie pod nim;
 *   wiersz zamknięty tej samej wysokości co wiersz w toku (±4 px);
 * - 1280 px: plakietka przed tytułem w jednej linii, akcja z prawej.
 */

const ATRAPA_SESJI = { accessToken: "atrapa-tokenu-testowego", expiresAt: Date.now() + 3_600_000 };
const API = "http://localhost:8000/api/v1";
const STRONA = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

const KURSY = [
  { id: 1, slug: "podstawy-pomocy", title: "Podstawy pomocy psychologicznej", sequence_order: 1, product_group: "psychon", status: "completed", progress_percent: 100 },
  { id: 2, slug: "wywiad-psychologiczny", title: "Wywiad psychologiczny", sequence_order: 2, product_group: "psychon", status: "in_progress", progress_percent: 40 },
  { id: 3, slug: "interwencja-kryzysowa", title: "Interwencja kryzysowa", sequence_order: 3, product_group: "psychon", status: "locked", progress_percent: 0 },
];
const PLAKIETKI: Record<string, string> = { completed: "ukończony", in_progress: "w toku", locked: "zamknięty" };

async function odpowiedz(page: Page, wzorzec: string, cialo: unknown): Promise<void> {
  await page.route(wzorzec, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cialo) }),
  );
}

async function atrapy(page: Page, rola: "volunteer" | "student"): Promise<void> {
  await odpowiedz(page, `${API}/**`, { data: [], meta: STRONA });
  await odpowiedz(page, `${API}/me`, { data: { id: 1, role: rola, first_name: "Marta", program_completed_at: null } });
  await odpowiedz(page, `${API}/courses`, { data: KURSY });
  await odpowiedz(page, `${API}/courses/wywiad-psychologiczny`, {
    data: { ...KURSY[1], lessons: [{ id: 21, title: "Wprowadzenie do wywiadu", sequence_order: 1, is_completed: false }] },
  });
  await odpowiedz(page, `${API}/certificate/conditions`, {
    data: { eligible: false, conditions: [{ key: "supervision", label: "Obecności na superwizjach", done: 2, required: 6, met: false }] },
  });
  await odpowiedz(page, `${API}/internship/entries**`, {
    data: [],
    meta: { ...STRONA, extra: { accepted_hours: "41.5", required_hours: "72" } },
  });
  await odpowiedz(page, "**/api/auth/session", ATRAPA_SESJI);
  await odpowiedz(page, "**/api/auth/end-session-url", { data: { url: null } });
}

/** Surowe prostokąty części wiersza: tytuł, plakietka, blok tekstu, akcja, cały wiersz. */
async function zmierzWiersz(page: Page, stan: string, tytul: string, plakietka: string) {
  return page.locator(`[data-kurs-stan="${stan}"]`).evaluate(
    (el, { tytul, plakietka }) => {
      const prost = (e: Element | null | undefined) => {
        const r = e?.getBoundingClientRect();
        return r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height } : null;
      };
      const wiersz = el.querySelector("[data-wariant]");
      const tresc = wiersz?.children[0];
      const akcje = wiersz?.children[1];
      const akcja = akcje?.querySelector("a, button");
      // Nagłówek wiersza: plakietka (`span`) i tytuł (`p`) jako dzieci; tekst sprawdzany.
      const naglowek = tresc?.children[0];
      const t = naglowek?.querySelector(":scope > p");
      const p = naglowek?.querySelector(":scope > span");
      if ((t?.textContent ?? "").trim() !== tytul || !(p?.textContent ?? "").trim().endsWith(plakietka)) return null;
      return { tytul: prost(t), plakietka: prost(p), tresc: prost(tresc), akcja: prost(akcja), wiersz: prost(el) };
    },
    { tytul, plakietka },
  );
}

function katalogZrzutow(): string | null {
  const katalog = process.env.PW_ZRZUTY_LISTY_KURSOW;
  if (!katalog) return null;
  mkdirSync(katalog, { recursive: true });
  return katalog;
}

for (const rola of ["volunteer", "student"] as const) {
  for (const [nazwa, wymiary] of [
    ["390", { width: 390, height: 844 }],
    ["1280", { width: 1280, height: 800 }],
  ] as const) {
    test(`lista kursów (${rola}) @${nazwa}: wiersz na regule ListRow, akcja z prawej, wysokości ±4 px`, async ({ page }) => {
      await page.setViewportSize(wymiary);
      await atrapy(page, rola);
      await page.goto("/panel/pulpit");
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.locator("[data-kurs-stan]")).toHaveCount(3);
      const katalog = katalogZrzutow();
      if (katalog) {
        await page
          .locator("[data-kurs-stan]")
          .first()
          .locator("xpath=ancestor::section[1]")
          .screenshot({ path: path.join(katalog, `lista-kursow-${rola}-${nazwa}.png`) });
      }

      const pomiary: Record<string, NonNullable<Awaited<ReturnType<typeof zmierzWiersz>>>> = {};
      for (const kurs of KURSY) {
        const zmierzone = await zmierzWiersz(page, kurs.status, kurs.title, PLAKIETKI[kurs.status]);
        expect(zmierzone, `nagłówek wiersza ${kurs.status}: plakietka i tytuł`).not.toBeNull();
        const m = zmierzone!;
        pomiary[kurs.status] = m;
        const opis = `${kurs.status} ${JSON.stringify(m)}`;
        console.log(`POMIAR-LISTY ${rola} @${nazwa} ${opis}`);
        expect(m.tytul && m.plakietka && m.tresc && m.akcja, `części wiersza ${opis}`).toBeTruthy();
        // Akcja z prawej, w tym samym pasie co tekst — nie pod nim.
        expect(m.akcja!.top, `akcja w pasie tekstu ${opis}`).toBeLessThan(m.tresc!.bottom);
        expect(m.akcja!.left, `akcja z prawej ${opis}`).toBeGreaterThan(m.tresc!.right);
        if (wymiary.width < 640) {
          // Tytuł w pierwszej linii, plakietka pod nim.
          expect(m.plakietka!.top, `plakietka pod tytułem ${opis}`).toBeGreaterThanOrEqual(m.tytul!.bottom);
        } else {
          // Plakietka przed tytułem, w jednej linii z nim.
          expect(m.plakietka!.right, `plakietka przed tytułem ${opis}`).toBeLessThanOrEqual(m.tytul!.left);
          expect(m.plakietka!.top, `jedna linia ${opis}`).toBeLessThan(m.tytul!.bottom);
          expect(m.tytul!.top, `jedna linia ${opis}`).toBeLessThan(m.plakietka!.bottom);
        }
      }
      const roznica = Math.abs(pomiary.locked.wiersz!.height - pomiary.in_progress.wiersz!.height);
      expect(roznica, `wysokość zamkniętego ${pomiary.locked.wiersz!.height} vs w toku ${pomiary.in_progress.wiersz!.height}`).toBeLessThanOrEqual(4);
    });
  }
}
