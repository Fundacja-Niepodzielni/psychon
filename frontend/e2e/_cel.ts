/**
 * Cel testów przeglądarkowych: wyłącznie aplikacja uruchomiona na tej maszynie.
 *
 * Nie ma domyślnego środowiska zdalnego. Bez `PW_WEB_SERVER=1` i bez
 * `PW_BASE_URL` konfiguracja odmawia startu, zanim uruchomi się pierwszy test.
 * `PW_BASE_URL` przyjmuje wyłącznie `http://127.0.0.1:<port>` albo
 * `http://localhost:<port>` — tak ustawia go `e2e/logowanie/uruchom.sh` dla
 * frontu postawionego w tym samym biegu. Każdy inny adres, także stanowisko
 * deweloperskie fundacji, kończy się błędem: testy wypełniają formularze
 * i klikają przyciski, więc skierowane na wspólne środowisko działałyby na nim
 * naprawdę.
 */
export const DOZWOLONE_HOSTY: readonly string[] = ["127.0.0.1", "localhost"];

export type ZmienneCelu = {
  PW_WEB_SERVER?: string;
  PW_BASE_URL?: string;
  PW_PORT?: string;
};

export type CelPrzegladarki = {
  baseURL: string;
  lokalnySerwer: boolean;
  port: string;
};

const PODPOWIEDZ =
  "Ustaw PW_WEB_SERVER=1 (aplikacja uruchomiona lokalnie na http://127.0.0.1:<PW_PORT>).";

function sprawdzAdres(adres: string): void {
  let url: URL;
  try {
    url = new URL(adres);
  } catch {
    throw new Error(`PW_BASE_URL nie jest poprawnym adresem. ${PODPOWIEDZ}`);
  }
  const tylkoPoczatek = url.pathname === "/" && url.search === "" && url.hash === "";
  const bezDanychLogowania = url.username === "" && url.password === "";
  if (
    url.protocol !== "http:" ||
    !DOZWOLONE_HOSTY.includes(url.hostname) ||
    !tylkoPoczatek ||
    !bezDanychLogowania
  ) {
    throw new Error(
      `PW_BASE_URL spoza listy dozwolonych (http://127.0.0.1:<port>, http://localhost:<port>): ${url.origin}. ${PODPOWIEDZ}`,
    );
  }
}

export function rozwiazCelPrzegladarki(env: ZmienneCelu): CelPrzegladarki {
  const port = env.PW_PORT ?? "3100";
  if (!/^[0-9]{1,5}$/.test(port)) {
    throw new Error(`PW_PORT musi być liczbą (1–5 cyfr). ${PODPOWIEDZ}`);
  }
  const lokalnySerwer = env.PW_WEB_SERVER === "1";
  const zadany = env.PW_BASE_URL ?? "";
  if (zadany !== "") {
    sprawdzAdres(zadany);
  }
  if (lokalnySerwer) {
    return { baseURL: `http://127.0.0.1:${port}`, lokalnySerwer, port };
  }
  if (zadany === "") {
    throw new Error(`Brak celu testów przeglądarkowych. ${PODPOWIEDZ}`);
  }
  return { baseURL: zadany, lokalnySerwer, port };
}
