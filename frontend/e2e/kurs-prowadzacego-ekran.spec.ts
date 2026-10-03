import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";

/**
 * Ekran kursu i strona lekcji w roli prowadzącego obok tych samych ekranów
 * administracji, na zbudowanej aplikacji, z atrapą API przez `page.route`
 * i atrapą sesji. Prowadzący — trasa robocza `/nowy-front/kurs/4`
 * (i `?lekcja=21`), bo grupa `kurs` w rejestrze przełączenia jest wyłączona;
 * administracja — adresy produktu `/admin/kursy/4` i `/admin/kursy/4/lekcje/21`.
 * Na 1280 i 390 px. U prowadzącego: same trasy `/instructor/…`, „Opublikuj
 * kurs” z `aria-disabled` i widocznym powodem, brak prowadzącego kursu,
 * zaproszeń i usunięcia kursu, brak kart nagrania i plików na stronie lekcji,
 * 0 naruszeń axe, brak przewijania w poziomie. Zrzuty całej strony powstają
 * tylko przy ustawionej zmiennej `PW_ZRZUTY` (katalog poza repozytorium).
 */

const SZEROKOSCI = [1280, 390] as const;

const ATRAPA_SESJI = {
  accessToken: ["atrapa", "tokenu", "testowego"].join("-"),
  expiresAt: Date.now() + 3_600_000,
};

const META_PUSTA = { current_page: 1, per_page: 100, total: 0, last_page: 1 };

const KURS = {
  id: 4,
  title: "Wywiad psychologiczny",
  slug: "wywiad-psychologiczny",
  description: "Jak prowadzić pierwszą rozmowę i o co pytać.",
  type: "course",
  product_group: "psychon",
  sequence_order: 2,
  edition_id: 1,
  is_published: false,
  lessons_count: 4,
  materials_count: 2,
  created_at: "2026-09-01T08:00:00Z",
  updated_at: "2026-09-01T08:00:00Z",
  publication_gaps: { blocking: [], waiting: [] },
};

function lekcja(id: number, title: string, topicId: number, pozycja: number, reszta: Record<string, unknown> = {}) {
  return {
    id,
    course_id: 4,
    title,
    description: "Krótki opis lekcji.",
    content: "## Cel lekcji\n\nPierwszy akapit treści lekcji.",
    sequence_order: id - 20,
    topic_id: topicId,
    topic_position: pozycja,
    video_provider_id: `wideo-${id}` as string | null,
    duration_seconds: 1500,
    materials_count: 0,
    created_at: "2026-09-01T08:00:00Z",
    updated_at: "2026-09-01T08:00:00Z",
    video_status: "ready" as string | null,
    video_status_at: "2026-10-01T12:00:00Z" as string | null,
    video_ready: true,
    video_pending: false,
    ...reszta,
  };
}

const LEKCJE = [
  lekcja(21, "Wprowadzenie do wywiadu", 7, 1, { materials_count: 2 }),
  lekcja(22, "Pytania otwarte i zamknięte", 7, 2),
  lekcja(23, "Ćwiczenie w parach", 8, 1),
  lekcja(24, "Podsumowanie rozmowy", 8, 2, {
    video_provider_id: null,
    video_status: "none",
    video_status_at: null,
    video_ready: false,
  }),
];

function temat(id: number, title: string, position: number, lesson_ids: number[]) {
  return { id, course_id: 4, title, position, lesson_ids, created_at: null, updated_at: null };
}

const TEMATY = [temat(7, "Podstawy", 1, [21, 22]), temat(8, "Praktyka", 2, [23, 24])];

const MATERIALY = [
  { id: 12, name: "Karta pracy.pdf", mime: "application/pdf", size: 245760, lesson_id: 21, course_id: null, created_at: "2026-10-01T10:00:00Z" },
  { id: 15, name: "Slajdy.pdf", mime: "application/pdf", size: 1048576, lesson_id: 21, course_id: null, created_at: "2026-10-01T10:05:00Z" },
];

