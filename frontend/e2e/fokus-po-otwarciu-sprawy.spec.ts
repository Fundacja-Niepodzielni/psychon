import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Miara fokusu po otwarciu sprawy: z ekranu „Sprawy do decyzji” („Otwórz” w
 * wierszu każdego rodzaju i „Otwórz najstarszą sprawę”), z kolejki dyżurów
 * („Otwórz” w wierszu) i przy wejściu wprost na ekrany decyzji zgłoszenia i
 * wniosku o profil. Dla każdej ścieżki próba zapisuje element z fokusem
 * (rola, nazwa) i liczy żądania zapisu (`POST`/`PATCH`/`PUT`/`DELETE`) po
 * naciśnięciu Enter i Spacji — żadna decyzja nie może pójść bez jej wyboru.
 *
 * Do tego: filtr spraw nie gubi fokusu po wyborze opcji, sprawy zgłoszone
 * przez prowadzących pokazują temat i treść dopiero po „Otwórz”, a komunikat
 * po decyzji nie ma „Cofnij” i nie znika od kliknięcia obok.
 *
 * Atrapy API i sesji jak w `przelaczenie-grupa-sprawy.spec.ts`. Wiersz
 * `POMIAR|…` w wyjściu próby to dane tabeli pomiaru. Zrzuty ekranu powstają
 * tylko przy ustawionej zmiennej `PW_ZRZUTY` (katalog poza repozytorium).
 */

const API = "http://localhost:8000/api/v1";

const ATRAPA_SESJI = {
  accessToken: "atrapa-tokenu-testowego",
  expiresAt: Date.now() + 3_600_000,
};

const META = (total: number) => ({ current_page: 1, per_page: 100, total, last_page: 1 });

const ZGLOSZENIE = {
  id: 3,
  edition_id: 1,
  first_name: "Marta",
  last_name: "Demo",
  email: "marta.demo@example.test",
  phone: "+48 600 100 200",
  source: "formularz",
  role: "volunteer",
  payload: null,
  university: "Uniwersytet Demo",
  graduation_year: 2025,
  consent_regulamin_at: "2026-09-01T10:00:00Z",
  consent_polityka_at: "2026-09-01T10:00:00Z",
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

const DYZUR = {
  id: 5,
  date: "2026-09-21",
  hours: "3.5",
  form: "phone_duty",
  consultations_count: 4,
  description: "Dyżur telefoniczny — bez danych osób.",
  status: "submitted",
  review_comment: null,
  decided_at: null,
  created_at: "2026-09-22T10:00:00Z",
  updated_at: "2026-09-22T10:00:00Z",
  user: { id: 18, first_name: "Ola", last_name: "Demo" },
};

const DYZUR_DRUGI = {
  ...DYZUR,
  id: 6,
  created_at: "2026-09-23T10:00:00Z",
  user: { id: 19, first_name: "Filip", last_name: "Kot" },
};

const WNIOSEK = {
  id: 2,
  user: { id: 22, first_name: "Joanna", last_name: "Lis" },
  specializations: ["interwencja kryzysowa"],
  approach: "poznawczo-behawioralne",
  city: "Gdańsk",
  bio: "Pracuję z osobami dorosłymi.",
  publication_consent_granted: true,
  status: "submitted",
  return_reason: null,
  decided_at: null,
  documents: [],
  created_at: "2026-09-27T10:00:00Z",
  updated_at: "2026-09-27T10:00:00Z",
};

const SPRAWY_PROWADZACYCH = [
  {
    id: 7,
    subject: "Nieobecność na dyżurze",
    body: "Osoba nie pojawiła się na dwóch dyżurach.\nProszę o kontakt.",
    created_at: "2026-09-01T10:00:00Z",
    reporter: { id: 5, first_name: "Joanna", last_name: "Demo" },
    volunteer: { id: 18, first_name: "Ola", last_name: "Demo" },
  },
];

function json(dane: unknown, meta?: unknown, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }),
  };
}

const METODY_ZAPISU = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/**
 * Atrapy API administracji. Ogólna atrapa jest rejestrowana PIERWSZA —
 * Playwright wybiera trasę zarejestrowaną PÓŹNIEJ jako pierwszą. Zwraca listę
 * żądań zapisu do API (metoda i ścieżka), uzupełnianą na bieżąco.
 */
