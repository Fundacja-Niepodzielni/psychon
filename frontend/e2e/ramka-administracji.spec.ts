import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";

/**
 * Nowa ramka panelu administracji (makieta 2.0.4, `#s-panel .shell`) na
 * zbudowanej aplikacji, z atrapą API przez `page.route` i atrapą sesji (jak
 * w `przelaczenie-grupa-*.spec.ts`). Dane atrap według
 * `docs/hackathon/04-seed-demo.md` (Edycja 2026, konta demo).
 *
 * Dla każdego ekranu administracji z włączonej grupy, na 1280 i 390 px:
 * - menu jest listą z makiety (grupy, pozycje, linie „W przygotowaniu”,
 *   grupa „Konto”) uzupełnioną o ekrany włączonych grup i grupę
 *   „Dotychczasowy panel”;
 * - nazwa w menu == `h1` == tytuł karty (dla pulpitu para ze słownika:
 *   „Pulpit” w menu, „Pulpit administracji” w nagłówku);
 * - jeden `main`, jeden `#tresc`, link skoku jako pierwszy cel klawiatury;
 * - brak przewijania w poziomie, treść co najmniej 16 px od krawędzi okna;
 * - axe: 0 naruszeń;
 * - bez „Wstecz”, okruszki tylko jako łącza;
 * - `--brand` niepusty na menu i pasku ramki (także w szufladzie 390 px),
 *   pusty na `documentElement` (tokeny tylko w poddrzewie z `data-theme`);
 * - nazwy pozycji menu w całości, bez wielokropka, najwyżej 2 wiersze;
 * - przycisk „Menu” (390 px) z ikoną menu z makiety i napisem „Menu”.
 * Kontrola dodatnia: strona grupy wyłączonej (`/admin/kursy`) ma dalej
 * dotychczasową powłokę.
 *
 * Zrzuty ekranu powstają tylko przy ustawionej zmiennej `PW_ZRZUTY_RAMKI`
 * (katalog poza repozytorium).
 */

const ATRAPA_SESJI = {
  accessToken: "atrapa-tokenu-testowego",
  expiresAt: Date.now() + 3_600_000,
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

const WNIOSEK = {
  id: 12,
  user: { id: 18, first_name: "Ola", last_name: "Demo" },
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

const FORMA = {
  id: 7,
  name: "Dyżur telefoniczny",
  description: "Rozmowa telefoniczna w godzinach dyżuru.",
  is_active: true,
  sort_order: 1,
  created_at: null,
  updated_at: null,
};

const ZGLOSZENIE = {
  id: 3,
  body: "Chcę dalej prowadzić dyżury czatu.",
  status: "new",
  response: null,
  responded_at: null,
  responded_by: null,
  created_at: "2026-09-20T08:00:00Z",
  updated_at: "2026-09-20T08:00:00Z",
  user: { id: 18, first_name: "Ola", last_name: "Demo", email: "ola@demo.pl" },
};

const EKRAN_STARTOWY = {
  video: { title: "Film powitalny", url: null, caption: null },
  program: { title: "Przebieg programu", body: "Dziesięć etapów, staż i superwizje." },
  expectations: { title: "Oczekiwania", body: "Regularna nauka i obecność na superwizjach." },
  updated_at: null,
};

function odpowiedz(dane: unknown, meta?: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }) };
}

const META = { current_page: 1, per_page: 25, total: 1, last_page: 1 };

/**
 * Atrapy API roli administracji. Ogólna atrapa jest rejestrowana PIERWSZA —
 * Playwright wybiera trasę zarejestrowaną PÓŹNIEJ jako pierwszą.
 */
async function instalujAtrapyApi(page: Page): Promise<void> {
  const api = "http://localhost:8000/api/v1";
  await page.route(`${api}/**`, (route) => route.fulfill(odpowiedz([], { ...META, total: 0 })));
  await page.route(`${api}/me`, (route) =>
    route.fulfill(odpowiedz({ id: 1, role: "project_manager", first_name: "Opiekun", last_name: "Demo", program_completed_at: null })),
  );
  await page.route(`${api}/notifications**`, (route) =>
    route.fulfill(odpowiedz([], { ...META, total: 0, extra: { unread: 0 } })),
  );
  await page.route(`${api}/admin/dashboard`, (route) =>
    route.fulfill(
      odpowiedz({
        counters: { participants: 3, completed: 1, certificates: 1 },
        queues: [
          { key: "applications", count: 1, link: "/admin/uczestniczki" },
          { key: "internship_entries", count: 2, link: "/admin/staz" },
        ],
      }),
    ),
  );
  await page.route(`${api}/admin/edition`, (route) => route.fulfill(odpowiedz(EDYCJA)));
  await page.route(`${api}/admin/profiles/12`, (route) => route.fulfill(odpowiedz(WNIOSEK)));
  await page.route(`${api}/admin/internship/forms**`, (route) => route.fulfill(odpowiedz([FORMA])));
  await page.route(`${api}/admin/cooperation-requests**`, (route) => route.fulfill(odpowiedz([ZGLOSZENIE], META)));
  await page.route(`${api}/document-templates/agreement`, (route) =>
    route.fulfill(
      odpowiedz({
        type: "agreement",
        content: "<p>Porozumienie wolontariackie — wzór.</p>",
        version: 2,
        updated_at: "2026-09-28T10:00:00Z",
        updated_by: { id: 1, name: "Opiekun Demo" },
      }),
    ),
  );
  await page.route(`${api}/document-templates/agreement/versions`, (route) =>
    route.fulfill(odpowiedz([{ version: 2, updated_at: "2026-09-28T10:00:00Z", updated_by: { id: 1, name: "Opiekun Demo" } }])),
  );
  await page.route(`${api}/onboarding`, (route) => route.fulfill(odpowiedz(EKRAN_STARTOWY)));

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(odpowiedz({ url: null })));
}

