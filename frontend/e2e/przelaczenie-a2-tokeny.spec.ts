import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { ucieknijWyrazenie } from "./_wyrazenie";

/**
 * Miara arkusza tokenów wyglądu na sześciu przełączonych trasach „podmiany
 * treści” (pulpit uczestnika, pulpit administracji, pulpit
 * prowadzącego, decyzja o profilu, wzory dokumentów, ekran startowy).
 *
 * Wejście adresem (nie nawigacją kliencką), system w trybie ciemnym
 * (`colorScheme: "dark"`). Najpierw ekran musi się wyrenderować (nagłówek albo
 * tekst ekranu — atrapy API jak w specach grup przełączenia), potem na
 * korzeniu ekranu (`div[data-theme="light"]` pod `main#tresc`) zmienne stylu
 * muszą istnieć (`--primary` niepuste), tło ma być jasne (`--bg` = `#f3f1ed`),
 * a `color-scheme` — `light`. Bez importu arkusza na stronie ekran wygląda jak
 * nieostylowany.
 *
 * API i sesja Auth.js są atrapami (`page.route`), bez backendu i bez IdP.
 */

test.use({ colorScheme: "dark" });

const API = "http://localhost:8000/api/v1";

const ATRAPA_SESJI = {
  accessToken: "atrapa-tokenu-testowego",
  expiresAt: Date.now() + 3_600_000,
};

const STRONA = { current_page: 1, per_page: 25, total: 0, last_page: 1 };

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

const WNIOSEK = {
  id: 12,
  user: { id: 17, first_name: "Ewa", last_name: "Przykładowa" },
  specializations: ["interwencja kryzysowa"],
  approach: "poznawczo-behawioralne",
  city: "Gdańsk",
  bio: "Pracuję z osobami dorosłymi.",
  publication_consent_granted: true,
  status: "submitted",
  return_reason: null,
  decided_at: null,
  documents: [],
  created_at: "2026-09-10T08:00:00Z",
  updated_at: "2026-09-11T08:00:00Z",
};

const EKRAN_STARTOWY = {
  video: { title: "Film powitalny", url: null, caption: null },
  program: { title: "Przebieg programu", body: "Treść o programie." },
  expectations: { title: "Oczekiwania", body: "Treść o oczekiwaniach." },
  updated_at: null,
};

function dane(zawartosc: unknown, meta?: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(meta === undefined ? { data: zawartosc } : { data: zawartosc, meta }),
  };
}

/**
 * Atrapy API wszystkich trzech ról (zestawy z istniejących speków grup
 * przełączenia). Ogólna atrapa jest rejestrowana PRZED szczegółowymi —
 * Playwright wybiera trasę zarejestrowaną PÓŹNIEJ jako pierwszą.
 */
