import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { POCHODZENIE_ODTWARZACZA } from "../lib/konfiguracja/odtwarzacz-nagran";

/** Atrapa strony odtwarzacza w ramce: odpowiada „gotowe” na prośbę o nasłuch (jak w specu stanu nagrania). */
const ATRAPA_RAMKI = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Atrapa odtwarzacza</title></head>
<body><p>Atrapa odtwarzacza</p>
<script>
addEventListener("message", (z) => {
  let t; try { t = JSON.parse(z.data); } catch { return; }
  if (t.method === "addEventListener" && t.value === "ready")
    parent.postMessage(JSON.stringify({ context: "player.js", version: "0.0.11", event: "ready" }), "*");
});
</script></body></html>`;

// Przeglądarka nie rozwiązuje żadnej nazwy poza lokalną: ramka z hosta odtwarzacza dostaje wyłącznie atrapę.
test.use({ launchOptions: { args: ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1"] } });

/**
 * Równe kafle liczb na trzech pulpitach (uczestnika, prowadzącego, administracji),
 * na zbudowanej aplikacji z atrapami API i sesji (żadne żądanie nie wychodzi
 * poza przeglądarkę):
 * - od 1180 px (mierzone przy 1280) kafle uczestnika i prowadzącego leżą na
 *   wspólnych liniach: linia podstawowa liczby i górna krawędź bloku pod liczbą
 *   (pasek z podpisem, sam podpis) są równe we wszystkich czterech kafelkach;
 * - poniżej 1180 px (1000 i 390) układ jest dawny: żaden kafel nie jest
 *   siatką ani podsiatką;
 * - kafle administracji są równe na 1280 i 390 px (szerokość, wysokość, górna
 *   krawędź liczby), liczba ma 30 px, a jednostka jest mała;
 * - strona nie przewija się w bok przy 1280, 390 i 320 px;
 * - teksty: „obejrzane 12 z 20 minut”, podpis superwizji z godziną, miejscem
 *   i zapisami, „Możesz zaznaczyć lekcję jako ukończoną.”.
 * Pomiary w pikselach trafiają do raportu (załącznik `pomiar-*`).
 */

const API = "http://localhost:8000/api/v1";
const ATRAPA_SESJI = {
  accessToken: ["atrapa", "tokenu", "testowego"].join("-"),
  expiresAt: Date.now() + 3_600_000,
};
const META = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

const SZEROKOSCI = [
  { nazwa: "1280", width: 1280, height: 800 },
  { nazwa: "1000", width: 1000, height: 800 },
  { nazwa: "390", width: 390, height: 844 },
] as const;

function json(dane: unknown, meta?: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }) };
}

async function sesja(page: Page): Promise<void> {
  await page.route("**/api/auth/session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }));
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json({ url: null })));
}

const KURSY = [
  { id: 1, slug: "podstawy-pomocy", title: "Podstawy pomocy psychologicznej", sequence_order: 1, product_group: "psychon", status: "completed", progress_percent: 100 },
  { id: 2, slug: "wywiad-psychologiczny", title: "Wywiad psychologiczny", sequence_order: 2, product_group: "psychon", status: "in_progress", progress_percent: 40 },
];

async function atrapyUczestnika(page: Page): Promise<void> {
  await page.route(`${API}/**`, (route) => route.fulfill(json([], META)));
  await page.route(`${API}/me`, (route) => route.fulfill(json({ id: 1, role: "volunteer", first_name: "Marta", program_completed_at: null })));
  await page.route(`${API}/courses`, (route) => route.fulfill(json(KURSY)));
  await page.route(`${API}/courses/wywiad-psychologiczny`, (route) =>
    route.fulfill(
      json({
        ...KURSY[1],
        has_test: true,
        topics: [{ id: 7, title: "Rozmowa", position: 1 }],
        lessons: [
          {
            id: 21,
            title: "Wprowadzenie do wywiadu",
            sequence_order: 1,
            duration_seconds: 1200,
            active_seconds: 720,
            required_active_seconds: 720,
            has_recording: true,
            is_completed: false,
            locked: false,
            topic_id: 7,
          },
          { id: 22, title: "Pytania otwarte i zamknięte", sequence_order: 2, duration_seconds: 1500, active_seconds: 0, required_active_seconds: 900, has_recording: true, is_completed: false, locked: true, topic_id: 7 },
        ],
        materials: [],
      }),
    ),
  );
  await page.route(`${API}/certificate/conditions`, (route) =>
    route.fulfill(
      json({
        eligible: false,
        conditions: [
          { key: "courses", label: "Wszystkie etapy i testy", done: 8, required: 10, met: false },
          { key: "internship", label: "Godziny stażu", done: "41.5", required: "72", met: false },
          { key: "supervision", label: "Obecności na superwizjach", done: 5, required: 6, met: false },
          { key: "workshop", label: "Warsztat stacjonarny", met: false },
        ],
      }),
    ),
  );
  await page.route(`${API}/internship/entries**`, (route) =>
    route.fulfill(json([], { ...META, extra: { accepted_hours: "41.5", required_hours: "72" } })),
  );
  await sesja(page);
}

function terminZa(dni: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dni);
  d.setUTCHours(16, 0, 0, 0);
  return d.toISOString();
}

async function atrapyProwadzacego(page: Page): Promise<void> {
  await page.route(`${API}/**`, (route) => route.fulfill(json([], META)));
  await page.route(`${API}/me`, (route) => route.fulfill(json({ id: 1, role: "instructor" })));
  await page.route(`${API}/instructor/group`, (route) =>
    route.fulfill(
      json({
        members: [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111].map((id) => ({
          id,
          first_name: "Osoba",
          last_name: `Demo ${id}`,
          progress: { courses_done: 2, courses_total: 10, hours_accepted: "41.5", supervision_present: 5, workshop_done: false },
        })),
        slots: [
          {
            id: 9,
            starts_at: terminZa(5),
            duration_minutes: 90,
            seats_limit: 8,
            location_or_link: "https://spotkanie.atrapa.test/superwizja",
            active_signups_count: 6,
            available_seats: 2,
            status: "scheduled",
            cancelled_at: null,
            can_mark_attendance: false,
            signups: [],
          },
        ],
      }),
    ),
  );
  await page.route(`${API}/instructor/questions**`, (route) =>
    route.fulfill(
      json(
        [
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
        { ...META, extra: { unanswered: 3 } },
      ),
    ),
  );
  await page.route(`${API}/instructor/courses`, (route) =>
    route.fulfill(json([{ id: 5, slug: "wywiad", title: "Wywiad psychologiczny", sequence_order: 2 }, { id: 6, slug: "interwencja", title: "Interwencja kryzysowa", sequence_order: 3 }])),
  );
  await sesja(page);
}

async function atrapyAdministracji(page: Page): Promise<void> {
  await page.route(`${API}/**`, (route) => route.fulfill(json([], META)));
  await page.route(`${API}/me`, (route) => route.fulfill(json({ id: 1, role: "project_manager", program_completed_at: null })));
  await page.route(`${API}/admin/dashboard`, (route) =>
    route.fulfill(
      json({
        counters: { participants: 12, completed: 3, certificates: 3 },
        queues: [
          { key: "applications", count: 5, link: "/admin/uczestniczki" },
          { key: "internship_entries", count: 7, link: "/admin/staz" },
          { key: "profiles", count: 1, link: "/admin/profile" },
          { key: "questions", count: 2, link: "/prowadzacy/pytania" },
        ],
      }),
    ),
  );
  await sesja(page);
}

async function atrapyLekcji(page: Page): Promise<void> {
  await page.route(`${API}/**`, (route) => route.fulfill(json([], META)));
  await page.route(`${API}/me`, (route) => route.fulfill(json({ id: 1, role: "volunteer", first_name: "Marta", program_completed_at: null })));
  await page.route(`${API}/notifications**`, (route) => route.fulfill(json([], { ...META, extra: { unread: 0 } })));
  await page.route(`${API}/lessons/21`, (route) =>
    route.fulfill(
      json({
        id: 21,
        title: "Wprowadzenie do wywiadu",
        description: "Kiedy pytać otwarcie, a kiedy zamknąć pytanie.",
        content: "## Cel lekcji\n\nPo tej lekcji rozróżniasz pytania otwarte i zamknięte.",
        topic: { id: 7, title: "Rozmowa", position: 1 },
        course: { id: 2, slug: "wywiad-psychologiczny", title: "Wywiad psychologiczny" },
        question_addressee: { name: "Marta Zielińska" },
        required_active_seconds: 1080,
        duration_seconds: 1800,
        position_seconds: 0,
        watched_seconds: 0,
        active_seconds: 1100,
        is_completed: false,
        completable: true,
        completable_at_percent: 60,
        video_status: "ready",
      }),
    ),
  );
  await page.route(`${API}/lessons/21/video-link`, (route) =>
    route.fulfill(json({ url: "https://nagrania.atrapa.test/lista.m3u8", embed_url: `${POCHODZENIE_ODTWARZACZA}/embed/1/lekcja-21?token=atrapa`, embed_expires_at: 4_070_908_800 })),
  );
  await page.route("https://nagrania.atrapa.test/**", (route) => route.abort());
  await page.route(`${POCHODZENIE_ODTWARZACZA}/**`, (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: ATRAPA_RAMKI }));
  await page.route(`${API}/courses/**`, (route) =>
    route.fulfill(
      json({
        id: 2,
        slug: "wywiad-psychologiczny",
        title: "Wywiad psychologiczny",
        status: "in_progress",
        progress_percent: 40,
        has_test: true,
        topics: [{ id: 7, title: "Rozmowa", position: 1 }],
        lessons: [{ id: 21, title: "Wprowadzenie do wywiadu", sequence_order: 1, duration_seconds: 1800, is_completed: false, topic_id: 7 }],
        materials: [],
      }),
    ),
  );
  await sesja(page);
}

interface PomiarKafla {
  id: string;
  kafel: { x: number; szer: number; wys: number; gora: number };
  wartoscGora: number;
  rozmiarCzcionki: string;
  rozmiarJednostki: string | null;
  liniaPodstawowa: number;
  blokGora: number | null;
  pasekGora: number | null;
  dzieci: number;
  uklad: string;
  wiersze: string;
}

async function zmierzKafle(page: Page, idy: readonly string[]): Promise<PomiarKafla[]> {
  return page.evaluate((lista) => {
    const zaokragl = (n: number) => Math.round(n * 100) / 100;
    return lista.map((id) => {
      const wartosc = document.getElementById(id) as HTMLElement;
      const kafel = wartosc.parentElement as HTMLElement;
      const znacznik = document.createElement("span");
      znacznik.style.cssText = "display:inline-block;width:0;height:0";
      wartosc.appendChild(znacznik);
      const liniaPodstawowa = znacznik.getBoundingClientRect().bottom;
      znacznik.remove();
      const ramka = kafel.getBoundingClientRect();
      const blok = kafel.children[2] as HTMLElement | undefined;
      const pasek = kafel.querySelector('[role="progressbar"]');
      const jednostka = wartosc.querySelector("span > span + span") as HTMLElement | null;
      const styl = getComputedStyle(kafel);
      return {
        id,
        kafel: { x: zaokragl(ramka.left), szer: zaokragl(ramka.width), wys: zaokragl(ramka.height), gora: zaokragl(ramka.top) },
        wartoscGora: zaokragl(wartosc.getBoundingClientRect().top),
        rozmiarCzcionki: getComputedStyle(wartosc).fontSize,
        rozmiarJednostki: jednostka ? getComputedStyle(jednostka).fontSize : null,
        liniaPodstawowa: zaokragl(liniaPodstawowa),
        blokGora: blok ? zaokragl(blok.getBoundingClientRect().top) : null,
        pasekGora: pasek ? zaokragl(pasek.getBoundingClientRect().top) : null,
        dzieci: kafel.children.length,
        uklad: styl.display,
        wiersze: styl.gridTemplateRows,
      };
    });
  }, idy);
}

/** Widoczne odnośniki i przyciski w `main` o wysokości poniżej 44 px (lista do raportu, nie warunek). */
async function zaMaleCele(page: Page): Promise<{ nazwa: string; wysokosc: number }[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("main a[href], main button"))
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => ({ nazwa: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 50), wysokosc: Math.round(el.getBoundingClientRect().height * 10) / 10 }))
      .filter((cel) => cel.wysokosc < 44),
  );
}

