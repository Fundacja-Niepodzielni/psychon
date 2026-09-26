import { expect, test } from "@playwright/test";
import {
  asercjaBrakPowaznychNaruszen,
  dolaczNaruszeniaDoRaportu,
  uruchomAxe,
} from "./_axe";
import { zabezpieczeniePrzedEkranemDostepu } from "./_access-guard";

/**
 * Trasy publiczne PsychON (bez sesji, bez panelu) — wybrane z `app/` po
 * odrzuceniu grup `(panel)`/`(administracja)`/`(prowadzacy)`/`(uczestnik)`.
 *
 * CELOWO pominięte `/` i `/logowanie`: obie w tej gałęzi automatycznie
 * przekierowują (kod JS, `signIn("keycloak", …)`) na zewnętrzną domenę
 * Keycloak w ciągu sekund, bez żadnego kliknięcia — to NIE jest ekran
 * PsychON i nie wolno tam próbować logowania (nawet bez wpisywania hasła,
 * to poza zakresem tego zlecenia). Ta decyzja i uzasadnienie: patrz plik
 * pomiaru.
 *
 * CELOWO pominięte też `/logowanie/konta`: ta trasa istnieje wyłącznie po
 * to, żeby przekierować (`router.replace`, `app/logowanie/konta/page.tsx`)
 * do `/logowanie` przy montowaniu — ten sam powód co `/logowanie` wyżej.
 *
 * DOPISANE (pomiar świeży): `/certyfikat`, `/konto`,
 * `/dokumenty-prawne/regulamin` i `/logowanie/niepowiazane` — cztery trasy
 * bez grupy panelu, których wcześniej nie mierzono. Żadna z nich
 * nie przekierowuje przy montowaniu (w kodzie każdej `router.push`/`.replace`
 * siedzi wyłącznie w handlerze zdarzenia — wylogowanie, ponowienie — nie w
 * efekcie montowania), sprawdzone pomiarem w przeglądarce lokalnego `next
 * dev` bez sesji, tak jak reszta listy niżej.
 */
const TRASY_PUBLICZNE = [
  "/deklaracja-dostepnosci",
  "/dostep-wygasl",
  "/weryfikacja",
  "/aktywacja",
  "/certyfikat",
  "/konto",
  "/dokumenty-prawne/regulamin",
  "/logowanie/niepowiazane",
];

for (const trasa of TRASY_PUBLICZNE) {
  test.describe(`trasa publiczna ${trasa}`, () => {
    test(`${trasa} — struktura nagłówków i naruszenia axe (bez color-contrast)`, async ({
      page,
    }, testInfo) => {
      await page.goto(trasa);
      await zabezpieczeniePrzedEkranemDostepu(page);

      const naglowkiH1 = page.locator("h1");
      const liczbaH1 = await naglowkiH1.count();
      // Zapisujemy liczbę h1 w raporcie niezależnie od wyniku — to sam
      // pomiar, nie tylko warunek przejścia/niepowodzenia.
      await testInfo.attach(`${trasa} liczba h1`, {
        body: String(liczbaH1),
        contentType: "text/plain",
      });
      expect(liczbaH1, `${trasa}: dokładnie jeden <h1>`).toBe(1);

      const naruszenia = await uruchomAxe(page);
      await dolaczNaruszeniaDoRaportu(testInfo, `${trasa} naruszenia axe`, naruszenia);

      // Nazwa testu mówi "bez color-contrast" — do 2026-09-26 to było
      // nieprawdą: `asercjaBrakPowaznychNaruszen` nie filtrowała po `id`,
      // więc ten test PADAŁ też na `color-contrast` (impact "serious"),
      // zmierzone perturbacją. `color-contrast` ma OSOBNY test niżej, z
      // liczbą naruszeń i listą selektorów w komunikacie — dokładniejszym
      // niż to, co dałoby się dopisać tutaj. Stąd świadome wykluczenie: ten
      // test ocenia WSZYSTKO OPRÓCZ kontrastu, kontrast ocenia wyłącznie
      // test niżej. Dwa testy padające na tym samym naruszeniu nie dodają
      // informacji, tylko szum.
      const bezKontrastu = naruszenia.filter((n) => n.id !== "color-contrast");
      asercjaBrakPowaznychNaruszen(bezKontrastu);
    });

    // Realny pomiar kontrastu w prawdziwej przeglądarce (axe-core przez
    // Playwright — w jsdom `color-contrast` zawsze kończy na "incomplete",
    // patrz `components/__tests__/axe-helper.ts`). Test PADA, gdy axe
    // zgłosi choć jeden węzeł z naruszeniem `color-contrast` — z liczbą
    // naruszeń i listą selektorów w komunikacie błędu.
    test(`${trasa} — brak naruszeń color-contrast`, async ({
      page,
    }, testInfo) => {
      await page.goto(trasa);
      await zabezpieczeniePrzedEkranemDostepu(page);

      const naruszenia = await uruchomAxe(page);
      const kontrast = naruszenia.filter((n) => n.id === "color-contrast");
      const liczbaWezlow = kontrast.reduce((suma, n) => suma + n.liczbaWezlow, 0);
      const selektory = kontrast.flatMap((n) => n.selektory);

      await testInfo.attach(`${trasa} color-contrast`, {
        body: JSON.stringify(kontrast, null, 2),
        contentType: "application/json",
      });
      await testInfo.attach(`${trasa} color-contrast liczba wezlow`, {
        body: String(liczbaWezlow),
        contentType: "text/plain",
      });

      expect(
        liczbaWezlow,
        `${trasa}: ${liczbaWezlow} naruszeń color-contrast na selektorach: ` +
          (selektory.length > 0 ? selektory.join(", ") : "(brak)"),
      ).toBe(0);
    });
  });
}