type Rola = "instructor" | "admin";

function json(dane: unknown, meta?: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }),
  };
}

/** Atrapa API niezależna od hosta zaplecza zapisanego w zbudowanej aplikacji. */
async function przygotuj(page: Page, rola: Rola): Promise<{ sciezki: string[] }> {
  const sciezki: string[] = [];
  page.on("request", (zadanie) => {
    const adres = new URL(zadanie.url());
    if (adres.pathname.startsWith("/api/v1/")) sciezki.push(adres.pathname.replace("/api/v1", ""));
  });

  await page.route(
    (adres) => adres.pathname.startsWith("/api/v1/"),
    async (route) => {
      const sciezka = new URL(route.request().url()).pathname.replace("/api/v1", "");
      if (sciezka === "/me") {
        return route.fulfill(
          json({
            id: rola === "instructor" ? 5 : 1,
            role: rola === "instructor" ? "instructor" : "project_manager",
            first_name: rola === "instructor" ? "Joanna" : "Anna",
            program_completed_at: null,
          }),
        );
      }
      if (sciezka.startsWith("/notifications")) {
        return route.fulfill(json([], { ...META_PUSTA, per_page: 25, extra: { unread: 0 } }));
      }
      const grupa = /^\/(admin|instructor)\//.exec(sciezka)?.[1];
      if (grupa === rola) {
        const wGrupie = sciezka.replace(`/${grupa}`, "");
        if (wGrupie === "/courses/4") return route.fulfill(json(KURS));
        if (wGrupie === "/courses/4/lessons") return route.fulfill(json(LEKCJE));
        if (wGrupie === "/courses/4/topics") return route.fulfill(json(TEMATY));
        if (wGrupie === "/courses/4/tests") {
          return route.fulfill(json({ id: 31, course_id: 4, pass_threshold: 80, attempts_limit: 3, question_count: 2 }));
        }
        if (rola === "admin") {
          if (wGrupie === "/courses/4/assignments") {
            return route.fulfill(
              json([{ id: 1, course_id: 4, lesson_id: null, instructor: { id: 5, first_name: "Joanna", last_name: "Demo" } }]),
            );
          }
          if (wGrupie === "/lessons/21/materials") return route.fulfill(json(MATERIALY));
          const nagranie = /^\/lessons\/(\d+)\/video-status$/.exec(wGrupie);
          if (nagranie) {
            const wpis = LEKCJE.find((kandydat) => kandydat.id === Number(nagranie[1]));
            const gotowe = wpis?.video_status === "ready";
            return route.fulfill(
              json({
                status: gotowe ? "finished" : "no_video",
                duration_seconds: 1500,
                preview_embed_url: null,
                video_status: wpis?.video_status ?? "none",
                video_status_at: wpis?.video_status_at ?? null,
                video_ready: gotowe,
                video_pending: false,
              }),
            );
          }
        }
      }
      return route.fulfill(json([], META_PUSTA));
    },
  );

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json({ url: null })));
  return { sciezki };
}

