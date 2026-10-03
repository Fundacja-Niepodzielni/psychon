import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Przewijanie w bok na trasach roboczych administracji (`/nowy-front/admin/**`): przy
 * szerokości 320, 390 i 1280 px strona nie jest szersza od okna
 * (`document.documentElement.scrollWidth <= clientWidth`) na żadnej z tras roboczych.
 *
 * Trasy robocze rysują wspólny ekran na pełną szerokość, bez ramki panelu, więc każdy
 * element wystający poza okno (ujemny margines pod pierścień fokusu, tekst dla czytnika
 * ekranu ustawiony na krawędzi) wydłuża stronę. W ramce panelu administracji (`/admin/**`)
 * ten sam ekran ma zero — mierzy to `ramka-administracji.spec.ts`, tu mierzymy trasy bez ramki.
 *
 * Atrapy API i sesji jak w pozostałych próbach administracji (żadne żądanie nie wychodzi
 * poza przeglądarkę). Dla każdej trasy próba sprawdza też, że ekran się narysował (jest
 * `main` z tekstem), żeby pusta albo błędna strona nie dała fałszywej zieleni.
 * Zrzuty całej strony powstają tylko przy ustawionej zmiennej `PW_ZRZUTY` (katalog poza
 * repozytorium); miary wystających elementów trafiają do wyjścia jako wiersze `POMIAR-WBOK`.
 */

const API = "http://localhost:8000/api/v1";
const ATRAPA_SESJI = {
  accessToken: ["atrapa", "tokenu", "testowego"].join("-"),
  expiresAt: Date.now() + 3_600_000,
};

const SZEROKOSCI = [
  { nazwa: "320", width: 320, height: 640 },
  { nazwa: "390", width: 390, height: 844 },
  { nazwa: "1280", width: 1280, height: 800 },
] as const;

/** Trasy robocze administracji: wszystkie strony pod `app/nowy-front/admin/` (ścieżki dynamiczne z przykładowym id). */
const TRASY = [
  "/nowy-front/admin/ekran-startowy",
  "/nowy-front/admin/formy-stazu",
  "/nowy-front/admin/kursy",
  "/nowy-front/admin/kursy/4",
  "/nowy-front/admin/kursy/4/publikacja",
  "/nowy-front/admin/kursy/4/zaproszenia",
  "/nowy-front/admin/lekcje/21?kurs=4",
  "/nowy-front/admin/osoby/nowa",
  "/nowy-front/admin/powiadomienia",
  "/nowy-front/admin/profile",
  "/nowy-front/admin/profile/12",
  "/nowy-front/admin/pulpit",
  "/nowy-front/admin/sprawy",
  "/nowy-front/admin/staz",
  "/nowy-front/admin/superwizje",
  "/nowy-front/admin/uczestniczki",
  "/nowy-front/admin/uczestniczki/17",
  "/nowy-front/admin/uczestniczki/17/przedluzenie",
  "/nowy-front/admin/ustawienia",
  "/nowy-front/admin/wzory-dokumentow",
  "/nowy-front/admin/zgloszenia",
  "/nowy-front/admin/zgloszenia/5",
  "/nowy-front/admin/zgloszenia-wspolpracy",
] as const;

/** Trasy, które muszą pokazać te cztery ekrany w zrzutach: kurs, lekcja, lista kursów, karta osoby. */
const ZRZUTY: Record<string, string> = {
  "/nowy-front/admin/kursy/4": "kurs",
  "/nowy-front/admin/lekcje/21?kurs=4": "lekcja",
  "/nowy-front/admin/kursy": "lista-kursow",
  "/nowy-front/admin/uczestniczki/17": "karta-osoby",
};

const META = { current_page: 1, per_page: 25, total: 0, last_page: 1 };

function koperta(dane: unknown, meta?: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }) };
}

function lista(elementy: unknown[]) {
  return koperta(elementy, { ...META, total: elementy.length });
}

function kurs(id: number, tytul: string, reszta: Record<string, unknown> = {}) {
  return {
    id,
    title: tytul,
    slug: `kurs-${id}`,
    description: "Jak prowadzić pierwszą rozmowę i o co pytać.",
    type: "course",
    product_group: "psychon",
    sequence_order: id,
    edition_id: 1,
    is_published: false,
    lessons_count: 4,
    materials_count: 0,
    created_at: "2026-09-01T08:00:00Z",
    updated_at: "2026-09-01T08:00:00Z",
    publication_gaps: {
      blocking: [{ code: "lesson_empty", lesson_id: 22 }],
      waiting: [{ code: "recording_in_progress", lesson_id: 23 }],
    },
    ...reszta,
  };
}

