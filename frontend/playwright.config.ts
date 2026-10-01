import { defineConfig, devices } from "@playwright/test";

/**
 * Szkielet testów przeglądarkowych: axe-core wymaga
 * prawdziwej przeglądarki, żeby zmierzyć kontrast — w jsdom (vitest) nie da
 * się tego zmierzyć w ogóle. Domyślny cel to dev, ale `PW_BASE_URL` pozwala
 * odpalić to samo przeciwko innemu środowisku bez zmiany kodu.
 *
 * `PW_WEB_SERVER=1` uruchamia zbudowaną aplikację lokalnie (`npm run start`)
 * na porcie `PW_PORT` i kieruje testy na nią — używane w CI, gdzie nie ma
 * żadnego stanowiska z aplikacją już postawioną. Bez tej zmiennej zachowanie
 * jest jak wcześniej: `PW_BASE_URL` albo domyślne stanowisko dev.
 */
const PORT = process.env.PW_PORT ?? "3100";
const LOKALNY_ADRES = `http://127.0.0.1:${PORT}`;
const UZYJ_LOKALNEGO_SERWERA = process.env.PW_WEB_SERVER === "1";

export default defineConfig({
  testDir: "./e2e",
  // 60 s, nie 30 s: `uruchomAxe` (`e2e/_axe.ts`) czeka na ustabilizowanie
  // strony przed skanem axe (patrz tam), a w CI (`PW_WEB_SERVER=1`) nie ma
  // żadnego backendu pod `NEXT_PUBLIC_API_URL` - zapytania aplikacji do
  // niego (np. `/sso/whoami` na `/konto`) kończą się niepowodzeniem, ale nie
  // natychmiast. Zakładamy do ok. 9 s na trasę z takim zapytaniem - tyle
  // podaje autor zmiany 45a8102 (10 pełnych biegów pod rząd); w drzewie nie
  // ma zapisu polecenia, przeglądarki, rozmiaru okna ani daty tych biegów.
  // Limit jest ustawiony na 60 s z zapasem ponad tę wartość, a nie
  // dopasowany pod jeden zły wynik; retry są wyłączone (`retries: 0`).
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: UZYJ_LOKALNEGO_SERWERA
      ? LOKALNY_ADRES
      : (process.env.PW_BASE_URL ?? "https://psychon-dev.niepodzielni.com"),
    trace: "off",
  },
  webServer: UZYJ_LOKALNEGO_SERWERA
    ? {
        command: `npm run start -- -p ${PORT}`,
        url: LOKALNY_ADRES,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Sciezka wzgledna: dziala tak samo na stanowisku deweloperskim jak i na
  // runnerze CI (ubuntu-latest) - bezwzgledna sciezka windowsowa tu wczesniej
  // nie istniala nigdzie poza jednym stanowiskiem lokalnym i psula zapis
  // (kod wyjscia 2 mimo zielonych testow - tak opisuje to 9a96281; zapisu
  // tego biegu w drzewie nie ma).
  // `/test-results` jest juz w `.gitignore`.
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/pw-report.json" }],
  ],
});