async function zrzut(page: Page, nazwa: string): Promise<void> {
  const katalog = process.env.PW_ZRZUTY;
  if (!katalog) return;
  mkdirSync(katalog, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  const okno = page.viewportSize()!;
  const potrzebna = await page.evaluate(() => {
    const boczna = document.querySelector<HTMLElement>("[data-obszar='boczna']");
    const dol = boczna ? boczna.getBoundingClientRect().top + boczna.scrollHeight + 48 : 0;
    return Math.ceil(Math.max(dol, window.innerHeight));
  });
  await page.setViewportSize({ width: okno.width, height: potrzebna });
  await page.screenshot({ path: join(katalog, `${nazwa}.png`), fullPage: true, animations: "disabled" });
  await page.setViewportSize(okno);
}

interface PomiarSzerokosci {
  nadwyzka: number;
  /** Najgłębsze elementy wystające poza okno: ścieżka, krawędzie, szerokość, `position`. */
  wystajace: string[];
}

/** Nadwyżka szerokości dokumentu i elementy, które ją dają (najgłębsze w drzewie). */
async function zmierzSzerokosc(page: Page): Promise<PomiarSzerokosci> {
  return page.evaluate(() => {
    const korzen = document.documentElement;
    const okno = korzen.clientWidth;
    const opis = (element: Element): string => {
      const czesci: string[] = [];
      let biezacy: Element | null = element;
      while (biezacy && biezacy !== document.body && czesci.length < 4) {
        const klasa = typeof biezacy.className === "string" ? biezacy.className.split(/\s+/)[0] : "";
        const obszar = biezacy.getAttribute("data-obszar");
        czesci.unshift(
          `${biezacy.tagName.toLowerCase()}${klasa ? "." + klasa : ""}${obszar ? `[data-obszar=${obszar}]` : ""}`,
        );
        biezacy = biezacy.parentElement;
      }
      return czesci.join(" > ");
    };
    const poza = Array.from(document.body.querySelectorAll("*")).filter((element) => {
      const ramka = element.getBoundingClientRect();
      return ramka.width > 0 && (ramka.right > okno + 0.5 || ramka.left < -0.5);
    });
    const najglebsze = poza.filter((element) => !poza.some((inny) => inny !== element && element.contains(inny)));
    return {
      nadwyzka: korzen.scrollWidth - okno,
      wystajace: najglebsze.slice(0, 12).map((element) => {
        const ramka = element.getBoundingClientRect();
        const styl = getComputedStyle(element);
        return `${opis(element)} — left ${Math.round(ramka.left)}, right ${Math.round(ramka.right)}, width ${Math.round(ramka.width)}, position ${styl.position} (okno ${okno})`;
      }),
    };
  });
}

async function bezPrzewijaniaPoziomego(page: Page): Promise<void> {
  const pomiar = await zmierzSzerokosc(page);
  expect(pomiar.nadwyzka, `przewijanie poziome; wystają:\n${pomiar.wystajace.join("\n")}`).toBeLessThanOrEqual(0);
}

async function otworz(page: Page, adres: string): Promise<void> {
  const odpowiedz = await page.goto(adres);
  expect(odpowiedz?.status()).toBe(200);
  await zabezpieczeniePrzedEkranemDostepu(page);
}

async function kursGotowy(page: Page, rola: Rola): Promise<void> {
  await expect(page.getByRole("heading", { level: 1, name: KURS.title })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Tematy i lekcje" })).toBeVisible();
  // Wiersz testu w obu rolach; odnośnik prowadzi do ekranu pytań testu w panelu danej roli, z numerem kursu.
  await expect(page.getByRole("link", { name: "Otwórz pytania" })).toHaveAttribute(
    "href",
    rola === "admin" ? "/admin/testy/31/pytania?kurs=4" : "/prowadzacy/testy/31/pytania?kurs=4",
  );
  if (rola === "admin") {
    await expect(page.locator("#ustawienia-prowadzacy")).toContainText("Joanna Demo");
  }
}

async function lekcjaGotowa(page: Page): Promise<void> {
  await expect(page.getByLabel(/^Tytuł lekcji/).first()).toHaveValue("Wprowadzenie do wywiadu");
  await expect(page.getByRole("heading", { level: 2, name: "Treść lekcji" })).toBeVisible();
}

for (const szerokosc of SZEROKOSCI) {
  test.describe(`${szerokosc} px`, () => {
    test.use({ viewport: { width: szerokosc, height: 900 } });

    test("prowadzący — ekran kursu", async ({ page }, testInfo) => {
      const { sciezki } = await przygotuj(page, "instructor");
      await otworz(page, "/nowy-front/kurs/4");
      await kursGotowy(page, "instructor");

      const przyciski = page.getByRole("button", { name: /Opublikuj kurs/ });
      const widoczny = przyciski.filter({ visible: true });
      await expect(widoczny).toHaveCount(1);
      await expect(widoczny).toHaveAttribute("aria-disabled", "true");
      await expect(page.getByText("Kurs publikuje administracja.").filter({ visible: true })).toHaveCount(1);
      await expect(page.locator("#ustawienia-prowadzacy")).toHaveCount(0);
      await expect(page.locator("#ustawienia-zaproszenia")).toHaveCount(0);
      await expect(page.getByText("Usunięcie kursu")).toHaveCount(0);
      await expect(page.getByText("Szkic — zapisany").first()).toBeVisible();
      await bezPrzewijaniaPoziomego(page);

      const naruszenia = await uruchomAxe(page);
      await dolaczNaruszeniaDoRaportu(testInfo, `axe-prowadzacy-kurs-${szerokosc}`, naruszenia);
      expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);
      expect(sciezki.filter((sciezka) => sciezka.startsWith("/admin/"))).toEqual([]);

      await zrzut(page, `prowadzacy--kurs--${szerokosc}`);
    });

    test("administracja — ekran kursu", async ({ page }) => {
      await przygotuj(page, "admin");
      await otworz(page, "/admin/kursy/4");
      await kursGotowy(page, "admin");
      await zrzut(page, `administracja--kurs--${szerokosc}`);
    });

    test("prowadzący — strona lekcji", async ({ page }, testInfo) => {
      const { sciezki } = await przygotuj(page, "instructor");
      await otworz(page, "/nowy-front/kurs/4?lekcja=21");
      await lekcjaGotowa(page);

      await expect(page.getByRole("heading", { level: 2, name: "Nagranie" })).toHaveCount(0);
      await expect(page.getByRole("heading", { level: 2, name: "Pliki do tej lekcji" })).toHaveCount(0);
      await expect(page.locator('input[type="file"]')).toHaveCount(0);
      await bezPrzewijaniaPoziomego(page);

      const naruszenia = await uruchomAxe(page);
      await dolaczNaruszeniaDoRaportu(testInfo, `axe-prowadzacy-lekcja-${szerokosc}`, naruszenia);
      expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);
      expect(sciezki.filter((sciezka) => sciezka.startsWith("/admin/"))).toEqual([]);

      await zrzut(page, `prowadzacy--lekcja--${szerokosc}`);
    });

    // Porównanie (bez asercji): te same ekrany administracji na trasach roboczych, bez ramki panelu.
    test("administracja na trasie roboczej — pomiar szerokości ekranu kursu i strony lekcji", async ({ page }, testInfo) => {
      await przygotuj(page, "admin");
      for (const [nazwa, adres] of [
        ["kurs", "/nowy-front/admin/kursy/4"],
        ["lekcja", "/nowy-front/admin/lekcje/21?kurs=4"],
      ] as const) {
        await otworz(page, adres);
        if (nazwa === "kurs") await kursGotowy(page, "admin");
        else await lekcjaGotowa(page);
        const pomiar = await zmierzSzerokosc(page);
        const wystajace = pomiar.wystajace.length ? `\n${pomiar.wystajace.join("\n")}` : "";
        const wpis = `${nazwa} ${szerokosc}: nadwyżka ${pomiar.nadwyzka}${wystajace}`;
        testInfo.annotations.push({ type: "pomiar-szerokosci-administracji", description: wpis });
        console.log(`[pomiar-szerokosci] administracja ${wpis}`);
      }
    });

    test("administracja — strona lekcji", async ({ page }) => {
      await przygotuj(page, "admin");
      await otworz(page, "/admin/kursy/4/lekcje/21");
      await lekcjaGotowa(page);
      await expect(page.getByRole("heading", { level: 2, name: "Pliki do tej lekcji" })).toBeVisible();
      await zrzut(page, `administracja--lekcja--${szerokosc}`);
    });
  });
}
