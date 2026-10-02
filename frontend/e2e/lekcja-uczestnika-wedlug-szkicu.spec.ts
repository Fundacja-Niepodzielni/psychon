import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Frame, type Page, type TestInfo } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";
import { POCHODZENIE_ODTWARZACZA } from "../lib/konfiguracja/odtwarzacz-nagran";

/**
 * Ekran lekcji uczestnika pod adresem panelu (`/panel/lekcje/[id]`), na
 * zbudowanej aplikacji, z atrapą API i atrapą sesji, z prawdziwym odtwarzaczem
 * w ramce. Adres ramki to host dozwolony w konfiguracji, ale odpowiada mu
 * atrapa strony z przechwycenia żądań (potwierdza gotowość, resztę zdarzeń
 * odtwarzacza wysyła próba), a przeglądarka nie rozwiązuje żadnej nazwy poza
 * lokalną. Po każdej próbie licznik żądań, które wyszłyby poza atrapę (do hosta
 * ramki albo do jakiegokolwiek obcego hosta), wynosi 0. Wszystkie stany na
 * 1280 i 390 px:
 *  1 brakuje czasu · 2 można ukończyć · 3 ukończona · 4 bez nagrania ·
 *  5 nagranie w przygotowaniu · 6 nagranie nie działa · 7 powrót do lekcji ·
 *  8 brak internetu przy zapisie · 9 błąd pobrania pliku · 10 wygasły dostęp ·
 *  11 ostatnia lekcja tematu · 12 ostatnia lekcja kursu · 13 czas czytania.
 * W każdym: jeden `main`, brak przewijania poziomego, cele dotyku co najmniej
 * 44 px (liczby w załączniku), dokładnie jeden zielony przycisk (ten sam
 * element na obu szerokościach), `aria-disabled` i zdanie powodu przed
 * spełnieniem warunku, przycisk w kolejności fokusu, kolejność fokusu zgodna
 * z kolejnością na ekranie, axe (WCAG 2.1 AA i `best-practice`) = 0. Na 390 px:
 * pasek postępu tematu nad nagraniem, przycisk w stałym pasku u dołu. Zrzuty
 * całej strony powstają tylko przy ustawionej zmiennej `PW_ZRZUTY`.
 */

const API = "http://localhost:8000/api/v1";
const SLUG = "wywiad-psychologiczny";
const META = { current_page: 1, per_page: 100, total: 0, last_page: 1 };
const ATRAPA_SESJI = {
  accessToken: ["atrapa", "tokenu", "testowego"].join("-"),
  expiresAt: Date.now() + 3_600_000,
};
const DLUGIE_SLOWO = "Psychologicznodiagnostycznoterapeutycznointerwencyjnokryzysowe";
const DLUGI_TYTUL = `Wprowadzenie do wywiadu ${DLUGIE_SLOWO} — część druga, rozszerzona`;
const DLUGA_NAZWA = `karta_pracy_do_lekcji_o_pytaniach_otwartych_i_zamknietych_${"wersja_poprawiona_".repeat(4)}2026.pdf`;
const TRESC = "## Cel lekcji\n\nPo tej lekcji rozróżniasz pytania otwarte i zamknięte.\n\n- pytanie otwarte zaprasza do opowieści\n- pytanie zamknięte porządkuje fakty";
const DLUGA_TRESC = `${TRESC}\n\n${"Rozmowa z osobą w kryzysie wymaga uważności, spokoju i jasnych pytań. ".repeat(60)}`;

const LEKCJE_TEMATU = [19, 20, 21, 22, 23, 24, 25];
const WYGASA_RAMKA = 4_070_908_800;

/**
 * Atrapa strony odtwarzacza w ramce: zapisuje polecenia, które dostaje od ekranu, odpowiada „gotowe” na zapis na
 * gotowość, a zdarzenia odtwarzania (`play`, `timeupdate`, ...) wysyła na prośbę próby przez `__zdarzenie`.
 */