/**
 * Menu oczekiwane — makieta 2.0.4, menu roli administracji (skrypt nawigacji,
 * w. 1105), plus ekrany włączonych grup i grupa „Dotychczasowy panel”
 * (`lib/menu/ramka/administracja.ts`).
 */
const MENU_OCZEKIWANE = [
  {
    naglowek: "Codziennie",
    pozycje: [
      ["Pulpit", "/admin"],
      ["Sprawy", "/admin/sprawy"],
      ["Dyżury do decyzji", "/admin/staz"],
      ["Uczestnicy", "/admin/uczestniczki"],
      // Grupa `nabor` włączona: lista zgłoszeń rekrutacyjnych jest pozycją zaraz po „Uczestnicy” (nazwa == h1 ekranu).
      ["Zgłoszenia rekrutacyjne", "/admin/nabor"],
      ["Zgłoszenia współpracy", "/admin/zgloszenia-wspolpracy"],
    ],
    linia: null,
  },
  {
    naglowek: "Program",
    pozycje: [
      ["Kursy", "/admin/kursy"],
      ["Słownik form stażu", "/admin/formy-stazu"],
    ],
    // Bez „staż i superwizja” — „Dyżury do decyzji” (Codziennie) i „Superwizje” (Dotychczasowy panel) są pozycjami menu.
    linia: "W przygotowaniu: prowadzący.",
  },
  {
    naglowek: "Rozliczenie",
    pozycje: [
      ["Raport roku programu", "/admin/raport"],
      ["Dziennik działań", "/admin/dziennik"],
      ["Wzory dokumentów", "/admin/wzory-dokumentow"],
      ["Treść ekranu „Zacznij tutaj”", "/admin/ekran-startowy"],
    ],
    // „certyfikaty” poza linią: „Certyfikaty” są pozycją menu („Dotychczasowy panel”).
    linia: "W przygotowaniu: ustawienia roku programu.",
  },
  {
    naglowek: "Dotychczasowy panel (6)",
    pozycje: [
      ["Czas nauki", "/admin/czas-nauki"],
      ["Certyfikaty", "/admin/certyfikaty"],
      ["Profile psychologa", "/admin/profile"],
      ["Superwizje", "/admin/superwizje"],
      ["Skrzynka e-maili", "/admin/emails"],
      ["Ustawienia", "/admin/ustawienia"],
    ],
    linia: null,
  },
];

interface Ekran {
  nazwa: string;
  adres: string;
  /** Nazwa pozycji menu oznaczonej jako bieżąca. */
  menu: string;
  /** Oczekiwany `h1`; dla szczegółu — wzorzec. */
  h1: string | RegExp;
  /** Oczekiwany tytuł karty — także dla szczegółu rekordu (stały, bez danych osoby). */
  tytul: string;
}

const EKRANY: Ekran[] = [
  { nazwa: "pulpit", adres: "/admin", menu: "Pulpit", h1: "Pulpit administracji", tytul: "Pulpit administracji — Niepodzielni" },
  {
    nazwa: "zgloszenia-wspolpracy",
    adres: "/admin/zgloszenia-wspolpracy",
    menu: "Zgłoszenia współpracy",
    h1: "Zgłoszenia współpracy",
    tytul: "Zgłoszenia współpracy — Niepodzielni",
  },
  {
    nazwa: "formy-stazu",
    adres: "/admin/formy-stazu",
    menu: "Słownik form stażu",
    h1: "Słownik form stażu",
    tytul: "Słownik form stażu — Niepodzielni",
  },
  {
    nazwa: "profil-decyzja",
    adres: "/admin/profile/12",
    menu: "Profile psychologa",
    h1: /^Wniosek o profil: Ola Demo/,
    tytul: "Wniosek o profil — Niepodzielni",
  },
  {
    nazwa: "wzory-dokumentow",
    adres: "/admin/wzory-dokumentow",
    menu: "Wzory dokumentów",
    h1: "Wzory dokumentów",
    tytul: "Wzory dokumentów — Niepodzielni",
  },
  {
    nazwa: "ekran-startowy",
    adres: "/admin/ekran-startowy",
    menu: "Treść ekranu „Zacznij tutaj”",
    h1: "Treść ekranu „Zacznij tutaj”",
    tytul: "Treść ekranu „Zacznij tutaj” — Niepodzielni",
  },
];

const SZEROKOSCI = [1280, 390] as const;

