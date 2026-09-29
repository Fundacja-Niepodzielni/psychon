import type { Page } from "@playwright/test";

/**
 * Pomocnik logowania wielokrotnego uzytku przez PRAWDZIWY tor tokenu
 * (przegladarka -> ekran logowania IdP -> front -> zaplecze), NIE przez
 * `actingAs`/mock. Ma posluzyc takze pozniejszym e2e ekranow administracji -
 * stad dziala dla KAZDEJ z pieciu ról z
 * `backend/config/keycloak.php`, minimum sprawdzone na `project_manager` i
 * `super_admin` (patrz `logowanie-role.spec.ts`).
 *
 * Zaklada, ze na `page.context()`/procesie testu jest juz uruchomiony
 * dostawca tozsamosci EFEMERYCZNY (`frontend/e2e/logowanie/uruchom-idp.sh`)
 * z tym samym realmem (`realm-fixture.template.json`) i ze zmienne
 * `PSYCHON_E2E_USERNAME_<ROLA>` / `PSYCHON_E2E_HASLO` sa ustawione w
 * srodowisku uruchomienia Playwrighta (patrz `logowanie/README.md` i
 * `logowanie/uruchom.sh`) - ten plik NIE zna szczegolow dostawcy, tylko
 * ROLE i to, ze ekran logowania jest zawsze po polsku (kontrakt SS1:
 * `supportedLocales: ["pl"]`).
 */

export type RolaPsychon =
  | "super_admin"
  | "project_manager"
  | "instructor"
  | "volunteer"
  | "student";

/**
 * Nazwa uzytkownika testowego dla kazdej roli - zgodna z
 * `logowanie/realm-fixture.template.json` (`e2e-<rola-realmu>`). Zmienna
 * srodowiskowa `PSYCHON_E2E_USERNAME_<ROLA W WIELKICH LITERACH>` pozwala
 * podmienic to bez zmiany kodu (np. na inny realm w przyszlosci), domyslna
 * wartosc to wlasnie ten fixture.
 */
const DOMYSLNA_NAZWA_UZYTKOWNIKA: Record<RolaPsychon, string> = {
  super_admin: "e2e-admin-fundacja",
  project_manager: "e2e-koordynator",
  instructor: "e2e-prowadzacy",
  volunteer: "e2e-wolontariusz",
  student: "e2e-pacjent",
};

function nazwaUzytkownika(rola: RolaPsychon): string {
  const zmienna = `PSYCHON_E2E_USERNAME_${rola.toUpperCase()}`;
  return process.env[zmienna] ?? DOMYSLNA_NAZWA_UZYTKOWNIKA[rola];
}

function haslo(): string {
  const wartosc = process.env.PSYCHON_E2E_HASLO;
  if (!wartosc) {
    throw new Error(
      "PSYCHON_E2E_HASLO nie jest ustawione - zaloguj() potrzebuje hasla wygenerowanego przez " +
        "logowanie/uruchom-idp.sh (patrz logowanie/README.md). Nie ma tu wartosci domyslnej: " +
        "haslo jest generowane W BIEGU, nigdy wpisane na sztywno w kodzie.",
    );
  }
  return wartosc;
}

/**
 * Loguje `page` jako uzytkownika testowego danej roli, PRZEZ PRAWDZIWY
 * ekran logowania Keycloak (nie `page.request`, nie wstrzykniete ciasteczko):
 *
 *   1. wejscie na `/logowanie` (prawdziwa strona aplikacji, `app/logowanie/page.tsx`,
 *      ktora sama wywoluje `signIn("keycloak", …)` bez klikniecia),
 *   2. wypelnienie prawdziwego formularza logowania IdP (login-pf, jezyk
 *      polski - kontrakt SS1),
 *   3. powrot przez callback Auth.js i wyladowanie na stronie wg roli
 *      (`homeForRole`, `lib/home-by-role.ts`) - to jest dowod, ze rola
 *      widziana przez front/zaplecze pochodzi z tokenu wydanego PRZEZ IdP
 *      dla TEJ roli, a nie z bazy (kryterium 2).
 *
 * Rzuca, jesli po przeslaniu formularza przegladarka nie opuscila ekranu
 * logowania w rozsadnym czasie - zamiast cicho zostawiac test na zlej
 * stronie z niejasnym pozniejszym bledem.
 */
export async function zaloguj(page: Page, rola: RolaPsychon): Promise<void> {
  const username = nazwaUzytkownika(rola);
  const password = haslo();

  await page.goto("/logowanie");

  // Ekran `/logowanie` sam wywoluje `signIn("keycloak", …)` bez klikniecia
  // (patrz `app/logowanie/page.tsx`) - czekamy na faktyczne przekierowanie
  // do IdP, nie na konkretny selektor na tej przejsciowej stronie.
  await page.waitForURL(/\/realms\/[^/]+\/protocol\/openid-connect\/auth/, {
    timeout: 15_000,
  });

  // Formularz login-pf (motyw domyslny Keycloak, jezyk polski wymuszony
  // kontraktem SS1): identyfikatory `#username`/`#password`/`#kc-login` sa
  // stabilniejsze niz etykiety tlumaczone, ale probujemy najpierw po
  // etykiecie - gdyby motyw kiedys sie zmienil, blad bedzie czytelniejszy.
  const polePlUzytkownik = page.getByLabel(/nazwa użytkownika|adres e-mail|email/i).first();
  if (await polePlUzytkownik.count()) {
    await polePlUzytkownik.fill(username);
  } else {
    await page.locator("#username").fill(username);
  }

  const polePlHaslo = page.getByLabel(/hasło/i).first();
  if (await polePlHaslo.count()) {
    await polePlHaslo.fill(password);
  } else {
    await page.locator("#password").fill(password);
  }

  const przyciskZaloguj = page.getByRole("button", { name: /zaloguj się/i }).first();
  if (await przyciskZaloguj.count()) {
    await przyciskZaloguj.click();
  } else {
    await page.locator("#kc-login").click();
  }

  // Powrot na front: Auth.js przekierowuje przez `/api/auth/callback/keycloak`,
  // a ekran `/logowanie` sam wysyla dalej wg roli (`homeForRole`). Czekamy,
  // az przegladarka OPUSCI zarowno IdP, jak i sam ekran logowania - obie
  // czesci sa warunkiem koniecznym udanego zalogowania, zaden sam w sobie
  // nie wystarcza (zostanie na `/logowanie` po bledzie tez "opuszcza" IdP).
  await page.waitForURL((url) => !url.pathname.startsWith("/realms/"), { timeout: 15_000 });
  await page.waitForURL((url) => url.pathname !== "/logowanie", { timeout: 15_000 });
}
