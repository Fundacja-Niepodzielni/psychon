import { test, expect } from "@playwright/test";
import { zaloguj, type RolaPsychon } from "../_logowanie";

/**
 * Punkt wejscia proby logowania e2e: piec nog, po jednej na kazda role z
 * `backend/config/keycloak.php`, kazda przez PRAWDZIWY tor tokenu
 * (przegladarka -> ekran logowania IdP efemerycznego -> front Next.js ->
 * zaplecze Laravel przez `TokenValidator`), plus szosty test - dowod, ze
 * rola widziana przez zaplecze pochodzi z tokenu, nie z kolumny
 * `users.role`.
 *
 * Uruchamiany WYLACZNIE przez `uruchom.sh` (patrz ten plik), ktory stawia
 * caly stos (IdP + baza + zaplecze + front) na portach >= 56000 i eksportuje
 * zmienne, ktorych ten plik potrzebuje:
 *   - `PSYCHON_E2E_HASLO`            - haslo syntetyczne wygenerowane w biegu
 *                                      (patrz `_logowanie.ts`/`uruchom-idp.sh`),
 *   - `PSYCHON_E2E_BACKEND_URL`      - adres zaplecza tego biegu (np.
 *                                      `http://localhost:57301`), do
 *                                      testu-swiadka (wywolanie backendu
 *                                      wprost tokenem, z pominieciem
 *                                      klienta `lib/api.ts`),
 * `baseURL` (front) idzie przez `PW_BASE_URL` (patrz `playwright.config.ts`
 * i `e2e/_cel.ts`) - `uruchom.sh` ustawia go na wlasny, efemeryczny adres
 * frontu na `localhost`. Konfiguracja nie ma celu domyslnego i odrzuca kazdy
 * adres spoza `127.0.0.1`/`localhost` - logowanie do prawdziwego panelu jest
 * zakazem stalym.
 *
 * IdP efemeryczny niesie WLASNY certyfikat TLS (Caddy/Keycloak self-signed,
 * `uruchom-idp.sh`) - kazdy kontekst przegladarki w tym pliku ma
 * `ignoreHTTPSErrors: true` (patrz `test.use` nizej), inaczej samo
 * przekierowanie na ekran logowania IdP by padlo w przegladarce.
 */

test.use({ ignoreHTTPSErrors: true });

/**
 * Dom po zalogowaniu wedlug roli (kontrakt SS3.4 / `lib/home-by-role.ts`) -
 * ten sam slownik, zduplikowany tu SWIADOMIE (nie import z frontu): ten plik
 * ma sprawdzic, dokad front NAPRAWDE przekierowuje po prawdziwym logowaniu,
 * a nie potwierdzic, ze kod frontu zgadza sie sam ze soba.
 */
// UWAGA: `expect(page).toHaveURL(regexp)` sprawdza CALY URL (z origin), nie
// sama sciezke - kotwica `^` przed `\/admin` nigdy by nie pasowala do
// "http://localhost:PORT/admin" (zmierzone bezposrednio: piec nog konczylo
// sie "failed" mimo ze `Received string` w kazdym z nich pokazywal poprawne
// przekierowanie). Bez kotwicy `^`, z wymogiem "/" albo konca zaraz po
// nazwie segmentu, zeby "/administracja" nie fałszywie pasowalo do wzorca
// "/admin".
const DOM_PO_ROLI: Record<RolaPsychon, RegExp> = {
  super_admin: /\/admin(\/|$)/,
  project_manager: /\/admin(\/|$)/,
  instructor: /\/prowadzacy(\/|$)/,
  volunteer: /\/panel\/start(\/|$)/,
  student: /\/panel\/start(\/|$)/,
};

const WSZYSTKIE_ROLE = Object.keys(DOM_PO_ROLI) as RolaPsychon[];

for (const rola of WSZYSTKIE_ROLE) {
  test(`zaloguj(page, "${rola}") - prawdziwy tor tokenu laduje na ekranie wlasciwym tej roli`, async ({
    page,
  }) => {
    await zaloguj(page, rola);
    await expect(page).toHaveURL(DOM_PO_ROLI[rola], { timeout: 15_000 });
  });
}

/**
 * Konto `marta@demo.pl` (`users.role = volunteer` w bazie tego biegu -
 * patrz `uruchom.sh`, krok wiazania) loguje sie jako
 * `e2e-koordynator` (token niesie role realmu `koordynator` ->
 * `project_manager` wg `config/keycloak.php`). `GET /admin/reliability`
 * (kontrakt H07) jest dostepne WYLACZNIE dla `project_manager`/`super_admin`
 * - 200 tutaj, mimo DB=volunteer, jest dowodem, ze zaplecze autoryzuje wedlug
 * roli z TOKENU (`TokenRoles::current()`), nigdy wedlug kolumny `users.role`.
 * Token brany wprost z sesji frontu (Auth.js `session.accessToken`,
 * `auth.ts` `session()`), NIE osobnym, rownoleglym logowaniem poza
 * przegladarka - ta sama sesja, ktora front uzylby do wlasnych wywolan
 * `lib/api.ts`.
 */
test("rola z tokenu (project_manager) autoryzuje route admina mimo innej roli w bazie (volunteer)", async ({
  page,
}) => {
  const backendUrl = process.env.PSYCHON_E2E_BACKEND_URL;
  if (!backendUrl) {
    throw new Error(
      "PSYCHON_E2E_BACKEND_URL nie jest ustawione - ten test wymaga adresu zaplecza z uruchom.sh.",
    );
  }

  await zaloguj(page, "project_manager");

  const sesja = (await page.evaluate(() =>
    fetch("/api/auth/session").then((r) => r.json()),
  )) as { accessToken?: string | null; user?: { roles?: string[] } };

  const rolaRealmu = sesja.user?.roles ?? [];
  expect(rolaRealmu).toContain("koordynator");

  const accessToken = sesja.accessToken;
  if (!accessToken) {
    throw new Error("Brak accessToken w sesji frontu po zalogowaniu - zaloguj() sie nie powiodlo do konca.");
  }

  const odpowiedz = await page.request.get(`${backendUrl}/api/v1/admin/reliability`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  expect(odpowiedz.status()).toBe(200);
});