async function instalujAtrapy(page: Page): Promise<string[]> {
  const zapisy: string[] = [];
  page.on("request", (zadanie) => {
    if (zadanie.url().startsWith(API) && METODY_ZAPISU.has(zadanie.method())) {
      zapisy.push(`${zadanie.method()} ${new URL(zadanie.url()).pathname}`);
    }
  });

  await page.route(`${API}/**`, (route) => route.fulfill(json([], META(0))));
  await page.route(`${API}/me`, (route) =>
    route.fulfill(json({ id: 1, role: "project_manager", first_name: "Anna", program_completed_at: null })),
  );
  await page.route(`${API}/notifications**`, (route) =>
    route.fulfill(json([], { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { unread: 0 } })),
  );
  await page.route(`${API}/admin/dashboard`, (route) =>
    route.fulfill(json({ counters: { participants: 0, completed: 0, certificates: 0 }, queues: [] })),
  );
  await page.route(`${API}/admin/edition`, (route) => route.fulfill(json({ id: 1, internship_hours_required: 72 })));
  await page.route(`${API}/admin/users/*`, (route) =>
    route.fulfill(json({ progress: { hours_accepted: "18", courses_done: 0, courses_total: 0 } })),
  );
  await page.route(`${API}/admin/applications**`, (route) => {
    const sciezka = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST" && sciezka.endsWith("/accept")) {
      return route.fulfill(
        json({ user_id: 44, access_expires_at: "2027-04-01T00:00:00Z", invitation_mail: "sent" }, undefined, 201),
      );
    }
    if (sciezka.endsWith(`/admin/applications/${ZGLOSZENIE.id}`)) return route.fulfill(json(ZGLOSZENIE));
    return route.fulfill(json([ZGLOSZENIE], META(1)));
  });
  await page.route(`${API}/admin/internship/**`, (route) => {
    const sciezka = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST") {
      return route.fulfill(json({ ...DYZUR, status: "accepted" }));
    }
    if (sciezka.endsWith("/pending")) return route.fulfill(json([DYZUR, DYZUR_DRUGI], { ...META(2), per_page: 25 }));
    return route.fulfill(json([], META(0)));
  });
  await page.route(`${API}/admin/profiles**`, (route) => {
    const sciezka = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST") {
      return route.fulfill(json({ ...WNIOSEK, status: "accepted", decided_at: "2026-10-02T10:00:00Z" }));
    }
    if (sciezka.endsWith(`/admin/profiles/${WNIOSEK.id}`)) return route.fulfill(json(WNIOSEK));
    return route.fulfill(json([WNIOSEK], META(1)));
  });
  await page.route(`${API}/admin/supervision/cases`, (route) => route.fulfill(json(SPRAWY_PROWADZACYCH)));

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(json({ url: null })));
  return zapisy;
}

interface Aktywny {
  rola: string;
  nazwa: string;
}

/** Element z fokusem: rola (jawna albo z elementu) i nazwa (etykieta albo tekst). */
async function aktywny(page: Page): Promise<Aktywny> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (!element || element === document.body) return { rola: "body", nazwa: "" };
    const domyslne: Record<string, string> = {
      A: "link",
      BUTTON: "button",
      H1: "heading",
      H2: "heading",
      H3: "heading",
      TEXTAREA: "textbox",
      INPUT: "textbox",
      SELECT: "combobox",
    };
    const rola = element.getAttribute("role") ?? domyslne[element.tagName] ?? element.tagName.toLowerCase();
    const nazwa = (element.getAttribute("aria-label") ?? element.textContent ?? "").trim().replace(/\s+/g, " ");
    return { rola, nazwa: nazwa.slice(0, 80) };
  });
}

/** Ekran docelowy wczytany: nagłówek `h1` bez „Wczytywanie…”, bez szkieletu w `main`. */
async function czekajNaEkran(page: Page): Promise<void> {
  await expect(page.locator("main h1")).toBeVisible();
  await expect(page.locator("main h1")).not.toHaveText(/^Wczytywanie/);
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
  // Efekty po wczytaniu (fokus panelu, nagłówka) biegną w tej samej klatce co render;
  // krótka pauza daje im zakończyć się przed odczytem `document.activeElement`.
  await page.waitForTimeout(300);
}

interface WynikKlawiszy {
  enter: number;
  spacja: number;
  adresPoKlawiszach: string;
}

/** Enter, potem Spacja w miejscu bieżącego fokusu; liczba żądań zapisu po każdym z nich. */
async function nacisnijEnterISpacje(page: Page, zapisy: string[]): Promise<WynikKlawiszy> {
  const start = zapisy.length;
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  const poEnter = zapisy.length;
  await page.keyboard.press(" ");
  await page.waitForTimeout(500);
  return { enter: poEnter - start, spacja: zapisy.length - poEnter, adresPoKlawiszach: new URL(page.url()).pathname };
}

