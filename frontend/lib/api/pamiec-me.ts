/**
 * Krótka pamięć odpowiedzi `GET /me` w kliencie API.
 *
 * Po co: strażnik roli (`components/permissions/RequireRole.tsx`) renderuje
 * dzieci dopiero po własnej odpowiedzi `/me`, a potem powłoka i ekran pytają
 * o to samo konto jeszcze raz — pełne załadowanie strony nowej ramki robiło
 * dwa żądania sieciowe o tę samą rzecz. Pamięć stoi w transporcie
 * (`request()` w `./klient`), poniżej strażnika i ponad ramką i ekranami,
 * więc każdy, kto woła `api("/me")`, dostaje wspólne żądanie, a żaden
 * wywołujący nie musi o niczym wiedzieć.
 *
 * Reguły (każda ma własny test w `./__tests__/pamiec-me.test.ts`):
 * 1. Klucz to bieżący token: inny token (inne konto, odświeżona sesja) to
 *    nowe żądanie, nigdy cudza odpowiedź.
 * 2. Żądanie w locie jest wspólne: równoległe odczyty czekają na jedno.
 * 3. Gotowa odpowiedź żyje krótko — {@link OKNO_PAMIECI_ME_MS} od jej
 *    nadejścia — i nie jest odnawiana przy odczycie.
 * 4. Każde żądanie `/me` inne niż `GET` (np. `PATCH /me`) i zakończenie
 *    sesji czyszczą pamięć; odpowiedź zapytania, które wystartowało PRZED
 *    czyszczeniem, nie wraca do pamięci.
 * 5. Błąd i 401 nie są pamiętane (401 dodatkowo czyści pamięć w `request()`).
 * 6. Każdy wywołujący dostaje własną kopię danych — zmiana jednej nie psuje
 *    pozostałych ani pamięci.
 *
 * Moduł jest samodzielny (nie importuje `./klient`), żeby testy mogły go
 * zerować w `__tests__/setup.ts`, niezależnie od atrap klienta.
 */

/**
 * Okno ważności gotowej odpowiedzi: 5 s. Z zapasem pokrywa jedno pełne
 * załadowanie strony ramki (strażnik → powłoka → ekran odpytują `/me` jedno po
 * drugim, w ciągu setek milisekund do pojedynczych sekund na wolnym łączu)
 * i przejście między trasami ramki zaraz po nim, a jest o rząd wielkości
 * krótsze niż czas, w którym ktoś zdąży zmienić rolę lub dane tego konta
 * poza tą kartą. Limit z pisma to 10 s; 5 s zostawia margines.
 */
export const OKNO_PAMIECI_ME_MS = 5_000;

interface Wpis {
  token: string | null;
  obietnica: Promise<unknown>;
  /** `true` dopiero po udanej odpowiedzi; do tego czasu wpis jest „w locie". */
  gotowa: boolean;
  /** Chwila nadejścia odpowiedzi (`Date.now()`); sensowna tylko przy `gotowa`. */
  nadeszla: number;
}

let wpis: Wpis | null = null;

/** Czyści pamięć: dotychczasowy wpis (także ten w locie) przestaje być oddawany. */
export function wyczyscPamiecMe(): void {
  wpis = null;
}

/** Czy ścieżka należy do rodziny `/me` (`/me`, `/me?…`, `/me/…`). */
export function czySciezkaMe(sciezka: string): boolean {
  return sciezka === "/me" || sciezka.startsWith("/me?") || sciezka.startsWith("/me/");
}

/** Czy to dokładnie odczyt konta (`GET /me`, ewentualnie z zapytaniem). */
export function czyOdczytKonta(sciezka: string, metoda: string): boolean {
  return metoda === "GET" && (sciezka === "/me" || sciezka.startsWith("/me?"));
}

function kopia<T>(wartosc: T): T {
  if (wartosc === undefined || wartosc === null || typeof wartosc !== "object") return wartosc;
  // Odpowiedź przyszła z JSON-a, więc obieg przez JSON jest bezstratny.
  return JSON.parse(JSON.stringify(wartosc)) as T;
}

/**
 * Oddaje odpowiedź `GET /me` dla `token`: z pamięci (w locie albo gotową w
 * oknie), a w przeciwnym razie przez `pobierz`, i zapamiętuje wynik.
 * Wywołujący zawsze dostaje własną kopię.
 */
export async function odczytajMe(
  token: string | null,
  pobierz: () => Promise<unknown>,
): Promise<unknown> {
  if (
    wpis &&
    wpis.token === token &&
    (!wpis.gotowa || Date.now() - wpis.nadeszla < OKNO_PAMIECI_ME_MS)
  ) {
    return kopia(await wpis.obietnica);
  }

  const obietnica = pobierz();
  const nowy: Wpis = { token, obietnica, gotowa: false, nadeszla: 0 };
  wpis = nowy;
  obietnica.then(
    () => {
      // Tylko wpis, który nadal jest bieżący: czyszczenie albo nowsze żądanie
      // (inny token) w międzyczasie unieważnia tę odpowiedź.
      if (wpis === nowy) {
        nowy.gotowa = true;
        nowy.nadeszla = Date.now();
      }
    },
    () => {
      if (wpis === nowy) wpis = null;
    },
  );
  return kopia(await obietnica);
}