/** Odczyt menu z DOM: grupy (nagłówek, pozycje, linia „W przygotowaniu”) i blok konta. */
async function odczytajMenu(nav: Locator) {
  return nav.evaluate((el) => {
    // Nazwa przycisku bez znaków ukrytych dla czytnika (np. „+” grupy zwiniętej).
    const nazwa = (b: Element) =>
      Array.from(b.childNodes)
        .filter((w) => !(w instanceof Element && w.getAttribute("aria-hidden") === "true"))
        .map((w) => w.textContent ?? "")
        .join("")
        .trim();
    const grupy = Array.from(el.querySelectorAll("ul")).map((ul) => {
      const opakowanie = ul.parentElement?.parentElement;
      const linia = [...Array.from(ul.parentElement?.children ?? []), ...Array.from(opakowanie?.children ?? [])].find(
        (dziecko) => dziecko.tagName === "P" && (dziecko.textContent ?? "").startsWith("W przygotowaniu"),
      );
      // Grupa zwinięta: nagłówkiem jest przycisk sterujący listą (`aria-controls`).
      const idListy = ul.parentElement?.id;
      const sterujacy = idListy ? el.querySelector(`button[aria-controls="${CSS.escape(idListy)}"]`) : null;
      return {
        naglowek: sterujacy ? nazwa(sterujacy) : (ul.previousElementSibling?.textContent ?? "").trim(),
        pozycje: Array.from(ul.querySelectorAll("a")).map((a) => [(a.textContent ?? "").trim(), a.getAttribute("href")]),
        linia: linia?.textContent ?? null,
      };
    });
    const przyciski = Array.from(el.querySelectorAll("button"));
    const wyloguj = przyciski.find((b) => (b.textContent ?? "").trim() === "Wyloguj");
    return {
      grupy,
      konto: wyloguj ? (wyloguj.parentElement?.firstElementChild?.textContent ?? "").trim() : null,
      przyciski: przyciski.map(nazwa),
    };
  });
}

async function menuWidoczne(page: Page, szerokosc: number): Promise<Locator> {
  if (szerokosc >= 1024) {
    await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeHidden();
    return page.getByRole("complementary", { name: "Menu i konto" }).getByRole("navigation", { name: "Menu — Administracja" });
  }
  await expect(page.getByRole("complementary", { name: "Menu i konto" })).toBeHidden();
  const przycisk = page.getByRole("button", { name: "Menu", exact: true });
  await expect(przycisk.locator('svg[aria-hidden="true"] path')).toHaveAttribute("d", "M3 6h18M3 12h18M3 18h18");
  await przycisk.click();
  const okno = page.getByRole("dialog", { name: "Menu i konto" });
  await expect(okno).toBeVisible();
  return okno.getByRole("navigation", { name: "Menu — Administracja" });
}

async function zmierzUklad(page: Page) {
  return page.evaluate(() => {
    const h1 = document.querySelector("h1");
    const prostokat = h1?.getBoundingClientRect();
    const szerokosc = document.documentElement.clientWidth;
    return {
      main: document.querySelectorAll("main").length,
      cele: document.querySelectorAll("#tresc").length,
      mainToCel: document.querySelector("main")?.id === "tresc",
      przewijanieWPoziomie: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      odstepLewy: prostokat ? Math.round(prostokat.left) : -1,
      odstepPrawy: prostokat ? Math.round(szerokosc - prostokat.right) : -1,
    };
  });
}

function katalogZrzutow(): string | null {
  const katalog = process.env.PW_ZRZUTY_RAMKI;
  if (!katalog) return null;
  mkdirSync(katalog, { recursive: true });
  return katalog;
}

