import { expect, test, type Locator, type Page } from "@playwright/test";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";
import { dolaczNaruszeniaDoRaportu, uruchomAxe } from "./_axe";

/**
 * Pomiary grupy zwijanej „Ustawienia” w menu administracji (nowa ramka) na zbudowanej
 * aplikacji, z atrapą API i atrapą sesji (jak w `ramka-administracji.spec.ts`).
 *
 * Grupa „Ustawienia (4)” (Ustawienia edycji, Słownik form stażu, Wzory dokumentów, Treść ekranu „Zacznij tutaj”)
 * jest rysowana tym samym komponentem co „Dotychczasowy panel (n)”:
 * 1. 1280×800, ekran spoza grupy: pozycje „Codziennie”, „Program”, „Rozliczenie” i przycisk
 *    „Ustawienia (4)” w całości między górą menu a górą bloku „Konto”, menu nieprzewinięte;
 * 2. 1280×800, ekran w grupie: grupa rozwinięta, bieżąca pozycja w całości nad „Konto”;
 * 3. sygnał przewijania: w oknie, w którym menu się nie mieści, blok „Konto” niesie krawędź
 *    (klasa i cień), po przewinięciu do końca jej nie niesie; w oknie, w którym się mieści — nie;
 * 4. 390×844, okno menu: zwinięta na ekranie spoza grupy, rozwinięta na ekranie grupy,
 *    przełączanie klawiaturą, bez przewijania w poziomie;
 * 5. kolejność Tab przy grupie zwiniętej i rozwiniętej;
 * 6. styl przycisku „Ustawienia (4)” == styl przycisku „Dotychczasowy panel (n)” pole po polu;
 * 8. axe na `/admin` i `/admin/formy-stazu` przy 1280 i 390 (menu otwarte przy 390): 0 naruszeń.
 *
 * Liczby z DOM idą do wyjścia jako wiersze `POMIAR-USTAWIENIA-…`.
 */

const ATRAPA_SESJI = { accessToken: "atrapa-tokenu-testowego", expiresAt: Date.now() + 3_600_000 };

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

const FORMA = {
  id: 7,
  name: "Dyżur telefoniczny",
  description: "Rozmowa telefoniczna w godzinach dyżuru.",
  is_active: true,
  sort_order: 1,
  created_at: null,
  updated_at: null,
};

const EKRAN_STARTOWY = {
  video: { title: "Film powitalny", url: null, caption: null },
  program: { title: "Przebieg programu", body: "Dziesięć etapów, staż i superwizje." },
  expectations: { title: "Oczekiwania", body: "Regularna nauka i obecność na superwizjach." },
  updated_at: null,
};

const META = { current_page: 1, per_page: 25, total: 1, last_page: 1 };

function odpowiedz(dane: unknown, meta?: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(meta ? { data: dane, meta } : { data: dane }) };
}