async function przewijanieWBok(page: Page): Promise<number> {
  return page.evaluate(() => Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, document.body.scrollWidth - document.body.clientWidth));
}

function rowne(wartosci: (number | null)[], opis: string): void {
  const liczby = wartosci.filter((w): w is number => w !== null);
  expect(Math.max(...liczby) - Math.min(...liczby), `${opis}: ${JSON.stringify(wartosci)}`).toBeLessThanOrEqual(0.5);
}

const UCZESTNIK = ["pulpit-etapy", "pulpit-biezacy-etap", "pulpit-godziny-stazu", "pulpit-superwizje"] as const;
const PROWADZACY = ["pulpit-pytania", "pulpit-grupa", "pulpit-kursy", "pulpit-superwizja"] as const;
const ADMINISTRACJA = ["pulpit-sprawy", "pulpit-uczestnicy", "pulpit-ukonczenia", "pulpit-certyfikaty"] as const;

for (const okno of SZEROKOSCI) {
  test.describe(`pulpity: równe kafle — ${okno.nazwa} px`, () => {
    test.use({ viewport: { width: okno.width, height: okno.height } });
    const szeroki = okno.width >= 1180;

    test("pulpit uczestnika: cztery liczby na jednej linii, bloki pod liczbą na jednej wysokości; zdanie o obejrzanych minutach", async ({ page }, testInfo) => {
      await atrapyUczestnika(page);
      const odpowiedz = await page.goto("/panel/pulpit");
      expect(odpowiedz?.status()).toBe(200);
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.locator(`#${UCZESTNIK[3]}`)).toBeVisible();
      await expect(page.getByText(/obejrzane 12 z 20 minut/)).toBeVisible();
      await expect(page.locator("main")).not.toContainText(/zatrzymał/i);

      const pomiar = await zmierzKafle(page, UCZESTNIK);
      await testInfo.attach(`pomiar-uczestnik-${okno.nazwa}`, { body: JSON.stringify(pomiar, null, 1), contentType: "application/json" });
      for (const kafel of pomiar) expect(kafel.dzieci, kafel.id).toBeLessThanOrEqual(3);
      if (szeroki) {
        for (const kafel of pomiar) expect(kafel.wiersze, `${kafel.id}: podsiatka`).not.toBe("none");
        rowne(pomiar.map((k) => k.liniaPodstawowa), "linia podstawowa liczby");
        rowne(pomiar.map((k) => k.blokGora), "górna krawędź bloku pod liczbą");
        rowne(pomiar.map((k) => k.pasekGora), "górna krawędź paska");
        rowne(pomiar.map((k) => k.kafel.gora), "górna krawędź kafla");
      } else {
        for (const kafel of pomiar) expect(kafel.uklad, `${kafel.id}: układ dawny poniżej 1180 px`).not.toBe("grid");
      }
      expect(await przewijanieWBok(page), "przewijanie w bok").toBe(0);
      await testInfo.attach(`cele-dotyku-${testInfo.title.slice(0, 20)}-${okno.nazwa}`, { body: JSON.stringify(await zaMaleCele(page)), contentType: "application/json" });
    });

    test("pulpit prowadzącego: cztery liczby na jednej linii, podpisy na jednej wysokości; podpis superwizji", async ({ page }, testInfo) => {
      await atrapyProwadzacego(page);
      const odpowiedz = await page.goto("/prowadzacy");
      expect(odpowiedz?.status()).toBe(200);
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.locator(`#${PROWADZACY[3]}`)).toBeVisible();
      await expect(page.getByText(/^\d{2}:\d{2} online · zapisanych 6 z 8 miejsc$/)).toBeVisible();

      const pomiar = await zmierzKafle(page, PROWADZACY);
      await testInfo.attach(`pomiar-prowadzacy-${okno.nazwa}`, { body: JSON.stringify(pomiar, null, 1), contentType: "application/json" });
      for (const kafel of pomiar) expect(kafel.dzieci, kafel.id).toBeLessThanOrEqual(3);
      if (szeroki) {
        rowne(pomiar.map((k) => k.liniaPodstawowa), "linia podstawowa liczby");
        rowne(pomiar.map((k) => k.kafel.gora), "górna krawędź kafla");
        const podpis = pomiar.find((k) => k.id === "pulpit-superwizja");
        expect(podpis?.blokGora, "podpis superwizji stoi pod liczbą").not.toBeNull();
        expect(podpis!.blokGora!, "podpis pod linią liczby").toBeGreaterThan(podpis!.liniaPodstawowa);
      } else {
        for (const kafel of pomiar) expect(kafel.uklad, `${kafel.id}: układ dawny poniżej 1180 px`).not.toBe("grid");
      }
      expect(await przewijanieWBok(page), "przewijanie w bok").toBe(0);
      await testInfo.attach(`cele-dotyku-${testInfo.title.slice(0, 20)}-${okno.nazwa}`, { body: JSON.stringify(await zaMaleCele(page)), contentType: "application/json" });
    });

    test("pulpit administracji: cztery równe kafle, liczba 30 px, jednostka mała", async ({ page }, testInfo) => {
      await atrapyAdministracji(page);
      const odpowiedz = await page.goto("/admin");
      expect(odpowiedz?.status()).toBe(200);
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.locator(`#${ADMINISTRACJA[3]}`)).toBeVisible();

      const pomiar = await zmierzKafle(page, ADMINISTRACJA);
      await testInfo.attach(`pomiar-administracja-${okno.nazwa}`, { body: JSON.stringify(pomiar, null, 1), contentType: "application/json" });
      expect(pomiar).toHaveLength(4);
      for (const kafel of pomiar) {
        expect(kafel.rozmiarCzcionki, `${kafel.id}: rozmiar liczby`).toBe("30px");
        expect(kafel.rozmiarJednostki, `${kafel.id}: rozmiar jednostki`).toBe("16px");
      }
      rowne(pomiar.map((k) => k.kafel.szer), "szerokość kafla");
      if (szeroki) rowne(pomiar.map((k) => k.kafel.wys), "wysokość kafla");
      if (szeroki) rowne(pomiar.map((k) => k.wartoscGora), "górna krawędź liczby");
      expect(await przewijanieWBok(page), "przewijanie w bok").toBe(0);
      await testInfo.attach(`cele-dotyku-${testInfo.title.slice(0, 20)}-${okno.nazwa}`, { body: JSON.stringify(await zaMaleCele(page)), contentType: "application/json" });
    });
  });
}