test.describe("nowa ramka panelu administracji — ekrany włączonych grup", () => {
  for (const szerokosc of SZEROKOSCI) {
    for (const ekran of EKRANY) {
      test(`${ekran.adres} @${szerokosc}: menu z makiety, nazwa == h1 == tytuł, jeden main, skok, bez przewijania, odstęp, axe 0`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width: szerokosc, height: szerokosc >= 1024 ? 900 : 844 });
        await instalujAtrapyApi(page);

        const odpowiedzStrony = await page.goto(ekran.adres);
        await zabezpieczeniePrzedEkranemDostepu(page);
        expect(odpowiedzStrony?.status()).toBe(200);

        const naglowek = page.getByRole("heading", { level: 1 });
        await expect(naglowek).toHaveCount(1);
        await expect(naglowek).toBeVisible();
        if (typeof ekran.h1 === "string") {
          // Miękko: rozjazd nazwy nie zatrzymuje pozostałych pomiarów, test i tak pada.
          await expect.soft(naglowek, "h1").toHaveText(ekran.h1);
        } else {
          await expect(naglowek).toHaveText(ekran.h1);
        }
        await expect(page.locator("[data-powloka-panelu]")).toHaveCount(1);

        // Rok programu z GET /admin/edition, bez „zmień”.
        await expect(page.getByRole("banner").filter({ hasText: "2026/27" })).toHaveCount(1);

        // Układ: jeden main pod #tresc, bez przewijania w poziomie, odstęp treści.
        const uklad = await zmierzUklad(page);
        expect(uklad, JSON.stringify(uklad)).toMatchObject({ main: 1, cele: 1, mainToCel: true, przewijanieWPoziomie: false });
        expect(uklad.odstepLewy, "odstęp lewy h1").toBeGreaterThanOrEqual(16);
        expect(uklad.odstepPrawy, "odstęp prawy h1").toBeGreaterThanOrEqual(16);

        // Bez „Wstecz”; okruszki — jeśli są — tylko łącza i bieżąca pozycja na końcu.
        await expect(page.getByRole("button", { name: "Wstecz" })).toHaveCount(0);
        const okruszki = page.getByRole("navigation", { name: "Okruszki" });
        if ((await okruszki.count()) > 0) {
          const elementy = await okruszki.locator("li").count();
          await expect(okruszki.getByRole("link")).toHaveCount(elementy - 1);
        }
        // Ekran szczegółu (adres inny niż adres pozycji menu): okruszki są drogą powrotu —
        // pierwsze łącze ma nazwę i adres oznaczonej pozycji menu.
        const adresMenu = MENU_OCZEKIWANE.flatMap((g) => g.pozycje).find(([nazwa]) => nazwa === ekran.menu)?.[1];
        expect(adresMenu, `pozycja menu „${ekran.menu}” w MENU_OCZEKIWANE`).toBeTruthy();
        if (adresMenu !== ekran.adres) {
          const pierwszeLacze = okruszki.getByRole("link").first();
          await expect(pierwszeLacze).toHaveText(ekran.menu);
          await expect(pierwszeLacze).toHaveAttribute("href", adresMenu as string);
        }

        // Axe na stanie spoczynku (menu zamknięte).
        const naruszenia = await uruchomAxe(page);
        await dolaczNaruszeniaDoRaportu(testInfo, `axe-${ekran.nazwa}-${szerokosc}`, naruszenia);
        expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);

        const zrzuty = katalogZrzutow();
        if (zrzuty) {
          await page.screenshot({ path: path.join(zrzuty, `ramka-${ekran.nazwa}-${szerokosc}-z-danymi.png`), fullPage: true });
        }

        // Link skoku: pierwszy cel klawiatury, przenosi na #tresc.
        const skok = page.getByRole("link", { name: "Przejdź do treści" });
        await expect(skok).toHaveCount(1);
        await expect(skok).toHaveAttribute("href", "#tresc");
        const pierwszyCel = await page.evaluate(() => {
          const wybor = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]";
          const el = Array.from(document.querySelectorAll<HTMLElement>(wybor)).find((e) => e.tabIndex >= 0);
          return el ? { tekst: (el.textContent ?? "").trim(), href: el.getAttribute("href") } : null;
        });
        expect(pierwszyCel, "pierwszy cel klawiatury w kolejności dokumentu").toEqual({ tekst: "Przejdź do treści", href: "#tresc" });
        // Ekran, który sam przenosi fokus po wczytaniu, zaczyna od niego — wtedy skok dostaje fokus wprost.
        const fokusNaStarcie = await page.evaluate(() =>
          document.activeElement === document.body ? null : `${document.activeElement?.tagName}#${document.activeElement?.id}`,
        );
        testInfo.annotations.push({ type: "fokus po wczytaniu", description: fokusNaStarcie ?? "body" });
        if (fokusNaStarcie === null) await page.keyboard.press("Tab");
        else await skok.focus();
        await expect(skok).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.locator("#tresc")).toBeFocused();

        // Menu: lista z makiety, bieżąca pozycja, nazwa w menu, tytuł karty.
        const nav = await menuWidoczne(page, szerokosc);
        // Tokeny wyglądu tylko w poddrzewie z `data-theme`: ramka (menu, pasek) je ma, korzeń dokumentu — nie.
        const tokeny = {
          menu: await nav.evaluate((el) => getComputedStyle(el).getPropertyValue("--brand").trim()),
          pasek: await page
            .locator("[data-powloka-panelu] header")
            .first()
            .evaluate((el) => getComputedStyle(el).getPropertyValue("--brand").trim()),
          dokument: await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--brand").trim()),
        };
        expect(tokeny.menu, "--brand na menu ramki").not.toBe("");
        expect(tokeny.pasek, "--brand na pasku ramki").not.toBe("");
        expect(tokeny.dokument, "--brand na documentElement").toBe("");

        // Długie nazwy pozycji: pełny tekst widoczny, bez wielokropka, najwyżej 2 wiersze.
        // Pozycje widoczne (grupa zwinięta „Dotychczasowy panel” jest na wejściu ukryta).
        const nazwyPozycji = await nav.locator("a:visible").evaluateAll((linki) =>
          linki.map((a) => {
            const etykieta = a.querySelector("p") ?? a;
            const styl = getComputedStyle(etykieta);
            const zakres = document.createRange();
            zakres.selectNodeContents(etykieta);
            const wiersze = new Set(Array.from(zakres.getClientRects()).map((r) => Math.round(r.top))).size;
            return {
              tekst: (etykieta.textContent ?? "").trim(),
              wielokropek: styl.textOverflow === "ellipsis",
              obciety: etykieta.scrollWidth > etykieta.clientWidth + 1 || etykieta.scrollHeight > etykieta.clientHeight + 1,
              wiersze,
            };
          }),
        );
        const zle = nazwyPozycji.filter((n) => n.wielokropek || n.obciety || n.wiersze > 2 || n.wiersze < 1);
        expect(zle, JSON.stringify(zle)).toEqual([]);
        if (szerokosc >= 1024) {
          const dluga = nazwyPozycji.find((n) => n.tekst === "Treść ekranu „Zacznij tutaj”");
          expect(dluga?.wiersze, "najdłuższa nazwa mieści się w 1–2 wierszach").toBeLessThanOrEqual(2);
        }

        const menu = await odczytajMenu(nav);
        expect(menu.grupy).toEqual(MENU_OCZEKIWANE);
        expect(menu.konto).toBe("Konto");
        expect(menu.przyciski).toEqual(["Dotychczasowy panel (6)", "Wyloguj"]);
        await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
        // Bieżąca pozycja widoczna także wtedy, gdy stoi w grupie zwiniętej („Dotychczasowy panel”).
        await expect(nav.locator('a[aria-current="page"]')).toBeVisible();
        expect((await nav.locator('a[aria-current="page"]').textContent())?.trim()).toBe(ekran.menu);
        await expect.soft(page, "tytuł karty").toHaveTitle(ekran.tytul);

        if (zrzuty && szerokosc < 1024) {
          await page.screenshot({ path: path.join(zrzuty, `ramka-${ekran.nazwa}-${szerokosc}-menu-z-danymi.png`) });
        }

        if (szerokosc < 1024) {
          await page.getByRole("dialog", { name: "Menu i konto" }).getByRole("button", { name: "Zamknij" }).click();
          await expect(page.getByRole("dialog", { name: "Menu i konto" })).toHaveCount(0);
        }
      });
    }
  }

  test("wejście z menu nowej ramki: klik pozycji włączonej grupy zostaje w nowej ramce", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await instalujAtrapyApi(page);
    await page.goto("/admin");
    await zabezpieczeniePrzedEkranemDostepu(page);

    const nav = page.getByRole("complementary", { name: "Menu i konto" }).getByRole("navigation", { name: "Menu — Administracja" });
    await nav.getByRole("link", { name: "Wzory dokumentów", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/wzory-dokumentow$/);
    await expect(page.getByRole("heading", { level: 1, name: "Wzory dokumentów", exact: true })).toBeVisible();
    await expect(page.locator("[data-powloka-panelu]")).toHaveCount(1);
    await expect(page.locator("main")).toHaveCount(1);
  });

  test("kontrola dodatnia: /admin/kursy (grupa wyłączona) ma dotychczasową powłokę, bez nowej ramki", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await instalujAtrapyApi(page);
    await page.goto("/admin/kursy");
    await zabezpieczeniePrzedEkranemDostepu(page);

    await expect(page.getByRole("navigation", { name: "Menu — Administracja" }).first()).toBeVisible();
    await expect(page.locator("[data-powloka-panelu]")).toHaveCount(0);
    await expect(page.locator("main")).toHaveCount(1);
  });
});

