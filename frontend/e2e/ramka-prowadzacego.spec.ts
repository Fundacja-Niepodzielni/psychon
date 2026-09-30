import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";

/**
 * Nowa ramka panelu prowadzącego (makieta 2.0.4, menu roli `p`, w. 1108) na
 * zbudowanej aplikacji, z atrapą API przez `page.route` i atrapą sesji (jak
 * w `przelaczenie-grupa-prowadzacy.spec.ts`). Dane atrap według
 * `docs/hackathon/04-seed-demo.md` (prowadząca Joanna Demo).
 *
 * Pulpit prowadzącego (`/prowadzacy`) na 1280 i 390 px — te same miary co
 * `ramka-administracji.spec.ts`: menu = tabela z makiety (plus „Dotychczasowy
 * panel”), nazwa w menu „Pulpit” (para ze słownika) i `h1` == tytuł karty
 * „Pulpit prowadzącego”, jeden `main#tresc`, skok pierwszy w Tab, bez
 * przewijania w poziomie, odstęp >= 16 px, axe 0, bez „Wstecz”, okruszki
 * tylko łączami, `--brand` na ramce i pusty na `documentElement`, linia
 * „profil prowadzącego · pomoc” w grupie „Konto”; pasek bez roku programu.
 * Kontrola dodatnia: `/prowadzacy/kursy` (strona spoza grup) ma dalej
 * dotychczasową powłokę.
 *
 * Zrzuty ekranu powstają tylko przy ustawionej zmiennej `PW_ZRZUTY_RAMKI`.
 */

const ATRAPA_SESJI = {
  accessToken: "atrapa-tokenu-testowego",
  expiresAt: Date.now() + 3_600_000,
};

function odpowiedz(dane: unknown, meta?: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }) };
}

const META = { current_page: 1, per_page: 25, total: 1, last_page: 1 };

interface Ekran {
  nazwa: string;
  adres: string;
  /** Nazwa pozycji menu oznaczonej jako bieżąca. */
  menu: string;
  h1: string | RegExp;
  tytul: string | null;
}

const SZEROKOSCI = [1280, 390] as const;

/**
 * Atrapy API prowadzącej. Ogólna atrapa jest rejestrowana PIERWSZA —
 * Playwright wybiera trasę zarejestrowaną PÓŹNIEJ jako pierwszą.
 */
async function instalujAtrapyApi(page: Page): Promise<void> {
  const api = "http://localhost:8000/api/v1";
  await page.route(`${api}/**`, (route) => route.fulfill(odpowiedz([], { ...META, total: 0 })));
  await page.route(`${api}/me`, (route) =>
    route.fulfill(odpowiedz({ id: 5, role: "instructor", first_name: "Joanna", last_name: "Demo" })),
  );
  await page.route(`${api}/notifications**`, (route) => route.fulfill(odpowiedz([], { ...META, total: 0, extra: { unread: 0 } })));
  await page.route(`${api}/instructor/group`, (route) =>
    route.fulfill(
      odpowiedz({
        members: [
          {
            id: 17,
            first_name: "Marta",
            last_name: "Demo",
            progress: { courses_done: 2, courses_total: 10, hours_accepted: "41.5", supervision_present: 5, workshop_done: false },
          },
        ],
        slots: [],
      }),
    ),
  );
  await page.route(`${api}/instructor/questions**`, (route) =>
    route.fulfill(odpowiedz([], { ...META, total: 0, extra: { unanswered: 0 } })),
  );
  await page.route(`${api}/instructor/courses`, (route) =>
    route.fulfill(odpowiedz([{ id: 2, slug: "wywiad-psychologiczny", title: "Wywiad psychologiczny", sequence_order: 2 }])),
  );
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ATRAPA_SESJI) }),
  );
  await page.route("**/api/auth/end-session-url", (route) => route.fulfill(odpowiedz({ url: null })));
}

/** Menu oczekiwane — makieta 2.0.4, rola `p` (w. 1108), plus „Dotychczasowy panel” (`lib/menu/ramka/prowadzacy.ts`). */
const MENU_OCZEKIWANE = [
  { naglowek: "Codziennie", pozycje: [["Pulpit", "/prowadzacy"]], linia: null },
  // Bez „moja grupa” — „Moja grupa” jest pozycją menu („Dotychczasowy panel”).
  { naglowek: "Program", pozycje: [["Moje kursy", "/prowadzacy/kursy"]], linia: "W przygotowaniu: superwizja." },
  {
    naglowek: "Dotychczasowy panel (3)",
    pozycje: [
      ["Moja grupa", "/prowadzacy/grupa"],
      ["Wątek grupowy", "/prowadzacy/watek-grupowy"],
      ["Pytania", "/prowadzacy/pytania"],
    ],
    linia: null,
  },
];