function lekcja(id: number, tytul: string, temat: number, pozycja: number, reszta: Record<string, unknown> = {}) {
  return {
    id,
    course_id: 4,
    title: tytul,
    description: null,
    content: null,
    sequence_order: id - 20,
    topic_id: temat,
    topic_position: pozycja,
    video_provider_id: `wideo-${id}`,
    duration_seconds: 1500,
    materials_count: 0,
    created_at: null,
    updated_at: null,
    video_status: "ready",
    video_status_at: "2026-10-01T12:00:00Z",
    video_ready: true,
    video_pending: false,
    ...reszta,
  };
}

const LEKCJE = [
  lekcja(21, "Wprowadzenie do wywiadu", 7, 1, { materials_count: 1 }),
  lekcja(22, "Pytania otwarte i zamknięte", 7, 2, {
    video_provider_id: null,
    video_status: "none",
    video_ready: false,
    content: "## Cel lekcji\n\nPo tej lekcji rozróżniasz pytania otwarte i zamknięte.",
  }),
  lekcja(23, "Ćwiczenie w parach", 8, 1, { video_status: "processing", video_ready: false }),
  lekcja(24, "Podsumowanie rozmowy", 8, 2),
];

const TEMATY = [
  { id: 7, course_id: 4, title: "Podstawy", position: 1, lesson_ids: [21, 22], created_at: null, updated_at: null },
  { id: 8, course_id: 4, title: "Praktyka", position: 2, lesson_ids: [23, 24], created_at: null, updated_at: null },
];

const OSOBA = {
  id: 17,
  first_name: "Marta",
  last_name: "Demo",
  email: "marta@demo.pl",
  role: "volunteer",
  status: "active",
  phone: "+48 600 100 200",
  pesel: "90010112345",
  address: { street: "Polna 1", city: "Warszawa", zip: "00-001" },
  access_expires_at: "2027-02-01T00:00:00Z",
  program_completed_at: null,
  product_group: "psychon",
  created_at: "2026-09-01T08:00:00Z",
};

const KARTA_OSOBY = {
  profile: OSOBA,
  progress: {
    courses_done: 8,
    courses_total: 10,
    hours_accepted: "41.5",
    supervision_present: 5,
    workshop_done: false,
    path_tests_passed: 3,
    path_tests_total: 4,
  },
  documents: [
    { id: 3, type: "volunteer_agreement", number: "NP/POR/2026/003" },
    { id: 4, type: "internship_certificate", number: "NP/ZAS/2026/004" },
  ],
  recent_notifications: [
    { id: 1, type: "internship.accepted", title: "Wpis stażu został zaakceptowany", body: null, link: null, read_at: null, created_at: "2026-10-01T10:00:00Z" },
  ],
  audit_entries: [{ id: 1, action: "user.updated", actor_id: 1, created_at: "2026-10-01T09:00:00Z" }],
};

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
  lesson_completion_percent: 60,
};

function zgloszenie(id: number, imie: string) {
  return {
    id,
    edition_id: 1,
    first_name: imie,
    last_name: "Demo",
    email: `${imie.toLowerCase()}@demo.pl`,
    phone: "+48 600 100 200",
    source: "formularz",
    role: "volunteer",
    payload: null,
    university: "Uniwersytet Warszawski",
    graduation_year: 2025,
    status: "new",
    rejection_reason: null,
    decided_by: null,
    decided_at: null,
    user_id: null,
    has_diploma_scan: false,
    diploma_scan_url: null,
    created_at: "2026-09-20T08:00:00Z",
    updated_at: "2026-09-20T08:00:00Z",
  };
}

function profil(id: number, imie: string) {
  return {
    id,
    user: { id: 30 + id, first_name: imie, last_name: "Demo" },
    specializations: ["Terapia poznawczo-behawioralna", "Praca z młodzieżą"],
    approach: "Podejście integracyjne.",
    city: "Kraków",
    bio: "Krótki opis zawodowy psycholożki.",
    publication_consent_granted: true,
    status: "submitted",
    return_reason: null,
    decided_at: null,
    documents: [],
    created_at: "2026-09-20T08:00:00Z",
    updated_at: "2026-09-20T08:00:00Z",
  };
}