/**
 * Menu na 1280×800 i pasek górny: „Wyloguj” w oknie bez przewijania menu
 * (dolna krawędź ≤ 800 przy `scrollTop` 0, nie zasłonięte), „Dotychczasowy
 * panel (n)” zwinięty na wejściu i rozwijany kliknięciem, linie „W
 * przygotowaniu” rozłączne z nazwami pozycji menu, pasek „PsychON · rok programu 2026/27”; na 390
 * „Zamknij” okna menu ze znakiem „×”.
 */
test.describe("nowa ramka panelu administracji — menu 1280×800 i pasek", () => {
  test(`${EKRANY[0].adres} @1280x800: „Wyloguj” bez przewijania, grupa zwinięta, linie rozłączne z menu, pasek`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await instalujAtrapyApi(page);
    await page.goto(EKRANY[0].adres);
    await zabezpieczeniePrzedEkranemDostepu(page);
    const bok = page.getByRole("complementary", { name: "Menu i konto" });
    const nav = bok.getByRole("navigation", { name: "Menu — Administracja" });
    await expect(nav).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

    // „Wyloguj” widoczne bez przewijania menu.
    expect(await bok.evaluate((el) => el.scrollTop), "scrollTop menu").toBe(0);
    const wyloguj = bok.getByRole("button", { name: "Wyloguj" });
    await expect(wyloguj).toBeVisible();
    const pomiar = await wyloguj.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const trafiony = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { gora: Math.round(r.top), dol: Math.round(r.bottom), nieZasloniete: !!trafiony && el.contains(trafiony) };
    });
    expect(pomiar, JSON.stringify(pomiar)).toMatchObject({ nieZasloniete: true });
    expect(pomiar.gora, "górna krawędź „Wyloguj”").toBeGreaterThanOrEqual(0);
    expect(pomiar.dol, "dolna krawędź „Wyloguj” przy 800 px").toBeLessThanOrEqual(800);

    // „Dotychczasowy panel (n)”: zwinięty na wejściu, przed „Konto”, rozwijany kliknięciem.
    const grupa = MENU_OCZEKIWANE.find((g) => g.naglowek.startsWith("Dotychczasowy panel"));
    expect(grupa?.naglowek).toBe(`Dotychczasowy panel (${grupa?.pozycje.length})`);
    const przycisk = nav.getByRole("button", { name: grupa?.naglowek, exact: true });
    await expect(przycisk).toHaveAttribute("aria-expanded", "false");
    const lista = page.locator(`[id="${await przycisk.getAttribute("aria-controls")}"]`);
    await expect(lista).toBeHidden();
    const przedKontem = await przycisk.evaluate((el) => {
      const w = el.closest("nav")?.querySelectorAll("button") ?? [];
      const wyl = Array.from(w).find((b) => (b.textContent ?? "").trim() === "Wyloguj");
      return !!wyl && !!(el.compareDocumentPosition(wyl) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(przedKontem, "grupa zwinięta przed „Wyloguj”").toBe(true);
    const katalog = katalogZrzutow();
    if (katalog) await page.screenshot({ path: path.join(katalog, `ramka-${EKRANY[0].nazwa}-1280x800-menu.png`) });
    await przycisk.click();
    await expect(przycisk).toHaveAttribute("aria-expanded", "true");
    await expect(lista).toBeVisible();
    await expect(lista.getByRole("link")).toHaveCount(grupa?.pozycje.length ?? -1);
    await expect(lista.getByRole("link").first()).toHaveText(grupa?.pozycje[0][0] ?? "");

    // Linie „W przygotowaniu” nie wymieniają pozycji menu.
    const { linie, pozycje } = await nav.evaluate((el) => ({
      linie: Array.from(el.querySelectorAll("p"))
        .map((p) => (p.textContent ?? "").trim())
        .filter((t) => t.startsWith("W przygotowaniu: "))
        .flatMap((t) => t.replace(/^W przygotowaniu: /, "").replace(/\.$/, "").split(" · "))
        .map((n) => n.trim().toLocaleLowerCase("pl")),
      pozycje: Array.from(el.querySelectorAll("a")).map((a) => (a.textContent ?? "").trim().toLocaleLowerCase("pl")),
    }));
    expect(linie.length, "linie „W przygotowaniu” odczytane").toBeGreaterThan(0);
    expect(linie.filter((n) => pozycje.includes(n))).toEqual([]);

    // Pasek górny.
    await expect(page.locator("[data-powloka-panelu] header [data-pasek-programu]")).toHaveText("PsychON · rok programu 2026/27");
    await expect(page.locator("[data-powloka-panelu] header").first()).not.toContainText("Rok programu:");
  });

  test(`${EKRANY[0].adres} @390: okno menu z „Zamknij” ze znakiem „×”, grupa zwinięta`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await instalujAtrapyApi(page);
    await page.goto(EKRANY[0].adres);
    await zabezpieczeniePrzedEkranemDostepu(page);
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    const okno = page.getByRole("dialog", { name: "Menu i konto" });
    await expect(okno).toBeVisible();
    const zamknij = okno.getByRole("button", { name: "Zamknij", exact: true });
    await expect(zamknij.locator('[data-znak-zamknij][aria-hidden="true"]')).toHaveText("×");
    await expect(okno.getByRole("button", { name: /^Dotychczasowy panel \(\d+\)$/ })).toHaveAttribute("aria-expanded", "false");
    const katalog = katalogZrzutow();
    if (katalog) await page.screenshot({ path: path.join(katalog, `ramka-${EKRANY[0].nazwa}-390-menu-otwarte.png`) });
    await zamknij.click();
    await expect(okno).toHaveCount(0);
  });
});