const ATRAPA_RAMKI = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Atrapa odtwarzacza</title>
<style>html,body{margin:0;height:100%;background:#1f2937;color:#e5e7eb;font:16px/1.4 system-ui,sans-serif;display:flex;align-items:center;justify-content:center}</style></head>
<body><section aria-label="Atrapa odtwarzacza"><p>Atrapa odtwarzacza w ramce (żadne nagranie nie jest pobierane)</p></section>
<script>
window.__polecenia = [];
window.__zdarzenie = (nazwa, sekundy) =>
  parent.postMessage(JSON.stringify({ context: "player.js", version: "0.0.11", event: nazwa, ...(sekundy === null ? {} : { value: { seconds: sekundy } }) }), "*");
addEventListener("message", (z) => {
  let t; try { t = JSON.parse(z.data); } catch { return; }
  window.__polecenia.push({ method: t.method, value: t.value });
  if (t.method === "addEventListener" && t.value === "ready") window.__zdarzenie("ready", null);
});
</script></body></html>`;

// Przeglądarka nie rozwiązuje żadnej nazwy poza lokalną: ramka z hosta odtwarzacza dostaje wyłącznie atrapę.
test.use({ launchOptions: { args: ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1"] } });

interface LicznikiStrony {
  /** Odpowiedzi atrapy na żądania do hosta ramki. */
  atrapa: number;
  /** Żądania do hosta ramki, które nie zostały obsłużone przez atrapę. */
  nieudane: number;
  /** Żądania do hostów innych niż lokalny i host ramki. */
  obce: string[];
}
const LICZNIKI = new WeakMap<Page, LicznikiStrony>();
const licznikiStrony = (page: Page): LicznikiStrony => LICZNIKI.get(page)!;

test.afterEach(async ({ page }, testInfo) => {
  const liczniki = LICZNIKI.get(page);
  if (!liczniki) return;
  testInfo.annotations.push({ type: "zadania-poza-atrape", description: String(liczniki.nieudane + liczniki.obce.length) });
  expect(liczniki.nieudane, "żądania do hosta ramki poza atrapą").toBe(0);
  expect(liczniki.obce, "żądania do obcych hostów").toEqual([]);
});

const ramkaOdtwarzacza = (page: Page): Frame | undefined => page.frames().find((ramka) => ramka.url().startsWith(POCHODZENIE_ODTWARZACZA));

/** Czeka, aż ramka istnieje i zgłosiła gotowość (znika „Wczytywanie nagrania…”). */
async function poczekajNaRamke(page: Page): Promise<Frame> {
  await expect.poll(() => ramkaOdtwarzacza(page) !== undefined).toBe(true);
  await expect(page.getByText("Wczytywanie nagrania…")).toHaveCount(0);
  return ramkaOdtwarzacza(page)!;
}

async function zdarzenieRamki(ramka: Frame, nazwa: string, sekundy: number | null = null): Promise<void> {
  await ramka.evaluate(
    ([n, s]) => (window as unknown as { __zdarzenie: (a: string, b: number | null) => void }).__zdarzenie(n as string, s as number | null),
    [nazwa, sekundy],
  );
}

async function polecenia(ramka: Frame): Promise<{ method: string; value: unknown }[]> {
  return ramka.evaluate(() => (window as unknown as { __polecenia: { method: string; value: unknown }[] }).__polecenia);
}

/** Odtwarzanie przez `sekundy` sekund zegara strony (`page.clock`): `play`, potem co sekundę `timeupdate`. */
async function odtwarzajPrzez(page: Page, ramka: Frame, sekundy: number): Promise<void> {
  await zdarzenieRamki(ramka, "play");
  await zdarzenieRamki(ramka, "timeupdate", 0);
  for (let sekunda = 1; sekunda <= sekundy; sekunda += 1) {
    await page.clock.runFor(1000);
    await zdarzenieRamki(ramka, "timeupdate", sekunda);
  }
}

interface Opcje {
  id?: number;
  tytul?: string;
  video_status?: "none" | "uploading" | "processing" | "ready" | "error";
  active_seconds?: number;
  completable?: boolean;
  is_completed?: boolean;
  position_seconds?: number;
  content?: string | null;
  /** Identyfikatory lekcji ukończonych w kursie. */
  ukonczone?: number[];
  /** Układ kursu: lekcje tematu 7 i (opcjonalnie) temat 8 z lekcją 31. */
  drugiTemat?: boolean;
  pliki?: boolean;
  /** Pobieranie pliku zawsze odmawia (link wygasły także po odświeżeniu). */
  pobranieOdmawia?: boolean;
  odpowiedzLekcji?: { status: number; code: string; message: string; reason?: Record<string, unknown> };
  /** Liczniki żądań ekranu (zapis postępu), do sprawdzenia, że po odmowie nic już nie wychodzi. */
  liczniki?: { postep: number };
  zapisPostepuNiedostepny?: boolean;
  /** Rola konta z odczytu `/me` (domyślnie uczestnik). */
  rola?: string;
}

function json(dane: unknown, status = 200, meta?: unknown) {
  return { status, contentType: "application/json", body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }) };
}

function odmowa(status: number, code: string, message: string, reason?: Record<string, unknown>) {
  return { status, contentType: "application/json", body: JSON.stringify({ error: { status, code, message, ...(reason ? { reason } : {}) } }) };
}

async function instalujAtrapy(page: Page, opcje: Opcje = {}): Promise<void> {
  const id = opcje.id ?? 21;
  const ukonczone = opcje.ukonczone ?? [19, 20];
  const wymagane = 1080;
  const aktywne = opcje.active_seconds ?? 700;
  const lekcja = {
    id,
    title: opcje.tytul ?? "Wprowadzenie do wywiadu",
    description: "Kiedy pytać otwarcie, a kiedy zamknąć pytanie.",
    content: opcje.content === undefined ? TRESC : opcje.content,
    topic: { id: id === 31 ? 8 : 7, title: id === 31 ? "Zakończenie rozmowy" : "Rozmowa", position: id === 31 ? 2 : 1 },
    course: { id: 2, slug: SLUG, title: "Wywiad psychologiczny" },
    question_addressee: { name: "Marta Zielińska" },
    required_active_seconds: wymagane,
    duration_seconds: 1800,
    position_seconds: opcje.position_seconds ?? 0,
    watched_seconds: aktywne + 100,
    active_seconds: aktywne,
    is_completed: opcje.is_completed ?? false,
    completable: opcje.completable ?? aktywne >= wymagane,
    completable_at_percent: 60,
    video_status: opcje.video_status ?? "ready",
  };
  const lekcjeKursu = [
    ...LEKCJE_TEMATU.map((numer, indeks) => ({
      id: numer,
      title: numer === id ? lekcja.title : `Lekcja ${indeks + 1} tematu`,
      sequence_order: indeks + 1,
      duration_seconds: 1500,
      is_completed: ukonczone.includes(numer) || (numer === id && lekcja.is_completed),
      topic_id: 7,
    })),
    ...(opcje.drugiTemat
      ? [{ id: 31, title: "Zakończenie rozmowy", sequence_order: 8, duration_seconds: 900, is_completed: id === 31 && lekcja.is_completed, topic_id: 8 }]
      : []),
  ];
  const kurs = {
    id: 2,
    slug: SLUG,
    title: "Wywiad psychologiczny",
    status: "in_progress",
    progress_percent: 40,
    has_test: true,
    topics: [
      { id: 7, title: "Rozmowa", position: 1 },
      ...(opcje.drugiTemat ? [{ id: 8, title: "Zakończenie rozmowy", position: 2 }] : []),
    ],
    lessons: lekcjeKursu,
    materials: opcje.pliki
      ? [
          { id: 1, name: "Karta pracy.pdf", mime: "application/pdf", size: 246784, lesson_id: id, download_url: `${API}/materials/1/download?signature=stary` },
          { id: 2, name: DLUGA_NAZWA, mime: "application/pdf", size: 98304, lesson_id: id, download_url: `${API}/materials/2/download?signature=stary` },
        ]
      : [],
  };

  await page.route(`${API}/**`, (route) => route.fulfill(json([], 200, META)));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(json({ id: 1, role: opcje.rola ?? "volunteer", first_name: "Marta", program_completed_at: null })),
  );
  await page.route(`${API}/courses`, (route) =>
    route.fulfill(json([{ id: 2, slug: SLUG, title: kurs.title, sequence_order: 1, product_group: "psychon", status: "in_progress", progress_percent: 40 }])),
  );
  await page.route(`${API}/courses/${SLUG}`, (route) => route.fulfill(json(kurs)));
  await page.route(`${API}/notifications**`, (route) => route.fulfill(json([], 200, { ...META, extra: { unread: 0 } })));
  await page.route(`${API}/onboarding`, (route) =>
    route.fulfill(
      json({ video: { title: "", url: null, caption: null }, program: { title: "", body: "" }, expectations: { title: "", body: "" }, updated_at: null }),
    ),
  );
  await page.route(`${API}/lessons/${id}`, (route) =>
    opcje.odpowiedzLekcji
      ? route.fulfill(odmowa(opcje.odpowiedzLekcji.status, opcje.odpowiedzLekcji.code, opcje.odpowiedzLekcji.message, opcje.odpowiedzLekcji.reason))
      : route.fulfill(json(lekcja)),
  );
  await page.route(`${API}/lessons/${id}/questions`, (route) => route.fulfill(json([], 200, META)));
  await page.route(`${API}/lessons/${id}/progress`, (route) => {
    if (opcje.liczniki) opcje.liczniki.postep += 1;
    return opcje.zapisPostepuNiedostepny
      ? route.abort()
      : route.fulfill(json({ watched_seconds: aktywne + 100, active_seconds: aktywne, completable: lekcja.completable, completable_at_percent: 60, required_active_seconds: wymagane }));
  });
  await page.route(`${API}/lessons/${id}/video-link`, (route) =>
    route.fulfill(
      json({
        url: `${POCHODZENIE_ODTWARZACZA}/lista.m3u8`,
        embed_url: `${POCHODZENIE_ODTWARZACZA}/embed/1/lekcja-${id}?token=atrapa`,
        embed_expires_at: WYGASA_RAMKA,
      }),
    ),
  );
  const liczniki: LicznikiStrony = { atrapa: 0, nieudane: 0, obce: [] };
  LICZNIKI.set(page, liczniki);
  await page.route(`${POCHODZENIE_ODTWARZACZA}/**`, (route) => {
    liczniki.atrapa += 1;
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: ATRAPA_RAMKI });
  });
  const hostRamki = new URL(POCHODZENIE_ODTWARZACZA).hostname;
  page.on("requestfailed", (zadanie) => {
    if (zadanie.url().startsWith(POCHODZENIE_ODTWARZACZA)) liczniki.nieudane += 1;
  });
  page.on("request", (zadanie) => {
    const host = new URL(zadanie.url()).hostname;
    if (host !== "" && host !== "localhost" && host !== "127.0.0.1" && host !== hostRamki) liczniki.obce.push(host);
  });
  await page.route(`${API}/materials/*/download**`, (route) =>
    route.fulfill(
      opcje.pobranieOdmawia
        ? odmowa(403, "link_expired", "Ten link do pobrania już wygasł.")
        : { status: 200, contentType: "application/pdf", body: "%PDF-1.4 atrapa" },
    ),
  );
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json({ url: null })));
}

async function otworz(page: Page, id = 21, tytul = "Wprowadzenie do wywiadu", zapytanie = ""): Promise<void> {
  const odpowiedz = await page.goto(`/panel/lekcje/${id}${zapytanie}`);
  expect(odpowiedz?.status()).toBe(200);
  await zabezpieczeniePrzedEkranemDostepu(page);
  await expect(page.getByRole("heading", { level: 1, name: tytul })).toBeVisible();
}

async function zrzut(page: Page, numer: number | string, nazwa: string, szerokosc: number): Promise<void> {
  const katalog = process.env.PW_ZRZUTY;
  if (!katalog) return;
  mkdirSync(katalog, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: join(katalog, `uczestnik--lekcja-ramka--${[numer, nazwa].filter((czesc) => czesc !== "").join("-")}--${szerokosc}.png`),
    fullPage: true,
    animations: "disabled",
  });
}

/** Sam widoczny obszar okna telefonu (bez przewijania) — pierwszy ekran, który widzi osoba po wejściu w lekcję. */
async function zrzutPierwszegoEkranu(page: Page, numer: number, nazwa: string): Promise<void> {
  const katalog = process.env.PW_ZRZUTY;
  if (!katalog) return;
  mkdirSync(katalog, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: join(katalog, `uczestnik--lekcja-ramka--${numer}-${nazwa}--telefon-pierwszy-ekran.png`),
    fullPage: false,
    animations: "disabled",
  });
}

const PRZYCISK = "Oznacz lekcję jako ukończoną";

/** Pomiary wspólne dla każdego stanu. */
async function zmierzStan(page: Page, testInfo: TestInfo, numer: number, nazwa: string, szerokosc: number): Promise<void> {
  await expect(page.locator("main")).toHaveCount(1);

  // Brak przewijania poziomego (z listą elementów wystających poza okno).
  const przewijanie = await page.evaluate(() => {
    const szerokoscOkna = document.documentElement.clientWidth;
    const wystajace = Array.from(document.querySelectorAll<HTMLElement>("main *"))
      .filter((element) => element.getBoundingClientRect().right > szerokoscOkna + 1)
      .slice(0, 8)
      .map((element) => `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 40)}`);
    return { nadmiar: document.documentElement.scrollWidth - szerokoscOkna, wystajace };
  });
  expect(przewijanie.nadmiar, `przewijanie poziome: ${przewijanie.wystajace.join(", ")}`).toBeLessThanOrEqual(0);

  // Cele dotyku: każdy widoczny element czynny w `main` ma co najmniej 44 px wysokości (odnośniki wierszowe)
  // albo 44 px w obu wymiarach (przyciski). Liczby trafiają do załącznika.
  const cele = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("main a[href], main button, main [role='button'], main [role='slider'], main textarea, main input"))
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const ramka = element.getBoundingClientRect();
        return {
          nazwa: (element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 50),
          wysokosc: Math.round(ramka.height * 10) / 10,
          szerokosc: Math.round(ramka.width * 10) / 10,
          odnosnikWTekscie: element.tagName === "A" && element.closest("p, li, span, nav") !== null,
        };
      }),
  );
  await testInfo.attach(`cele-dotyku-${numer}-${nazwa}-${szerokosc}`, { body: JSON.stringify(cele, null, 1), contentType: "application/json" });
  const zaMale = cele.filter((cel) => cel.wysokosc < 44 || (!cel.odnosnikWTekscie && cel.szerokosc < 44));
  expect(zaMale, "cele dotyku poniżej 44 px").toEqual([]);

  // Dokładnie jeden zielony przycisk (primary) i dokładnie jeden przycisk ukończenia na ekranie.
  const zielone = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("main button"))
      .filter((przycisk) => /primary/.test(przycisk.className) && przycisk.getClientRects().length > 0)
      .map((przycisk) => (przycisk.textContent ?? "").trim()),
  );
  expect(zielone.length, `zielone przyciski: ${zielone.join(", ")}`).toBe(1);

  // Kolejność fokusu: Tab przechodzi przez elementy czynne; poza elementem stałym (pasek u dołu na 390)
  // pozycje pionowe rosną (z tolerancją na elementy w jednym wierszu).
  const kroki: { nazwa: string; gora: number; lewo: number; staly: boolean }[] = [];
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  await page.locator("main").first().evaluate((main) => {
    // Pierwszy element, który da się zobaczyć (na telefonie część elementów z szerokiego układu jest ukryta).
    const widoczne = Array.from(main.querySelectorAll<HTMLElement>("a[href], button, [tabindex='0'], textarea, input")).filter(
      (element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden",
    );
    widoczne[0]?.focus();
  });
  for (let krok = 0; krok < 60; krok += 1) {
    const biezacy = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || !document.querySelector("main")?.contains(element)) return null;
      const ramka = element.getBoundingClientRect();
      let przodek: HTMLElement | null = element;
      let staly = false;
      while (przodek && przodek !== document.body) {
        if (getComputedStyle(przodek).position === "fixed") staly = true;
        przodek = przodek.parentElement;
      }
      return {
        nazwa: (element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 40),
        gora: Math.round(ramka.top + window.scrollY),
        lewo: Math.round(ramka.left),
        staly,
      };
    });
    if (biezacy === null) break;
    if (kroki.length > 0 && kroki[0].nazwa === biezacy.nazwa && kroki[0].gora === biezacy.gora && kroki.length > 1) break;
    kroki.push(biezacy);
    await page.keyboard.press("Tab");
  }
  await testInfo.attach(`kolejnosc-fokusu-${numer}-${nazwa}-${szerokosc}`, { body: JSON.stringify(kroki, null, 1), contentType: "application/json" });
  expect(kroki.some((krok) => krok.nazwa.startsWith(PRZYCISK) || krok.nazwa.startsWith("Przejdź") || krok.nazwa.startsWith("Dalej") || /ukończ|test|kurs|temat|lekcj/i.test(krok.nazwa)), `przycisk główny w kolejności fokusu: ${kroki.map((krok) => krok.nazwa).join(" > ")}`).toBe(true);
  const bezStalych = kroki.filter((krok) => !krok.staly);
  for (let i = 1; i < bezStalych.length; i += 1) {
    expect(bezStalych[i].gora, `kolejność fokusu: „${bezStalych[i].nazwa}” po „${bezStalych[i - 1].nazwa}”`).toBeGreaterThanOrEqual(bezStalych[i - 1].gora - 8);
  }

  const naruszenia = await uruchomAxe(page);
  await dolaczNaruszeniaDoRaportu(testInfo, `axe-${numer}-${nazwa}-${szerokosc}`, naruszenia);
  expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);
  const pelny = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "best-practice"]).analyze();
  expect(
    pelny.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.map(String).join(" ")).join(" | ")}`),
    `axe z best-practice: ${nazwa}`,
  ).toEqual([]);
  await zrzut(page, numer, nazwa, szerokosc);
}