function zapiszPomiar(sciezka: string, adres: string, fokus: Aktywny, klawisze: WynikKlawiszy): void {
  console.log(
    `POMIAR|${sciezka}|${adres}|${fokus.rola}|${fokus.nazwa}|enter=${klawisze.enter}|spacja=${klawisze.spacja}|po=${klawisze.adresPoKlawiszach}`,
  );
}

async function zrzut(page: Page, nazwa: string): Promise<void> {
  const katalog = process.env.PW_ZRZUTY;
  if (!katalog) return;
  mkdirSync(katalog, { recursive: true });
  await page.screenshot({ path: join(katalog, `${nazwa}.png`), fullPage: true, animations: "disabled" });
}

function adresZParametrami(page: Page): string {
  const adres = new URL(page.url());
  return `${adres.pathname}${adres.search}`;
}

async function otworzSprawy(page: Page): Promise<void> {
  await page.goto("/admin/sprawy");
  await zabezpieczeniePrzedEkranemDostepu(page);
  await expect(page.getByRole("heading", { level: 1, name: "Sprawy do decyzji" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Otwórz sprawę: / })).toHaveCount(4);
}

const SZEROKOSCI = [
  { nazwa: "1280", viewport: { width: 1280, height: 800 } },
  { nazwa: "390", viewport: { width: 390, height: 844 } },
] as const;

