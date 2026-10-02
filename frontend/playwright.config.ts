import { defineConfig, devices } from "@playwright/test";
import { rozwiazCelPrzegladarki } from "./e2e/_cel";

/**
 * Szkielet testów przeglądarkowych: axe-core wymaga
 * prawdziwej przeglądarki, żeby zmierzyć kontrast — w jsdom (vitest) nie da
 * się tego zmierzyć w ogóle.
 *
 * Cel testów rozstrzyga `rozwiazCelPrzegladarki` (`e2e/_cel.ts`): wyłącznie
 * aplikacja na tej maszynie, bez domyślnego środowiska zdalnego.
 * `PW_WEB_SERVER=1` uruchamia zbudowaną aplikację lokalnie (`npm run start`)
 * na porcie `PW_PORT` i kieruje testy na `http://127.0.0.1:<PW_PORT>` — tak
 * w CI i przy każdym biegu ręcznym. `PW_BASE_URL` przyjmuje tylko adres
 * lokalny (używa go `e2e/logowanie/uruchom.sh`). Bez żadnej z tych zmiennych
 * konfiguracja kończy się błędem przed pierwszym testem. Proces główny
 * wypisuje rozwiązany adres na początku biegu, więc log każdego biegu
 * pokazuje, dokąd szły testy.
 */
const CEL = rozwiazCelPrzegladarki(process.env);
if (process.env.TEST_WORKER_INDEX === undefined) {
  console.log(`[cel testów przeglądarkowych] baseURL=${CEL.baseURL}`);
}

export default defineConfig({
  testDir: "./e2e",
  // 60 s, nie 30 s: `uruchomAxe` (`e2e/_axe.ts`) czeka na ustabilizowanie
  // strony przed skanem axe (patrz tam), a w CI (`PW_WEB_SERVER=1`) nie ma
  // żadnego backendu pod `NEXT_PUBLIC_API_URL` - zapytania aplikacji do
  // niego (np. `/sso/whoami` na `/konto`) kończą się niepowodzeniem, ale nie
  // natychmiast. Zmierzone na czystym drzewie: do ok. 9 s na trasę z takim
  // zapytaniem, w 10 pełnych biegach pod rząd. To NIE jest próba ukrycia
  // niestabilności retryami czy timeoutem dopasowanym pod jeden zły wynik -
  // to realny, powtarzalny czas nieudanego połączenia w tej topologii, z
  // zapasem, nie z docięciem pod najgorszy zmierzony przypadek.
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: CEL.baseURL,
    trace: "off",
  },
  webServer: CEL.lokalnySerwer
    ? {
        command: `npm run start -- -p ${CEL.port}`,
        url: CEL.baseURL,
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