/** Układ główny: przycisk i zdanie powodu; na 390 przycisk w stałym pasku u dołu, pasek tematu nad nagraniem. */
async function zmierzUklad(page: Page, szerokosc: number, opcje: { nagranie: boolean; pasekTematu: boolean }): Promise<void> {
  const przycisk = page.getByRole("button", { name: /Oznacz lekcję|Przejdź|Dalej|test|kurs/i }).first();
  await expect(przycisk).toBeVisible();
  const ramka = await przycisk.boundingBox();
  const okno = page.viewportSize()!;
  if (szerokosc === 390) {
    const staly = await przycisk.evaluate((element) => {
      let przodek: Element | null = element;
      while (przodek && przodek !== document.body) {
        if (getComputedStyle(przodek).position === "fixed") return true;
        przodek = przodek.parentElement;
      }
      return false;
    });
    expect(staly, "przycisk w stałym pasku u dołu (390)").toBe(true);
    expect(ramka!.y + ramka!.height, "dół przycisku przy dolnej krawędzi okna").toBeGreaterThan(okno.height - 120);
  }
  if (opcje.pasekTematu && opcje.nagranie) {
    const postep = page.getByText(/^\d+ z \d+ lekcji ukończone/).first();
    const nagranie = page.locator("section[aria-labelledby='naglowek-nagrania']");
    const gornaPostepu = (await postep.boundingBox())!.y;
    const gornaNagrania = (await nagranie.boundingBox())!.y;
    expect(gornaPostepu, "pasek postępu tematu nad nagraniem").toBeLessThan(gornaNagrania);
  }
}