/**
 * Położenie bieżącej pozycji menu (`aria-current="page"`) w kontenerze menu
 * (bok albo okno szuflady) względem jego górnej krawędzi i górnej krawędzi
 * przyklejonego bloku „Konto”, plus przewinięcie kontenera i okna. Wartości
 * surowe z `getBoundingClientRect()` — bez zaokrąglania, tolerancja 0.
 */
async function pomiarBiezacejPozycji(kontener: Locator) {
  return kontener.evaluate((el) => {
    const pozycja = el.querySelector('a[aria-current="page"]');
    const konto = el.querySelector("[data-konto-menu]");
    const wyloguj = Array.from(el.querySelectorAll("button")).find((b) => (b.textContent ?? "").trim() === "Wyloguj");
    const k = el.getBoundingClientRect();
    const p = pozycja?.getBoundingClientRect();
    return {
      pozycja: (pozycja?.textContent ?? "").trim(),
      goraPozycji: p ? p.top : null,
      dolPozycji: p ? p.bottom : null,
      goraKontenera: k.top,
      goraKonta: konto ? konto.getBoundingClientRect().top : null,
      dolWyloguj: wyloguj ? wyloguj.getBoundingClientRect().bottom : null,
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollY: window.scrollY,
      fokus: document.activeElement?.tagName ?? null,
    };
  });
}

type PomiarBiezacej = Awaited<ReturnType<typeof pomiarBiezacejPozycji>>;

