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
 */
const TRASY_PUBLICZNE = [
  "/deklaracja-dostepnosci",
  "/dostep-wygasl",
  "/weryfikacja",
  "/aktywacja",
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

      asercjaBrakPowaznychNaruszen(naruszenia);
    });

    // Osobny test: TYLKO rejestruje liczbę naruszeń `color-contrast` na
    // trasę — to pierwszy realny pomiar kontrastu w przeglądarce (F-240),
    // decyzję co dalej podejmuje lider/właściciel, nie ten test. Dlatego
    // nigdy nie failuje na samym kontraście.
    test(`${trasa} — pomiar naruszeń color-contrast (nie failuje)`, async ({
      page,
    }, testInfo) => {
      await page.goto(trasa);
      await zabezpieczeniePrzedEkranemDostepu(page);

      const naruszenia = await uruchomAxe(page);
      const kontrast = naruszenia.filter((n) => n.id === "color-contrast");
      const liczbaWezlow = kontrast.reduce((suma, n) => suma + n.liczbaWezlow, 0);

      await testInfo.attach(`${trasa} color-contrast`, {
        body: JSON.stringify(kontrast, null, 2),
        contentType: "application/json",
      });
      await testInfo.attach(`${trasa} color-contrast liczba wezlow`, {
        body: String(liczbaWezlow),
        contentType: "text/plain",
      });

      // Pomiar, nie asercja — celowo brak expect() na wyniku kontrastu.
    });
  });
}

/**
 * Kontrola negatywna (D-22): dowód, że test faktycznie wykrywa naruszenie,
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