const OKNA = [
  { szerokosc: 1280, wysokosc: 800 },
  { szerokosc: 390, wysokosc: 844 },
];

for (const { szerokosc, wysokosc } of OKNA) {
  test.describe(`ekran lekcji uczestnika według szkicu — ${szerokosc} px`, () => {
    test.use({ viewport: { width: szerokosc, height: wysokosc } });

    test("1 brakuje czasu: przycisk jasny z kłódką i `aria-disabled`, powód obok, pasek tematu nad nagraniem", async ({ page }, testInfo) => {
      await instalujAtrapy(page, { tytul: DLUGI_TYTUL, pliki: true });
      await otworz(page, 21, DLUGI_TYTUL);

      const przycisk = page.getByRole("button", { name: PRZYCISK });
      await expect(przycisk).toHaveAttribute("aria-disabled", "true");
      const ramka = page.locator("iframe[title^='Nagranie lekcji']");
      await expect(ramka).toHaveCount(1);
      await expect(ramka).toHaveAttribute("src", `${POCHODZENIE_ODTWARZACZA}/embed/1/lekcja-21?token=atrapa`);
      await expect(page.getByRole("button", { name: /^Odtwórz/ })).toHaveCount(0);
      await poczekajNaRamke(page);
      expect(licznikiStrony(page).atrapa, "odpowiedzi atrapy ramki").toBeGreaterThan(0);
      await expect(page.getByText(/Obejrzane: \d+ z \d+ potrzebnych minut/).first()).toBeVisible();
      await expect(page.getByText(/Zanim to zrobisz/)).toHaveCount(0);
      await expect(page.getByRole("region", { name: "Materiały do pobrania" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Zapytaj prowadzącego" })).toBeVisible();
      await zmierzUklad(page, szerokosc, { nagranie: true, pasekTematu: true });
      await zmierzStan(page, testInfo, 1, "brakuje-czasu", szerokosc);
      if (szerokosc === 390) await zrzutPierwszegoEkranu(page, 1, "brakuje-czasu");
    });

    test("2 można ukończyć: przycisk czynny, bez zdania o braku czasu", async ({ page }, testInfo) => {
      await instalujAtrapy(page, { active_seconds: 1100, completable: true });
      await otworz(page);

      const przycisk = page.getByRole("button", { name: PRZYCISK });
      await expect(przycisk).not.toHaveAttribute("aria-disabled", "true");
      await zmierzUklad(page, szerokosc, { nagranie: true, pasekTematu: true });
      await zmierzStan(page, testInfo, 2, "mozna-ukonczyc", szerokosc);
    });

    test("3 ukończona: znacznik „Ukończona”, przycisk prowadzi dalej", async ({ page }, testInfo) => {
      await instalujAtrapy(page, { active_seconds: 1100, completable: true, is_completed: true, ukonczone: [19, 20, 21] });
      await otworz(page);

      await expect(page.getByText("Ukończona", { exact: true }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: PRZYCISK })).toHaveCount(0);
      await zmierzUklad(page, szerokosc, { nagranie: true, pasekTematu: true });
      await zmierzStan(page, testInfo, 3, "ukonczona", szerokosc);
    });

    test("4 bez nagrania: bez odtwarzacza, przycisk czynny jak w szkicu", async ({ page }, testInfo) => {
      await instalujAtrapy(page, { video_status: "none", active_seconds: 0, content: DLUGA_TRESC });
      await otworz(page);

      await expect(page.getByRole("button", { name: /^Odtwórz/ })).toHaveCount(0);
      await expect(page.locator("iframe")).toHaveCount(0);
      await expect(page.locator("section[aria-labelledby='naglowek-nagrania']")).toHaveCount(0);
      expect(licznikiStrony(page).atrapa, "żądania do hosta ramki").toBe(0);
      await zmierzUklad(page, szerokosc, { nagranie: false, pasekTematu: true });
      await zmierzStan(page, testInfo, 4, "bez-nagrania", szerokosc);
    });

    test("5 nagranie w przygotowaniu: jedno zdanie, tekst i materiały dostępne", async ({ page }, testInfo) => {
      await instalujAtrapy(page, { video_status: "processing", pliki: true });
      await otworz(page);

      await expect(page.getByText("Nagranie jest w przygotowaniu.", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: /^Odtwórz/ })).toHaveCount(0);
      await expect(page.locator("iframe")).toHaveCount(0);
      expect(licznikiStrony(page).atrapa, "żądania do hosta ramki").toBe(0);
      await zmierzUklad(page, szerokosc, { nagranie: true, pasekTematu: true });
      await zmierzStan(page, testInfo, 5, "w-przygotowaniu", szerokosc);
    });

    test("6 nagranie nie działa: komunikat, „Napisz do prowadzącego”, lekcji nie da się ukończyć", async ({ page }, testInfo) => {
      await instalujAtrapy(page, { video_status: "error", pliki: true });
      await otworz(page);

      await expect(page.getByText("Tego nagrania nie da się teraz obejrzeć.", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Napisz do prowadzącego" })).toBeVisible();
      await expect(page.locator("iframe")).toHaveCount(0);
      expect(licznikiStrony(page).atrapa, "żądania do hosta ramki").toBe(0);
      await expect(page.getByRole("button", { name: PRZYCISK })).toHaveAttribute("aria-disabled", "true");
      await zmierzUklad(page, szerokosc, { nagranie: true, pasekTematu: true });
      await zmierzStan(page, testInfo, 6, "nagranie-nie-dziala", szerokosc);
      if (szerokosc === 390) await zrzutPierwszegoEkranu(page, 6, "nagranie-nie-dziala");
    });

    test("7 powrót do lekcji: wznowienie od miejsca przerwania", async ({ page }, testInfo) => {
      await instalujAtrapy(page, { position_seconds: 720, active_seconds: 800, ukonczone: [19, 20] });
      await otworz(page);

      const ramka = await poczekajNaRamke(page);
      const zdanie = page.getByText("Ostatnio zatrzymano w 12. minucie. Nagranie ruszy od tego miejsca.");
      await expect(zdanie).toBeVisible();
      await expect(page.getByRole("button", { name: "Odtwórz od początku" })).toBeVisible();
      // Odtwarzacz dostaje polecenie ustawienia pozycji na 12. minutę (720 s) po zgłoszeniu gotowości.
      const pozycje = (await polecenia(ramka)).filter((p) => p.method === "setCurrentTime").map((p) => p.value);
      expect(pozycje).toEqual([720]);
      await zmierzUklad(page, szerokosc, { nagranie: true, pasekTematu: true });
      await zmierzStan(page, testInfo, 7, "powrot", szerokosc);

      // „Odtwórz od początku”: zdanie znika, a nowa ramka rusza bez polecenia pozycji.
      await page.getByRole("button", { name: "Odtwórz od początku" }).click();
      await expect(zdanie).toHaveCount(0);
      await expect
        .poll(async () => {
          const nowa = ramkaOdtwarzacza(page);
          return nowa === undefined ? [] : (await polecenia(nowa)).filter((p) => p.value === "timeupdate").map((p) => p.method);
        })
        .toEqual(["addEventListener"]);
      const odPoczatku = ramkaOdtwarzacza(page)!;
      expect((await polecenia(odPoczatku)).filter((p) => p.method === "setCurrentTime")).toEqual([]);
      expect(page.frames().filter((ramkaStrony) => ramkaStrony.url().startsWith(POCHODZENIE_ODTWARZACZA))).toHaveLength(1);
    });

    test("8 brak internetu przy zapisie postępu: zdanie o ostatnio zapisanym czasie", async ({ page }, testInfo) => {
      await page.clock.install();
      await instalujAtrapy(page, { zapisPostepuNiedostepny: true });
      await otworz(page);

      const ramka = await poczekajNaRamke(page);
      await odtwarzajPrzez(page, ramka, 35);
      await expect(page.getByText(/Brak internetu\. Ostatnio zapisane: \d+ z \d+ minut\./)).toBeVisible();
      await zmierzStan(page, testInfo, 8, "brak-internetu", szerokosc);
    });

    test("9 błąd pobrania pliku: zdanie przy pliku, reszta ekranu cała", async ({ page }, testInfo) => {
      await instalujAtrapy(page, { pliki: true, pobranieOdmawia: true });
      await otworz(page);

      const karta = page.getByRole("region", { name: "Materiały do pobrania" });
      await karta.getByRole("button", { name: /^Pobierz: Karta pracy\.pdf/ }).click();
      await expect(karta.getByRole("alert")).toHaveText(/Nie udało się pobrać pliku\. Spróbuj ponownie za chwilę\./);
      await expect(page.getByRole("button", { name: PRZYCISK })).toBeVisible();
      await zmierzStan(page, testInfo, 9, "blad-pobrania", szerokosc);
    });

    test("10 wygasły dostęp: karta „Dostęp wygasł” z powrotem do kursów", async ({ page }) => {
      await instalujAtrapy(page, { odpowiedzLekcji: { status: 403, code: "access_expired", message: "Twój dostęp do platformy wygasł." } });
      // Klient API przy `access_expired` przekierowuje na wspólny ekran startera; przekierowanie jest tu wstrzymane,
      // żeby pomierzyć kartę samego ekranu lekcji.
      await page.addInitScript(() => {
        const nawigacja = (window as unknown as { navigation?: EventTarget }).navigation;
        nawigacja?.addEventListener("navigate", (zdarzenie) => {
          const cel = (zdarzenie as unknown as { destination: { url: string }; cancelable: boolean; preventDefault: () => void }).destination.url;
          if (cel.includes("/dostep-wygasl")) zdarzenie.preventDefault();
        });
      });
      const odpowiedz = await page.goto("/panel/lekcje/21");
      expect(odpowiedz?.status()).toBe(200);
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.getByRole("heading", { level: 1, name: "Dostęp wygasł" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Wróć do kursów" })).toBeVisible();
      await expect(page.locator("main")).toHaveCount(1);
      await zrzut(page, 10, "dostep-wygasl", szerokosc);
    });

    test("11 ostatnia lekcja tematu: przycisk „Przejdź do następnego tematu”", async ({ page }, testInfo) => {
      await instalujAtrapy(page, { id: 25, tytul: "Podsumowanie rozmowy", is_completed: true, active_seconds: 1100, completable: true, ukonczone: [19, 20, 21, 22, 23, 24, 25], drugiTemat: true });
      await otworz(page, 25, "Podsumowanie rozmowy");

      await expect(page.getByRole("button", { name: /następn/i }).first()).toBeVisible();
      await zmierzUklad(page, szerokosc, { nagranie: true, pasekTematu: true });
      await zmierzStan(page, testInfo, 11, "ostatnia-lekcja-tematu", szerokosc);
    });

    test("12 ostatnia lekcja kursu: przycisk „Przejdź do testu”", async ({ page }, testInfo) => {
      await instalujAtrapy(page, { id: 31, tytul: "Zakończenie rozmowy", is_completed: true, active_seconds: 800, completable: true, ukonczone: [19, 20, 21, 22, 23, 24, 25, 31], drugiTemat: true });
      await otworz(page, 31, "Zakończenie rozmowy");

      await expect(page.getByRole("button", { name: /test/i }).first()).toBeVisible();
      await zmierzUklad(page, szerokosc, { nagranie: true, pasekTematu: false });
      await zmierzStan(page, testInfo, 12, "ostatnia-lekcja-kursu", szerokosc);
    });

    test("13 czas czytania: lekcja z długą treścią podaje „około N min czytania”", async ({ page }, testInfo) => {
      await instalujAtrapy(page, { video_status: "none", content: DLUGA_TRESC, active_seconds: 0 });
      await otworz(page);

      await expect(page.getByText(/około \d+ min czytania/)).toBeVisible();
      await zmierzStan(page, testInfo, 13, "czas-czytania", szerokosc);
    });

    test("14 lekcja zamknięta kolejnością: „Najpierw ukończ lekcję 2”, przycisk do tej lekcji, po odmowie zero zapisów postępu", async ({ page }, testInfo) => {
      const liczniki = { postep: 0 };
      await instalujAtrapy(page, {
        id: 22,
        liczniki,
        odpowiedzLekcji: { status: 403, code: "lesson_locked", message: "Najpierw ukończ poprzednią lekcję.", reason: { required_lesson_id: 20 } },
      });
      await page.route(`${API}/lessons/20`, (route) => route.fulfill(json({ id: 20 })));
      await page.goto(`/panel/lekcje/22?kurs=${SLUG}`);
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.getByRole("heading", { level: 1, name: "Najpierw ukończ lekcję 2" })).toBeVisible();

      await expect(page.getByRole("button", { name: /^Odtwórz/ })).toHaveCount(0);
      await expect(page.locator("iframe")).toHaveCount(0);
      await expect(page.getByRole("button", { name: PRZYCISK })).toHaveCount(0);
      expect(liczniki.postep, "zapisy postępu po odmowie").toBe(0);
      expect(licznikiStrony(page).atrapa, "żądania do hosta ramki po odmowie").toBe(0);
      await zmierzStan(page, testInfo, 14, "lekcja-zamknieta", szerokosc);

      await page.getByRole("button", { name: "Przejdź do lekcji 2" }).click();
      await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe(`/panel/lekcje/20?kurs=${SLUG}`);
      expect(liczniki.postep, "zapisy postępu po odmowie").toBe(0);
    });

    test("15 lekcja zamknięta, odmowa bez `reason`: zdanie serwera i odnośnik do strony kursu", async ({ page }) => {
      await instalujAtrapy(page, {
        id: 22,
        odpowiedzLekcji: { status: 403, code: "lesson_locked", message: "Najpierw ukończ poprzednią lekcję." },
      });
      await page.goto(`/panel/lekcje/22?kurs=${SLUG}`);
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.getByRole("heading", { level: 1, name: "Ta lekcja jest jeszcze zamknięta" })).toBeVisible();
      await expect(page.getByText("Najpierw ukończ poprzednią lekcję.", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Wróć do kursu" }).click();
      await expect(page).toHaveURL(new RegExp(`/panel/kursy/${SLUG}$`));
    });

    /** Żądania zapisu ekranu lekcji: postęp, ukończenie, pytanie. */
    function zbierajZapisy(page: Page): string[] {
      const zapisy: string[] = [];
      page.on("request", (zadanie) => {
        if (zadanie.method() !== "POST") return;
        if (/\/lessons\/\d+\/(progress|complete|questions)$/.test(new URL(zadanie.url()).pathname)) zapisy.push(new URL(zadanie.url()).pathname);
      });
      return zapisy;
    }

    /** Odtwarzanie w ramce, upływ czasu, kliknięcie przycisku ukończenia i wysłanie pytania. */
    async function sekwencjaZapisow(page: Page): Promise<void> {
      const ramka = await poczekajNaRamke(page);
      await odtwarzajPrzez(page, ramka, 65);
      // `force`: w podglądzie oba przyciski są `aria-disabled`, a Playwright nie klika takich elementów bez wymuszenia;
      // próba ma właśnie sprawdzić, że naciśnięcie nieczynnego przycisku niczego nie wysyła.
      await page.getByRole("button", { name: PRZYCISK }).click({ force: true });
      await page.getByRole("textbox", { name: "Twoje pytanie" }).fill("Czy mogę?", { force: true });
      await page.getByRole("button", { name: "Wyślij pytanie" }).click({ force: true });
      await page.clock.runFor(2_000);
    }

    const ZAPYTANIE_PODGLADU = `?kurs=${SLUG}&podglad=1`;

    test("16 podgląd (personel): pas, przycisk i formularz nieczynne, zero żądań zapisu, odnośniki z parametrem", async ({ page }, testInfo) => {
      await page.clock.install();
      const zapisy = zbierajZapisy(page);
      await instalujAtrapy(page, { rola: "project_manager", active_seconds: 1100, completable: true });
      await otworz(page, 21, "Wprowadzenie do wywiadu", ZAPYTANIE_PODGLADU);

      const pas = page.getByRole("region", { name: "Tryb podglądu" });
      await expect(pas).toContainText("Tryb podglądu. Widzisz kurs tak, jak uczestnik. Nic się nie zapisuje.");
      await expect(pas.getByRole("link", { name: "Wróć do edycji kursu" })).toHaveAttribute("href", "/admin/kursy/2");
      const przycisk = page.getByRole("button", { name: PRZYCISK });
      await expect(przycisk).toHaveAttribute("aria-disabled", "true");
      await expect(page.getByText("W podglądzie nic się nie zapisuje").first()).toBeVisible();
      await expect(page.getByRole("group", { name: "Formularz pytania" })).toHaveAttribute("aria-disabled", "true");
      await expect(page.getByRole("button", { name: "Wyślij pytanie" })).toHaveAttribute("aria-disabled", "true");

      const odnosniki = await page.locator("main a[href^='/']").evaluateAll((elementy) =>
        elementy.map((element) => ({ nazwa: (element.textContent ?? "").trim(), adres: element.getAttribute("href") ?? "" })),
      );
      for (const odnosnik of odnosniki.filter((o) => o.nazwa !== "Wróć do edycji kursu")) {
        expect(odnosnik.adres, odnosnik.nazwa).toContain("podglad=1");
      }

      await sekwencjaZapisow(page);
      testInfo.annotations.push({ type: "zapisy-w-podgladzie", description: String(zapisy.length) });
      expect(zapisy, "żądania zapisu w podglądzie").toEqual([]);
      await zmierzStan(page, testInfo, 16, "podglad", szerokosc);
      await zrzut(page, "podglad", "", szerokosc);
    });

    test("17 podgląd (prowadzący): pas z powrotem do kursu prowadzącego, zero żądań zapisu", async ({ page }) => {
      await page.clock.install();
      const zapisy = zbierajZapisy(page);
      await instalujAtrapy(page, { rola: "instructor", active_seconds: 1100, completable: true });
      await otworz(page, 21, "Wprowadzenie do wywiadu", ZAPYTANIE_PODGLADU);

      await expect(page.getByRole("link", { name: "Wróć do edycji kursu" })).toHaveAttribute("href", "/prowadzacy/kursy/2");
      await sekwencjaZapisow(page);
      expect(zapisy, "żądania zapisu w podglądzie").toEqual([]);
    });

    test("18 kontrola dodatnia: ta sama sekwencja bez podglądu wysyła postęp, ukończenie i pytanie", async ({ page }) => {
      await page.clock.install();
      const zapisy = zbierajZapisy(page);
      await instalujAtrapy(page, { rola: "project_manager", active_seconds: 1100, completable: true });
      await otworz(page, 21, "Wprowadzenie do wywiadu", `?kurs=${SLUG}`);

      await expect(page.getByRole("region", { name: "Tryb podglądu" })).toHaveCount(0);
      await sekwencjaZapisow(page);
      expect(zapisy.some((adres) => adres.endsWith("/progress")), `żądania: ${zapisy.join(", ")}`).toBe(true);
      expect(zapisy.some((adres) => adres.endsWith("/complete"))).toBe(true);
      expect(zapisy.some((adres) => adres.endsWith("/questions"))).toBe(true);
    });

    test("19 uczestnik z parametrem podglądu: ekran jak zwykle, bez pasa, przycisk czynny", async ({ page }) => {
      await instalujAtrapy(page, { rola: "volunteer", active_seconds: 1100, completable: true });
      await otworz(page, 21, "Wprowadzenie do wywiadu", ZAPYTANIE_PODGLADU);

      await expect(page.getByRole("region", { name: "Tryb podglądu" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: PRZYCISK })).not.toHaveAttribute("aria-disabled", "true");
    });
  });
}