const LINIA_KONTA = "W przygotowaniu: profil prowadzącego · pomoc.";

const EKRANY: Ekran[] = [
  {
    nazwa: "pulpit-prowadzacego",
    adres: "/prowadzacy",
    menu: "Pulpit",
    h1: "Pulpit prowadzącego",
    tytul: "Pulpit prowadzącego — Niepodzielni",
  },
];

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
    return page.getByRole("complementary", { name: "Menu i konto" }).getByRole("navigation", { name: "Menu — Panel prowadzącego" });
  }
  await expect(page.getByRole("complementary", { name: "Menu i konto" })).toBeHidden();
  const przycisk = page.getByRole("button", { name: "Menu", exact: true });
  await expect(przycisk.locator('svg[aria-hidden="true"] path')).toHaveAttribute("d", "M3 6h18M3 12h18M3 18h18");
  await przycisk.click();
  const okno = page.getByRole("dialog", { name: "Menu i konto" });
  await expect(okno).toBeVisible();
  return okno.getByRole("navigation", { name: "Menu — Panel prowadzącego" });
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

test.describe("nowa ramka panelu prowadzącego — ekrany włączonych grup", () => {
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

        // Rok programu: zaplecze nie daje tej roli dat edycji — element pominięty, nie atrapa.
        await expect(page.locator("[data-powloka-panelu] header").first()).not.toContainText("Rok programu");

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

        const menu = await odczytajMenu(nav);
        expect(menu.grupy).toEqual(MENU_OCZEKIWANE);
        expect(menu.konto).toBe("Konto");
        expect(menu.przyciski).toEqual(["Dotychczasowy panel (3)", "Wyloguj"]);
        await expect(nav.locator("p").filter({ hasText: LINIA_KONTA })).toHaveText(LINIA_KONTA);
        await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
        // Bieżąca pozycja widoczna także wtedy, gdy stoi w grupie zwiniętej („Dotychczasowy panel”).
        await expect(nav.locator('a[aria-current="page"]')).toBeVisible();
        expect((await nav.locator('a[aria-current="page"]').textContent())?.trim()).toBe(ekran.menu);
        if (ekran.tytul) await expect.soft(page, "tytuł karty").toHaveTitle(ekran.tytul);

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


  test("kontrola dodatnia: /prowadzacy/kursy (strona spoza grup) ma dotychczasową powłokę, bez nowej ramki", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await instalujAtrapyApi(page);
    await page.goto("/prowadzacy/kursy");
    await zabezpieczeniePrzedEkranemDostepu(page);

    await expect(page.getByRole("navigation", { name: "Menu — Panel prowadzącego" }).first()).toBeVisible();
    await expect(page.locator("[data-powloka-panelu]")).toHaveCount(0);
    await expect(page.locator("main")).toHaveCount(1);
  });
});

/**
 * Menu na 1280×800 i pasek górny: „Wyloguj” w oknie bez przewijania menu
 * (dolna krawędź ≤ 800 przy `scrollTop` 0, nie zasłonięte), „Dotychczasowy
 * panel (n)” zwinięty na wejściu i rozwijany kliknięciem, linie „W
 * przygotowaniu” rozłączne z nazwami pozycji menu, pasek „PsychON”; na 390
 * „Zamknij” okna menu ze znakiem „×”.
 */
test.describe("nowa ramka panelu prowadzącego — menu 1280×800 i pasek", () => {
  test(`${EKRANY[0].adres} @1280x800: „Wyloguj” bez przewijania, grupa zwinięta, linie rozłączne z menu, pasek`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await instalujAtrapyApi(page);
    await page.goto(EKRANY[0].adres);
    await zabezpieczeniePrzedEkranemDostepu(page);
    const bok = page.getByRole("complementary", { name: "Menu i konto" });
    const nav = bok.getByRole("navigation", { name: "Menu — Panel prowadzącego" });
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
    await expect(page.locator("[data-powloka-panelu] header [data-pasek-programu]")).toHaveText("PsychON");
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
