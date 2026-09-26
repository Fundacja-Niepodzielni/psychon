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
  timeout: 30_000,
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
  // (kod wyjscia 2 mimo zielonych testow, zmierzone przy wpiecu do CI).
  // `/test-results` jest juz w `.gitignore`.
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/pw-report.json" }],
  ],
});