/**
 * Kontrola negatywna: dowód, że test faktycznie wykrywa naruszenie,
 * gdy jest wstrzyknięte celowo — bez tego zielony wynik powyżej mógłby
 * znaczyć "axe się nie uruchomił" zamiast "strona jest OK".
 *
 * Domyślnie pominięty (test.skip) — odpalany świadomie przez
 * `PW_NEGATYWNA=1 npx playwright test`.
 */
test(
  "@negatywna kontrola: axe wykrywa brak alt na wstrzykniętym obrazku",
  async ({ page }, testInfo) => {
    test.skip(process.env.PW_NEGATYWNA !== "1", "Uruchamiane tylko z PW_NEGATYWNA=1");

    await page.goto("/deklaracja-dostepnosci");
    await zabezpieczeniePrzedEkranemDostepu(page);

    await page.evaluate(() => {
      const img = document.createElement("img");
      img.src = "x";
      document.body.appendChild(img);
    });

    const naruszenia = await uruchomAxe(page);
    await dolaczNaruszeniaDoRaportu(testInfo, "kontrola negatywna naruszenia axe", naruszenia);

    const maImageAlt = naruszenia.some((n) => n.id === "image-alt");
    expect(maImageAlt, "axe powinien zgłosić image-alt dla obrazka bez alt").toBe(true);
  },
);

/**
 * Kontrola negatywna DLA KONTRASTU: dowód, że pomiar
 * `color-contrast` w tym pliku faktycznie wykrywa naruszenie, gdy jest
 * wstrzyknięte celowo — bez tego 0 węzłów na trasę wyżej mogłoby znaczyć
 * "reguła się nie liczy" zamiast "trasa jest OK". `jsdom` (świadek
 * `components/__tests__/axe-helper.ts`) nie umie tego wykryć w ogóle —
 * `getBoundingClientRect` zwraca tam same zera i axe kończy na
 * "incomplete", nigdy na "violation" (zmierzone przy włączaniu reguły) —
 * dlatego ten dowód stoi w przeglądarce, jedynym miejscu, gdzie
 * `color-contrast` w ogóle może się rozstrzygnąć.
 *
 * Domyślnie pominięty (test.skip) — odpalany świadomie przez
 * `PW_NEGATYWNA=1 npx playwright test`.
 */
test(
  "@negatywna kontrola: axe wykrywa zły kontrast na wstrzykniętym tekście",
  async ({ page }, testInfo) => {
    test.skip(process.env.PW_NEGATYWNA !== "1", "Uruchamiane tylko z PW_NEGATYWNA=1");

    await page.goto("/deklaracja-dostepnosci");
    await zabezpieczeniePrzedEkranemDostepu(page);

    const przed = await uruchomAxe(page);
    const kontrastPrzed = przed.filter((n) => n.id === "color-contrast").length;

    await page.evaluate(() => {
      const zly = document.createElement("p");
      zly.id = "kontrola-negatywna-kontrast";
      zly.textContent = "tekst o niewystarczającym kontraście, wstrzyknięty przez kontrolę negatywną";
      zly.style.color = "#f0f0f0";
      zly.style.backgroundColor = "#ffffff";
      zly.style.fontSize = "16px";
      document.body.appendChild(zly);
    });

    const po = await uruchomAxe(page);
    await dolaczNaruszeniaDoRaportu(testInfo, "kontrola negatywna naruszenia axe (kontrast)", po);
    const kontrastPo = po.filter((n) => n.id === "color-contrast").length;

    await testInfo.attach("kontrola negatywna color-contrast: przed/po", {
      body: `przed=${kontrastPrzed} po=${kontrastPo}`,
      contentType: "text/plain",
    });

    expect(kontrastPrzed, "przed wstrzyknięciem: 0 naruszeń color-contrast").toBe(0);
    expect(kontrastPo, "po wstrzyknięciu: axe powinien zgłosić color-contrast").toBeGreaterThan(0);
  },
);