function wpisStazu(id: number, imie: string) {
  return {
    id,
    date: "2026-08-27",
    hours: "3.5",
    form: "phone_duty",
    consultations_count: 4,
    description: "Dyżur telefoniczny — bez danych osób.",
    status: "submitted",
    review_comment: null,
    decided_at: null,
    created_at: "2026-08-27T18:00:00Z",
    updated_at: "2026-08-27T18:00:00Z",
    user: { id: 10 + id, first_name: imie, last_name: "Demo" },
  };
}

/** Odpowiedź atrapy API dla ścieżki (bez `/api/v1`); domyślnie pusta lista. */
function odpowiedzNaSciezke(sciezka: string): ReturnType<typeof koperta> {
  let m: RegExpExecArray | null;
  if (sciezka === "/me") return koperta({ id: 1, role: "project_manager", first_name: "Anna", last_name: "Demo", program_completed_at: null });
  if (sciezka.startsWith("/notifications")) return koperta([], { ...META, extra: { unread: 0 } });
  if (sciezka === "/admin/dashboard") {
    return koperta({
      counters: { participants: 12, completed: 5, certificates: 3 },
      queues: [
        { key: "applications", count: 3, link: "/admin/uczestniczki" },
        { key: "internship_entries", count: 2, link: "/admin/staz" },
        { key: "profiles", count: 1, link: "/admin/profile" },
        { key: "questions", count: 4, link: "/prowadzacy/pytania" },
      ],
    });
  }
  if (sciezka === "/admin/courses") return lista([kurs(3, "Podstawy pomocy"), kurs(4, "Wywiad psychologiczny"), kurs(5, "Interwencja kryzysowa", { is_published: true, publication_gaps: { blocking: [], waiting: [] } })]);
  if ((m = /^\/admin\/courses\/(\d+)$/.exec(sciezka))) return koperta(kurs(Number(m[1]), "Wywiad psychologiczny"));
  if (/^\/admin\/courses\/\d+\/lessons$/.test(sciezka)) return koperta(LEKCJE);
  if (/^\/admin\/courses\/\d+\/topics$/.test(sciezka)) return koperta(TEMATY);
  if (/^\/admin\/courses\/\d+\/assignments$/.test(sciezka)) return koperta([]);
  if (/^\/admin\/courses\/\d+\/materials$/.test(sciezka)) return koperta([]);
  if ((m = /^\/admin\/lessons\/(\d+)\/video-status$/.exec(sciezka))) return koperta({ status: "no_video", video_status: "none", video_status_at: null, video_ready: false, video_pending: false });
  if (/^\/admin\/lessons\/\d+\/materials$/.test(sciezka)) return koperta([]);
  if ((m = /^\/admin\/lessons\/(\d+)$/.exec(sciezka))) return koperta(LEKCJE.find((l) => l.id === Number(m![1])) ?? LEKCJE[0]);
  if (sciezka === "/admin/users") return lista([OSOBA, { ...OSOBA, id: 18, first_name: "Filip", email: "filip@demo.pl" }, { ...OSOBA, id: 5, first_name: "Joanna", last_name: "Prowadząca", role: "instructor" }]);
  if (/^\/admin\/users\/\d+$/.test(sciezka)) return koperta(KARTA_OSOBY);
  if (/^\/admin\/reliability\/\d+$/.test(sciezka)) return koperta({ reliability_percent: "40", below_threshold: true });
  if (sciezka === "/admin/applications") return lista([zgloszenie(5, "Ola"), zgloszenie(6, "Filip")]);
  if (/^\/admin\/applications\/\d+$/.test(sciezka)) return koperta(zgloszenie(5, "Ola"));
  if (sciezka === "/admin/profiles") return lista([profil(12, "Anna"), profil(13, "Zofia")]);
  if (/^\/admin\/profiles\/\d+$/.test(sciezka)) return koperta(profil(12, "Anna"));
  if (sciezka === "/admin/internship/pending") return lista([wpisStazu(91, "Marta"), wpisStazu(92, "Filip")]);
  if (sciezka === "/admin/edition") return koperta(EDYCJA);
  if (sciezka === "/admin/notification-settings") {
    return koperta({
      types: [
        { type: "application.accepted", enabled: true },
        { type: "application.rejected", enabled: true },
        { type: "internship.accepted", enabled: false },
        { type: "internship.returned", enabled: true },
      ],
      supervision_reminder: { enabled: true, send_at: "08:00" },
    });
  }
  if (sciezka === "/admin/emails") {
    return koperta(
      [
        { id: 1, to_email: "marta@demo.pl", subject: "Zaproszenie do programu", body_html: "<p>Treść</p>", status: "simulated", sent_at: null, created_at: "2026-10-01T10:00:00Z" },
        { id: 2, to_email: "filip@demo.pl", subject: "Wpis stażu zaakceptowany", body_html: "<p>Treść</p>", status: "simulated", sent_at: null, created_at: "2026-10-01T11:00:00Z" },
      ],
      { ...META, total: 2, extra: { from: { address: "niepodzielni@demo.pl", name: "Fundacja Niepodzielni" } } },
    );
  }
  if (sciezka === "/admin/internship/forms") {
    return koperta([
      { id: 7, name: "Dyżur telefoniczny", description: "Rozmowa z osobą w kryzysie.", is_active: true, sort_order: 1, created_at: null, updated_at: null },
    ]);
  }
  if (sciezka === "/admin/onboarding" || sciezka === "/onboarding") {
    return koperta({
      video: { title: "Witamy w programie", url: null, caption: null },
      program: { title: "Program", body: "Opis programu." },
      expectations: { title: "Oczekiwania", body: "Opis oczekiwań." },
      updated_at: null,
    });
  }
  if ((m = /^\/document-templates\/([a-z_]+)$/.exec(sciezka))) {
    return koperta({ type: m[1], content: "<p>Treść wzoru</p>", version: 2, updated_at: "2026-10-01T10:00:00Z", updated_by: { id: 1, name: "Anna Demo" }, current_version_unused: false });
  }
  if (/^\/document-templates\/[a-z_]+\/versions$/.test(sciezka)) {
    return koperta([{ version: 2, updated_at: "2026-10-01T10:00:00Z", updated_by: { id: 1, name: "Anna Demo" } }]);
  }
  return koperta([], META);
}