async function instalujAtrapyApi(page: Page, rola: string): Promise<void> {
  await page.route(`${API}/**`, (route) => route.fulfill(dane([], STRONA)));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(dane({ id: 1, role: rola, first_name: "Marta", program_completed_at: null })),
  );
  await page.route(`${API}/notifications**`, (route) =>
    route.fulfill(dane([], { ...STRONA, extra: { unread: 0 } })),
  );
  // uczestnik
  await page.route(`${API}/courses`, (route) => route.fulfill(dane([KURS])));
  await page.route(`${API}/courses/${KURS.slug}`, (route) =>
    route.fulfill(
      dane({ ...KURS, lessons: [{ id: 21, title: LEKCJA.title, sequence_order: 1, is_completed: false }] }),
    ),
  );
  await page.route(`${API}/certificate/conditions`, (route) =>
    route.fulfill(dane({ eligible: false, conditions: [] })),
  );
  await page.route(`${API}/internship/entries**`, (route) =>
    route.fulfill(dane([], { ...STRONA, extra: { accepted_hours: "10", required_hours: "72" } })),
  );
  await page.route(`${API}/lessons/21`, (route) => route.fulfill(dane(LEKCJA)));
  await page.route(`${API}/lessons/21/video-link`, (route) =>
    route.fulfill(dane({ url: "https://example.test/nagranie" })),
  );
  // prowadzący
  await page.route(`${API}/instructor/group`, (route) =>
    route.fulfill(
      dane({
        members: [
          {
            id: 100,
            first_name: "Osoba",
            last_name: "Demo",
            progress: {
              courses_done: 2,
              courses_total: 10,
              hours_accepted: "41.5",
              supervision_present: 5,
              workshop_done: false,
            },
          },
        ],
        slots: [],
      }),
    ),
  );
  await page.route(`${API}/instructor/questions**`, (route) =>
    route.fulfill(dane([], { ...STRONA, extra: { unanswered: 0 } })),
  );
  // administracja
  await page.route(`${API}/admin/dashboard`, (route) =>
    route.fulfill(
      dane({
        counters: { participants: 137, completed: 29, certificates: 23 },
        queues: [{ key: "applications", count: 11, link: "/admin/uczestniczki" }],
      }),
    ),
  );
  await page.route(`${API}/admin/profiles/12`, (route) => route.fulfill(dane(WNIOSEK)));
  await page.route(`${API}/document-templates/agreement`, (route) =>
    route.fulfill(
      dane({
        type: "agreement",
        content: "<p>Treść porozumienia</p>",
        version: 2,
        updated_at: "2026-09-28T10:00:00Z",
        updated_by: { id: 5, name: "Anna Testowa" },
      }),
    ),
  );
  await page.route(`${API}/document-templates/agreement/versions`, (route) =>
    route.fulfill(
      dane([{ version: 2, updated_at: "2026-09-28T10:00:00Z", updated_by: { id: 5, name: "Anna Testowa" } }]),
    ),
  );
  await page.route(`${API}/onboarding`, (route) => route.fulfill(dane(EKRAN_STARTOWY)));
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(dane({ url: null })));
}

const TRASY: { adres: string; rola: string; naglowek: string | RegExp }[] = [
  { adres: "/panel/pulpit", rola: "volunteer", naglowek: "Twoja ścieżka" },
  { adres: "/admin", rola: "project_manager", naglowek: "Pulpit administracji" },
  { adres: "/prowadzacy", rola: "instructor", naglowek: "Pulpit prowadzącego" },
  { adres: "/admin/profile/12", rola: "project_manager", naglowek: /^Wniosek o profil: Ewa Przykładowa/ },
  { adres: "/admin/wzory-dokumentow", rola: "project_manager", naglowek: /^Wzory dokumentów$/ },
  { adres: "/admin/ekran-startowy", rola: "project_manager", naglowek: /^Treść ekranu „Zacznij tutaj”$/ },
];

test.describe("tokeny wyglądu na trasach podmiany treści — wejście adresem, system ciemny", () => {
  for (const { adres, rola, naglowek } of TRASY) {
    test(`${adres}: --primary niepuste, --bg jasne, color-scheme light`, async ({ page }) => {
      await instalujAtrapyApi(page, rola);

      await page.goto(adres);
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page).toHaveURL(new RegExp(`${ucieknijWyrazenie(adres)}$`));

      // Ekran ma się wyrenderować (a nie zastąpić granicą błędu), zanim zmierzymy styl.
      await expect(page.getByText(naglowek).first()).toBeVisible();

      const korzen = page.locator('#tresc [data-theme="light"]').first();
      await expect(korzen).toBeAttached();

      const miara = await korzen.evaluate((el) => {
        const styl = getComputedStyle(el);
        return {
          primary: styl.getPropertyValue("--primary").trim(),
          bg: styl.getPropertyValue("--bg").trim().toLowerCase(),
          schemat: styl.colorScheme,
        };
      });
      console.log(`POMIAR ${adres} --primary=${miara.primary} --bg=${miara.bg} color-scheme=${miara.schemat}`);

      expect(miara.primary, `--primary na ${adres}`).not.toBe("");
      expect(miara.bg, `--bg na ${adres}`).toBe("#f3f1ed");
      expect(miara.schemat, `color-scheme na ${adres}`).toBe("light");
    });
  }
});