test.describe("pulpity i lekcja: brak przewijania w bok przy 390 i 320 px", () => {
  for (const szerokosc of [390, 320]) {
    test.describe(`${szerokosc} px`, () => {
      test.use({ viewport: { width: szerokosc, height: 844 } });

      test("trzy pulpity i lekcja", async ({ page }, testInfo) => {
        const wyniki: Record<string, number> = {};
        await atrapyUczestnika(page);
        await page.goto("/panel/pulpit");
        await expect(page.locator(`#${UCZESTNIK[3]}`)).toBeVisible();
        wyniki.uczestnik = await przewijanieWBok(page);

        await page.unrouteAll({ behavior: "ignoreErrors" });
        await atrapyProwadzacego(page);
        await page.goto("/prowadzacy");
        await expect(page.locator(`#${PROWADZACY[3]}`)).toBeVisible();
        wyniki.prowadzacy = await przewijanieWBok(page);

        await page.unrouteAll({ behavior: "ignoreErrors" });
        await atrapyAdministracji(page);
        await page.goto("/admin");
        await expect(page.locator(`#${ADMINISTRACJA[3]}`)).toBeVisible();
        wyniki.administracja = await przewijanieWBok(page);

        await page.unrouteAll({ behavior: "ignoreErrors" });
        await atrapyLekcji(page);
        await page.goto("/nowy-front/lekcja/21");
        await expect(page.getByRole("heading", { level: 1, name: "Wprowadzenie do wywiadu" })).toBeVisible();
        await expect(page.getByText("Możesz zaznaczyć lekcję jako ukończoną.")).toBeVisible();
        wyniki.lekcja = await przewijanieWBok(page);

        await testInfo.attach(`przewijanie-${szerokosc}`, { body: JSON.stringify(wyniki), contentType: "application/json" });
        expect(wyniki).toEqual({ uczestnik: 0, prowadzacy: 0, administracja: 0, lekcja: 0 });
      });
    });
  }
});