function biezacaWidoczna(m: PomiarBiezacej): boolean {
  return (
    m.goraPozycji !== null &&
    m.dolPozycji !== null &&
    m.goraKonta !== null &&
    m.goraPozycji >= m.goraKontenera &&
    m.dolPozycji <= m.goraKonta
  );
}

test.describe("nowa ramka panelu administracji — bieżąca pozycja menu widoczna", () => {
  test("/admin/profile/12 @1280x800: pozycja bieżąca nad „Konto”, przewija się tylko menu", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await instalujAtrapyApi(page);
    await page.goto("/admin/profile/12");
    await zabezpieczeniePrzedEkranemDostepu(page);
    const bok = page.getByRole("complementary", { name: "Menu i konto" });
    await expect(bok.locator('a[aria-current="page"]')).toHaveText("Profile psychologa");
    await expect.poll(async () => biezacaWidoczna(await pomiarBiezacejPozycji(bok)), { timeout: 5000 }).toBe(true);
    const m = await pomiarBiezacejPozycji(bok);
    const opis = JSON.stringify(m);
    console.log(`POMIAR-MENU admin /admin/profile/12 ${opis}`);
    expect(m.dolPozycji!, `dół pozycji <= góra „Konto” ${opis}`).toBeLessThanOrEqual(m.goraKonta!);
    expect(m.goraPozycji!, `góra pozycji >= góra menu ${opis}`).toBeGreaterThanOrEqual(m.goraKontenera);
    expect(m.scrollTop, `menu przewinięte ${opis}`).toBeGreaterThan(0);
    expect(m.scrollY, `okno nieprzewinięte ${opis}`).toBe(0);
    expect(m.fokus, `fokus bez zmian ${opis}`).toBe("BODY");
    expect(m.dolWyloguj!, `„Wyloguj” przy 800 px ${opis}`).toBeLessThanOrEqual(800);
  });

  test("/admin @1280x800: pozycja bieżąca widoczna, menu nieprzewinięte", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await instalujAtrapyApi(page);
    await page.goto("/admin");
    await zabezpieczeniePrzedEkranemDostepu(page);
    const bok = page.getByRole("complementary", { name: "Menu i konto" });
    await expect(bok.locator('a[aria-current="page"]')).toHaveText("Pulpit");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    const m = await pomiarBiezacejPozycji(bok);
    const opis = JSON.stringify(m);
    console.log(`POMIAR-MENU admin /admin ${opis}`);
    expect(biezacaWidoczna(m), `pozycja widoczna ${opis}`).toBe(true);
    expect(m.scrollTop, `scrollTop menu ${opis}`).toBe(0);
    expect(m.scrollY, `okno nieprzewinięte ${opis}`).toBe(0);
  });

  test("/admin/profile/12 @390: po otwarciu okna menu pozycja bieżąca nad „Konto”", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await instalujAtrapyApi(page);
    await page.goto("/admin/profile/12");
    await zabezpieczeniePrzedEkranemDostepu(page);
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    const okno = page.getByRole("dialog", { name: "Menu i konto" });
    await expect(okno).toBeVisible();
    await expect(okno.locator('a[aria-current="page"]')).toHaveText("Profile psychologa");
    await expect.poll(async () => biezacaWidoczna(await pomiarBiezacejPozycji(okno)), { timeout: 5000 }).toBe(true);
    const m = await pomiarBiezacejPozycji(okno);
    console.log(`POMIAR-MENU admin @390 /admin/profile/12 ${JSON.stringify(m)}`);
    expect(m.scrollY, JSON.stringify(m)).toBe(0);
  });
});

/** Obliczony cień i kolor górnej krawędzi bloku „Konto” w menu bocznym. */
async function krawedzKonta(bok: Locator) {
  return bok.locator("[data-konto-menu]").evaluate((el) => {
    const s = getComputedStyle(el);
    return { cien: s.boxShadow, linia: s.borderTopColor, grubosc: s.borderTopWidth };
  });
}