for (const szerokosc of SZEROKOSCI) {
  test.describe(`fokus po otwarciu sprawy — ${szerokosc.nazwa} px`, () => {
    test.use({ viewport: szerokosc.viewport });

    test("Sprawy → „Otwórz” zgłoszenia: ekran tego zgłoszenia, fokus na nagłówku, Enter i Spacja nic nie zapisują", async ({ page }) => {
      const zapisy = await instalujAtrapy(page);
      await otworzSprawy(page);

      await page.getByRole("link", { name: "Otwórz sprawę: Zgłoszenie rekrutacyjne — Marta Demo" }).focus();
      await page.keyboard.press("Enter");
      await page.waitForURL((adres) => !adres.pathname.endsWith("/admin/sprawy"));
      await czekajNaEkran(page);
      const adres = adresZParametrami(page);
      const fokus = await aktywny(page);
      await zrzut(page, `B-zgloszenie-${szerokosc.nazwa}`);
      const klawisze = await nacisnijEnterISpacje(page, zapisy);
      zapiszPomiar(`Sprawy → Otwórz (zgłoszenie) ${szerokosc.nazwa}`, adres, fokus, klawisze);

      expect(adres).toBe("/admin/nabor/3");
      expect(fokus).toEqual({ rola: "heading", nazwa: "Zgłoszenie: Marta Demo" });
      expect(zapisy).toEqual([]);

      await page.goBack();
      await expect(page).toHaveURL(/\/admin\/sprawy$/);
    });

    test("Sprawy → „Otwórz” dyżuru: kolejka z otwartym tym dyżurem, fokus na jego panelu, Enter i Spacja nic nie zapisują", async ({ page }) => {
      const zapisy = await instalujAtrapy(page);
      await otworzSprawy(page);

      await page.getByRole("link", { name: "Otwórz sprawę: Dyżur — Ola Demo" }).focus();
      await page.keyboard.press("Enter");
      await page.waitForURL((adres) => !adres.pathname.endsWith("/admin/sprawy"));
      await czekajNaEkran(page);
      const adres = adresZParametrami(page);
      const fokus = await aktywny(page);
      await zrzut(page, `B-dyzur-${szerokosc.nazwa}`);
      const klawisze = await nacisnijEnterISpacje(page, zapisy);
      zapiszPomiar(`Sprawy → Otwórz (dyżur) ${szerokosc.nazwa}`, adres, fokus, klawisze);

      expect(adres).toBe("/admin/staz?dyzur=5");
      expect(fokus).toEqual({ rola: "region", nazwa: "Dyżur: Ola Demo" });
      // Otwarty jest wyłącznie wskazany dyżur, drugi wiersz zostaje zwinięty.
      await expect(page.getByTestId("panel-dyzuru")).toHaveCount(1);
      expect(zapisy).toEqual([]);

      await page.goBack();
      await expect(page).toHaveURL(/\/admin\/sprawy$/);
    });

    test("Sprawy → „Otwórz” wniosku o profil: ekran tego wniosku, fokus na nagłówku, Enter i Spacja nic nie zapisują", async ({ page }) => {
      const zapisy = await instalujAtrapy(page);
      await otworzSprawy(page);

      await page.getByRole("link", { name: "Otwórz sprawę: Wniosek o profil psychologa — Joanna Lis" }).focus();
      await page.keyboard.press("Enter");
      await page.waitForURL((adres) => !adres.pathname.endsWith("/admin/sprawy"));
      await czekajNaEkran(page);
      const adres = adresZParametrami(page);
      const fokus = await aktywny(page);
      await zrzut(page, `B-profil-${szerokosc.nazwa}`);
      const klawisze = await nacisnijEnterISpacje(page, zapisy);
      zapiszPomiar(`Sprawy → Otwórz (profil) ${szerokosc.nazwa}`, adres, fokus, klawisze);

      expect(adres).toBe("/admin/profile/2");
      expect(fokus).toEqual({ rola: "heading", nazwa: "Wniosek o profil: Joanna Lis" });
      expect(zapisy).toEqual([]);

      await page.goBack();
      await expect(page).toHaveURL(/\/admin\/sprawy$/);
    });

    test("Sprawy → „Otwórz najstarszą sprawę”: ekran najstarszego zgłoszenia, fokus na nagłówku, Enter i Spacja nic nie zapisują", async ({ page }) => {
      const zapisy = await instalujAtrapy(page);
      await otworzSprawy(page);

      await page.getByRole("button", { name: "Otwórz najstarszą sprawę" }).focus();
      await page.keyboard.press("Enter");
      await page.waitForURL((adres) => !adres.pathname.endsWith("/admin/sprawy"));
      await czekajNaEkran(page);
      const adres = adresZParametrami(page);
      const fokus = await aktywny(page);
      const klawisze = await nacisnijEnterISpacje(page, zapisy);
      zapiszPomiar(`Sprawy → Otwórz najstarszą ${szerokosc.nazwa}`, adres, fokus, klawisze);

      expect(adres).toBe("/admin/nabor/3");
      expect(fokus).toEqual({ rola: "heading", nazwa: "Zgłoszenie: Marta Demo" });
      expect(zapisy).toEqual([]);
    });

    test("kolejka dyżurów → „Otwórz”: fokus na panelu dyżuru, Enter i Spacja nic nie zapisują", async ({ page }) => {
      const zapisy = await instalujAtrapy(page);
      await page.goto("/admin/staz");
      await zabezpieczeniePrzedEkranemDostepu(page);
      await czekajNaEkran(page);

      await page.getByRole("button", { name: /^Otwórz dyżur: Ola Demo/ }).focus();
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("panel-dyzuru")).toBeVisible();
      await page.waitForTimeout(300);
      const fokus = await aktywny(page);
      const klawisze = await nacisnijEnterISpacje(page, zapisy);
      zapiszPomiar(`Kolejka dyżurów → Otwórz ${szerokosc.nazwa}`, "/admin/staz", fokus, klawisze);

      expect(fokus).toEqual({ rola: "region", nazwa: "Dyżur: Ola Demo" });
      expect(zapisy).toEqual([]);
    });

    for (const ekran of [
      { nazwa: "ekran decyzji zgłoszenia", adres: "/admin/nabor/3", naglowek: "Zgłoszenie: Marta Demo" },
      { nazwa: "ekran decyzji profilu", adres: "/admin/profile/2", naglowek: "Wniosek o profil: Joanna Lis" },
    ]) {
      test(`${ekran.nazwa} wprost: fokus zostaje na stronie, pierwszy Tab to „Przejdź do treści”, Enter i Spacja nic nie zapisują`, async ({ page }) => {
        const zapisy = await instalujAtrapy(page);
        await page.goto(ekran.adres);
        await zabezpieczeniePrzedEkranemDostepu(page);
        await expect(page.getByRole("heading", { level: 1, name: ekran.naglowek })).toBeVisible();
        await czekajNaEkran(page);
        const fokus = await aktywny(page);
        await page.keyboard.press("Tab");
        const poTab = await aktywny(page);
        console.log(`POMIAR|${ekran.nazwa} wprost ${szerokosc.nazwa}|pierwszy Tab: ${poTab.rola} ${poTab.nazwa}`);
        await expect(page.getByRole("link", { name: "Przejdź do treści" })).toBeFocused();

        // Enter i Spacja w stanie zaraz po wejściu (fokus na stronie) — po ponownym wczytaniu.
        await page.reload();
        await czekajNaEkran(page);
        const klawisze = await nacisnijEnterISpacje(page, zapisy);
        zapiszPomiar(`${ekran.nazwa} wprost ${szerokosc.nazwa}`, ekran.adres, fokus, klawisze);

        expect(fokus).toEqual({ rola: "body", nazwa: "" });
        expect(zapisy).toEqual([]);
      });
    }

    test("filtr spraw: fokus zostaje na wybranej opcji, także po powrocie do „Wszystkie”", async ({ page }) => {
      await instalujAtrapy(page);
      await otworzSprawy(page);

      await page.getByRole("button", { name: /^Filtr: Wszystkie/ }).focus();
      await page.keyboard.press("Enter");
      const profile = page.getByRole("button", { name: "Wnioski o profil psychologa (1)", exact: true });
      await profile.focus();
      await page.keyboard.press("Enter");
      await expect(profile).toHaveAttribute("aria-pressed", "true");
      const poWyborze = await aktywny(page);
      const wszystkie = page.getByRole("button", { name: /^Wszystkie \(\d+\)$/ });
      await wszystkie.focus();
      await page.keyboard.press("Enter");
      await expect(wszystkie).toHaveAttribute("aria-pressed", "true");
      const poPowrocie = await aktywny(page);
      console.log(`POMIAR|filtr ${szerokosc.nazwa}|po wyborze: ${poWyborze.rola} ${poWyborze.nazwa}|po „Wszystkie”: ${poPowrocie.rola} ${poPowrocie.nazwa}`);

      expect(poWyborze).toEqual({ rola: "button", nazwa: "Wnioski o profil psychologa (1)" });
      expect(poPowrocie.rola).toBe("button");
      expect(poPowrocie.nazwa).toMatch(/^Wszystkie \(\d+\)$/);
    });

    test("sprawy od prowadzących: temat i treść dopiero po „Otwórz”, fokus na nagłówku otwartej sprawy", async ({ page }) => {
      await instalujAtrapy(page);
      await otworzSprawy(page);
      const sprawa = page.getByTestId("sprawa-prowadzacego-7");
      await expect(sprawa).toBeVisible();
      await zrzut(page, `A-sprawy-prowadzacych-zwiniete-${szerokosc.nazwa}`);
      const przedTekst = (await sprawa.textContent()) ?? "";
      console.log(`POMIAR|sprawy od prowadzących ${szerokosc.nazwa}|przed „Otwórz”: ${przedTekst.replace(/\s+/g, " ").trim()}`);

      expect(przedTekst).not.toContain("Nieobecność na dyżurze");
      expect(przedTekst).not.toContain("Osoba nie pojawiła się");
      expect(przedTekst).toContain("Ola Demo");

      await sprawa.getByRole("button", { name: /^Otwórz sprawę od prowadzącego/ }).focus();
      await page.keyboard.press("Enter");
      const naglowek = sprawa.getByRole("heading", { level: 3, name: "Nieobecność na dyżurze" });
      await expect(naglowek).toBeVisible();
      await expect(naglowek).toBeFocused();
      await expect(sprawa).toContainText("Osoba nie pojawiła się na dwóch dyżurach.");
      await zrzut(page, `A-sprawy-prowadzacych-otwarta-${szerokosc.nazwa}`);
    });

    for (const ekran of [
      { nazwa: "kolejka dyżurów", adres: "/admin/staz", decyzja: "Zatwierdź dyżur", komunikat: /Dyżur zatwierdzony/ },
      { nazwa: "decyzja zgłoszenia", adres: "/admin/nabor/3", decyzja: "Zatwierdź i utwórz konto", komunikat: /Zgłoszenie zaakceptowane/ },
      { nazwa: "decyzja profilu", adres: "/admin/profile/2", decyzja: "Zatwierdź", komunikat: /Wniosek zatwierdzony/ },
    ]) {
      test(`${ekran.nazwa}: komunikat po decyzji bez „Cofnij”, nie znika od kliknięcia obok`, async ({ page }) => {
        await instalujAtrapy(page);
        await page.goto(ekran.adres);
        await zabezpieczeniePrzedEkranemDostepu(page);
        await czekajNaEkran(page);
        if (ekran.adres === "/admin/staz") {
          await page.getByRole("button", { name: /^Otwórz dyżur: Ola Demo/ }).click();
        }
        await page.getByRole("button", { name: ekran.decyzja, exact: true }).click();
        const komunikat = page.getByRole("status").filter({ hasText: ekran.komunikat });
        await expect(komunikat).toBeVisible();
        const cofnij = await page.getByRole("button", { name: "Cofnij" }).count();
        await page.locator("main h1").click();
        await page.waitForTimeout(300);
        const poKliknieciu = await komunikat.isVisible();
        console.log(`POMIAR|komunikat ${ekran.nazwa} ${szerokosc.nazwa}|Cofnij=${cofnij}|widoczny po kliknięciu obok=${poKliknieciu}`);

        expect(cofnij).toBe(0);
        expect(poKliknieciu).toBe(true);
      });
    }
  });
}