async function instalujAtrapy(page: Page): Promise<void> {
  await page.route(`${API}/**`, (route) => {
    const sciezka = new URL(route.request().url()).pathname.replace("/api/v1", "");
    return route.fulfill(odpowiedzNaSciezke(sciezka));
  });
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(koperta({ url: null })));
}


async function zmierz(page: Page) {
  return page.evaluate(() => {
    const dokument = document.documentElement;
    const okno = dokument.clientWidth;
    const wystajace: { element: string; left: number; right: number }[] = [];
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > okno + 0.5 || r.left < -0.5) {
        const klasa = typeof el.className === "string" ? el.className.split(/\s+/)[0] : "";
        wystajace.push({ element: `${el.tagName.toLowerCase()}${klasa ? `.${klasa}` : ""}`, left: Math.round(r.left * 10) / 10, right: Math.round(r.right * 10) / 10 });
      }
    }
    return {
      okno,
      przewijanie: dokument.scrollWidth - okno,
      body: document.body.scrollWidth - document.body.clientWidth,
      naglowek: document.querySelector("h1")?.textContent?.trim() ?? null,
      tekstMain: (document.querySelector("main")?.textContent ?? "").trim().length,
      wystajace: wystajace.slice(0, 12),
    };
  });
}

for (const trasa of TRASY) {
  for (const { nazwa, width, height } of SZEROKOSCI) {
    test(`${trasa} @${nazwa}: strona nie przewija się w bok`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await instalujAtrapy(page);
      await page.goto(trasa);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("main")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      const miara = await zmierz(page);
      // Wyjście tylko w ASCII: konsola stanowiska nie zawsze jest w UTF-8.
      const json = JSON.stringify({ trasa, szerokosc: nazwa, ...miara }).replace(
        /[\u0080-￿]/g,
        (znak) => "\\u" + znak.charCodeAt(0).toString(16).padStart(4, "0"),
      );
      console.log(`POMIAR-WBOK ${json}`);

      const katalog = process.env.PW_ZRZUTY;
      const nazwaZrzutu = ZRZUTY[trasa];
      if (katalog && nazwaZrzutu && nazwa !== "320") {
        mkdirSync(katalog, { recursive: true });
        await page.screenshot({ path: join(katalog, `${nazwaZrzutu}-${nazwa}.png`), fullPage: true });
      }

      expect(miara.tekstMain, "ekran narysowany: główny obszar ma tekst").toBeGreaterThan(0);
      expect(miara.przewijanie, "document.documentElement.scrollWidth − clientWidth (px)").toBeLessThanOrEqual(0);
    });
  }
}