test.describe("nowa ramka panelu administracji — krawędź „Konto” nad treścią menu", () => {
  const TRASY = [
    { adres: "/admin/ekran-startowy", nazwa: "ekran-startowy", menu: "Treść ekranu „Zacznij tutaj”" },
    { adres: "/admin/wzory-dokumentow", nazwa: "wzory-dokumentow", menu: "Wzory dokumentów" },
  ];
  for (const trasa of TRASY) {
    test(`${trasa.adres} @1280x800: pozycja bieżąca cała nad górą „Konto”`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await instalujAtrapyApi(page);
      await page.goto(trasa.adres);
      await zabezpieczeniePrzedEkranemDostepu(page);
      const bok = page.getByRole("complementary", { name: "Menu i konto" });
      await expect(bok.locator('a[aria-current="page"]')).toHaveText(trasa.menu);
      await expect.poll(async () => biezacaWidoczna(await pomiarBiezacejPozycji(bok)), { timeout: 5000 }).toBe(true);
      const katalog = katalogZrzutow();
      if (katalog) await page.screenshot({ path: path.join(katalog, `ramka-${trasa.nazwa}-1280x800-konto.png`) });
      const m = await pomiarBiezacejPozycji(bok);
      const opis = JSON.stringify({ ...m, ...(await krawedzKonta(bok)) });
      console.log(`POMIAR-KONTO admin ${trasa.adres} ${opis}`);
      expect(m.dolPozycji!, `dół pozycji <= góra „Konto” ${opis}`).toBeLessThanOrEqual(m.goraKonta!);
      expect(m.goraPozycji!, `góra pozycji >= góra menu ${opis}`).toBeGreaterThanOrEqual(m.goraKontenera);
      expect(m.scrollY, `okno nieprzewinięte ${opis}`).toBe(0);
    });
  }

  test("/admin @1280x800: na wejściu treść pod „Konto” — linia i cień", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await instalujAtrapyApi(page);
    await page.goto("/admin");
    await zabezpieczeniePrzedEkranemDostepu(page);
    const bok = page.getByRole("complementary", { name: "Menu i konto" });
    await expect(bok.locator('a[aria-current="page"]')).toHaveText("Pulpit");
    await expect.poll(async () => (await krawedzKonta(bok)).cien, { timeout: 5000 }).not.toBe("none");
    const katalog = katalogZrzutow();
    if (katalog) await page.screenshot({ path: path.join(katalog, "ramka-pulpit-1280x800-konto.png") });
    const k = await krawedzKonta(bok);
    const m = await pomiarBiezacejPozycji(bok);
    const opis = JSON.stringify({ ...k, scrollTop: m.scrollTop, scrollHeight: m.scrollHeight, clientHeight: m.clientHeight });
    console.log(`POMIAR-KONTO admin /admin wejscie ${opis}`);
    expect(m.scrollHeight, `menu przewijane ${opis}`).toBeGreaterThan(m.clientHeight);
    expect(k.grubosc, opis).toBe("1px");
    expect(k.linia, `linia widoczna ${opis}`).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("/admin @1280x800: menu przewinięte do końca — bez cienia i bez linii", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await instalujAtrapyApi(page);
    await page.goto("/admin");
    await zabezpieczeniePrzedEkranemDostepu(page);
    const bok = page.getByRole("complementary", { name: "Menu i konto" });
    await expect(bok.locator('a[aria-current="page"]')).toHaveText("Pulpit");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await bok.evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: "instant" }));
    await expect.poll(async () => (await krawedzKonta(bok)).cien, { timeout: 5000 }).toBe("none");
    const katalog = katalogZrzutow();
    if (katalog) await page.screenshot({ path: path.join(katalog, "ramka-pulpit-1280x800-konto-koniec.png") });
    const k = await krawedzKonta(bok);
    const m = await pomiarBiezacejPozycji(bok);
    const opis = JSON.stringify({ ...k, scrollTop: m.scrollTop, scrollHeight: m.scrollHeight, clientHeight: m.clientHeight });
    console.log(`POMIAR-KONTO admin /admin koniec ${opis}`);
    expect(m.scrollTop + m.clientHeight, `przewinięte do końca ${opis}`).toBeGreaterThanOrEqual(m.scrollHeight - 1);
    expect(k.linia, `linia przezroczysta ${opis}`).toBe("rgba(0, 0, 0, 0)");
  });
});

test.describe("nowa ramka panelu administracji — krawędź „Konto” w szufladzie 390", () => {
  test("/admin @390: szuflada z treścią pod „Konto” — cień, po przewinięciu do końca bez cienia", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await instalujAtrapyApi(page);
    await page.goto("/admin");
    await zabezpieczeniePrzedEkranemDostepu(page);
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    const okno = page.getByRole("dialog", { name: "Menu i konto" });
    await expect(okno).toBeVisible();
    await expect(okno.getByRole("button", { name: "Zamknij", exact: true })).toBeFocused();
    await expect.poll(async () => (await krawedzKonta(okno)).cien, { timeout: 5000 }).not.toBe("none");
    const katalog = katalogZrzutow();
    if (katalog) await page.screenshot({ path: path.join(katalog, "ramka-pulpit-390-szuflada-konto.png") });
    const m = await pomiarBiezacejPozycji(okno);
    const k = await krawedzKonta(okno);
    const opis = JSON.stringify({ ...k, scrollTop: m.scrollTop, scrollHeight: m.scrollHeight, clientHeight: m.clientHeight });
    console.log(`POMIAR-KONTO admin @390 /admin szuflada ${opis}`);
    expect(m.scrollHeight, `szuflada przewijana ${opis}`).toBeGreaterThan(m.clientHeight);
    expect(k.linia, `linia widoczna ${opis}`).not.toBe("rgba(0, 0, 0, 0)");
    await okno.evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: "instant" }));
    await expect.poll(async () => (await krawedzKonta(okno)).cien, { timeout: 5000 }).toBe("none");
    if (katalog) await page.screenshot({ path: path.join(katalog, "ramka-pulpit-390-szuflada-konto-koniec.png") });
    await expect(okno.getByRole("button", { name: "Zamknij", exact: true })).toBeFocused();
    await okno.getByRole("button", { name: "Zamknij", exact: true }).click();
    await expect(okno).toHaveCount(0);
  });
});
