import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Miara dla dwóch pulpitów przełączonych na nowy front (`pulpitUczestnika`,
 * `pulpitProwadzacego`, obie `wlaczona: true` w `lib/przelaczenie/grupy.ts`):
 * nazwy ze słownika interfejsu, jedna etykieta w kaflu, mianownik kafla
 * dominującego w co najwyżej dwóch wierszach na 390 px i liczby dziesiętne
 * z przecinkiem (`pl-PL`). API i sesja Auth.js są atrapami (`page.route`).
 *
 * Gdy ustawiona jest zmienna `ZRZUTY_549` (ścieżka z przedrostkiem nazwy
 * pliku), każdy scenariusz zapisuje też zrzut ekranu — wyłącznie do oglądania,
 * bez wpływu na wynik.
 */

const ATRAPA_SESJI = {
  accessToken: "atrapa-tokenu-testowego",
  expiresAt: Date.now() + 3_600_000,
};

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
  {
    id: 3,
    slug: "interwencja-kryzysowa",
    title: "Interwencja kryzysowa",
    sequence_order: 3,
    product_group: "psychon",
    status: "locked",
    progress_percent: 0,
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

/** Ogólna atrapa jest rejestrowana PRZED szczegółowymi (późniejsza trasa wygrywa). */
async function instalujAtrapyUczestnika(page: Page): Promise<void> {
  await odpowiedz(page, `${API}/**`, { data: [], meta: STRONA });
  await odpowiedz(page, `${API}/me`, {
    data: { id: 1, role: "volunteer", first_name: "Marta", program_completed_at: null },
  });
  await odpowiedz(page, `${API}/courses`, { data: KURSY });
  await odpowiedz(page, `${API}/courses/wywiad-psychologiczny`, {
    data: {
      ...KURSY[1],
      lessons: [{ id: 21, title: "Wprowadzenie do wywiadu", sequence_order: 1, is_completed: false }],
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
  await odpowiedz(page, `${API}/supervision/slots**`, { data: [], meta: STRONA });
  await odpowiedz(page, `${API}/notifications**`, { data: [], meta: { ...STRONA, extra: { unread: 0 } } });
  await odpowiedz(page, `${API}/onboarding`, {
    data: {
      video: { title: "", url: null, caption: null },
      program: { title: "", body: "" },
      expectations: { title: "", body: "" },
      updated_at: null,
    },
  });
  await instalujSesje(page);
}

async function instalujAtrapyProwadzacego(page: Page): Promise<void> {
  await odpowiedz(page, `${API}/**`, { data: [], meta: STRONA });
  await odpowiedz(page, `${API}/me`, { data: { id: 1, role: "instructor" } });
  await odpowiedz(page, `${API}/instructor/group`, {
    data: {
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
    },
  });
  await odpowiedz(page, `${API}/instructor/questions**`, {
    data: [],
    meta: { ...STRONA, extra: { unanswered: 0 } },
  });
  await odpowiedz(page, `${API}/instructor/courses`, {
    data: [{ id: 5, slug: "wywiad", title: "Wywiad psychologiczny", sequence_order: 2 }],
  });
  await instalujSesje(page);
}

async function zrzut(page: Page, nazwa: string): Promise<void> {
  const przedrostek = process.env.ZRZUTY_549;
  if (przedrostek) await page.screenshot({ path: `${przedrostek}-${nazwa}.png`, fullPage: true });
}

async function brakPoziomegoPrzewijania(page: Page): Promise<void> {
  const miary = await page.evaluate(() => ({
    przewijane: document.documentElement.scrollWidth,
    widoczne: document.documentElement.clientWidth,
  }));
  expect(miary.przewijane, `scrollWidth ${miary.przewijane} > clientWidth ${miary.widoczne}`).toBeLessThanOrEqual(
    miary.widoczne,
  );
}

const ROZMIARY = [
  { nazwa: "390", szerokosc: 390, wysokosc: 844 },
  { nazwa: "1280", szerokosc: 1280, wysokosc: 800 },
];

for (const rozmiar of ROZMIARY) {
  test.describe(`pulpity: słownik i liczby dziesiętne, ${rozmiar.nazwa} px`, () => {
    test.use({ viewport: { width: rozmiar.szerokosc, height: rozmiar.wysokosc } });

    test("uczestnik: 0 nazw „etap” w main, „% ukończone” raz w kaflu bieżącym, godziny z przecinkiem, bez poziomego przewijania", async ({
      page,
    }) => {
      await instalujAtrapyUczestnika(page);
      await page.goto("/panel/pulpit");
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.getByText("Twoja ścieżka").first()).toBeVisible();
      await expect(page.getByText("Wywiad psychologiczny").first()).toBeVisible();
      await expect(page.locator("#pulpit-godziny-stazu")).toContainText("41,5");
      await zrzut(page, `uczestnik-${rozmiar.nazwa}`);

      const main = page.locator("main");
      await expect(main).toHaveCount(1);

      // Tekst widoczny i nazwy czytane przez czytnik (aria-label, title, alt).
      const tekst = await main.innerText();
      expect(tekst.match(/etap/gi) ?? [], "tekst widoczny w main zawiera „etap”").toEqual([]);
      const nazwyDostepne = await main.evaluate((el) =>
        Array.from(el.querySelectorAll("[aria-label], [title], img[alt]")).map(
          (w) => `${w.getAttribute("aria-label") ?? ""} ${w.getAttribute("title") ?? ""} ${w.getAttribute("alt") ?? ""}`,
        ),
      );
      expect(nazwyDostepne.filter((n) => /etap/i.test(n)), "nazwa dostępna z „etap”").toEqual([]);

      // Jedna etykieta „% ukończone” w kaflu bieżącym; nazwa dostępna paska zostaje.
      const kafel = page.locator('[role="listitem"]').filter({ has: page.locator("#pulpit-biezacy-etap") });
      await expect(kafel).toHaveCount(1);
      const tekstKafla = await kafel.innerText();
      expect(tekstKafla.match(/% ukończone/g) ?? [], `kafel bieżący: ${JSON.stringify(tekstKafla)}`).toHaveLength(1);
      await expect(kafel.getByRole("progressbar", { name: "% ukończone" })).toHaveCount(1);

      // Mianownik kafla dominującego: nie więcej niż dwa wiersze.
      const dominujacy = page.locator('[data-dominujacy] [id="pulpit-etapy"]');
      await expect(dominujacy).toHaveCount(1);
      const wiersze = await dominujacy.evaluate((blok) => {
        const mianownik = blok.querySelector("span > span + span");
        if (!mianownik) return { wierszeMianownika: -1, wysokosc: 0, dozwolona: 0 };
        const liczba = blok.querySelector("span > span");
        const rozmiarLiczby = parseFloat(getComputedStyle(liczba ?? blok).fontSize);
        const wysokoscLinii = parseFloat(getComputedStyle(blok).lineHeight);
        const linia = Number.isNaN(wysokoscLinii) ? rozmiarLiczby * 1.3 : Math.max(wysokoscLinii, rozmiarLiczby);
        const prostokaty = Array.from(mianownik.getClientRects());
        const gorne = new Set(prostokaty.map((p) => Math.round(p.top)));
        return {
          wierszeMianownika: gorne.size,
          wysokosc: blok.getBoundingClientRect().height,
          dozwolona: 2 * linia,
        };
      });
      expect(wiersze.wierszeMianownika, JSON.stringify(wiersze)).toBeGreaterThanOrEqual(1);
      expect(wiersze.wierszeMianownika, JSON.stringify(wiersze)).toBeLessThanOrEqual(2);
      expect(wiersze.wysokosc, JSON.stringify(wiersze)).toBeLessThanOrEqual(wiersze.dozwolona);

      // Godziny: przecinek według pl-PL, bez surowego ciągu z API.
      const godziny = await page.locator("#pulpit-godziny-stazu").innerText();
      expect(godziny).toMatch(/41,5/);
      expect(godziny).toMatch(/72,5/);
      expect(tekst).not.toMatch(/41\.5|72\.5/);

      await brakPoziomegoPrzewijania(page);
    });

    test("prowadzący: „41,5” i ani jednego „41.5”, bez poziomego przewijania", async ({ page }) => {
      await instalujAtrapyProwadzacego(page);
      await page.goto("/prowadzacy");
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.getByRole("heading", { level: 1, name: "Pulpit prowadzącego" })).toBeVisible();
      await expect(page.getByText("Moja grupa: 1 osoba")).toBeVisible();
      await zrzut(page, `prowadzacy-${rozmiar.nazwa}`);

      const tekst = await page.locator("main").innerText();
      expect(tekst.match(/41,5/g) ?? [], `main: ${JSON.stringify(tekst)}`).toHaveLength(1);
      expect(tekst.match(/41\.5/g) ?? []).toHaveLength(0);

      await brakPoziomegoPrzewijania(page);
    });
  });
}