/** Ogólna atrapa jest rejestrowana PIERWSZA — Playwright wybiera trasę zarejestrowaną PÓŹNIEJ jako pierwszą. */
async function instalujAtrapyApi(page: Page): Promise<void> {
  const api = "http://localhost:8000/api/v1";
  await page.route(`${api}/**`, (route) => route.fulfill(odpowiedz([], { ...META, total: 0 })));
  await page.route(`${api}/me`, (route) =>
    route.fulfill(odpowiedz({ id: 1, role: "project_manager", first_name: "Opiekun", last_name: "Demo", program_completed_at: null })),
  );
  await page.route(`${api}/notifications**`, (route) => route.fulfill(odpowiedz([], { ...META, total: 0, extra: { unread: 0 } })));
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
  await page.route(`${api}/admin/internship/forms**`, (route) => route.fulfill(odpowiedz([FORMA])));
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

const POZYCJE_USTAWIEN = ["Ustawienia edycji", "Słownik form stażu", "Wzory dokumentów", "Treść ekranu „Zacznij tutaj”"];
const EKRANY_USTAWIEN = [
  { adres: "/admin/formy-stazu", menu: POZYCJE_USTAWIEN[1] },
  { adres: "/admin/wzory-dokumentow", menu: POZYCJE_USTAWIEN[2] },
  { adres: "/admin/ekran-startowy", menu: POZYCJE_USTAWIEN[3] },
];
const POZYCJE_BEZ_USTAWIEN = [
  "Pulpit",
  "Sprawy",
  "Uczestnicy",
  "Zgłoszenia współpracy",
  "Kursy",
  "Raport roku programu",
  "Dziennik działań",
];
const POZYCJE_DOTYCHCZASOWE = ["Czas nauki", "Certyfikaty", "Profile psychologa", "Superwizje", "Skrzynka e-maili"];

function bok(page: Page): Locator {
  return page.getByRole("complementary", { name: "Menu i konto" });
}

function menuBoczne(page: Page): Locator {
  return bok(page).getByRole("navigation", { name: "Menu — Administracja" });
}

async function otworzOknoMenu(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const okno = page.getByRole("dialog", { name: "Menu i konto" });
  await expect(okno).toBeVisible();
  return okno;
}

async function wejdz(page: Page, adres: string, szerokosc: number, wysokosc: number): Promise<void> {
  await page.setViewportSize({ width: szerokosc, height: wysokosc });
  await instalujAtrapyApi(page);
  await page.goto(adres);
  await zabezpieczeniePrzedEkranemDostepu(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.locator("[data-powloka-panelu]")).toHaveCount(1);
}

/** Geometria menu w kontenerze (bok albo okno): surowe `getBoundingClientRect()`. */
async function geometriaMenu(kontener: Locator) {
  return kontener.evaluate((el) => {
    const k = el.getBoundingClientRect();
    const konto = el.querySelector("[data-konto-menu]");
    const goraKonta = konto ? konto.getBoundingClientRect().top : null;
    const widoczne = (e: Element) => (e as HTMLElement).offsetParent !== null;
    const przyciskUstawien = Array.from(el.querySelectorAll("button")).find((b) => (b.textContent ?? "").startsWith("Ustawienia ("));
    const przyciskDotychczasowego = Array.from(el.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").startsWith("Dotychczasowy panel ("),
    );
    // Tylko łącza menu (`nav`); stopka z odnośnikami prawnymi stoi pod nim, poza listą pozycji.
    const linki = Array.from(el.querySelectorAll("nav a"))
      .filter(widoczne)
      .map((a) => {
        const r = a.getBoundingClientRect();
        return { tekst: (a.textContent ?? "").trim(), gora: r.top, dol: r.bottom };
      });
    const rect = (b: Element | undefined) => (b ? { gora: b.getBoundingClientRect().top, dol: b.getBoundingClientRect().bottom } : null);
    const wyloguj = Array.from(el.querySelectorAll("button")).find((b) => (b.textContent ?? "").trim() === "Wyloguj");
    return {
      goraKontenera: k.top,
      goraKonta,
      dolWyloguj: wyloguj ? wyloguj.getBoundingClientRect().bottom : null,
      linki,
      ustawienia: rect(przyciskUstawien),
      dotychczasowy: rect(przyciskDotychczasowego),
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollY: window.scrollY,
    };
  });
}

/** Krawędź „Konto”: klasa sygnału (część nazwy klasy modułu CSS) i obliczony cień. */
async function krawedzKonta(kontener: Locator) {
  return kontener.locator("[data-konto-menu]").evaluate((el) => ({
    klasaSygnalu: /kontoNadTrescia/.test(el.getAttribute("class") ?? ""),
    cien: getComputedStyle(el).boxShadow,
  }));
}

test.describe("menu administracji — grupa zwijana „Ustawienia”", () => {
  test("pomiar 1: /admin @1280x800 — pozycje do „Ustawień (4)” bez przewijania, w całości nad „Konto”, „Wyloguj” w oknie", async ({ page }) => {
    await wejdz(page, "/admin", 1280, 800);
    const nawigacja = menuBoczne(page);
    const przycisk = nawigacja.getByRole("button", { name: "Ustawienia (4)", exact: true });
    await expect(przycisk).toHaveAttribute("aria-expanded", "false");
    await expect(nawigacja.locator('a[aria-current="page"]')).toHaveText("Pulpit");

    const g = await geometriaMenu(bok(page));
    const opis = JSON.stringify(g);
    expect(g.scrollTop, `scrollTop menu ${opis}`).toBe(0);
    expect(g.linki.map((l) => l.tekst), opis).toEqual(POZYCJE_BEZ_USTAWIEN);
    expect(g.ustawienia, opis).not.toBeNull();
    expect(g.goraKonta, opis).not.toBeNull();
    for (const l of g.linki) {
      expect(l.gora, `${l.tekst}: góra >= góra menu`).toBeGreaterThanOrEqual(g.goraKontenera);
      expect(l.dol, `${l.tekst}: dół <= góra „Konto”`).toBeLessThanOrEqual(g.goraKonta!);
    }
    expect(g.ustawienia!.gora, "przycisk „Ustawienia (4)”: góra >= góra menu").toBeGreaterThanOrEqual(g.goraKontenera);
    expect(g.ustawienia!.dol, "przycisk „Ustawienia (4)”: dół <= góra „Konto”").toBeLessThanOrEqual(g.goraKonta!);
    expect(g.dolWyloguj!, "„Wyloguj” w oknie 800 px").toBeLessThanOrEqual(800);
    const ostatniaPozycja = g.linki[g.linki.length - 1];
    console.log(
      `POMIAR-USTAWIENIA-1 /admin 1280x800 dolOstatniejPozycji=${ostatniaPozycja.dol} dolUstawien=${g.ustawienia!.dol} dolDotychczasowego=${g.dotychczasowy?.dol} goraKonta=${g.goraKonta} zapasPx=${(g.goraKonta! - g.ustawienia!.dol).toFixed(1)} dolWyloguj=${g.dolWyloguj} scrollTop=${g.scrollTop} scrollHeight=${g.scrollHeight} clientHeight=${g.clientHeight}`,
    );
  });

  for (const ekran of EKRANY_USTAWIEN) {
    test(`pomiar 2: ${ekran.adres} @1280x800 — grupa rozwinięta, „${ekran.menu}” w całości nad „Konto”`, async ({ page }) => {
      await wejdz(page, ekran.adres, 1280, 800);
      const nawigacja = menuBoczne(page);
      await expect(nawigacja.getByRole("button", { name: "Ustawienia (4)", exact: true })).toHaveAttribute("aria-expanded", "true");
      await expect(nawigacja.getByRole("button", { name: /^Dotychczasowy panel \(5\)$/ })).toHaveAttribute("aria-expanded", "false");
      const biezaca = nawigacja.locator('a[aria-current="page"]');
      await expect(biezaca).toHaveCount(1);
      await expect(biezaca).toHaveText(ekran.menu);
      await expect(biezaca).toBeVisible();
      await expect
        .poll(
          async () => {
            const g = await geometriaMenu(bok(page));
            const b = g.linki.find((l) => l.tekst === ekran.menu);
            return !!b && g.goraKonta !== null && b.gora >= g.goraKontenera && b.dol <= g.goraKonta;
          },
          { timeout: 5000 },
        )
        .toBe(true);
      const g = await geometriaMenu(bok(page));
      const b = g.linki.find((l) => l.tekst === ekran.menu)!;
      const miesciSie = g.scrollHeight <= g.clientHeight + 1;
      console.log(
        `POMIAR-USTAWIENIA-2 ${ekran.adres} 1280x800 gora=${b.gora} dol=${b.dol} goraKonta=${g.goraKonta} goraMenu=${g.goraKontenera} scrollTop=${g.scrollTop} scrollHeight=${g.scrollHeight} clientHeight=${g.clientHeight} cleMenuBezPrzewijania=${miesciSie} (${miesciSie ? "zapas" : "niedobór"} ${Math.abs(g.clientHeight - g.scrollHeight)} px) scrollY=${g.scrollY}`,
      );
      expect(g.scrollY, "okno nieprzewinięte").toBe(0);
    });
  }

  test("pomiar 3: sygnał przewijania — w oknie, gdzie menu się nie mieści, „Konto” niesie krawędź; po przewinięciu do końca nie; gdzie się mieści — nie niesie", async ({
    page,
  }) => {
    // 1280×560 przy obu grupach zwiniętych: menu dłuższe od okna.
    await wejdz(page, "/admin", 1280, 560);
    const kontener = bok(page);
    await expect.poll(async () => (await krawedzKonta(kontener)).klasaSygnalu, { timeout: 5000 }).toBe(true);
    const nieMiesci = await geometriaMenu(kontener);
    const znak1 = await krawedzKonta(kontener);
    console.log(
      `POMIAR-USTAWIENIA-3 nie-miesci 1280x560 scrollHeight=${nieMiesci.scrollHeight} clientHeight=${nieMiesci.clientHeight} klasa=${znak1.klasaSygnalu} cien=${znak1.cien}`,
    );
    expect(nieMiesci.scrollHeight, "menu dłuższe od okna").toBeGreaterThan(nieMiesci.clientHeight);
    expect(znak1.cien, "cień krawędzi „Konto”").not.toBe("none");
    await kontener.evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: "instant" }));
    await expect.poll(async () => (await krawedzKonta(kontener)).klasaSygnalu, { timeout: 5000 }).toBe(false);
    const znak2 = await krawedzKonta(kontener);
    const koniec = await geometriaMenu(kontener);
    console.log(
      `POMIAR-USTAWIENIA-3 po-przewinieciu-do-konca scrollTop=${koniec.scrollTop} klasa=${znak2.klasaSygnalu} cien=${znak2.cien}`,
    );
    expect(znak2.cien, "po przewinięciu do końca brak cienia").toBe("none");

    // Okno, w którym menu się mieści (obie grupy zwinięte): brak klasy sygnału.
    await page.setViewportSize({ width: 1280, height: 1100 });
    await expect.poll(async () => (await geometriaMenu(kontener)).clientHeight, { timeout: 5000 }).toBeGreaterThan(1000);
    await expect.poll(async () => (await krawedzKonta(kontener)).klasaSygnalu, { timeout: 5000 }).toBe(false);
    const miesci = await geometriaMenu(kontener);
    const znak3 = await krawedzKonta(kontener);
    console.log(
      `POMIAR-USTAWIENIA-3 miesci 1280x1100 scrollHeight=${miesci.scrollHeight} clientHeight=${miesci.clientHeight} klasa=${znak3.klasaSygnalu} cien=${znak3.cien}`,
    );
    expect(miesci.scrollHeight, "menu mieści się w oknie").toBeLessThanOrEqual(miesci.clientHeight + 1);
    expect(znak3.cien, "brak cienia, gdy menu się mieści").toBe("none");

    // Rozwinięcie obu grup w oknie, które mieści zwinięte menu, a nie mieści rozwiniętego: sygnał wraca.
    await page.setViewportSize({ width: 1280, height: 800 });
    const nawigacja = menuBoczne(page);
    await nawigacja.getByRole("button", { name: "Ustawienia (4)", exact: true }).click();
    await nawigacja.getByRole("button", { name: "Dotychczasowy panel (5)", exact: true }).click();
    await expect.poll(async () => (await krawedzKonta(kontener)).klasaSygnalu, { timeout: 5000 }).toBe(true);
    const obie = await geometriaMenu(kontener);
    console.log(`POMIAR-USTAWIENIA-3 obie-rozwiniete 1280x800 scrollHeight=${obie.scrollHeight} clientHeight=${obie.clientHeight} klasa=true`);
    expect(obie.scrollHeight).toBeGreaterThan(obie.clientHeight);
  });

  test("pomiar 4: @390x844 — okno menu: zwinięta na /admin, rozwinięta na ekranie grupy, klawiatura, bez przewijania w poziomie", async ({
    page,
  }) => {
    await wejdz(page, "/admin", 390, 844);
    let okno = await otworzOknoMenu(page);
    let przycisk = okno.getByRole("button", { name: "Ustawienia (4)", exact: true });
    await expect(przycisk).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(`[id="${await przycisk.getAttribute("aria-controls")}"]`)).toBeHidden();
    await przycisk.focus();
    await expect(przycisk).toBeFocused();
    await page.keyboard.press("Space");
    await expect(przycisk).toHaveAttribute("aria-expanded", "true");
    const lista = page.locator(`[id="${await przycisk.getAttribute("aria-controls")}"]`);
    await expect(lista).toBeVisible();
    await expect(lista.getByRole("link")).toHaveCount(4);
    await page.keyboard.press("Space");
    await expect(przycisk).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");
    await expect(przycisk).toHaveAttribute("aria-expanded", "true");
    const poziomo = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    console.log(`POMIAR-USTAWIENIA-4 /admin 390 przewijanieWPoziomie=${poziomo}`);
    expect(poziomo).toBe(false);
    await okno.getByRole("button", { name: "Zamknij", exact: true }).click();
    await expect(okno).toHaveCount(0);

    for (const ekran of EKRANY_USTAWIEN) {
      await page.goto(ekran.adres);
      await zabezpieczeniePrzedEkranemDostepu(page);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      okno = await otworzOknoMenu(page);
      przycisk = okno.getByRole("button", { name: "Ustawienia (4)", exact: true });
      await expect(przycisk).toHaveAttribute("aria-expanded", "true");
      const biezaca = okno.locator('a[aria-current="page"]');
      await expect(biezaca).toHaveText(ekran.menu);
      await expect
        .poll(
          async () => {
            const g = await geometriaMenu(okno);
            const b = g.linki.find((l) => l.tekst === ekran.menu);
            return !!b && g.goraKonta !== null && b.gora >= g.goraKontenera && b.dol <= g.goraKonta;
          },
          { timeout: 5000 },
        )
        .toBe(true);
      const g = await geometriaMenu(okno);
      const b = g.linki.find((l) => l.tekst === ekran.menu)!;
      console.log(
        `POMIAR-USTAWIENIA-4 ${ekran.adres} 390 gora=${b.gora} dol=${b.dol} goraKonta=${g.goraKonta} scrollTop=${g.scrollTop} scrollHeight=${g.scrollHeight} clientHeight=${g.clientHeight} scrollY=${g.scrollY}`,
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
      await okno.getByRole("button", { name: "Zamknij", exact: true }).click();
      await expect(okno).toHaveCount(0);
    }
  });

  test("pomiar 5: @1280 kolejność Tab — pozycje „Rozliczenia” → „Ustawienia” → (rozwinięta) jej pozycje → „Dotychczasowy panel” → „Wyloguj”", async ({
    page,
  }) => {
    await wejdz(page, "/admin", 1280, 900);
    const nawigacja = menuBoczne(page);
    const przyciskUstawien = nawigacja.getByRole("button", { name: "Ustawienia (4)", exact: true });
    const przyciskDotychczasowego = nawigacja.getByRole("button", { name: "Dotychczasowy panel (5)", exact: true });

    /** Tab po kolei od pierwszej pozycji menu do „Wyloguj”; zwraca nazwy elementów z fokusem. */
    async function kolejnoscTab(): Promise<string[]> {
      await nawigacja.getByRole("link", { name: "Pulpit", exact: true }).focus();
      const nazwy: string[] = [];
      for (let i = 0; i < 40; i += 1) {
        const nazwa = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el) return "";
          // Nazwa bez znaków ukrytych dla czytnika („+”/„−”).
          return Array.from(el.childNodes)
            .filter((w) => !(w instanceof Element && w.getAttribute("aria-hidden") === "true"))
            .map((w) => w.textContent ?? "")
            .join("")
            .trim();
        });
        nazwy.push(nazwa);
        if (nazwa === "Wyloguj") return nazwy;
        await page.keyboard.press("Tab");
      }
      return nazwy;
    }

    const oczekiwaneZwiniete = [...POZYCJE_BEZ_USTAWIEN, "Ustawienia (4)", "Dotychczasowy panel (5)", "Wyloguj"];
    const zwiniete = await kolejnoscTab();
    console.log(`POMIAR-USTAWIENIA-5 obie-zwiniete ${JSON.stringify(zwiniete)}`);
    expect(zwiniete).toEqual(oczekiwaneZwiniete);

    await przyciskUstawien.click();
    await expect(przyciskUstawien).toHaveAttribute("aria-expanded", "true");
    const ustawieniaRozwiniete = await kolejnoscTab();
    console.log(`POMIAR-USTAWIENIA-5 ustawienia-rozwiniete ${JSON.stringify(ustawieniaRozwiniete)}`);
    expect(ustawieniaRozwiniete).toEqual([
      ...POZYCJE_BEZ_USTAWIEN,
      "Ustawienia (4)",
      ...POZYCJE_USTAWIEN,
      "Dotychczasowy panel (5)",
      "Wyloguj",
    ]);

    await przyciskDotychczasowego.click();
    await expect(przyciskDotychczasowego).toHaveAttribute("aria-expanded", "true");
    const obieRozwiniete = await kolejnoscTab();
    console.log(`POMIAR-USTAWIENIA-5 obie-rozwiniete ${JSON.stringify(obieRozwiniete)}`);
    expect(obieRozwiniete).toEqual([
      ...POZYCJE_BEZ_USTAWIEN,
      "Ustawienia (4)",
      ...POZYCJE_USTAWIEN,
      "Dotychczasowy panel (5)",
      ...POZYCJE_DOTYCHCZASOWE,
      "Wyloguj",
    ]);
  });

  for (const szerokosc of [1280, 390] as const) {
    test(`pomiar 6: @${szerokosc} styl przycisku „Ustawienia (4)” == styl przycisku „Dotychczasowy panel (5)” pole po polu`, async ({ page }) => {
      await wejdz(page, "/admin", szerokosc, szerokosc >= 1024 ? 900 : 844);
      const kontener = szerokosc >= 1024 ? bok(page) : await otworzOknoMenu(page);
      const przyciski = await kontener.evaluate(() => {
        const wszystkie = Array.from(document.querySelectorAll("button"));
        const znajdz = (poczatek: string) =>
          wszystkie.filter((b) => (b.textContent ?? "").startsWith(poczatek) && b.getAttribute("aria-controls") && b.offsetParent !== null);
        const opisz = (el: Element) => {
          const s = getComputedStyle(el);
          const pola: Record<string, string> = {};
          for (let i = 0; i < s.length; i += 1) pola[s[i]] = s.getPropertyValue(s[i]);
          return pola;
        };
        const ust = znajdz("Ustawienia (")[0];
        const dot = znajdz("Dotychczasowy panel (")[0];
        if (!ust || !dot) return null;
        return {
          przycisk: [opisz(ust), opisz(dot)],
          nazwa: [opisz(ust.children[0]), opisz(dot.children[0])],
          znak: [opisz(ust.children[1]), opisz(dot.children[1])],
          znaki: [ust.children[1].textContent, dot.children[1].textContent],
          wysokosc: [ust.getBoundingClientRect().height, dot.getBoundingClientRect().height],
          klasy: [ust.className, dot.className],
          klasyNazwy: [ust.children[1].className, dot.children[1].className],
        };
      });
      expect(przyciski, "oba przyciski widoczne").not.toBeNull();
      const p = przyciski!;
      // Jedyny wyjątek: cztery pola wymiaru spanu z tekstem napisu (jego szerokość wynika z długości napisu,
      // „Ustawienia (4)” jest krótsze niż „Dotychczasowy panel (5)”, a nie ze stylu); przycisk i znak bez wyjątków.
      const ZALEZNE_OD_TRESCI = new Set(["width", "inline-size", "perspective-origin", "transform-origin"]);
      const rozne: string[] = [];
      const pominiete: string[] = [];
      for (const czesc of ["przycisk", "nazwa", "znak"] as const) {
        const [a, b] = p[czesc];
        for (const klucz of new Set([...Object.keys(a), ...Object.keys(b)])) {
          if (a[klucz] === b[klucz]) continue;
          if (czesc === "nazwa" && ZALEZNE_OD_TRESCI.has(klucz)) pominiete.push(klucz);
          else rozne.push(`${czesc}.${klucz}: ${a[klucz]} | ${b[klucz]}`);
        }
      }
      const liczbaPol = Object.keys(p.przycisk[0]).length + Object.keys(p.nazwa[0]).length + Object.keys(p.znak[0]).length;
      console.log(
        `POMIAR-USTAWIENIA-6 @${szerokosc} polaPorownane=${liczbaPol} polaRozne=${rozne.length} polaPominiete=${JSON.stringify(pominiete)} wysokosc=${JSON.stringify(p.wysokosc)} znaki=${JSON.stringify(p.znaki)} klasaPrzycisku=${p.klasy[0] === p.klasy[1]} klasaZnaku=${p.klasyNazwy[0] === p.klasyNazwy[1]}`,
      );
      expect(rozne, rozne.join("\n")).toEqual([]);
      expect(p.znaki[0]).toBe(p.znaki[1]);
      expect(p.wysokosc[0]).toBe(p.wysokosc[1]);
      expect(p.klasy[0], "ta sama klasa przycisku (jedna definicja)").toBe(p.klasy[1]);
    });
  }

  for (const szerokosc of [1280, 390] as const) {
    for (const adres of ["/admin", "/admin/formy-stazu"]) {
      test(`pomiar 8: axe ${adres} @${szerokosc} (menu otwarte przy 390): 0 naruszeń`, async ({ page }, testInfo) => {
        await wejdz(page, adres, szerokosc, szerokosc >= 1024 ? 900 : 844);
        if (szerokosc < 1024) await otworzOknoMenu(page);
        const naruszenia = await uruchomAxe(page);
        await dolaczNaruszeniaDoRaportu(testInfo, `axe-ustawienia-${szerokosc}`, naruszenia);
        console.log(`POMIAR-USTAWIENIA-8 axe ${adres} @${szerokosc} naruszenia=${naruszenia.length}`);
        expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`)).toEqual([]);
      });
    }
  }
});
